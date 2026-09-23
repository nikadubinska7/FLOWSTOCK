import {describe,it,expect} from 'vitest';
import {recommendPlan,summarizePlan,objectiveConfig} from '../src/lib/domain/plan';
import {isApprovalBlocked} from '../src/lib/domain/constraints';
import {makeRow} from './testRows';
describe('single recommended plan',()=>{
 it('conserves scarce DC stock, respects packs and is deterministic',()=>{
  const input=Array.from({length:10},(_,i)=>makeRow({id:`${i}|sku`,storeId:String(i),dcFreeStockOriginal:42,stockOnHand:0,forecastNext14:100,storeSkuCapacityUnits:200}));
  const a=recommendPlan(input);expect(a.reduce((s,r)=>s+r.finalQty,0)).toBeLessThanOrEqual(42);
  expect(a.every(r=>r.finalQty>=0&&r.finalQty%r.packMultiple===0&&!isApprovalBlocked(r))).toBe(true);
  expect(recommendPlan([...input].reverse())).toEqual(a);
  const summary=summarizePlan(a);expect(summary.stock[0].available).toBe(summary.stock[0].allocated+summary.stock[0].residual);expect(summary.service_floor_shortfall).toBeGreaterThan(0);
 });
 it('respects assortment, lifecycle and capacities',()=>{
  for(const patch of [{ranged:false},{replenishable:false},{storeSkuCapacityUnits:3},{hardCategoryCapacityUnits:3},{receivingCapacityUnits:3},{dataIssueSeverity:'Blocker'}]){
   const rows=recommendPlan([makeRow(patch)]);expect(rows[0].finalQty).toBe(0);
  }
 });
 it('normalizes objective components and leaves unnecessary stock unallocated',()=>{
  const rows=recommendPlan([makeRow({stockOnHand:100,forecastNext14:20})]);expect(rows[0].finalQty).toBe(0);
  const s=summarizePlan(recommendPlan([makeRow()]));expect(s.objective_value).toBeCloseTo(.5*s.margin_contribution+.5*s.service_contribution);expect(s.objective_value).toBeLessThanOrEqual(1);
 });
 it('rejects invalid configuration and out-of-horizon delivery',()=>{
  expect(()=>recommendPlan([makeRow()],{...objectiveConfig,margin_weight:2})).toThrow();
  expect(recommendPlan([makeRow({daysToDelivery:15})])[0].finalQty).toBe(0);
 });
});
