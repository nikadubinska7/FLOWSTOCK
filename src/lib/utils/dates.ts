const deliveryDayIndex: Record<string, number> = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6
};

export function addDays(dateString: string, days: number): string {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function daysUntilDelivery(runDate: string, deliveryDay: string): number {
  const date = new Date(`${runDate}T00:00:00Z`);
  const target = deliveryDayIndex[deliveryDay] ?? 1;
  const current = date.getUTCDay();
  const diff = (target - current + 7) % 7;
  return diff === 0 ? 7 : diff;
}

export function deliveryDate(runDate: string, deliveryDay: string): string {
  return addDays(runDate, daysUntilDelivery(runDate, deliveryDay));
}
