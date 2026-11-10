import React from "react";
import { Icon } from "./ui.jsx";
import { Card, CardTitle, Progress, Button } from "./components.jsx";
import { fmt, fmtDuration } from "./lib.js";
import { dayKey, diffDays } from "./plan.js";

export function StudyCard({ t, study, goalMin }) {
  const max = Math.max(1800, ...study.days.map((d) => d.secs));
  const pct = Math.min(100, (study.today / 60 / goalMin) * 100);
  return (
    <Card data-testid="study-card">
      <div className="flex items-center justify-between">
        <CardTitle>{t.study_time}</CardTitle>
        <span className={"flex items-center gap-1.5 text-xs font-semibold " + (study.active ? "text-green-600" : "text-slate-400")}>
          <span className={"h-2 w-2 rounded-full " + (study.active ? "animate-pulse bg-green-500" : "bg-slate-300")}></span>{study.active ? t.study_active : t.study_paused}
        </span>
      </div>
      <p className="mt-2 font-display text-3xl font-black text-slate-900 tabular-nums">{fmtDuration(t, study.today)}</p>
      <p className="mb-2 text-xs text-slate-500">{fmt(t.study_goal, { n: goalMin })}</p>
      <Progress value={pct} tone={pct >= 100 ? "green" : "blue"} />
      <div className="mt-4 flex h-14 items-end gap-1.5" aria-label={t.study_week}>
        {study.days.map((d, k) => (
          <div key={d.key} className="flex flex-1 flex-col items-center gap-1" title={fmtDuration(t, d.secs)}>
            <div className={"w-full rounded-t-md " + (k === 6 ? "bg-blue-600" : "bg-slate-200")} style={{ height: Math.max(3, (d.secs / max) * 44) + "px" }}></div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-slate-400">{t.study_tracking}</p>
    </Card>
  );
}

export function PlanCard({ t, plan, go }) {
  if (!plan) {
    return (
      <Card>
        <CardTitle>{t.plan_title}</CardTitle>
        <p className="mt-1 text-sm text-slate-500">{t.plan_sub}</p>
        <Button className="mt-3 w-full" variant="soft" onClick={() => go("plan")}><Icon name="clock" className="h-4 w-4" />{t.plan_new}</Button>
      </Card>
    );
  }
  const today = dayKey(new Date());
  const left = diffDays(today, plan.exam);
  const todays = plan.tasks.filter((x) => x.day === today);
  const doneToday = todays.filter((x) => x.done).length;
  const done = plan.tasks.filter((x) => x.done).length;
  return (
    <Card data-testid="plan-card">
      <div className="flex items-center justify-between">
        <CardTitle>{t.plan_title}</CardTitle>
        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800">{left > 0 ? fmt(t.plan_days_left, { n: left }) : t.plan_exam_today}</span>
      </div>
      <p className="mt-2 text-sm text-slate-600">{todays.length ? fmt(t.plan_today_n, { a: doneToday, b: todays.length }) : t.plan_nothing_today}</p>
      <Progress className="mt-3" value={plan.tasks.length ? (done / plan.tasks.length) * 100 : 0} tone="green" />
      <Button className="mt-3 w-full" variant="soft" onClick={() => go("plan")}>{t.plan_open}</Button>
    </Card>
  );
}
