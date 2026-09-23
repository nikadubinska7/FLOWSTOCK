import {it, expect} from 'vitest';
import {promises as fs} from 'fs';
import path from 'path';
import os from 'os';

it('restores the original sportswear package and preserves planning, shipping and next-day accounting', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'flowstock-sportswear-'));
  process.env.FLOWSTOCK_RUNS_DIR = root;
  try {
    const {seedPackagePath, sportswearPackagePath, latestPackagePath} = await import('../src/lib/utils/filePaths');
    const {loadCsvPackage} = await import('../src/lib/domain/joins');
    const {calculateKpis} = await import('../src/lib/domain/kpiCalculations');
    const {recommendPlan, summarizePlan} = await import('../src/lib/domain/plan');
    const {approveRows} = await import('../src/lib/domain/simulationEngine');
    const {readCsv} = await import('../src/lib/csv/readCsv');
    const source = await sportswearPackagePath();
    expect(await latestPackagePath()).toBe(source);
    const loaded = await loadCsvPackage(source);
    for (const file of ['sku_master.csv', 'store_inventory.csv', 'dc_inventory.csv', 'forecast_next_28d.csv', 'sales_history_28d.csv']) {
      expect((await fs.readFile(path.join(source, file))).equals(await fs.readFile(path.join(seedPackagePath, file)))).toBe(true);
    }
    expect(loaded.rows).toHaveLength(57114);
    expect(loaded.raw.stores).toHaveLength(70);
    expect(loaded.raw.sku_master).toHaveLength(1200);
    expect(loaded.rows[0].productName).toBe('STY0001-Grey-XS');
    expect(loaded.rows.every(r => r.dataOrigin === 'synthetic_sportswear_fixture')).toBe(true);
    const current = calculateKpis(loaded.rows, false);
    expect(current.inventoryValue).toBe(16786591);
    expect(current.dcFreeStock).toBe(433498);
    const plan = recommendPlan(loaded.rows);
    const {compareRecoveredSales, zeroRecommendationReasons} = await import('../src/lib/domain/recommendationReview');
    expect(plan.reduce((sum,row)=>sum+row.finalQty,0)).toBe(33412);
    expect([...plan].sort((a,b)=>compareRecoveredSales(a,b,'desc')).slice(0,350).every(row=>row.finalQty>0)).toBe(true);
    const highZero = plan.filter(row=>row.riskLevel==='High' && row.systemRecommendedQty===0);
    expect(highZero).toHaveLength(1730);
    expect(highZero.every(row=>zeroRecommendationReasons(row).every(reason=>reason.label!=='Review allocation limits'))).toBe(true);
    const summary = summarizePlan(plan);
    expect(summary.constraint_violations).toBe(0);
    expect(summary.stock.every(s => s.available === s.allocated + s.residual && s.residual >= 0)).toBe(true);
    const selected = plan.find(r => r.finalQty > 0)!;
    expect(selected).toBeTruthy();
    const result = await approveRows(loaded.runDate, 'sportswear-test', [selected], true, source);
    expect(await latestPackagePath()).toBe(result.nextPackagePath);
    const next = await loadCsvPackage(result.nextPackagePath);
    expect(next.runDate).toBe('2026-05-16');
    expect(next.rows).toHaveLength(57114);
    expect(next.rows.every(r => r.finalQty === 0)).toBe(true);
    const dcAfter = new Map(next.raw.dc_inventory.map(r => [r.sku_id, r]));
    const ordersAfter = await readCsv(path.join(result.nextPackagePath, 'open_orders.csv'));
    expect(ordersAfter.filter(r => r.dc_accounting === 'dispatched' && r.status === 'Delivered')).toHaveLength(4637);
    const newlyDelivered = ordersAfter.filter(r => r.dc_accounting === 'reserved_until_delivery' && r.status === 'Delivered').reduce((sum,r) => sum + Number(r.order_qty), 0);
    for (const before of loaded.raw.dc_inventory) {
      const after = dcAfter.get(before.sku_id)!;
      const approved = before.sku_id === selected.skuId ? selected.finalQty : 0;
      const delivered = before.sku_id === selected.skuId ? newlyDelivered : 0;
      expect(Number(after.dc_free_stock)).toBe(Number(before.dc_free_stock) - approved);
      expect(Number(after.dc_reserved_stock)).toBe(Number(before.dc_reserved_stock) + approved - delivered);
      expect(Number(after.dc_total_stock)).toBe(Number(before.dc_total_stock) - delivered);
    }
    const shippingDir = path.join(result.outputPath, 'shipping_docs');
    const shipping = await readCsv(path.join(shippingDir, (await fs.readdir(shippingDir))[0]));
    expect(shipping[0].display_product_name).toBe(selected.productName);
    expect(shipping[0].display_metadata_origin).toBe('synthetic_sportswear_fixture');
    expect(shipping[0].quantity_origin).toBe('synthetic_unit_counts');
    console.info('Sportswear verification', {current, simulation: calculateKpis(plan, true), shippingDocs: result.shippingDocsCreated});
  } finally {
    await fs.rm(root, {recursive:true, force:true});
    delete process.env.FLOWSTOCK_RUNS_DIR;
  }
}, 120000);
