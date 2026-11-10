# GenAI module – technical explanation

All AI behaviour lives in `backend/`. The browser never talks to a model; it calls the FastAPI API, which runs every AI request as a background job.

## 1. Request flow

```
Browser ──POST /api/tutor|peer|quiz|… ──▶ jobs.py (job id) ──▶ features.py (task logic)
                                                   │
                           docs.py (retrieval) ◀───┤──▶ prompts.py (task prompt) ──▶ gateway.py ──▶ model
                                                   └──▶ parsing.py (validate structured reply) ──▶ storage.py
Browser ◀── GET /api/jobs/{id} (stage, elapsed, queue, result) ──────────────────────────────────────────
```

## 2. Models (OpenAI-compatible API, configured in `.env`)

| Tier | Default | Tasks |
|---|---|---|
| Compact | `qwen2.5-3b` | guiding question / hints, simple explanation, definitions and formulas extraction, quiz generation |
| Large | `llama3.1-8b` | full worked answer, document summary, teach-back feedback |
| No model | – | learning-style diagnostic, confusion detection (EN/FR/AR/Darija), level update, study plan, Arena scoring, XP/streak/badges |

Model names, base URL and key come only from `.env` (see `.env.example`). Nothing is hard-coded and no credential is stored in the repository.

## 3. RAG workflow (`docs.py`)

1. **Extract** text from PDF / TXT / MD (pypdf). Scanned PDFs without a text layer are rejected with a clear message (OCR is future work).
2. **Chunk** into about 900 characters and store in SQLite with the course folder and the file kind (lecture / problem set / other).
3. **Retrieve**: TF-IDF scoring of the question against the chunks of the chosen file or of the whole course folder; the top 3 chunks go into the prompt. No extra model call is needed, so retrieval costs no quota.
4. **Generate** with a task-specific prompt (`prompts.py`) that carries the learner's level, learning style, language and mode (ask / hint / answer / explain).
5. **Parse** (`parsing.py`): replies use fixed markers (e.g. `PEER_REACTION / WHAT_IS_RIGHT / WHAT_TO_FIX / QUESTION`, or `Q / A–D / ANSWER / WHY` for quizzes) that are validated before display.
6. **Cache**: summaries, extractions and quizzes are stored per document; identical tutor requests are served from the gateway cache. Fallback answers are never cached.

## 4. Gateway and limited capacity (`gateway.py`)

- Sliding-window rate limit of 18 requests/min (platform limit 20) and a 2-slot concurrency semaphore.
- Large → compact fallback on timeout/error, with a 30 s circuit breaker for the large model.
- Queue and wait statistics exposed to the UI (stage, elapsed time, position).
- `MOCK_LLM=1` runs the whole app with a simulated model; `MOCK_FAIL_LARGE=1` simulates a large-model outage.

## 5. Pedagogy and safety

- Hints before answers by default; the learner can switch to direct explanation.
- Teach-back: the learner explains a concept and the AI answers as a curious classmate, then says what is right, what to fix and asks one follow-up question.
- The model is told to rely on the course material, to say when it is missing, and never to discriminate by gender, region, language level or background.
- Anonymous learner id only; `DELETE /api/learner` erases all server-side data.

## 6. Tests

- `python -m unittest discover -s tests -v` (31 tests, simulated AI): gateway, parsing, retrieval, folders, jobs, privacy erase.
- `node frontend/src/plan.test.mjs`: study-plan generator.
- `python check_models.py` and `python smoke_test.py`: real-model checks (about 10 calls) run inside the allocated access window.
