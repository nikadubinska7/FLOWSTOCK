import { promises as fs } from "fs";
import path from "path";
import type { CsvRecord } from "@/lib/domain/types";

function escapeCell(value: string | number | boolean | undefined): string {
  const text = value === undefined ? "" : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

export async function writeCsv(filePath: string, rows: CsvRecord[], headers?: string[]): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const resolvedHeaders = headers ?? Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const lines = [
    resolvedHeaders.join(","),
    ...rows.map((row) => resolvedHeaders.map((header) => escapeCell(row[header])).join(","))
  ];
  await fs.writeFile(filePath, `${lines.join("\n")}\n`, "utf8");
}
