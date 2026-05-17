import type { ScenarioKey } from "@/lib/domain/types";

export type ScenarioConfig = {
  key: ScenarioKey;
  name: string;
  targetCoverMultiplier: number;
  serviceLevelWeight: number;
  grossMarginWeight: number;
  revenueWeight: number;
  inventoryPenaltyWeight: number;
  logisticsPenaltyWeight: number;
};

export const scenarios: Record<ScenarioKey, ScenarioConfig> = {
  inventory: {
    key: "inventory",
    name: "Lean Replenishment",
    targetCoverMultiplier: 0.55,
    serviceLevelWeight: 0.3,
    grossMarginWeight: 0.25,
    revenueWeight: 0.15,
    inventoryPenaltyWeight: 0.25,
    logisticsPenaltyWeight: 0.05
  },
  lostSales: {
    key: "lostSales",
    name: "Lost Sales Recovery",
    targetCoverMultiplier: 1.15,
    serviceLevelWeight: 0.35,
    grossMarginWeight: 0.3,
    revenueWeight: 0.25,
    inventoryPenaltyWeight: 0.05,
    logisticsPenaltyWeight: 0.05
  },
  optimal: {
    key: "optimal",
    name: "Optimal Recommendation",
    targetCoverMultiplier: 1,
    serviceLevelWeight: 0.3,
    grossMarginWeight: 0.35,
    revenueWeight: 0.15,
    inventoryPenaltyWeight: 0.15,
    logisticsPenaltyWeight: 0.05
  }
};

export function scenarioForKey(key: ScenarioKey): ScenarioConfig {
  return scenarios[key] ?? scenarios.optimal;
}
