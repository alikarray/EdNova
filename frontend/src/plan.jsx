import React, { useState } from "react";
import { Icon, PageHeader, inputCls } from "./ui.jsx";
import { Button, Card, CardTitle, Progress, Badge, cn } from "./components.jsx";
import { fmt, fmtDuration } from "./lib.js";
import { generatePlan, mergeDone, dayKey, addDays, diffDays } from "./plan.js";

const MINUTES = [30, 60, 90, 120];

function PlanForm({ t, folders, docs, plan, onSave, onCancel }) {
  const today = dayKey(new Date());
  const eligible = folders.filter((f) => docs.some((d) => d.folder_id === f.id));
  const [exam, setExam] = useState(plan ? plan.exam : addDays(today, 14));
  const [minutes, setMinutes] = useState(plan ? plan.minutes : 60);
  const [picked, setPicked] = useState(() => new Set(plan && plan.courseIds ? plan.courseIds : eligible.map((f) => f.id)));
  const [err, setErr] = useState(null);

  if (eligible.length === 0) {
    return (
      <Card className="text-center">
        <p className="text-sm text-slate-600">{t.plan_need_courses}</p>
        <Button className="mt-4" onClick={() => onCancel("courses")}>{t.nav_courses}</Button>
      </Card>
    );
  }
  const toggle = (id) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  function submit() {
    if (!exam || diffDays(today, exam) < 1) { setErr(t.plan_exam_past); return; }
    if (picked.size === 0) { setErr(t.plan_pick_one); return; }
    const courses = eligible.filter((f) => picked.has(f.id)).map((f) => ({
      id: f.id, name: f.name,
      docs: docs.filter((d) => d.folder_id === f.id).map((d) => ({ id: d.id, name: d.name, kind: d.kind || "lecture", chars: d.chars })),
    }));
    const next = generatePlan({ today, exam, minutes, courses });
    next.courseIds = courses.map((c) => c.id);
    onSave(mergeDone(next, plan));
  }

  return (
    <Card className="space-y-5">
      <div>
        <label htmlFor="plan-exam" className="mb-1 block text-sm font-bold text-slate-700">{t.plan_exam_date}</label>
        <input id="plan-exam" type="date" value={exam} min={addDays(today, 1)} max={addDays(today, 120)} onChange={(e) => { setExam(e.target.value); setErr(null); }} className={inputCls} />
      </div>
      <div>
        <p className="mb-2 text-sm font-bold text-slate-700">{t.plan_courses}</p>
        <div className="flex flex-wrap gap-2">
          {eligible.map((f) => (
            <button key={f.id} type="button" aria-pressed={picked.has(f.id)} onClick={() => toggle(f.id)}
              className={cn("flex items-center gap-2 rounded-full border-2 px-4 py-2 text-sm font-semibold transition", picked.has(f.id) ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:border-blue-300")}>
              <Icon name={picked.has(f.id) ? "check" : "folder"} className="h-4 w-4" />{f.name}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-2 text-sm font-bold text-slate-700">{t.plan_minutes}</p>
        <div className="inline-flex rounded-full bg-slate-100 p-0.5 text-sm font-bold" role="group">
          {MINUTES.map((m) => (
            <button key={m} type="button" aria-pressed={minutes === m} onClick={() => setMinutes(m)} className={cn("rounded-full px-4 py-2", minutes === m ? "bg-white text-blue-700 shadow-sm" : "text-slate-500")}>{fmt(t.plan_min_n, { n: m })}</button>
          ))}
        </div>
      </div>
      {err && <p role="alert" className="text-sm text-red-700">{err}</p>}
      <div className="flex gap-2">
        <Button className="flex-1" size="lg" onClick={submit} data-testid="plan-build">{t.plan_create}</Button>
        {plan && <Button variant="outline" size="lg" onClick={() => onCancel()}>{t.cancel}</Button>}
      </div>
    </Card>
  );
}

export function Plan({ t, lang, docs, folders, plan, setPlan, openCourse, go, studySecs }) {
  const [edit, setEdit] = useState(false);
  const [sure, setSure] = useState(false);
  const today = dayKey(new Date());
  const loc = lang === "darija" ? "ar" : lang;
  const dayLabel = (k) => new Date(k + "T00:00:00").toLocaleDateString(loc, { weekday: "short", day: "numeric", month: "short" });

  if (!plan || edit) {
    return (
      <div>
        <PageHeader icon="clock" title={t.plan_title} sub={t.plan_sub} />
        <div className="mx-auto max-w-xl p-5 md:p-8">
          <PlanForm t={t} folders={folders} docs={docs} plan={plan}
            onSave={(p) => { setPlan(p); setEdit(false); }} onCancel={(dest) => { if (dest) go(dest); else setEdit(false); }} />
        </div>
      </div>
    );
  }

  const left = diffDays(today, plan.exam);
  const total = plan.tasks.length;
  const done = plan.tasks.filter((x) => x.done).length;
  const todays = plan.tasks.filter((x) => x.day === today);
  const late = plan.tasks.filter((x) => x.day < today && !x.done);
  const upcoming = [];
  for (let i = 1; i <= 7; i++) { const k = addDays(today, i); const ts = plan.tasks.filter((x) => x.day === k); if (ts.length) upcoming.push([k, ts]); }
  const toggle = (id) => setPlan({ ...plan, tasks: plan.tasks.map((x) => (x.id === id ? { ...x, done: !x.done } : x)) });

  const titleOf = (x) => {
    const doc = docs.find((d) => d.id === x.docId);
    const f = folders.find((c) => c.id === x.courseId);
    const name = x.type === "quiz" || x.type === "practice" ? (f ? f.name : x.course) : doc ? doc.name : x.name;
    return fmt(t["plan_task_" + x.type], { name });
  };
  const start = (x) => {
    if (x.type === "quiz" || x.type === "practice") { if (folders.some((c) => c.id === x.courseId)) go("practice", { scope: "f:" + x.courseId }); return; }
    if (docs.some((d) => d.id === x.docId)) openCourse(x.docId);
  };

  const Row = ({ x }) => (
    <div className={cn("flex items-center gap-3 rounded-2xl border p-3", x.done ? "border-green-200 bg-green-50" : "border-slate-200 bg-white")}>
      <button type="button" role="checkbox" aria-checked={x.done} aria-label={t.plan_done} onClick={() => toggle(x.id)}
        className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition", x.done ? "border-green-500 bg-green-500 text-white" : "border-slate-300 hover:border-blue-500")}>
        {x.done && <Icon name="check" className="h-4 w-4" />}
      </button>
      <div className="min-w-0 flex-1">
        <p className={cn("truncate text-sm font-semibold", x.done ? "text-slate-400 line-through" : "text-slate-800")}>{titleOf(x)}</p>
        <p className="text-xs text-slate-500">{fmt(t.plan_min_n, { n: x.minutes })}</p>
      </div>
      {!x.done && <Button size="sm" variant="soft" onClick={() => start(x)}>{t.plan_start}</Button>}
    </div>
  );

  return (
    <div>
      <PageHeader icon="clock" title={t.plan_title} sub={t.plan_sub}
        right={<Button variant="outline" size="sm" onClick={() => setEdit(true)}><Icon name="edit" className="h-4 w-4" />{t.plan_edit}</Button>} />
      <div className="mx-auto max-w-2xl space-y-5 p-5 md:p-8">
        <Card className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="font-display text-3xl font-black text-slate-900" data-testid="days-left">{left > 0 ? fmt(t.plan_days_left, { n: left }) : left === 0 ? t.plan_exam_today : t.plan_exam_past}</p>
              <p className="text-xs text-slate-500">{dayLabel(plan.exam)}</p>
            </div>
            <Badge tone="blue">{fmt(t.plan_progress, { a: done, b: total })}</Badge>
          </div>
          <Progress value={total ? (done / total) * 100 : 0} tone="green" />
          <p className="text-xs text-slate-500">{fmt(t.plan_studied, { a: fmtDuration(t, studySecs), b: fmt(t.plan_min_n, { n: plan.minutes }) })}</p>
        </Card>

        {plan.unscheduled && plan.unscheduled.length > 0 && (
          <p role="alert" className="rounded-2xl bg-amber-50 p-3 text-sm text-amber-900">{fmt(t.plan_warn_unscheduled, { n: plan.unscheduled.length })}</p>
        )}

        {late.length > 0 && (
          <div className="space-y-2">
            <CardTitle>{t.plan_late}</CardTitle>
            {late.map((x) => <Row key={x.id} x={x} />)}
          </div>
        )}

        <div className="space-y-2">
          <CardTitle>{t.plan_today}</CardTitle>
          {todays.length === 0 && <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">{t.plan_nothing_today}</p>}
          {todays.map((x) => <Row key={x.id} x={x} />)}
        </div>

        {upcoming.length > 0 && (
          <div className="space-y-3">
            <CardTitle>{t.plan_upcoming}</CardTitle>
            {upcoming.map(([k, ts]) => (
              <div key={k}>
                <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-400">{dayLabel(k)}</p>
                <div className="space-y-2">{ts.map((x) => <Row key={x.id} x={x} />)}</div>
              </div>
            ))}
          </div>
        )}

        <div className="pt-2 text-center">
          {!sure ? <button className="text-sm text-slate-400 underline" onClick={() => setSure(true)}>{t.plan_delete}</button>
            : <button className="text-sm font-bold text-red-600 underline" onClick={() => { setPlan(null); setSure(false); }}>{t.confirm_again}</button>}
        </div>
      </div>
    </div>
  );
}
