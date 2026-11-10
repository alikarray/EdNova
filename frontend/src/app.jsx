import React, { useState, useEffect, useCallback } from "react";
import { createRoot } from "react-dom/client";
import I18N from "./i18n.js";
import { api, getLearnerId, lsGet, lsSet, lsDel, tzOffset, fmt, useStudyTime, fmtDuration } from "./lib.js";
import { Icon, Logo, Spinner, btnGhost, btnPrimary, inputCls } from "./ui.jsx";
import { Onboarding } from "./onboarding.jsx";
import { Home } from "./home.jsx";
import { Courses, CourseView, FolderView } from "./courses.jsx";
import { Coach, ConvList } from "./coach.jsx";
import { Practice, Teach } from "./learn.jsx";
import { Arena } from "./arena.jsx";
import { Plan } from "./plan.jsx";
import { QuizScreen } from "./quiz.jsx";

const LANGS = [["en", "English"], ["fr", "Français"], ["ar", "العربية"], ["darija", "الدارجة"]];
const uiOf = (lang) => I18N[lang === "darija" ? "ar" : lang] || I18N.en;
const NAV = [["home", "home", "nav_home"], ["courses", "folder", "nav_courses"], ["plan", "clock", "nav_plan"], ["coach", "chat", "nav_coach"], ["teach", "cap", "nav_teach"], ["arena", "users", "nav_arena"]];

function defaultLang() {
  const saved = lsGet("ednova_lang", null);
  if (saved) return saved;
  const n = (navigator.language || "en").slice(0, 2);
  return n === "fr" ? "fr" : n === "ar" ? "ar" : "en";
}

function Settings({ t, lang, setLang, nick, setNick, retake, wipe, close, theme, setTheme, qtimer, setQtimer }) {
  const [sure, setSure] = useState(false);
  return (
    <div className="absolute bottom-full start-0 z-30 mb-2 w-72 space-y-3 rounded-3xl border border-slate-200 bg-white p-4 text-sm shadow-xl">
      <div>
        <p className="mb-1 text-xs font-bold uppercase text-slate-500">{t.language}</p>
        <div className="grid grid-cols-2 gap-1.5">
          {LANGS.map(([k, n]) => (
            <button key={k} onClick={() => setLang(k)} className={"rounded-xl px-2 py-2 font-semibold " + (lang === k ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200")}>{n}</button>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-1 text-xs font-bold uppercase text-slate-500">{t.theme}</p>
        <div className="grid grid-cols-2 gap-1.5">
          {[["dark", t.theme_dark], ["light", t.theme_light]].map(([k, n]) => (
            <button key={k} onClick={() => setTheme(k)} className={"rounded-xl px-2 py-2 font-semibold " + (theme === k ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200")}>{n}</button>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-1 text-xs font-bold uppercase text-slate-500">{t.quiz_timer}</p>
        <div className="grid grid-cols-2 gap-1.5">
          {[["auto", t.timer_auto], ["off", t.timer_off]].map(([k, n]) => (
            <button key={k} onClick={() => setQtimer(k)} className={"rounded-xl px-2 py-2 font-semibold " + (qtimer === k ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200")}>{n}</button>
          ))}
        </div>
        <p className="mt-1 text-xs text-slate-500">{t.timer_hint}</p>
      </div>
      <div>
        <label className="mb-1 block text-xs font-bold uppercase text-slate-500" htmlFor="set-nick">{t.nick_label}</label>
        <input id="set-nick" className={inputCls} maxLength={20} value={nick} onChange={(e) => setNick(e.target.value)} placeholder={t.nick_ph} />
      </div>
      <button className={btnGhost + " w-full"} onClick={() => { close(); retake(); }}>{t.retake}</button>
      <div>
        <button className={"w-full rounded-full border px-4 py-2.5 text-sm font-semibold " + (sure ? "border-red-600 bg-red-600 text-white" : "border-red-300 text-red-700 hover:bg-red-50")}
          onClick={() => (sure ? wipe() : setSure(true))}>{sure ? t.confirm_again : t.delete_data}</button>
        <p className="mt-1 text-xs text-slate-500">{t.delete_help}</p>
      </div>
    </div>
  );
}

function App() {
  const lid = getLearnerId();
  const [lang, setLangState] = useState(defaultLang);
  const [nick, setNickState] = useState(() => lsGet("ednova_nick", ""));
  const [profile, setProfile] = useState(undefined);
  const [docs, setDocs] = useState([]);
  const [folders, setFolders] = useState([]);
  const [folderId, setFolderId] = useState(null);
  const [scope0, setScope0] = useState("");
  const [prog, setProg] = useState(null);
  const [status, setStatus] = useState(null);
  const [view, setView] = useState("home");
  const [courseId, setCourseId] = useState(null);
  const [auto, setAuto] = useState(null);
  const [teachDoc, setTeachDoc] = useState("");
  const [quiz, setQuiz] = useState(null);
  const [convs, setConvsState] = useState(() => lsGet("ednova_convs", []));
  const [activeConv, setActiveConv] = useState(null);
  const [prefill, setPrefill] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [upErr, setUpErr] = useState(null);
  const [showSet, setShowSet] = useState(false);
  const [retaking, setRetaking] = useState(false);
  const [theme, setThemeState] = useState(() => lsGet("ednova_theme", "dark"));
  const setTheme = (m) => { setThemeState(m); lsSet("ednova_theme", m); };
  const [qtimer, setQtimerState] = useState(() => lsGet("ednova_qtimer", "auto"));
  const setQtimer = (m) => { setQtimerState(m); lsSet("ednova_qtimer", m); };
  const [plan, setPlanState] = useState(() => lsGet("ednova_plan", null));
  const setPlan = (p) => { setPlanState(p); if (p) lsSet("ednova_plan", p); else lsDel("ednova_plan"); };
  const study = useStudyTime();
  const t = uiOf(lang);

  useEffect(() => { document.documentElement.classList.toggle("dark", theme === "dark"); }, [theme]);

  const setLang = (l) => { setLangState(l); lsSet("ednova_lang", l); };
  const setNick = (n) => { setNickState(n); lsSet("ednova_nick", n); };
  const setConvs = (fn) => setConvsState((cs) => { const next = typeof fn === "function" ? fn(cs) : fn; lsSet("ednova_convs", next.slice(0, 20)); return next; });

  useEffect(() => {
    document.documentElement.lang = lang === "darija" ? "ar" : lang;
    document.documentElement.dir = lang === "ar" || lang === "darija" ? "rtl" : "ltr";
    document.title = t.brand + " — " + t.tagline;
  }, [lang]);

  const reloadDocs = useCallback(() => Promise.all([
    api("/api/docs?learner_id=" + lid).then(setDocs).catch(() => {}),
    api("/api/folders?learner_id=" + lid).then(setFolders).catch(() => {}),
  ]), [lid]);
  const bump = useCallback(() => api(`/api/progress?learner_id=${lid}&tz=${tzOffset()}`).then(setProg).catch(() => {}), [lid]);

  useEffect(() => {
    api("/api/profile?learner_id=" + lid).then((p) => setProfile(p && p.style ? p : null)).catch(() => setProfile(null));
    reloadDocs(); bump();
    const poll = () => api("/api/status").then(setStatus).catch(() => setStatus(null));
    poll();
    const id = setInterval(poll, 8000);
    return () => clearInterval(id);
  }, []);

  function go(name, extra) {
    setQuiz(null); setShowSet(false);
    if (name === "teach") setTeachDoc((extra && extra.docId) || "");
    setScope0((extra && extra.scope) || "");
    if (name === "coach" && !(extra && extra.keep)) setActiveConv(null);
    setView(name);
    window.scrollTo(0, 0);
  }
  function openFolder(id) { setFolderId(id); setQuiz(null); setShowSet(false); setView("folder"); window.scrollTo(0, 0); }
  async function createFolder(name) {
    try { const f = await api("/api/folders", { method: "POST", body: { learner_id: lid, name } }); await reloadDocs(); return f; }
    catch (e) { setUpErr(e.message); return null; }
  }
  async function renameFolder(id, name) { await api(`/api/folders/${id}/rename`, { method: "POST", body: { learner_id: lid, name } }).catch(() => {}); await reloadDocs(); }
  async function deleteFolder(id) { await api(`/api/folders/${id}?learner_id=${lid}`, { method: "DELETE" }).catch(() => {}); await reloadDocs(); go("courses"); }
  function openCourse(id, a) { setCourseId(id); setAuto(a || null); setQuiz(null); setView("course"); window.scrollTo(0, 0); }
  function startCoach(text, docId) { setPrefill({ text, docId }); setActiveConv(null); setQuiz(null); setView("coach"); }
  function openQuiz(q) {
    setQuiz({ mode: "solo", initial: undefined, ...q });
  }
  function closeQuiz() { const q = quiz; setQuiz(null); bump(); if (q && q.onClose) q.onClose(); }

  async function upload(files, folder, kind) {
    const list = Array.isArray(files) ? files : [files];
    setUploading(true); setUpErr(null);
    let last = null;
    for (const file of list) {
      try {
        const form = new FormData();
        form.append("file", file); form.append("learner_id", lid);
        if (folder) form.append("folder_id", folder);
        if (kind) form.append("kind", kind);
        const r = await api("/api/docs/upload", { method: "POST", form });
        last = r.doc_id;
      } catch (e) { setUpErr(file.name + ": " + e.message); }
    }
    await reloadDocs();
    setUploading(false);
    return last;
  }
  async function uploadAndOpen(file) { const id = await upload(file); if (id) openCourse(id, null); }

  async function removeCourse(id) {
    await api(`/api/docs/${id}?learner_id=${lid}`, { method: "DELETE" }).catch(() => {});
    await reloadDocs(); go("courses");
  }
  async function wipe() {
    await api("/api/learner?learner_id=" + lid, { method: "DELETE" }).catch(() => {});
    ["ednova_lid", "ednova_nick", "ednova_convs", "ednova_arena", "ednova_lang", "ednova_theme", "ednova_plan", "ednova_study", "ednova_qtimer"].forEach(lsDel);
    window.location.reload();
  }

  if (profile === undefined) return <div className="flex min-h-screen items-center justify-center"><Spinner /></div>;
  if (!profile || retaking) {
    return (
      <Onboarding t={t} lid={lid} lang={lang} setLang={setLang} nick={nick} setNick={setNick}
        onDone={(p) => { setProfile(p); setRetaking(false); bump(); }} />
    );
  }

  const level = (prog && prog.level) || (profile && profile.level) || "beginner";
  const timerSecs = qtimer === "off" ? 0 : ({ intermediate: 40, advanced: 25 }[level] || 0);
  const course = docs.find((d) => d.id === courseId);
  const folder = folders.find((f) => f.id === (view === "folder" ? folderId : course && course.folder_id));
  const online = status && (status.large_available || status.mock !== undefined || true);
  const navActive = view === "course" || view === "folder" ? "courses" : view;

  let body;
  if (view === "home") body = <Home t={t} nick={nick} docs={docs} prog={prog} go={go} openCourse={openCourse} startCoach={startCoach} onUpload={uploadAndOpen} uploading={uploading} upErr={upErr} plan={plan} study={study} />;
  else if (view === "courses") body = <Courses t={t} folders={folders} openFolder={openFolder} createFolder={createFolder} upErr={upErr} />;
  else if (view === "folder" && folder) body = <FolderView key={folder.id} t={t} folder={folder} docs={docs} openCourse={openCourse} openFolderQuiz={(id) => go("practice", { scope: "f:" + id })} go={go} startCoach={startCoach} onUpload={upload} uploading={uploading} upErr={upErr} renameFolder={renameFolder} deleteFolder={deleteFolder} />;
  else if (view === "course" && course) body = <CourseView key={course.id} t={t} lid={lid} lang={lang} doc={course} folder={folder} folders={folders} openFolder={openFolder} prog={prog} auto={auto} reloadDocs={reloadDocs} bump={bump} openQuiz={openQuiz} go={go} onDelete={() => removeCourse(course.id)} startCoach={startCoach} />;
  else if (view === "coach" && activeConv === "__list__") body = <ConvList t={t} convs={convs} setConvs={setConvs} onOpen={(id) => setActiveConv(id)} onNew={() => setActiveConv(null)} />;
  else if (view === "coach") body = <Coach t={t} lid={lid} lang={lang} nick={nick} docs={docs} folders={folders} profile={profile} setProfile={setProfile} convs={convs} setConvs={setConvs} activeId={activeConv} setActiveId={setActiveConv} prefill={prefill} clearPrefill={() => setPrefill(null)} onUpload={upload} uploading={uploading} bump={bump} />;
  else if (view === "plan") body = <Plan t={t} lang={lang} docs={docs} folders={folders} plan={plan} setPlan={setPlan} openCourse={openCourse} go={go} studySecs={study.today} />;
  else if (view === "practice") body = <Practice key={scope0} t={t} lid={lid} lang={lang} docs={docs} folders={folders} scope0={scope0} openQuiz={openQuiz} />;
  else if (view === "teach") body = <Teach key={teachDoc} t={t} lid={lid} lang={lang} docs={docs} folders={folders} docId0={teachDoc} bump={bump} />;
  else if (view === "arena") body = <Arena key={scope0} t={t} lid={lid} lang={lang} nick={nick} docs={docs} folders={folders} scope0={scope0} startQuiz={openQuiz} bump={bump} />;
  else body = <Home t={t} nick={nick} docs={docs} prog={prog} go={go} openCourse={openCourse} startCoach={startCoach} onUpload={uploadAndOpen} uploading={uploading} upErr={upErr} />;

  return (
    <div className="flex min-h-screen bg-white text-slate-800">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-e border-slate-100 bg-slate-50/60 p-4 md:flex">
        <div className="px-2 py-2"><Logo t={t} /></div>
        <nav className="mt-4 space-y-1" aria-label="main">
          {NAV.map(([k, ic, lab]) => (
            <button key={k} onClick={() => go(k)} aria-current={navActive === k ? "page" : undefined}
              className={"flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-bold transition " + (navActive === k ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-100")}>
              <Icon name={ic} />{t[lab]}
            </button>
          ))}
        </nav>
        <div className="mt-5 min-h-0 flex-1 overflow-y-auto">
          {view === "coach" && convs.length > 0 && (
            <div className="mb-4">
              <p className="px-3 text-xs font-bold uppercase text-slate-400">{t.my_convs}</p>
              {convs.slice(0, 6).map((c) => (
                <button key={c.id} onClick={() => setActiveConv(c.id)} className={"mt-1 block w-full truncate rounded-xl px-3 py-1.5 text-start text-xs " + (activeConv === c.id ? "bg-white font-bold" : "text-slate-600 hover:bg-slate-100")}>{c.title}</button>
              ))}
              <button onClick={() => setActiveConv("__list__")} className="mt-1 px-3 text-xs font-semibold text-blue-600">{t.see_all}</button>
            </div>
          )}
          <p className="px-3 text-xs font-bold uppercase text-slate-400">{t.nav_courses}</p>
          {folders.length === 0 && <p className="px-3 py-2 text-xs text-slate-400">{t.no_docs}</p>}
          {folders.slice(0, 10).map((f) => (
            <button key={f.id} onClick={() => openFolder(f.id)} className={"mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-1.5 text-start text-xs " + (folder && folder.id === f.id && (view === "folder" || view === "course") ? "bg-white font-bold" : "text-slate-600 hover:bg-slate-100")}>
              <Icon name="folder" className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{f.name}</span>
            </button>
          ))}
        </div>
        <div className="mb-1 flex items-center gap-2 px-2 text-xs font-semibold text-slate-600" title={t.study_tracking} data-testid="study-chip">
          <Icon name="clock" className="h-3.5 w-3.5" />{t.study_today}: {fmtDuration(t, study.today)}
        </div>
        <div className="mb-2 flex items-center gap-2 px-2 text-xs text-slate-500" title={t.status_tip}>
          <span className={"h-2 w-2 rounded-full " + (status ? (status.large_available ? "bg-green-500" : "bg-amber-500") : "bg-slate-300")}></span>
          {status ? (status.large_available ? t.status_ok : t.status_compact) : t.status_off}
        </div>
        <div className="relative">
          {showSet && <Settings t={t} lang={lang} setLang={setLang} nick={nick} setNick={setNick} retake={() => setRetaking(true)} wipe={wipe} close={() => setShowSet(false)} theme={theme} setTheme={setTheme} qtimer={qtimer} setQtimer={setQtimer} />}
          <button onClick={() => setShowSet((s) => !s)} className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-2.5 text-start hover:bg-slate-50" aria-label={t.settings}>
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 font-bold text-white">{(nick || "E").slice(0, 1).toUpperCase()}</span>
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{nick || t.guest}</span><span className="block text-xs text-slate-500">{fmt(t.level_n, { n: prog ? prog.level_num : 1 })}</span></span>
            <Icon name="dots" className="h-4 w-4 text-slate-400" />
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col pb-20 md:pb-0">
        <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3 md:hidden">
          <Logo t={t} small />
          <div className="relative">
            <button onClick={() => setShowSet((s) => !s)} aria-label={t.settings} className="rounded-full border border-slate-200 p-2"><Icon name="dots" className="h-4 w-4" /></button>
            {showSet && <div className="absolute end-0 top-full mt-2 w-72"><div className="relative"><Settings t={t} lang={lang} setLang={setLang} nick={nick} setNick={setNick} retake={() => setRetaking(true)} wipe={wipe} close={() => setShowSet(false)} theme={theme} setTheme={setTheme} qtimer={qtimer} setQtimer={setQtimer} /></div></div>}
          </div>
        </header>
        <main className="min-w-0 flex-1"><div key={view + (courseId || "") + (folderId || "")} className="page-in">{body}</div></main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-slate-200 bg-white md:hidden" aria-label="mobile">
        {NAV.map(([k, ic, lab]) => (
          <button key={k} onClick={() => go(k)} className={"flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-bold " + (navActive === k ? "text-blue-700" : "text-slate-500")}>
            <Icon name={ic} className="h-5 w-5" />{t[lab]}
          </button>
        ))}
      </nav>

      {quiz && (
        <QuizScreen key={quiz.code || quiz.topic + quiz.questions.length} t={t} lid={lid} questions={quiz.questions} topic={quiz.topic}
          mode={quiz.mode} code={quiz.code} initial={quiz.initial} timerSecs={timerSecs} onClose={closeQuiz} />
      )}
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
