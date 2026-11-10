import { useState, useEffect } from "react";
import { dayKey, addDays } from "./plan.js";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const fmt = (s, vars) => Object.keys(vars).reduce((acc, k) => acc.split("{" + k + "}").join(String(vars[k])), s || "");
export const uid = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + "-" + Math.random().toString(16).slice(2, 10));

// localStorage can be missing or throw (private window, blocked data): always fall back quietly.
export function lsGet(key, def) {
  try { const v = localStorage.getItem(key); return v === null ? def : JSON.parse(v); } catch (e) { return def; }
}
export function lsSet(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* ignore */ } }
export function lsDel(key) { try { localStorage.removeItem(key); } catch (e) { /* ignore */ } }

export function getLearnerId() {
  let id = lsGet("ednova_lid", null);
  if (!id) { id = uid(); lsSet("ednova_lid", id); }
  return id;
}

export async function api(path, { method = "GET", body, form } = {}) {
  const opts = { method, headers: {} };
  if (body) { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(body); }
  if (form) opts.body = form;
  const r = await fetch(path, opts);
  if (!r.ok) {
    let d = "";
    try { const j = await r.json(); d = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail); } catch (e) { /* ignore */ }
    throw new Error(d || r.statusText);
  }
  return r.json();
}

export const tzOffset = () => -new Date().getTimezoneOffset();

// Runs an AI request as a background job and reports its stage, so the screen is never frozen.
export function useRunner() {
  const [st, setSt] = useState(null);
  const [error, setError] = useState(null);
  async function run(path, body) {
    setError(null);
    setSt({ stage: "preparing", elapsed: 0 });
    try {
      const { job_id } = await api(path, { method: "POST", body });
      const t0 = Date.now();
      for (let i = 0; i < 400; i++) {
        await sleep(i < 3 ? 350 : 700);
        const s = await api("/api/jobs/" + job_id);
        if (s.state === "done") { setSt(null); return s.result; }
        if (s.state === "error") throw new Error(s.error && s.error.code === "ai_unavailable" ? "__ai__" : (s.error && s.error.message) || "error");
        setSt({ stage: s.stage, elapsed: Math.round((Date.now() - t0) / 1000), gateway: s.gateway });
      }
      throw new Error("timeout");
    } catch (e) {
      setSt(null);
      setError(e.message);
      return null;
    }
  }
  return { run, st, error, clearError: () => setError(null) };
}

// ---- study-time tracker: counts seconds only while the tab is visible and the learner is active ----
export function useStudyTime() {
  const [store, setStore] = useState(() => lsGet("ednova_study", {}));
  const [active, setActive] = useState(true);
  useEffect(() => {
    let last = Date.now();
    let pending = 0;
    const touch = () => { last = Date.now(); };
    const evs = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    evs.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    const id = setInterval(() => {
      const on = document.visibilityState === "visible" && Date.now() - last < 60000;
      setActive(on);
      if (!on) return;
      pending += 1;
      if (pending >= 5) {
        const cur = lsGet("ednova_study", {});
        const k = dayKey(new Date());
        cur[k] = (cur[k] || 0) + pending;
        pending = 0;
        const keep = {};
        const cutoff = addDays(k, -60);
        Object.keys(cur).forEach((d) => { if (d >= cutoff) keep[d] = cur[d]; });
        lsSet("ednova_study", keep);
        setStore(keep);
      }
    }, 1000);
    return () => { clearInterval(id); evs.forEach((e) => window.removeEventListener(e, touch)); };
  }, []);
  const today = dayKey(new Date());
  const days = [];
  for (let i = 6; i >= 0; i--) { const k = addDays(today, -i); days.push({ key: k, secs: store[k] || 0 }); }
  return { today: store[today] || 0, days, active, total7: days.reduce((a, d) => a + d.secs, 0) };
}

export function fmtDuration(t, secs) {
  const m = Math.floor(secs / 60);
  if (m < 1) return "< 1 " + t.min_short;
  if (m < 60) return m + " " + t.min_short;
  return Math.floor(m / 60) + " " + t.hour_short + " " + String(m % 60).padStart(2, "0");
}
