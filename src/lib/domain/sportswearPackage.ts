import { promises as fs } from "fs";
import path from "path";
import { createHash, randomUUID } from "crypto";
import { readCsv } from "../csv/readCsv";
import { writeCsv } from "../csv/writeCsv";

// A derived mock package, never an edit to the original sportswear CSVs.
export async function prepareSportswearPackage(
  source: string,
  outputRoot: string,
): Promise<string> {
  const version = "sportswear-capacity-v1";
  const names = (await fs.readdir(source))
    .filter((n) => n.endsWith(".csv"))
    .sort();
  const hash = createHash("sha256").update(version);
  for (const name of names)
    hash.update(name).update(await fs.readFile(path.join(source, name)));
  const sourceHash = hash.digest("hex");
  const target = path.join(
    outputRoot,
    "snapshots",
    `${version}-${sourceHash.slice(0, 16)}`,
  );
  try {
    await fs.access(path.join(target, "sportswear_capacity_adjustments.json"));
    return target;
  } catch {}
  const staging = `${target}-${randomUUID()}.tmp`;
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.cp(source, staging, { recursive: true });
  try {
    const inventory = await readCsv(path.join(source, "store_inventory.csv"));
    const products = new Map(
      (await readCsv(path.join(source, "sku_master.csv"))).map((r) => [
        r.sku_id,
        r,
      ]),
    );
    const stores = await readCsv(path.join(source, "stores.csv"));
    const receiving = new Map(
      stores.map((r) => [
        r.store_id,
        Number(r.receiving_capacity_units_per_delivery),
      ]),
    );
    const totals = new Map<string, number>();
    const rowStock = new Map<string, number>();
    for (const row of inventory) {
      const qty = Number(row.stock_on_hand) + Number(row.in_transit_qty);
      const key = `${row.store_id}|${products.get(row.sku_id)!.category}`;
      totals.set(key, (totals.get(key) ?? 0) + qty);
      rowStock.set(`${row.store_id}|${row.sku_id}`, qty);
    }
    const rules = await readCsv(path.join(source, "capacity_rules.csv"));
    const changes = rules.map((row) => {
      const existing = totals.get(`${row.store_id}|${row.category}`) ?? 0;
      const hard = Math.max(
        Number(row.hard_capacity_units),
        existing + receiving.get(row.store_id)!,
      );
      const soft = Math.min(
        hard,
        Math.max(Number(row.soft_capacity_units), existing),
      );
      const change = {
        store_id: row.store_id,
        category: row.category,
        existing_stock_and_transit: existing,
        original_hard: Number(row.hard_capacity_units),
        adjusted_hard: hard,
        original_soft: Number(row.soft_capacity_units),
        adjusted_soft: soft,
      };
      row.hard_capacity_units = String(hard);
      row.soft_capacity_units = String(soft);
      return change;
    });
    await writeCsv(path.join(staging, "capacity_rules.csv"), rules);
    const byCategory = new Map(
      rules.map((r) => [`${r.store_id}|${r.category}`, r.hard_capacity_units]),
    );
    await writeCsv(
      path.join(staging, "stores.csv"),
      stores.map((row) => ({
        ...row,
        category_capacity_apparel_units:
          byCategory.get(`${row.store_id}|Apparel`) ??
          row.category_capacity_apparel_units,
        category_capacity_shoes_units:
          byCategory.get(`${row.store_id}|Shoes`) ??
          row.category_capacity_shoes_units,
      })),
    );
    const assortment = await readCsv(path.join(source, "assortment.csv"));
    let adjustedSkuRows = 0;
    for (const row of assortment) {
      const existing = rowStock.get(`${row.store_id}|${row.sku_id}`) ?? 0;
      if (existing > Number(row.store_sku_capacity_units)) {
        row.store_sku_capacity_units = String(existing);
        adjustedSkuRows++;
      }
    }
    await writeCsv(path.join(staging, "assortment.csv"), assortment);
    await fs.writeFile(
      path.join(staging, "sportswear_capacity_adjustments.json"),
      JSON.stringify(
        {
          version,
          source,
          source_hash: sourceHash,
          origin: "synthetic_capacity_compatibility_adjustment",
          rule: "Category hard capacity accommodates existing stock plus one store delivery; soft capacity accommodates existing stock. SKU capacity is raised only to existing stock where necessary, providing no extra headroom to overstocked SKUs.",
          adjusted_sku_rows: adjustedSkuRows,
          categories: changes,
          unchanged:
            "All product identities, prices, inventory, DC balances, forecasts, sales, case packs, receiving limits and business logic are unchanged.",
        },
        null,
        2,
      ) + "\n",
    );
    try {
      await fs.rename(staging, target);
    } catch (error) {
      if (
        !["EEXIST", "ENOTEMPTY"].includes(
          (error as NodeJS.ErrnoException).code ?? "",
        )
      )
        throw error;
    }
    return target;
  } finally {
    await fs.rm(staging, { recursive: true, force: true });
  }
}
