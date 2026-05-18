import { useEffect, useState } from "react";

export function QuantityEditor({
  value,
  onCommit
}: {
  value: number;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(String(value));
  }, [editing, value]);

  const commit = () => {
    const next = Math.max(0, Math.round(Number(draft) || 0));
    setDraft(String(next));
    setEditing(false);
    if (next !== value) onCommit(next);
  };

  return (
    <input
      type="number"
      min={0}
      value={draft}
      step={1}
      onFocus={(event) => {
        setEditing(true);
        event.currentTarget.select();
      }}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          setDraft(String(value));
          setEditing(false);
          event.currentTarget.blur();
        }
      }}
      className="h-10 w-20 rounded-xl border border-white/12 bg-[#071225] px-2 text-right text-sm font-semibold text-cockpit-text outline-none transition focus:border-blue-300/60 focus:bg-blue-500/10 focus:shadow-[0_0_0_3px_rgba(59,130,246,0.12)]"
    />
  );
}
