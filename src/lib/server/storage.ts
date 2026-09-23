import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
export const stateRoot =
  process.env.FLOWSTOCK_STATE_DIR || path.join(process.cwd(), ".flowstock");
export function safeId(value: string) {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(value)) throw new Error("INVALID_ID");
  return value;
}
export async function readState<T>(name: string, fallback?: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(path.join(stateRoot, name), "utf8"));
  } catch (e) {
    if (
      (e as NodeJS.ErrnoException).code === "ENOENT" &&
      fallback !== undefined
    )
      return fallback;
    throw e;
  }
}
export async function writeState(name: string, value: unknown) {
  const target = path.join(stateRoot, name);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = target + "." + randomUUID() + ".tmp";
  await fs.writeFile(temp, JSON.stringify(value, null, 2), { mode: 0o600 });
  await fs.rename(temp, target);
}
export async function audit(action: string, actor: string, details: unknown) {
  await fs.mkdir(stateRoot, { recursive: true });
  await fs.appendFile(
    path.join(stateRoot, "audit.jsonl"),
    JSON.stringify({
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      action,
      actor,
      details,
    }) + "\n",
    { mode: 0o600 },
  );
}
export async function locked<T>(fn: () => Promise<T>): Promise<T> {
  await fs.mkdir(stateRoot, { recursive: true });
  let file;
  try {
    file = await fs.open(path.join(stateRoot, "write.lock"), "wx");
  } catch {
    throw new Error("BUSY_RETRY");
  }
  try {
    return await fn();
  } finally {
    await file.close();
    await fs.unlink(path.join(stateRoot, "write.lock"));
  }
}

export const modelRoot =
  process.env.FLOWSTOCK_MODEL_DIR || path.join(process.cwd(), "models/local");
