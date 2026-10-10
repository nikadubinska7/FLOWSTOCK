import { spawn, spawnSync } from "node:child_process";
import { access, mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

async function bootstrapDatabricksV3() {
  if (process.env.NEXT_PUBLIC_FLOWSTOCK_V3_ONLY !== "1") return;
  const root =
    process.env.FLOWSTOCK_DATABRICKS_RUNS_DIR ||
    path.join(process.cwd(), "data", "local", "databricks_sportswear_runs");
  const finalDirectory = path.join(root, "2026-06-30");
  const requiredFiles = [
    "stores.csv",
    "sku_master.csv",
    "dc_inventory.csv",
    "assortment.csv",
    "store_inventory.csv",
    "sales_history_28d.csv",
    "forecast_next_28d.csv",
    "promo_calendar.csv",
    "open_orders.csv",
    "capacity_rules.csv",
    "optimization_parameters.csv",
    "data_quality_issues.csv",
    "approval_history.csv",
    "manual_overrides.csv",
    "simulation_state.csv",
    "file_manifest.csv",
  ];
  try {
    await Promise.all(
      requiredFiles.map((file) =>
        access(path.join(finalDirectory, "input", file)),
      ),
    );
    return;
  } catch {}

  const temporary = path.join(root, `.bootstrap-${process.pid}`);
  const input = path.join(temporary, "input");
  const archive = path.join(
    process.cwd(),
    "data",
    "seed",
    "flowstock_v3_bootstrap.tar.gz",
  );
  await rm(temporary, { recursive: true, force: true });
  await mkdir(input, { recursive: true });
  const extracted = spawnSync("tar", ["-xzf", archive, "-C", input], {
    stdio: "inherit",
  });
  if (extracted.status !== 0) {
    throw new Error("Could not extract the Flowstock V3 bootstrap snapshot");
  }
  await rm(finalDirectory, { recursive: true, force: true });
  await rename(temporary, finalDirectory);
  await mkdir(root, { recursive: true });
  await writeFile(
    path.join(root, "active.json"),
    JSON.stringify({ date: "2026-06-30" }, null, 2),
  );
  console.log("Flowstock V3 bootstrap snapshot prepared on persistent storage");
}

await bootstrapDatabricksV3();

process.env.FLOWSTOCK_SHARE_HOST = "0.0.0.0";
process.env.FLOWSTOCK_SHARE_PORT = process.env.PORT || "10000";
process.env.FLOWSTOCK_UPSTREAM_HOST = "127.0.0.1";
process.env.FLOWSTOCK_UPSTREAM_PORT =
  process.env.FLOWSTOCK_INTERNAL_PORT || "3000";

const next = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    process.env.FLOWSTOCK_UPSTREAM_PORT,
  ],
  { stdio: "inherit", env: process.env },
);

let stopping = false;

function stop(signal) {
  if (stopping) return;
  stopping = true;
  next.kill(signal);
  setTimeout(() => process.exit(0), 10_000).unref();
}

process.on("SIGTERM", () => stop("SIGTERM"));
process.on("SIGINT", () => stop("SIGINT"));

next.on("exit", (code, signal) => {
  if (!stopping) {
    console.error(`Flowstock Next.js process exited (${signal || code || 0})`);
    process.exit(code || 1);
  }
});

await import("./share-proxy.mjs");
