import type { WorkingRow } from "@/lib/domain/types";

export type BaselineInput = Pick<
  WorkingRow,
  | "stockOnHand"
  | "inTransitQty"
  | "averageDailySales"
  | "forecastNext7"
  | "daysOfCover"
  | "packMultiple"
  | "promoUpliftPct"
  | "seasonalIndex"
  | "minPresentationQty"
  | "minCoverDays"
  | "targetCoverDays"
>;

export function baselineRequiredQty(row: BaselineInput): number {
  const availableStock = row.stockOnHand + row.inTransitQty;
  const adjustedDailyForecast = Math.max(0, row.averageDailySales * row.seasonalIndex * (1 + row.promoUpliftPct));
  const minimumRequiredStock = row.forecastNext7 + row.minPresentationQty;
  const baselineDemand = Math.max(adjustedDailyForecast * row.targetCoverDays, minimumRequiredStock);
  const shouldCalculateNeed = availableStock < Math.max(row.forecastNext7, adjustedDailyForecast) || row.daysOfCover < row.minCoverDays;
  const rawNeed = shouldCalculateNeed ? baselineDemand + row.minPresentationQty - availableStock : 0;

  if (rawNeed <= 0 || row.packMultiple <= 0) return 0;
  return Math.ceil(rawNeed / row.packMultiple) * row.packMultiple;
}
