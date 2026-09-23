"use client";
import { useState } from "react";
export type Health = {
  champion: string;
  post_deployment: string;
  data_freshness: string | null;
  models: {
    id: string;
    state: string;
    source?: { source_origin: string; splits: Record<string, string> };
    approved_at?: string;
    test: { ml: { wape: number | null; relative_bias: number | null } };
  }[];
};
export function ModelHealth({
  health,
  onRefresh,
}: {
  health: Health | null;
  onRefresh: () => void;
}) {
  const [key, setKey] = useState(""),
    [message, setMessage] = useState(""),
    [report, setReport] = useState<unknown>(null);
  async function action(id: string, action: string) {
    if (!key.trim()) {
      setMessage(
        "Enter the local administrator key to review or change model state.",
      );
      return;
    }
    const response = await fetch(`/api/v1/models/${id}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        action,
        reason: `Human ${action} from model health screen`,
      }),
    });
    const data = await response.json();
    setMessage(
      response.ok
        ? `Model ${action} recorded.`
        : (data.error?.message ?? "Action failed"),
    );
    onRefresh();
  }
  async function inspect(id: string) {
    const r = await fetch(`/api/v1/models/${id}`);
    setReport(await r.json());
  }
  return (
    <section className="glass-panel rounded-3xl p-6 space-y-3">
      <h2 className="text-xl font-semibold">Model health</h2>
      <p>Champion: {health?.champion ?? "deterministic-v1"}</p>
      <p className="text-sm text-cockpit-muted">
        Post-deployment outcomes:{" "}
        {health?.post_deployment ?? "not enough evidence"}. Latest evaluation
        data: {health?.data_freshness ?? "unavailable"}. Historic data is not a
        live operational feed.
      </p>
      <label className="block text-sm">
        Administrator key{" "}
        <input
          type="password"
          autoComplete="off"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          className="ml-2 rounded bg-slate-800 p-2"
          placeholder="Required for model approval"
        />
      </label>
      {message ? <p role="status">{message}</p> : null}
      {health?.models.length ? (
        health.models.map((m) => (
          <div key={m.id} className="border-t border-white/10 pt-3 text-sm">
            <p>
              {m.id} ·{" "}
              {m.source?.source_origin === "real_source"
                ? "Historical FreshRetailNet"
                : "Independent synthetic fixture"}{" "}
              · {m.state} · WAPE{" "}
              {m.test.ml.wape === null
                ? "undefined"
                : `${(m.test.ml.wape * 100).toFixed(1)}%`}{" "}
              · bias{" "}
              {m.test.ml.relative_bias === null
                ? "undefined"
                : `${(m.test.ml.relative_bias * 100).toFixed(1)}%`}{" "}
              · last approval {m.approved_at ?? "none"}
            </p>
            <div className="flex flex-wrap gap-3 mt-2">
              <button onClick={() => void inspect(m.id)}>
                Inspect numeric gates
              </button>
              {["approve", "reject", "activate", "rollback"].map((a) => (
                <button
                  className="rounded border border-white/20 px-2 py-1"
                  key={a}
                  onClick={() => void action(m.id, a)}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>
        ))
      ) : (
        <p className="text-sm">
          No trained candidates. The deterministic baseline is active.
        </p>
      )}
      {report ? (
        <details open>
          <summary>Verified evaluation report</summary>
          <pre className="max-h-80 overflow-auto text-xs">
            {JSON.stringify(report, null, 2)}
          </pre>
        </details>
      ) : null}
    </section>
  );
}
