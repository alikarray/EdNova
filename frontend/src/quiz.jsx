import React, { useState, useEffect, useRef } from "react";
import { api, fmt } from "./lib.js";
import { Icon, btnPrimary, btnGhost, Pill } from "./ui.jsx";

const LETTERS = ["A", "B", "C", "D"];

// Full-screen quiz (solo or shared "arena"). Arena answers are checked and scored by the server.
export function QuizScreen({ t, lid, questions, topic, mode = "solo", code, initial, timerSecs = 0, onClose }) {
  const n = questions.length;
  const startIndex = initial && initial.index ? initial.index : 0;
  const [phase, setPhase] = useState(startIndex > 0 ? "play" : "intro");
  const [count, setCount] = useState(3);
  const [i, setI] = useState(startIndex);
  const [pick, setPick] = useState(null);
  const [fb, setFb] = useState(null);
  const [results, setResults] = useState(initial && initial.results ? initial.results : Array(n).fill(null));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [final, setFinal] = useState(null);
  const [board, setBoard] = useState(null);

  useEffect(() => {
    if (phase !== "intro") return undefined;
    if (count <= 0) { setPhase("play"); return undefined; }
    const id = setTimeout(() => setCount((c) => c - 1), 900);
    return () => clearTimeout(id);
  }, [phase, count]);

  useEffect(() => {
    if (phase !== "done" || mode !== "arena") return undefined;
    let alive = true;
    const load = () => api(`/api/arena/${code}?learner_id=${lid}`).then((s) => { if (alive) setBoard(s.players); }).catch(() => {});
    load();
    const id = setInterval(load, 3000);
    return () => { alive = false; clearInterval(id); };
  }, [phase]);

  const q = questions[i];
  const useTimer = mode === "solo" && timerSecs > 0;
  const [left, setLeft] = useState(timerSecs);
  const pickRef = useRef(null);
  const checkRef = useRef(null);
  pickRef.current = pick;

  // Per-question countdown (solo quizzes, by level). When time is up the chosen option is graded, or the question counts as missed.
  useEffect(() => {
    if (!useTimer || phase !== "play" || fb) return undefined;
    const end = Date.now() + timerSecs * 1000;
    setLeft(timerSecs);
    const id = setInterval(() => {
      const l = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      setLeft(l);
      if (l <= 0) {
        clearInterval(id);
        if (pickRef.current !== null) { if (checkRef.current) checkRef.current(); return; }
        setFb({ correct: false, answer_index: q.answer_index, explanation: q.explanation || "", timeout: true });
        setResults((r) => { const c = r.slice(); c[i] = false; return c; });
      }
    }, 250);
    return () => clearInterval(id);
  }, [phase, i, fb === null]);

  async function check() {
    if (pick === null || busy || fb) return;
    setBusy(true); setErr(null);
    try {
      let f;
      if (mode === "arena") {
        f = await api(`/api/arena/${code}/answer`, { method: "POST", body: { learner_id: lid, q: i, choice: pick } });
      } else {
        f = { correct: pick === q.answer_index, answer_index: q.answer_index, explanation: q.explanation || "" };
      }
      setFb(f);
      setResults((r) => { const c = r.slice(); c[i] = f.correct; return c; });
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  checkRef.current = check;

  async function next() {
    if (i + 1 < n) { setI(i + 1); setPick(null); setFb(null); return; }
    const score = results.filter((x) => x === true).length;
    if (mode === "solo") {
      try {
        const r = await api("/api/quiz/result", { method: "POST", body: { learner_id: lid, topic, score, total: n } });
        setFinal({ score, ...r });
      } catch (e) { setFinal({ score, xp_gained: score * 10 }); }
    } else {
      setFinal({ score, xp_gained: score * 10 });
    }
    setPhase("done");
  }

  if (phase === "intro") {
    return (
      <div className="fixed inset-0 z-50 flex cursor-pointer flex-col items-center justify-center bg-blue-600 text-white" onClick={() => setPhase("play")}>
        <p className="font-display text-5xl font-black">{t.ready}</p>
        <div className="mt-4 flex gap-2">
          <span className="keep-white rounded-full bg-white px-3 py-1 text-sm font-bold text-blue-700">{fmt(t.n_questions, { n })}</span>
          <span className="rounded-full bg-amber-300 px-3 py-1 text-sm font-bold text-amber-900">{n * 10}+ XP</span>
        </div>
        <div className="mt-8 flex h-44 w-44 items-center justify-center rounded-full border-8 border-blue-300 keep-white bg-white font-display text-7xl font-black text-blue-600">
          {count > 0 ? count : "✓"}
        </div>
        <p className="mt-10 text-sm font-semibold opacity-90">{t.tap_start}</p>
        <button onClick={(e) => { e.stopPropagation(); onClose(); }} aria-label={t.close} className="absolute end-4 top-4 rounded-full bg-white/20 p-2 hover:bg-white/30"><Icon name="x" /></button>
      </div>
    );
  }

  if (phase === "done") {
    const score = final ? final.score : 0;
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-gradient-to-b from-blue-50 to-white">
        <div className="mx-auto flex min-h-full max-w-md flex-col items-center justify-center px-6 py-10 text-center">
          <p className="text-sm font-bold text-slate-500">{topic}</p>
          <p className="mt-2 text-sm font-semibold text-slate-500">{t.score_is}</p>
          <p className="my-2 font-display text-7xl font-black text-blue-600">{score}/{n}</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Pill tone="amber">+{final ? final.xp_gained : 0} XP</Pill>
            {final && final.level_changed === "up" && <Pill tone="green">🚀 {t.level_up}</Pill>}
            {final && final.level_changed === "down" && <Pill>{t.level_down}</Pill>}
          </div>
          <div className="mt-5 flex gap-1.5">
            {results.map((r, k) => <span key={k} className={"h-3 w-10 rounded-full " + (r ? "bg-green-500" : "bg-red-400")}></span>)}
          </div>
          {mode === "arena" && board && (
            <div className="mt-8 w-full rounded-3xl border border-slate-200 bg-white p-4 text-start">
              <p className="mb-2 font-display font-extrabold text-slate-900">{t.ranking}</p>
              {board.map((p, k) => (
                <div key={k} className={"flex items-center gap-3 rounded-xl px-3 py-2 text-sm " + (p.you ? "bg-blue-50 font-bold" : "")}>
                  <span className="w-5 text-slate-500">{k + 1}</span>
                  <span className="flex-1 truncate">{p.nickname}{p.you ? " (" + t.you + ")" : ""}</span>
                  <span className="tabular-nums">{p.score}/{n}</span>
                  {!p.done && <span className="text-xs text-slate-400">…</span>}
                </div>
              ))}
            </div>
          )}
          <button className={btnPrimary + " mt-8 px-8"} onClick={onClose}>{t.back_home}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 md:px-8">
        <div className="flex flex-1 gap-2">
          {questions.map((_, k) => (
            <span key={k} className={"h-3 flex-1 rounded-full " + (results[k] === true ? "bg-green-500" : results[k] === false ? "bg-red-400" : k === i ? "bg-blue-300 ring-2 ring-blue-500" : "bg-slate-200")}></span>
          ))}
        </div>
        {useTimer && !fb && <span data-testid="quiz-timer" className={"flex items-center gap-1 rounded-full px-3 py-1 text-sm font-bold tabular-nums " + (left <= 5 ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-700")}><Icon name="clock" className="h-4 w-4" />{left}{t.seconds}</span>}
        <span className="rounded-full bg-blue-600 px-3 py-1 text-sm font-bold text-white tabular-nums">{i + 1}/{n}</span>
        <span className="hidden rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700 sm:inline">{t.mcq}</span>
        <button onClick={onClose} aria-label={t.close} className="rounded-full border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"><Icon name="x" /></button>
      </div>
      {useTimer && !fb && (
        <div className="h-1.5 w-full bg-slate-100" aria-hidden="true">
          <div data-testid="quiz-timer-bar" className={"h-full transition-all duration-300 ease-linear " + (left <= 5 ? "bg-red-500" : left <= 10 ? "bg-amber-400" : "bg-blue-600")} style={{ width: (left / timerSecs) * 100 + "%" }}></div>
        </div>
      )}
      <div className="flex flex-1 overflow-hidden">
        <aside className="hidden w-60 shrink-0 border-e border-slate-100 p-4 md:block">
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">{t.question_list}</p>
          <div className="space-y-1">
            {questions.map((_, k) => (
              <div key={k} className={"flex items-center gap-2 rounded-xl px-3 py-2 text-sm " + (k === i ? "bg-slate-100 font-semibold" : "text-slate-600")}>
                <span className={"flex h-5 w-5 items-center justify-center rounded-full border-2 text-[10px] " + (results[k] === true ? "border-green-500 bg-green-500 text-white" : results[k] === false ? "border-red-400 bg-red-400 text-white" : "border-blue-400")}>
                  {results[k] === true ? "✓" : results[k] === false ? "✗" : ""}
                </span>
                {fmt(t.question_n, { n: k + 1 })}
              </div>
            ))}
          </div>
        </aside>
        <main className="flex-1 overflow-y-auto px-4 py-8">
          <div className="mx-auto max-w-xl">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">{topic}</p>
              <h2 className="font-display text-xl font-extrabold leading-snug text-slate-900">{q.question}</h2>
            </div>
            <div className="mt-5 space-y-3">
              {q.options.map((o, k) => {
                let cls = "border-slate-200 bg-white hover:border-blue-400";
                if (fb) cls = k === fb.answer_index ? "border-green-500 bg-green-50" : k === pick ? "border-red-400 bg-red-50" : "border-slate-200 bg-white opacity-70";
                else if (pick === k) cls = "border-blue-600 bg-blue-50";
                return (
                  <button key={k} disabled={!!fb || busy} onClick={() => setPick(k)}
                    className={"flex w-full items-center gap-3 rounded-2xl border-2 p-4 text-start text-sm font-medium text-slate-800 transition " + cls}>
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-600">{LETTERS[k]}</span>
                    <span>{o}</span>
                  </button>
                );
              })}
            </div>
            {fb && (
              <div className={"mt-5 rounded-2xl p-4 text-sm " + (fb.correct ? "bg-green-50 text-green-900" : "bg-amber-50 text-amber-900")}>
                <b>{fb.timeout ? t.time_up : fb.correct ? t.right_answer : t.wrong_answer}</b> {fb.explanation}
              </div>
            )}
            {err && <p role="alert" className="mt-4 text-sm text-red-700">{err}</p>}
            <div className="mt-6">
              {!fb
                ? <button className={btnPrimary + " w-full py-3.5"} disabled={pick === null || busy} onClick={check}>{t.check}</button>
                : <button className={btnPrimary + " w-full py-3.5"} onClick={next}>{i + 1 < n ? t.next : t.finish_quiz}</button>}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
