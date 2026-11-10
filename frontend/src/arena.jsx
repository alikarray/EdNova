import React, { useState, useEffect } from "react";
import { api, useRunner, lsGet, lsSet, lsDel, fmt } from "./lib.js";
import { Icon, Loader, ErrorBox, PageHeader, Pill, ScopeSelect, scopeBody, cardCls, btnPrimary, btnGhost, inputCls } from "./ui.jsx";

// "Arena": a peer-learning room. One person creates a quiz (one AI call), friends join with a
// 5-character code, everyone answers the same questions and sees the live ranking.
export function Arena({ t, lid, lang, nick, docs, folders, scope0, startQuiz, bump }) {
  const [code, setCode] = useState(() => lsGet("ednova_arena", null));
  const [state, setState] = useState(null);
  const [name, setName] = useState(nick || "");
  const [topic, setTopic] = useState("");
  const [docId, setDocId] = useState(scope0 || "");
  const [joinCode, setJoinCode] = useState("");
  const [err, setErr] = useState(null);
  const [copied, setCopied] = useState(false);
  const { run, st, error, clearError } = useRunner();

  async function refresh(c) {
    try { setState(await api(`/api/arena/${c}?learner_id=${lid}`)); }
    catch (e) { setState(null); setCode(null); lsDel("ednova_arena"); }
  }

  useEffect(() => {
    if (!code) { setState(null); return undefined; }
    refresh(code);
    const id = setInterval(() => refresh(code), 2500);
    return () => clearInterval(id);
  }, [code]);

  async function create() {
    setErr(null);
    const r = await run("/api/arena", { learner_id: lid, nickname: name.trim(), topic: docId ? null : topic.trim(), n: 5, lang, ...scopeBody(docId) });
    if (r) { lsSet("ednova_arena", r.code); setCode(r.code); }
  }

  async function join() {
    setErr(null);
    try {
      const s = await api("/api/arena/join", { method: "POST", body: { learner_id: lid, code: joinCode.trim(), nickname: name.trim() } });
      lsSet("ednova_arena", s.code); setCode(s.code); setState(s);
    } catch (e) { setErr(e.message); }
  }

  function leave() { lsDel("ednova_arena"); setCode(null); setState(null); }

  function copy() {
    try { navigator.clipboard.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {}); } catch (e) { /* ignore */ }
  }

  function play() {
    const answers = state.my_answers;
    const results = state.questions.map((_, k) => (answers[k] ? answers[k].choice === answers[k].answer_index : null));
    let index = results.findIndex((r) => r === null);
    if (index < 0) index = 0;
    startQuiz({ mode: "arena", code, questions: state.questions, topic: state.topic, initial: { index, results }, onClose: () => refresh(code) });
  }

  if (code && state) {
    const answered = Object.keys(state.my_answers).length;
    return (
      <div>
        <PageHeader icon="users" title={t.arena_title} sub={state.topic}
          right={<button className={btnGhost} onClick={leave}>{t.leave_arena}</button>} />
        <div className="mx-auto max-w-2xl space-y-5 p-5 md:p-8">
          <div className={cardCls + " text-center shadow-sm"}>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{t.arena_code}</p>
            <p className="my-2 font-mono text-5xl font-black tracking-[0.3em] text-blue-600" data-testid="arena-code">{code}</p>
            <button className={btnGhost} onClick={copy}><Icon name="copy" className="h-4 w-4" />{copied ? t.copied : t.copy_code}</button>
            <p className="mt-3 text-sm text-slate-500">{t.arena_share}</p>
          </div>
          <div className={cardCls + " space-y-2"}>
            <p className="font-display font-extrabold text-slate-900">{t.ranking}</p>
            {state.players.map((p, k) => (
              <div key={k} className={"flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm " + (p.you ? "bg-blue-50 font-bold" : "bg-slate-50")}>
                <span className="w-5 text-slate-500">{k + 1}</span>
                <span className="flex-1 truncate">{p.nickname}{p.you ? " (" + t.you + ")" : ""}</span>
                <span className="text-xs text-slate-500">{p.answered}/{state.n}</span>
                <span className="w-10 text-end font-extrabold tabular-nums">{p.score}</span>
                {p.done && <Pill tone="green">✓</Pill>}
              </div>
            ))}
          </div>
          <button className={btnPrimary + " w-full py-3.5 text-base"} disabled={state.finished} onClick={play}>
            <Icon name="play" className="h-4 w-4" filled />{state.finished ? t.arena_done : answered > 0 ? t.arena_continue : t.arena_play}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader icon="users" title={t.arena_title} sub={t.arena_sub} />
      <div className="mx-auto max-w-2xl space-y-5 p-5 md:p-8">
        <div className={cardCls + " shadow-sm"}>
          <label className="mb-1 block text-sm font-bold text-slate-700" htmlFor="arena-nick">{t.nick_label}</label>
          <input id="arena-nick" value={name} maxLength={20} onChange={(e) => setName(e.target.value)} placeholder={t.nick_ph} className={inputCls} />
          <p className="mt-1 text-xs text-slate-500">{t.arena_nick_help}</p>
        </div>

        <div className={cardCls + " space-y-3 shadow-sm"}>
          <div className="flex items-center gap-2"><h2 className="font-display text-lg font-extrabold text-slate-900">{t.arena_create}</h2><Pill tone="blue">{t.arena_one_call}</Pill></div>
          <input value={topic} onChange={(e) => setTopic(e.target.value)} disabled={!!docId} placeholder={t.topic_ph} aria-label={t.topic_ph} className={inputCls + " disabled:bg-slate-100"} />
          {(docs.length > 0 || folders.length > 0) && <ScopeSelect t={t} docs={docs} folders={folders} value={docId} onChange={setDocId} className="w-full py-3" />}
          <button className={btnPrimary + " w-full py-3.5"} disabled={!!st || !name.trim() || (!topic.trim() && !docId)} onClick={create}>{t.arena_create_btn}</button>
          <Loader st={st} t={t} />
          <ErrorBox error={error} t={t} onClose={clearError} />
        </div>

        <div className={cardCls + " space-y-3 shadow-sm"}>
          <h2 className="font-display text-lg font-extrabold text-slate-900">{t.arena_join}</h2>
          <input value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} maxLength={8} placeholder="ABCDE" aria-label={t.arena_code}
            className={inputCls + " text-center font-mono text-xl font-bold tracking-[0.3em]"} />
          <button className={btnGhost + " w-full py-3"} disabled={!name.trim() || joinCode.trim().length < 3} onClick={join}>{t.arena_join_btn}</button>
          {err && <p role="alert" className="text-sm text-red-700">{err}</p>}
        </div>
      </div>
    </div>
  );
}
