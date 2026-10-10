import { NextRequest, NextResponse } from "next/server";
import { authenticate } from "@/lib/server/auth";
import {
  getRun,
  startRun,
  executeRun,
  overrideRun,
  decideRun,
  snapshotPath,
  runHistory,
} from "@/lib/server/runs";
import {
  modelHealth,
  inspect,
  modelAction,
  pipelineJob,
} from "@/lib/server/models";
import { readState, safeId, audit, writeState } from "@/lib/server/storage";
import { loadCsvPackage } from "@/lib/domain/joins";
import { monitorOutcomes, type Outcome } from "@/lib/server/monitoring";
import { randomUUID } from "crypto";
import {
  inferDataSource,
  isDataSourceId,
  listDataSources,
} from "@/lib/server/dataSources";
import { testBusinessCentralConnection } from "@/lib/server/businessCentral";
import {
  syncDatabricksSnapshot,
  testDatabricksConnection,
} from "@/lib/server/databricks";
import { orchestrateDatabricksPlanning } from "@/lib/server/orchestration";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
function object(x: unknown): Record<string, unknown> {
  if (!x || typeof x !== "object" || Array.isArray(x))
    throw new Error("INVALID_PAYLOAD");
  return x as Record<string, unknown>;
}
function string(x: unknown) {
  if (typeof x !== "string" || !x.trim() || x.length > 2000)
    throw new Error("INVALID_STRING");
  return x;
}
function fields(b: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(b).some((k) => !allowed.includes(k)))
    throw new Error("UNKNOWN_FIELD");
}
export async function GET(req: NextRequest) {
  return handle(req);
}
export async function POST(req: NextRequest) {
  return handle(req);
}
async function handle(req: NextRequest) {
  const correlation_id = randomUUID();
  try {
    const p = req.nextUrl.pathname.split("/").slice(3);
    const method = req.method;
    if (method === "GET" && p[0] === "health")
      return NextResponse.json({
        status: "ready",
        version: "planning-v1",
        correlation_id,
      });
    const v3OnlySynchronization =
      process.env.NEXT_PUBLIC_FLOWSTOCK_V3_ONLY === "1" &&
      p[0] === "data-sources" &&
      p[1] === "databricks-sportswear" &&
      p[2] === "sync";
    const admin =
      method === "POST" &&
      !v3OnlySynchronization &&
      (["models", "training", "ingest"].includes(p[0]) ||
        (p[0] === "data-sources" && p[2] === "sync") ||
        p[0] === "orchestration");
    const actor = await authenticate(req, admin);
    const body = method === "POST" ? object(await req.json()) : {};
    let result: unknown;
    if (p[0] === "data-sources" && !p[1] && method === "GET") {
      result = { sources: await listDataSources() };
    } else if (
      p[0] === "data-sources" &&
      p[1] === "business-central" &&
      p[2] === "test" &&
      method === "POST"
    ) {
      fields(body, []);
      const connection = await testBusinessCentralConnection();
      await writeState(
        "data-sources/business-central/connection.json",
        connection,
      );
      await audit("business_central_connection_tested", actor.name, {
        environment: connection.environment,
        company: connection.company,
        endpoints: connection.endpoints.map((endpoint) => ({
          endpoint: endpoint.endpoint,
          available: endpoint.available,
          status: endpoint.status,
          recordCount: endpoint.recordCount,
        })),
        odataItemLedger: {
          available: connection.odataItemLedger.available,
          status: connection.odataItemLedger.status,
          recordCount: connection.odataItemLedger.recordCount,
        },
        itemLedgerDateRange: connection.itemLedgerDateRange,
        recent90DayLedger: connection.recent90DayLedger,
      });
      result = {
        connected: connection.connected,
        environment: connection.environment,
        company: connection.company,
        availableCompanies: connection.availableCompanies,
        endpoints: connection.endpoints,
        odataItemLedger: connection.odataItemLedger,
        itemLedgerDateRange: connection.itemLedgerDateRange,
        recent90DayLedger: connection.recent90DayLedger,
        testedAt: connection.testedAt,
      };
    } else if (
      p[0] === "data-sources" &&
      p[1] === "databricks-sportswear" &&
      p[2] === "test" &&
      method === "POST"
    ) {
      fields(body, []);
      const connection = await testDatabricksConnection();
      await writeState(
        "data-sources/databricks-sportswear/connection.json",
        connection,
      );
      await audit("databricks_connection_tested", actor.name, {
        warehouseId: connection.warehouseId,
        principal: connection.principal,
        catalog: connection.catalog,
        schema: connection.schema,
        snapshot: connection.snapshot,
        testedAt: connection.testedAt,
      });
      result = connection;
    } else if (
      p[0] === "data-sources" &&
      p[1] === "databricks-sportswear" &&
      p[2] === "sync" &&
      method === "POST"
    ) {
      fields(body, []);
      const synchronization = await syncDatabricksSnapshot();
      await writeState(
        "data-sources/databricks-sportswear/synchronization.json",
        synchronization,
      );
      await audit("databricks_snapshot_synchronized", actor.name, {
        snapshotId: synchronization.snapshotId,
        runDate: synchronization.runDate,
        rows: synchronization.rows,
        manifest: synchronization.manifest,
        syncedAt: synchronization.syncedAt,
      });
      result = synchronization;
    } else if (
      p[0] === "orchestration" &&
      p[1] === "nightly" &&
      method === "POST"
    ) {
      fields(body, []);
      result = await orchestrateDatabricksPlanning(actor.name);
    } else if (p[0] === "runs" && !p[1] && method === "POST") {
      fields(body, ["source", "snapshot"]);
      const key = string(req.headers.get("idempotency-key"));
      const snapshot = string(body.snapshot ?? "latest");
      const source = body.source
        ? string(body.source)
        : inferDataSource(snapshot);
      if (!isDataSourceId(source)) throw new Error("INVALID_DATA_SOURCE");
      const run = await startRun(snapshot, actor.name, key, source);
      // Start background work; GET also resumes queued jobs after interruption.
      void executeRun(run.id).catch(() => undefined);
      return NextResponse.json(
        { ...run, rows: undefined, correlation_id },
        { status: 202 },
      );
    } else if (p[0] === "runs" && !p[1] && method === "GET") {
      const requestedSource = req.nextUrl.searchParams.get("source");
      if (requestedSource && !isDataSourceId(requestedSource))
        throw new Error("INVALID_DATA_SOURCE");
      const history = await runHistory(
        requestedSource && isDataSourceId(requestedSource)
          ? requestedSource
          : undefined,
      );
      result = { runs: history.slice(0, 100), total: history.length };
    } else if (p[0] === "runs" && p[1]) {
      const id = safeId(p[1]);
      if (method === "GET") {
        let run = await getRun(id);
        if (run.status === "queued") run = await executeRun(id);
        if (p[2] === "shipping") {
          if (run.approval_state !== "approved")
            throw new Error("APPROVAL_REQUIRED");
          const { promises: fs } = await import("fs");
          const path = await import("path");
          const dir = path.join(run.result!.outputPath, "shipping_docs");
          const files = (await fs.readdir(dir)).filter((n) =>
            n.startsWith(run.result!.approvalId),
          );
          if (!files.length) throw new Error("SHIPPING_NOT_CREATED");
          const csvs = await Promise.all(
            files.map((n) => fs.readFile(path.join(dir, n), "utf8")),
          );
          return new NextResponse(
            csvs
              .map((s, i) => (i ? s.split("\n").slice(1).join("\n") : s))
              .join(""),
            {
              headers: {
                "Content-Type": "text/csv",
                "Content-Disposition": `attachment; filename="shipping-${id}.csv"`,
              },
            },
          );
        }
        const offset = Number(req.nextUrl.searchParams.get("offset") ?? 0),
          limit = Number(req.nextUrl.searchParams.get("limit") ?? 100);
        if (
          !Number.isInteger(offset) ||
          offset < 0 ||
          !Number.isInteger(limit) ||
          limit < 1 ||
          limit > 1000
        )
          throw new Error("INVALID_PAGINATION");
        result = {
          ...run,
          rows: run.rows.slice(offset, offset + limit),
          total: run.rows.length,
          offset,
          limit,
        };
      } else if (p[2] === "override") {
        fields(body, ["edits", "revision"]);
        if (!Array.isArray(body.edits) || !Number.isInteger(body.revision))
          throw new Error("INVALID_EDITS");
        const edits = body.edits.map((x) => {
          const e = object(x);
          fields(e, ["id", "finalQty", "comment"]);
          if (typeof e.finalQty !== "number")
            throw new Error("INVALID_QUANTITY");
          return {
            id: string(e.id),
            finalQty: e.finalQty,
            comment: string(e.comment),
          };
        });
        result = await overrideRun(
          id,
          edits,
          actor.name,
          body.revision as number,
        );
      } else if (p[2] === "decision") {
        fields(body, ["action", "row_ids", "create_shipping", "reason"]);
        if (
          !["approve", "reject"].includes(String(body.action)) ||
          !Array.isArray(body.row_ids) ||
          typeof body.create_shipping !== "boolean"
        )
          throw new Error("INVALID_DECISION");
        result = await decideRun(
          id,
          body.action as "approve" | "reject",
          body.row_ids.map(string),
          body.create_shipping,
          actor.name,
          string(body.reason),
        );
      } else throw new Error("NOT_FOUND");
    } else if (p[0] === "models" && method === "GET")
      result = p[1] ? await inspect(safeId(p[1])) : await modelHealth();
    else if (p[0] === "models" && p[1] && method === "POST") {
      fields(body, ["action", "reason"]);
      result = await modelAction(
        safeId(p[1]),
        string(body.action),
        actor.name,
        string(body.reason),
      );
    } else if (["training", "ingest"].includes(p[0]) && method === "POST") {
      fields(body, ["source"]);
      result = await pipelineJob(
        p[0] === "training" ? "train" : "ingest",
        string(body.source),
        actor.name,
        string(req.headers.get("idempotency-key")),
      );
    } else if (p[0] === "jobs" && p[1] && method === "GET")
      result = await readState(`jobs/${safeId(p[1])}.json`);
    else if (p[0] === "validate" && method === "POST") {
      fields(body, ["source", "snapshot"]);
      const snapshot = string(body.snapshot);
      const source = body.source
        ? string(body.source)
        : inferDataSource(snapshot);
      if (!isDataSourceId(source)) throw new Error("INVALID_DATA_SOURCE");
      const loaded = await loadCsvPackage(await snapshotPath(snapshot, source));
      result = {
        rows: loaded.rows.length,
        date: loaded.runDate,
        issues: loaded.dataIssues,
      };
    } else if (p[0] === "monitor" && method === "POST") {
      fields(body, ["outcome_batch"]);
      const outcomes = body.outcome_batch
        ? await readState<Outcome[]>(
            `outcomes/${safeId(string(body.outcome_batch))}.json`,
          )
        : [];
      result = {
        ...(await modelHealth()),
        metrics: monitorOutcomes(outcomes),
        segments: {
          stores: Object.fromEntries(
            [...new Set(outcomes.map((r) => r.store_id))].map((k) => [
              k,
              monitorOutcomes(outcomes.filter((r) => r.store_id === k)),
            ]),
          ),
          categories: Object.fromEntries(
            [...new Set(outcomes.map((r) => r.category))].map((k) => [
              k,
              monitorOutcomes(outcomes.filter((r) => r.category === k)),
            ]),
          ),
        },
      };
      await audit("monitoring", actor.name, result);
    } else throw new Error("NOT_FOUND");
    return NextResponse.json({ ...(result as object), correlation_id });
  } catch (e) {
    const code =
      (e as NodeJS.ErrnoException).code === "ENOENT"
        ? "NOT_FOUND"
        : e instanceof Error
          ? e.message
          : "INTERNAL_ERROR";
    const status = code.includes("AUTH_REQUIRED")
      ? 401
      : code === "FORBIDDEN_ORIGIN"
        ? 403
        : code === "NOT_FOUND"
          ? 404
          : code.includes("CONFLICT") ||
              code.includes("ALREADY") ||
              code === "BUSY_RETRY"
            ? 409
            : 400;
    return NextResponse.json(
      { error: { code, message: code }, correlation_id },
      { status },
    );
  }
}
