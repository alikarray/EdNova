import React, { useState } from "react";
import { LANGS } from "./i18n.js";
import { api } from "./lib.js";
import { Logo, Nova, btnPrimary, inputCls } from "./ui.jsx";

const LEVELS = ["beginner", "intermediate", "advanced"];

export function Onboarding({ t, lid, lang, setLang, nick, setNick, onDone }) {
  const [step, setStep] = useState(-1);
  const [answers, setAnswers] = useState([]);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const total = t.qs.length;

  async function finish(level, ans) {
    setBusy(true); setErr(null);
    try {
      const p = await api("/api/diagnostic", { method: "POST", body: { learner_id: lid, answers: ans, level } });
      onDone(p);
    } catch (e) { setErr(e.message); setBusy(false); }
  }

  if (step === -1) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 via-white to-white">
        <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 py-10 text-center">
          <Nova className="h-28 w-28" />
          <div className="mt-4"><Logo t={t} /></div>
          <h1 className="mt-6 font-display text-3xl font-black tracking-tight text-slate-900">{t.tagline}</h1>
          <p className="mt-3 text-slate-600">{t.sub}</p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {LANGS.map((l) => (
              <button key={l.id} onClick={() => setLang(l.id)}
                className={"rounded-full border px-4 py-2 text-sm font-semibold " + (lang === l.id ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white text-slate-700")}>
                {l.label}
              </button>
            ))}
          </div>
          <div className="mt-6 w-full text-start">
            <label className="mb-1 block text-sm font-semibold text-slate-700" htmlFor="nick">{t.nick_label}</label>
            <input id="nick" value={nick} maxLength={20} onChange={(e) => setNick(e.target.value)} placeholder={t.nick_ph} className={inputCls} />
            <p className="mt-1 text-xs text-slate-500">{t.nick_help}</p>
          </div>
          <button onClick={() => setStep(0)} className={btnPrimary + " mt-6 w-full py-3.5 text-base"}>{t.start}</button>
        </div>
      </div>
    );
  }

  const isLevel = step === total;
  const q = isLevel ? { q: t.level_q, o: [t.beginner, t.intermediate, t.advanced] } : t.qs[step];

  function pick(i) {
    if (isLevel) { finish(LEVELS[i], answers); return; }
    const a = answers.slice(0, step); a[step] = i; setAnswers(a); setStep(step + 1);
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <div className="mx-auto max-w-lg px-6 py-10">
        <Logo t={t} small />
        <p className="mt-8 text-sm font-bold text-blue-700">{t.diag_title}</p>
        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-blue-100">
          <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: ((step + 1) / (total + 1)) * 100 + "%" }}></div>
        </div>
        <h2 className="mt-8 font-display text-2xl font-extrabold text-slate-900">{q.q}</h2>
        <div className="mt-6 space-y-3">
          {q.o.map((o, i) => (
            <button key={i} onClick={() => pick(i)} disabled={busy}
              className="w-full rounded-2xl border-2 border-slate-200 bg-white p-4 text-start font-medium text-slate-800 transition hover:border-blue-500 hover:bg-blue-50 disabled:opacity-60">
              {o}
            </button>
          ))}
        </div>
        {err && <p role="alert" className="mt-4 text-sm text-red-700">{err}</p>}
        {step > 0 && <button onClick={() => setStep(step - 1)} className="mt-6 text-sm text-slate-500">← {t.back}</button>}
      </div>
    </div>
  );
}
