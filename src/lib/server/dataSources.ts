import path from "path";
import { promises as fs } from "fs";
import type {
  DataSourceId,
  DataSourceSummary,
  DataSnapshotSummary,
} from "@/lib/dataSources/types";
import {
  groceryDemoPath,
  latestPackagePathForSource,
  sourceRunsRoot,
  sportswearPackagePath,
} from "@/lib/utils/filePaths";
import { modelRoot, readState, safeId } from "./storage";
import { businessCentralConnectionKey } from "./businessCentral";
import {
  databricksConfigured,
  databricksConnectionKey,
  databricksSnapshotSummaries,
  resolveDatabricksSnapshot,
} from "./databricks";

export interface DataSourceProvider {
  id: DataSourceId;
  summary(): Promise<DataSourceSummary>;
  resolveSnapshot(snapshot: string): Promise<string>;
}

function snapshot(
  id: string,
  label: string,
  description: string,
): DataSnapshotSummary {
  return { id, label, description };
}

async function modelSnapshots(): Promise<DataSnapshotSummary[]> {
  try {
    const entries = await fs.readdir(modelRoot, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory() && entry.name.startsWith("model-"))
      .map((entry) =>
        snapshot(
          entry.name,
          `Prepared demand snapshot · ${entry.name}`,
          "Locally generated grocery research package.",
        ),
      )
      .sort((a, b) => b.id.localeCompare(a.id));
  } catch {
    return [];
  }
}

const sportswearProvider: DataSourceProvider = {
  id: "sportswear-csv",
  async summary() {
    return {
      id: this.id,
      label: "Sportswear CSV",
      kind: "csv",
      status: "ready",
      statusMessage: "Ready",
      description:
        "Original mock sportswear network: 70 stores and 1,200 SKUs.",
      defaultSnapshot: "latest",
      snapshots: [
        snapshot(
          "latest",
          "Latest sportswear planning day",
          "Most recent approved sportswear package, or the original package when no approval exists.",
        ),
        snapshot(
          "sportswear",
          "Original sportswear dataset",
          "Corrected working copy of the original sportswear CSV package.",
        ),
      ],
      capabilities: {
        canPlan: true,
        canTestConnection: false,
        canSync: true,
      },
    };
  },
  async resolveSnapshot(snapshotId) {
    if (snapshotId === "latest")
      return latestPackagePathForSource("sportswear-csv");
    if (snapshotId === "sportswear") return sportswearPackagePath();
    throw new Error("INVALID_SOURCE_SNAPSHOT");
  },
};

const groceryProvider: DataSourceProvider = {
  id: "grocery-research",
  async summary() {
    return {
      id: this.id,
      label: "Grocery research CSV",
      kind: "csv",
      status: "ready",
      statusMessage: "Ready",
      description:
        "Optional grocery research fixtures and prepared model packages.",
      defaultSnapshot: "demo",
      snapshots: [
        snapshot(
          "latest",
          "Latest grocery planning day",
          "Most recent approved grocery package, or the demo package when no approval exists.",
        ),
        snapshot(
          "demo",
          "Grocery demo",
          "Small offline fixture for research and integration checks.",
        ),
        ...(await modelSnapshots()),
      ],
      capabilities: {
        canPlan: true,
        canTestConnection: false,
        canSync: true,
      },
    };
  },
  async resolveSnapshot(snapshotId) {
    if (snapshotId === "latest")
      return latestPackagePathForSource("grocery-research");
    if (snapshotId === "demo") return groceryDemoPath;
    if (snapshotId.startsWith("model-")) {
      safeId(snapshotId);
      const candidate = path.join(modelRoot, snapshotId, "package");
      try {
        await fs.access(candidate);
      } catch {
        throw new Error("SNAPSHOT_NOT_FOUND");
      }
      return candidate;
    }
    throw new Error("INVALID_SOURCE_SNAPSHOT");
  },
};

const businessCentralProvider: DataSourceProvider = {
  id: "business-central",
  async summary() {
    const credentialsPresent = [
      process.env.BC_TENANT_ID,
      process.env.BC_CLIENT_ID,
      process.env.BC_CLIENT_SECRET,
      process.env.BC_ENVIRONMENT,
      process.env.BC_COMPANY_NAME,
    ].every(Boolean);
    const connection = await readState<{
      connectionKey: string;
      environment: string;
      company: { name: string };
    } | null>("data-sources/business-central/connection.json", null);
    let connected = false;
    if (credentialsPresent && connection) {
      try {
        connected =
          connection.connectionKey === businessCentralConnectionKey() &&
          connection.environment === process.env.BC_ENVIRONMENT &&
          connection.company.name === process.env.BC_COMPANY_NAME;
      } catch {
        connected = false;
      }
    }
    return {
      id: this.id,
      label: "Microsoft Business Central",
      kind: "api",
      status: connected
        ? "connected"
        : credentialsPresent
          ? "configured"
          : "not_connected",
      statusMessage: connected
        ? `Connected · ${connection!.environment} · ${connection!.company.name}`
        : credentialsPresent
          ? "Credentials configured · connection not tested"
          : "Not connected",
      description:
        "Business Central API source. Read-only discovery is connected; synchronization awaits a location and business-role mapping.",
      defaultSnapshot: null,
      snapshots: [],
      capabilities: {
        canPlan: false,
        canTestConnection: credentialsPresent,
        canSync: false,
      },
    };
  },
  async resolveSnapshot() {
    throw new Error("SOURCE_NOT_CONNECTED");
  },
};

const databricksProvider: DataSourceProvider = {
  id: "databricks-sportswear",
  async summary() {
    const configured = databricksConfigured();
    const snapshots = await databricksSnapshotSummaries();
    const connection = await readState<{
      connectionKey: string;
      testedAt: string;
      warehouseId: string;
      principal: string;
    } | null>("data-sources/databricks-sportswear/connection.json", null);
    let connected = false;
    if (configured && connection) {
      try {
        connected = connection.connectionKey === databricksConnectionKey();
      } catch {
        connected = false;
      }
    }
    return {
      id: this.id,
      label: "Databricks sportswear V3",
      kind: "api",
      status: snapshots.length
        ? "ready"
        : connected
          ? "connected"
          : configured
            ? "configured"
            : "not_connected",
      statusMessage: snapshots.length
        ? `${snapshots.length} synchronized snapshot${snapshots.length === 1 ? "" : "s"}`
        : connected
          ? "Connected · synchronize the planning snapshot"
          : configured
            ? "Credentials configured · connection not tested"
            : "Databricks connection not configured",
      description:
        "Updated sportswear research dataset: 70 stores, 720 SKUs and a fixed-origin planning snapshot synchronized from Databricks serving tables.",
      defaultSnapshot: snapshots[0]?.id ?? null,
      snapshots,
      capabilities: {
        canPlan: snapshots.length > 0,
        canTestConnection: configured,
        canSync: configured,
      },
    };
  },
  async resolveSnapshot(snapshotId) {
    return resolveDatabricksSnapshot(snapshotId);
  },
};

const providers: Record<DataSourceId, DataSourceProvider> = {
  "sportswear-csv": sportswearProvider,
  "databricks-sportswear": databricksProvider,
  "grocery-research": groceryProvider,
  "business-central": businessCentralProvider,
};

export function isDataSourceId(value: string): value is DataSourceId {
  return value in providers;
}

export function inferDataSource(snapshotId: string): DataSourceId {
  return snapshotId === "demo" || snapshotId.startsWith("model-")
    ? "grocery-research"
    : "sportswear-csv";
}

export function getDataSourceProvider(sourceId: string): DataSourceProvider {
  if (!isDataSourceId(sourceId)) throw new Error("INVALID_DATA_SOURCE");
  return providers[sourceId];
}

export async function listDataSources(): Promise<DataSourceSummary[]> {
  if (process.env.NEXT_PUBLIC_FLOWSTOCK_V3_ONLY === "1") {
    return [await providers["databricks-sportswear"].summary()];
  }
  return Promise.all(
    (
      [
        "databricks-sportswear",
        "sportswear-csv",
        "business-central",
        "grocery-research",
      ] as const
    ).map((id) => providers[id].summary()),
  );
}

export async function resolveDataSnapshot(
  sourceId: string,
  snapshotId: string,
): Promise<string> {
  return getDataSourceProvider(sourceId).resolveSnapshot(snapshotId);
}

export function storageRootForSource(sourceId: DataSourceId): string {
  return sourceRunsRoot(sourceId);
}
