import { AlertTriangle, FileDown, History, LayoutDashboard, PanelsTopLeft } from "lucide-react";

export function Sidebar({ activeView, onChange, onExport }: { activeView: string; onChange: (view: string) => void; onExport: () => void }) {
  const items = [
    { id: "workspace", label: "Workspace", icon: <LayoutDashboard size={18} /> },
    { id: "issues", label: "Data Issues", icon: <AlertTriangle size={18} /> },
    { id: "scenarios", label: "Scenarios", icon: <PanelsTopLeft size={18} /> },
    { id: "history", label: "Run History", icon: <History size={18} /> }
  ];

  return (
    <nav className="border-b border-white/10 bg-[#061022]/70 px-5 py-3 backdrop-blur-xl lg:min-h-[calc(100vh-109px)] lg:w-64 lg:border-b-0 lg:border-r lg:py-6">
      <div className="flex gap-2 overflow-x-auto lg:flex-col">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => onChange(item.id)}
            className={`flex min-h-12 shrink-0 items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition ${
              activeView === item.id ? "bg-blue-500/14 text-cockpit-text ring-1 ring-blue-300/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]" : "text-cockpit-muted hover:bg-white/[0.055] hover:text-cockpit-text"
            }`}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
        <button
          type="button"
          onClick={onExport}
          className="flex min-h-12 shrink-0 items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold text-cockpit-muted transition hover:bg-cyan-400/10 hover:text-cyan-100 lg:mt-2"
        >
          <FileDown size={18} />
          Export
        </button>
      </div>
    </nav>
  );
}
