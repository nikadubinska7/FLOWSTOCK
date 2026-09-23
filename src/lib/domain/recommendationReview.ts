import type { WorkingRow } from "./types";
import { shortage } from "./availability";

export function compareRecoveredSales(
  a: WorkingRow,
  b: WorkingRow,
  direction: "asc" | "desc",
) {
  const delta = a.expectedRecoveredRevenue - b.expectedRecoveredRevenue;
  return (
    (direction === "desc" ? -delta : delta) ||
    b.revenueAtRisk - a.revenueAtRisk ||
    a.id.localeCompare(b.id)
  );
}

export function zeroRecommendationReasons(
  row: WorkingRow,
): { label: string; detail: string }[] {
  if (row.systemRecommendedQty > 0) return [];
  const reasons: { label: string; detail: string }[] = [];
  if (!row.ranged)
    reasons.push({
      label: "Not ranged",
      detail: "This SKU is outside the store's fixed assortment.",
    });
  if (
    !row.replenishable ||
    ["discontinued", "inactive", "blocked"].includes(
      row.lifecycleStatus.toLowerCase(),
    )
  )
    reasons.push({
      label: "Not replenishable",
      detail: "The SKU's replenishment flag or lifecycle prevents a shipment.",
    });
  if (row.dataIssueSeverity.toLowerCase() === "blocker")
    reasons.push({
      label: "Blocking data issue",
      detail:
        row.dataIssueDescription ||
        "Resolve the blocker-level data issue before replenishment.",
    });
  if (!Number.isSafeInteger(row.packMultiple) || row.packMultiple < 1)
    reasons.push({
      label: "Invalid pack size",
      detail: "A valid whole-unit pack size is required.",
    });
  if (
    !Number.isFinite(row.daysToDelivery) ||
    row.daysToDelivery < 0 ||
    row.daysToDelivery >= 14
  )
    reasons.push({
      label: "Delivery outside horizon",
      detail: "The delivery falls outside the 14-day planning horizon.",
    });
  if (reasons.length) return reasons;
  if (shortage(row) <= 0)
    return [
      {
        label: "No replenishment needed",
        detail:
          "Stock on hand and in-transit stock cover the forecast demand that this delivery could fulfil.",
      },
    ];
  const minimum =
    Math.ceil((row.minShipment ?? row.packMultiple) / row.packMultiple) *
    row.packMultiple;
  const free = row.dcFreeStockOriginal;
  const room = Math.max(
    0,
    row.storeSkuCapacityUnits - row.stockOnHand - row.inTransitQty,
  );
  if (free < minimum)
    reasons.push({
      label: free === 0 ? "No DC free stock" : "DC below minimum pack",
      detail: `DC free stock before allocation: ${free} units; minimum shipment: ${minimum} units.`,
    });
  if (room < minimum)
    reasons.push({
      label: "SKU capacity limit",
      detail: `SKU capacity ${row.storeSkuCapacityUnits} − on hand ${row.stockOnHand} − in transit ${row.inTransitQty} leaves ${room} units of room; minimum shipment: ${minimum} units.`,
    });
  if ((row.maxShipment ?? Infinity) < minimum)
    reasons.push({
      label: "Shipment limit",
      detail: `Maximum shipment ${row.maxShipment} is below the minimum shipment of ${minimum} units.`,
    });
  const code = row.reasonCode.toLowerCase();
  if (code.includes("dc shortage allocation"))
    reasons.push({
      label: "DC allocated to other rows",
      detail:
        "Higher-priority shipments used the available DC stock; no complete shipment remained for this row.",
    });
  if (code.includes("capacity capped: receiving"))
    reasons.push({
      label: "Receiving capacity limit",
      detail: `Other recommended rows use the store's receiving allowance of ${row.receivingCapacityUnits} units; insufficient room remains for this shipment.`,
    });
  if (code.includes("capacity capped: category"))
    reasons.push({
      label: "Category capacity limit",
      detail: `Current stock, in-transit stock and other recommendations leave insufficient space within the category limit of ${row.hardCategoryCapacityUnits} units.`,
    });
  if (code.includes("budget capped"))
    reasons.push({
      label: "Budget limit",
      detail:
        "The remaining plan budget cannot fund a complete shipment for this row.",
    });
  return reasons.length
    ? reasons
    : [{ label: "Review allocation limits", detail: row.reasonCode }];
}
