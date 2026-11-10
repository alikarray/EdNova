import React, { useState, useEffect, useRef } from "react";
import { api, useRunner, uid, fmt } from "./lib.js";
import { Icon, Nova, Loader, ErrorBox, MetaNote, Rich, PageHeader, ScopeSelect, scopeBody, btnGhost } from "./ui.jsx";

function ChatInput({ t, value, setValue, onSend, disabled, docs, folders, docId, setDocId, onUpload, uploading, direct, setDirect, rows = 2 }) {
  return (
    <div className="rounded-3xl border-2 border-slate-200 bg-white p-3 shadow-sm focus-within:border-blue-500">
      <textarea value={value} rows={rows} onChange={(e) => setValue(e.target.value)} placeholder={t.coach_ph} aria-label={t.coach_ph}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); if (!disabled && value.trim()) onSend(); } }}
        className="w-full resize-none bg-transparent px-2 py-1 text-sm text-slate-800 outline-none placeholder:text-slate-400"></textarea>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label title={t.upload_file} className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-slate-300 text-slate-600 hover:bg-slate-50">
          {uploading ? <span className="text-xs">…</span> : <Icon name="plus" className="h-4 w-4" />}
          <input type="file" accept=".pdf,.txt,.md" className="hidden" disabled={uploading}
            onChange={(e) => { const f = e.target.files && e.target.files[0]; if (f) onUpload(f); e.target.value = ""; }} />
        </label>
        <ScopeSelect t={t} docs={docs} folders={folders} value={docId} onChange={setDocId} className="max-w-[11rem]" />
        <div className="inline-flex rounded-full bg-slate-100 p-0.5 text-xs font-bold">
          <button type="button" onClick={() => setDirect(false)} className={"rounded-full px-3 py-1.5 " + (!direct ? "bg-white text-blue-700 shadow-sm" : "text-slate-500")}>{t.mode_guided}</button>
          <button type="button" onClick={() => setDirect(true)} className={"rounded-full px-3 py-1.5 " + (direct ? "bg-white text-blue-700 shadow-sm" : "text-slate-500")}>{t.mode_direct}</button>
        </div>
        <button type="button" onClick={onSend} disabled={disabled || !value.trim()} aria-label={t.send}
          className="ms-auto flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-white transition hover:bg-blue-700 disabled:opacity-40"><Icon name="send" /></button>
      </div>
    </div>
  );
}

export function Coach({ t, lid, lang, nick, docs, folders, profile, setProfile, convs, setConvs, activeId, setActiveId, prefill, clearPrefill, onUpload, uploading, bump }) {
  const [input, setInput] = useState("");
  const [docId, setDocId] = useState("");
  const [direct, setDirect] = useState(false);
  const [notice, setNotice] = useState(null);
  const { run, st, error, clearError } = useRunner();
  const endRef = useRef(null);
  const prefilled = useRef(false);
  const conv = convs.find((c) => c.id === activeId);

  useEffect(() => { if (endRef.current && endRef.current.scrollIntoView) endRef.current.scrollIntoView({ block: "end" }); }, [conv && conv.messages.length, st]);

  useEffect(() => {
    if (prefilled.current || !prefill) return;
    prefilled.current = true;
    if (prefill.docId) setDocId(prefill.docId);
    if (prefill.text) start(prefill.text, prefill.docId || "");
    clearPrefill();
  }, []);

  const patch = (id, fn) => setConvs((cs) => cs.map((c) => (c.id === id ? fn(c) : c)));

  function afterReply(id, r, hints) {
    if (profile && r.style && r.style !== profile.style) { setProfile({ ...profile, style: r.style }); setNotice(t.style_switched); }
    patch(id, (c) => ({ ...c, hints: hints !== null ? hints : c.hints, updated: Date.now(),
      messages: [...c.messages, { role: "assistant", content: r.reply, next: r.next_step, meta: r.meta, usedDoc: r.used_document }] }));
    bump();
  }

  async function start(text, docOverride) {
    const q = (text || "").trim();
    if (!q || st) return;
    const useDoc = docOverride !== undefined ? docOverride : docId;
    const mode = direct ? "explain" : "ask";
    const id = uid();
    const c = { id, title: q.slice(0, 60), question: q, hints: 0, answered: direct, understood: false, docId: useDoc || "", updated: Date.now(), messages: [{ role: "user", content: q }] };
    setConvs((cs) => [c, ...cs].slice(0, 20));
    setActiveId(id); setInput(""); setNotice(null);
    const r = await run("/api/tutor", { learner_id: lid, mode, message: q, history: [], hint_n: 1, lang, ...scopeBody(useDoc) });
    if (r) afterReply(id, r, mode === "ask" ? 1 : null);
  }

  async function send(mode, message, hintN, userText) {
    const c = conv;
    if (!c || st) return false;
    const history = c.messages.slice(-6).map((m) => ({ role: m.role, content: m.content }));
    if (userText) patch(c.id, (x) => ({ ...x, messages: [...x.messages, { role: "user", content: userText }] }));
    const r = await run("/api/tutor", { learner_id: lid, mode, message, history, hint_n: hintN, lang, ...scopeBody(c.docId) });
    if (!r) return false;
    afterReply(c.id, r, null);
    return true;
  }

  async function nextHint() { const n = Math.min(conv.hints + 1, 3); if (await send("hint", conv.question, n, null)) patch(conv.id, (c) => ({ ...c, hints: n })); }
  async function showAnswer() { if (await send("answer", conv.question, 3, null)) patch(conv.id, (c) => ({ ...c, answered: true })); }
  async function understood() { await api("/api/feedback", { method: "POST", body: { learner_id: lid, feedback: "clear" } }).catch(() => {}); patch(conv.id, (c) => ({ ...c, understood: true })); setNotice(null); }
  async function confused() { await send("explain", conv.question + "\n\n" + t.confused_msg, 1, t.confused_msg); }

  function submit() {
    const text = input.trim();
    if (!text) return;
    if (conv) { setInput(""); send("explain", text, 1, text); } else start(text);
  }

  function newQuestion() { setActiveId(null); setNotice(null); clearError(); }

  const last = conv && conv.messages[conv.messages.length - 1];
  const canAct = conv && !st && last && last.role === "assistant" && !conv.understood;
  const inputProps = { t, value: input, setValue: setInput, onSend: submit, disabled: !!st, docs, folders, docId: conv ? conv.docId : docId, setDocId: (v) => (conv ? patch(conv.id, (c) => ({ ...c, docId: v })) : setDocId(v)), onUpload: async (f) => { const id = await onUpload(f); if (id) { if (conv) patch(conv.id, (c) => ({ ...c, docId: "d:" + id })); else setDocId("d:" + id); } }, uploading, direct, setDirect };

  if (!conv) {
    return (
      <div>
        <PageHeader icon="chat" title={t.nav_coach} right={<button className={btnGhost} onClick={() => setActiveId("__list__")}><Icon name="clock" className="h-4 w-4" />{t.my_convs}</button>} />
        <div className="mx-auto flex max-w-2xl flex-col items-center px-5 py-10 text-center">
          <Nova className="h-36 w-36" />
          <h2 className="mt-4 font-display text-4xl font-black text-slate-900">{nick ? fmt(t.coach_hi_nick, { n: nick }) : t.coach_hi}</h2>
          <p className="mt-2 text-slate-600">{t.coach_what}</p>
          <div className="mt-8 w-full text-start"><ChatInput {...inputProps} /></div>
          <div className="mt-4 w-full"><Loader st={st} t={t} /></div>
          <div className="mt-4 w-full"><ErrorBox error={error} t={t} onClose={clearError} /></div>
          <p className="mt-6 text-xs text-slate-400">{t.ai_disclaimer}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="coach-h flex flex-col">
      <PageHeader icon="chat" title={conv.title} sub={t.coach_sub}
        right={<button className={btnGhost} onClick={newQuestion}><Icon name="plus" className="h-4 w-4" />{t.new_q}</button>} />
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5 md:px-8">
        {conv.messages.map((m, i) => (
          <div key={i} className={"flex items-end gap-2 " + (m.role === "user" ? "justify-end" : "justify-start")}>
            {m.role !== "user" && <Nova className="h-9 w-9 shrink-0" />}
            <div className={"max-w-[85%] rounded-3xl px-4 py-3 text-sm " + (m.role === "user" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-800")}>
              <Rich text={m.content} />
              {m.next && <p className="mt-2 border-t border-slate-200 pt-2 text-xs text-slate-500">➡ <b>{t.next_step}:</b> {m.next}</p>}
              {m.usedDoc && <p className="mt-1 text-xs text-slate-500">📄 {t.used_doc}</p>}
              {m.meta && <div className="mt-1"><MetaNote meta={m.meta} t={t} /></div>}
            </div>
          </div>
        ))}
        <Loader st={st} t={t} />
        <ErrorBox error={error} t={t} onClose={clearError} />
        {notice && <div className="rounded-2xl bg-green-50 p-3 text-sm text-green-800">{notice}</div>}
        {conv.understood && <div className="rounded-2xl bg-green-50 p-3 text-sm font-semibold text-green-800">🎉 {t.great_job}</div>}
        <div ref={endRef}></div>
      </div>
      <div className="space-y-3 border-t border-slate-100 px-4 py-3 md:px-8">
        {canAct && (
          <div className="flex flex-wrap gap-2">
            {!conv.answered && <button className={btnGhost} disabled={conv.hints >= 3} onClick={nextHint}><Icon name="bulb" className="h-4 w-4" />{t.hint}</button>}
            {!conv.answered && <button className={btnGhost} onClick={showAnswer}>{t.show_answer}</button>}
            <button className={btnGhost} onClick={understood}>👍 {t.clear}</button>
            <button className={btnGhost} onClick={confused}>🤔 {t.confused}</button>
          </div>
        )}
        <ChatInput {...inputProps} rows={1} />
        <p className="text-center text-xs text-slate-400">{t.ai_disclaimer}</p>
      </div>
    </div>
  );
}

export function ConvList({ t, convs, setConvs, onOpen, onNew }) {
  return (
    <div>
      <PageHeader icon="clock" title={t.my_convs} right={<button className={btnGhost} onClick={onNew}><Icon name="plus" className="h-4 w-4" />{t.new_q}</button>} />
      <div className="mx-auto max-w-2xl space-y-2 p-5 md:p-8">
        {convs.length === 0 && <p className="text-sm text-slate-500">{t.no_convs}</p>}
        {convs.map((c) => (
          <div key={c.id} className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2 ps-4 hover:border-blue-300">
            <button className="min-w-0 flex-1 py-2 text-start" onClick={() => onOpen(c.id)}>
              <span className="block truncate font-semibold text-slate-800">{c.title}</span>
              <span className="block text-xs text-slate-500">{fmt(t.n_messages, { n: c.messages.length })} · {new Date(c.updated).toLocaleDateString()}</span>
            </button>
            <button aria-label={t.remove} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-red-600" onClick={() => setConvs((cs) => cs.filter((x) => x.id !== c.id))}><Icon name="trash" className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
    </div>
  );
}
