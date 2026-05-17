import { Columns3, Filter, Plus, Search } from "lucide-react";
import { SearchInput } from "@/components/common/SearchInput";
import { Select } from "@/components/common/Select";

export type Filters = {
  search: string;
  store: string;
  category: string;
  risk: string;
  constraint: string;
  promo: string;
  manual: string;
  dataIssue: string;
  finalPositive: string;
};

export function TableFilters({
  filters,
  stores,
  categories,
  onChange
}: {
  filters: Filters;
  stores: string[];
  categories: string[];
  onChange: (filters: Filters) => void;
}) {
  const set = (key: keyof Filters, value: string) => onChange({ ...filters, [key]: value });
  return (
    <section className="glass-panel rounded-3xl p-5">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-cockpit-text">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/12 text-blue-200 ring-1 ring-blue-300/20">
            <Filter size={17} />
          </span>
          Command filters
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => set("risk", filters.risk === "High" ? "" : "High")} className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${filters.risk === "High" ? "border-rose-300/35 bg-rose-400/14 text-rose-100" : "border-white/10 bg-white/[0.04] text-cockpit-muted hover:bg-white/[0.07]"}`}>High risk</button>
          <button type="button" onClick={() => set("dataIssue", filters.dataIssue === "yes" ? "" : "yes")} className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${filters.dataIssue === "yes" ? "border-amber-300/35 bg-amber-400/14 text-amber-100" : "border-white/10 bg-white/[0.04] text-cockpit-muted hover:bg-white/[0.07]"}`}>Data issues</button>
          <button type="button" onClick={() => set("finalPositive", filters.finalPositive === "yes" ? "" : "yes")} className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${filters.finalPositive === "yes" ? "border-cyan-300/35 bg-cyan-400/14 text-cyan-100" : "border-white/10 bg-white/[0.04] text-cockpit-muted hover:bg-white/[0.07]"}`}>Final qty &gt; 0</button>
          <button type="button" className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-cockpit-muted transition hover:bg-white/[0.07]"><Plus size={14} /> Add filter</button>
          <button type="button" className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-cockpit-muted transition hover:bg-white/[0.07]"><Columns3 size={14} /> Columns</button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <div className="relative">
          <Search size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-cockpit-muted" />
          <SearchInput className="pl-11" placeholder="Search store, SKU, reason" value={filters.search} onChange={(event) => set("search", event.target.value)} />
        </div>
        <Select value={filters.store} onChange={(event) => set("store", event.target.value)}>
          <option value="">All stores</option>
          {stores.map((store) => <option key={store}>{store}</option>)}
        </Select>
        <Select value={filters.category} onChange={(event) => set("category", event.target.value)}>
          <option value="">All categories</option>
          {categories.map((category) => <option key={category}>{category}</option>)}
        </Select>
        <Select value={filters.risk} onChange={(event) => set("risk", event.target.value)}>
          <option value="">All risk levels</option>
          <option>High</option>
          <option>Medium</option>
          <option>Low</option>
          <option>Blocked</option>
        </Select>
        <Select value={filters.constraint} onChange={(event) => set("constraint", event.target.value)}>
          <option value="">All constraint states</option>
          <option>Valid</option>
          <option>Warning</option>
          <option>Blocked</option>
        </Select>
        <Select value={filters.promo} onChange={(event) => set("promo", event.target.value)}>
          <option value="">Promo and non-promo</option>
          <option value="yes">Promo only</option>
          <option value="no">Non-promo only</option>
        </Select>
        <Select value={filters.manual} onChange={(event) => set("manual", event.target.value)}>
          <option value="">Manual and system rows</option>
          <option value="yes">Manual override only</option>
          <option value="no">No manual override</option>
        </Select>
        <Select value={filters.dataIssue} onChange={(event) => set("dataIssue", event.target.value)}>
          <option value="">With or without data issue</option>
          <option value="yes">Data issue only</option>
          <option value="no">No data issue</option>
        </Select>
        <Select value={filters.finalPositive} onChange={(event) => set("finalPositive", event.target.value)}>
          <option value="">All quantities</option>
          <option value="yes">Final qty greater than zero</option>
          <option value="no">Final qty zero</option>
        </Select>
      </div>
    </section>
  );
}
