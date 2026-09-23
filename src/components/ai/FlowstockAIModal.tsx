"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Loader2, Send, Sparkles, X } from "lucide-react";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  visualization?: AIVisualization;
};

export type AIVisualization = {
  type: "bar" | "line" | "waterfall" | "comparison_table" | "kpi_cards";
  title: string;
  data: Array<Record<string, string | number>>;
};

export type FlowstockAIContext = {
  kpi_definitions: Record<string, string>;
  active_plan: string;
  current_state_kpis: Record<string, number>;
  simulation_kpis: Record<string, number>;
  forecast_comparison: Array<Record<string, string | number>>;
  risk_summary: Array<Record<string, string | number>>;
  top_reasons_this_run: Array<Record<string, string | number>>;
  selected_filters: Record<string, string>;
  visible_table_count: number;
  approval_summary: Record<string, string | number>;
  data_issue_summary: Record<string, string | number>;
  manual_override_summary: Record<string, string | number>;
  selected_row: Record<string, string | number | boolean> | null;
  uncovered_qty_drivers: Array<Record<string, string | number>>;
  top_uncovered_high_risk_rows: Array<Record<string, string | number | boolean>>;
  top_uncovered_rows: Array<Record<string, string | number | boolean>>;
  top_impact_rows: Array<Record<string, string | number | boolean>>;
  low_value_replenishment_rows: Array<Record<string, string | number | boolean>>;
  gmroi_proxy_rows: Array<Record<string, string | number | boolean>>;
};

const quickPrompts = [
  "What is OOS?",
  "What is Lost Sales Risk?",
  "What is GMROI?",
  "Summarize this plan",
  "Why is High risk not fully covered?",
  "What should I approve first?",
  "Explain DC free stock change",
  "How can I reduce inventory by €100k?",
  "How can I reduce lost sales risk by 30%?",
  "How can I improve OOS?",
  "What is the 3-month projected GMROI?",
  "What if I approve only High-risk rows?",
  "Explain the recommended plan"
];

function contextLabel(value: string) {
  return value && value.trim() ? value : "None";
}

function formatVisualValue(value: string | number) {
  if (typeof value === "string") return value;
  if (!Number.isFinite(value)) return "0";
  if (Math.abs(value) >= 1_000_000) return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (Math.abs(value) >= 1_000) return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
  return value.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

function VisualizationBlock({ visualization }: { visualization: AIVisualization }) {
  const data = visualization.data ?? [];
  if (!data.length) return null;
  const keys = Object.keys(data[0]);
  const labelKey = keys.find((key) => ["label", "kpi", "risk", "scenario"].includes(key)) ?? keys[0];
  const valueKeys = keys.filter((key) => key !== labelKey);
  const maxValue = Math.max(1, ...data.flatMap((row) => valueKeys.map((key) => Math.abs(Number(row[key]) || 0))));

  if (visualization.type === "comparison_table") {
    return (
      <div className="mt-3 overflow-hidden rounded-2xl border border-white/10 bg-[#081224]/70">
        <p className="border-b border-white/10 px-4 py-3 text-sm font-semibold text-cockpit-text">{visualization.title}</p>
        <div className="overflow-auto">
          <table className="w-full min-w-[520px] text-left text-xs">
            <thead className="bg-white/[0.035] text-cockpit-muted">
              <tr>{keys.map((key) => <th key={key} className="px-3 py-2 font-semibold capitalize">{key.replaceAll("_", " ")}</th>)}</tr>
            </thead>
            <tbody>
              {data.map((row, index) => (
                <tr key={index} className="border-t border-white/8">
                  {keys.map((key) => <td key={key} className="px-3 py-2 text-cockpit-text">{formatVisualValue(row[key])}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (visualization.type === "kpi_cards") {
    return (
      <div className="mt-3 rounded-2xl border border-white/10 bg-[#081224]/70 p-3">
        <p className="mb-3 text-sm font-semibold text-cockpit-text">{visualization.title}</p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {data.map((row, index) => (
            <div key={index} className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
              <p className="text-[11px] uppercase tracking-[0.08em] text-cockpit-muted">{String(row.label ?? `KPI ${index + 1}`)}</p>
              <p className="mt-1 text-base font-semibold text-cockpit-text">{formatVisualValue(row.value ?? 0)}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-2xl border border-white/10 bg-[#081224]/70 p-4">
      <p className="mb-3 text-sm font-semibold text-cockpit-text">{visualization.title}</p>
      <div className="space-y-3">
        {data.map((row, index) => {
          const value = Number(row.value ?? valueKeys.map((key) => Number(row[key]) || 0)[0] ?? 0);
          return (
            <div key={index} className="grid grid-cols-[150px_1fr_72px] items-center gap-3 text-xs">
              <span className="truncate text-cockpit-muted">{String(row[labelKey] ?? row.label ?? index + 1)}</span>
              <span className="h-2 overflow-hidden rounded-full bg-white/[0.08]">
                <span
                  className="block h-full rounded-full bg-gradient-to-r from-cyan-300 to-blue-500"
                  style={{ width: `${Math.max(4, (Math.abs(value) / maxValue) * 100)}%` }}
                />
              </span>
              <span className="text-right font-semibold text-cockpit-text">{formatVisualValue(value)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function FlowstockAIModal({
  open,
  onClose,
  context
}: {
  open: boolean;
  onClose: () => void;
  context: FlowstockAIContext;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [setupMessage, setSetupMessage] = useState("");
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const contextChips = useMemo(() => {
    return [
      ["Scenario", contextLabel(context.active_plan)],
      ["Filtered rows", context.visible_table_count.toLocaleString("en-US")],
      ["Risk filter", contextLabel(context.selected_filters.risk)],
      ["Selected row", context.selected_row ? `${context.selected_row.store_id} · ${context.selected_row.sku_id}` : "None"]
    ];
  }, [context]);

  useEffect(() => {
    if (!open) return;
    fetch("/api/ai-chat", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { setupRequired?: boolean; message?: string }) => {
        setSetupMessage(data.setupRequired ? data.message || "OPENAI_API_KEY is not configured yet." : "");
      })
      .catch(() => setSetupMessage("Flowstock AI setup status could not be checked."));
  }, [open]);

  if (!open) return null;

  async function sendMessage(text: string) {
    const prompt = text.trim();
    if (!prompt || loading) return;

    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: prompt }];
    setMessages(nextMessages);
    setInput("");
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/ai-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages, context })
      });
      const data = (await response.json()) as { answer?: string; message?: string; setupRequired?: boolean; error?: string; visualization?: AIVisualization };
      if (!response.ok) throw new Error(data.error || "Flowstock AI could not answer right now.");
      const answer = data.answer || data.message || "I do not have enough data in the current context to answer that.";
      setMessages((current) => [...current, { role: "assistant", content: answer, visualization: data.visualization }]);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Flowstock AI could not answer right now.");
    } finally {
      setLoading(false);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#020617]/70 p-4 backdrop-blur-md">
      <section className="glass-panel-strong flex max-h-[80vh] w-full max-w-5xl flex-col overflow-hidden rounded-[28px] border border-cyan-200/18 shadow-[0_24px_90px_rgba(15,23,42,0.78),0_0_70px_rgba(56,189,248,0.12)]">
        <header className="border-b border-white/10 bg-gradient-to-r from-cyan-400/10 via-blue-500/8 to-violet-500/10 p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-cyan-200/25 bg-cyan-300/12 text-cyan-100 shadow-[0_0_32px_rgba(34,211,238,0.16)]">
                <Bot size={24} />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-2xl font-semibold text-cockpit-text">Flowstock AI</h2>
                  <Sparkles size={16} className="text-cyan-200" />
                </div>
                <p className="mt-1 text-sm text-cockpit-muted">Ask about the current plan, KPIs, rows, risks, and recommendation logic.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.055] text-cockpit-muted transition hover:bg-white/[0.09] hover:text-cockpit-text"
              aria-label="Close Flowstock AI"
            >
              <X size={18} />
            </button>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2 md:grid-cols-4">
            {contextChips.map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-white/10 bg-[#081224]/65 px-3 py-2">
                <p className="text-[11px] uppercase tracking-[0.08em] text-cockpit-muted">{label}</p>
                <p className="mt-1 truncate text-sm font-semibold text-cockpit-text">{value}</p>
              </div>
            ))}
          </div>
        </header>

        <div className="border-b border-white/10 p-4">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {quickPrompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => sendMessage(prompt)}
                disabled={loading}
                className="shrink-0 rounded-full border border-cyan-200/14 bg-cyan-300/8 px-3 py-2 text-xs font-semibold text-cyan-50 transition hover:border-cyan-200/30 hover:bg-cyan-300/14 disabled:cursor-not-allowed disabled:opacity-55"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {messages.length === 0 ? (
            <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5 text-sm leading-6 text-cockpit-muted">
              Flowstock AI is advisory. It can explain the current plan and suggest review actions, but it cannot approve rows, edit quantities, create shipping documents, modify CSVs, or change scenarios.
            </div>
          ) : null}
          {setupMessage ? (
            <div className="mt-4 rounded-3xl border border-amber-300/30 bg-amber-400/10 p-4 text-sm leading-6 text-amber-100">
              {setupMessage}
            </div>
          ) : null}
          <div className="space-y-4">
            {messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[82%] whitespace-pre-wrap rounded-3xl px-4 py-3 text-sm leading-6 ${
                    message.role === "user"
                      ? "bg-blue-500 text-white shadow-action"
                      : "border border-white/10 bg-white/[0.045] text-cockpit-text"
                  }`}
                >
                  {message.content}
                  {message.visualization ? <VisualizationBlock visualization={message.visualization} /> : null}
                </div>
              </div>
            ))}
            {loading ? (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-3xl border border-white/10 bg-white/[0.045] px-4 py-3 text-sm text-cockpit-muted">
                  <Loader2 size={16} className="animate-spin text-cyan-200" />
                  Flowstock AI is reading the current plan...
                </div>
              </div>
            ) : null}
          </div>
          {error ? (
            <div className="mt-4 rounded-2xl border border-red-300/35 bg-red-400/10 p-3 text-sm text-red-100">{error}</div>
          ) : null}
        </div>

        <form
          className="border-t border-white/10 bg-[#081224]/80 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            void sendMessage(input);
          }}
        >
          <div className="flex items-end gap-3">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void sendMessage(input);
                }
              }}
              rows={2}
              placeholder="Ask Flowstock AI..."
              className="min-h-12 flex-1 resize-none rounded-2xl border border-white/10 bg-[#050b18] px-4 py-3 text-sm text-cockpit-text outline-none transition placeholder:text-cockpit-muted focus:border-cyan-200/45 focus:ring-2 focus:ring-cyan-300/10"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="flex h-12 items-center gap-2 rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-600 px-5 text-sm font-semibold text-white shadow-action transition hover:from-cyan-300 hover:to-blue-500 disabled:cursor-not-allowed disabled:opacity-55"
            >
              <Send size={16} />
              Send
            </button>
          </div>
          <p className="mt-2 text-xs text-cockpit-muted">Enter sends. Shift+Enter adds a new line.</p>
        </form>
      </section>
    </div>
  );
}
