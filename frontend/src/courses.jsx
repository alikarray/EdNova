import React, { useState, useEffect, useRef } from "react";
import { useRunner, fmt, api } from "./lib.js";
import { Icon, Loader, ErrorBox, MetaNote, Rich, PageHeader, Pill, cardCls, btnPrimary, btnGhost, inputCls } from "./ui.jsx";

export function UploadTile({ t, onUpload, uploading, className = "", label }) {
  return (
    <label className={"flex cursor-pointer flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-slate-300 bg-white p-6 text-center transition hover:border-blue-400 hover:bg-blue-50 " + className}>
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><Icon name="upload" className="h-6 w-6" /></span>
      <span className="font-display font-extrabold text-slate-900">{uploading ? t.uploading : label || t.import_course}</span>
      <span className="text-xs text-slate-500">{t.upload_hint}</span>
      <input type="file" accept=".pdf,.txt,.md" multiple className="hidden" disabled={uploading}
        onChange={(e) => { const fs = Array.from(e.target.files || []); if (fs.length) onUpload(fs); e.target.value = ""; }} />
    </label>
  );
}

const KINDS = ["lecture", "problems", "other"];

// "My courses": one folder per course. Lectures and problem sets are dropped inside a folder.
export function Courses({ t, folders, openFolder, createFolder, upErr }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  async function create() {
    const n = name.trim();
    if (!n || busy) return;
    setBusy(true);
    const f = await createFolder(n);
    setBusy(false);
    if (f) { setName(""); setAdding(false); openFolder(f.id); }
  }
  return (
    <div>
      <PageHeader icon="folder" title={t.courses_title} sub={t.courses_sub} />
      <div className="p-5 md:p-8">
        {upErr && <p role="alert" className="mb-4 rounded-2xl bg-red-50 p-3 text-sm text-red-700">{upErr}</p>}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {adding ? (
            <div className="flex flex-col justify-center gap-3 rounded-3xl border-2 border-blue-500 bg-white p-6">
              <label htmlFor="new-course" className="font-display font-extrabold text-slate-900">{t.new_course}</label>
              <input id="new-course" autoFocus value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder={t.course_name_ph}
                onKeyDown={(e) => { if (e.key === "Enter") create(); if (e.key === "Escape") setAdding(false); }} className={inputCls} />
              <div className="flex gap-2">
                <button className={btnPrimary + " flex-1"} disabled={!name.trim() || busy} onClick={create}>{t.create}</button>
                <button className={btnGhost} onClick={() => setAdding(false)}>{t.cancel}</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setAdding(true)} data-testid="new-course"
              className="flex flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-slate-300 bg-white p-6 text-center transition hover:border-blue-400 hover:bg-blue-50">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><Icon name="plus" className="h-6 w-6" /></span>
              <span className="font-display font-extrabold text-slate-900">{t.new_course}</span>
              <span className="text-xs text-slate-500">{t.new_course_hint}</span>
            </button>
          )}
          {folders.map((f) => (
            <button key={f.id} onClick={() => openFolder(f.id)} className="overflow-hidden rounded-3xl border border-slate-200 bg-white text-start transition hover:border-blue-400 hover:shadow-md">
              <div className="grid-pattern flex h-28 items-center justify-center bg-blue-50">
                <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-blue-600 shadow-sm"><Icon name="folder" className="h-8 w-8" /></span>
              </div>
              <div className="p-4">
                <p className="truncate font-bold text-slate-900">{f.name}</p>
                <p className="mt-1 text-xs text-slate-500">{fmt(t.files_n, { n: f.count })}</p>
              </div>
            </button>
          ))}
        </div>
        {folders.length === 0 && <p className="mt-6 text-sm text-slate-500">{t.no_docs}</p>}
      </div>
    </div>
  );
}

// Inside one course: the files, an upload box (choose lecture / problem set), and whole-course actions.
export function FolderView({ t, folder, docs, openCourse, openFolderQuiz, go, startCoach, onUpload, uploading, upErr, renameFolder, deleteFolder }) {
  const [kind, setKind] = useState("lecture");
  const [confirm, setConfirm] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(folder.name);
  const mine = docs.filter((d) => d.folder_id === folder.id);
  const has = mine.length > 0;
  async function saveName() { if (name.trim() && name.trim() !== folder.name) await renameFolder(folder.id, name.trim()); setEditing(false); }
  return (
    <div>
      <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4 text-sm md:px-8">
        <button onClick={() => go("courses")} className="flex items-center gap-1 font-semibold text-slate-500 hover:text-slate-800"><Icon name="back" className="h-4 w-4 rtl:rotate-180" />{t.courses_title}</button>
        <span className="text-slate-300">/</span>
        <span className="truncate font-semibold text-slate-800">{folder.name}</span>
      </div>
      <div className="mx-auto max-w-2xl space-y-5 p-5 md:p-8">
        <div className="flex items-center gap-2">
          {editing ? (
            <input autoFocus value={name} maxLength={60} onChange={(e) => setName(e.target.value)} onBlur={saveName} onKeyDown={(e) => { if (e.key === "Enter") saveName(); }} className={inputCls + " text-xl font-bold"} aria-label={t.rename} />
          ) : (
            <>
              <h1 className="min-w-0 flex-1 truncate font-display text-2xl font-black text-slate-900">{folder.name}</h1>
              <button onClick={() => { setName(folder.name); setEditing(true); }} aria-label={t.rename} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Icon name="edit" className="h-4 w-4" /></button>
            </>
          )}
        </div>

        {has && (
          <div className="flex flex-wrap gap-2">
            <button className={btnPrimary} onClick={() => openFolderQuiz(folder.id)}><Icon name="check" className="h-4 w-4" />{t.quiz_course}</button>
            <button className={btnGhost} onClick={() => startCoach(null, "f:" + folder.id)}><Icon name="chat" className="h-4 w-4" />{t.ask_course}</button>
            <button className={btnGhost} onClick={() => go("arena", { scope: "f:" + folder.id })}><Icon name="users" className="h-4 w-4" />{t.chip_arena}</button>
          </div>
        )}

        <div className={cardCls + " shadow-sm"}>
          <p className="mb-3 font-display font-extrabold text-slate-900">{t.files_word}</p>
          {!has && <p className="text-sm text-slate-500">{t.folder_empty}</p>}
          <div className="divide-y divide-slate-100">
            {mine.map((d) => (
              <button key={d.id} onClick={() => openCourse(d.id)} className="flex w-full items-center gap-3 py-3 text-start">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600"><Icon name="file" className="h-4 w-4" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-slate-800">{d.name}</span>
                  <span className="block text-xs text-slate-500">{t["kind_" + (d.kind || "lecture")]} · {fmt(t.read_min, { n: Math.max(1, Math.round(d.chars / 1200)) })}</span>
                </span>
                {d.has.summary && <Pill tone="green">{t.lesson}</Pill>}
                {d.has.quiz && <Pill tone="blue">{t.quiz_word}</Pill>}
                <Icon name="arrow" className="h-4 w-4 text-slate-400 rtl:rotate-180" />
              </button>
            ))}
          </div>
        </div>

        <div className={cardCls + " space-y-3 shadow-sm"}>
          <p className="font-display font-extrabold text-slate-900">{t.add_file}</p>
          <div className="inline-flex rounded-full bg-slate-100 p-0.5 text-xs font-bold" role="group" aria-label={t.file_type}>
            {KINDS.map((k) => (
              <button key={k} type="button" onClick={() => setKind(k)} aria-pressed={kind === k} className={"rounded-full px-3 py-1.5 " + (kind === k ? "bg-white text-blue-700 shadow-sm" : "text-slate-500")}>{t["kind_" + k]}</button>
            ))}
          </div>
          <UploadTile t={t} uploading={uploading} label={t.import_files} onUpload={(fs) => onUpload(fs, folder.id, kind)} />
          {upErr && <p role="alert" className="text-sm text-red-700">{upErr}</p>}
        </div>

        <div className="pt-2 text-center">
          {!confirm
            ? <button className="text-sm text-slate-400 underline" onClick={() => setConfirm(true)}>{t.delete_course}</button>
            : <button className="text-sm font-bold text-red-600 underline" onClick={() => deleteFolder(folder.id)}>{t.confirm_again}</button>}
        </div>
      </div>
    </div>
  );
}

function Flashcards({ t, data }) {
  const cards = [
    ...data.definitions.map((d) => ({ front: d.term, back: d.definition })),
    ...data.formulas.map((f) => ({ front: f.expression, back: f.meaning, mono: true })),
  ];
  const [i, setI] = useState(0);
  const [flip, setFlip] = useState(false);
  if (cards.length === 0) return <p className="text-sm text-slate-500">{t.no_cards}</p>;
  const c = cards[i];
  const go = (d) => { setI((i + d + cards.length) % cards.length); setFlip(false); };
  return (
    <div>
      <button onClick={() => setFlip(!flip)} aria-label={t.flip}
        className="flex min-h-[12rem] w-full flex-col items-center justify-center rounded-3xl border-2 border-blue-200 bg-blue-50 p-6 text-center transition hover:border-blue-400">
        <span className="mb-2 text-xs font-bold uppercase tracking-wide text-blue-500">{flip ? t.answer_side : t.term_side}</span>
        <span className={"text-xl font-extrabold text-slate-900 " + (c.mono && !flip ? "font-mono" : "")}>{flip ? c.back : c.front}</span>
        <span className="mt-4 text-xs text-slate-500">{t.tap_flip}</span>
      </button>
      <div className="mt-3 flex items-center justify-between">
        <button className={btnGhost} onClick={() => go(-1)}><Icon name="back" className="h-4 w-4 rtl:rotate-180" /></button>
        <span className="text-sm font-semibold text-slate-500 tabular-nums">{i + 1} / {cards.length}</span>
        <button className={btnGhost} onClick={() => go(1)}><Icon name="arrow" className="h-4 w-4 rtl:rotate-180" /></button>
      </div>
    </div>
  );
}

export function CourseView({ t, lid, lang, doc, folder, folders, prog, auto, reloadDocs, bump, openQuiz, go, openFolder, onDelete, startCoach }) {
  const { run, st, error, clearError } = useRunner();
  const [out, setOut] = useState(null);
  const [step, setStep] = useState(auto === "quiz" ? "quiz" : "summary");
  const [confirm, setConfirm] = useState(false);
  const started = useRef(false);
  const best = prog && prog.best_by_topic ? prog.best_by_topic[doc.name.slice(0, 60)] : undefined;

  async function doSummary(fresh) {
    setOut(null);
    const r = await run(`/api/docs/${doc.id}/summary`, { learner_id: lid, lang, fresh: !!fresh });
    if (r) { setOut({ kind: "summary", data: r }); setStep("quiz"); reloadDocs(); bump(); }
  }
  async function doExtract(kind) {
    setOut(null);
    const r = await run(`/api/docs/${doc.id}/extract`, { learner_id: lid, lang, fresh: false });
    if (r) { setOut({ kind, data: r }); reloadDocs(); }
  }
  async function doQuiz(fresh) {
    setOut(null);
    const r = await run("/api/quiz", { learner_id: lid, doc_id: doc.id, n: 5, lang, fresh: !!fresh });
    if (r) { reloadDocs(); openQuiz({ questions: r.questions, topic: r.topic }); }
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (auto === "summary") doSummary(false);
    if (auto === "quiz") doQuiz(false);
  }, []);

  const rowCls = (k) => "flex w-full items-center gap-3 rounded-2xl border-2 p-4 text-start transition " + (step === k ? "border-blue-500 bg-blue-50" : "border-slate-200 bg-white hover:bg-slate-50");

  return (
    <div>
      <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4 text-sm md:px-8">
        <button onClick={() => go("courses")} className="flex items-center gap-1 font-semibold text-slate-500 hover:text-slate-800"><Icon name="back" className="h-4 w-4 rtl:rotate-180" />{t.courses_title}</button>
        {folder && <><span className="text-slate-300">/</span><button onClick={() => openFolder(folder.id)} className="max-w-[10rem] truncate font-semibold text-slate-500 hover:text-slate-800">{folder.name}</button></>}
        <span className="text-slate-300">/</span>
        <span className="truncate font-semibold text-slate-800">{doc.name}</span>
      </div>
      <div className="mx-auto max-w-2xl space-y-5 p-5 md:p-8">
        <h1 className="font-display text-2xl font-black text-slate-900">{doc.name}</h1>

        <div className={cardCls + " space-y-3 shadow-sm"}>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{t.recommended_path}</p>
          <button className={rowCls("summary")} onClick={() => setStep("summary")}>
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700"><Icon name="book" /></span>
            <span className="flex-1"><span className="block font-bold text-slate-900">{t.lesson}</span>
              <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-slate-200"><span className="block h-full rounded-full bg-green-500" style={{ width: doc.has.summary ? "100%" : "0%" }}></span></span></span>
            <span className="text-sm font-semibold text-slate-500">{doc.has.summary ? "1/1" : "0/1"}</span>
          </button>
          <button className={rowCls("quiz")} onClick={() => setStep("quiz")}>
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-700"><Icon name="check" /></span>
            <span className="flex-1"><span className="block font-bold text-slate-900">{t.quiz_word}</span>
              <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-slate-200"><span className="block h-full rounded-full bg-green-500" style={{ width: (best || 0) + "%" }}></span></span></span>
            <span className="text-sm font-semibold text-slate-500">{best === undefined ? "0%" : best + "%"}</span>
          </button>
          <button className={btnPrimary + " w-full py-3.5 text-base"} disabled={!!st}
            onClick={() => (step === "summary" ? doSummary(false) : doQuiz(false))}>
            <Icon name="play" className="h-4 w-4" filled />{step === "summary" ? t.start_lesson : t.start_quiz}
          </button>
          {step === "quiz" && doc.has.quiz && <button className="w-full text-center text-sm font-semibold text-blue-700" disabled={!!st} onClick={() => doQuiz(true)}>{t.new_questions}</button>}
        </div>

        <div className={cardCls + " shadow-sm"}>
          <p className="mb-3 font-display font-extrabold text-slate-900">{t.review_differently}</p>
          <div className="divide-y divide-slate-100">
            {[
              ["extract", "file", t.extract, () => doExtract("extract")],
              ["cards", "cards", t.flashcards, () => doExtract("cards")],
              ["coach", "chat", t.ask_coach, () => startCoach(null, "d:" + doc.id)],
              ["teach", "cap", t.chip_teach, () => go("teach", { docId: "d:" + doc.id })],
            ].map(([k, icon, label, fn]) => (
              <button key={k} onClick={fn} disabled={!!st} className="flex w-full items-center gap-3 py-3 text-start disabled:opacity-50">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600"><Icon name={icon} className="h-4 w-4" /></span>
                <span className="flex-1 font-semibold text-slate-800">{label}</span>
                <Icon name="arrow" className="h-4 w-4 text-slate-400 rtl:rotate-180" />
              </button>
            ))}
          </div>
        </div>

        <Loader st={st} t={t} />
        <ErrorBox error={error} t={t} onClose={clearError} />

        {out && out.kind === "summary" && (
          <div className={cardCls + " space-y-3"}>
            <h2 className="font-display text-lg font-extrabold text-slate-900">{t.lesson}</h2>
            <Rich text={out.data.summary} />
            <MetaNote meta={out.data.meta} t={t} />
            <button className="text-sm font-semibold text-blue-700" disabled={!!st} onClick={() => doSummary(true)}>{t.regen}</button>
          </div>
        )}
        {out && out.kind === "extract" && (
          <div className={cardCls + " space-y-5"}>
            <div>
              <h2 className="mb-2 font-display text-lg font-extrabold text-slate-900">{t.defs}</h2>
              <div className="space-y-2 text-sm">
                {out.data.definitions.length === 0 && <p className="text-slate-500">{t.no_cards}</p>}
                {out.data.definitions.map((d, i) => <div key={i} className="rounded-2xl bg-slate-50 p-3"><b>{d.term}</b>: {d.definition}</div>)}
              </div>
            </div>
            <div>
              <h2 className="mb-2 font-display text-lg font-extrabold text-slate-900">{t.formulas}</h2>
              <div className="space-y-2 text-sm">
                {out.data.formulas.length === 0 && <p className="text-slate-500">{t.no_cards}</p>}
                {out.data.formulas.map((f, i) => <div key={i} className="rounded-2xl bg-blue-50 p-3"><code className="font-mono font-bold">{f.expression}</code><br />{f.meaning}</div>)}
              </div>
            </div>
            <MetaNote meta={out.data.meta} t={t} />
          </div>
        )}
        {out && out.kind === "cards" && <div className={cardCls}><Flashcards t={t} data={out.data} /><div className="mt-3"><MetaNote meta={out.data.meta} t={t} /></div></div>}

        {folders && folders.length > 1 && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-500">{t.move_to}</span>
            <select value={doc.folder_id || ""} aria-label={t.move_to} onChange={async (e) => { await api(`/api/docs/${doc.id}/move`, { method: "POST", body: { learner_id: lid, folder_id: e.target.value } }); reloadDocs(); }}
              className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">
              {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
        )}

        <div className="pt-2 text-center">
          {!confirm
            ? <button className="text-sm text-slate-400 underline" onClick={() => setConfirm(true)}>{t.remove_course}</button>
            : <button className="text-sm font-bold text-red-600 underline" onClick={onDelete}>{t.confirm_again}</button>}
        </div>
      </div>
    </div>
  );
}
