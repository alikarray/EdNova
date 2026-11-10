"""EdNova Study Companion - FastAPI app.

Run from the backend folder:
    python -m uvicorn main:app --reload --port 8000
Open http://localhost:8000
"""
import asyncio
import mimetypes
import re
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

import config
import docs
import features
import jobs
import storage
from gateway import Gateway

# On Windows the registry can map .js to text/plain, which browsers refuse for module scripts.
mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("application/javascript", ".mjs")

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"

app = FastAPI(title="EdNova Study Companion")
gw = Gateway()
storage.init()

Lang = Literal["en", "fr", "ar", "darija"]
_ID = re.compile(r"^[A-Za-z0-9-]{8,64}$")


def lid_of(learner_id: str) -> str:
    if not _ID.match(learner_id or ""):
        raise HTTPException(400, "Invalid learner id.")
    return learner_id


class Turn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=1500)


class TutorReq(BaseModel):
    learner_id: str
    mode: Literal["ask", "hint", "answer", "explain"] = "ask"
    message: str = Field(min_length=1, max_length=2000)
    history: list[Turn] = []
    hint_n: int = 1
    lang: Lang = "en"
    doc_id: str | None = None
    folder_id: str | None = None


class PeerReq(BaseModel):
    learner_id: str
    topic: str = Field(min_length=1, max_length=200)
    explanation: str = Field(min_length=1, max_length=1500)
    lang: Lang = "en"
    doc_id: str | None = None
    folder_id: str | None = None


class DocReq(BaseModel):
    learner_id: str
    lang: Lang = "en"
    fresh: bool = False


class QuizReq(DocReq):
    n: int = 5
    topic: str | None = None
    doc_id: str | None = None
    folder_id: str | None = None


class DiagReq(BaseModel):
    learner_id: str
    answers: list[int]
    level: Literal["beginner", "intermediate", "advanced"] = "beginner"


class FeedbackReq(BaseModel):
    learner_id: str
    feedback: Literal["clear", "confused"]


class ArenaCreateReq(BaseModel):
    learner_id: str
    nickname: str = Field(min_length=1, max_length=40)
    topic: str | None = None
    doc_id: str | None = None
    folder_id: str | None = None
    n: int = 5
    lang: Lang = "en"


class ArenaJoinReq(BaseModel):
    learner_id: str
    code: str = Field(min_length=3, max_length=10)
    nickname: str = Field(min_length=1, max_length=40)


class ArenaAnswerReq(BaseModel):
    learner_id: str
    q: int
    choice: int


class FolderReq(BaseModel):
    learner_id: str
    name: str = Field(min_length=1, max_length=60)


class MoveReq(BaseModel):
    learner_id: str
    folder_id: str
    kind: str | None = None


class QuizResultReq(BaseModel):
    learner_id: str
    topic: str = ""
    score: int
    total: int


# ------------------------------------------------------------------ status & jobs
@app.get("/api/status")
async def status():
    return gw.snapshot()


@app.get("/api/jobs/{job_id}")
async def job_status(job_id: str):
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(404, "Unknown job.")
    snap = gw.snapshot()
    return {**job.public(), "gateway": {k: snap[k] for k in ("queued", "in_flight", "used_last_minute",
                                                              "limit_per_minute", "large_available")}}


# ------------------------------------------------------------------ learner profile
@app.post("/api/diagnostic")
async def diagnostic(req: DiagReq):
    try:
        return features.score_diagnostic(lid_of(req.learner_id), req.answers, req.level)
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.get("/api/profile")
async def profile(learner_id: str):
    return storage.get_profile(lid_of(learner_id))


@app.post("/api/feedback")
async def feedback(req: FeedbackReq):
    return features.handle_feedback(lid_of(req.learner_id), req.feedback)


@app.get("/api/progress")
async def progress(learner_id: str, tz: int = 0):
    return features.get_progress(lid_of(learner_id), tz)


@app.post("/api/quiz/result")
async def quiz_result(req: QuizResultReq):
    try:
        return features.record_quiz(lid_of(req.learner_id), req.topic, req.score, req.total)
    except ValueError as e:
        raise HTTPException(400, str(e))


# ------------------------------------------------------------------ AI features (jobs)
@app.post("/api/tutor")
async def tutor(req: TutorReq):
    lid = lid_of(req.learner_id)
    data = req.model_dump()
    return {"job_id": jobs.submit(lambda job: features.run_tutor(gw, job, lid, data)).id}


@app.post("/api/peer")
async def peer(req: PeerReq):
    lid = lid_of(req.learner_id)
    data = req.model_dump()
    return {"job_id": jobs.submit(lambda job: features.run_peer(gw, job, lid, data)).id}


@app.post("/api/docs/{doc_id}/summary")
async def doc_summary(doc_id: str, req: DocReq):
    lid = lid_of(req.learner_id)
    data = {**req.model_dump(), "doc_id": doc_id}
    return {"job_id": jobs.submit(lambda job: features.run_summary(gw, job, lid, data)).id}


@app.post("/api/docs/{doc_id}/extract")
async def doc_extract(doc_id: str, req: DocReq):
    lid = lid_of(req.learner_id)
    data = {**req.model_dump(), "doc_id": doc_id}
    return {"job_id": jobs.submit(lambda job: features.run_extract(gw, job, lid, data)).id}


@app.post("/api/quiz")
async def quiz(req: QuizReq):
    lid = lid_of(req.learner_id)
    data = req.model_dump()
    return {"job_id": jobs.submit(lambda job: features.run_quiz(gw, job, lid, data)).id}


# ------------------------------------------------------------------ peer arena
def _arena(fn, *args):
    try:
        return fn(*args)
    except LookupError as e:
        raise HTTPException(404, str(e))
    except PermissionError as e:
        raise HTTPException(403, str(e))
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.post("/api/arena")
async def arena_create(req: ArenaCreateReq):
    lid = lid_of(req.learner_id)
    data = req.model_dump()
    return {"job_id": jobs.submit(lambda job: features.run_arena_create(gw, job, lid, data)).id}


@app.post("/api/arena/join")
async def arena_join(req: ArenaJoinReq):
    return _arena(features.arena_join, lid_of(req.learner_id), req.code, req.nickname)


@app.get("/api/arena/{code}")
async def arena_state(code: str, learner_id: str):
    return _arena(features.arena_state, lid_of(learner_id), code)


@app.post("/api/arena/{code}/answer")
async def arena_answer(code: str, req: ArenaAnswerReq):
    return _arena(features.arena_answer, lid_of(req.learner_id), code, req.q, req.choice)


@app.delete("/api/learner")
async def delete_learner(learner_id: str):
    storage.delete_learner(lid_of(learner_id))
    return {"ok": True}


# ------------------------------------------------------------------ documents
@app.post("/api/docs/upload")
async def upload(file: UploadFile = File(...), learner_id: str = Form(...), folder_id: str = Form(""),
                 kind: str = Form("lecture")):
    lid = lid_of(learner_id)
    if folder_id and not storage.get_folder(folder_id, lid):
        raise HTTPException(404, "Course not found.")
    data = await file.read()
    if len(data) > config.MAX_UPLOAD_MB * 1024 * 1024:
        raise HTTPException(413, f"File too large (max {config.MAX_UPLOAD_MB} MB).")
    try:
        text = await asyncio.to_thread(docs.extract_text, file.filename or "", data)
    except docs.DocError as e:
        raise HTTPException(400, e.message)
    chunks = docs.chunk_text(text)
    folder_id = folder_id or storage.default_folder(lid)
    doc_id = storage.add_document(lid, file.filename or "document", text, chunks, folder_id, kind)
    return {"doc_id": doc_id, "folder_id": folder_id, "name": file.filename, "chars": len(text), "chunks": len(chunks)}


@app.get("/api/docs")
async def list_docs(learner_id: str):
    return storage.list_documents(lid_of(learner_id))


@app.post("/api/docs/{doc_id}/move")
async def move_doc(doc_id: str, req: MoveReq):
    lid = lid_of(req.learner_id)
    if not storage.get_document(doc_id, lid) or not storage.get_folder(req.folder_id, lid):
        raise HTTPException(404, "Not found.")
    storage.move_document(doc_id, req.folder_id, req.kind)
    return {"ok": True}


# ------------------------------------------------------------------ course folders
@app.get("/api/folders")
async def list_folders(learner_id: str):
    return storage.list_folders(lid_of(learner_id))


@app.post("/api/folders")
async def create_folder(req: FolderReq):
    lid = lid_of(req.learner_id)
    if len(storage.list_folders(lid)) >= 30:
        raise HTTPException(400, "Too many courses (max 30).")
    return storage.create_folder(lid, req.name.strip())


@app.post("/api/folders/{folder_id}/rename")
async def rename_folder(folder_id: str, req: FolderReq):
    if not storage.get_folder(folder_id, lid_of(req.learner_id)):
        raise HTTPException(404, "Course not found.")
    storage.rename_folder(folder_id, req.name.strip())
    return {"ok": True}


@app.delete("/api/folders/{folder_id}")
async def delete_folder(folder_id: str, learner_id: str):
    if not storage.get_folder(folder_id, lid_of(learner_id)):
        raise HTTPException(404, "Course not found.")
    storage.delete_folder(folder_id)
    return {"ok": True}


@app.delete("/api/docs/{doc_id}")
async def delete_doc(doc_id: str, learner_id: str):
    if not storage.get_document(doc_id, lid_of(learner_id)):
        raise HTTPException(404, "Document not found.")
    storage.delete_document(doc_id)
    return {"ok": True}


# ------------------------------------------------------------------ frontend
@app.get("/")
async def index():
    return FileResponse(FRONTEND_DIR / "index.html", headers={"Cache-Control": "no-cache"})


if FRONTEND_DIR.exists():
    app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")
