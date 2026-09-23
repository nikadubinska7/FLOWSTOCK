import {describe,it,expect,beforeAll,afterAll} from 'vitest';
import {promises as fs} from 'fs';
import path from 'path';
import os from 'os';
import {createHash} from 'crypto';
let root:string;
let models:typeof import('../src/lib/server/models');
beforeAll(async()=>{
 root=await fs.mkdtemp(path.join(os.tmpdir(),'flowstock-registry-'));
 process.env.FLOWSTOCK_STATE_DIR=path.join(root,'state');process.env.FLOWSTOCK_MODEL_DIR=path.join(root,'models');
 models=await import('../src/lib/server/models');
 for(const [id,wape] of [['model-one',.2],['model-two',.19],['model-bad',.8]] as const){
  const folder=path.join(root,'models',id);await fs.mkdir(folder,{recursive:true});await fs.cp(path.join(process.cwd(),'data/seed/grocery_demo'),path.join(folder,'package'),{recursive:true});
  const artifact=Buffer.from('Independent test artifact; never deserialized');await fs.writeFile(path.join(folder,'model.pkl'),artifact);
  const metric={wape,mae:1,relative_bias:.01,count:100};
  const report={version:id,state:'candidate',horizon:14,source:{revision:'test-v1',source_origin:'synthetic_fixture',splits:{test_start:'2024-01-01'},selected_stores:['001']},artifact_checksum:createHash('sha256').update(artifact).digest('hex'),test:{ml:metric,seasonal:{...metric,wape:.3},moving:{...metric,wape:.25}},inference_tests_passed:true,data_tests_passed:true,coverage:1,fallback_rate:0};
  await fs.writeFile(path.join(folder,'report.json'),JSON.stringify(report));
 }
});
afterAll(async()=>{await fs.rm(root,{recursive:true,force:true});delete process.env.FLOWSTOCK_STATE_DIR;delete process.env.FLOWSTOCK_MODEL_DIR;});
describe('human-controlled model registry',()=>{
 it('creates one consistent local identity under concurrent first requests',async()=>{
  const {keys}=await import('../src/lib/server/auth');const issued=await Promise.all(Array.from({length:4},()=>keys()));
  expect(new Set(issued.map(k=>k.planner)).size).toBe(1);expect(new Set(issued.map(k=>k.admin)).size).toBe(1);
 });
 it('requires approval, retains previous versions and rolls back',async()=>{
  await expect(models.modelAction('model-one','activate','test-admin','Premature')).rejects.toThrow('HUMAN_APPROVAL_REQUIRED');
  await expect(models.modelAction('model-bad','approve','test-admin','Bad metrics')).rejects.toThrow('PROMOTION_GATE_FAILED');
  await models.modelAction('model-one','approve','test-admin','Verified fixture metrics');
  let state=await models.modelAction('model-one','activate','test-admin','Activate');expect(state.champion).toBe('model-one');
  await models.modelAction('model-two','approve','test-admin','Improved comparable metrics');
  state=await models.modelAction('model-two','activate','test-admin','Activate');expect(state.models['model-one'].state).toBe('rolled_back');
  state=await models.modelAction('model-one','rollback','test-admin','Restore previously approved model');expect(state.champion).toBe('model-one');expect(state.models['model-two'].state).toBe('rolled_back');
  const audit=await fs.readFile(path.join(root,'state/audit.jsonl'),'utf8');expect(audit).toContain('model_rollback');expect(audit).toContain('test-admin');
 });
 it('uses baseline fallback when an approved artifact becomes unavailable',async()=>{
  const {readCsv}=await import('../src/lib/csv/readCsv');const {writeCsv}=await import('../src/lib/csv/writeCsv');
  const csvPath=path.join(root,'models/model-one/package/forecast_next_28d.csv');
  const forecasts=await readCsv(csvPath);await writeCsv(csvPath,forecasts.map(r=>({...r,model_version:'model-one',model_forecast:String(Number(r.forecast_next_14_units)*1.1),fallback:'False'})));
  const {startRun,executeRun}=await import('../src/lib/server/runs');
  const live=await executeRun((await startRun('model-one','test-planner','with-artifact')).id);
  expect(live.status).toBe('ready');expect(live.rows.every(r=>r.forecastFallback===false)).toBe(true);
  await fs.rename(path.join(root,'models/model-one/model.pkl'),path.join(root,'models/model-one/model.saved'));
  const fallback=await executeRun((await startRun('model-one','test-planner','without-artifact')).id);
  expect(fallback.status).toBe('ready');expect(fallback.rows.every(r=>r.forecastFallback===true)).toBe(true);
  await fs.rename(path.join(root,'models/model-one/model.saved'),path.join(root,'models/model-one/model.pkl'));
 });
 it('detects artifact tampering before approval',async()=>{
  await fs.writeFile(path.join(root,'models/model-bad/model.pkl'),'changed');
  await expect(models.modelAction('model-bad','approve','test-admin','Verify')).rejects.toThrow('ARTIFACT_CHECKSUM_MISMATCH');
 });
});
