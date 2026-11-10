import { StudyCard, PlanCard } from "./cards.jsx";
import React, { useState } from "react";
import { fmt } from "./lib.js";
import { Icon, Nova, cardCls, btnPrimary, btnGhost } from "./ui.jsx";

function WeekCard({ t, prog }) {
  const week = prog ? prog.week : Array(7).fill(false);
  const today = prog ? prog.today_index : -1;
  return (
    <div className={cardCls}>
      <div className="flex items-center justify-between">
        <h3 className="font-display font-extrabold text-slate-900">{t.my_week}</h3>
        <span className="flex items-center gap-1 text-sm font-semibold text-slate-600">
          <Icon name="flame" className="h-4 w-4 text-orange-500" />{fmt(t.streak_days, { n: prog ? prog.streak : 0 })}
        </span>
      </div>
      <div className="mt-4 grid grid-cols-7 gap-1 text-center">
        {t.days.map((d, i) => (
          <div key={i}>
            <div className="text-xs font-bold text-slate-400">{d}</div>
            <div className={"mx-auto mt-2 flex h-9 w-9 items-center justify-center rounded-full " + (week[i] ? "bg-blue-600 text-white" : i === today ? "border-2 border-blue-500 text-blue-600" : "bg-slate-100")}>
              {week[i] ? <Icon name="check" className="h-4 w-4" /> : i === today ? <Icon name="cap" className="h-4 w-4" /> : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LevelCard({ t, prog }) {
  const lvl = prog ? prog.level_num : 1, into = prog ? prog.xp_into : 0, need = prog ? prog.xp_need : 40;
  return (
    <div className={cardCls}>
      <div className="flex items-baseline justify-between">
        <h3 className="font-display font-extrabold text-slate-900">{fmt(t.level_n, { n: lvl })}</h3>
        <span className="text-sm font-semibold text-slate-500 tabular-nums">{into} / {need} XP</span>
      </div>
      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: Math.max(2, (into / need) * 100) + "%" }}></div>
      </div>
    </div>
  );
}

function ResumeCard({ t, prog, go }) {
  const last = prog && prog.recent && prog.recent[0];
  const target = last ? ({ tutor: "coach", quiz: "practice", peer: "teach", arena: "arena" }[last.kind] || "coach") : null;
  return (
    <div className={cardCls}>
      <h3 className="font-display font-extrabold text-slate-900">{t.resume}</h3>
      {last ? (
        <button onClick={() => go(target)} className="mt-3 flex w-full items-center gap-3 rounded-2xl border border-slate-200 p-3 text-start hover:bg-slate-50">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><Icon name={{ tutor: "chat", quiz: "check", peer: "cap", arena: "users" }[last.kind] || "chat"} className="h-4 w-4" /></span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold text-slate-800">{last.topic || t["kind_" + last.kind]}</span>
            <span className="block text-xs text-slate-500">{t["kind_" + last.kind]}</span>
          </span>
          <Icon name="arrow" className="h-4 w-4 text-slate-400 rtl:rotate-180" />
        </button>
      ) : (
        <div className="mt-3 rounded-2xl border border-dashed border-slate-300 p-4">
          <p className="text-sm font-semibold text-slate-700">{t.resume_empty}</p>
          <p className="mt-1 text-xs text-slate-500">{t.resume_empty_sub}</p>
        </div>
      )}
    </div>
  );
}

export function Home({ t, nick, docs, prog, go, openCourse, startCoach, onUpload, uploading, upErr, plan, study }) {
  const [text, setText] = useState("");
  const [pickId, setPickId] = useState("");
  const [step, setStep] = useState(null);
  const doc = docs.find((d) => d.id === pickId) || docs[0];
  const nextStep = doc ? (!doc.has.summary ? "summary" : !doc.has.quiz ? "quiz" : "summary") : null;
  const chosen = step || nextStep;

  function submit(e) {
    e.preventDefault();
    if (text.trim()) startCoach(text.trim());
  }

  return (
    <div className="p-5 md:p-8 lg:flex lg:gap-6">
      <div className="min-w-0 flex-1">
        <h1 className="font-display text-3xl font-black tracking-tight text-slate-900">{nick ? fmt(t.hello_nick, { n: nick }) : t.hello_anon}</h1>
        <div className="mt-3"><Nova className="h-32 w-32" /></div>

        <form onSubmit={submit} className="mt-2 flex items-center gap-2 rounded-full border-2 border-slate-200 bg-white py-1.5 ps-5 pe-1.5 shadow-sm focus-within:border-blue-500">
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder={t.home_ph} aria-label={t.home_ph}
            className="min-w-0 flex-1 bg-transparent py-2 text-sm text-slate-800 outline-none placeholder:text-slate-400" />
          <button type="submit" disabled={!text.trim()} aria-label={t.send}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-white transition hover:bg-blue-700 disabled:opacity-40"><Icon name="send" /></button>
        </form>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className={btnGhost} onClick={() => go("practice")}><Icon name="check" className="h-4 w-4" />{t.chip_quiz}</button>
          <button className={btnGhost} onClick={() => go("teach")}><Icon name="cap" className="h-4 w-4" />{t.chip_teach}</button>
          <button className={btnGhost} onClick={() => go("arena")}><Icon name="users" className="h-4 w-4" />{t.chip_arena}</button>
        </div>

        <label className="mt-4 flex cursor-pointer items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm font-bold text-slate-800 transition hover:bg-slate-50">
          <Icon name="upload" className="h-5 w-5 text-blue-600" />{uploading ? t.uploading : t.import_course}
          <input type="file" accept=".pdf,.txt,.md" className="hidden" disabled={uploading} onChange={(e) => { const f = e.target.files && e.target.files[0]; if (f) onUpload(f); e.target.value = ""; }} />
        </label>
        {upErr && <p role="alert" className="mt-2 text-sm text-red-700">{upErr}</p>}

        <div className="mt-4 rounded-2xl bg-gradient-to-r from-indigo-100 to-blue-100 px-4 py-3 text-sm font-semibold text-indigo-900">
          {prog ? t[prog.motivation] : ""}
        </div>

        <div className="mt-5 rounded-3xl border-2 border-blue-500 bg-white p-5 shadow-sm">
          <p className="font-display text-lg font-extrabold text-slate-900">{t.chosen_today}</p>
          {doc ? (
            <>
              <div className="mt-3 flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><Icon name="file" /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{t.course_word}</p>
                  <p className="truncate font-bold text-slate-900">{doc.name}</p>
                </div>
                {docs.length > 1 && (
                  <select value={doc.id} onChange={(e) => { setPickId(e.target.value); setStep(null); }} aria-label={t.change}
                    className="max-w-[9rem] rounded-full border border-blue-200 bg-white px-3 py-1.5 text-xs font-bold text-blue-700">
                    {docs.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                )}
              </div>
              <div className="mt-4 divide-y divide-slate-100 rounded-2xl border border-slate-100">
                {[["summary", "book", t.lesson], ["quiz", "check", t.quiz_word]].map(([k, icon, label]) => (
                  <button key={k} onClick={() => setStep(k)} className="flex w-full items-center gap-3 px-3 py-3 text-start">
                    <span className={"flex h-6 w-6 items-center justify-center rounded-full border-2 " + (doc.has[k] ? "border-green-500 bg-green-500 text-white" : chosen === k ? "border-blue-600" : "border-slate-300")}>
                      {doc.has[k] ? <Icon name="check" className="h-3.5 w-3.5" /> : chosen === k ? <span className="h-2.5 w-2.5 rounded-full bg-blue-600"></span> : null}
                    </span>
                    <Icon name={icon} className="h-5 w-5 text-slate-500" />
                    <span className="flex-1 font-semibold text-slate-800">{label}</span>
                  </button>
                ))}
              </div>
              <button className={btnPrimary + " mt-4 w-full py-3.5 text-base"} onClick={() => openCourse(doc.id, chosen)}>{t.start_session}</button>
            </>
          ) : (
            <div className="mt-3">
              <p className="text-sm text-slate-600">{t.no_docs}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button className={btnPrimary} onClick={() => go("practice")}>{t.chip_quiz}</button>
                <button className={btnGhost} onClick={() => go("coach")}>{t.nav_coach}</button>
              </div>
            </div>
          )}
        </div>
      </div>

      <aside className="mt-6 w-full shrink-0 space-y-4 lg:mt-0 lg:w-80">
        <PlanCard t={t} plan={plan} go={go} />
        <StudyCard t={t} study={study} goalMin={plan ? plan.minutes : 30} />
        <WeekCard t={t} prog={prog} />
        <LevelCard t={t} prog={prog} />
        <ResumeCard t={t} prog={prog} go={go} />
      </aside>
    </div>
  );
}
