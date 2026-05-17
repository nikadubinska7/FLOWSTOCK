export function DeltaBadge({ value, inverse = false }: { value: string; inverse?: boolean }) {
  const negative = value.trim().startsWith("-");
  const good = inverse ? negative : !negative;
  return (
    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${good ? "border-emerald-300/20 bg-emerald-400/12 text-emerald-200" : "border-amber-300/20 bg-amber-400/12 text-amber-200"}`}>
      {value}
    </span>
  );
}
