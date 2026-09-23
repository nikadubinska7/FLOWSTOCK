import {describe, expect, it} from 'vitest';
import {compareRecoveredSales, zeroRecommendationReasons} from '../src/lib/domain/recommendationReview';
import {recommendPlan} from '../src/lib/domain/plan';
import {makeRow} from './testRows';

describe('recommendation review', () => {
  it('sorts actual recovery above unrecovered risk, regardless of the current risk label', () => {
    const zero = makeRow({id:'zero',riskLevel:'High',revenueAtRisk:3200,expectedRecoveredRevenue:0});
    const benefit = makeRow({id:'benefit',riskLevel:'Medium',revenueAtRisk:1000,expectedRecoveredRevenue:500,finalQty:10});
    expect([zero,benefit].sort((a,b)=>compareRecoveredSales(a,b,'desc'))[0].id).toBe('benefit');
    expect([zero,benefit].sort((a,b)=>compareRecoveredSales(a,b,'asc'))[0].id).toBe('zero');
  });
  it('explains the screenshot SKU capacity case without recommending an invalid pack', () => {
    const row = recommendPlan([makeRow({stockOnHand:5,inTransitQty:0,storeSkuCapacityUnits:7,packMultiple:6,forecastNext14:44.7,daysToDelivery:5,dcFreeStockOriginal:286})])[0];
    expect(row.systemRecommendedQty).toBe(0);
    expect(row.reasonCode).toContain('Capacity capped: store-SKU');
    expect(row.reasonCode).not.toContain('No replenishment needed');
    const reason = zeroRecommendationReasons(row)[0];
    expect(reason.label).toBe('SKU capacity limit');
    expect(reason.detail).toContain('leaves 2 units of room');
    expect(reason.detail).toContain('minimum shipment: 6 units');
    expect(row.expectedRecoveredRevenue).toBe(0);
  });
  it('distinguishes unavailable DC stock, depleted allocation, capacity and genuine no-need cases', () => {
    const noDc = recommendPlan([makeRow({dcFreeStockOriginal:0})])[0];
    expect(noDc.reasonCode).toContain('No DC free stock');
    expect(noDc.reasonCode).not.toContain('No replenishment needed');
    expect(zeroRecommendationReasons(noDc)[0].label).toBe('No DC free stock');
    const receiving = recommendPlan([makeRow({receivingCapacityUnits:2})])[0];
    expect(zeroRecommendationReasons(receiving)[0].label).toBe('Receiving capacity limit');
    expect(new Set(receiving.reasonCode.split('; ')).size).toBe(receiving.reasonCode.split('; ').length);
    const healthy = recommendPlan([makeRow({stockOnHand:100,forecastNext14:20})])[0];
    expect(healthy.reasonCode).toBe('No replenishment needed');
    expect(zeroRecommendationReasons(healthy)[0].label).toBe('No replenishment needed');
    const scarce = recommendPlan([makeRow({id:'a',storeId:'a',dcFreeStockOriginal:6}),makeRow({id:'b',storeId:'b',dcFreeStockOriginal:6})]);
    expect(zeroRecommendationReasons(scarce.find(r=>r.finalQty===0)!)[0].label).toBe('DC allocated to other rows');
  });
});
