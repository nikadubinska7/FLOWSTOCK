export type RiskLevel = "Low" | "Medium" | "High";
export type ConstraintStatus = "Valid" | "Blocked";

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
  productName: string;
  forecastLower?: number;
  forecastUpper?: number;
  baselineForecast?: number;
  modelForecast?: number;
  modelVersion?: string;
  forecastFallback?: boolean;
  forecastEligible?: boolean;
  forecastSignals?: string;
  dataOrigin?: string;
  displayMetadataOrigin?: string;
  quantityOrigin?: string;
  priorityScore?: number;
  rankingScore?: number;
  constraintAdjustments?: string[];
  normalizedMarginContribution?: number;
  normalizedServiceContribution?: number;
  minShipment?: number;
  maxShipment?: number;
  productDescription: string;
  baselineRequiredQty: number;
  baselineRevenueAtRisk: number;
  requiredQty: number;
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
  constraintWarnings?: string[];
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
  dataIssues: DataIssueSummary[];
  runHistory: RunHistoryRow[];
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
  planId: string;
  createShippingDocs: boolean;
};

export type ApprovalResponse = {
  approvalId: string;
  approvedRows: number;
  approvedUnits: number;
  totalRetailValue: number;
  totalCostValue: number;
  blockedRowsExcluded: number;
  outputPath: string;
  nextPackagePath: string;
  shippingDocsCreated: number;
};
