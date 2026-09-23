import type {WorkingRow} from "./types";
export function shortage(r: WorkingRow): number {
  // Lost sales before delivery cannot be recovered. Horizon demand assumed uniform.
  const daily = r.forecastNext14 / 14;
  const stockAtArrival = Math.max(0, r.stockOnHand + r.inTransitQty - daily * r.daysToDelivery);
  return Math.max(0, daily * Math.max(0, 14 - r.daysToDelivery) - stockAtArrival);
}
