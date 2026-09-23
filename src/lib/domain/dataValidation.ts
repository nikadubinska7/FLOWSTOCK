import type {CsvRecord} from './types';
export function validatePackage(raw:Record<string,CsvRecord[]>){
 const keySets=new Map<string,Set<string>>();
 const keys:Record<string,string[]>={stores:['store_id'],sku_master:['sku_id'],dc_inventory:['sku_id'],assortment:['store_id','sku_id'],store_inventory:['store_id','sku_id'],forecast_next_28d:['store_id','sku_id'],capacity_rules:['store_id','category']};
 for(const [file,columns] of Object.entries(keys)){
  if(!raw[file]?.length)throw new Error(`EMPTY_REQUIRED_FILE:${file}`);
  const ids=new Set<string>();
  for(const row of raw[file]){
   if(columns.some(c=>!row[c]))throw new Error(`MISSING_KEY:${file}`);
   const k=columns.map(c=>row[c]).join('|');if(ids.has(k))throw new Error(`DUPLICATE_KEY:${file}:${k}`);ids.add(k);
  }
  keySets.set(file,ids);
 }
 const numeric:Record<string,string[]>={sku_master:['unit_cost','selling_price','pack_multiple'],dc_inventory:['dc_total_stock','dc_free_stock','dc_reserved_stock'],store_inventory:['stock_on_hand','in_transit_qty'],forecast_next_28d:['forecast_next_7_units','forecast_next_14_units','forecast_daily_sales_base'],assortment:['store_sku_capacity_units'],capacity_rules:['hard_capacity_units','soft_capacity_units']};
 for(const [file,fields] of Object.entries(numeric))for(const r of raw[file])for(const f of fields){if(r[f]===undefined||r[f]===''||!Number.isFinite(Number(r[f]))||Number(r[f])<0)throw new Error(`INVALID_NUMBER:${file}:${f}`);}
 for(const [file,rows] of Object.entries(raw))for(const r of rows){
  if(r.store_id&&!keySets.get('stores')!.has(r.store_id))throw new Error(`UNKNOWN_STORE:${file}`);
  if(r.sku_id&&!keySets.get('sku_master')!.has(r.sku_id))throw new Error(`UNKNOWN_PRODUCT:${file}`);
 }
 for(const r of raw.store_inventory){const k=`${r.store_id}|${r.sku_id}`;if(!keySets.get('assortment')!.has(k)||!keySets.get('forecast_next_28d')!.has(k))throw new Error('MISSING_ASSORTMENT_OR_FORECAST');}
 for(const r of raw.sku_master)if(!Number.isSafeInteger(Number(r.pack_multiple))||Number(r.pack_multiple)<1||Number(r.selling_price)<Number(r.unit_cost))throw new Error('INVALID_PRODUCT_OPERATIONS');
 for(const r of raw.dc_inventory)if(Number(r.dc_free_stock)+Number(r.dc_reserved_stock)>Number(r.dc_total_stock))throw new Error('INVALID_DC_BALANCE');
}
