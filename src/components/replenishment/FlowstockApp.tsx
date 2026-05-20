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
import { FlowstockAIModal, type FlowstockAIContext } from "@/components/ai/FlowstockAIModal";
import { Card } from "@/components/common/Card";
import { Badge } from "@/components/common/Badge";
import { GlassCard } from "@/components/common/GlassCard";
import { money, whole } from "@/lib/utils/formatters";
import { isApprovalBlocked } from "@/lib/domain/constraints";

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

function csvValue(value: unknown): string {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

function exportRowsToCsv(rows: WorkingRow[], activeScenario: string) {
  const columns: Array<[string, (row: WorkingRow) => string | number]> = [
    ["Store ID", (row) => row.storeId],
    ["Store", (row) => row.storeName],
    ["Category", (row) => row.category],
    ["SKU", (row) => row.skuId],
    ["Product", (row) => row.styleColorSize],
    ["Product description", (row) => row.productDescription],
    ["System rec.", (row) => row.systemRecommendedQty],
    ["Final qty", (row) => row.finalQty],
    ["Required qty", (row) => row.requiredQty],
    ["Stock on hand", (row) => row.stockOnHand],
    ["In transit", (row) => row.inTransitQty],
    ["Average daily sales", (row) => row.averageDailySales],
    ["Forecast 7d", (row) => row.forecastNext7],
    ["Forecast 14d", (row) => row.forecastNext14],
    ["Days cover", (row) => row.daysOfCover],
    ["Projected days cover", (row) => row.projectedDaysOfCover],
    ["Days to delivery", (row) => row.daysToDelivery],
    ["Pack / MOQ", (row) => row.packMultiple],
    ["DC total stock", (row) => row.dcTotalStock],
    ["DC free stock", (row) => row.dcFreeStock],
    ["Revenue at risk", (row) => row.revenueAtRisk],
    ["Margin at risk", (row) => row.marginAtRisk],
    ["Expected recovered revenue", (row) => row.expectedRecoveredRevenue],
    ["Expected recovered margin", (row) => row.expectedRecoveredMargin],
    ["Forecast confidence", (row) => row.forecastConfidence],
    ["Promo flag", (row) => (row.promoFlag ? "Yes" : "No")],
    ["Risk", (row) => row.riskLevel],
    ["Reason", (row) => row.reasonCode],
    ["Status", (row) => row.constraintStatus],
    ["Constraint messages", (row) => row.constraintMessages.join("; ")],
    ["Manual override", (row) => (row.manualOverride ? "Yes" : "No")],
    ["Comment", (row) => row.comment],
    ["Route", (row) => row.routeId],
    ["Delivery day", (row) => row.deliveryDay]
  ];
  const csv = [
    columns.map(([label]) => csvValue(label)).join(","),
    ...rows.map((row) => columns.map(([, get]) => csvValue(get(row))).join(","))
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const scenarioName = activeScenario ? activeScenario.toLowerCase().replaceAll(" ", "-") : "manual-plan";
  anchor.href = url;
  anchor.download = `flowstock-table-${scenarioName}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function availableDcForEditedRow(rows: WorkingRow[], edited: WorkingRow): number {
  return Math.max(
    0,
    (edited.dcFreeStockOriginal ?? edited.dcFreeStock) -
      rows.reduce((sum, row) => sum + (row.skuId === edited.skuId && row.id !== edited.id ? row.finalQty : 0), 0)
  );
}

function validationNoticesForEdit(rows: WorkingRow[], editedRowId: string): string[] {
  const row = rows.find((candidate) => candidate.id === editedRowId);
  if (!row) return [];
  const notices: string[] = [];
  if (row.constraintMessages.some((message) => message.includes("DC free stock"))) {
    const available = availableDcForEditedRow(rows, row);
    notices.push(`DC stock exceeded. Available: ${whole(available)}, entered: ${whole(row.finalQty)}.`);
  }
  if (row.finalQty > 0 && row.finalQty % row.packMultiple !== 0) {
    notices.push(`Final Qty must be a multiple of Pack / MOQ: ${whole(row.packMultiple)}.`);
  }
  return notices;
}

const tableRiskRank: Record<WorkingRow["riskLevel"], number> = { High: 3, Medium: 2, Low: 1 };

type RiskGroup = "High" | "Medium" | "Low";

function uncoveredQty(row: WorkingRow): number {
  return Math.max(0, row.requiredQty - row.finalQty);
}

function recommendationExplanation(row: WorkingRow, activeScenario: string): string {
  const riskWhy = row.riskLevel === "High"
    ? "This row is High risk because days cover is low, revenue at risk is high, or stockout is projected."
    : row.riskLevel === "Medium"
      ? "This row is Medium risk because cover, confidence, or DC availability needs attention."
      : "This row is Low risk because the current cover position is relatively healthy.";
  if (row.constraintStatus === "Blocked") return `${riskWhy} Status is Blocked because the row has a blocker-level data issue or missing required data.`;
  if (row.requiredQty <= 0) return `${riskWhy} Required Qty is the baseline need before scenario recommendation. It is 0 because available stock covers forecast demand.`;
  if (row.systemRecommendedQty <= 0) {
    if (row.reasonCode.includes("no DC free stock")) return `${riskWhy} Required Qty is the baseline need before scenario recommendation: ${whole(row.requiredQty)}. System recommended 0 because DC free stock for this SKU is 0 after higher-priority allocation.`;
    if (row.reasonCode.includes("below Pack / MOQ")) return `${riskWhy} Required Qty is the baseline need before scenario recommendation: ${whole(row.requiredQty)}. System recommended 0 because remaining DC free stock is below the Pack / MOQ.`;
    if (row.reasonCode.includes("no forecast demand")) return `${riskWhy} Required Qty is 0 because there is no forecast demand.`;
    return `${riskWhy} Required Qty is the baseline need before scenario recommendation: ${whole(row.requiredQty)}. System recommended 0 because data quality or DC availability prevents a shipment.`;
  }
  if (row.systemRecommendedQty < row.requiredQty) return `${riskWhy} Required Qty is the baseline need before scenario recommendation: ${whole(row.requiredQty)}. System recommended ${whole(row.systemRecommendedQty)} because ${activeScenario || "the scenario"} partially covered the need using available DC stock and Pack / MOQ rules.`;
  return `${riskWhy} Required Qty is the baseline need before scenario recommendation: ${whole(row.requiredQty)}. System recommended ${whole(row.systemRecommendedQty)} and all data checks passed.`;
}

function driverForRow(row: WorkingRow): string {
  const reason = row.reasonCode.toLowerCase();
  if (row.constraintStatus === "Blocked") return "data blocked";
  if (reason.includes("no dc free stock")) return "no DC stock";
  if (reason.includes("dc shortage allocation")) return "partial DC shortage";
  if (reason.includes("below pack")) return "MOQ rounding";
  if (reason.includes("pack multiple") || reason.includes("moq")) return "MOQ rounding";
  if (row.requiredQty <= 0 || reason.includes("no replenishment needed")) return "not needed";
  return "other";
}

function compactRow(row: WorkingRow): Record<string, string | number | boolean> {
  return {
    store_id: row.storeId,
    store_name: row.storeName,
    sku_id: row.skuId,
    product: row.styleColorSize,
    category: row.category,
    risk_level: row.riskLevel,
    status: row.constraintStatus,
    required_qty: row.requiredQty,
    system_recommended_qty: row.systemRecommendedQty,
    final_qty: row.finalQty,
    uncovered_qty: uncoveredQty(row),
    stock_on_hand: row.stockOnHand,
    in_transit_qty: row.inTransitQty,
    forecast_7d: row.forecastNext7,
    days_cover: row.daysOfCover,
    pack_moq: row.packMultiple,
    dc_free_stock: row.dcFreeStock,
    revenue_at_risk: row.revenueAtRisk,
    recovered_revenue: row.expectedRecoveredRevenue,
    expected_recovered_margin: row.expectedRecoveredMargin,
    unit_cost: row.unitCost,
    selling_price: row.sellingPrice,
    gross_margin_pct: row.grossMarginPct,
    forecast_14d: row.forecastNext14,
    manual_override: row.manualOverride,
    comment: row.comment,
    reason: row.reasonCode,
    data_issue: row.dataIssue,
    data_issue_description: row.dataIssueDescription
  };
}

function topReasons(rows: WorkingRow[]) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const reasons = row.reasonCode.split("; ").filter(Boolean);
    for (const reason of reasons.length ? reasons : ["No reason"]) {
      counts.set(reason, (counts.get(reason) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([reason, count]) => ({ reason, count }));
}

function uncoveredDriver(row: WorkingRow, activeScenario: string): string {
  const reason = row.reasonCode.toLowerCase();
  if (row.constraintStatus === "Blocked" || row.dataIssue) return "Data blocked or data issue";
  if (row.systemRecommendedQty === 0 && row.requiredQty > 0 && reason.includes("no dc free stock")) return "No DC free stock";
  if (row.systemRecommendedQty === 0 && row.requiredQty > 0 && reason.includes("below pack")) return "DC stock below Pack / MOQ";
  if (row.systemRecommendedQty > 0 && row.systemRecommendedQty < row.requiredQty && reason.includes("dc shortage")) return "Partial DC shortage allocation";
  if (row.systemRecommendedQty > 0 && row.systemRecommendedQty < row.requiredQty && activeScenario.toLowerCase().includes("lean")) return "Lean scenario conservative target";
  if (row.systemRecommendedQty > 0 && row.systemRecommendedQty < row.requiredQty) return "Scenario recommends partial coverage";
  if (row.finalQty < row.systemRecommendedQty) return "Manual reduction";
  if (reason.includes("pack multiple")) return "Pack / MOQ rounding";
  if (row.requiredQty > 0 && row.finalQty === 0) return "No replenishment recommended";
  return "Other";
}

function uncoveredDriverSummary(rows: WorkingRow[], activeScenario: string) {
  const summary = new Map<string, { rows: number; uncoveredQty: number; revenueAtRisk: number; recoveredRevenue: number }>();
  for (const row of rows) {
    const uncovered = uncoveredQty(row);
    if (uncovered <= 0) continue;
    const driver = uncoveredDriver(row, activeScenario);
    const current = summary.get(driver) ?? { rows: 0, uncoveredQty: 0, revenueAtRisk: 0, recoveredRevenue: 0 };
    current.rows += 1;
    current.uncoveredQty += uncovered;
    current.revenueAtRisk += row.revenueAtRisk;
    current.recoveredRevenue += row.expectedRecoveredRevenue;
    summary.set(driver, current);
  }
  return Array.from(summary.entries())
    .map(([driver, values]) => ({
      driver,
      rows: values.rows,
      uncovered_qty: Math.round(values.uncoveredQty),
      revenue_at_risk: Math.round(values.revenueAtRisk),
      recovered_revenue: Math.round(values.recoveredRevenue)
    }))
    .sort((a, b) => b.uncovered_qty - a.uncovered_qty)
    .slice(0, 8);
}

function ScenarioSummary({ activeScenario, rows, onRiskGroupClick }: { activeScenario: string; rows: WorkingRow[]; onRiskGroupClick: (risk: RiskGroup) => void }) {
  if (!activeScenario) return null;
  const groups = (["High", "Medium", "Low"] as const).map((risk) => {
    const groupRows = rows.filter((row) => row.riskLevel === risk);
    return {
      risk,
      replenished: groupRows.reduce((sum, row) => sum + row.finalQty, 0),
      required: groupRows.reduce((sum, row) => sum + row.requiredQty, 0),
      recovered: groupRows.reduce((sum, row) => sum + row.expectedRecoveredRevenue, 0),
      atRisk: groupRows.reduce((sum, row) => sum + row.revenueAtRisk, 0)
    };
  });

  return (
    <section className="glass-panel rounded-3xl p-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cockpit-muted">Active scenario</p>
          <h2 className="mt-1 text-lg font-semibold text-cockpit-text">{activeScenario}</h2>
        </div>
        <div className="grid flex-1 grid-cols-1 gap-3 md:grid-cols-3 xl:max-w-5xl">
          {groups.map((group) => (
            <button key={group.risk} type="button" onClick={() => onRiskGroupClick(group.risk)} className="rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3 text-left transition hover:border-blue-300/30 hover:bg-blue-400/10">
              <p className={`text-sm font-semibold ${group.risk === "High" ? "text-red-200" : group.risk === "Medium" ? "text-amber-200" : "text-emerald-200"}`}>{group.risk} risk</p>
              <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-cockpit-muted">
                <div>
                  <span className="block">Replenished qty</span>
                  <strong className="mt-1 block text-sm text-cockpit-text">{whole(group.replenished)} / {whole(group.required)}</strong>
                </div>
                <div>
                  <span className="block">Recovered revenue</span>
                  <strong className="mt-1 block text-sm text-cockpit-text">{money(group.recovered)} / {money(group.atRisk)}</strong>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function RowRiskExplanationCard({ row, activeScenario, onClose }: { row: WorkingRow; activeScenario: string; onClose: () => void }) {
  const metrics = [
    ["Status", row.constraintStatus],
    ["Required Qty", whole(row.requiredQty)],
    ["System rec.", whole(row.systemRecommendedQty)],
    ["Final Qty", whole(row.finalQty)],
    ["Uncovered Qty", whole(uncoveredQty(row))],
    ["Stock on hand", whole(row.stockOnHand)],
    ["In transit", whole(row.inTransitQty)],
    ["Forecast 7d", whole(row.forecastNext7)],
    ["Days cover", whole(row.daysOfCover)],
    ["Pack / MOQ", whole(row.packMultiple)],
    ["DC free stock", whole(row.dcFreeStock)],
    ["Scenario", activeScenario || "No scenario run"]
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#020617]/55 p-4 backdrop-blur-sm">
      <div className="glass-panel-strong w-full max-w-2xl rounded-3xl p-6 shadow-cockpit">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cockpit-muted">Risk explanation</p>
            <h2 className="mt-1 text-xl font-semibold text-cockpit-text">{row.riskLevel} risk · {row.storeName}</h2>
            <p className="mt-1 text-sm text-cockpit-muted">{row.skuId} · {row.styleColorSize}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl border border-white/10 bg-white/[0.045] px-3 py-2 text-sm text-cockpit-muted hover:text-cockpit-text">Close</button>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {metrics.map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.035] p-3">
              <p className="text-xs text-cockpit-muted">{label}</p>
              <p className="mt-1 text-sm font-semibold text-cockpit-text">{value}</p>
            </div>
          ))}
        </div>
        <p className="mt-5 rounded-2xl border border-blue-300/15 bg-blue-400/8 p-4 text-sm leading-6 text-cockpit-muted">
          {recommendationExplanation(row, activeScenario)}
        </p>
      </div>
    </div>
  );
}

function RiskGroupExplanationCard({ risk, rows, onClose }: { risk: RiskGroup; rows: WorkingRow[]; onClose: () => void }) {
  const groupRows = rows.filter((row) => row.riskLevel === risk);
  const totals = {
    required: groupRows.reduce((sum, row) => sum + row.requiredQty, 0),
    system: groupRows.reduce((sum, row) => sum + row.systemRecommendedQty, 0),
    final: groupRows.reduce((sum, row) => sum + row.finalQty, 0),
    uncovered: groupRows.reduce((sum, row) => sum + uncoveredQty(row), 0),
    recovered: groupRows.reduce((sum, row) => sum + row.expectedRecoveredRevenue, 0),
    stillAtRisk: groupRows.reduce((sum, row) => sum + Math.max(0, row.revenueAtRisk - row.expectedRecoveredRevenue), 0),
    valid: groupRows.filter((row) => row.constraintStatus === "Valid").length,
    blocked: groupRows.filter((row) => row.constraintStatus === "Blocked").length
  };
  const drivers = ["no DC stock", "partial DC shortage", "MOQ rounding", "not needed", "data blocked"] as const;
  const driverRows = drivers.map((driver) => ({
    driver,
    qty: groupRows.filter((row) => driverForRow(row) === driver).reduce((sum, row) => sum + uncoveredQty(row), 0)
  })).filter((driver) => driver.qty > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#020617]/55 p-4 backdrop-blur-sm">
      <div className="glass-panel-strong w-full max-w-2xl rounded-3xl p-6 shadow-cockpit">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cockpit-muted">Risk group explanation</p>
            <h2 className="mt-1 text-xl font-semibold text-cockpit-text">{risk} risk</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl border border-white/10 bg-white/[0.045] px-3 py-2 text-sm text-cockpit-muted hover:text-cockpit-text">Close</button>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-3"><p className="text-xs text-cockpit-muted">Required Qty</p><p className="mt-1 font-semibold">{whole(totals.required)}</p></div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-3"><p className="text-xs text-cockpit-muted">System Rec.</p><p className="mt-1 font-semibold">{whole(totals.system)}</p></div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-3"><p className="text-xs text-cockpit-muted">Final Qty</p><p className="mt-1 font-semibold">{whole(totals.final)}</p></div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-3"><p className="text-xs text-cockpit-muted">Uncovered Qty</p><p className="mt-1 font-semibold">{whole(totals.uncovered)}</p></div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-3"><p className="text-xs text-cockpit-muted">Recovered revenue</p><p className="mt-1 font-semibold">{money(totals.recovered)}</p></div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-3"><p className="text-xs text-cockpit-muted">Revenue still at risk</p><p className="mt-1 font-semibold">{money(totals.stillAtRisk)}</p></div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-3"><p className="text-xs text-cockpit-muted">Rows</p><p className="mt-1 font-semibold">{whole(groupRows.length)}</p></div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-3"><p className="text-xs text-cockpit-muted">Status</p><p className="mt-1 font-semibold">{whole(totals.valid)} valid / {whole(totals.blocked)} blocked</p></div>
        </div>
        <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.035] p-4">
          <p className="mb-3 text-sm font-semibold text-cockpit-text">Main drivers of uncovered quantity</p>
          {driverRows.length ? (
            <div className="space-y-2">
              {driverRows.map((driver) => (
                <div key={driver.driver} className="flex items-center justify-between text-sm text-cockpit-muted">
                  <span>{driver.driver}</span>
                  <span className="font-semibold text-cockpit-text">{whole(driver.qty)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-cockpit-muted">No uncovered quantity in this risk group.</p>
          )}
        </div>
      </div>
    </div>
  );
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
  const safeRows = rows.filter((row) => row.finalQty > 0 && !isApprovalBlocked(row)).length;
  const blockedRows = rows.filter((row) => row.finalQty > 0 && isApprovalBlocked(row)).length;

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
  const [validationNotices, setValidationNotices] = useState<string[]>([]);
  const [frozenOrderIds, setFrozenOrderIds] = useState<string[] | null>(null);
  const [explanationRow, setExplanationRow] = useState<WorkingRow | null>(null);
  const [explanationRiskGroup, setExplanationRiskGroup] = useState<RiskGroup | null>(null);
  const [aiOpen, setAiOpen] = useState(false);

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
      setFrozenOrderIds(null);
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
    const baseRows = impactSort === "none" ? filteredRows : [...filteredRows].sort((a, b) => {
      const riskDelta = tableRiskRank[b.riskLevel] - tableRiskRank[a.riskLevel];
      if (riskDelta !== 0) return riskDelta;
      const aImpact = a.expectedRecoveredRevenue || a.revenueAtRisk;
      const bImpact = b.expectedRecoveredRevenue || b.revenueAtRisk;
      return impactSort === "desc" ? bImpact - aImpact : aImpact - bImpact;
    });

    if (!frozenOrderIds) return baseRows;

    const frozenOrder = new Map(frozenOrderIds.map((id, index) => [id, index]));
    const baseOrder = new Map(baseRows.map((row, index) => [row.id, index]));
    return [...baseRows].sort((a, b) => {
      const aFrozen = frozenOrder.get(a.id);
      const bFrozen = frozenOrder.get(b.id);
      if (aFrozen !== undefined && bFrozen !== undefined) return aFrozen - bFrozen;
      if (aFrozen !== undefined) return -1;
      if (bFrozen !== undefined) return 1;
      return (baseOrder.get(a.id) ?? 0) - (baseOrder.get(b.id) ?? 0);
    });
  }, [filteredRows, frozenOrderIds, impactSort]);
  const visibleRows = sortedFilteredRows.slice(0, 350);
  const stores = useMemo(() => Array.from(new Set(rows.map((row) => row.storeName))).sort(), [rows]);
  const categories = useMemo(() => Array.from(new Set(rows.map((row) => row.category))).sort(), [rows]);
  const selectedRows = rows.filter((row) => row.selected);
  const validVisibleRows = filteredRows.filter((row) => row.finalQty > 0 && !isApprovalBlocked(row));
  const aiContext = useMemo<FlowstockAIContext>(() => {
    const riskSummary = (["High", "Medium", "Low"] as const).map((risk) => {
      const groupRows = rows.filter((row) => row.riskLevel === risk);
      return {
        risk,
        row_count: groupRows.length,
        valid_rows: groupRows.filter((row) => row.constraintStatus === "Valid").length,
        blocked_rows: groupRows.filter((row) => row.constraintStatus === "Blocked").length,
        baseline_required_qty: groupRows.reduce((sum, row) => sum + row.requiredQty, 0),
        system_recommended_qty: groupRows.reduce((sum, row) => sum + row.systemRecommendedQty, 0),
        final_qty: groupRows.reduce((sum, row) => sum + row.finalQty, 0),
        uncovered_qty: groupRows.reduce((sum, row) => sum + uncoveredQty(row), 0),
        net_uncovered_qty: Math.max(0, groupRows.reduce((sum, row) => sum + row.requiredQty, 0) - groupRows.reduce((sum, row) => sum + row.finalQty, 0)),
        baseline_revenue_at_risk: groupRows.reduce((sum, row) => sum + row.revenueAtRisk, 0),
        recovered_revenue: groupRows.reduce((sum, row) => sum + row.expectedRecoveredRevenue, 0)
      };
    });
    const approvalRows = filteredRows.filter((row) => row.finalQty > 0);
    const manualRows = rows.filter((row) => row.manualOverride);
    const selectedContextRow = selectedRows[0] ?? drawerRow ?? explanationRow ?? null;
    const lowValueRows = rows
      .filter((row) => row.finalQty > 0)
      .sort((a, b) => {
        const aRevenuePerUnit = a.finalQty > 0 ? a.expectedRecoveredRevenue / a.finalQty : 0;
        const bRevenuePerUnit = b.finalQty > 0 ? b.expectedRecoveredRevenue / b.finalQty : 0;
        const riskDelta = tableRiskRank[a.riskLevel] - tableRiskRank[b.riskLevel];
        if (riskDelta !== 0) return riskDelta;
        return aRevenuePerUnit - bRevenuePerUnit;
      });
    const gmroiProxyRows = rows
      .filter((row) => row.finalQty > 0)
      .sort((a, b) => {
        const aRevenuePerUnit = a.finalQty > 0 ? a.expectedRecoveredRevenue / a.finalQty : 0;
        const bRevenuePerUnit = b.finalQty > 0 ? b.expectedRecoveredRevenue / b.finalQty : 0;
        const marginDelta = a.grossMarginPct - b.grossMarginPct;
        if (marginDelta !== 0) return marginDelta;
        return aRevenuePerUnit - bRevenuePerUnit;
      });

    return {
      kpi_definitions: {
        OOS: "Out of Stock risk: percentage of active store-SKU rows projected to stock out or fall below critical cover.",
        "Lost Sales Risk": "Revenue expected to be missed because demand cannot be served with available stock.",
        GMROI: "Gross Margin Return on Inventory Investment: projected gross margin divided by average inventory cost.",
        "Days Cover": "Estimated days of demand that current available stock can cover.",
        "DC Free Stock": "Distribution center stock available for new replenishment after reservations.",
        "Recovered Revenue": "Revenue expected to be protected by the planned replenishment."
      },
      active_scenario: activeScenario || "No scenario run",
      current_state_kpis: currentKpis,
      simulation_kpis: simulationKpis,
      scenario_comparison: scenarioComparison.map((scenario) => ({
        name: scenario.name,
        replenishmentUnits: scenario.replenishmentUnits,
        inventoryValue: scenario.inventoryValue,
        lostSalesValue: scenario.lostSalesValue,
        recoveredRevenue: scenario.recoveredRevenue,
        recoveredMargin: scenario.recoveredMargin,
        oosPercent: scenario.oosPercent,
        constraintViolations: scenario.constraintViolations
      })),
      risk_summary: riskSummary,
      top_reasons_this_run: topReasons(rows),
      selected_filters: filters,
      visible_table_count: sortedFilteredRows.length,
      approval_summary: {
        selected_rows: selectedRows.length,
        selected_units: selectedRows.reduce((sum, row) => sum + row.finalQty, 0),
        valid_visible_rows: validVisibleRows.length,
        valid_visible_units: validVisibleRows.reduce((sum, row) => sum + row.finalQty, 0),
        visible_rows_with_final_qty: approvalRows.length,
        visible_rows_blocked_for_approval: approvalRows.filter((row) => isApprovalBlocked(row)).length
      },
      data_issue_summary: {
        issue_records: dataIssues.length,
        blocker_issue_records: dataIssues.filter((issue) => issue.blocksApproval || issue.severity.toLowerCase() === "blocker").length,
        warning_issue_records: dataIssues.filter((issue) => !issue.blocksApproval && issue.severity.toLowerCase() !== "blocker").length,
        rows_with_data_issue: rows.filter((row) => row.dataIssue).length
      },
      manual_override_summary: {
        manual_override_rows: manualRows.length,
        manual_override_rows_missing_comment: manualRows.filter((row) => !row.comment.trim()).length,
        system_units_on_manual_rows: manualRows.reduce((sum, row) => sum + row.systemRecommendedQty, 0),
        final_units_on_manual_rows: manualRows.reduce((sum, row) => sum + row.finalQty, 0),
        unit_delta_on_manual_rows: manualRows.reduce((sum, row) => sum + row.finalQty - row.systemRecommendedQty, 0)
      },
      selected_row: selectedContextRow ? compactRow(selectedContextRow) : null,
      uncovered_qty_drivers: uncoveredDriverSummary(rows, activeScenario || "No scenario run"),
      top_uncovered_high_risk_rows: rows
        .filter((row) => row.riskLevel === "High" && uncoveredQty(row) > 0)
        .sort((a, b) => uncoveredQty(b) - uncoveredQty(a) || b.revenueAtRisk - a.revenueAtRisk)
        .slice(0, 50)
        .map(compactRow),
      top_uncovered_rows: rows
        .filter((row) => uncoveredQty(row) > 0)
        .sort((a, b) => uncoveredQty(b) - uncoveredQty(a) || b.revenueAtRisk - a.revenueAtRisk)
        .slice(0, 50)
        .map(compactRow),
      top_impact_rows: [...rows]
        .sort((a, b) => (b.expectedRecoveredRevenue || b.revenueAtRisk) - (a.expectedRecoveredRevenue || a.revenueAtRisk))
        .slice(0, 50)
        .map(compactRow),
      low_value_replenishment_rows: lowValueRows
        .slice(0, 50)
        .map(compactRow),
      gmroi_proxy_rows: gmroiProxyRows
        .slice(0, 50)
        .map(compactRow)
    };
  }, [
    activeScenario,
    currentKpis,
    dataIssues,
    drawerRow,
    explanationRow,
    filteredRows,
    filters,
    rows,
    scenarioComparison,
    selectedRows,
    simulationKpis,
    sortedFilteredRows.length,
    validVisibleRows
  ]);

  function exportCurrentTable() {
    exportRowsToCsv(sortedFilteredRows, activeScenario);
    setMessage(`Exported ${sortedFilteredRows.length.toLocaleString()} filtered rows to CSV.`);
  }

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
      setFrozenOrderIds(null);
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
    setFrozenOrderIds(sortedFilteredRows.map((row) => row.id));
    setRows((current) => {
      const next = recalculateRows(current.map((row) => (row.id === rowId ? { ...row, finalQty: value } : row)));
      setSimulationKpis(calculateKpis(next, true));
      setValidationNotices(validationNoticesForEdit(next, rowId));
      return next;
    });
  }

  function setComment(rowId: string, value: string) {
    updateRows((row) => (row.id === rowId ? { ...row, comment: value } : row));
  }

  function requestApproval(scope: "selected" | "visible") {
    const source = scope === "selected" ? selectedRows : sortedFilteredRows;
    const candidates = source.filter((row) => row.finalQty > 0);
    const valid = candidates.filter((row) => !isApprovalBlocked(row));
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
        <Sidebar activeView={activeView} onChange={setActiveView} onExport={exportCurrentTable} onOpenAi={() => setAiOpen(true)} />
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
              <TableFilters
                filters={filters}
                stores={stores}
                categories={categories}
                onChange={(nextFilters) => {
                  setFrozenOrderIds(null);
                  setFilters(nextFilters);
                }}
              />
              <ScenarioSummary activeScenario={activeScenario} rows={rows} onRiskGroupClick={setExplanationRiskGroup} />
              <ReplenishmentTable
                rows={visibleRows}
                totalRows={sortedFilteredRows.length}
                impactSort={impactSort}
                onSelect={selectRow}
                onSelectAllVisible={selectAllVisible}
                onImpactSortChange={(sort) => {
                  setFrozenOrderIds(null);
                  setImpactSort(sort);
                }}
                onFinalQtyChange={setFinalQty}
                onCommentChange={setComment}
                onOpenRow={setDrawerRow}
                onRiskClick={setExplanationRow}
                onExport={exportCurrentTable}
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
      <FlowstockAIModal open={aiOpen} onClose={() => setAiOpen(false)} context={aiContext} />
      {explanationRow ? (
        <RowRiskExplanationCard row={explanationRow} activeScenario={activeScenario} onClose={() => setExplanationRow(null)} />
      ) : null}
      {explanationRiskGroup ? (
        <RiskGroupExplanationCard risk={explanationRiskGroup} rows={rows} onClose={() => setExplanationRiskGroup(null)} />
      ) : null}
      {validationNotices.length ? (
        <div className="fixed inset-0 z-50 flex pointer-events-none items-start justify-center px-4 pt-[22vh]">
          <div className="pointer-events-auto w-full max-w-xl space-y-3">
            {validationNotices.map((notice, index) => (
              <div
                key={notice}
                className={`rounded-2xl border p-4 text-sm shadow-cockpit backdrop-blur ${
                  index === 0 && notice.toLowerCase().includes("dc stock")
                    ? "border-red-300/40 bg-[#1b1019]/95 text-red-100"
                    : "border-amber-300/35 bg-[#101827]/95 text-amber-100"
                }`}
              >
                <div className="flex items-start gap-3">
                  <AlertTriangle className={`mt-0.5 shrink-0 ${index === 0 && notice.toLowerCase().includes("dc stock") ? "text-red-300" : "text-amber-300"}`} size={18} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-cockpit-text">{index === 0 && notice.toLowerCase().includes("dc stock") ? "DC stock exceeded" : "Final Qty needs review"}</p>
                    <p className="mt-1 opacity-95">{notice}</p>
                  </div>
                  <button type="button" onClick={() => setValidationNotices([])} className="ml-2 text-cockpit-muted hover:text-cockpit-text">
                    Close
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
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
