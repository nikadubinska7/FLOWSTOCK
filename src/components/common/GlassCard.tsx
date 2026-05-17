import type { ReactNode } from "react";

export function GlassCard({
  children,
  className = "",
  strong = false
}: {
  children: ReactNode;
  className?: string;
  strong?: boolean;
}) {
  return <section className={`${strong ? "glass-panel-strong" : "glass-panel"} rounded-2xl ${className}`}>{children}</section>;
}
