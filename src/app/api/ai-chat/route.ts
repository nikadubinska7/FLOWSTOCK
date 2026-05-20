import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const systemPrompt =
  "You are Flowstock AI, a replenishment planning copilot. Behave like a real conversational assistant, not a static summary generator. Answer using only the provided Flowstock context, prior chat messages, and calculation results. Answer the user's actual question directly. Use prior chat messages for follow-up questions. Do not default to a dashboard summary unless asked. Be precise with business actions: say 'set Final Qty to 0', 'exclude from approval', or 'do not send in this run' instead of vague terms like 'remove rows'. Do not invent numbers. If a number is not available, say so, but do not say that when the context or app-side calculation already contains relevant totals, drivers, or rows. You may reason, explain, analyze, compare, visualize, and recommend planner actions, but you cannot approve, edit quantities, create shipping documents, modify CSV files, or change scenarios.";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type ResponsesApiOutput = {
  output_text?: string;
  output?: Array<{
    type?: string;
    role?: string;
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
  error?: {
    message?: string;
  };
};

type ContextRecord = Record<string, unknown>;

type Visualization = {
  type: "bar" | "line" | "waterfall" | "comparison_table" | "kpi_cards";
  title: string;
  data: Array<Record<string, string | number>>;
};

type AiAnswer = {
  answer: string;
  visualization?: Visualization;
  calculation?: Record<string, unknown>;
};

type Intent =
  | "term_definition"
  | "scenario_summary"
  | "follow_up_clarification"
  | "row_explanation"
  | "risk_group_explanation"
  | "what_if_inventory_reduction"
  | "what_if_lost_sales_reduction"
  | "what_if_oos_improvement"
  | "gmroi_projection"
  | "scenario_comparison"
  | "action_recommendation"
  | "general_flowstock_question";

const notEnoughData = "I do not have enough data in the current context to answer that.";

function extractText(response: ResponsesApiOutput): string {
  if (response.output_text) return response.output_text;
  return (
    response.output
      ?.flatMap((item) => item.content ?? [])
      .filter((content) => content.text)
      .map((content) => content.text)
      .join("\n")
      .trim() ?? ""
  );
}

function asRecord(value: unknown): ContextRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as ContextRecord) : {};
}

function asRows(value: unknown): ContextRecord[] {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === "object") as ContextRecord[] : [];
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function whole(value: unknown): string {
  return Math.round(num(value)).toLocaleString("en-US");
}

function money(value: unknown): string {
  const amount = num(value);
  const abs = Math.abs(amount);
  if (abs >= 1_000_000) return `€${(amount / 1_000_000).toFixed(1)}m`;
  if (abs >= 1_000) return `€${(amount / 1_000).toFixed(1)}k`;
  return `€${Math.round(amount).toLocaleString("en-US")}`;
}

function pct(value: unknown): string {
  return `${num(value).toFixed(1)}%`;
}

function previousAssistantMessage(messages: ChatMessage[]): string {
  return [...messages].reverse().find((message) => message.role === "assistant")?.content ?? "";
}

function isDefinitionQuestion(question: string): boolean {
  const normalized = question.toLowerCase();
  return (
    normalized.startsWith("what is ") ||
    normalized.startsWith("what are ") ||
    normalized.startsWith("define ") ||
    normalized.includes("what does") ||
    normalized.includes("meaning of") ||
    normalized.includes("explain the term")
  );
}

function detectIntent(question: string, messages: ChatMessage[]): Intent {
  const normalized = question.toLowerCase().trim();
  const previous = previousAssistantMessage(messages).toLowerCase();
  const shortFollowUp =
    normalized.length < 80 &&
    (normalized === "yes" ||
      normalized === "yes please" ||
      normalized === "yep" ||
      normalized === "sure" ||
      normalized.includes("what do you mean") ||
      normalized.includes("what does that mean") ||
      normalized.includes("from where") ||
      normalized.includes("which rows") ||
      normalized === "why?" ||
      normalized === "why" ||
      normalized.includes("how did you calculate") ||
      normalized.includes("that?") ||
      normalized.includes("this?"));

  if (shortFollowUp && previous) return "follow_up_clarification";
  if (normalized.includes("projected gmroi") || normalized.includes("3-month") || normalized.includes("three-month")) return "gmroi_projection";
  if (isDefinitionQuestion(normalized) && /(oos|out of stock|lost sales|gmroi|days cover|dc free stock|recovered revenue)/.test(normalized)) return "term_definition";
  if (normalized.includes("reduce inventory") || normalized.includes("inventory by")) return "what_if_inventory_reduction";
  if (normalized.includes("reduce lost sales") || normalized.includes("lost sales risk by")) return "what_if_lost_sales_reduction";
  if (normalized.includes("improve oos") || normalized.includes("improve out of stock")) return "what_if_oos_improvement";
  if (normalized.includes("approve only") || normalized.includes("impact threshold") || normalized.includes("approve first")) return "action_recommendation";
  if (normalized.includes("compare lean") || normalized.includes("compare scenarios") || normalized.includes("lost sales recovery")) return "scenario_comparison";
  if (normalized.includes("selected row")) return "row_explanation";
  if (normalized.includes("high risk") || normalized.includes("medium risk") || normalized.includes("low risk") || normalized.includes("not fully covered")) return "risk_group_explanation";
  if (normalized.includes("summarize") || normalized.includes("summary") || normalized === "summarize this plan") return "scenario_summary";
  return "general_flowstock_question";
}

function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

function revenuePerUnit(row: ContextRecord): number {
  return ratio(num(row.recovered_revenue), num(row.final_qty));
}

function inventoryCost(row: ContextRecord): number {
  return num(row.final_qty) * num(row.unit_cost);
}

function grossMargin(row: ContextRecord): number {
  const unitMargin = Math.max(0, num(row.selling_price) - num(row.unit_cost));
  return Math.min(num(row.forecast_14d || row.forecast_7d) + num(row.final_qty), num(row.stock_on_hand) + num(row.in_transit_qty) + num(row.final_qty)) * unitMargin;
}

function riskGroup(context: ContextRecord, risk: string): ContextRecord {
  return asRows(context.risk_summary).find((row) => text(row.risk) === risk) ?? {};
}

function netUncovered(group: ContextRecord): number {
  return Math.max(0, num(group.baseline_required_qty) - num(group.final_qty));
}

function reasonLabel(row: ContextRecord): string {
  return text(row.reason) || text(row.data_issue_description) || "No reason captured";
}

function scenarioSummary(context: ContextRecord): string {
  const current = asRecord(context.current_state_kpis);
  const simulation = asRecord(context.simulation_kpis);
  const groups = ["High", "Medium", "Low"].map((risk) => {
    const group = riskGroup(context, risk);
    return `${risk}: ${whole(group.final_qty)} / ${whole(group.baseline_required_qty)} units, ${money(group.recovered_revenue)} / ${money(group.baseline_revenue_at_risk)} revenue recovered, ${whole(netUncovered(group))} net units uncovered.`;
  });
  return [
    `Active scenario: ${text(context.active_scenario) || "No scenario run"}.`,
    `Visible filtered rows: ${whole(context.visible_table_count)}.`,
    `Current vs Simulation: lost sales ${money(current.lostSalesValue)} -> ${money(simulation.lostSalesValue)}, OOS ${pct(current.oosPercent)} -> ${pct(simulation.oosPercent)}, DC free stock ${whole(current.dcFreeStock)} -> ${whole(simulation.dcFreeStock)}, replenishment units ${whole(simulation.replenishmentUnits)}.`,
    ...groups,
    "Planner focus: review high-risk uncovered rows first, then approve valid high-impact rows with Final Qty above zero."
  ].join("\n");
}

function scenarioSummaryVisual(context: ContextRecord): Visualization {
  return {
    type: "comparison_table",
    title: "Risk group coverage",
    data: ["High", "Medium", "Low"].map((risk) => {
      const group = riskGroup(context, risk);
      return {
        risk,
        required_qty: Math.round(num(group.baseline_required_qty)),
        final_qty: Math.round(num(group.final_qty)),
        uncovered_qty: Math.round(netUncovered(group)),
        revenue_at_risk: Math.round(num(group.baseline_revenue_at_risk)),
        recovered_revenue: Math.round(num(group.recovered_revenue))
      };
    })
  };
}

function highRiskCoverage(context: ContextRecord): string {
  const high = riskGroup(context, "High");
  const uncoveredRows = asRows(context.top_uncovered_high_risk_rows);
  const uncovered = netUncovered(high);
  if (!Object.keys(high).length) return "There are no High risk rows in the current context.";
  if (uncovered <= 0) return `High risk appears fully covered in the current context: ${whole(high.final_qty)} / ${whole(high.baseline_required_qty)} units.`;

  const driverCounts = new Map<string, { rows: number; qty: number }>();
  for (const row of uncoveredRows) {
    const label = reasonLabel(row).split("; ")[0] || "Unspecified";
    const current = driverCounts.get(label) ?? { rows: 0, qty: 0 };
    current.rows += 1;
    current.qty += num(row.uncovered_qty);
    driverCounts.set(label, current);
  }
  const drivers = Array.from(driverCounts.entries())
    .sort((a, b) => b[1].qty - a[1].qty)
    .slice(0, 5)
    .map(([label, stats]) => `- ${label}: ${whole(stats.qty)} uncovered units across ${whole(stats.rows)} sampled rows`)
    .join("\n");

  return [
    `High risk is not fully covered because Final Qty covers ${whole(high.final_qty)} of ${whole(high.baseline_required_qty)} required units, leaving ${whole(uncovered)} net units uncovered.`,
    `Recovered revenue is ${money(high.recovered_revenue)} of ${money(high.baseline_revenue_at_risk)} at risk.`,
    drivers ? `Main visible row-level drivers from the top uncovered rows:\n${drivers}` : "The context does not include detailed uncovered-row drivers.",
    "Recommended review action: inspect the highest-impact uncovered High risk rows, especially where System Rec. is 0 or below Required Qty, then check DC free stock and Pack / MOQ."
  ].join("\n");
}

function highRiskCoverageVisual(context: ContextRecord): Visualization {
  const high = riskGroup(context, "High");
  return {
    type: "waterfall",
    title: "High-risk required qty coverage",
    data: [
      { label: "Required Qty", value: Math.round(num(high.baseline_required_qty)) },
      { label: "Final Qty", value: Math.round(num(high.final_qty)) },
      { label: "Net Uncovered Qty", value: Math.round(netUncovered(high)) }
    ]
  };
}

function uncoveredQuantityExplanation(context: ContextRecord): AiAnswer {
  const groups = ["High", "Medium", "Low"].map((risk) => riskGroup(context, risk));
  const drivers = asRows(context.uncovered_qty_drivers);
  const topRows = asRows(context.top_uncovered_rows).slice(0, 5);
  const required = groups.reduce((sum, group) => sum + num(group.baseline_required_qty), 0);
  const finalQty = groups.reduce((sum, group) => sum + num(group.final_qty), 0);
  const uncovered = Math.max(0, required - finalQty);
  const rowLevelUncovered = groups.reduce((sum, group) => sum + num(group.uncovered_qty), 0);
  const scenario = text(context.active_scenario) || "the active scenario";
  const current = asRecord(context.current_state_kpis);
  const simulation = asRecord(context.simulation_kpis);
  const groupLines = ["High", "Medium", "Low"].map((risk, index) => {
    const group = groups[index];
    return `- ${risk}: ${whole(netUncovered(group))} net uncovered units (${whole(group.final_qty)} Final Qty vs ${whole(group.baseline_required_qty)} Required Qty)`;
  });
  const driverLines = drivers.slice(0, 6).map((driver) => {
    return `- ${text(driver.driver)}: ${whole(driver.uncovered_qty)} uncovered units across ${whole(driver.rows)} rows; revenue at risk ${money(driver.revenue_at_risk)}`;
  });
  const rowExamples = topRows.map((row) => {
    return `- ${text(row.store_name)} ${text(row.product) || text(row.sku_id)}: ${whole(row.uncovered_qty)} uncovered units, Required ${whole(row.required_qty)}, Final ${whole(row.final_qty)}, DC free ${whole(row.dc_free_stock)}, Pack / MOQ ${whole(row.pack_moq)}, reason ${reasonLabel(row)}`;
  });

  const scenarioReason = scenario.toLowerCase().includes("lean")
    ? "Lean Replenishment is intentionally conservative: it protects minimum availability, but it does not try to fully cover every baseline required unit."
    : "The active scenario is still constrained by its scenario target, Pack / MOQ rounding, and available DC stock allocation.";

  return {
    answer: [
      `Uncovered Qty is large because Final Qty covers ${whole(finalQty)} of ${whole(required)} baseline required units, leaving ${whole(uncovered)} units not planned for shipment.`,
      `Required Qty is the baseline need before scenario recommendations; Final Qty is what the current plan will actually send. Uncovered Qty = Required Qty minus Final Qty.`,
      `Separately, row-level uncovered demand is ${whole(rowLevelUncovered)} units before offsetting rows where Final Qty is above Required Qty. The table below uses the net group difference so the math matches what you see.`,
      scenarioReason,
      driverLines.length ? `Main drivers in the current context:\n${driverLines.join("\n")}` : "The current context does not include uncovered-driver detail.",
      rowExamples.length ? `Largest uncovered row examples:\n${rowExamples.join("\n")}` : "The current context does not include uncovered row examples.",
      `By risk group:\n${groupLines.join("\n")}`,
      `Current DC free stock is ${whole(current.dcFreeStock)} and simulation DC free stock is ${whole(simulation.dcFreeStock)}, so part of the gap may be a deliberate conservative choice rather than a data error.`,
      "Planner action: if you want to reduce Uncovered Qty, review the highest-impact uncovered rows and manually increase Final Qty where DC free stock and Pack / MOQ allow."
    ].join("\n"),
    visualization: {
      type: "comparison_table",
      title: "Uncovered Qty by risk group",
      data: ["High", "Medium", "Low"].map((risk, index) => {
        const group = groups[index];
        return {
          risk,
          required_qty: Math.round(num(group.baseline_required_qty)),
          final_qty: Math.round(num(group.final_qty)),
          uncovered_qty: Math.round(netUncovered(group))
        };
      })
    },
    calculation: {
      drivers,
      largest_uncovered_rows: topRows
    }
  };
}

function approvalAdvice(context: ContextRecord): string {
  const approval = asRecord(context.approval_summary);
  const topRows = asRows(context.top_impact_rows)
    .filter((row) => num(row.final_qty) > 0 && text(row.status) === "Valid")
    .slice(0, 5);
  const examples = topRows.map((row) => `- ${text(row.store_name)} ${text(row.sku_id)}: Final Qty ${whole(row.final_qty)}, risk ${text(row.risk_level)}, recovered revenue ${money(row.recovered_revenue)}`).join("\n");
  return [
    `Approve valid rows with Final Qty above zero, starting with High risk and highest recovered revenue.`,
    `Current approval pool: ${whole(approval.valid_visible_rows)} valid visible rows, ${whole(approval.valid_visible_units)} units. Blocked visible rows with Final Qty: ${whole(approval.visible_rows_blocked_for_approval)}.`,
    examples ? `Top approval candidates in the current context:\n${examples}` : "No valid approval candidates with Final Qty above zero are visible in the current context.",
    "Before approving, resolve manual overrides without comments and any Pack / MOQ or DC stock alerts."
  ].join("\n");
}

function blockersAdvice(context: ContextRecord): string {
  const approval = asRecord(context.approval_summary);
  const dataIssues = asRecord(context.data_issue_summary);
  const manual = asRecord(context.manual_override_summary);
  return [
    `Approval blockers in the current context:`,
    `- Visible rows blocked for approval: ${whole(approval.visible_rows_blocked_for_approval)}`,
    `- Blocker data issue records: ${whole(dataIssues.blocker_issue_records)}`,
    `- Rows with any data issue: ${whole(dataIssues.rows_with_data_issue)}`,
    `- Manual override rows missing comment: ${whole(manual.manual_override_rows_missing_comment)}`,
    "Planner action: fix comments on manual overrides first, then review rows with data issues or validation alerts before approving."
  ].join("\n");
}

function selectedRowExplanation(context: ContextRecord): string {
  const row = asRecord(context.selected_row);
  if (!Object.keys(row).length) return "No row is selected. Select a row in the table, then ask again.";
  return [
    `${text(row.store_name)} ${text(row.sku_id)} (${text(row.product)}) is ${text(row.risk_level)} risk and ${text(row.status)}.`,
    `Required Qty is ${whole(row.required_qty)}. System Rec. is ${whole(row.system_recommended_qty)} and Final Qty is ${whole(row.final_qty)}, leaving ${whole(row.uncovered_qty)} uncovered units.`,
    `Current position: stock on hand ${whole(row.stock_on_hand)}, in transit ${whole(row.in_transit_qty)}, forecast 7d ${whole(row.forecast_7d)}, days cover ${whole(row.days_cover)}, Pack / MOQ ${whole(row.pack_moq)}, DC free stock ${whole(row.dc_free_stock)}.`,
    `Explanation: ${reasonLabel(row)}.`
  ].join("\n");
}

function dcFreeStockExplanation(context: ContextRecord): string {
  const current = asRecord(context.current_state_kpis);
  const simulation = asRecord(context.simulation_kpis);
  const change = num(simulation.dcFreeStock) - num(current.dcFreeStock);
  return [
    `DC free stock moves from ${whole(current.dcFreeStock)} to ${whole(simulation.dcFreeStock)}.`,
    `Change: ${whole(change)} units.`,
    "This changes when scenario recommendations or manual Final Qty edits reserve DC stock for store replenishment. If Final Qty is reduced versus System Rec., DC free stock increases back; if Final Qty is increased, DC free stock decreases."
  ].join("\n");
}

function currentVsSimulation(context: ContextRecord): string {
  const current = asRecord(context.current_state_kpis);
  const simulation = asRecord(context.simulation_kpis);
  return [
    `Current State vs Simulation:`,
    `- Inventory value: ${money(current.inventoryValue)} -> ${money(simulation.inventoryValue)}`,
    `- Lost sales risk: ${money(current.lostSalesValue)} -> ${money(simulation.lostSalesValue)}`,
    `- OOS risk: ${pct(current.oosPercent)} -> ${pct(simulation.oosPercent)}`,
    `- DC free stock: ${whole(current.dcFreeStock)} -> ${whole(simulation.dcFreeStock)}`,
    `- Recovered revenue: ${money(simulation.recoveredRevenue)}`,
    `- Recovered margin: ${money(simulation.recoveredMargin)}`,
    `- Replenishment units: ${whole(simulation.replenishmentUnits)}`
  ].join("\n");
}

function currentVsSimulationVisual(context: ContextRecord): Visualization {
  const current = asRecord(context.current_state_kpis);
  const simulation = asRecord(context.simulation_kpis);
  return {
    type: "comparison_table",
    title: "Current State vs Simulation",
    data: [
      { kpi: "Inventory value", current: Math.round(num(current.inventoryValue)), simulation: Math.round(num(simulation.inventoryValue)) },
      { kpi: "Lost sales risk", current: Math.round(num(current.lostSalesValue)), simulation: Math.round(num(simulation.lostSalesValue)) },
      { kpi: "OOS risk", current: num(current.oosPercent).toFixed(1), simulation: num(simulation.oosPercent).toFixed(1) },
      { kpi: "DC free stock", current: Math.round(num(current.dcFreeStock)), simulation: Math.round(num(simulation.dcFreeStock)) },
      { kpi: "Recovered revenue", current: 0, simulation: Math.round(num(simulation.recoveredRevenue)) }
    ]
  };
}

function kpiDictionary(question: string, context: ContextRecord): AiAnswer | null {
  const normalized = question.toLowerCase();
  if (!isDefinitionQuestion(normalized)) return null;
  const current = asRecord(context.current_state_kpis);
  const simulation = asRecord(context.simulation_kpis);
  const definitions: Record<string, AiAnswer> = {
    oos: {
      answer: [
        "OOS means Out of Stock.",
        `In Flowstock, OOS Risk is the percentage of active store-SKU rows projected to run out of stock or sit below critical cover in the planning horizon.`,
        `The app estimates it from row-level days cover, forecast demand, and stock position. Current OOS Risk is ${pct(current.oosPercent)}; Simulation OOS Risk is ${pct(simulation.oosPercent)}.`
      ].join("\n")
    },
    "lost sales risk": {
      answer: [
        "Lost Sales Risk is the revenue the business may miss because store-SKU demand cannot be served with available stock.",
        "In Flowstock, it is estimated from forecast demand, current stock, in-transit stock, selling price, and projected stockout exposure.",
        `Current Lost Sales Risk is ${money(current.lostSalesValue)}; Simulation Lost Sales Risk is ${money(simulation.lostSalesValue)}.`
      ].join("\n")
    },
    gmroi: {
      answer: [
        "GMROI means Gross Margin Return on Inventory Investment.",
        "It shows how much gross margin is generated for each euro of average inventory cost.",
        "In Flowstock what-if mode, projected GMROI is estimated as projected gross margin divided by estimated average inventory cost. This is a prototype estimate based on mock forecast and inventory data, not an accounting actual."
      ].join("\n")
    },
    "days cover": {
      answer: [
        "Days Cover shows how many days current available stock can support expected demand.",
        "In Flowstock, it is calculated from stock on hand plus in-transit stock divided by adjusted daily forecast demand.",
        `Current average Days Cover is ${whole(current.daysOfCover)} days; Simulation Days Cover is ${whole(simulation.daysOfCover)} days.`
      ].join("\n")
    },
    "dc free stock": {
      answer: [
        "DC Free Stock is the quantity available in the distribution center for new replenishment decisions.",
        "Flowstock uses DC free stock, not total DC stock, because reserved or blocked stock should not be promised to stores.",
        `Current DC Free Stock is ${whole(current.dcFreeStock)}; Simulation DC Free Stock is ${whole(simulation.dcFreeStock)}.`
      ].join("\n")
    },
    "recovered revenue": {
      answer: [
        "Recovered Revenue is the sales value expected to be protected by replenishment.",
        "In Flowstock, it is estimated from Final Qty, forecast demand, selling price, and the row's revenue at risk.",
        `Simulation Recovered Revenue is ${money(simulation.recoveredRevenue)}.`
      ].join("\n")
    }
  };

  if (normalized.includes("oos") || normalized.includes("out of stock")) return definitions.oos;
  if (normalized.includes("lost sales")) return definitions["lost sales risk"];
  if (normalized.includes("gmroi")) return definitions.gmroi;
  if (normalized.includes("days cover")) return definitions["days cover"];
  if (normalized.includes("dc free stock")) return definitions["dc free stock"];
  if (normalized.includes("recovered revenue")) return definitions["recovered revenue"];
  return null;
}

function rankRowsByImpact(context: ContextRecord): ContextRecord[] {
  return asRows(context.top_impact_rows)
    .sort((a, b) => num(b.recovered_revenue) - num(a.recovered_revenue) || num(b.revenue_at_risk) - num(a.revenue_at_risk));
}

function identifyHighImpactUncoveredRows(context: ContextRecord): ContextRecord[] {
  return asRows(context.top_uncovered_high_risk_rows)
    .sort((a, b) => num(b.uncovered_qty) - num(a.uncovered_qty) || num(b.revenue_at_risk) - num(a.revenue_at_risk));
}

function identifyLowValueReplenishment(context: ContextRecord): ContextRecord[] {
  return asRows(context.low_value_replenishment_rows)
    .sort((a, b) => revenuePerUnit(a) - revenuePerUnit(b) || inventoryCost(b) - inventoryCost(a));
}

function identifyLowestGmroiProxyRows(context: ContextRecord): ContextRecord[] {
  return asRows(context.gmroi_proxy_rows)
    .sort((a, b) => {
      const marginDelta = num(a.gross_margin_pct) - num(b.gross_margin_pct);
      if (marginDelta !== 0) return marginDelta;
      return revenuePerUnit(a) - revenuePerUnit(b);
    });
}

function simulateApproveOnlyHighRisk(context: ContextRecord): AiAnswer {
  return simulateApprovalByRisk(context, "High");
}

function simulateApprovalByRisk(context: ContextRecord, riskLevel: string): AiAnswer {
  const rows = rankRowsByImpact(context).filter((row) => text(row.risk_level) === riskLevel && num(row.final_qty) > 0);
  const units = rows.reduce((sum, row) => sum + num(row.final_qty), 0);
  const recoveredRevenue = rows.reduce((sum, row) => sum + num(row.recovered_revenue), 0);
  const inventoryCostValue = rows.reduce((sum, row) => sum + inventoryCost(row), 0);
  return {
    answer: [
      `Approving only ${riskLevel}-risk rows means filtering to ${riskLevel} risk and approving only those valid replenishment rows with Final Qty above 0.`,
      `Estimated approved quantity: ${whole(units)} units.`,
      `Estimated recovered revenue retained: ${money(recoveredRevenue)}.`,
      `Estimated inventory cost added: ${money(inventoryCostValue)}.`,
      `Trade-off: this focuses DC stock and planner effort on ${riskLevel}-risk demand, but other risk groups remain uncovered. The planner would need to manually filter Risk = ${riskLevel}, review valid rows, and approve those rows only.`
    ].join("\n"),
    visualization: {
      type: "kpi_cards",
      title: `Approve only ${riskLevel}-risk rows`,
      data: [
        { label: "Units", value: Math.round(units) },
        { label: "Recovered revenue", value: Math.round(recoveredRevenue) },
        { label: "Inventory cost", value: Math.round(inventoryCostValue) },
        { label: "Rows sampled", value: rows.length }
      ]
    },
    calculation: {
      inputs_used: ["risk_level", "final_qty", "recovered_revenue", "unit_cost"],
      recommended_action: `Filter Risk = ${riskLevel}, review valid rows, and approve only selected rows.`,
      affected_rows_count: rows.length,
      affected_units: Math.round(units),
      inventory_value_impact: Math.round(inventoryCostValue),
      recovered_revenue_impact: Math.round(recoveredRevenue),
      limitations: "Based on compact top-impact context, not all 57k rows."
    }
  };
}

function simulateApprovalByImpactThreshold(context: ContextRecord, threshold: number): AiAnswer {
  const rows = rankRowsByImpact(context).filter((row) => num(row.final_qty) > 0 && num(row.recovered_revenue) >= threshold);
  const units = rows.reduce((sum, row) => sum + num(row.final_qty), 0);
  const recoveredRevenue = rows.reduce((sum, row) => sum + num(row.recovered_revenue), 0);
  const inventoryCostValue = rows.reduce((sum, row) => sum + inventoryCost(row), 0);
  return {
    answer: [
      `Applying a minimum impact threshold means approving only rows whose expected recovered revenue is at least ${money(threshold)}.`,
      `Based on available context, that would keep ${whole(rows.length)} rows, ${whole(units)} units, and about ${money(recoveredRevenue)} recovered revenue.`,
      `Estimated inventory cost added by the kept rows is ${money(inventoryCostValue)}.`,
      "Rows below the threshold stay in the table and source CSVs; they are simply excluded from approval and not sent in this replenishment run unless the planner manually approves them."
    ].join("\n"),
    visualization: {
      type: "kpi_cards",
      title: "Approval by impact threshold",
      data: [
        { label: "Rows kept", value: rows.length },
        { label: "Units kept", value: Math.round(units) },
        { label: "Recovered revenue", value: Math.round(recoveredRevenue) },
        { label: "Inventory cost", value: Math.round(inventoryCostValue) }
      ]
    },
    calculation: {
      inputs_used: ["impact threshold", "final_qty", "recovered_revenue", "unit_cost"],
      recommended_action: `Approve only rows with expected recovered revenue >= ${money(threshold)}.`,
      affected_rows_count: rows.length,
      affected_units: Math.round(units),
      inventory_value_impact: Math.round(inventoryCostValue),
      recovered_revenue_impact: Math.round(recoveredRevenue),
      limitations: "Based on compact top-impact context."
    }
  };
}

function simulateReduceInventoryByAmount(context: ContextRecord, targetValue: number): AiAnswer {
  const candidates = identifyLowValueReplenishment(context).filter((row) => num(row.final_qty) > 0);
  let reduction = 0;
  let lostRecovery = 0;
  const affected: ContextRecord[] = [];
  for (const row of candidates) {
    if (reduction >= targetValue) break;
    reduction += inventoryCost(row);
    lostRecovery += num(row.recovered_revenue);
    affected.push(row);
  }
  const byRisk = affected.reduce<Record<string, number>>((acc, row) => {
    const risk = text(row.risk_level) || "Unknown";
    acc[risk] = (acc[risk] ?? 0) + inventoryCost(row);
    return acc;
  }, {});
  return {
    answer: [
      `To reduce planned replenishment inventory by about ${money(targetValue)}, the cleanest lever is to reduce or exclude low-value replenishment rows before approval.`,
      "In practice, this means setting Final Qty to 0 for selected low-risk / low-impact rows, applying a minimum impact threshold, or not approving those replenishment rows for this run.",
      "This does not delete rows from the table, source CSVs, or history; it only means those rows are not sent to stores in this replenishment run.",
      `Based on available context, excluding ${whole(affected.length)} low-value replenishment rows would reduce inventory cost by about ${money(reduction)}.`,
      `Expected trade-off: recovered revenue would fall by about ${money(lostRecovery)}. Review these rows manually before changing Final Qty.`,
      `Risk groups affected: ${Object.entries(byRisk).map(([risk, value]) => `${risk} ${money(value)}`).join(", ") || "none in context"}.`
    ].join("\n"),
    visualization: {
      type: "bar",
      title: "Inventory reduction by risk group",
      data: Object.entries(byRisk).map(([risk, value]) => ({ label: risk, value: Math.round(value) }))
    },
    calculation: {
      inputs_used: ["target inventory reduction", "low_value_replenishment_rows", "final_qty", "unit_cost", "recovered_revenue"],
      recommended_action: "Set Final Qty to 0 for selected low-value rows or exclude them from approval for this run.",
      affected_rows_count: affected.length,
      affected_units: Math.round(affected.reduce((sum, row) => sum + num(row.final_qty), 0)),
      inventory_value_impact: Math.round(reduction),
      recovered_revenue_impact: -Math.round(lostRecovery),
      limitations: "Based on available compact context; planner must manually validate rows before editing Final Qty."
    }
  };
}

function simulateReduceLostSalesRiskByPercent(context: ContextRecord, targetPercent: number): AiAnswer {
  const current = asRecord(context.current_state_kpis);
  const targetRecovery = num(current.lostSalesValue) * (targetPercent / 100);
  const candidates = identifyHighImpactUncoveredRows(context);
  let recovered = 0;
  let units = 0;
  let inventoryValue = 0;
  const selected: ContextRecord[] = [];
  for (const row of candidates) {
    if (recovered >= targetRecovery) break;
    const availableRevenue = Math.max(0, num(row.revenue_at_risk) - num(row.recovered_revenue));
    recovered += availableRevenue;
    units += num(row.uncovered_qty);
    inventoryValue += num(row.uncovered_qty) * num(row.unit_cost);
    selected.push(row);
  }
  return {
    answer: [
      `What-if: reduce lost sales risk by ${targetPercent.toFixed(0)}%.`,
      `Current lost sales risk is ${money(current.lostSalesValue)}, so the target improvement is about ${money(targetRecovery)}.`,
      `The top uncovered high-risk rows in context could recover about ${money(recovered)} using roughly ${whole(units)} incremental units and about ${money(inventoryValue)} of inventory cost.`,
      recovered >= targetRecovery ? "This looks achievable within the sampled high-impact rows, subject to DC free stock and Pack / MOQ." : "The compact context does not contain enough uncovered recoverable revenue to prove the full target is achievable.",
      "Planner action: review top uncovered High-risk rows first and increase Final Qty only where DC stock and Pack / MOQ are valid."
    ].join("\n"),
    visualization: {
      type: "waterfall",
      title: "Lost sales reduction target",
      data: [
        { label: "Target recovery", value: Math.round(targetRecovery) },
        { label: "Sampled recovery", value: Math.round(recovered) },
        { label: "Gap", value: Math.round(Math.max(0, targetRecovery - recovered)) }
      ]
    },
    calculation: {
      inputs_used: ["target lost sales reduction percent", "top_uncovered_high_risk_rows", "uncovered_qty", "unit_cost", "revenue_at_risk"],
      recommended_action: "Increase Final Qty on top uncovered High-risk rows where DC stock and Pack / MOQ allow.",
      affected_rows_count: selected.length,
      affected_units: Math.round(units),
      inventory_value_impact: Math.round(inventoryValue),
      recovered_revenue_impact: Math.round(recovered),
      limitations: "Based on sampled uncovered high-risk rows in compact context."
    }
  };
}

function simulateImproveOOS(context: ContextRecord, targetOosPercent?: number): AiAnswer {
  const current = asRecord(context.current_state_kpis);
  const simulation = asRecord(context.simulation_kpis);
  const rows = identifyHighImpactUncoveredRows(context);
  const stockNeeded = rows.reduce((sum, row) => sum + num(row.uncovered_qty), 0);
  const revenue = rows.reduce((sum, row) => sum + Math.max(0, num(row.revenue_at_risk) - num(row.recovered_revenue)), 0);
  const inventoryValue = rows.reduce((sum, row) => sum + num(row.uncovered_qty) * num(row.unit_cost), 0);
  return {
    answer: [
      targetOosPercent !== undefined
        ? `What-if: move OOS Risk toward ${targetOosPercent.toFixed(1)}%.`
        : "What-if: improve OOS Risk.",
      `Current OOS Risk is ${pct(current.oosPercent)} and Simulation OOS Risk is ${pct(simulation.oosPercent)}.`,
      `The top high-impact uncovered rows in context need about ${whole(stockNeeded)} extra units and about ${money(inventoryValue)} inventory cost.`,
      `Potential revenue protected in the sampled rows is about ${money(revenue)}.`,
      "Planner action: prioritize projected stockout rows with High risk and high revenue at risk, then check DC free stock before editing Final Qty."
    ].join("\n"),
    visualization: {
      type: "bar",
      title: "OOS improvement inputs",
      data: [
        { label: "Current OOS", value: num(current.oosPercent) },
        { label: "Simulation OOS", value: num(simulation.oosPercent) },
        ...(targetOosPercent !== undefined ? [{ label: "Target OOS", value: targetOosPercent }] : [])
      ]
    },
    calculation: {
      inputs_used: ["current OOS", "simulation OOS", "top_uncovered_high_risk_rows", "uncovered_qty"],
      recommended_action: "Prioritize projected stockout rows with High risk and high revenue at risk.",
      affected_rows_count: rows.length,
      affected_units: Math.round(stockNeeded),
      inventory_value_impact: Math.round(inventoryValue),
      recovered_revenue_impact: Math.round(revenue),
      limitations: "OOS improvement is estimated from compact high-risk uncovered rows."
    }
  };
}

function calculateProjectedGMROI(context: ContextRecord, months = 3): AiAnswer {
  const rows = rankRowsByImpact(context);
  const projectedMargin = rows.reduce((sum, row) => sum + grossMargin(row), 0) * (months / 3);
  const currentInventoryCost = rows.reduce((sum, row) => sum + (num(row.stock_on_hand) + num(row.in_transit_qty)) * num(row.unit_cost), 0);
  const projectedInventoryCost = rows.reduce((sum, row) => sum + (num(row.stock_on_hand) + num(row.in_transit_qty) + num(row.final_qty)) * num(row.unit_cost), 0);
  const averageInventoryCost = (currentInventoryCost + projectedInventoryCost) / 2;
  const gmroi = ratio(projectedMargin, averageInventoryCost);
  return {
    answer: [
      `${months}-month projected GMROI is estimated at ${gmroi.toFixed(2)}.`,
      `Formula used: projected gross margin (${money(projectedMargin)}) / average inventory cost (${money(averageInventoryCost)}).`,
      "This is a projection based on current mock forecast and inventory data, not an accounting actual.",
      "Planner interpretation: higher GMROI means the plan is generating more gross margin for each euro held in inventory."
    ].join("\n"),
    visualization: {
      type: "line",
      title: "Projected GMROI",
      data: [
        { label: "Month 1", value: Number((gmroi / 3).toFixed(2)) },
        { label: "Month 2", value: Number(((gmroi / 3) * 2).toFixed(2)) },
        { label: "Month 3", value: Number(gmroi.toFixed(2)) }
      ]
    },
    calculation: {
      inputs_used: ["forecast_14d", "final_qty", "stock_on_hand", "in_transit_qty", "selling_price", "unit_cost"],
      projected_gross_margin: Math.round(projectedMargin),
      average_inventory_cost: Math.round(averageInventoryCost),
      gmroi: Number(gmroi.toFixed(2)),
      limitations: "Prototype estimate from mock forecast and inventory data, not an accounting actual."
    }
  };
}

function compareScenarioOptions(context: ContextRecord): AiAnswer {
  const comparisonRows = asRows(context.scenario_comparison);
  if (!comparisonRows.length) {
    return {
      answer: "Scenario comparison is not available in the current context. Refresh the app so Flowstock can load the scenario comparison data."
    };
  }
  const lines = comparisonRows.map((row) => `${text(row.name)}: ${whole(row.replenishmentUnits)} units, ${money(row.recoveredRevenue)} recovered revenue, OOS ${pct(row.oosPercent)}, lost sales ${money(row.lostSalesValue)}.`);
  return {
    answer: [
      "Scenario comparison:",
      ...lines,
      "Planner interpretation: Lean should be the most conservative, Lost Sales Recovery should protect the most revenue, and Optimal should balance service, margin, and inventory."
    ].join("\n"),
    visualization: {
      type: "comparison_table",
      title: "Scenario comparison",
      data: comparisonRows.map((row) => ({
        scenario: text(row.name),
        units: Math.round(num(row.replenishmentUnits)),
        recovered_revenue: Math.round(num(row.recoveredRevenue)),
        lost_sales: Math.round(num(row.lostSalesValue)),
        oos_percent: Number(num(row.oosPercent).toFixed(1))
      }))
    }
  };
}

function compareActiveScenarioToCurrent(context: ContextRecord): AiAnswer {
  return {
    answer: currentVsSimulation(context),
    visualization: currentVsSimulationVisual(context)
  };
}

function calculateGMROIProjection(context: ContextRecord, months = 3): AiAnswer {
  return calculateProjectedGMROI(context, months);
}

function followUpClarification(question: string, messages: ChatMessage[], context: ContextRecord): AiAnswer {
  const normalized = question.toLowerCase();
  const previous = previousAssistantMessage(messages);
  const previousLower = previous.toLowerCase();
  if (/^(yes|yes please|yep|sure)$/.test(normalized) && previousLower.includes("lowest") && previousLower.includes("gmroi")) {
    const rows = identifyLowestGmroiProxyRows(context).slice(0, 8);
    const rowList = rows.map((row) => {
      return `- ${text(row.store_name)} ${text(row.product) || text(row.sku_id)}: gross margin ${num(row.gross_margin_pct).toFixed(1)}%, Final Qty ${whole(row.final_qty)}, recovered revenue ${money(row.recovered_revenue)}, unit cost ${money(row.unit_cost)}`;
    }).join("\n");
    return {
      answer: rowList
        ? [
          "Here are the lowest projected GMROI proxy rows available in the current context.",
          "Flowstock does not store accounting GMROI at row level, so this uses a prototype proxy: low gross margin %, low recovered revenue per unit, and inventory cost tied up in Final Qty.",
          rowList,
          "Planner action: review these rows before approval. If they are not commercially important, reduce Final Qty or exclude them from approval for this run; do not delete the rows from the table or CSVs."
        ].join("\n")
        : "The current compact context does not include projected GMROI proxy rows to list."
    };
  }
  if (normalized.includes("removing") || normalized.includes("remove") || normalized.includes("from where") || previous.toLowerCase().includes("low-value")) {
    return {
      answer: [
        "I mean excluding those replenishment rows from the proposed shipment, not deleting them.",
        "Operationally, that means setting Final Qty to 0 for those rows or not approving them for this run. They stay visible in the table and remain in the source CSVs and history.",
        "If you want to do it manually, filter for low-risk or low-impact rows, review the rows, and reduce Final Qty or leave them out of approval/export/shipping documents."
      ].join("\n")
    };
  }
  if (normalized.includes("which rows")) {
    const rows = identifyLowValueReplenishment(context).slice(0, 5);
    const rowList = rows.map((row) => `- ${text(row.store_name)} ${text(row.sku_id)}: Final Qty ${whole(row.final_qty)}, recovered revenue ${money(row.recovered_revenue)}, risk ${text(row.risk_level)}`).join("\n");
    return {
      answer: rowList
        ? `I mean rows like these low-value replenishment candidates from the current context:\n${rowList}\nThese rows should be reviewed manually before setting Final Qty to 0 or excluding from approval.`
        : "The current compact context does not include specific low-value rows to list."
    };
  }
  return {
    answer: previous
      ? `In my previous answer, I meant this in the Flowstock planning sense: the planner changes or excludes replenishment quantities for this run. It does not change the source CSV data unless an approval workflow later writes output files.`
      : notEnoughData
  };
}

function extractMoneyTarget(question: string, fallback = 100_000): number {
  const normalized = question.toLowerCase().replace(/,/g, "");
  const match = normalized.match(/€?\s*(\d+(?:\.\d+)?)\s*(k|m)?/);
  if (!match) return fallback;
  const amount = Number(match[1]);
  const suffix = match[2];
  if (suffix === "m") return amount * 1_000_000;
  if (suffix === "k") return amount * 1_000;
  return amount;
}

function extractPercentTarget(question: string, fallback = 30): number {
  const match = question.match(/(\d+(?:\.\d+)?)\s*%/);
  return match ? Number(match[1]) : fallback;
}

function localWhatIf(question: string, context: ContextRecord): AiAnswer | null {
  const normalized = question.toLowerCase();
  if (normalized.includes("approve only high")) return simulateApproveOnlyHighRisk(context);
  if (normalized.includes("impact threshold")) return simulateApprovalByImpactThreshold(context, extractMoneyTarget(question, 1_000));
  if (normalized.includes("reduce inventory") || normalized.includes("inventory by")) return simulateReduceInventoryByAmount(context, extractMoneyTarget(question));
  if (normalized.includes("reduce lost sales") || normalized.includes("lost sales risk by")) return simulateReduceLostSalesRiskByPercent(context, extractPercentTarget(question));
  if (normalized.includes("improve oos") || normalized.includes("improve out of stock")) return simulateImproveOOS(context);
  if (normalized.includes("projected gmroi") || normalized.includes("3-month") || normalized.includes("three-month")) return calculateGMROIProjection(context, 3);
  if (normalized.includes("compare lean") || normalized.includes("compare scenarios") || normalized.includes("lost sales recovery")) return compareScenarioOptions(context);
  return null;
}

function approvalSummaryDraft(context: ContextRecord): string {
  const approval = asRecord(context.approval_summary);
  const simulation = asRecord(context.simulation_kpis);
  return [
    `Draft approval summary:`,
    `Approve ${whole(approval.valid_visible_rows)} valid visible replenishment rows for ${whole(approval.valid_visible_units)} units.`,
    `Expected impact: ${money(simulation.recoveredRevenue)} recovered revenue, ${money(simulation.recoveredMargin)} recovered margin, and projected lost sales risk of ${money(simulation.lostSalesValue)}.`,
    `Rows blocked or excluded from visible approval: ${whole(approval.visible_rows_blocked_for_approval)}.`,
    `Recommended note: approval is based on the active ${text(context.active_scenario) || "manual"} plan and should exclude rows with unresolved validation issues.`
  ].join("\n");
}

function localAnswer(question: string, rawContext: unknown): AiAnswer {
  const context = asRecord(rawContext);
  const normalized = question.toLowerCase();
  if (!Object.keys(context).length) return { answer: notEnoughData };
  const whatIfAnswer = localWhatIf(question, context);
  if (whatIfAnswer) return whatIfAnswer;
  const dictionaryAnswer = kpiDictionary(question, context);
  if (dictionaryAnswer) return dictionaryAnswer;
  if (normalized.includes("selected row")) return { answer: selectedRowExplanation(context) };
  if (normalized.includes("uncovered") && !normalized.includes("high risk") && !normalized.includes("not fully covered")) {
    return uncoveredQuantityExplanation(context);
  }
  if (normalized.includes("high risk") || normalized.includes("not fully covered")) {
    return { answer: highRiskCoverage(context), visualization: highRiskCoverageVisual(context) };
  }
  if (normalized.includes("approve first")) return { answer: approvalAdvice(context) };
  if (normalized.includes("approval blocker") || normalized.includes("blocker")) return { answer: blockersAdvice(context) };
  if (normalized.includes("current state") || normalized.includes("simulation") || normalized.includes("compare")) return compareActiveScenarioToCurrent(context);
  if (normalized.includes("dc free stock")) return { answer: dcFreeStockExplanation(context) };
  if (normalized.includes("draft approval")) return { answer: approvalSummaryDraft(context) };
  if (normalized.includes("summarize") || normalized.includes("summary") || normalized.includes("scenario") || normalized.includes("plan")) {
    return { answer: scenarioSummary(context), visualization: scenarioSummaryVisual(context) };
  }
  return { answer: notEnoughData };
}

function setupMessage() {
  return "Flowstock AI is ready, but OPENAI_API_KEY is not configured yet. Add your OpenAI API key to .env.local, then restart the local app.";
}

export async function GET() {
  const apiKey = process.env.OPENAI_API_KEY;
  return NextResponse.json({
    setupRequired: !apiKey || apiKey === "your_api_key_here",
    message: !apiKey || apiKey === "your_api_key_here" ? setupMessage() : ""
  });
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey === "your_api_key_here") {
    return NextResponse.json({
      setupRequired: true,
      message: setupMessage()
    });
  }

  const body = (await request.json()) as { messages?: ChatMessage[]; context?: unknown };
  const messages = body.messages ?? [];
  const latestUserMessage = [...messages].reverse().find((message) => message.role === "user")?.content;
  if (!latestUserMessage?.trim()) {
    return NextResponse.json({ error: "Please enter a question for Flowstock AI." }, { status: 400 });
  }

  const context = asRecord(body.context);
  const intent = detectIntent(latestUserMessage, messages);
  const deterministicAnswer = intent === "follow_up_clarification"
    ? followUpClarification(latestUserMessage, messages, context)
    : localAnswer(latestUserMessage, context);

  const chatTranscript = messages
    .map((message) => `${message.role === "user" ? "Planner" : "Flowstock AI"}: ${message.content}`)
    .join("\n\n");

  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5-mini",
        instructions: systemPrompt,
        max_output_tokens: 1000,
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: `Detected intent: ${intent}.\n\nCurrent replenishment context:\n${JSON.stringify(body.context ?? {}, null, 2)}\n\nApp-side calculation result, if relevant:\n${JSON.stringify(deterministicAnswer, null, 2)}\n\nConversation:\n${chatTranscript}\n\nResponse rules:\n- Answer the latest planner question directly in the first sentence.\n- Use prior chat messages for follow-up questions, including short replies like "yes".\n- Do not default to a dashboard summary unless the user asked for a summary.\n- Do not simply repeat the app-side calculation text. Use it only as grounded data, then explain conversationally.\n- If the App-side calculation result contains an answer, drivers, rows, or a visualization, use those as grounded evidence instead of saying there is not enough data.\n- For "why is Uncovered Qty so big" or similar questions, explain the business drivers first using uncovered_qty_drivers, risk_summary, and top_uncovered_rows. Do not only restate Required Qty minus Final Qty and do not answer with a chart alone.\n- If a visualization is returned, still provide a complete text answer before the visual.\n- If the user asks what an earlier phrase meant, clarify that phrase first.\n- If the user asks for lowest-GMROI rows, use gmroi_proxy_rows and clearly label it as a projected proxy based on available Flowstock fields, not accounting GMROI.\n- Use precise action wording: set Final Qty to 0, exclude from approval, do not send in this run, approve only selected rows, reduce Final Qty, or apply a minimum impact threshold.\n- If a very specific fact is not present in the context or app-side calculation, say exactly: "${notEnoughData}"`
              }
            ]
          }
        ]
      })
    });
  } catch {
    return NextResponse.json({ error: "Flowstock AI could not reach OpenAI. Check your internet connection and API key." }, { status: 502 });
  }

  const data = (await response.json()) as ResponsesApiOutput;
  if (!response.ok) {
    return NextResponse.json(
      { error: data.error?.message || "Flowstock AI could not answer right now." },
      { status: response.status }
    );
  }

  const modelAnswer = extractText(data);
  const modelSaysNotEnough = modelAnswer.trim().toLowerCase().includes(notEnoughData.toLowerCase());
  const localHasGroundedAnswer = Boolean(
    deterministicAnswer.answer &&
    deterministicAnswer.answer.trim() &&
    deterministicAnswer.answer.trim() !== notEnoughData
  );
  const answer = modelSaysNotEnough && localHasGroundedAnswer
    ? deterministicAnswer.answer
    : modelAnswer || (localHasGroundedAnswer ? deterministicAnswer.answer : notEnoughData);

  return NextResponse.json({
    answer,
    visualization: deterministicAnswer.visualization,
    calculation: deterministicAnswer.calculation
  });
}
