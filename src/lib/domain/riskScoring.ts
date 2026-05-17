import type { RiskLevel, WorkingRow } from "@/lib/domain/types";

export function riskForRow(row: Pick<WorkingRow, "constraintStatus" | "daysOfCover" | "marginAtRisk" | "promoFlag" | "forecastConfidence" | "dcFreeStock">): RiskLevel {
  if (row.constraintStatus === "Blocked") return "Blocked";
  if (row.daysOfCover <= 2 || row.marginAtRisk >= 250 || (row.promoFlag && row.daysOfCover <= 5)) return "High";
  if (row.daysOfCover <= 7 || row.forecastConfidence < 0.65 || row.dcFreeStock < 60) return "Medium";
  return "Low";
}
