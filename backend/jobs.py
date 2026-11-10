"""Background jobs.

The AI answers arrive as a whole (not streamed) and can take several seconds, so every AI
request becomes a job: the API replies instantly with a job id and the interface polls it,
showing the stage ("waiting for the AI", "writing"...) and the queue position instead of a
frozen screen.
"""
import asyncio
import logging
import time
import uuid

from gateway import GatewayError

log = logging.getLogger("ednova.jobs")
JOBS: dict = {}
_tasks: set = set()


class Job:
    def __init__(self):
        self.id = uuid.uuid4().hex[:12]
        self.state = "running"
        self.stage = "preparing"
        self.result = None
        self.error = None
        self.created = time.time()
        self.finished = None

    def public(self) -> dict:
        d = {"job_id": self.id, "state": self.state, "stage": self.stage,
             "elapsed": round((self.finished or time.time()) - self.created, 1)}
        if self.state == "done":
            d["result"] = self.result
        if self.state == "error":
            d["error"] = self.error
        return d


async def _run(job: Job, fn):
    try:
        job.result = await fn(job)
        job.state = "done"
    except GatewayError as e:
        job.error = {"code": "ai_unavailable", "message": str(e)}
        job.state = "error"
    except ValueError as e:
        job.error = {"code": "bad_request", "message": str(e)}
        job.state = "error"
    except Exception as e:  # noqa: BLE001
        log.exception("job failed")
        job.error = {"code": "internal", "message": f"{type(e).__name__}: {e}"}
        job.state = "error"
    finally:
        job.finished = time.time()


def submit(fn) -> Job:
    now = time.time()
    for jid in [j for j, job in JOBS.items() if job.finished and now - job.finished > 1800]:
        JOBS.pop(jid, None)
    job = Job()
    JOBS[job.id] = job
    task = asyncio.create_task(_run(job, fn))
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)
    return job


def get(job_id: str):
    return JOBS.get(job_id)
