export function QuantityEditor({
  value,
  onChange
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <input
      type="number"
      min={0}
      value={value}
      step={1}
      onChange={(event) => onChange(Math.max(0, Math.round(Number(event.target.value) || 0)))}
      className="h-10 w-20 rounded-xl border border-white/12 bg-[#071225] px-2 text-right text-sm font-semibold text-cockpit-text outline-none transition focus:border-blue-300/60 focus:bg-blue-500/10 focus:shadow-[0_0_0_3px_rgba(59,130,246,0.12)]"
    />
  );
}
