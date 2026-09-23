# Upgrade implementation note

This records the pre-change inspection. See implementation_report.md for the completed implementation and verification.

## Inspection and conflicts
Next.js 15 / React 19 / TypeScript / Tailwind, local CSV storage, Vitest, optional conversational API. Existing domain modules join store-SKU rows, calculate projections and write approvals/shipping/next-day packages. The three scenario API/UI and legacy CSV scenario fields must be replaced for new runs; historical files will remain untouched and excluded from active grocery snapshots.

Approval validation currently omits assortment/capacity checks and trusts client constraint messages. Allocation weights do not implement the advertised objective. These are corrected in this upgrade. Existing uncommitted README, copilot, KPI and workspace edits are preserved wherever compatible.

## Data audit before changes
The only active seed generator is absent: 16 prebuilt CSV files plus README.txt live under data/seed/replenishment_mock_csv_package. They contain apparel names, sizes, colours, store labels and promotion names. tests/testRows.ts contains apparel fixtures. No database, migrations, notebooks, product images or downloaded example assets were found. UI/API exports use styleColorSize and scenario identifiers; these require migration. Source data have not yet been downloaded in this execution.

## Sequence and architecture
1. Add deterministic grocery generator, full field-level schema/provenance and reproducible import tooling.
2. Add Python batch CLI for Parquet and CPU gradient boosting (no separate web service). Existing Node web app remains the sole server; optional subprocess jobs run training/ingestion. Python is appropriate for maintained Parquet/scikit-learn tooling rather than implementing numeric training in JavaScript.
3. Single deterministic margin/service pack allocator and complete constraint validation; protected run-based approvals against server-owned data.
4. Persistent jobs, model registry, audit events, human-controlled promotion, API contracts.
5. Preserve design system while replacing scenario controls and adding forecast/health diagnostics.
6. Offline and optional live verification, data/model cards, final report.

## Assumptions
14-day forecast horizon retains existing planning horizon. Normalized source sales stay unchanged; fixed scale 10 operational units per normalized amount is synthetic and versioned. Display taxonomy is a synthetic overlay, never decoded source identities. Source IDs stay strings containing their original encoded values. Weights 0.5/0.5, version balanced-v1. A deterministic marginal-pack heuristic is reported honestly (no global optimality certificate). No LLM controls gates or approval.
