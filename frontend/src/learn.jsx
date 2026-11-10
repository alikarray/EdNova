import React, { useState } from "react";
import { useRunner } from "./lib.js";
import { Icon, Loader, ErrorBox, MetaNote, Rich, PageHeader, ScopeSelect, scopeBody, cardCls, btnPrimary, inputCls } from "./ui.jsx";

export function Practice({ t, lid, lang, docs, folders, scope0, openQuiz }) {
  const [topic, setTopic] = useState("");
  const [scope, setScope] = useState(scope0 || "");
  const { run, st, error, clearError } = useRunner();
  async function make() {
    const r = await run("/api/quiz", { learner_id: lid, topic: scope ? null : topic.trim(), n: 5, lang, fresh: true, ...scopeBody(scope) });
    if (r) openQuiz({ questions: r.questions, topic: r.topic });
  }
  return (
    <div>
      <PageHeader icon="check" title={t.practice_title} sub={t.practice_sub} />
      <div className="mx-auto max-w-xl space-y-4 p-5 md:p-8">
        <div className={cardCls + " space-y-3"}>
          <ScopeSelect t={t} docs={docs} folders={folders} value={scope} onChange={setScope} className="w-full py-3" />
          <input value={topic} onChange={(e) => setTopic(e.target.value)} disabled={!!scope} placeholder={t.topic_ph} aria-label={t.topic_ph} className={inputCls + " disabled:opacity-50"}
            onKeyDown={(e) => { if (e.key === "Enter" && (topic.trim() || scope) && !st) make(); }} />
          <button className={btnPrimary + " w-full py-3.5"} disabled={!!st || (!topic.trim() && !scope)} onClick={make}>{t.make_quiz}</button>
        </div>
        <Loader st={st} t={t} />
        <ErrorBox error={error} t={t} onClose={clearError} />
      </div>
    </div>
  );
}

export function Teach({ t, lid, lang, docs, folders, docId0, bump }) {
  const [topic, setTopic] = useState("");
  const [text, setText] = useState("");
  const [docId, setDocId] = useState(docId0 || "");
  const [res, setRes] = useState(null);
  const { run, st, error, clearError } = useRunner();
  async function go() {
    setRes(null);
    const r = await run("/api/peer", { learner_id: lid, topic: topic.trim(), explanation: text.trim(), lang, ...scopeBody(docId) });
    if (r) { setRes(r); bump(); }
  }
  const sec = (key, title, tone) => res && res.sections[key] && (
    <div className={"rounded-3xl p-4 " + tone}><p className="mb-1 text-xs font-bold uppercase tracking-wide opacity-70">{title}</p><Rich text={res.sections[key]} /></div>
  );
  return (
    <div>
      <PageHeader icon="cap" title={t.teach_title} sub={t.teach_sub} />
      <div className="mx-auto max-w-2xl space-y-4 p-5 md:p-8">
        <div className={cardCls + " space-y-3"}>
          <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder={t.teach_topic} aria-label={t.teach_topic} className={inputCls} />
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} placeholder={t.teach_ph} aria-label={t.teach_ph} className={inputCls + " resize-none"}></textarea>
          <div className="flex flex-wrap items-center gap-2">
            <button className={btnPrimary} disabled={!!st || !topic.trim() || text.trim().length < 20} onClick={go}><Icon name="cap" className="h-4 w-4" />{t.teach_go}</button>
            <ScopeSelect t={t} docs={docs} folders={folders} value={docId} onChange={setDocId} className="ms-auto max-w-[12rem]" />
          </div>
          <p className="text-xs text-slate-500">{t.teach_min}</p>
        </div>
        <Loader st={st} t={t} />
        <ErrorBox error={error} t={t} onClose={clearError} />
        {res && (
          <div className="space-y-3">
            {sec("PEER_REACTION", t.peer, "bg-indigo-50 text-indigo-900")}
            {sec("WHAT_IS_RIGHT", t.right, "bg-green-50 text-green-900")}
            {sec("WHAT_TO_FIX", t.fix, "bg-amber-50 text-amber-900")}
            {sec("QUESTION", t.think, "bg-blue-50 text-blue-900")}
            {res.raw && <div className={cardCls}><Rich text={res.raw} /></div>}
            <MetaNote meta={res.meta} t={t} />
          </div>
        )}
      </div>
    </div>
  );
}
