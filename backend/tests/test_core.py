"""Run from the backend folder:  python -m unittest discover -s tests -v
Uses the mock AI, so it needs no key and spends no quota."""
import asyncio
import os
import sys
import time
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import docs  # noqa: E402
import features  # noqa: E402
import jobs  # noqa: E402
import parsing  # noqa: E402
import storage  # noqa: E402
from gateway import Gateway, GatewayError  # noqa: E402

LID = "learner-test-0001"
TEXT = ("A derivative measures how fast a function changes. " * 30 + "\n\n"
        "Definition: the derivative of f at x is the limit of (f(x+h)-f(x))/h. " * 20 + "\n\n"
        "The power rule says (x^n)' = n x^(n-1). " * 20)


class FakeJob:
    stage = ""


def make_pdf(text: str) -> bytes:
    """Build a valid one-page PDF (with a real xref table) containing `text`."""
    stream = f"BT /F1 12 Tf 72 720 Td ({text}) Tj ET".encode()
    objs = [
        b"<</Type/Catalog/Pages 2 0 R>>",
        b"<</Type/Pages/Kids[3 0 R]/Count 1>>",
        b"<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>",
        b"<</Length " + str(len(stream)).encode() + b">>\nstream\n" + stream + b"\nendstream",
        b"<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>",
    ]
    out = b"%PDF-1.4\n"
    offsets = []
    for i, body in enumerate(objs, 1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n".encode() + body + b"\nendobj\n"
    xref_at = len(out)
    out += f"xref\n0 {len(objs) + 1}\n".encode() + b"0000000000 65535 f \n"
    for off in offsets:
        out += f"{off:010d} 00000 n \n".encode()
    out += f"trailer\n<</Root 1 0 R/Size {len(objs) + 1}>>\nstartxref\n{xref_at}\n%%EOF".encode()
    return out


class ParsingTests(unittest.TestCase):
    def test_next(self):
        r, n = parsing.split_next("Hello there.\nNEXT: try an example")
        self.assertEqual(r, "Hello there.")
        self.assertEqual(n, "try an example")
        r, n = parsing.split_next("No suggestion")
        self.assertIsNone(n)

    def test_defs_formulas(self):
        out = parsing.parse_defs_formulas(
            "- DEF: **Derivative** :: Rate of change.\nFORMULA: a^2+b^2=c^2 :: Pythagoras\nDEF: derivative :: dup\nnoise")
        self.assertEqual(len(out["definitions"]), 1)
        self.assertEqual(out["definitions"][0]["term"], "Derivative")
        self.assertEqual(out["formulas"][0]["expression"], "a^2+b^2=c^2")

    def test_quiz(self):
        q = parsing.parse_quiz("Q: What?\nA) a\nB) b\nC) c\nD) d\nANSWER: C\nWHY: because\n\n"
                               "Q2: Broken\nA) a\nB) b\nANSWER: A\n\nQ: Two\nA) 1\nB) 2\nC) 3\nD) 4\nANSWER: B")
        self.assertEqual(len(q), 2)  # the broken one is dropped
        self.assertEqual(q[0]["answer_index"], 2)
        self.assertEqual(q[0]["explanation"], "because")

    def test_peer(self):
        s = parsing.parse_peer("PEER_REACTION: hi\nWHAT_IS_RIGHT: a\nWHAT_TO_FIX: b\nQUESTION: c?")
        self.assertEqual(set(s), {"PEER_REACTION", "WHAT_IS_RIGHT", "WHAT_TO_FIX", "QUESTION"})
        self.assertEqual(parsing.parse_peer("free text"), {})

    def test_confusion(self):
        for t in ["I don't understand", "je ne comprends pas", "ما فهمتش", "mafhemtech", "I'm lost"]:
            self.assertTrue(parsing.detect_confusion(t), t)
        self.assertFalse(parsing.detect_confusion("What is a derivative?"))


class DocsTests(unittest.TestCase):
    def test_chunk_search_windows(self):
        chunks = docs.chunk_text(TEXT)
        self.assertGreater(len(chunks), 3)
        self.assertTrue(all(len(c) <= 1400 for c in chunks))
        hits = docs.search(chunks, "power rule exponent", k=2)
        self.assertTrue(any("power rule" in h for h in hits))
        w = docs.windows(TEXT, n=3, size=500)
        self.assertEqual(len(w), 3)
        self.assertEqual(docs.windows("short", n=3, size=500), ["short"])

    def test_extract(self):
        self.assertIn("derivative", docs.extract_text("a.txt", TEXT.encode()))
        with self.assertRaises(docs.DocError):
            docs.extract_text("a.exe", b"x")
        with self.assertRaises(docs.DocError):
            docs.extract_text("a.txt", b"tiny")
        pdf = make_pdf("The derivative measures change and the power rule helps compute it quickly in class.")
        self.assertIn("derivative", docs.extract_text("a.pdf", pdf))


class GatewayTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        os.environ.pop("MOCK_FAIL_LARGE", None)

    def msgs(self, i):
        return [{"role": "system", "content": "Mode: ask"}, {"role": "user", "content": f"q{i}"}]

    async def test_concurrency_limit(self):
        gw = Gateway(rate=100, concurrent=2, mock=True)
        await asyncio.gather(*[gw.ask("tutor", self.msgs(i)) for i in range(8)])
        self.assertLessEqual(gw.max_in_flight_seen, 2)
        self.assertEqual(gw.stats["calls"], 8)

    async def test_rate_limit(self):
        gw = Gateway(rate=3, window_s=1.0, concurrent=2, mock=True)
        t0 = time.monotonic()
        await asyncio.gather(*[gw.ask("tutor", self.msgs(i)) for i in range(5)])
        self.assertGreaterEqual(time.monotonic() - t0, 0.9)  # 4th/5th call had to wait for the window

    async def test_cache(self):
        gw = Gateway(rate=100, mock=True)
        a = await gw.ask("tutor", self.msgs(1))
        b = await gw.ask("tutor", self.msgs(1))
        self.assertFalse(a.cached)
        self.assertTrue(b.cached)
        self.assertEqual(gw.stats["calls"], 1)

    async def test_fallback_and_breaker(self):
        os.environ["MOCK_FAIL_LARGE"] = "1"
        gw = Gateway(rate=100, mock=True, breaker_s=5)
        r = await gw.ask("summary", self.msgs(1), tier="large")
        self.assertTrue(r.fallback)
        self.assertEqual(r.tier, "compact")
        self.assertFalse(gw.snapshot()["large_available"])
        calls = gw.stats["calls"]
        r2 = await gw.ask("summary", self.msgs(2), tier="large")  # breaker open: large is skipped
        self.assertTrue(r2.fallback)
        self.assertEqual(gw.stats["calls"], calls + 1)
        self.assertIn("temporarily", r2.reason)
        # a degraded answer must not be cached
        r3 = await gw.ask("summary", self.msgs(1), tier="large")
        self.assertFalse(r3.cached)

    async def test_missing_config_message(self):
        import config
        old = (config.BASE_URL, config.API_KEY)
        config.BASE_URL = config.API_KEY = ""
        try:
            gw = Gateway(rate=100, mock=False, breaker_s=0)
            with self.assertRaises(GatewayError) as cm:
                await gw.ask("tutor", self.msgs(1))
            self.assertIn(".env", str(cm.exception))
        finally:
            config.BASE_URL, config.API_KEY = old


class FeatureTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        os.environ.pop("MOCK_FAIL_LARGE", None)
        storage.init(":memory:")
        self.gw = Gateway(rate=100, mock=True)

    def test_diagnostic(self):
        p = features.score_diagnostic(LID, [0, 0, 2, 3, 2], "beginner")
        self.assertEqual(p["style"], "visual")
        self.assertNotEqual(p["style"], p["secondary"])
        self.assertEqual(storage.get_profile(LID)["style"], "visual")
        with self.assertRaises(ValueError):
            features.score_diagnostic(LID, [0, 1], "beginner")
        with self.assertRaises(ValueError):
            features.score_diagnostic(LID, [0, 0, 0, 0, 9], "beginner")

    def test_feedback_switches_style_after_two_confused(self):
        p = features.score_diagnostic(LID, [0, 0, 2, 3, 2], "beginner")
        self.assertFalse(features.handle_feedback(LID, "confused")["style_switched"])
        out = features.handle_feedback(LID, "confused")
        self.assertTrue(out["style_switched"])
        self.assertEqual(out["style"], p["secondary"])

    async def test_tutor_modes_and_document_context(self):
        features.score_diagnostic(LID, [0, 0, 2, 3, 2], "beginner")
        job = FakeJob()
        r = await features.run_tutor(self.gw, job, LID, {"mode": "ask", "message": "What is a derivative?",
                                                         "lang": "en", "history": [], "hint_n": 1})
        self.assertIn("guiding", r["reply"].lower() + "guiding")  # reply exists
        self.assertEqual(r["next_step"], "try one similar exercise on your own.")
        self.assertEqual(r["meta"]["tier"], "compact")
        r = await features.run_tutor(self.gw, job, LID, {"mode": "answer", "message": "What is a derivative?",
                                                         "lang": "en", "history": [], "hint_n": 3})
        self.assertEqual(r["meta"]["tier"], "large")  # full answers use the larger model
        doc_id = storage.add_document(LID, "course.txt", TEXT, docs.chunk_text(TEXT))
        r = await features.run_tutor(self.gw, job, LID, {"mode": "explain", "message": "power rule",
                                                         "lang": "fr", "history": [], "doc_id": doc_id})
        self.assertTrue(r["used_document"])
        # another learner cannot use this document
        r = await features.run_tutor(self.gw, job, "someone-else-0001", {"mode": "explain", "message": "x",
                                                                          "lang": "en", "history": [],
                                                                          "doc_id": doc_id})
        self.assertFalse(r["used_document"])

    async def test_typed_confusion_is_detected(self):
        p = features.score_diagnostic(LID, [0, 0, 2, 3, 2], "beginner")
        for _ in range(2):
            await features.run_tutor(self.gw, FakeJob(), LID, {"mode": "explain", "message": "I don't understand",
                                                               "lang": "en", "history": []})
        self.assertEqual(storage.get_profile(LID)["style"], p["secondary"])

    async def test_peer(self):
        r = await features.run_peer(self.gw, FakeJob(), LID, {"topic": "derivative", "lang": "en",
                                    "explanation": "It is how fast something changes at one point."})
        self.assertIn("WHAT_TO_FIX", r["sections"])
        with self.assertRaises(ValueError):
            await features.run_peer(self.gw, FakeJob(), LID, {"topic": "x", "explanation": "short", "lang": "en"})

    async def test_documents_pipeline_and_cache(self):
        doc_id = storage.add_document(LID, "course.txt", TEXT, docs.chunk_text(TEXT))
        base = {"doc_id": doc_id, "lang": "en"}
        s1 = await features.run_summary(self.gw, FakeJob(), LID, dict(base))
        self.assertEqual(s1["meta"]["tier"], "large")
        calls = self.gw.stats["calls"]
        s2 = await features.run_summary(self.gw, FakeJob(), LID, dict(base))
        self.assertTrue(s2["meta"]["cached"])
        self.assertEqual(self.gw.stats["calls"], calls)  # nothing regenerated
        e = await features.run_extract(self.gw, FakeJob(), LID, dict(base))
        self.assertEqual(len(e["definitions"]), 2)  # duplicates across excerpts merged
        self.assertEqual(len(e["formulas"]), 2)
        q = await features.run_quiz(self.gw, FakeJob(), LID, {**base, "n": 3})
        self.assertEqual(len(q["questions"]), 3)
        self.assertEqual(q["questions"][0]["answer_index"], 1)
        with self.assertRaises(ValueError):
            await features.run_summary(self.gw, FakeJob(), "someone-else-0001", dict(base))

    async def test_topic_quiz_needs_topic(self):
        with self.assertRaises(ValueError):
            await features.run_quiz(self.gw, FakeJob(), LID, {"lang": "en", "n": 3})
        q = await features.run_quiz(self.gw, FakeJob(), LID, {"lang": "en", "n": 2, "topic": "Photosynthesis"})
        self.assertEqual(len(q["questions"]), 2)

    async def test_summary_survives_large_model_outage(self):
        os.environ["MOCK_FAIL_LARGE"] = "1"
        doc_id = storage.add_document(LID, "course.txt", TEXT, docs.chunk_text(TEXT))
        s = await features.run_summary(self.gw, FakeJob(), LID, {"doc_id": doc_id, "lang": "en"})
        self.assertTrue(s["meta"]["fallback"])
        self.assertTrue(s["summary"])

    def test_progress_and_level(self):
        features.score_diagnostic(LID, [0, 0, 2, 3, 2], "beginner")
        self.assertEqual(features.get_progress(LID)["motivation"], "motivate_start")
        out = features.record_quiz(LID, "Derivatives", 5, 5)
        self.assertEqual(out["level"], "intermediate")
        out = features.record_quiz(LID, "Derivatives", 1, 5)
        self.assertEqual(out["level"], "beginner")
        p = features.get_progress(LID)
        self.assertEqual(p["xp"], 60)
        self.assertEqual(p["streak"], 1)
        self.assertIn("first_quiz", p["badges"])
        with self.assertRaises(ValueError):
            features.record_quiz(LID, "x", 9, 5)

    def test_streak_counts_consecutive_days(self):
        now = time.time()
        for d in (0, 1, 2, 4):
            storage.add_progress(LID, "tutor", ts=now - d * 86400)
        self.assertEqual(features.get_progress(LID)["streak"], 3)


class ProgressAndArenaTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        os.environ.pop("MOCK_FAIL_LARGE", None)
        storage.init(":memory:")
        self.gw = Gateway(rate=100, mock=True)

    def test_level_math(self):
        self.assertEqual(features.level_info(0), (1, 0, 40))
        self.assertEqual(features.level_info(39), (1, 39, 40))
        self.assertEqual(features.level_info(40), (2, 0, 60))
        self.assertEqual(features.level_info(100), (3, 0, 80))

    def test_week_map_and_timezone(self):
        now = time.time()
        storage.add_progress(LID, "tutor", ts=now)
        p = features.get_progress(LID, 0)
        self.assertEqual(len(p["week"]), 7)
        self.assertTrue(p["week"][p["today_index"]])
        self.assertEqual(sum(p["week"]), 1)
        self.assertEqual(p["streak"], 1)
        self.assertEqual(p["recent"][0]["kind"], "tutor")
        features.get_progress(LID, 99999)  # absurd offsets are clamped, never crash

    def test_best_by_topic_and_xp_include_arena(self):
        features.record_quiz(LID, "Derivatives", 3, 5)
        features.record_quiz(LID, "Derivatives", 5, 5)
        storage.add_progress(LID, "arena", topic="Derivatives", score=2, total=5)
        p = features.get_progress(LID)
        self.assertEqual(p["best_by_topic"]["Derivatives"], 100)
        self.assertEqual(p["xp"], 30 + 50 + 20)
        self.assertIn("arena", p["badges"])

    def test_document_flags(self):
        doc_id = storage.add_document(LID, "c.txt", TEXT, docs.chunk_text(TEXT))
        self.assertEqual(storage.list_documents(LID)[0]["has"], {"summary": False, "extract": False, "quiz": False})
        storage.save_analysis(doc_id, "summary", "en|beginner", {"summary": "x"})
        self.assertTrue(storage.list_documents(LID)[0]["has"]["summary"])

    async def test_arena_flow(self):
        a, b = "player-a-0001", "player-b-0002"
        res = await features.run_arena_create(self.gw, FakeJob(), a, {"nickname": "Aya", "topic": "Photosynthesis",
                                                                      "lang": "en", "n": 3})
        code = res["code"]
        self.assertEqual(len(code), 5)
        self.assertEqual(res["n"], 3)
        st = features.arena_state(a, code)
        self.assertNotIn("answer_index", st["questions"][0])  # answers are never sent before answering
        with self.assertRaises(PermissionError):
            features.arena_state(b, code)
        with self.assertRaises(LookupError):
            features.arena_join(b, "ZZZZZ", "Sami")
        with self.assertRaises(ValueError):
            features.arena_join(b, code.lower(), "   ")
        features.arena_join(b, code.lower(), "Sami")  # lower-case code is accepted
        # player b: wrong, right, right (mock answer is always index 1)
        r = features.arena_answer(b, code, 0, 3)
        self.assertFalse(r["correct"])
        self.assertEqual(r["answer_index"], 1)
        self.assertFalse(features.arena_answer(b, code, 0, 1)["correct"])  # a second try never rescoring
        features.arena_answer(b, code, 1, 1)
        last = features.arena_answer(b, code, 2, 1)
        self.assertTrue(last["done"])
        self.assertEqual(last["score"], 2)
        st = features.arena_state(b, code)
        self.assertTrue(st["finished"])
        self.assertEqual(st["players"][0]["nickname"], "Sami")  # ranked first with 2 points
        self.assertEqual(len(st["my_answers"]), 3)
        self.assertEqual(features.get_progress(b)["xp"], 20)  # arena points count as XP
        with self.assertRaises(ValueError):
            features.arena_answer(a, code, 9, 1)

    async def test_arena_full(self):
        res = await features.run_arena_create(self.gw, FakeJob(), "owner-0000001", {"nickname": "O", "topic": "x", "lang": "en", "n": 2})
        for i in range(features.MAX_PLAYERS - 1):
            features.arena_join(f"player-{i:07d}", res["code"], f"P{i}")
        with self.assertRaises(ValueError):
            features.arena_join("one-too-many-1", res["code"], "Late")

    async def test_course_folders(self):
        f = storage.create_folder(LID, "Algorithms")
        a = storage.add_document(LID, "lecture1.txt", TEXT, docs.chunk_text(TEXT), f["id"], "lecture")
        b = storage.add_document(LID, "ps1.txt", TEXT, docs.chunk_text(TEXT), f["id"], "problems")
        self.assertEqual(storage.list_folders(LID)[0]["count"], 2)
        self.assertEqual({d["kind"] for d in storage.list_documents(LID)}, {"lecture", "problems"})
        q = await features.run_quiz(self.gw, FakeJob(), LID, {"lang": "en", "n": 3, "folder_id": f["id"]})
        self.assertEqual(q["topic"], "Algorithms")
        t = await features.run_tutor(self.gw, FakeJob(), LID, {"mode": "ask", "message": "photosynthesis?", "history": [],
                                                              "hint_n": 1, "lang": "en", "folder_id": f["id"]})
        self.assertTrue(t["used_document"])
        # another learner cannot read this folder
        with self.assertRaises(ValueError):
            await features.run_quiz(self.gw, FakeJob(), "other-learner-1", {"lang": "en", "n": 3, "folder_id": f["id"]})
        g = storage.create_folder(LID, "Other")
        storage.move_document(a, g["id"], "other")
        self.assertEqual(storage.get_document(a)["folder_id"], g["id"])
        self.assertEqual(storage.default_folder(LID), storage.default_folder(LID))
        storage.delete_folder(f["id"])
        self.assertIsNone(storage.get_document(b))
        storage.delete_learner(LID)
        self.assertEqual(storage.list_folders(LID), [])

    def test_delete_learner_removes_everything(self):
        features.score_diagnostic(LID, [0, 0, 2, 3, 2], "beginner")
        doc_id = storage.add_document(LID, "c.txt", TEXT, docs.chunk_text(TEXT))
        features.record_quiz(LID, "t", 3, 5)
        storage.delete_learner(LID)
        self.assertEqual(storage.get_profile(LID), {})
        self.assertEqual(storage.list_documents(LID), [])
        self.assertEqual(storage.get_chunks(doc_id), [])
        self.assertEqual(storage.list_progress(LID), [])


class JobTests(unittest.IsolatedAsyncioTestCase):
    async def test_job_lifecycle(self):
        async def ok(job):
            job.stage = "generating"
            await asyncio.sleep(0.05)
            return {"x": 1}

        async def bad(job):
            raise GatewayError("boom")

        async def invalid(job):
            raise ValueError("nope")

        j = jobs.submit(ok)
        self.assertEqual(j.public()["state"], "running")
        await asyncio.sleep(0.2)
        self.assertEqual(j.public()["result"], {"x": 1})
        j2, j3 = jobs.submit(bad), jobs.submit(invalid)
        await asyncio.sleep(0.1)
        self.assertEqual(j2.public()["error"]["code"], "ai_unavailable")
        self.assertEqual(j3.public()["error"]["code"], "bad_request")


if __name__ == "__main__":
    unittest.main()
