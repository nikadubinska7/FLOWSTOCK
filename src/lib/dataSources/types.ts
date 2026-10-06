export type DataSourceId =
  "sportswear-csv" | "grocery-research" | "business-central";

export type DataSourceStatus =
  "ready" | "configured" | "connected" | "not_connected";

export type DataSnapshotSummary = {
  id: string;
  label: string;
  description: string;
};

export type DataSourceSummary = {
  id: DataSourceId;
  label: string;
  kind: "csv" | "api";
  status: DataSourceStatus;
  statusMessage: string;
  description: string;
  defaultSnapshot: string | null;
  snapshots: DataSnapshotSummary[];
  capabilities: {
    canPlan: boolean;
    canTestConnection: boolean;
    canSync: boolean;
  };
};
