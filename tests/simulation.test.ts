import {it,expect} from 'vitest';
import {promises as fs} from 'fs';
import path from 'path';
import os from 'os';
it('delivers an open order once, reconciles DC stock and simulates every row',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'flowstock-simulation-'));process.env.FLOWSTOCK_RUNS_DIR=path.join(root,'runs');
 try{
  const source=path.join(root,'source');await fs.cp('data/seed/grocery_demo',source,{recursive:true});
  const {readCsv}=await import('../src/lib/csv/readCsv');const {writeCsv}=await import('../src/lib/csv/writeCsv');const {approveRows}=await import('../src/lib/domain/simulationEngine');
  const inventory=await readCsv(path.join(source,'store_inventory.csv'));const row=inventory[0];row.in_transit_qty='6';await writeCsv(path.join(source,'store_inventory.csv'),inventory);
  const dc=await readCsv(path.join(source,'dc_inventory.csv'));const stock=dc.find(r=>r.sku_id===row.sku_id)!;const total=Number(stock.dc_total_stock);stock.dc_reserved_stock='6';stock.dc_free_stock=String(Number(stock.dc_free_stock)-6);await writeCsv(path.join(source,'dc_inventory.csv'),dc);
  await writeCsv(path.join(source,'open_orders.csv'),[{order_id:'arrival-test',store_id:row.store_id,sku_id:row.sku_id,order_qty:'6',ship_date:'2026-05-14',expected_arrival_date:'2026-05-16',status:'In transit'}]);
  const result=await approveRows('2026-05-15','test-empty-day',[],false,source);
  const nextDc=(await readCsv(path.join(result.nextPackagePath,'dc_inventory.csv'))).find(r=>r.sku_id===row.sku_id)!;
  expect(Number(nextDc.dc_total_stock)).toBe(total-6);expect(Number(nextDc.dc_reserved_stock)).toBe(0);expect(Number(nextDc.dc_free_stock)).toBe(total-6);
  const orders=await readCsv(path.join(result.nextPackagePath,'open_orders.csv'));expect(orders[0].status).toBe('Delivered');
  const nextInventory=await readCsv(path.join(result.nextPackagePath,'store_inventory.csv'));expect(nextInventory[0].in_transit_qty).toBe('0');
  const history=await readCsv(path.join(result.nextPackagePath,'sales_history_28d.csv'));expect(new Set(history.map(r=>r.date)).size).toBe(28);expect(history.filter(r=>r.date==='2026-05-15')).toHaveLength(inventory.length);
  const next=await approveRows('2026-05-16','test-next-empty-day',[],false,result.nextPackagePath);
  const finalDc=(await readCsv(path.join(next.nextPackagePath,'dc_inventory.csv'))).find(r=>r.sku_id===row.sku_id)!;expect(Number(finalDc.dc_total_stock)).toBe(total-6);
 }finally{await fs.rm(root,{recursive:true,force:true});delete process.env.FLOWSTOCK_RUNS_DIR;}
});
