import { useMemo, useState } from "react";
import { Columns3, FileDown } from "lucide-react";
import type { WorkingRow } from "@/lib/domain/types";
import { money, whole } from "@/lib/utils/formatters";
import { ConstraintBadge, RiskBadge } from "@/components/replenishment/RowStatusBadge";
import { QuantityEditor } from "@/components/replenishment/QuantityEditor";
import { zeroRecommendationReasons } from "@/lib/domain/recommendationReview";

function coverPill(days: number) {
  if (days <= 2) return "bg-red-500/18 text-red-200";
  if (days <= 5) return "bg-amber-500/18 text-amber-200";
  return "bg-emerald-500/14 text-emerald-200";
}

export function ReplenishmentTable({
  rows,
  planGenerated,
  totalRows,
  impactSort,
  onSelect,
  onSelectAllVisible,
  onImpactSortChange,
  onFinalQtyChange,
  onCommentChange,
  onOpenRow,
  onRiskClick,
  onExport
}: {
  rows: WorkingRow[];
  planGenerated: boolean;
  totalRows: number;
  impactSort: "none" | "desc" | "asc";
  onSelect: (rowId: string, selected: boolean) => void;
  onSelectAllVisible: (selected: boolean) => void;
  onImpactSortChange: (sort: "none" | "desc" | "asc") => void;
  onFinalQtyChange: (rowId: string, value: number) => void;
  onCommentChange: (rowId: string, value: string) => void;
  onOpenRow: (row: WorkingRow) => void;
  onRiskClick: (row: WorkingRow) => void;
  onExport: () => void;
}) {
  const defaultColumns = [
    "select",
    "store",
    "category",
    "product",
    "systemRec",
    "finalQty",
    "stockOnHand",
    "daysCover",
    "forecast7",
    "pack",
    "dcFree",
    "risk",
    "impact",
    "comment"
  ];
  const columnOptions = [
    { id: "sku", label: "SKU" },
    { id: "requiredQty", label: "Required Qty" },
    { id: "inTransit", label: "In-transit quantity" },
    { id: "avgDailySales", label: "Average daily sales" },
    { id: "forecast14", label: "Forecast next 14 days" },
    { id: "projectedCover", label: "Projected days cover" },
    { id: "daysToDelivery", label: "Days to delivery" },
    { id: "dcTotal", label: "DC total stock" },
    { id: "revenueAtRisk", label: "Revenue at risk" },
    { id: "marginAtRisk", label: "Margin at risk" },
    { id: "recoveredMargin", label: "Expected recovered margin" },
    { id: "confidence", label: "Forecast confidence" },
    { id: "promo", label: "Promo flag" },
    { id: "reason", label: "Reason" },
    { id: "constraint", label: "Status" }
  ];
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(() => new Set(defaultColumns));
  const [columnsOpen, setColumnsOpen] = useState(false);
  const show = (column: string) => visibleColumns.has(column);
  const toggleColumn = (column: string) => {
    setVisibleColumns((current) => {
      const next = new Set(current);
      if (next.has(column)) next.delete(column);
      else next.add(column);
      return next;
    });
  };
  const visibleColumnCount = useMemo(() => visibleColumns.size, [visibleColumns]);
  const allVisibleSelected = rows.length > 0 && rows.every((row) => row.selected);
  return (
    <section className="glass-panel overflow-hidden rounded-3xl">
      <div className="flex flex-col gap-4 border-b border-white/10 p-6 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-cockpit-text">Review replenishment rows</h2>
          <p className="mt-1 text-sm text-cockpit-muted">Showing {rows.length} of {totalRows} matching rows. Narrow filters to inspect exceptions and approval candidates.</p>
          <p className="mt-1 text-xs text-cockpit-muted">Current risk describes the position before this plan. A zero recommendation can reflect a stock or capacity limit; select its reason for details.</p>
        </div>
        <div className="relative flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onExport}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 text-xs font-semibold text-cyan-100 transition hover:border-cyan-200/40 hover:bg-cyan-400/16"
          >
            <FileDown size={14} />
            Export table
          </button>
          <select
            value={impactSort}
            onChange={(event) => onImpactSortChange(event.target.value as "none" | "desc" | "asc")}
            className="h-10 rounded-full border border-white/10 bg-white/[0.045] px-3 text-xs font-semibold text-cockpit-text outline-none transition focus:border-blue-300/55"
            aria-label="Recovered sales sort"
          >
            <option value="desc">Recovered sales: High to Low</option>
            <option value="asc">Recovered sales: Low to High</option>
            <option value="none">Clear sort</option>
          </select>
          <button
            type="button"
            onClick={() => setColumnsOpen((open) => !open)}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-white/10 bg-white/[0.045] px-3 text-xs font-semibold text-cockpit-muted transition hover:bg-white/[0.075]"
          >
            <Columns3 size={14} />
            Columns
          </button>
          {columnsOpen ? (
            <div className="absolute right-0 top-12 z-30 w-72 rounded-2xl border border-white/10 bg-[#0b1424] p-3 shadow-cockpit">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-cockpit-muted">Visible columns</p>
              <div className="max-h-80 space-y-1 overflow-auto">
                {columnOptions.map((column) => (
                  <label key={column.id} className="flex cursor-pointer items-center gap-2 rounded-xl px-2 py-2 text-sm text-cockpit-muted hover:bg-white/[0.055]">
                    <input type="checkbox" checked={show(column.id)} onChange={() => toggleColumn(column.id)} />
                    {column.label}
                  </label>
                ))}
              </div>
              <p className="mt-3 text-xs text-cockpit-muted">{visibleColumnCount} columns visible</p>
            </div>
          ) : null}
        </div>
      </div>
      <div className="max-h-[720px] overflow-auto">
        <table className="w-full table-fixed text-left text-sm">
          <thead className="sticky top-0 z-10 bg-[#111c31]/95 text-xs text-cockpit-muted backdrop-blur">
            <tr>
              {show("select") ? <th className="w-[42px] border-r table-grid px-3 py-4">
                <input type="checkbox" checked={allVisibleSelected} onChange={(event) => onSelectAllVisible(event.target.checked)} aria-label="Select visible rows" />
              </th> : null}
              {show("store") ? <th className="w-[118px] border-r table-grid px-3 py-4">Store</th> : null}
              {show("category") ? <th className="w-[82px] border-r table-grid px-3 py-4">Category</th> : null}
              {show("sku") ? <th className="w-[92px] border-r table-grid px-3 py-4">SKU</th> : null}
              {show("product") ? <th className="w-[142px] border-r table-grid px-3 py-4">Product</th> : null}
              {show("systemRec") ? <th className="w-[138px] border-r table-grid px-3 py-4 text-right">System rec.</th> : null}
              {show("requiredQty") ? <th className="w-[86px] border-r table-grid px-3 py-4 text-right">Required qty</th> : null}
              {show("finalQty") ? <th className="w-[106px] border-r table-grid px-3 py-4 text-right text-cockpit-text">Final qty</th> : null}
              {show("stockOnHand") ? <th className="w-[82px] border-r table-grid px-3 py-4 text-right">Stock on hand</th> : null}
              {show("inTransit") ? <th className="w-[84px] border-r table-grid px-3 py-4 text-right">In transit</th> : null}
              {show("avgDailySales") ? <th className="w-[86px] border-r table-grid px-3 py-4 text-right">Avg daily sales</th> : null}
              {show("forecast7") ? <th className="w-[78px] border-r table-grid px-3 py-4 text-right">Forecast 7d</th> : null}
              {show("forecast14") ? <th className="w-[84px] border-r table-grid px-3 py-4 text-right">Forecast 14d</th> : null}
              {show("daysCover") ? <th className="w-[82px] border-r table-grid px-3 py-4 text-right">Days cover</th> : null}
              {show("projectedCover") ? <th className="w-[96px] border-r table-grid px-3 py-4 text-right">Projected cover</th> : null}
              {show("daysToDelivery") ? <th className="w-[86px] border-r table-grid px-3 py-4 text-right">Days to delivery</th> : null}
              {show("pack") ? <th className="w-[74px] border-r table-grid px-3 py-4 text-right">Pack / MOQ</th> : null}
              {show("dcTotal") ? <th className="w-[84px] border-r table-grid px-3 py-4 text-right">DC total</th> : null}
              {show("dcFree") ? <th className="w-[90px] border-r table-grid px-3 py-4 text-right">DC free stock</th> : null}
              {show("revenueAtRisk") ? <th className="w-[92px] border-r table-grid px-3 py-4 text-right">Revenue at risk</th> : null}
              {show("marginAtRisk") ? <th className="w-[88px] border-r table-grid px-3 py-4 text-right">Margin at risk</th> : null}
              {show("impact") ? <th className="w-[110px] border-r table-grid px-3 py-4 text-right">Recovered sales</th> : null}
              {show("recoveredMargin") ? <th className="w-[96px] border-r table-grid px-3 py-4 text-right">Recovered margin</th> : null}
              {show("confidence") ? <th className="w-[86px] border-r table-grid px-3 py-4 text-right">Confidence</th> : null}
              {show("promo") ? <th className="w-[64px] border-r table-grid px-3 py-4">Promo</th> : null}
              {show("risk") ? <th className="w-[104px] border-r table-grid px-3 py-4">Current risk</th> : null}
              {show("reason") ? <th className="w-[150px] border-r table-grid px-3 py-4">Reason</th> : null}
              {show("constraint") ? <th className="w-[110px] border-r table-grid px-3 py-4">Status</th> : null}
              {show("comment") ? <th className="w-[156px] px-3 py-4">Comment</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} data-row-id={row.id} data-pack-multiple={row.packMultiple} className={`border-t table-grid transition hover:bg-blue-500/[0.075] ${row.selected ? "bg-blue-500/12 outline outline-1 -outline-offset-1 outline-blue-300/30" : "odd:bg-white/[0.012] even:bg-white/[0.026]"}`}>
                {show("select") ? <td className="border-r table-grid px-3 py-4">
                  <input type="checkbox" checked={row.selected} onChange={(event) => onSelect(row.id, event.target.checked)} aria-label={`Select ${row.id}`} />
                </td> : null}
                {show("store") ? <td className="border-r table-grid px-3 py-4">
                  <button className="text-left hover:text-cockpit-accent2" onClick={() => onOpenRow(row)}>
                    <span className="block font-semibold text-cockpit-text">{row.storeName}</span>
                    <span className="block text-xs text-cockpit-muted">{row.storeId}</span>
                  </button>
                </td> : null}
                {show("category") ? <td className="border-r table-grid px-3 py-4">{row.category}</td> : null}
                {show("sku") ? <td className="border-r table-grid px-3 py-4 font-mono text-xs text-cockpit-muted">{row.skuId}</td> : null}
                {show("product") ? <td className="border-r table-grid px-3 py-4 font-semibold text-cockpit-text">{row.productName}</td> : null}
                {show("systemRec") ? <td className="border-r table-grid px-3 py-4 text-right font-semibold">
                  {whole(row.systemRecommendedQty)}
                  {planGenerated && row.systemRecommendedQty === 0 ? (
                    <button type="button" onClick={() => onOpenRow(row)} className="mt-1 block w-full text-right text-xs font-normal text-cockpit-muted underline decoration-dotted underline-offset-2 hover:text-cyan-100">
                      {zeroRecommendationReasons(row)[0]?.label}
                    </button>
                  ) : null}
                </td> : null}
                {show("requiredQty") ? <td className="border-r table-grid px-3 py-4 text-right font-semibold text-cockpit-muted">{whole(row.requiredQty)}</td> : null}
                {show("finalQty") ? <td className="border-r table-grid px-3 py-4 text-right">
                  <QuantityEditor value={row.finalQty} onCommit={(value) => onFinalQtyChange(row.id, value)} />
                </td> : null}
                {show("stockOnHand") ? <td className="border-r table-grid px-3 py-4 text-right">{whole(row.stockOnHand)}</td> : null}
                {show("inTransit") ? <td className="border-r table-grid px-3 py-4 text-right">{whole(row.inTransitQty)}</td> : null}
                {show("avgDailySales") ? <td className="border-r table-grid px-3 py-4 text-right">{whole(row.averageDailySales)}</td> : null}
                {show("forecast7") ? <td className="border-r table-grid px-3 py-4 text-right">{whole(row.forecastNext7)}</td> : null}
                {show("forecast14") ? <td className="border-r table-grid px-3 py-4 text-right">{whole(row.forecastNext14)}</td> : null}
                {show("daysCover") ? <td className="border-r table-grid px-3 py-4 text-right"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${coverPill(row.daysOfCover)}`}>{whole(row.daysOfCover)}</span></td> : null}
                {show("projectedCover") ? <td className="border-r table-grid px-3 py-4 text-right"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${coverPill(row.projectedDaysOfCover)}`}>{whole(row.projectedDaysOfCover)}</span></td> : null}
                {show("daysToDelivery") ? <td className="border-r table-grid px-3 py-4 text-right">{whole(row.daysToDelivery)}</td> : null}
                {show("pack") ? <td className="border-r table-grid px-3 py-4 text-right">{whole(row.packMultiple)}</td> : null}
                {show("dcTotal") ? <td className="border-r table-grid px-3 py-4 text-right">{whole(row.dcTotalStock)}</td> : null}
                {show("dcFree") ? <td className="border-r table-grid px-3 py-4 text-right">{whole(row.dcFreeStock)}</td> : null}
                {show("revenueAtRisk") ? <td className="border-r table-grid px-3 py-4 text-right font-semibold">{money(row.revenueAtRisk)}</td> : null}
                {show("marginAtRisk") ? <td className="border-r table-grid px-3 py-4 text-right">{money(row.marginAtRisk)}</td> : null}
                {show("impact") ? <td className="border-r table-grid px-3 py-4 text-right">
                  <span data-recovered-sales={row.expectedRecoveredRevenue} className={`font-semibold ${row.expectedRecoveredRevenue > 0 ? "text-cockpit-green" : "text-cockpit-muted"}`}>{money(row.expectedRecoveredRevenue)}</span>
                  <span className={`mt-1 block text-xs ${row.revenueAtRisk > 0 ? "text-amber-200" : "text-cockpit-muted"}`}>At risk: {money(row.revenueAtRisk)}</span>
                </td> : null}
                {show("recoveredMargin") ? <td className="border-r table-grid px-3 py-4 text-right text-cockpit-green">{money(row.expectedRecoveredMargin)}</td> : null}
                {show("confidence") ? <td className="border-r table-grid px-3 py-4 text-right">{Math.round(row.forecastConfidence * 100)}%</td> : null}
                {show("promo") ? <td className="border-r table-grid px-3 py-4">{row.promoFlag ? "Yes" : "No"}</td> : null}
                {show("risk") ? <td className="border-r table-grid px-3 py-4">
                  <button type="button" onClick={() => onRiskClick(row)} className="rounded-full outline-none transition hover:scale-[1.02] focus:ring-2 focus:ring-blue-300/40">
                    <RiskBadge risk={row.riskLevel} />
                  </button>
                </td> : null}
                {show("reason") ? <td className="border-r table-grid px-3 py-4 text-cockpit-muted"><div className="max-h-10 overflow-hidden leading-5">{row.reasonCode}</div></td> : null}
                {show("constraint") ? <td className="border-r table-grid px-3 py-4"><ConstraintBadge status={row.constraintStatus} /></td> : null}
                {show("comment") ? <td className="px-3 py-4">
                  <input
                    value={row.comment}
                    onChange={(event) => onCommentChange(row.id, event.target.value)}
                    placeholder={row.manualOverride ? "Required" : ""}
                    className={`h-10 w-full rounded-xl border bg-[#071225] px-3 text-sm text-cockpit-text outline-none transition focus:border-blue-300/60 focus:bg-blue-500/10 focus:shadow-[0_0_0_3px_rgba(59,130,246,0.12)] ${
                      row.manualOverride && !row.comment.trim() ? "border-red-400/70" : "border-cockpit-line"
                    }`}
                  />
                </td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
