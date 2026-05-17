export function addReason(reasons: Set<string>, reason: string, condition = true): void {
  if (condition) reasons.add(reason);
}

export function reasonText(reasons: Set<string>): string {
  return Array.from(reasons).join("; ") || "No replenishment needed";
}
