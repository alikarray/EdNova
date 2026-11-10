import React from "react";
import { fmt } from "./lib.js";

export const cardCls = "rounded-3xl border border-slate-200 bg-white p-5";
export const btnPrimary = "inline-flex items-center justify-center gap-2 rounded-full bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition active:scale-95 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50";
export const btnGhost = "inline-flex items-center justify-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition active:scale-95 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";
export const inputCls = "w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

const ICONS = {
  home: "M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1z",
  folder: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  chat: "M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.4A8 8 0 1 1 21 12z",
  users: "M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM21 19v-1a4 4 0 0 0-3-3.9M16 4.1a3 3 0 0 1 0 5.8",
  cap: "M2 9l10-5 10 5-10 5zM6 11.5V16c0 1 3 3 6 3s6-2 6-3v-4.5",
  check: "M5 12l5 5L20 7",
  x: "M6 6l12 12M18 6L6 18",
  plus: "M12 5v14M5 12h14",
  send: "M12 19V5M5 12l7-7 7 7",
  upload: "M12 16V4M7 9l5-5 5 5M4 20h16",
  flame: "M12 2c1 4 5 6 5 11a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-4-1-6 1-10z",
  file: "M7 3h7l5 5v13H7zM14 3v5h5",
  bulb: "M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z",
  book: "M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19V5",
  cards: "M5 8h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2zM7 4h10a2 2 0 0 1 2 2v9",
  dots: "M12 5h.01M12 12h.01M12 19h.01",
  trophy: "M8 4h8v5a4 4 0 0 1-8 0zM8 6H4v1a3 3 0 0 0 4 3M16 6h4v1a3 3 0 0 1-4 3M12 13v4M8 21h8M10 17h4",
  copy: "M9 9h10v12H9zM5 15V3h10",
  arrow: "M5 12h14M13 6l6 6-6 6",
  back: "M19 12H5M11 6l-6 6 6 6",
  star: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  clock: "M12 7v5l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z",
  play: "M8 5v14l11-7z",
  edit: "M4 20h4L19 9l-4-4L4 16zM14 6l4 4",
  chevron: "M6 9l6 6 6-6",
};

export function Icon({ name, className = "h-5 w-5", filled = false }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill={filled ? "currentColor" : "none"} stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}

// Nova, EdNova's own AI companion (original artwork): a glass-visor bot with an orbiting spark.
export function Nova({ className = "h-24 w-24" }) {
  return (
    <svg viewBox="0 0 120 120" className={className + " nova-float"} aria-hidden="true">
      <defs>
        <linearGradient id="nvBody" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#818cf8" /><stop offset="0.55" stopColor="#4f46e5" /><stop offset="1" stopColor="#1e3a8a" /></linearGradient>
        <linearGradient id="nvRing" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#22d3ee" stopOpacity="0.1" /><stop offset="1" stopColor="#22d3ee" /></linearGradient>
        <radialGradient id="nvGlow" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stopColor="#5eead4" stopOpacity="0.9" /><stop offset="1" stopColor="#5eead4" stopOpacity="0" /></radialGradient>
      </defs>
      <g transform="rotate(-16 60 70)"><ellipse cx="60" cy="70" rx="54" ry="15" fill="none" stroke="url(#nvRing)" strokeWidth="2.2" /></g>
      <circle cx="60" cy="14" r="9" fill="url(#nvGlow)" />
      <path d="M60 30V19" stroke="#c7d2fe" strokeWidth="3" strokeLinecap="round" />
      <path d="M60 8l2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5-3.6-3.5 5-.7z" fill="#fbbf24" />
      <rect x="18" y="52" width="9" height="20" rx="4.5" fill="#3730a3" />
      <rect x="93" y="52" width="9" height="20" rx="4.5" fill="#3730a3" />
      <rect x="24" y="30" width="72" height="62" rx="28" fill="url(#nvBody)" />
      <path d="M36 40c6-7 16-9 26-8" stroke="#fff" strokeOpacity="0.35" strokeWidth="4" strokeLinecap="round" fill="none" />
      <rect x="32" y="44" width="56" height="34" rx="17" fill="#0b1226" />
      <rect x="32" y="44" width="56" height="34" rx="17" fill="none" stroke="#a5b4fc" strokeOpacity="0.5" strokeWidth="1.5" />
      <g className="nova-blink"><rect x="44" y="53" width="9" height="13" rx="4.5" fill="#5eead4" /><rect x="67" y="53" width="9" height="13" rx="4.5" fill="#5eead4" /></g>
      <path d="M53 71q7 5 14 0" stroke="#5eead4" strokeWidth="2.6" strokeLinecap="round" fill="none" />
      <path d="M38 98c4 5 10 7 22 7s18-2 22-7" stroke="#3730a3" strokeWidth="6" strokeLinecap="round" fill="none" />
      <g transform="rotate(-16 60 70)"><path d="M6 70A54 15 0 0 0 114 70" fill="none" stroke="url(#nvRing)" strokeWidth="2.2" /><circle cx="114" cy="70" r="4.5" fill="#22d3ee" /></g>
    </svg>
  );
}

export function Logo({ t, small }) {
  const s = small ? 32 : 40;
  return (
    <div className="flex items-center gap-2.5">
      <svg width={s} height={s} viewBox="0 0 48 48" role="img" aria-label={t.brand}>
        <defs>
          <linearGradient id="lgNavy" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#1e3a8a" /><stop offset="1" stopColor="#0f172a" /></linearGradient>
        </defs>
        <rect width="48" height="48" rx="11" fill="url(#lgNavy)" />
        <path d="M24 11 7.5 19.5 24 28l16.5-8.5z" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinejoin="round" />
        <path d="M14 24.5v6.2c0 2.2 4.5 4.8 10 4.8s10-2.6 10-4.8v-6.2" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M40.5 19.5v9" stroke="#d4a537" strokeWidth="2.4" strokeLinecap="round" />
        <circle cx="40.5" cy="30.6" r="1.9" fill="#d4a537" />
      </svg>
      <span className={"font-display font-extrabold uppercase tracking-[0.14em] text-slate-900 " + (small ? "text-base" : "text-lg")}>{t.brand}</span>
    </div>
  );
}

export function Spinner() {
  return <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600"></span>;
}

export function Loader({ st, t }) {
  if (!st) return null;
  const q = st.gateway && st.gateway.queued > 0 ? fmt(t.queue, { n: st.gateway.queued }) : null;
  return (
    <div role="status" className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
      <div className="flex items-center gap-3">
        <Spinner />
        <span className="font-semibold">{t.stage[st.stage] || t.stage.preparing}</span>
        <span className="ms-auto tabular-nums text-blue-700">{st.elapsed}{t.seconds}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-blue-100"><div className="h-full w-1/3 animate-pulse rounded-full bg-blue-500"></div></div>
      <p className="mt-2 text-xs text-blue-700">{t.waiting_note}{q ? " · " + q : ""}</p>
    </div>
  );
}

export function ErrorBox({ error, t, onClose }) {
  if (!error) return null;
  return (
    <div role="alert" className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      <span className="flex-1">{error === "__ai__" ? t.error_ai : error}</span>
      {onClose && <button onClick={onClose} aria-label="close" className="font-bold">×</button>}
    </div>
  );
}

export function MetaNote({ meta, t }) {
  if (!meta || (!meta.fallback && !meta.cached)) return null;
  return (
    <div className="flex flex-wrap gap-2 text-xs">
      {meta.fallback && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">{t.fallback_note}</span>}
      {meta.cached && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">{t.cached_note}</span>}
    </div>
  );
}

function inline(s) {
  return s.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
    p.length > 4 && p.startsWith("**") && p.endsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : p);
}

export function Rich({ text }) {
  const lines = (text || "").split("\n");
  return (
    <div className="space-y-1.5 leading-relaxed">
      {lines.map((l, i) =>
        /^\s*[-*•]\s+/.test(l)
          ? <div key={i} className="flex gap-2"><span className="text-blue-600">•</span><span>{inline(l.replace(/^\s*[-*•]\s+/, ""))}</span></div>
          : l.trim() === "" ? <div key={i} className="h-2"></div> : <p key={i}>{inline(l)}</p>)}
    </div>
  );
}

export function PageHeader({ icon, title, sub, right }) {
  return (
    <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4 md:px-8">
      {icon && <span className="text-slate-500"><Icon name={icon} /></span>}
      <div className="min-w-0 flex-1">
        <h1 className="truncate font-display text-lg font-extrabold text-slate-900">{title}</h1>
        {sub && <p className="truncate text-xs text-slate-500">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export function Pill({ children, tone = "slate" }) {
  const tones = {
    slate: "bg-slate-100 text-slate-700", blue: "bg-blue-50 text-blue-700", green: "bg-green-50 text-green-700",
    amber: "bg-amber-50 text-amber-800", red: "bg-red-50 text-red-700",
  };
  return <span className={"inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold " + tones[tone]}>{children}</span>;
}

// Scope = what the AI should read: nothing, a whole course folder ("f:id") or one file ("d:id").
export const scopeBody = (v) => (v && v.startsWith("f:") ? { folder_id: v.slice(2) } : v && v.startsWith("d:") ? { doc_id: v.slice(2) } : {});

export function ScopeSelect({ t, docs, folders, value, onChange, className = "" }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={t.specify_course}
      className={"rounded-full border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 " + className}>
      <option value="">{t.specify_course}</option>
      {folders.length > 0 && <optgroup label={t.nav_courses}>{folders.map((f) => <option key={f.id} value={"f:" + f.id}>{f.name}</option>)}</optgroup>}
      {docs.length > 0 && <optgroup label={t.files_word}>{docs.map((d) => <option key={d.id} value={"d:" + d.id}>{d.name}</option>)}</optgroup>}
    </select>
  );
}
