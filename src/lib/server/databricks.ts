import { promises as fs } from "fs";
import path from "path";
import { createHash } from "crypto";
import { writeCsv } from "@/lib/csv/writeCsv";
import { loadCsvPackage } from "@/lib/domain/joins";
import type { CsvRecord } from "@/lib/domain/types";
import type { DataSnapshotSummary } from "@/lib/dataSources/types";
import { sourceRunsRoot } from "@/lib/utils/filePaths";

type SqlColumn = { name: string };
type StatementResponse = {
  statement_id?: string;
  status?: { state?: string; error?: { message?: string } };
  manifest?: { schema?: { columns?: SqlColumn[] } };
  result?: {
    data_array?: (string | number | boolean | null)[][];
    next_chunk_internal_link?: string;
  };
  data_array?: (string | number | boolean | null)[][];
  next_chunk_internal_link?: string;
};

type DatabricksConfig = {
  host: string;
  warehouseId: string;
  catalog: string;
  schema: string;
  tablePrefix: string;
};

const sourceId = "databricks-sportswear" as const;
const required = ["DATABRICKS_HOST", "DATABRICKS_WAREHOUSE_ID"] as const;
let oauthCache: { token: string; expiresAt: number } | null = null;

function identifier(value: string, label: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,254}$/.test(value))
    throw new Error(`INVALID_DATABRICKS_${label}`);
  return value;
}

function config(): DatabricksConfig {
  for (const name of required)
    if (!process.env[name]) throw new Error("DATABRICKS_NOT_CONFIGURED");
  const host = process.env
    .DATABRICKS_HOST!.replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
  if (!/^[A-Za-z0-9.-]+$/.test(host))
    throw new Error("INVALID_DATABRICKS_HOST");
  const warehouseId = process.env.DATABRICKS_WAREHOUSE_ID!;
  if (!/^[A-Za-z0-9-]+$/.test(warehouseId))
    throw new Error("INVALID_DATABRICKS_WAREHOUSE_ID");
  return {
    host,
    warehouseId,
    catalog: identifier(
      process.env.DATABRICKS_CATALOG || "workspace",
      "CATALOG",
    ),
    schema: identifier(process.env.DATABRICKS_SCHEMA || "default", "SCHEMA"),
    tablePrefix: identifier(
      process.env.DATABRICKS_APP_TABLE_PREFIX || "flowstock_app",
      "TABLE_PREFIX",
    ),
  };
}

export function databricksConfigured(): boolean {
  const base = required.every((name) => Boolean(process.env[name]));
  const auth =
    Boolean(process.env.DATABRICKS_TOKEN) ||
    Boolean(
      process.env.DATABRICKS_CLIENT_ID && process.env.DATABRICKS_CLIENT_SECRET,
    );
  return base && auth;
}

export function databricksConnectionKey(): string {
  const cfg = config();
  const authIdentity = process.env.DATABRICKS_CLIENT_ID
    ? `oauth:${process.env.DATABRICKS_CLIENT_ID}`
    : `token:${createHash("sha256")
        .update(process.env.DATABRICKS_TOKEN || "")
        .digest("hex")}`;
  return createHash("sha256")
    .update(
      JSON.stringify({
        host: cfg.host,
        warehouseId: cfg.warehouseId,
        catalog: cfg.catalog,
        schema: cfg.schema,
        tablePrefix: cfg.tablePrefix,
        authIdentity,
      }),
    )
    .digest("hex");
}

async function accessToken(cfg: DatabricksConfig): Promise<string> {
  if (process.env.DATABRICKS_TOKEN) return process.env.DATABRICKS_TOKEN;
  const clientId = process.env.DATABRICKS_CLIENT_ID;
  const clientSecret = process.env.DATABRICKS_CLIENT_SECRET;
  if (!clientId || !clientSecret)
    throw new Error("DATABRICKS_AUTH_NOT_CONFIGURED");
  if (oauthCache && oauthCache.expiresAt > Date.now() + 60_000)
    return oauthCache.token;
  const response = await fetch(`https://${cfg.host}/oidc/v1/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials&scope=all-apis",
    cache: "no-store",
  });
  if (!response.ok) throw new Error("DATABRICKS_AUTH_FAILED");
  const body = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!body.access_token) throw new Error("DATABRICKS_AUTH_FAILED");
  oauthCache = {
    token: body.access_token,
    expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
  };
  return body.access_token;
}

async function api<T>(
  cfg: DatabricksConfig,
  route: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`https://${cfg.host}${route}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${await accessToken(cfg)}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`DATABRICKS_API_ERROR_${response.status}`);
  return response.json() as Promise<T>;
}

function statementError(response: StatementResponse): never {
  const message =
    response.status?.error?.message || response.status?.state || "UNKNOWN";
  throw new Error(`DATABRICKS_STATEMENT_FAILED:${message.slice(0, 300)}`);
}

async function execute(statement: string): Promise<CsvRecord[]> {
  const cfg = config();
  let response = await api<StatementResponse>(cfg, "/api/2.0/sql/statements", {
    method: "POST",
    body: JSON.stringify({
      statement,
      warehouse_id: cfg.warehouseId,
      catalog: cfg.catalog,
      schema: cfg.schema,
      wait_timeout: "30s",
      on_wait_timeout: "CONTINUE",
      format: "JSON_ARRAY",
      disposition: "INLINE",
    }),
  });
  if (!response.statement_id)
    throw new Error("DATABRICKS_INVALID_STATEMENT_RESPONSE");
  for (
    let attempt = 0;
    response.status?.state === "PENDING" ||
    response.status?.state === "RUNNING";
    attempt++
  ) {
    if (attempt >= 60) throw new Error("DATABRICKS_STATEMENT_TIMEOUT");
    await new Promise((resolve) => setTimeout(resolve, 1000));
    response = await api<StatementResponse>(
      cfg,
      `/api/2.0/sql/statements/${response.statement_id}`,
    );
  }
  if (response.status?.state !== "SUCCEEDED") statementError(response);
  const columns =
    response.manifest?.schema?.columns?.map((column) => column.name) ?? [];
  if (!columns.length) throw new Error("DATABRICKS_RESULT_SCHEMA_MISSING");
  const allRows = [...(response.result?.data_array ?? [])];
  let next = response.result?.next_chunk_internal_link;
  const maximum = Number(process.env.DATABRICKS_SYNC_MAX_ROWS || 2_000_000);
  while (next) {
    const chunk = await api<StatementResponse>(cfg, next);
    allRows.push(...(chunk.data_array ?? chunk.result?.data_array ?? []));
    if (allRows.length > maximum)
      throw new Error("DATABRICKS_SYNC_ROW_LIMIT_EXCEEDED");
    next =
      chunk.next_chunk_internal_link ?? chunk.result?.next_chunk_internal_link;
  }
  return allRows.map((values) =>
    Object.fromEntries(
      columns.map((column, index) => [
        column,
        values[index] == null ? "" : String(values[index]),
      ]),
    ),
  );
}

function qualified(cfg: DatabricksConfig, suffix: string): string {
  return `\`${cfg.catalog}\`.\`${cfg.schema}\`.\`${cfg.tablePrefix}_${identifier(suffix, "TABLE")}\``;
}

const exports: Record<string, string[]> = {
  stores: [
    "store_id",
    "store_name",
    "city",
    "country",
    "region",
    "route_id",
    "delivery_day",
    "store_priority",
    "floor_space_sqm",
    "category_capacity_apparel_units",
    "category_capacity_shoes_units",
    "receiving_capacity_units_per_delivery",
    "active_flag",
  ],
  sku_master: [
    "sku_id",
    "style_id",
    "style_color_size",
    "category",
    "subcategory",
    "color",
    "size",
    "season",
    "lifecycle_status",
    "unit_cost",
    "selling_price",
    "gross_margin_pct",
    "pack_multiple",
    "min_presentation_qty",
    "replenishable_flag",
  ],
  dc_inventory: [
    "sku_id",
    "dc_total_stock",
    "dc_reserved_stock",
    "dc_blocked_stock",
    "dc_safety_stock",
    "dc_inbound_qty_next_7d",
    "dc_free_stock",
  ],
  assortment: [
    "store_id",
    "sku_id",
    "ranged_flag",
    "target_cover_days",
    "min_cover_days",
    "max_cover_days",
    "store_sku_capacity_units",
    "service_level_target",
    "store_sku_priority",
  ],
  store_inventory: [
    "run_date",
    "store_id",
    "sku_id",
    "stock_on_hand",
    "in_transit_qty",
    "last_delivery_date",
  ],
  forecast_next_28d: [
    "store_id",
    "sku_id",
    "forecast_daily_sales_base",
    "forecast_next_7_units",
    "forecast_next_14_units",
    "forecast_next_28_units",
    "forecast_confidence",
    "under_forecast_bias",
    "seasonal_index",
    "promo_uplift_pct",
    "promo_flag_next_28d",
    "model_forecast",
    "model_version",
    "fallback",
    "ranking_score",
    "signals",
    "source_origin",
  ],
  promo_calendar: [
    "promo_id",
    "sku_id",
    "promo_name",
    "start_date",
    "end_date",
    "expected_uplift_pct",
    "known_in_advance_flag",
  ],
  open_orders: [
    "order_id",
    "store_id",
    "sku_id",
    "order_qty",
    "ship_date",
    "expected_arrival_date",
    "status",
  ],
  capacity_rules: [
    "store_id",
    "category",
    "soft_capacity_units",
    "hard_capacity_units",
    "receiving_capacity_units_per_delivery",
    "capacity_rule",
  ],
  data_quality_issues: [
    "issue_id",
    "run_date",
    "store_id",
    "sku_id",
    "issue_type",
    "issue_description",
    "severity",
    "resolved_flag",
  ],
  approval_history: [
    "approval_id",
    "approval_datetime",
    "scenario_name",
    "approved_by",
    "store_id",
    "sku_id",
    "approved_qty",
    "system_recommended_qty",
    "manual_override_flag",
    "comment",
  ],
  manual_overrides: [
    "run_date",
    "store_id",
    "sku_id",
    "system_recommended_qty",
    "final_qty",
    "comment",
    "user",
    "timestamp",
  ],
  simulation_state: [
    "run_date",
    "business_day_number",
    "last_approved_scenario",
    "source_package",
    "notes",
  ],
  optimization_parameters: [
    "scenario",
    "service_level_weight",
    "gross_margin_weight",
    "revenue_weight",
    "inventory_penalty_weight",
    "logistics_penalty_weight",
    "target_cover_multiplier",
    "scarce_stock_rule",
  ],
  file_manifest: ["file_name", "primary_key", "description"],
  sales_history_28d: [
    "date",
    "store_id",
    "sku_id",
    "sales_units",
    "gross_sales",
    "promo_flag",
  ],
};

export async function testDatabricksConnection() {
  const cfg = config();
  const rows = await execute(
    `SELECT current_user() AS principal, current_catalog() AS catalog, current_schema() AS schema`,
  );
  const manifest = await execute(
    `SELECT snapshot_id, run_date, store_count, sku_count, store_sku_count, forecast_method FROM ${qualified(cfg, "snapshot_manifest")} ORDER BY published_at DESC LIMIT 1`,
  );
  if (!manifest.length) throw new Error("DATABRICKS_NO_PUBLISHED_SNAPSHOT");
  const identity = rows[0];
  if (!identity) throw new Error("DATABRICKS_IDENTITY_MISSING");
  return {
    connected: true,
    connectionKey: databricksConnectionKey(),
    warehouseId: cfg.warehouseId,
    principal: identity.principal,
    catalog: identity.catalog,
    schema: identity.schema,
    snapshot: manifest[0],
    testedAt: new Date().toISOString(),
  };
}

export async function syncDatabricksSnapshot() {
  const cfg = config();
  const manifestRows = await execute(
    `SELECT snapshot_id, run_date, store_count, sku_count, store_sku_count, forecast_method FROM ${qualified(cfg, "snapshot_manifest")} ORDER BY published_at DESC LIMIT 1`,
  );
  const manifest = manifestRows[0];
  if (!manifest) throw new Error("DATABRICKS_NO_PUBLISHED_SNAPSHOT");
  const snapshotId = manifest.snapshot_id;
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(snapshotId) ||
    snapshotId !== manifest.run_date
  )
    throw new Error("INVALID_DATABRICKS_SNAPSHOT_ID");
  const root = sourceRunsRoot(sourceId);
  const finalPath = path.join(root, snapshotId, "input");
  const temporary = path.join(root, `.sync-${snapshotId}-${Date.now()}`);
  await fs.mkdir(temporary, { recursive: true });
  try {
    for (const [fileName, columns] of Object.entries(exports)) {
      const table = qualified(cfg, fileName);
      const rows = await execute(
        `SELECT ${columns.map((column) => `\`${column}\``).join(", ")} FROM ${table} WHERE snapshot_id = '${snapshotId}'`,
      );
      await writeCsv(path.join(temporary, `${fileName}.csv`), rows, columns);
    }
    const loaded = await loadCsvPackage(temporary);
    if (loaded.runDate !== snapshotId)
      throw new Error("DATABRICKS_SNAPSHOT_DATE_MISMATCH");
    await fs.mkdir(path.dirname(finalPath), { recursive: true });
    await fs.rm(finalPath, { recursive: true, force: true });
    await fs.rename(temporary, finalPath);
    await fs.writeFile(
      path.join(root, "active.json"),
      JSON.stringify({ date: snapshotId }, null, 2),
    );
    return {
      snapshotId,
      runDate: loaded.runDate,
      rows: loaded.rows.length,
      path: finalPath,
      manifest,
      syncedAt: new Date().toISOString(),
    };
  } catch (error) {
    await fs.rm(temporary, { recursive: true, force: true });
    throw error;
  }
}

export async function databricksSnapshotSummaries(): Promise<
  DataSnapshotSummary[]
> {
  const root = sourceRunsRoot(sourceId);
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    const snapshots: DataSnapshotSummary[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || !/^\d{4}-\d{2}-\d{2}$/.test(entry.name))
        continue;
      try {
        await fs.access(
          path.join(root, entry.name, "input", "simulation_state.csv"),
        );
        snapshots.push({
          id: entry.name,
          label: `Databricks planning origin · ${entry.name}`,
          description:
            "Validated local materialization of the Databricks serving snapshot.",
        });
      } catch {}
    }
    return snapshots.sort((a, b) => b.id.localeCompare(a.id));
  } catch {
    return [];
  }
}

export async function resolveDatabricksSnapshot(
  snapshotId: string,
): Promise<string> {
  const root = sourceRunsRoot(sourceId);
  if (snapshotId === "latest") {
    const active = JSON.parse(
      await fs.readFile(path.join(root, "active.json"), "utf8"),
    ) as { date?: string; approval_id?: string };
    if (!active.date || !/^\d{4}-\d{2}-\d{2}$/.test(active.date))
      throw new Error("SOURCE_NOT_SYNCHRONIZED");
    const candidate = path.join(
      root,
      active.date,
      ...(active.approval_id ? [active.approval_id] : []),
      "input",
    );
    await fs.access(path.join(candidate, "simulation_state.csv"));
    return candidate;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(snapshotId))
    throw new Error("INVALID_SOURCE_SNAPSHOT");
  const candidate = path.join(root, snapshotId, "input");
  await fs.access(path.join(candidate, "simulation_state.csv"));
  return candidate;
}
