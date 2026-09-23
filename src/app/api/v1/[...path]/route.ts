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
import { readState, safeId, audit } from "@/lib/server/storage";
import { loadCsvPackage } from "@/lib/domain/joins";
import { monitorOutcomes, type Outcome } from "@/lib/server/monitoring";
import { randomUUID } from "crypto";
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
    const admin =
      method === "POST" && ["models", "training", "ingest"].includes(p[0]);
    const actor = await authenticate(req, admin);
    const body = method === "POST" ? object(await req.json()) : {};
    let result: unknown;
    if (p[0] === "runs" && !p[1] && method === "POST") {
      fields(body, ["snapshot"]);
      const key = string(req.headers.get("idempotency-key"));
      const run = await startRun(
        string(body.snapshot ?? "latest"),
        actor.name,
        key,
      );
      // Start background work; GET also resumes queued jobs after interruption.
      void executeRun(run.id).catch(() => undefined);
      return NextResponse.json(
        { ...run, rows: undefined, correlation_id },
        { status: 202 },
      );
    } else if (p[0] === "runs" && !p[1] && method === "GET") {
      const history = await runHistory();
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
      fields(body, ["snapshot"]);
      const loaded = await loadCsvPackage(
        await snapshotPath(string(body.snapshot)),
      );
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
