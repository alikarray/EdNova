"""One-command check of every AI feature against the REAL models (about 10 calls, well under
the 20/min limit). Run it on test day from the backend folder:

    python smoke_test.py

Add MOCK_LLM=1 to rehearse it without a key. It never writes to your real database.
"""
import asyncio
import time

import docs
import features
import parsing
import storage
from gateway import Gateway, GatewayError

SAMPLE = (
    "A derivative measures how fast a function changes. Definition: the derivative of f at x is the limit "
    "of (f(x+h)-f(x))/h as h tends to 0. Power rule: if f(x)=x^n then f'(x)=n*x^(n-1). "
    "A function is a rule that gives exactly one output for each input. Example: the derivative of x^3 is 3x^2. "
) * 3

results = []


def report(name, ok, detail="", seconds=None):
    t = f" ({seconds:.1f}s)" if seconds is not None else ""
    results.append(ok)
    print(f"[{'PASS' if ok else 'FAIL'}] {name}{t} {detail}")


class Job:
    stage = ""


async def timed(coro):
    t0 = time.time()
    try:
        return await coro, time.time() - t0
    except (GatewayError, ValueError) as e:
        return e, time.time() - t0


async def main():
    storage.init(":memory:")
    gw = Gateway()
    lid = "smoke-test-0001"
    features.score_diagnostic(lid, [0, 0, 2, 3, 2], "beginner")
    doc_id = storage.add_document(lid, "sample.txt", SAMPLE, docs.chunk_text(SAMPLE))
    print(f"Models: compact={gw.models['compact']}  large={gw.models['large']}  mock={gw.mock}\n")

    for tier in ("compact", "large"):
        r, s = await timed(gw.ask("ping", [{"role": "user", "content": "Say hello in one short sentence."}],
                                  tier=tier, max_tokens=40, cache=False))
        ok = not isinstance(r, Exception) and not r.fallback
        report(f"{tier} model answers", ok, repr(r)[:90] if isinstance(r, Exception) else r.text.strip()[:60], s)

    for lang, q in [("en", "What is a derivative?"), ("fr", "C'est quoi une dérivée ?"),
                    ("ar", "ما هي المشتقة؟"), ("darija", "شنوا هي المشتقة؟")]:
        r, s = await timed(features.run_tutor(gw, Job(), lid, {"mode": "ask", "message": q, "lang": lang,
                                                               "history": [], "doc_id": doc_id}))
        if isinstance(r, Exception):
            report(f"tutor guiding question [{lang}]", False, str(r)[:90], s)
            continue
        print(f"      {lang}: {r['reply'][:150]!r}  NEXT={r['next_step']!r}")
        report(f"tutor guiding question [{lang}]", bool(r["reply"].strip()),
               "(no NEXT line)" if not r["next_step"] else "", s)

    r, s = await timed(features.run_extract(gw, Job(), lid, {"doc_id": doc_id, "lang": "en"}))
    ok = not isinstance(r, Exception) and (r["definitions"] or r["formulas"])
    report("definitions + formulas extraction", bool(ok),
           str(r)[:90] if isinstance(r, Exception) else f"{len(r['definitions'])} defs, {len(r['formulas'])} formulas", s)

    r, s = await timed(features.run_quiz(gw, Job(), lid, {"doc_id": doc_id, "lang": "en", "n": 3}))
    ok = not isinstance(r, Exception) and len(r["questions"]) >= 2
    report("quiz generation + parsing", ok, str(r)[:90] if isinstance(r, Exception) else f"{len(r['questions'])} questions", s)

    r, s = await timed(features.run_peer(gw, Job(), lid, {
        "topic": "derivative", "lang": "en", "doc_id": doc_id,
        "explanation": "The derivative tells you how fast a function changes at one point. For x^n it is n*x^(n-1)."}))
    ok = not isinstance(r, Exception) and len(r["sections"]) >= 3
    report("teach-back feedback (large model)", ok,
           str(r)[:90] if isinstance(r, Exception) else f"sections: {sorted(r['sections'])}  fallback={r['meta']['fallback']}", s)

    r, s = await timed(features.run_summary(gw, Job(), lid, {"doc_id": doc_id, "lang": "en"}))
    ok = not isinstance(r, Exception) and len(r["summary"]) > 40
    report("document summary (large model)", ok,
           str(r)[:90] if isinstance(r, Exception) else f"fallback={r['meta']['fallback']}", s)

    snap = gw.snapshot()
    print(f"\nCalls used: {snap['calls']} | errors: {snap['errors']} | fallbacks: {snap['fallbacks']}")
    print("ALL GOOD" if all(results) else "SOME CHECKS FAILED: send me this whole output and I will fix the prompts.")


if __name__ == "__main__":
    asyncio.run(main())
