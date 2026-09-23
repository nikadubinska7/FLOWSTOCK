import {describe,it,expect} from 'vitest';
import {evaluateGates,type ModelReport} from '../src/lib/server/models';
import {monitorOutcomes} from '../src/lib/server/monitoring';
const metric={wape:.2,relative_bias:.01,mae:1,count:100};
const report={test:{ml:metric,seasonal:{...metric,wape:.3},moving:{...metric,wape:.25}},data_tests_passed:true,inference_tests_passed:true,coverage:1,fallback_rate:0,constraint_violations:0} as ModelReport;
describe('numeric maintenance gates',()=>{
 it('passes only verified numeric evidence',()=>{expect(evaluateGates(report).passed).toBe(true);});
 it('rejects regressions, absent constraints and insufficient evidence',()=>{
  expect(evaluateGates({...report,constraint_violations:null}).passed).toBe(false);
  expect(evaluateGates({...report,test:{...report.test,ml:{...metric,wape:.4}}}).passed).toBe(false);
  expect(evaluateGates({...report,fallback_rate:.5}).passed).toBe(false);
  expect(evaluateGates({...report,test:{...report.test,ml:{...metric,count:2}}}).passed).toBe(false);
 });
 it('reports missing evidence and computes actual outcome metrics',()=>{
  expect(monitorOutcomes([]).status).toBe('not enough evidence');
  const m=monitorOutcomes([{actual:10,predicted:8,baseline:7,lower:5,upper:12,fallback:false,store_id:'1',category:'Dairy'}]);
  expect(m.wape).toBe(.2);expect(m.interval_coverage).toBe(1);expect(m.relative_bias).toBe(-.2);
 });
});
