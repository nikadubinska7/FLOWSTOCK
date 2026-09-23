import { randomBytes, timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";
import { readState, stateRoot } from "./storage";
import { promises as fs } from "fs";
import path from "path";
export type Identity = { name: string; role: "planner" | "admin" };
export async function keys() {
  const old = await readState<{ admin: string; planner: string } | null>(
    "access.json",
    null,
  );
  if (old) return old;
  const generated = {
    admin: randomBytes(32).toString("hex"),
    planner: randomBytes(32).toString("hex"),
  };
  await fs.mkdir(stateRoot, { recursive: true });
  const temp = path.join(
    stateRoot,
    `access-${randomBytes(12).toString("hex")}.tmp`,
  );
  await fs.writeFile(temp, JSON.stringify(generated), { mode: 0o600 });
  try {
    await fs.link(temp, path.join(stateRoot, "access.json"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  } finally {
    await fs.unlink(temp);
  }
  return readState<{ admin: string; planner: string }>("access.json");
}
function equal(a: string, b: string) {
  const left = Buffer.from(a),
    right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
export function localRequest(req: NextRequest) {
  return ["localhost", "127.0.0.1", "[::1]"].includes(
    new URL(`http://${req.headers.get("host") ?? "invalid"}`).hostname,
  );
}
export async function authenticate(
  req: NextRequest,
  admin = false,
): Promise<Identity> {
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== req.headers.get("host"))
    throw new Error("FORBIDDEN_ORIGIN");
  const access = await keys();
  const token =
    req.headers.get("authorization")?.replace(/^Bearer /, "") ??
    req.cookies.get("flowstock_session")?.value ??
    "";
  if (token && equal(token, process.env.FLOWSTOCK_ADMIN_TOKEN || access.admin))
    return { name: "local-admin", role: "admin" };
  if (
    !admin &&
    token &&
    equal(token, process.env.FLOWSTOCK_API_TOKEN || access.planner)
  )
    return { name: "local-planner", role: "planner" };
  throw new Error(admin ? "ADMIN_AUTH_REQUIRED" : "AUTH_REQUIRED");
}
