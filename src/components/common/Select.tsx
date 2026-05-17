export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`h-11 rounded-full border border-white/10 bg-white/[0.045] px-4 text-sm text-cockpit-text outline-none transition focus:border-blue-300/55 focus:bg-blue-400/10 ${props.className ?? ""}`}
    />
  );
}
