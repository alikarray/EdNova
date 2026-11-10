"""Tiny persistence layer (SQLite) for the demo.

Privacy by design: learners are anonymous. The browser generates a random learner_id; no
name, e-mail, photo or voice is ever collected or stored. The same functions can be pointed
at PostgreSQL later (same tables) without touching the rest of the app.
"""
import json
import sqlite3
import threading
import time
import uuid

import config

_lock = threading.RLock()
_conn = None


def init(path: str | None = None):
    """(Re)open the database. Tests pass ':memory:'."""
    global _conn
    with _lock:
        if _conn is not None:
            _conn.close()
        _conn = sqlite3.connect(path or config.DB_PATH, check_same_thread=False)
        _conn.row_factory = sqlite3.Row
        _conn.executescript("""
        CREATE TABLE IF NOT EXISTS profile(learner_id TEXT PRIMARY KEY, data TEXT NOT NULL, updated REAL);
        CREATE TABLE IF NOT EXISTS documents(id TEXT PRIMARY KEY, learner_id TEXT, name TEXT, text TEXT, created REAL);
        CREATE TABLE IF NOT EXISTS folders(id TEXT PRIMARY KEY, learner_id TEXT, name TEXT, created REAL);
        CREATE TABLE IF NOT EXISTS chunks(doc_id TEXT, idx INTEGER, text TEXT, PRIMARY KEY(doc_id, idx));
        CREATE TABLE IF NOT EXISTS analyses(doc_id TEXT, kind TEXT, variant TEXT, data TEXT, created REAL,
                                            PRIMARY KEY(doc_id, kind, variant));
        CREATE TABLE IF NOT EXISTS progress(id INTEGER PRIMARY KEY AUTOINCREMENT, learner_id TEXT, ts REAL,
                                            kind TEXT, topic TEXT, score INTEGER, total INTEGER);
        CREATE TABLE IF NOT EXISTS arenas(code TEXT PRIMARY KEY, topic TEXT, lang TEXT, questions TEXT,
                                          owner TEXT, created REAL);
        CREATE TABLE IF NOT EXISTS arena_players(code TEXT, learner_id TEXT, nickname TEXT,
                                                 score INTEGER DEFAULT 0, answered TEXT DEFAULT '{}', joined REAL,
                                                 PRIMARY KEY(code, learner_id));
        """)
        for col, ddl in (("folder_id", "TEXT"), ("kind", "TEXT DEFAULT 'lecture'")):
            try:  # databases created before folders existed
                _conn.execute(f"ALTER TABLE documents ADD COLUMN {col} {ddl}")
            except sqlite3.OperationalError:
                pass
        _conn.commit()


def _c():
    if _conn is None:
        init()
    return _conn


# ---- profile ----
def get_profile(lid: str) -> dict:
    with _lock:
        row = _c().execute("SELECT data FROM profile WHERE learner_id=?", (lid,)).fetchone()
    return json.loads(row["data"]) if row else {}


def save_profile(lid: str, data: dict):
    with _lock:
        _c().execute("INSERT OR REPLACE INTO profile VALUES(?,?,?)", (lid, json.dumps(data), time.time()))
        _c().commit()


# ---- documents ----
KINDS = ("lecture", "problems", "other")


def add_document(lid: str, name: str, text: str, chunks: list, folder_id: str | None = None,
                 kind: str = "lecture") -> str:
    doc_id = uuid.uuid4().hex[:12]
    kind = kind if kind in KINDS else "lecture"
    with _lock:
        c = _c()
        c.execute("INSERT INTO documents(id, learner_id, name, text, created, folder_id, kind) VALUES(?,?,?,?,?,?,?)",
                  (doc_id, lid, name, text, time.time(), folder_id, kind))
        c.executemany("INSERT INTO chunks VALUES(?,?,?)", [(doc_id, i, ch) for i, ch in enumerate(chunks)])
        c.commit()
    return doc_id


def list_documents(lid: str) -> list:
    with _lock:
        c = _c()
        rows = c.execute("SELECT id, name, length(text) AS chars, created, folder_id, kind FROM documents "
                         "WHERE learner_id=? ORDER BY created DESC", (lid,)).fetchall()
        out = []
        for r in rows:
            d = dict(r)
            kinds = {x["kind"] for x in c.execute("SELECT DISTINCT kind FROM analyses WHERE doc_id=?", (d["id"],))}
            d["has"] = {k: (k in kinds) for k in ("summary", "extract", "quiz")}
            out.append(d)
    return out


# ---- folders (one folder = one course; it holds lectures, problem sets...) ----
def create_folder(lid: str, name: str) -> dict:
    fid = uuid.uuid4().hex[:12]
    with _lock:
        _c().execute("INSERT INTO folders VALUES(?,?,?,?)", (fid, lid, name, time.time()))
        _c().commit()
    return {"id": fid, "name": name}


def list_folders(lid: str) -> list:
    with _lock:
        rows = _c().execute("SELECT id, name, created FROM folders WHERE learner_id=? ORDER BY created", (lid,)).fetchall()
        out = []
        for r in rows:
            d = dict(r)
            d["count"] = _c().execute("SELECT COUNT(*) FROM documents WHERE folder_id=?", (d["id"],)).fetchone()[0]
            out.append(d)
    return out


def get_folder(fid: str, lid: str | None = None):
    with _lock:
        row = _c().execute("SELECT * FROM folders WHERE id=?", (fid,)).fetchone()
    if not row or (lid is not None and row["learner_id"] != lid):
        return None
    return dict(row)


def rename_folder(fid: str, name: str):
    with _lock:
        _c().execute("UPDATE folders SET name=? WHERE id=?", (name, fid))
        _c().commit()


def folder_documents(fid: str) -> list:
    with _lock:
        rows = _c().execute("SELECT * FROM documents WHERE folder_id=? ORDER BY created", (fid,)).fetchall()
    return [dict(r) for r in rows]


def default_folder(lid: str) -> str:
    """Files sent without a folder go to a 'General' course (created on first use)."""
    with _lock:
        row = _c().execute("SELECT id FROM folders WHERE learner_id=? AND name='General'", (lid,)).fetchone()
    return row["id"] if row else create_folder(lid, "General")["id"]


def move_document(doc_id: str, folder_id: str, kind: str | None = None):
    with _lock:
        _c().execute("UPDATE documents SET folder_id=? WHERE id=?", (folder_id, doc_id))
        if kind in KINDS:
            _c().execute("UPDATE documents SET kind=? WHERE id=?", (kind, doc_id))
        _c().commit()


def delete_folder(fid: str):
    for d in folder_documents(fid):
        delete_document(d["id"])
    with _lock:
        _c().execute("DELETE FROM folders WHERE id=?", (fid,))
        _c().commit()


def get_document(doc_id: str, lid: str | None = None):
    with _lock:
        row = _c().execute("SELECT * FROM documents WHERE id=?", (doc_id,)).fetchone()
    if not row or (lid is not None and row["learner_id"] != lid):
        return None
    return dict(row)


def get_chunks(doc_id: str) -> list:
    with _lock:
        rows = _c().execute("SELECT text FROM chunks WHERE doc_id=? ORDER BY idx", (doc_id,)).fetchall()
    return [r["text"] for r in rows]


def delete_document(doc_id: str):
    with _lock:
        c = _c()
        for table, col in (("chunks", "doc_id"), ("analyses", "doc_id"), ("documents", "id")):
            c.execute(f"DELETE FROM {table} WHERE {col}=?", (doc_id,))
        c.commit()


# ---- cached analyses (summary / extraction / quiz): never regenerate what we already have ----
def get_analysis(doc_id: str, kind: str, variant: str):
    with _lock:
        row = _c().execute("SELECT data FROM analyses WHERE doc_id=? AND kind=? AND variant=?",
                           (doc_id, kind, variant)).fetchone()
    return json.loads(row["data"]) if row else None


def save_analysis(doc_id: str, kind: str, variant: str, data: dict):
    with _lock:
        _c().execute("INSERT OR REPLACE INTO analyses VALUES(?,?,?,?,?)",
                     (doc_id, kind, variant, json.dumps(data), time.time()))
        _c().commit()


# ---- progress ----
def add_progress(lid: str, kind: str, topic: str = "", score: int = 0, total: int = 0, ts: float | None = None):
    with _lock:
        _c().execute("INSERT INTO progress(learner_id, ts, kind, topic, score, total) VALUES(?,?,?,?,?,?)",
                     (lid, ts or time.time(), kind, topic, score, total))
        _c().commit()


def list_progress(lid: str) -> list:
    with _lock:
        rows = _c().execute("SELECT ts, kind, topic, score, total FROM progress WHERE learner_id=? "
                            "ORDER BY ts DESC", (lid,)).fetchall()
    return [dict(r) for r in rows]


# ---- peer arenas (shared quiz rooms) ----
def create_arena(code: str, topic: str, lang: str, questions: list, owner: str):
    with _lock:
        c = _c()
        c.execute("DELETE FROM arena_players WHERE code IN (SELECT code FROM arenas WHERE created<?)", (time.time() - 7 * 86400,))
        c.execute("DELETE FROM arenas WHERE created<?", (time.time() - 7 * 86400,))
        c.execute("INSERT INTO arenas VALUES(?,?,?,?,?,?)", (code, topic, lang, json.dumps(questions), owner, time.time()))
        c.commit()


def get_arena(code: str):
    with _lock:
        row = _c().execute("SELECT * FROM arenas WHERE code=?", (code,)).fetchone()
    if not row:
        return None
    d = dict(row)
    d["questions"] = json.loads(d["questions"])
    return d


def upsert_player(code: str, lid: str, nickname: str):
    with _lock:
        c = _c()
        if c.execute("SELECT 1 FROM arena_players WHERE code=? AND learner_id=?", (code, lid)).fetchone():
            c.execute("UPDATE arena_players SET nickname=? WHERE code=? AND learner_id=?", (nickname, code, lid))
        else:
            c.execute("INSERT INTO arena_players(code, learner_id, nickname, score, answered, joined) VALUES(?,?,?,?,?,?)",
                      (code, lid, nickname, 0, "{}", time.time()))
        c.commit()


def get_players(code: str) -> list:
    with _lock:
        rows = _c().execute("SELECT * FROM arena_players WHERE code=? ORDER BY joined", (code,)).fetchall()
    out = []
    for r in rows:
        d = dict(r)
        d["answered"] = json.loads(d["answered"] or "{}")
        out.append(d)
    return out


def save_player_answer(code: str, lid: str, answered: dict, score: int):
    with _lock:
        _c().execute("UPDATE arena_players SET answered=?, score=? WHERE code=? AND learner_id=?",
                     (json.dumps(answered), score, code, lid))
        _c().commit()


# ---- privacy: delete everything we hold about a learner ----
def delete_learner(lid: str):
    with _lock:
        c = _c()
        for r in c.execute("SELECT id FROM documents WHERE learner_id=?", (lid,)).fetchall():
            c.execute("DELETE FROM chunks WHERE doc_id=?", (r["id"],))
            c.execute("DELETE FROM analyses WHERE doc_id=?", (r["id"],))
        for table in ("documents", "folders", "profile", "progress", "arena_players"):
            c.execute(f"DELETE FROM {table} WHERE learner_id=?", (lid,))
        c.commit()
