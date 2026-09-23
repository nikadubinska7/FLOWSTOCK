import {describe,it,expect} from 'vitest';
import {loadCsvPackage} from '../src/lib/domain/joins';
import {groceryDemoPath as seedPackagePath} from '../src/lib/utils/filePaths';
import {validatePackage} from '../src/lib/domain/dataValidation';
import {recommendPlan,summarizePlan} from '../src/lib/domain/plan';
describe('grocery package',()=>{
 it('loads coherent products and generates one feasible plan',async()=>{
  const data=await loadCsvPackage(seedPackagePath);expect(data.rows).toHaveLength(288);
  expect(data.rows.every(r=>r.dataOrigin==='synthetic_fixture')).toBe(true);
  expect(data.rows.every(r=>!/shirt|shoe|apparel/i.test(r.productName))).toBe(true);
  const plan=recommendPlan(data.rows);expect(summarizePlan(plan).constraint_violations).toBe(0);
 });
 it('rejects broken references and duplicate keys',async()=>{
  const {raw}=await loadCsvPackage(seedPackagePath);
  expect(()=>validatePackage({...raw,stores:[...raw.stores,raw.stores[0]]})).toThrow('DUPLICATE');
  expect(()=>validatePackage({...raw,store_inventory:[{...raw.store_inventory[0],sku_id:'missing'}]})).toThrow();
 });
});
