// Study-plan generator: pure rules, no AI call, fully deterministic (so it is testable and never "bugs").
// Dates are local "YYYY-MM-DD" strings.
const pad = (n) => String(n).padStart(2, "0");
export const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (k) => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
export const addDays = (k, n) => { const d = parse(k); d.setDate(d.getDate() + n); return dayKey(d); };
export const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);

const KIND_RANK = { lecture: 0, problems: 1, other: 2 };
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round5 = (v) => Math.round(v / 5) * 5;

export function taskMinutes(doc) {
  const read = Math.max(1, Math.round((doc.chars || 0) / 1200));
  if (doc.kind === "problems") return clamp(round5(read * 4), 20, 60);
  if (doc.kind === "other") return 15;
  return clamp(round5(read * 3), 15, 45);
}

// courses: [{id, name, docs:[{id, name, kind, chars}]}]
export function generatePlan({ today, exam, minutes, courses }) {
  const days = diffDays(today, exam);
  if (!(days >= 1)) throw new Error("exam date must be after today");
  const budget = minutes;
  const load = Array(days).fill(0);
  const tasks = [];
  const unscheduled = [];
  let seq = 0;
  const fits = (d, mins, cap) => load[d] === 0 || load[d] + mins <= cap; // an empty day always accepts one task
  const findDay = (from, to, mins, cap) => { for (let d = Math.max(0, from); d <= to; d++) if (fits(d, mins, cap)) return d; return -1; };
  const place = (type, c, doc, mins, d) => {
    load[d] += mins;
    const t = { id: `t${seq++}`, day: addDays(today, d), type, courseId: c.id, docId: doc ? doc.id : null, course: c.name, name: doc ? doc.name : c.name, minutes: mins, done: false };
    tasks.push(t);
    return t;
  };

  // 1) a quiz on each whole course in the last two days
  courses.forEach((c, i) => {
    const d0 = Math.max(0, days - 1 - (i % 2));
    const d = findDay(d0, days - 1, 15, budget);
    if (d < 0) unscheduled.push({ type: "quiz", name: c.name }); else place("quiz", c, null, 15, d);
  });

  // 2) learning tasks (lectures first, then problem sets), interleaved across courses and spread over ~70% of the time
  const queues = courses.map((c) => ({ c, docs: [...c.docs].sort((a, b) => (KIND_RANK[a.kind] ?? 2) - (KIND_RANK[b.kind] ?? 2) || a.name.localeCompare(b.name)) }));
  const learn = [];
  for (let more = true; more;) {
    more = false;
    for (const q of queues) if (q.docs.length) { learn.push({ c: q.c, doc: q.docs.shift() }); more = q.docs.length > 0 || more; }
    if (queues.some((q) => q.docs.length)) more = true;
  }
  const window = Math.max(1, Math.floor(days * 0.7));
  const capLearn = Math.max(15, Math.round(budget * 0.7));
  const placed = [];
  learn.forEach((l, k) => {
    const mins = taskMinutes(l.doc);
    const d = findDay(Math.floor((k * window) / learn.length), days - 1, mins, capLearn);
    if (d < 0) { unscheduled.push({ type: l.doc.kind || "lecture", name: l.doc.name }); return; }
    placed.push({ d, l, task: place(l.doc.kind === "problems" ? "problems" : l.doc.kind === "other" ? "other" : "lecture", l.c, l.doc, mins, d) });
  });

  // 3) spaced reviews 1, 3 and 7 days after each first study session
  placed.sort((a, b) => a.d - b.d);
  for (const p of placed) for (const off of [1, 3, 7]) {
    const target = p.d + off;
    if (target > days - 1) continue;
    const d = findDay(target, days - 1, 10, budget);
    if (d >= 0) place("review", p.l.c, p.l.doc, 10, d);
  }

  // 4) fillers: a short practice quiz on idle days (every 7th day stays free)
  let r = 0;
  for (let d = 0; d < days; d++) if (load[d] === 0 && d % 7 !== 6 && courses.length) place("practice", courses[r++ % courses.length], null, 15, d);

  const ORDER = { lecture: 0, problems: 1, other: 2, review: 3, practice: 4, quiz: 5 };
  tasks.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : ORDER[a.type] - ORDER[b.type]));
  return { exam, created: today, minutes, days, tasks, unscheduled };
}

// Keep ticked tasks when the plan is rebuilt.
export function mergeDone(next, old) {
  if (!old) return next;
  const key = (t) => `${t.type}|${t.docId || t.courseId}|${t.day}`;
  const done = new Set(old.tasks.filter((t) => t.done).map(key));
  return { ...next, tasks: next.tasks.map((t) => (done.has(key(t)) ? { ...t, done: true } : t)) };
}
