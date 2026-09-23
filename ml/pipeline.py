"""Reproducible FreshRetailNet ingestion, chronological forecasting and proxy challenger.
No credentials are printed. Artifacts are local; promotion is exclusively a web-admin action.
"""
import argparse
import hashlib
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from grocery import ROOT, SCALE, SEED, stable, package, catalogue

LOCAL=ROOT/'data/local'
MODEL=ROOT/'models/local'
REPO='Dingdong-Inc/FreshRetailNet-50K'
FIELDS=['city_id','store_id','management_group_id','first_category_id','second_category_id','third_category_id','product_id','dt','sale_amount','hours_sale','stock_hour6_22_cnt','hours_stock_status','discount','holiday_flag','activity_flag','precpt','avg_temperature','avg_humidity','avg_wind_level']
FEATURES=['lag1','lag7','mean7','mean14','std14','nonzero14','stockout7','weekday']

def deps():
 try:
  import pandas as pd
  import numpy as np
  import pyarrow
  import sklearn
  return pd,np
 except ImportError as e: raise RuntimeError('Install local dependencies: .venv/bin/pip install -r ml/requirements.txt') from e

def dump(path,value):
 path.parent.mkdir(parents=True,exist_ok=True); path.write_text(json.dumps(value,indent=2,allow_nan=False,default=str))

def splits(df):
 pd,_=deps(); dates=sorted(df.dt.unique()); n=len(dates)
 if n<42: raise ValueError('At least 42 distinct calendar days required for chronological evaluation')
 v=max(14,n//6); t=max(14,n//6); train_end=dates[n-v-t-1]; val_end=dates[n-t-1]
 return dict(start=str(dates[0])[:10],train_end=str(train_end)[:10],validation_start=str(dates[n-v-t])[:10],validation_end=str(val_end)[:10],test_start=str(dates[n-t])[:10],test_end=str(dates[-1])[:10])

def validate(df):
 pd,np=deps()
 if set(df.columns)!=set(FIELDS): raise ValueError(f'Source schema mismatch; missing={sorted(set(FIELDS)-set(df.columns))}, unexpected={sorted(set(df.columns)-set(FIELDS))}')
 df=df.copy(); df['dt']=pd.to_datetime(df.dt,errors='raise')
 if df.empty or df.isna().any().any(): raise ValueError('Empty source or null values; investigate before importing')
 if df.duplicated(['store_id','product_id','dt']).any(): raise ValueError('Duplicate store-product-date source keys')
 for f in ['city_id','store_id','product_id','management_group_id','first_category_id','second_category_id','third_category_id','sale_amount','stock_hour6_22_cnt','discount','precpt','avg_humidity','avg_wind_level']:
  if not pd.api.types.is_numeric_dtype(df[f]) or not np.isfinite(df[f]).all() or (df[f]<0).any(): raise ValueError(f'Invalid numeric source column {f}')
 for f in ['holiday_flag','activity_flag']:
  if not df[f].isin([0,1]).all(): raise ValueError(f'Invalid binary indicator {f}')
 if not pd.api.types.is_numeric_dtype(df.avg_temperature) or not np.isfinite(df.avg_temperature).all(): raise ValueError('Invalid temperature')
 for f in ['city_id','store_id','product_id','management_group_id','first_category_id','second_category_id','third_category_id','stock_hour6_22_cnt']:
  if not (df[f]%1==0).all(): raise ValueError(f'Noninteger encoded identifier/count {f}')
 if (df.groupby('store_id').city_id.nunique()>1).any(): raise ValueError('Store-city relationship changed')
 hierarchy=['management_group_id','first_category_id','second_category_id','third_category_id']
 if (df.groupby('product_id')[hierarchy].nunique()>1).any().any(): raise ValueError('Product-source hierarchy changed')
 for f in ['hours_sale','hours_stock_status']:
  if not df[f].map(lambda a:len(a)==24 and np.isfinite(a).all() and (np.asarray(a)>=0).all()).all(): raise ValueError(f'Invalid hourly structure {f}')
 if not df.hours_stock_status.map(lambda a:np.isin(a,[0,1]).all()).all(): raise ValueError('Invalid hourly stockout flag')
 return df.sort_values(['store_id','product_id','dt']).reset_index(drop=True)

def select(df,count,cutoff):
 pd,_=deps(); early=df[df.dt<=pd.Timestamp(cutoff)]
 stats=early.groupby('store_id').agg(days=('dt','nunique'),sales=('sale_amount','sum'),rows=('product_id','size'))
 required=max(14,int(early.dt.nunique()*.8))
 stats=stats[(stats.days>=required)&(stats.sales>0)].copy()
 stats['tie']=[stable(str(s)) for s in stats.index]
 chosen=stats.sort_values(['days','rows','tie'],ascending=[False,False,True]).head(count).index.tolist()
 if not chosen: raise ValueError('No stores meet training-window coverage requirements')
 return df[df.store_id.isin(chosen)].copy(),list(map(str,chosen))

def ingest(args):
 pd,np=deps()
 try: from huggingface_hub import HfApi,hf_hub_download
 except ImportError as e: raise RuntimeError('Hugging Face filesystem missing; install ml/requirements.txt') from e
 os.environ.setdefault('HF_HOME',str(LOCAL/'cache'))
 info=HfApi().dataset_info(REPO,revision=args.revision); revision=info.sha
 card=Path(hf_hub_download(REPO,'README.md',repo_type='dataset',revision=revision,cache_dir=LOCAL/'cache')).read_text()
 if 'license: cc-by-4.0' not in card.lower(): raise ValueError('License unverified: stop redistribution; inspect retrieved dataset card')
 frames=[]
 for split in ['train','eval']:
  uri=f'hf://datasets/{REPO}@{revision}/data/{split}.parquet'
  # Requested pandas path, with official Hub fallback. Cache downloads locally.
  try:
   if args.smoke_test: raise OSError('Use row-group smoke reader')
   frame=pd.read_parquet(uri)
  except (OSError,ImportError,ValueError):
   file=hf_hub_download(REPO,f'data/{split}.parquet',repo_type='dataset',revision=revision,cache_dir=LOCAL/'cache')
   if args.smoke_test:
    import pyarrow.parquet as pq
    pf=pq.ParquetFile(file); frame=pf.read_row_group(0).to_pandas()
   else: frame=pd.read_parquet(file)
  frame=validate(frame); frames.append(frame)
 # Preserve train/eval source files separately. The publisher eval horizon is an external future set.
 train=frames[0]; split_dates=splits(train)
 selected,ids=select(train,3 if args.smoke_test else args.stores,split_dates['train_end'])
 evaluation=frames[1][frames[1].store_id.astype(str).isin(ids)]
 out=LOCAL/('smoke' if args.smoke_test else 'freshretailnet'); out.mkdir(parents=True,exist_ok=True)
 selected.to_parquet(out/'curated.parquet',index=False); evaluation.to_parquet(out/'publisher_eval.parquet',index=False)
 manifest=dict(dataset=REPO,revision=revision,retrieved_at=datetime.now(timezone.utc).isoformat(),license='CC BY 4.0',seed=SEED,mode='row_group_smoke' if args.smoke_test else 'full',selection='Training-window >=80% date coverage, positive demand; sort coverage then series volume then fixed hash',selected_stores=ids,excluded_store_count=int(train.store_id.nunique()-len(ids)),rows=len(selected),publisher_eval_rows=len(evaluation),products=int(selected.product_id.nunique()),observed_schema={c:str(t) for c,t in train.dtypes.items()},splits=split_dates,source_origin='real_source')
 dump(out/'manifest.json',manifest); print(json.dumps(manifest))

def offline(args):
 pd,np=deps(); rng=np.random.default_rng(SEED); rows=[]
 for s in range(1,9):
  for p in range(1,37):
   for i,d in enumerate(pd.date_range('2026-02-01',periods=90)):
    demand=max(0,(1+p%7)/10*(1+.25*np.sin(i*2*np.pi/7))+rng.normal(0,.08)); stockout=int(rng.random()<.08)*4
    rows.append(dict(city_id=s%4,store_id=s,management_group_id=1,first_category_id=p%9,second_category_id=p%9*10,third_category_id=p%9*100,product_id=p,dt=str(d.date()),sale_amount=max(0,demand*(1-stockout/24)),hours_sale=[max(0,demand*(1-stockout/24))/24]*24,stock_hour6_22_cnt=stockout,hours_stock_status=[int(h<stockout) for h in range(24)],discount=1.,holiday_flag=0,activity_flag=0,precpt=0.,avg_temperature=15.,avg_humidity=60.,avg_wind_level=1.))
 df=validate(pd.DataFrame(rows)); out=LOCAL/'offline'; out.mkdir(parents=True,exist_ok=True); df.to_parquet(out/'curated.parquet',index=False)
 dump(out/'manifest.json',dict(dataset='Independent synthetic grocery fixture',source_origin='synthetic_fixture',revision='offline-v1',seed=SEED,rows=len(df),products=36,selected_stores=list(range(1,9)),splits=splits(df)))
 print('Created independently synthetic offline data at data/local/offline')

def features(df,horizon=14,include_target=True):
 pd,np=deps(); parts=[]
 for (s,p),g in df.groupby(['store_id','product_id'],sort=True):
  g=g.sort_values('dt').set_index('dt')
  # Missing calendar days are unknown, not zero demand. Reject affected feature/label windows.
  g=g.reindex(pd.date_range(g.index.min(),g.index.max(),freq='D'))
  y=g.sale_amount; prior=y.shift(1)
  x=pd.DataFrame(index=g.index)
  x['lag1']=prior; x['lag7']=y.shift(7); x['mean7']=prior.rolling(7,min_periods=7).mean(); x['mean14']=prior.rolling(14,min_periods=14).mean(); x['std14']=prior.rolling(14,min_periods=14).std(); x['nonzero14']=prior.rolling(14).apply(lambda a:(a>0).mean()); x['stockout7']=g.stock_hour6_22_cnt.shift(1).rolling(7).mean(); x['weekday']=x.index.dayofweek
  x['store_id']=s; x['product_id']=p; x['dt']=x.index
  x['category']=g.first_category_id
  x['seasonal']=x.mean7*horizon; x['moving']=x.mean14*horizon
  if include_target:
   x['target']=y.rolling(horizon,min_periods=horizon).sum().shift(-(horizon-1)); x['censored']=g.stock_hour6_22_cnt.rolling(horizon).max().shift(-(horizon-1))>0
  parts.append(x.reset_index(drop=True))
 return pd.concat(parts,ignore_index=True)

def metrics(y,p,lower=None,upper=None):
 pd,np=deps(); y=np.asarray(y); p=np.maximum(0,np.asarray(p)); denom=float(np.abs(y).sum()); error=p-y
 return dict(wape=float(np.abs(error).sum()/denom) if denom else None,mae=float(np.abs(error).mean()),bias=float(error.mean()),relative_bias=float(error.sum()/denom) if denom else None,interval_coverage=float(((y>=lower)&(y<=upper)).mean()) if lower is not None else None,count=len(y))

def proxy(target,available,pack,margin):
 pd,np=deps(); return np.minimum(np.maximum(np.asarray(target)*SCALE-np.asarray(available),0),np.asarray(pack))*np.asarray(margin)

def train(args):
 pd,np=deps(); from sklearn.ensemble import HistGradientBoostingRegressor
 from sklearn.inspection import permutation_importance
 from sklearn.metrics import ndcg_score
 import pickle
 source=LOCAL/args.source; manifest=json.loads((source/'manifest.json').read_text()); df=validate(pd.read_parquet(source/'curated.parquet')); dates=manifest['splits']; h=args.horizon
 f=features(df,h); finite=f[FEATURES+['target']].notna().all(axis=1); f=f[finite].copy()
 end=f.dt+pd.to_timedelta(h-1,unit='D')
 tr=f[(end<=pd.Timestamp(dates['train_end'])) & ~f.censored]; val=f[(f.dt>=pd.Timestamp(dates['validation_start']))&(end<=pd.Timestamp(dates['validation_end']))]; test=f[(f.dt>=pd.Timestamp(dates['test_start']))&(end<=pd.Timestamp(dates['test_end']))]
 if min(len(tr),len(val),len(test))<10: raise ValueError('Insufficient complete, non-leaking horizon examples in splits')
 model=HistGradientBoostingRegressor(max_iter=80,max_leaf_nodes=15,l2_regularization=1,random_state=SEED,early_stopping=False).fit(tr[FEATURES],tr.target)
 vp=np.maximum(0,model.predict(val[FEATURES])); radius=float(np.quantile(np.abs(vp-val.target),.9,method='higher'))
 vm=metrics(val.target,vp); seasonal=metrics(val.target,val.seasonal); moving=metrics(val.target,val.moving)
 baseline='seasonal' if seasonal['wape']<=moving['wape'] else 'moving'
 # Fixed validation gate; final test is reported once and is not used for fitting or selecting parameters.
 winner='gradient_boosted' if vm['wape']<min(seasonal['wape'],moving['wape']) and abs(vm['relative_bias'])<=.2 else baseline
 pred=np.maximum(0,model.predict(test[FEATURES])); lower=np.maximum(0,pred-radius); upper=pred+radius
 # Deterministic semi-synthetic labels; inventory is known at prediction timestamp.
 product_rows=df.drop_duplicates('product_id')[['product_id','management_group_id','first_category_id','second_category_id','third_category_id']].to_dict('records')
 display={x['sku_id']:x for x in catalogue(product_rows)}
 def ranking_frame(frame):
  z=frame[FEATURES].copy(); keys=[stable(f'{s}|{p}') for s,p in zip(frame.store_id,frame.product_id)]
  z['available']=np.array([int(max(0,float(d)*SCALE/h)*(k%8)) for d,k in zip(frame.moving,keys)])
  z['pack']=[display[str(p)]['pack_multiple'] for p in frame.product_id]
  z['margin']=[display[str(p)]['selling_price']-display[str(p)]['unit_cost'] for p in frame.product_id]
  return z
 rx=ranking_frame(tr); ry=proxy(tr.target,rx.available,rx.pack,rx.margin)
 ranking=HistGradientBoostingRegressor(max_iter=60,max_leaf_nodes=15,random_state=SEED,early_stopping=False).fit(rx,ry)
 tx=ranking_frame(test); true=proxy(test.target,tx.available,tx.pack,tx.margin); rp=np.maximum(0,ranking.predict(tx)); baseline_r=proxy(test.moving,tx.available,tx.pack,tx.margin)
 ranking_eval=[]; baseline_eval=[]
 for _,indices in test.reset_index(drop=True).groupby(['dt','product_id']).groups.items():
  ix=list(indices)
  if len(ix)>1 and np.sum(true[ix])>0:
   ranking_eval.append(ndcg_score([true[ix]],[rp[ix]],k=5)); baseline_eval.append(ndcg_score([true[ix]],[baseline_r[ix]],k=5))
 importance=permutation_importance(model,val[FEATURES],val.target,n_repeats=2,random_state=SEED).importances_mean
 signals=[FEATURES[i] for i in np.argsort(importance)[::-1][:3]]
 version='model-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%f'); dest=MODEL/version; dest.mkdir(parents=True)
 artifact=dest/'model.pkl'; artifact.write_bytes(pickle.dumps(dict(forecast=model,ranking=ranking,radius=radius,features=FEATURES,horizon=h,winner=winner,signals=signals)))
 report=dict(training_examples=len(tr),validation_examples=len(val),test_examples=len(test),code_checksum=hashlib.sha256(Path(__file__).read_bytes()+(ROOT/'ml/grocery.py').read_bytes()).hexdigest(),config_version='forecast-v1',version=version,state='candidate',source=manifest,parameters=dict(max_iter=80,max_leaf_nodes=15,seed=SEED),features=FEATURES,horizon=h,target_scale='normalized_sales',conversion=dict(version='scale10-v1',factor=SCALE,origin='synthetic_operational_conversion'),validation=dict(ml=vm,seasonal=seasonal,moving=moving),test=dict(ml=metrics(test.target,pred,lower,upper),seasonal=metrics(test.target,test.seasonal),moving=metrics(test.target,test.moving)),recommended_champion=winner,ranking=dict(label='proxy_semi_synthetic',ndcg_at_5=float(np.mean(ranking_eval)) if ranking_eval else None,baseline_ndcg_at_5=float(np.mean(baseline_eval)) if baseline_eval else None,groups=len(ranking_eval),relevance='continuous proxy value; ordinal relevance: zero=0, (0,6]=1, (6,12]=2, >12=3'),coverage=1.,fallback_rate=0.,constraint_violations=None,inference_tests_passed=bool(np.isfinite(pred).all() and (lower<=upper).all()),data_tests_passed=True,explanations=dict(method='validation permutation importance; global signals, not local causal effects',top_signals=signals),artifact_path=str(artifact.relative_to(ROOT)),artifact_checksum=hashlib.sha256(artifact.read_bytes()).hexdigest(),created_at=datetime.now(timezone.utc).isoformat(),segments={})
 for group in ['store_id','product_id','category','censored']:
  report['segments'][group]={str(k):metrics(g.target,pred[test.index.get_indexer(g.index)]) for k,g in test.groupby(group)}
 volume=pd.cut(test.moving,[-float('inf'),1,5,float('inf')],labels=['low','medium','high'])
 report['segments']['volume']={str(k):metrics(g.target,pred[test.index.get_indexer(g.index)]) for k,g in test.groupby(volume,observed=True)}
 dump(dest/'report.json',report)
 # Inference rows include future timestamp only, with all features strictly historical.
 last=df.dt.max(); future=[]
 for (s,p),g in df.groupby(['store_id','product_id']):
  row=g.iloc[-1].copy(); row['dt']=last+pd.Timedelta(days=1); row['sale_amount']=np.nan; future.append(row)
 fx=features(pd.concat([df,pd.DataFrame(future)],ignore_index=True),h,False); fx=fx[fx.dt==last+pd.Timedelta(days=1)].copy()
 ok=fx[FEATURES].notna().all(axis=1); values=fx.moving.fillna(0).to_numpy().copy(); values[ok]=np.maximum(0,model.predict(fx.loc[ok,FEATURES]))
 rank_values=np.zeros(len(fx)); rank_values[ok]=np.maximum(0,ranking.predict(ranking_frame(fx.loc[ok])))
 series=[]
 for i,(_,r) in enumerate(fx.iterrows()):
  point=float(values[i]); base=float(r.moving) if pd.notna(r.moving) else 0
  series.append(dict(city_id=str(df.loc[df.store_id==r.store_id,'city_id'].iloc[0]),store_id=str(r.store_id),product_id=str(r.product_id),daily=base/h*SCALE,ranking_score=float(rank_values[i]),model_version=version,model_forecast=point*SCALE,model_normalized=point,lower=max(0,point-radius)*SCALE,upper=(point+radius)*SCALE,baseline=base*SCALE,fallback=not bool(ok.iloc[i]),quality=round(1/(1+radius/max(point,.01)),4),signals='Historical signals: '+', '.join(signals)+' (global validation importance)'))
 products=df.drop_duplicates('product_id')[['product_id','management_group_id','first_category_id','second_category_id','third_category_id']].to_dict('records')
 package(dest/'package',series,products,str((last+pd.Timedelta(days=1)).date()),manifest['source_origin'])
 dump(dest/'predictions.json',series)
 report['coverage']=float(ok.mean()); report['fallback_rate']=float(1-ok.mean()); report['cold_start_rows']=int((~ok).sum()); report['inference_failures']=0
 perturb=tx.copy(); perturb['mean7']*=1.01
 perturbed=np.maximum(0,ranking.predict(perturb)); report['ranking']['mean_absolute_score_change_1pct_mean7']=float(np.mean(np.abs(perturbed-rp)))
 report['ranking']['proxy_margin_label_total']=float(np.sum(true))
 dump(dest/'report.json',report)
 print(json.dumps(dict(version=version,recommended_champion=winner,test=report['test'],ranking=report['ranking'],artifact=report['artifact_path'])))

def evaluate(args):
 """Read the sealed held-out report without fitting or retuning on its outcomes."""
 if not args.version.startswith('model-') or any(c not in 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-' for c in args.version):
  raise ValueError('Invalid model version')
 folder=MODEL/args.version; report=json.loads((folder/'report.json').read_text())
 if hashlib.sha256((folder/'model.pkl').read_bytes()).hexdigest()!=report['artifact_checksum']:raise ValueError('Artifact checksum mismatch')
 print(json.dumps({k:report[k] for k in ['version','validation','test','ranking','coverage','fallback_rate','recommended_champion']},indent=2))

def main():
 parser=argparse.ArgumentParser(); sub=parser.add_subparsers(dest='command',required=True)
 p=sub.add_parser('ingest'); p.add_argument('--smoke-test',action='store_true'); p.add_argument('--stores',type=int,default=70); p.add_argument('--revision',default='main')
 sub.add_parser('offline')
 p=sub.add_parser('evaluate'); p.add_argument('--version',required=True)
 p=sub.add_parser('train'); p.add_argument('--source',choices=['offline','smoke','freshretailnet'],default='offline'); p.add_argument('--horizon',type=int,choices=[14],default=14)
 args=parser.parse_args()
 try: {'ingest':ingest,'offline':offline,'train':train,'evaluate':evaluate}[args.command](args)
 except Exception as e:
  # Never echo tokens or HTTP authorization headers.
  print(json.dumps({'error':'PIPELINE_FAILED','type':type(e).__name__,'message':str(e).replace(os.environ.get('HF_TOKEN','__NO_TOKEN__'),'[redacted]')}),file=sys.stderr); sys.exit(1)
if __name__=='__main__':main()
