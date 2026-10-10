import { spawn } from "node:child_process";

process.env.FLOWSTOCK_SHARE_HOST = "0.0.0.0";
process.env.FLOWSTOCK_SHARE_PORT = process.env.PORT || "10000";
process.env.FLOWSTOCK_UPSTREAM_HOST = "127.0.0.1";
process.env.FLOWSTOCK_UPSTREAM_PORT = "3000";

const next = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3000",
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
