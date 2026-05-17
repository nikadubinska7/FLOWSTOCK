export type ScenarioKey = "inventory" | "lostSales" | "optimal";
export type RiskLevel = "Low" | "Medium" | "High" | "Blocked";
export type ConstraintStatus = "Valid" | "Warning" | "Blocked";

export type CsvRecord = Record<string, string>;

export type Kpis = {
  inventoryValue: number;
  daysOfCover: number;
  oosPercent: number;
  lostSalesValue: number;
  marginAtRisk: number;
  recoveredRevenue: number;
  recoveredMargin: number;
  dcFreeStock: number;
  improvedRows: number;
  constraintViolations: number;
  replenishmentUnits: number;
};

export type WorkingRow = {
  id: string;
  selected: boolean;
  storeId: string;
  storeName: string;
  routeId: string;
  deliveryDay: string;
  category: string;
  skuId: string;
  styleColorSize: string;
  productDescription: string;
  systemRecommendedQty: number;
  finalQty: number;
  stockOnHand: number;
  inTransitQty: number;
  averageDailySales: number;
  forecastNext7: number;
  forecastNext14: number;
  daysOfCover: number;
  projectedDaysOfCover: number;
  daysToDelivery: number;
  packMultiple: number;
  dcTotalStock: number;
  dcFreeStock: number;
  dcFreeStockOriginal: number;
  revenueAtRisk: number;
  marginAtRisk: number;
  expectedRecoveredRevenue: number;
  expectedRecoveredMargin: number;
  forecastConfidence: number;
  promoFlag: boolean;
  promoUpliftPct: number;
  seasonalIndex: number;
  riskLevel: RiskLevel;
  reasonCode: string;
  constraintStatus: ConstraintStatus;
  constraintMessages: string[];
  comment: string;
  manualOverride: boolean;
  dataIssue: boolean;
  dataIssueSeverity: string;
  dataIssueDescription: string;
  ranged: boolean;
  replenishable: boolean;
  storeSkuCapacityUnits: number;
  softCategoryCapacityUnits: number;
  hardCategoryCapacityUnits: number;
  receivingCapacityUnits: number;
  unitCost: number;
  sellingPrice: number;
  grossMarginPct: number;
  minPresentationQty: number;
  targetCoverDays: number;
  minCoverDays: number;
  maxCoverDays: number;
  serviceLevelTarget: number;
  storeSkuPriority: number;
  lifecycleStatus: string;
};

export type RefreshResponse = {
  packagePath: string;
  runDate: string;
  rows: WorkingRow[];
  currentKpis: Kpis;
  simulationKpis: Kpis;
  scenarioComparison: ScenarioComparisonRow[];
  dataIssues: DataIssueSummary[];
  runHistory: RunHistoryRow[];
};

export type ScenarioComparisonRow = {
  name: string;
  replenishmentUnits: number;
  inventoryValue: number;
  lostSalesValue: number;
  recoveredRevenue: number;
  recoveredMargin: number;
  oosPercent: number;
  constraintViolations: number;
};

export type DataIssueSummary = {
  issueId: string;
  storeId: string;
  skuId: string;
  issueType: string;
  description: string;
  severity: string;
  blocksApproval: boolean;
};

export type RunHistoryRow = {
  runDate: string;
  scenario: string;
  approvedRows: number;
  approvedUnits: number;
  retailValue: number;
  costValue: number;
  packagePath: string;
};

export type ApprovalRequest = {
  rows: WorkingRow[];
  scenario: string;
  createShippingDocs: boolean;
};

export type ApprovalResponse = {
  approvalId: string;
  approvedRows: number;
  approvedUnits: number;
  blockedRowsExcluded: number;
  outputPath: string;
  nextPackagePath: string;
  shippingDocsCreated: number;
};
