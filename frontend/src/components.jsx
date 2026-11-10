import React from "react";

// Small shadcn-style primitives (same look and API idea, no extra dependency).
export const cn = (...a) => a.filter(Boolean).join(" ");

const VARIANTS = {
  default: "bg-blue-600 text-white shadow-sm hover:bg-blue-700",
  outline: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
  ghost: "text-slate-600 hover:bg-slate-100",
  destructive: "bg-red-600 text-white hover:bg-red-700",
  soft: "bg-blue-50 text-blue-700 hover:bg-blue-100",
};
const SIZES = { sm: "h-8 px-3 text-xs", md: "h-10 px-4 text-sm", lg: "h-12 px-6 text-base" };

export function Button({ variant = "default", size = "md", className, ...p }) {
  return (
    <button type="button" {...p}
      className={cn("inline-flex items-center justify-center gap-2 rounded-full font-bold transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:pointer-events-none disabled:opacity-50", VARIANTS[variant], SIZES[size], className)} />
  );
}

export function Card({ className, ...p }) {
  return <div {...p} className={cn("rounded-3xl border border-slate-200 bg-white p-5 shadow-sm", className)} />;
}
export const CardTitle = ({ className, ...p }) => <h3 {...p} className={cn("font-display text-base font-extrabold text-slate-900", className)} />;

export function Progress({ value = 0, className, tone = "blue" }) {
  const v = Math.max(0, Math.min(100, value));
  const bar = tone === "green" ? "bg-green-500" : tone === "amber" ? "bg-amber-400" : tone === "red" ? "bg-red-500" : "bg-blue-600";
  return (
    <div role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100} className={cn("h-2.5 w-full overflow-hidden rounded-full bg-slate-100", className)}>
      <div className={cn("h-full rounded-full transition-all duration-500", bar)} style={{ width: v + "%" }}></div>
    </div>
  );
}

const BADGES = { slate: "bg-slate-100 text-slate-700", blue: "bg-blue-50 text-blue-700", green: "bg-green-50 text-green-700", amber: "bg-amber-50 text-amber-800", red: "bg-red-50 text-red-700" };
export function Badge({ tone = "slate", className, ...p }) {
  return <span {...p} className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold", BADGES[tone], className)} />;
}
