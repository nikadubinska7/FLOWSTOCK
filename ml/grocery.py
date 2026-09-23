"""Deterministic grocery display overlay and coherent synthetic operations; stdlib only."""
import csv
import hashlib
import json
from pathlib import Path
from datetime import date, timedelta

ROOT = Path(__file__).resolve().parents[1]
SEED = 42
SCALE = 10
DEPARTMENTS = [
 ('Fresh Produce', ['Bananas','Tomatoes','Apples','Baby Spinach','Carrots','Pears','Mushrooms','Blueberries'], '500g', 'chilled', 7),
 ('Dairy and Eggs', ['Whole Milk','Greek Yogurt','Free-Range Eggs','Cottage Cheese','Butter','Cream','Kefir','Cheddar'], '500g', 'chilled', 14),
 ('Meat and Poultry', ['Chicken Breast','Turkey Mince','Beef Mince','Chicken Thighs','Pork Chops','Turkey Breast'], '500g', 'chilled', 5),
 ('Seafood', ['Salmon Fillet','Cod Fillet','Trout Fillet','Prawns','Haddock','Mussels'], '300g', 'chilled', 4),
 ('Bakery', ['Sourdough Bread','Rye Bread','Wholegrain Rolls','Baguette','Croissants','Seeded Loaf'], '400g', 'ambient', 4),
 ('Chilled and Ready Meals', ['Vegetable Soup','Lentil Soup','Hummus','Pasta Salad','Falafel','Vegetable Curry'], '400g', 'chilled', 7),
 ('Frozen Foods', ['Mixed Berries','Garden Peas','Broccoli Florets','Mango Pieces','Green Beans','Sweetcorn'], '500g', 'frozen', 180),
 ('Beverages', ['Orange Juice','Apple Juice','Sparkling Water','Still Water','Grape Juice','Tomato Juice'], '1L', 'ambient', 30),
 ('Pantry Essentials', ['Brown Rice','Oat Flakes','Red Lentils','Chickpeas','Penne Pasta','Couscous'], '500g', 'ambient', 180),
]

def stable(value):
 return int(hashlib.sha256(f'{SEED}:{value}'.encode()).hexdigest()[:12], 16)

def catalogue(products):
 result=[]
 for source in sorted(products, key=lambda r:str(r['product_id'])):
  pid=str(source['product_id']); k=stable(pid)
  # Source hierarchy retained, never interpreted as verified grocery categories.
  dep, names, size, temp, life=DEPARTMENTS[stable(source.get('first_category_id',pid)) % len(DEPARTMENTS)]
  base=names[k%len(names)]
  if base=='Whole Milk': size='1L'
  if base=='Free-Range Eggs': size='12 Pack'
  cost=round(0.8+(k%550)/100,2); price=round(cost*1.5,2)
  result.append(dict(sku_id=pid, source_product_id=pid, **{f'source_{f}':str(source.get(f,'')) for f in ['management_group_id','first_category_id','second_category_id','third_category_id']},
   display_product_name=f'{base} {size} · {pid}', display_department=dep, display_category=dep,
   display_subcategory=base, display_pack_description=size, display_unit_of_measure='pack' if size=='12 Pack' else ('litre' if size.endswith('L') else 'gram'),
   category=dep, subcategory=base, storage_temperature=temp, shelf_life_days=life, waste_risk='High' if life<=7 else 'Low',
   lifecycle_status='Active', unit_cost=cost, selling_price=price, gross_margin_pct=round((price-cost)/price,6),
   pack_multiple=6 if temp!='frozen' else 4, min_presentation_qty=0, replenishable_flag=1,
   display_metadata_origin='synthetic_grocery_overlay', commercial_origin='synthetic', operational_origin='synthetic'))
 return result

def write_csv(folder,name,rows,headers=None):
 folder.mkdir(parents=True,exist_ok=True)
 headers=headers or list(rows[0]) if rows else headers or ['id','data_origin']
 with (folder/name).open('w',newline='') as f:
  w=csv.DictWriter(f,fieldnames=headers); w.writeheader(); w.writerows(rows)

def package(folder,series,products,run_date,origin='synthetic_fixture',history=None):
 """series fields: store_id, product_id, daily, source_city_id, forecast metadata."""
 cat=catalogue(products); lookup={r['sku_id']:r for r in cat}
 stores=sorted({str(r['store_id']) for r in series})
 city={str(r['store_id']):str(r.get('city_id','')) for r in series}
 store_rows=[dict(store_id=s,source_store_id=s,source_city_id=city[s],store_name=f'Store {s}',route_id=f'R{stable(s)%8+1:02}',delivery_day=['Monday','Tuesday','Wednesday','Thursday','Friday'][stable(s)%5],receiving_capacity_units_per_delivery=600,active_flag=1,data_origin='synthetic_operations',identifier_origin=origin) for s in stores]
 inventory=[]; forecasts=[]; assort=[]; totals={p['sku_id']:0 for p in cat}
 for x in sorted(series,key=lambda r:(str(r['store_id']),str(r['product_id']))):
  s=str(x['store_id']); p=str(x['product_id']); k=stable(s+'|'+p); daily=max(0,float(x['daily'])); qty=int(daily*(k%8)); cap=max(24,int(daily*24)); totals[p]+=int(daily*14*.65)
  inventory.append(dict(run_date=run_date,store_id=s,sku_id=p,stock_on_hand=qty,in_transit_qty=0,data_origin='synthetic',snapshot_timestamp=run_date))
  assort.append(dict(store_id=s,sku_id=p,ranged_flag=1,target_cover_days=14,min_cover_days=7,max_cover_days=21,store_sku_capacity_units=cap,service_level_target=.9,store_sku_priority=1,data_origin='synthetic'))
  forecasts.append(dict(store_id=s,sku_id=p,forecast_daily_sales_base=daily,forecast_next_7_units=round(daily*7,4),forecast_next_14_units=round(daily*14,4),forecast_next_28_units=round(daily*28,4),forecast_confidence=.5,under_forecast_bias=0,seasonal_index=1,promo_uplift_pct=0,promo_flag_next_28d=0,normalized_forecast_14=round(daily*14/SCALE,6),quantity_origin='synthetic_operational_conversion',conversion_version='scale10-v1',conversion_factor=SCALE,source_origin=origin,**{k:v for k,v in x.items() if k.startswith('model_') or k in ['lower','upper','baseline','fallback','quality','signals','ranking_score']}))
 dc=[dict(sku_id=p,dc_total_stock=q,dc_reserved_stock=0,dc_blocked_stock=0,dc_safety_stock=0,dc_free_stock=q,data_origin='synthetic') for p,q in totals.items()]
 capacities=[]
 for s in stores:
  for dep, *_ in DEPARTMENTS:
   capacities.append(dict(store_id=s,category=dep,soft_capacity_units=2000,hard_capacity_units=2400,data_origin='synthetic'))
 files={'stores.csv':store_rows,'sku_master.csv':cat,'store_inventory.csv':inventory,'assortment.csv':assort,'forecast_next_28d.csv':forecasts,'dc_inventory.csv':dc,'capacity_rules.csv':capacities,'sales_history_28d.csv':history or [],'promo_calendar.csv':[],'open_orders.csv':[],'data_quality_issues.csv':[], 'approval_history.csv':[], 'manual_overrides.csv':[], 'simulation_state.csv':[dict(run_date=run_date,business_day_number=1,plan_id='',domain='grocery',source_origin=origin,notes='Commercial impact is simulated; real pilot evidence unavailable.')], 'optimization_parameters.csv':[dict(config_version='balanced-v1',margin_weight=.5,service_weight=.5,data_origin='administrative_configuration')]}
 for name,rows in files.items(): write_csv(folder,name,rows)
 manifest=[dict(file_name=n,rows=len(r),data_origin=origin if n=='sales_history_28d.csv' else 'mixed_explicit_field_provenance') for n,r in files.items()]
 write_csv(folder,'file_manifest.csv',manifest)
 schema={}
 for name,rows in files.items():
  schema[name]={}
  for field in rows[0] if rows else []:
   source_ids={f'source_{f}':f for f in ['city_id','store_id','product_id','management_group_id','first_category_id','second_category_id','third_category_id']}
   source=source_ids.get(field, {'store_id':'store_id','sku_id':'product_id'}.get(field))
   kind='real' if source and origin=='real_source' else 'synthetic'
   transform='Preserve encoded source identifier as a string' if source else 'Seed-42 deterministic grocery.py generator; descriptive semantics are synthetic'
   unit='category/identifier/text'
   if any(t in field for t in ['cost','price','value']):unit='synthetic EUR'
   elif any(t in field for t in ['qty','stock','units','capacity','pack_multiple']):unit='synthetic operational quantities'
   elif 'days' in field:unit='calendar days'
   elif any(t in field for t in ['pct','confidence','quality','weight','target','priority']):unit='dimensionless ratio'
   if 'forecast' in field or field in ['lower','upper','baseline','quality','signals','ranking_score']:
    kind='derived';source='sale_amount';transform='Past-only forecast/baseline or calibrated range; multiply source-scale forecasts by scale10-v1 for operational quantities'
    unit='normalized sales amount' if 'normalized' in field else ('dimensionless indicator' if field in ['quality','forecast_confidence'] else 'synthetic operational quantities / diagnostic metadata')
   if field in ['run_date','snapshot_timestamp']:
    kind='derived';source='dt';transform='Day after source history or configured independent-fixture date';unit='ISO calendar date'
   if 'origin' in field:
    kind='derived';source=None;transform='Explicit provenance tag assigned from ingestion/generation stage';unit='provenance label'
   if field.startswith('model_'):
    kind='derived';source=None;transform='Model artifact metadata or scored output; see model card';unit='normalized sales amount' if field=='model_normalized' else 'model metadata / operational forecast'
   null_policy='Required, non-null' if field in ['store_id','sku_id','source_product_id','display_product_name','stock_on_hand','dc_free_stock'] else 'Optional metadata may be empty; required numeric fields must be finite'
   schema[name][field]=dict(source_column=source,transformation=transform,type=type(rows[0][field]).__name__,null_policy=null_policy,data_origin=kind,validation='Unique entity keys and references; nonnegative numeric quantities; preserved source hierarchy; valid grocery display hierarchy',downstream_use='Forecasting, allocation, diagnostics, approval or simulation according to entity',unit=unit)
 (folder/'schema.json').write_text(json.dumps(schema,indent=2))
 (folder/'README.txt').write_text('Grocery POC. Display catalogue and operations are synthetic. Source IDs remain encoded; generated names are not decoded identities. Normalized sales are not literal physical units. Commercial effects are simulated.\n')
 return schema

def fixture():
 products=[dict(product_id=str(p),management_group_id=1,first_category_id=p%9,second_category_id=p%9*10,third_category_id=p%9*100) for p in range(1,37)]
 series=[dict(store_id=f'{s:03}',product_id=str(p),city_id=str(s%4),daily=1+stable(f'{s}|{p}')%50/10) for s in range(1,9) for p in range(1,37)]
 history=[]
 for x in series:
  for d in range(28):
   history.append(dict(date=str(date(2026,5,15)-timedelta(days=28-d)),store_id=x['store_id'],sku_id=x['product_id'],sales_units=max(0,int(x['daily']*(.7+(stable(f'{x}|{d}')%60)/100))),data_origin='synthetic_fixture'))
 schema=package(ROOT/'data/seed/grocery_demo',series,products,'2026-05-15',history=history)
 (ROOT/'docs/data_contract.json').write_text(json.dumps(schema,indent=2))

if __name__=='__main__': fixture()
