import type { ScenarioComparisonRow } from "@/lib/domain/types";
import { Card } from "@/components/common/Card";
import { money, pct, whole } from "@/lib/utils/formatters";

export function ScenarioComparison({ rows }: { rows: ScenarioComparisonRow[] }) {
  return (
    <Card className="p-4">
      <div className="mb-4">
        <h2 className="text-base font-semibold">Scenario Comparison</h2>
        <p className="text-sm text-cockpit-muted">Compares current state with each smart replenishment scenario.</p>
      </div>
      <div className="overflow-auto">
        <table className="w-full min-w-[940px] text-left text-sm">
          <thead className="bg-cockpit-panel2 text-xs uppercase text-cockpit-muted">
            <tr>
              <th className="px-3 py-3">Scenario</th>
              <th className="px-3 py-3 text-right">Units</th>
              <th className="px-3 py-3 text-right">Inventory value</th>
              <th className="px-3 py-3 text-right">Lost sales</th>
              <th className="px-3 py-3 text-right">Recovered revenue</th>
              <th className="px-3 py-3 text-right">Recovered margin</th>
              <th className="px-3 py-3 text-right">OOS %</th>
              <th className="px-3 py-3 text-right">Blocked rows</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.name} className="border-t border-cockpit-line">
                <td className="px-3 py-3 font-semibold">{row.name}</td>
                <td className="px-3 py-3 text-right">{whole(row.replenishmentUnits)}</td>
                <td className="px-3 py-3 text-right">{money(row.inventoryValue)}</td>
                <td className="px-3 py-3 text-right">{money(row.lostSalesValue)}</td>
                <td className="px-3 py-3 text-right">{money(row.recoveredRevenue)}</td>
                <td className="px-3 py-3 text-right">{money(row.recoveredMargin)}</td>
                <td className="px-3 py-3 text-right">{pct(row.oosPercent)}</td>
                <td className="px-3 py-3 text-right">{row.constraintViolations}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
