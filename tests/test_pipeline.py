import sys
import unittest
from pathlib import Path
import tempfile
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'ml'))
from grocery import catalogue, package, DEPARTMENTS
from pipeline import features, splits, select, proxy, metrics, validate, FIELDS
import pandas as pd
import numpy as np

class PipelineTests(unittest.TestCase):
 def frame(self):
  rows=[]
  for s in [1,2,3]:
   for d in pd.date_range('2024-01-01',periods=90):
    rows.append(dict(city_id=1,store_id=s,management_group_id=1,first_category_id=1,second_category_id=2,third_category_id=3,product_id=1,dt=d,sale_amount=float(d.day),hours_sale=[1.]*24,stock_hour6_22_cnt=0,hours_stock_status=[0]*24,discount=1.,holiday_flag=0,activity_flag=0,precpt=0.,avg_temperature=5.,avg_humidity=50.,avg_wind_level=1.))
  return pd.DataFrame(rows)
 def test_source_schema_and_uniqueness(self):
  df=self.frame();self.assertEqual(len(validate(df)),270)
  with self.assertRaises(ValueError):validate(df.drop(columns='city_id'))
  with self.assertRaises(ValueError):validate(pd.concat([df,df.iloc[:1]]))
 def test_no_future_feature_leakage(self):
  df=self.frame();a=features(df);df.loc[df.dt>=pd.Timestamp('2024-03-01'),'sale_amount']=9999;b=features(df)
  fields=['lag1','lag7','mean7','mean14','std14','nonzero14']
  pd.testing.assert_frame_equal(a[a.dt<=pd.Timestamp('2024-03-01')][fields],b[b.dt<=pd.Timestamp('2024-03-01')][fields])
 def test_split_and_selection(self):
  df=self.frame();d=splits(df);self.assertEqual(d['train_end'],'2024-02-29');self.assertEqual(d['test_start'],'2024-03-16')
  a,ids=select(df,2,d['train_end']);df.loc[df.dt>pd.Timestamp(d['train_end']),'sale_amount']=0
  _,after=select(df.sample(frac=1,random_state=4),2,d['train_end']);self.assertEqual(ids,after)
 def test_display_mapping_stability(self):
  products=[dict(product_id=str(i),first_category_id=i%9) for i in range(70)]
  a=catalogue(products);self.assertEqual(a,catalogue(list(reversed(products))))
  self.assertEqual(len({p['source_product_id'] for p in a}),70);self.assertEqual(len({p['display_product_name'] for p in a}),70)
  self.assertTrue(all(p['category'] in {d[0] for d in DEPARTMENTS} for p in a));self.assertTrue(all(p['display_metadata_origin']=='synthetic_grocery_overlay' for p in a))
 def test_proxy_and_zero_denominator(self):
  np.testing.assert_equal(proxy([2,0],[10,10],[6,6],[2,2]),[12,0]);self.assertIsNone(metrics([0],[0])['wape'])
 def test_operational_contract(self):
  with tempfile.TemporaryDirectory() as tmp:
   schema=package(Path(tmp),[dict(store_id='01',product_id='1',daily=2)],[dict(product_id='1',first_category_id=1)],'2024-04-01')
   f=pd.read_csv(Path(tmp)/'forecast_next_28d.csv');self.assertEqual(f.normalized_forecast_14.iloc[0]*10,f.forecast_next_14_units.iloc[0]);self.assertIn('quantity_origin',schema['forecast_next_28d.csv'])

if __name__=='__main__':unittest.main()
