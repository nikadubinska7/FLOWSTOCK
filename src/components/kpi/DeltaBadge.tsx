export function DeltaBadge({ value, change, inverse = false }: { value: string; change: number; inverse?: boolean }) {
  // Use the numeric change: formatted currencies can put € before the minus sign.
  const neutral = !Number.isFinite(change) || change === 0;
  const good = inverse ? change < 0 : change > 0;
  const colour = neutral
    ? "border-white/10 bg-white/[0.045] text-cockpit-muted"
    : good
      ? "border-emerald-300/20 bg-emerald-400/12 text-emerald-200"
      : "border-amber-300/20 bg-amber-400/12 text-amber-200";
  return (
    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${colour}`}>
      {value}
    </span>
  );
}
