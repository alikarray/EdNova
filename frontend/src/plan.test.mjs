import assert from "node:assert/strict";
import { generatePlan, mergeDone, addDays, diffDays, taskMinutes } from "./plan.js";

const mkDoc = (id, kind, chars = 6000) => ({ id, name: id + ".pdf", kind, chars });
const courses = [
  { id: "A", name: "Algorithms", docs: [mkDoc("l1", "lecture"), mkDoc("l2", "lecture", 12000), mkDoc("p1", "problems")] },
  { id: "B", name: "Micro", docs: [mkDoc("m1", "lecture")] },
];
const today = "2026-11-09";

// normal plan
const p = generatePlan({ today, exam: addDays(today, 14), minutes: 60, courses });
assert.equal(p.days, 14);
assert.equal(p.unscheduled.length, 0);
const byDay = {};
for (const t of p.tasks) (byDay[t.day] ||= []).push(t);
for (const [d, ts] of Object.entries(byDay)) {
  const sum = ts.reduce((a, t) => a + t.minutes, 0);
  assert.ok(sum <= 60 || ts.length === 1, `day ${d} overloaded: ${sum}`);
  assert.ok(d >= today && diffDays(today, d) < 14, "task outside the window");
}
for (const id of ["l1", "l2", "p1", "m1"]) assert.equal(p.tasks.filter((t) => t.docId === id && t.type !== "review").length, 1, id + " scheduled once");
for (const t of p.tasks.filter((t) => t.type === "review")) {
  const first = p.tasks.find((x) => x.docId === t.docId && x.type !== "review");
  assert.ok(t.day > first.day, "review comes after the first session");
}
assert.ok(p.tasks.filter((t) => t.type === "quiz").length === 2, "one final quiz per course");
assert.ok(p.tasks.filter((t) => t.type === "quiz").every((t) => diffDays(t.day, p.exam) <= 2), "final quizzes sit in the last two days");

// too tight: 2 days, 30 min
const tight = generatePlan({ today, exam: addDays(today, 2), minutes: 30, courses });
assert.ok(tight.unscheduled.length > 0, "tight plan reports what does not fit");

// one day
const one = generatePlan({ today, exam: addDays(today, 1), minutes: 120, courses });
assert.ok(one.tasks.length > 0);

// errors and edge cases
assert.throws(() => generatePlan({ today, exam: today, minutes: 60, courses }));
assert.equal(generatePlan({ today, exam: addDays(today, 5), minutes: 60, courses: [] }).tasks.length, 0);
assert.equal(addDays("2026-12-31", 1), "2027-01-01");
assert.equal(diffDays("2026-03-28", "2026-03-30"), 2); // across a DST change
assert.ok(taskMinutes({ chars: 0, kind: "lecture" }) >= 15);

// determinism + merge keeps ticks
const p2 = generatePlan({ today, exam: addDays(today, 14), minutes: 60, courses });
assert.deepEqual(p.tasks.map((t) => [t.day, t.type, t.docId]), p2.tasks.map((t) => [t.day, t.type, t.docId]));
p.tasks[0].done = true;
const merged = mergeDone(p2, p);
assert.equal(merged.tasks.filter((t) => t.done).length, 1);
console.log("plan tests OK:", p.tasks.length, "tasks over", p.days, "days");
