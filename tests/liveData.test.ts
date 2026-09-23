import {describe,it,expect} from 'vitest';
import {modelHealth,inspect} from '../src/lib/server/models';
import {loadCsvPackage} from '../src/lib/domain/joins';
import {recommendPlan,summarizePlan} from '../src/lib/domain/plan';
import {promises as fs} from 'fs';
import path from 'path';
describe.skipIf(process.env.FLOWSTOCK_LIVE_TEST!=='1')('optional locally imported evidence',()=>{
 it('validates the full imported snapshot and single-plan reconciliation',async()=>{
  const health=await modelHealth();const model=health.models.filter(m=>m.source.source_origin==='real_source').at(-1)!;expect(model).toBeTruthy();
  const loaded=await loadCsvPackage(path.join(process.cwd(),'models/local',model.id,'package'));
  expect(new Set(loaded.rows.map(r=>r.storeId)).size).toBe(70);expect(new Set(loaded.rows.map(r=>r.skuId)).size).toBe(556);
  const plan=recommendPlan(loaded.rows);const summary=summarizePlan(plan);expect(summary.constraint_violations).toBe(0);expect(summary.stock.every(s=>s.residual>=0&&s.available===s.allocated+s.residual)).toBe(true);
  const review=await inspect(model.id);expect(review.gates.passed).toBe(false);expect(review.gates.checks.accuracy).toBe(false);
  await fs.writeFile('docs/imported_plan_verification.json',JSON.stringify({model:model.id,rows:plan.length,stores:70,products:556,summary,gates:review.gates},null,2)+'\n');
 },60000);
});
