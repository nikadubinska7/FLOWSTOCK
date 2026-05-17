"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, FileText, MessageSquare, RefreshCw, SlidersHorizontal } from "lucide-react";
import type { ApprovalResponse, Kpis, RefreshResponse, ScenarioKey, WorkingRow } from "@/lib/domain/types";
import { calculateKpis, recalculateRows } from "@/lib/domain/kpiCalculations";
import { scenarioForKey } from "@/lib/domain/scenarioWeights";
import { AppHeader } from "@/components/layout/AppHeader";
import { Sidebar } from "@/components/layout/Sidebar";
import { KpiPanel } from "@/components/kpi/KpiPanel";
import { ScenarioButtons } from "@/components/replenishment/ScenarioButtons";
import { TableFilters, type Filters } from "@/components/replenishment/TableFilters";
import { ReplenishmentTable } from "@/components/replenishment/ReplenishmentTable";
import { ApprovalBar } from "@/components/replenishment/ApprovalBar";
import { ApprovalModal } from "@/components/replenishment/ApprovalModal";
import { ShippingDocsModal } from "@/components/replenishment/ShippingDocsModal";
import { RowExplanationDrawer } from "@/components/replenishment/RowExplanationDrawer";
import { DataIssuesPanel } from "@/components/data-issues/DataIssuesPanel";
import { ScenarioComparison } from "@/components/scenario/ScenarioComparison";
import { Card } from "@/components/common/Card";
import { Badge } from "@/components/common/Badge";
import { GlassCard } from "@/components/common/GlassCard";
import { money, whole } from "@/lib/utils/formatters";

const emptyKpis: Kpis = {
  inventoryValue: 0,
  daysOfCover: 0,
  oosPercent: 0,
  lostSalesValue: 0,
  marginAtRisk: 0,
  recoveredRevenue: 0,
  recoveredMargin: 0,
  dcFreeStock: 0,
  improvedRows: 0,
  constraintViolations: 0,
  replenishmentUnits: 0
};

const defaultFilters: Filters = {
  search: "",
  store: "",
  category: "",
  risk: "",
  constraint: "",
  promo: "",
  manual: "",
  dataIssue: "",
  finalPositive: ""
};

function filterRows(rows: WorkingRow[], filters: Filters): WorkingRow[] {
  const search = filters.search.trim().toLowerCase();
  return rows.filter((row) => {
    if (filters.store && row.storeName !== filters.store) return false;
    if (filters.category && row.category !== filters.category) return false;
    if (filters.risk && row.riskLevel !== filters.risk) return false;
    if (filters.constraint && row.constraintStatus !== filters.constraint) return false;
    if (filters.promo === "yes" && !row.promoFlag) return false;
    if (filters.promo === "no" && row.promoFlag) return false;
    if (filters.manual === "yes" && !row.manualOverride) return false;
    if (filters.manual === "no" && row.manualOverride) return false;
    if (filters.dataIssue === "yes" && !row.dataIssue) return false;
    if (filters.dataIssue === "no" && row.dataIssue) return false;
    if (filters.finalPositive === "yes" && row.finalQty <= 0) return false;
    if (filters.finalPositive === "no" && row.finalQty > 0) return false;
    if (!search) return true;
    return `${row.storeName} ${row.storeId} ${row.skuId} ${row.styleColorSize} ${row.reasonCode} ${row.constraintMessages.join(" ")}`
      .toLowerCase()
      .includes(search);
  });
}

function SupportingPanels({
  rows,
  dataIssueCount,
  onApproveAll,
  onRunOptimal,
  onOpenIssues
}: {
  rows: WorkingRow[];
  dataIssueCount: number;
  onApproveAll: () => void;
  onRunOptimal: () => void;
  onOpenIssues: () => void;
}) {
  const reasonCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of rows) {
      const reason = row.reasonCode.split("; ")[0] || "No replenishment needed";
      counts.set(reason, (counts.get(reason) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 4);
  }, [rows]);
  const maxReason = Math.max(1, ...reasonCounts.map(([, count]) => count));
  const safeRows = rows.filter((row) => row.finalQty > 0 && row.constraintStatus !== "Blocked").length;
  const blockedRows = rows.filter((row) => row.constraintStatus === "Blocked").length;

  const actions = [
    { label: "Approve all", detail: `${safeRows} valid rows`, icon: <CheckCircle2 size={28} />, onClick: onApproveAll, color: "text-emerald-200 bg-emerald-400/12 ring-emerald-300/20" },
    { label: "Apply optimal", detail: "System recommendation", icon: <RefreshCw size={28} />, onClick: onRunOptimal, color: "text-blue-200 bg-blue-400/12 ring-blue-300/20" },
    { label: "Review issues", detail: `${dataIssueCount} open issues`, icon: <FileText size={28} />, onClick: onOpenIssues, color: "text-amber-200 bg-amber-400/12 ring-amber-300/20" },
    { label: "Add note", detail: "Use row comment", icon: <MessageSquare size={28} />, onClick: () => undefined, color: "text-cyan-200 bg-cyan-400/12 ring-cyan-300/20" }
  ];

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.05fr_1.25fr_0.7fr]">
      <GlassCard className="p-6">
        <h2 className="mb-5 text-lg font-semibold text-cockpit-text">Top reasons this run</h2>
        <div className="space-y-5">
          {reasonCounts.map(([reason, count], index) => (
            <div key={reason} className="grid grid-cols-[1fr_150px_44px] items-center gap-4 text-sm">
              <span className="truncate text-cockpit-muted">{reason}</span>
              <span className="h-2 overflow-hidden rounded-full bg-white/[0.07]">
                <span
                  className={`block h-full rounded-full ${index === 0 ? "bg-rose-400" : index === 1 ? "bg-amber-400" : index === 2 ? "bg-violet-400" : "bg-blue-300"}`}
                  style={{ width: `${Math.max(8, (count / maxReason) * 100)}%` }}
                />
              </span>
              <span className="text-right font-semibold text-cockpit-text">{count}</span>
            </div>
          ))}
        </div>
      </GlassCard>

      <GlassCard className="p-6">
        <h2 className="mb-5 text-lg font-semibold text-cockpit-text">Quick actions</h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={action.onClick}
              className="group rounded-2xl border border-white/10 bg-white/[0.035] p-4 text-left transition hover:-translate-y-0.5 hover:border-blue-300/30 hover:bg-blue-400/10"
            >
              <span className={`mb-4 flex h-16 w-16 items-center justify-center rounded-2xl ring-1 ${action.color}`}>{action.icon}</span>
              <span className="block text-sm font-semibold text-cockpit-text">{action.label}</span>
              <span className="mt-1 block text-xs leading-relaxed text-cockpit-muted">{action.detail}</span>
            </button>
          ))}
        </div>
      </GlassCard>

      <GlassCard strong className="p-6">
        <div className="mb-8 flex items-center justify-between">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-400/12 text-violet-200 ring-1 ring-violet-300/20">
            <SlidersHorizontal size={24} />
          </span>
          <Badge tone={blockedRows ? "red" : "blue"}>{blockedRows} blocked</Badge>
        </div>
        <h2 className="text-lg font-semibold text-cockpit-text">Exception review</h2>
        <p className="mt-5 text-5xl font-semibold leading-none text-cockpit-text">{dataIssueCount}</p>
        <p className="mt-2 text-sm text-cockpit-muted">Open data quality issues</p>
        <button
          type="button"
          onClick={onOpenIssues}
          className="mt-6 w-full rounded-2xl border border-blue-300/30 bg-gradient-to-br from-blue-500 to-blue-700 px-4 py-3 text-sm font-semibold text-white shadow-action transition hover:from-blue-400 hover:to-blue-600"
        >
          Review
        </button>
      </GlassCard>
    </div>
  );
}

export default function FlowstockApp() {
  const [rows, setRows] = useState<WorkingRow[]>([]);
  const [currentKpis, setCurrentKpis] = useState<Kpis>(emptyKpis);
  const [simulationKpis, setSimulationKpis] = useState<Kpis>(emptyKpis);
  const [scenarioComparison, setScenarioComparison] = useState<RefreshResponse["scenarioComparison"]>([]);
  const [dataIssues, setDataIssues] = useState<RefreshResponse["dataIssues"]>([]);
  const [runHistory, setRunHistory] = useState<RefreshResponse["runHistory"]>([]);
  const [runDate, setRunDate] = useState("");
  const [packagePath, setPackagePath] = useState("");
  const [activeScenario, setActiveScenario] = useState("");
  const [activeView, setActiveView] = useState("workspace");
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [impactSort, setImpactSort] = useState<"none" | "desc" | "asc">("none");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [drawerRow, setDrawerRow] = useState<WorkingRow | null>(null);
  const [pendingApproval, setPendingApproval] = useState<{ rows: WorkingRow[]; blocked: number } | null>(null);
  const [shippingPromptOpen, setShippingPromptOpen] = useState(false);
  const [lastApproval, setLastApproval] = useState<ApprovalResponse | null>(null);

  async function refresh() {
    setLoading(true);
    setMessage("Loading latest CSV package...");
    try {
      const response = await fetch("/api/refresh", { cache: "no-store" });
      if (!response.ok) throw new Error("Refresh failed");
      const data = (await response.json()) as RefreshResponse;
      setRows(data.rows);
      setCurrentKpis(data.currentKpis);
      setSimulationKpis(data.simulationKpis);
      setScenarioComparison(data.scenarioComparison);
      setDataIssues(data.dataIssues);
      setRunHistory(data.runHistory);
      setRunDate(data.runDate);
      setPackagePath(data.packagePath);
      setActiveScenario("");
      setImpactSort("none");
      setMessage(`Loaded ${data.rows.length.toLocaleString()} store-SKU rows.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not refresh package.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  const filteredRows = useMemo(() => filterRows(rows, filters), [rows, filters]);
  const sortedFilteredRows = useMemo(() => {
    if (impactSort === "none") return filteredRows;
    return [...filteredRows].sort((a, b) => {
      const aImpact = a.expectedRecoveredRevenue || a.revenueAtRisk;
      const bImpact = b.expectedRecoveredRevenue || b.revenueAtRisk;
      return impactSort === "desc" ? bImpact - aImpact : aImpact - bImpact;
    });
  }, [filteredRows, impactSort]);
  const visibleRows = sortedFilteredRows.slice(0, 350);
  const stores = useMemo(() => Array.from(new Set(rows.map((row) => row.storeName))).sort(), [rows]);
  const categories = useMemo(() => Array.from(new Set(rows.map((row) => row.category))).sort(), [rows]);
  const selectedRows = rows.filter((row) => row.selected);
  const validVisibleRows = filteredRows.filter((row) => row.finalQty > 0 && row.constraintStatus !== "Blocked");

  async function runScenario(scenario: ScenarioKey) {
    setLoading(true);
    setMessage(`Running ${scenarioForKey(scenario).name}...`);
    try {
      const response = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario })
      });
      if (!response.ok) throw new Error("Recommendation failed");
      const data = (await response.json()) as { rows: WorkingRow[]; simulationKpis: Kpis };
      setRows(data.rows);
      setSimulationKpis(data.simulationKpis);
      setActiveScenario(scenarioForKey(scenario).name);
      setImpactSort("desc");
      setMessage(`${scenarioForKey(scenario).name} populated system and final quantities.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not run scenario.");
    } finally {
      setLoading(false);
    }
  }

  function updateRows(mutator: (row: WorkingRow) => WorkingRow) {
    setRows((current) => {
      const next = recalculateRows(current.map(mutator));
      setSimulationKpis(calculateKpis(next, true));
      return next;
    });
  }

  function selectRow(rowId: string, selected: boolean) {
    setRows((current) => current.map((row) => (row.id === rowId ? { ...row, selected } : row)));
  }

  function selectAllVisible(selected: boolean) {
    const ids = new Set(visibleRows.map((row) => row.id));
    setRows((current) => current.map((row) => (ids.has(row.id) ? { ...row, selected } : row)));
  }

  function setFinalQty(rowId: string, value: number) {
    updateRows((row) => (row.id === rowId ? { ...row, finalQty: value } : row));
  }

  function setComment(rowId: string, value: string) {
    updateRows((row) => (row.id === rowId ? { ...row, comment: value } : row));
  }

  function requestApproval(scope: "selected" | "visible") {
    const source = scope === "selected" ? selectedRows : sortedFilteredRows;
    const candidates = source.filter((row) => row.finalQty > 0);
    const valid = candidates.filter((row) => row.constraintStatus !== "Blocked");
    const blocked = candidates.length - valid.length;
    if (valid.length === 0) {
      setMessage("No valid rows with final quantity greater than zero are available for approval.");
      return;
    }
    setPendingApproval({ rows: valid, blocked });
  }

  async function submitApproval(createShippingDocs: boolean) {
    if (!pendingApproval) return;
    setShippingPromptOpen(false);
    setLoading(true);
    setMessage("Writing approval outputs and next-day CSV package...");
    try {
      const response = await fetch("/api/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runDate,
          scenario: activeScenario || "Manual Plan",
          rows: pendingApproval.rows,
          createShippingDocs
        })
      });
      if (!response.ok) throw new Error("Approval failed");
      const result = (await response.json()) as ApprovalResponse;
      setLastApproval(result);
      setPendingApproval(null);
      setMessage(`Approved ${result.approvedRows} rows. Next Refresh will load the new package.`);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not approve rows.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="premium-shell min-h-screen bg-cockpit-bg text-cockpit-text">
      <AppHeader runDate={runDate} packagePath={packagePath} loading={loading} onRefresh={refresh} />
      <div className="lg:flex">
        <Sidebar activeView={activeView} onChange={setActiveView} />
        <div className="mx-auto min-w-0 max-w-[1780px] flex-1 space-y-8 p-8">
          {message ? (
            <div className="glass-panel rounded-2xl px-5 py-4 text-sm text-cockpit-muted">{message}</div>
          ) : null}

          {lastApproval ? (
            <Card className="p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-base font-semibold">Last approval</h2>
                  <p className="text-sm text-cockpit-muted">{lastApproval.approvalId}</p>
                </div>
                <div className="flex flex-wrap gap-2 text-sm">
                  <Badge tone="green">{lastApproval.approvedRows} rows</Badge>
                  <Badge tone="blue">{whole(lastApproval.approvedUnits)} units</Badge>
                  <Badge tone="neutral">{lastApproval.shippingDocsCreated} shipping docs</Badge>
                </div>
              </div>
            </Card>
          ) : null}

          {activeView === "workspace" ? (
            <>
              <KpiPanel title="Current State" current={currentKpis} simulation={simulationKpis} />
              <KpiPanel title="Simulation" current={currentKpis} simulation={simulationKpis} />
              <ScenarioButtons activeScenario={activeScenario} loading={loading} onRun={runScenario} />
              <TableFilters filters={filters} stores={stores} categories={categories} onChange={setFilters} />
              <ReplenishmentTable
                rows={visibleRows}
                totalRows={sortedFilteredRows.length}
                impactSort={impactSort}
                onSelect={selectRow}
                onSelectAllVisible={selectAllVisible}
                onImpactSortChange={setImpactSort}
                onFinalQtyChange={setFinalQty}
                onCommentChange={setComment}
                onOpenRow={setDrawerRow}
              />
              <SupportingPanels
                rows={rows}
                dataIssueCount={dataIssues.length}
                onApproveAll={() => requestApproval("visible")}
                onRunOptimal={() => runScenario("optimal")}
                onOpenIssues={() => setActiveView("issues")}
              />
              <ApprovalBar
                selectedCount={selectedRows.length}
                validVisibleCount={validVisibleRows.length}
                onApproveSelected={() => requestApproval("selected")}
                onApproveAll={() => requestApproval("visible")}
              />
            </>
          ) : null}

          {activeView === "issues" ? <DataIssuesPanel issues={dataIssues} /> : null}
          {activeView === "scenarios" ? <ScenarioComparison rows={scenarioComparison} /> : null}
          {activeView === "history" ? (
            <Card className="p-4">
              <h2 className="mb-4 text-base font-semibold">Run History</h2>
              <div className="overflow-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="bg-cockpit-panel2 text-xs uppercase text-cockpit-muted">
                    <tr>
                      <th className="px-3 py-3">Run date</th>
                      <th className="px-3 py-3">Scenario</th>
                      <th className="px-3 py-3 text-right">Rows</th>
                      <th className="px-3 py-3 text-right">Units</th>
                      <th className="px-3 py-3 text-right">Retail value</th>
                      <th className="px-3 py-3">Package</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runHistory.map((run) => (
                      <tr key={`${run.runDate}-${run.packagePath}`} className="border-t border-cockpit-line">
                        <td className="px-3 py-3">{run.runDate}</td>
                        <td className="px-3 py-3">{run.scenario}</td>
                        <td className="px-3 py-3 text-right">{run.approvedRows}</td>
                        <td className="px-3 py-3 text-right">{whole(run.approvedUnits)}</td>
                        <td className="px-3 py-3 text-right">{money(run.retailValue)}</td>
                        <td className="px-3 py-3 text-cockpit-muted">{run.packagePath}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : null}
        </div>
      </div>

      <RowExplanationDrawer row={drawerRow} onClose={() => setDrawerRow(null)} />
      {pendingApproval && !shippingPromptOpen ? (
        <ApprovalModal
          rows={pendingApproval.rows}
          blockedRowsExcluded={pendingApproval.blocked}
          onCancel={() => setPendingApproval(null)}
          onConfirm={() => setShippingPromptOpen(true)}
        />
      ) : null}
      {pendingApproval && shippingPromptOpen ? (
        <ShippingDocsModal
          onNo={() => submitApproval(false)}
          onYes={() => submitApproval(true)}
        />
      ) : null}
    </main>
  );
}
