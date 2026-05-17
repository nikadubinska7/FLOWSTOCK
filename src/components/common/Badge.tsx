import type { ReactNode } from "react";

type Tone = "green" | "amber" | "red" | "blue" | "neutral";

const tones: Record<Tone, string> = {
  green: "border-emerald-400/25 bg-emerald-400/12 text-emerald-200",
  amber: "border-amber-300/25 bg-amber-300/12 text-amber-200",
  red: "border-rose-400/30 bg-rose-400/13 text-rose-200",
  blue: "border-blue-300/25 bg-blue-400/12 text-blue-100",
  neutral: "border-white/10 bg-white/[0.045] text-cockpit-muted"
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${tones[tone]}`}>{children}</span>;
}
