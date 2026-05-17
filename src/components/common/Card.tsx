import type { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`glass-panel rounded-2xl ${className}`}>{children}</section>;
}
