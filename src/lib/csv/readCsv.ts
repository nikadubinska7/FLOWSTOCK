import { promises as fs } from "fs";
import type { CsvRecord } from "@/lib/domain/types";

function parseLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

export function parseCsv(content: string): CsvRecord[] {
  const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [];
  const headers = parseLine(lines[0]).map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const cells = parseLine(line);
    return headers.reduce<CsvRecord>((record, header, index) => {
      record[header] = cells[index] ?? "";
      return record;
    }, {});
  });
}

export async function readCsv(path: string): Promise<CsvRecord[]> {
  const content = await fs.readFile(path, "utf8");
  return parseCsv(content);
}
