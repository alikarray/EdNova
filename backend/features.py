"""Learning features. Each `run_*` coroutine is one job: it prepares the context, makes the
FEWEST possible AI calls through the gateway, and returns a JSON-ready dict.

Model routing (documented choice, see README):
  compact -> guiding question / hints / simple explanations, definitions+formulas extraction, quizzes
  large   -> full worked answers, document summaries (multi-excerpt synthesis), teach-back feedback
  Any large-model failure falls back to compact automatically (gateway) and the result says so.
"""
import asyncio
import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone

import docs
import parsing
import prompts
import storage

STYLES = ["visual", "analogy", "stepwise", "example", "repetition", "practice"]
LEVELS = ["beginner", "intermediate", "advanced"]

# Diagnostic: which learning style each answer option points to (question texts live in the UI,
# so the scoring is language independent).
STYLE_BY_OPTION = [
    ["visual", "analogy", "stepwise", "example"],
    ["stepwise", "practice", "example", "visual"],
    ["repetition", "practice", "visual", "analogy"],
    ["example", "analogy", "stepwise", "repetition"],
    ["practice", "repetition", "visual", "example"],
]


# ---------------------------------------------------------------- diagnostic & adaptation
def score_diagnostic(lid: str, answers: list, level: str) -> dict:
    if (not isinstance(answers, list) or len(answers) != len(STYLE_BY_OPTION)
            or any(not isinstance(a, int) or not 0 <= a <= 3 for a in answers)):
        raise ValueError("The diagnostic needs one answer (0-3) for each of the 5 questions.")
    if level not in LEVELS:
        raise ValueError("Unknown level.")
    scores = {s: 0 for s in STYLES}
    for q, a in enumerate(answers):
        scores[STYLE_BY_OPTION[q][a]] += 1
    ranked = sorted(STYLES, key=lambda s: (-scores[s], STYLES.index(s)))
    profile = {"style": ranked[0], "secondary": ranked[1], "scores": scores, "level": level,
               "confusion_streak": 0}
    storage.save_profile(lid, profile)
    return profile


def handle_feedback(lid: str, feedback: str) -> dict:
    """'Still confused' twice in a row -> switch to the learner's second-best style."""
    prof = storage.get_profile(lid)
    if not prof:
        return {"style": None, "style_switched": False}
    switched = False
    if feedback == "confused":
        prof["confusion_streak"] = prof.get("confusion_streak", 0) + 1
        if prof["confusion_streak"] >= 2:
            prof["style"], prof["secondary"] = prof["secondary"], prof["style"]
            prof["confusion_streak"] = 0
            switched = True
    else:
        prof["confusion_streak"] = 0
    storage.save_profile(lid, prof)
    return {"style": prof["style"], "style_switched": switched}


def _profile_defaults(lid: str) -> tuple:
    prof = storage.get_profile(lid) or {}
    return prof.get("style", "example"), prof.get("level", "beginner")


def _own_doc(lid: str, doc_id: str) -> dict:
    doc = storage.get_document(doc_id, lid)
    if not doc:
        raise ValueError("Document not found.")
    return doc


def _scope_docs(lid: str, req: dict) -> list:
    """Documents the learner pointed at: one file (doc_id) or a whole course folder (folder_id)."""
    if req.get("folder_id"):
        if not storage.get_folder(req["folder_id"], lid):
            return []
        return storage.folder_documents(req["folder_id"])
    if req.get("doc_id"):
        d = storage.get_document(req["doc_id"], lid)
        return [d] if d else []
    return []


def _scope_chunks(scope: list) -> list:
    out = []
    for d in scope:
        out.extend(storage.get_chunks(d["id"]))
    return out


# ---------------------------------------------------------------- tutor
async def run_tutor(gw, job, lid: str, req: dict) -> dict:
    job.stage = "preparing"
    mode = req["mode"]
    message = req["message"].strip()
    lang = req["lang"]
    confused = parsing.detect_confusion(message)
    if confused:
        handle_feedback(lid, "confused")  # typed confusion counts like the button
    style, level = _profile_defaults(lid)

    chunks = _scope_chunks(_scope_docs(lid, req))
    context = (docs.search(chunks, message, k=3) or chunks[:2]) if chunks else []

    n = min(max(int(req.get("hint_n", 1)), 1), 3)
    messages = prompts.tutor_messages(mode, message, req.get("history", []), lang, style, level, n,
                                      confused, context)
    tier = "large" if mode == "answer" else "compact"
    job.stage = "waiting_ai"
    res = await gw.ask("tutor", messages, tier=tier, temperature=0.5, max_tokens=500)
    job.stage = "parsing"
    reply, nxt = parsing.split_next(res.text)
    if mode in ("answer", "explain"):
        storage.add_progress(lid, "tutor", topic=message[:60])
    return {"reply": reply, "next_step": nxt, "mode": mode, "style": style, "level": level,
            "used_document": bool(context), "meta": res.meta()}


# ---------------------------------------------------------------- peer / teach-back
async def run_peer(gw, job, lid: str, req: dict) -> dict:
    job.stage = "preparing"
    topic = req["topic"].strip()[:200]
    explanation = req["explanation"].strip()[:1500]
    if len(explanation) < 20:
        raise ValueError("Write a bit more: explain the idea in your own words (at least a sentence).")
    _, level = _profile_defaults(lid)
    chunks = _scope_chunks(_scope_docs(lid, req))
    context = docs.search(chunks, topic + " " + explanation, k=3) if chunks else []
    messages = prompts.peer_messages(topic, explanation, req["lang"], level, context)
    job.stage = "waiting_ai"
    res = await gw.ask("peer", messages, tier="large", temperature=0.4, max_tokens=500)
    job.stage = "parsing"
    sections = parsing.parse_peer(res.text)
    storage.add_progress(lid, "peer", topic=topic[:60])
    return {"sections": sections, "raw": None if sections else res.text, "meta": res.meta()}


# ---------------------------------------------------------------- documents
async def run_summary(gw, job, lid: str, req: dict) -> dict:
    job.stage = "preparing"
    doc = _own_doc(lid, req["doc_id"])
    _, level = _profile_defaults(lid)
    variant = f"{req['lang']}|{level}"
    if not req.get("fresh"):
        cached = storage.get_analysis(doc["id"], "summary", variant)
        if cached:
            cached["meta"] = {**cached.get("meta", {}), "cached": True}
            return cached
    excerpts = docs.windows(doc["text"], n=3, size=2000)
    job.stage = "waiting_ai"
    res = await gw.ask("summary", prompts.summary_messages(excerpts, req["lang"], level), tier="large",
                       temperature=0.3, max_tokens=550)
    out = {"summary": res.text.strip(), "doc": doc["name"], "meta": res.meta()}
    storage.save_analysis(doc["id"], "summary", variant, out)
    return out


async def run_extract(gw, job, lid: str, req: dict) -> dict:
    job.stage = "preparing"
    doc = _own_doc(lid, req["doc_id"])
    variant = req["lang"]
    if not req.get("fresh"):
        cached = storage.get_analysis(doc["id"], "extract", variant)
        if cached:
            cached["meta"] = {**cached.get("meta", {}), "cached": True}
            return cached
    wins = docs.windows(doc["text"], n=3, size=2800)
    job.stage = "waiting_ai"
    results = await asyncio.gather(
        *[gw.ask("extract", prompts.extract_messages(w, req["lang"]), tier="compact", temperature=0.2,
                 max_tokens=450) for w in wins], return_exceptions=True)
    ok = [r for r in results if not isinstance(r, Exception)]
    if not ok:
        raise results[0]
    job.stage = "parsing"
    merged = {"definitions": [], "formulas": []}
    seen = set()
    for r in ok:
        parsed = parsing.parse_defs_formulas(r.text)
        for key, field in (("definitions", "term"), ("formulas", "expression")):
            for item in parsed[key]:
                k = (key, item[field].lower())
                if k not in seen:
                    seen.add(k)
                    merged[key].append(item)
    out = {**merged, "doc": doc["name"], "partial": len(ok) < len(results), "meta": ok[0].meta()}
    storage.save_analysis(doc["id"], "extract", variant, out)
    return out


async def run_quiz(gw, job, lid: str, req: dict) -> dict:
    job.stage = "preparing"
    _, level = _profile_defaults(lid)
    n = min(max(int(req.get("n", 5)), 1), 8)
    lang = req["lang"]
    doc = None
    folder_docs = []
    if req.get("folder_id"):
        folder = storage.get_folder(req["folder_id"], lid)
        folder_docs = storage.folder_documents(folder["id"]) if folder else []
        if not folder_docs:
            raise ValueError("This course has no files yet. Add a lecture first.")
        topic = folder["name"]
    elif req.get("doc_id"):
        doc = _own_doc(lid, req["doc_id"])
        topic = doc["name"]
    else:
        topic = (req.get("topic") or "").strip()
        if not topic:
            raise ValueError("Give a topic or choose a document.")
    variant = f"{lang}|{level}|{n}"
    if doc and not req.get("fresh"):
        cached = storage.get_analysis(doc["id"], "quiz", variant)
        if cached:
            cached["meta"] = {**cached.get("meta", {}), "cached": True}
            return cached
    if folder_docs:  # whole course: take a slice of every file so lectures and problem sets both count
        per = max(1, 4 // len(folder_docs))
        size = max(700, 3600 // (per * len(folder_docs)))
        source = "\n\n".join(w for d in folder_docs[:6] for w in docs.windows(d["text"], n=per, size=size))
    else:
        source = "\n\n".join(docs.windows(doc["text"], n=2, size=2200)) if doc else topic[:200]
    quiz, res = [], None
    for attempt in range(2):
        job.stage = "waiting_ai"
        res = await gw.ask("quiz", prompts.quiz_messages(source, n, lang, level, uuid.uuid4().hex[:4],
                                                         by_topic=(doc is None and not folder_docs)),
                           tier="compact", temperature=0.5 if attempt == 0 else 0.2, max_tokens=1000,
                           cache=False)
        job.stage = "parsing"
        quiz = parsing.parse_quiz(res.text)
        if len(quiz) >= min(2, n):
            break
    if not quiz:
        raise ValueError("The AI answer could not be turned into a quiz this time. Please try again.")
    out = {"questions": quiz[:n], "topic": topic, "meta": res.meta()}
    if doc:
        storage.save_analysis(doc["id"], "quiz", variant, out)
    return out


# ---------------------------------------------------------------- progress & motivation
def record_quiz(lid: str, topic: str, score: int, total: int) -> dict:
    if total <= 0 or not 0 <= score <= total:
        raise ValueError("Invalid quiz score.")
    storage.add_progress(lid, "quiz", topic=topic[:60], score=score, total=total)
    prof = storage.get_profile(lid)
    changed = None
    if prof and prof.get("level") in LEVELS:
        i = LEVELS.index(prof["level"])
        pct = score / total
        if pct >= 0.8 and i < 2:
            prof["level"], changed = LEVELS[i + 1], "up"
        elif pct < 0.4 and i > 0:
            prof["level"], changed = LEVELS[i - 1], "down"
        if changed:
            storage.save_profile(lid, prof)
    return {"level": (prof or {}).get("level"), "level_changed": changed, "xp_gained": score * 10}


def level_info(xp: int) -> tuple:
    """(level number, xp inside this level, xp needed for this level). 40, 60, 80... per level."""
    level, need = 1, 40
    while xp >= need:
        xp -= need
        level += 1
        need += 20
    return level, xp, need


def get_progress(lid: str, tz_offset_min: int = 0) -> dict:
    tz = timezone(timedelta(minutes=max(-840, min(840, int(tz_offset_min)))))
    prof = storage.get_profile(lid)
    rows = storage.list_progress(lid)
    quizzes = [r for r in rows if r["kind"] == "quiz"]
    xp = (sum(r["score"] * 10 for r in rows if r["kind"] in ("quiz", "arena"))
          + 5 * sum(r["kind"] == "tutor" for r in rows) + 15 * sum(r["kind"] == "peer" for r in rows))
    days = {datetime.fromtimestamp(r["ts"], tz).date() for r in rows}
    today = datetime.now(tz).date()
    d = today if today in days else today - timedelta(days=1)
    streak = 0
    while d in days:
        streak += 1
        d -= timedelta(days=1)
    monday = today - timedelta(days=today.weekday())
    week = [(monday + timedelta(days=i)) in days for i in range(7)]
    badges = []
    if any(r["kind"] == "tutor" for r in rows):
        badges.append("first_session")
    if quizzes:
        badges.append("first_quiz")
    if any(r["kind"] == "peer" for r in rows):
        badges.append("teacher")
    if any(r["kind"] == "arena" for r in rows):
        badges.append("arena")
    if streak >= 3:
        badges.append("streak3")
    if not rows:
        motivation = "motivate_start"
    elif streak >= 2:
        motivation = "motivate_streak"
    elif quizzes and quizzes[0]["score"] / max(quizzes[0]["total"], 1) >= 0.8:
        motivation = "motivate_quiz_good"
    else:
        motivation = "motivate_keep"
    best = {}
    for r in quizzes:
        pct = round(100 * r["score"] / max(r["total"], 1))
        best[r["topic"]] = max(best.get(r["topic"], 0), pct)
    lvl, into, need = level_info(xp)
    return {"has_profile": bool(prof), "style": prof.get("style"), "secondary": prof.get("secondary"),
            "level": prof.get("level"), "xp": xp, "level_num": lvl, "xp_into": into, "xp_need": need,
            "streak": streak, "week": week, "today_index": today.weekday(), "badges": badges,
            "motivation": motivation, "sessions": len(rows), "quizzes": quizzes[:8], "best_by_topic": best,
            "recent": [{"kind": r["kind"], "topic": r["topic"], "ts": r["ts"]} for r in rows[:5]]}


# ---------------------------------------------------------------- arena (peer quiz rooms)
ARENA_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O/1/I to avoid reading mistakes
MAX_PLAYERS = 12


def _new_code() -> str:
    for _ in range(50):
        code = "".join(secrets.choice(ARENA_ALPHABET) for _ in range(5))
        if not storage.get_arena(code):
            return code
    raise RuntimeError("could not allocate an arena code")


def _clean_nick(nick) -> str:
    nick = re.sub(r"\s+", " ", (nick or "").strip())[:20]
    if not nick:
        raise ValueError("Choose a nickname (a real name is not needed).")
    return nick


async def run_arena_create(gw, job, lid: str, req: dict) -> dict:
    nick = _clean_nick(req.get("nickname"))
    q = await run_quiz(gw, job, lid, {"lang": req["lang"], "n": req.get("n", 5), "fresh": True,
                                      "doc_id": req.get("doc_id"), "folder_id": req.get("folder_id"),
                                      "topic": req.get("topic")})
    code = _new_code()
    storage.create_arena(code, q["topic"], req["lang"], q["questions"], lid)
    storage.upsert_player(code, lid, nick)
    return {"code": code, "topic": q["topic"], "n": len(q["questions"]), "meta": q["meta"]}


def arena_join(lid: str, code: str, nickname: str) -> dict:
    code = (code or "").strip().upper()
    if not storage.get_arena(code):
        raise LookupError("No arena with this code. Check the 5 characters.")
    players = storage.get_players(code)
    if lid not in {p["learner_id"] for p in players} and len(players) >= MAX_PLAYERS:
        raise ValueError("This arena is full.")
    storage.upsert_player(code, lid, _clean_nick(nickname))
    return arena_state(lid, code)


def arena_state(lid: str, code: str) -> dict:
    code = (code or "").strip().upper()
    arena = storage.get_arena(code)
    if not arena:
        raise LookupError("No arena with this code.")
    players = storage.get_players(code)
    me = next((p for p in players if p["learner_id"] == lid), None)
    if not me:
        raise PermissionError("Join the arena first.")
    qs = arena["questions"]
    n = len(qs)
    my_answers = {k: {"choice": ch, "answer_index": qs[int(k)]["answer_index"],
                      "explanation": qs[int(k)].get("explanation", "")} for k, ch in me["answered"].items()}
    board = sorted(({"nickname": p["nickname"], "score": p["score"], "answered": len(p["answered"]),
                     "done": len(p["answered"]) >= n, "you": p["learner_id"] == lid} for p in players),
                   key=lambda x: (-x["score"], -x["answered"]))
    return {"code": code, "topic": arena["topic"], "n": n, "lang": arena["lang"],
            "questions": [{"question": q["question"], "options": q["options"]} for q in qs],
            "players": board, "my_answers": my_answers, "finished": len(me["answered"]) >= n}


def arena_answer(lid: str, code: str, q: int, choice: int) -> dict:
    code = (code or "").strip().upper()
    arena = storage.get_arena(code)
    if not arena:
        raise LookupError("No arena with this code.")
    me = next((p for p in storage.get_players(code) if p["learner_id"] == lid), None)
    if not me:
        raise PermissionError("Join the arena first.")
    qs = arena["questions"]
    if not 0 <= q < len(qs) or not 0 <= choice <= 3:
        raise ValueError("Invalid answer.")
    qd = qs[q]
    answered = me["answered"]
    if str(q) in answered:  # idempotent: a double click never scores twice
        correct = answered[str(q)] == qd["answer_index"]
        return {"correct": correct, "answer_index": qd["answer_index"], "explanation": qd.get("explanation", ""),
                "score": me["score"], "done": len(answered) >= len(qs)}
    answered[str(q)] = choice
    correct = choice == qd["answer_index"]
    score = me["score"] + int(correct)
    storage.save_player_answer(code, lid, answered, score)
    done = len(answered) >= len(qs)
    if done:
        storage.add_progress(lid, "arena", topic=arena["topic"][:60], score=score, total=len(qs))
    return {"correct": correct, "answer_index": qd["answer_index"], "explanation": qd.get("explanation", ""),
            "score": score, "done": done}
