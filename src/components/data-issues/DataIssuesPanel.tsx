import type { DataIssueSummary } from "@/lib/domain/types";
import { Badge } from "@/components/common/Badge";
import { Card } from "@/components/common/Card";

export function DataIssuesPanel({ issues }: { issues: DataIssueSummary[] }) {
  const blockers = issues.filter((issue) => issue.blocksApproval).length;
  return (
    <Card className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Data Issues</h2>
          <p className="text-sm text-cockpit-muted">{issues.length} open issues, {blockers} blockers</p>
        </div>
      </div>
      <div className="max-h-[640px] overflow-auto">
        <table className="w-full min-w-[850px] text-left text-sm">
          <thead className="sticky top-0 bg-cockpit-panel2 text-xs uppercase text-cockpit-muted">
            <tr>
              <th className="px-3 py-3">Severity</th>
              <th className="px-3 py-3">Store</th>
              <th className="px-3 py-3">SKU</th>
              <th className="px-3 py-3">Issue type</th>
              <th className="px-3 py-3">Description</th>
            </tr>
          </thead>
          <tbody>
            {issues.slice(0, 500).map((issue) => (
              <tr key={issue.issueId} className="border-t border-cockpit-line">
                <td className="px-3 py-3"><Badge tone={issue.blocksApproval ? "red" : "amber"}>{issue.severity}</Badge></td>
                <td className="px-3 py-3">{issue.storeId}</td>
                <td className="px-3 py-3">{issue.skuId}</td>
                <td className="px-3 py-3">{issue.issueType}</td>
                <td className="px-3 py-3 text-cockpit-muted">{issue.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
