import type { ButtonHTMLAttributes, ReactNode } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  children: ReactNode;
};

const variants = {
  primary: "border-blue-400/40 bg-gradient-to-br from-blue-500 to-blue-700 text-white shadow-action hover:from-blue-400 hover:to-blue-600",
  secondary: "border-white/10 bg-white/[0.045] text-cockpit-text shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] hover:border-blue-300/35 hover:bg-blue-400/10",
  danger: "border-red-400/70 bg-red-500/15 text-red-100 hover:bg-red-500/25",
  ghost: "border-transparent bg-transparent text-cockpit-muted hover:bg-white/[0.055] hover:text-cockpit-text"
};

export function Button({ variant = "secondary", className = "", children, ...props }: Props) {
  return (
    <button
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition duration-200 disabled:cursor-not-allowed disabled:opacity-45 ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
