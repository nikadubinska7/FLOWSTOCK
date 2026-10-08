# Flowstock — AI-assisted replenishment planning

Flowstock is a working, local web prototype for planning DC-to-store replenishment across a sportswear store network. A planner generates **one recommended plan**, reviews its expected commercial impact, edits quantities, approves shipments and advances to the next simulated day.

**Current status — 6 October 2026:** the sportswear workflow works end to end. Recommendations use transparent deterministic allocation and the supplied mock forecasts. A separate Databricks study now includes frozen baselines, Spark ML, Elastic Net, AdaBoost and PyTorch experiments, but no candidate has met the sportswear promotion target. Optional grocery forecasting research, model governance and integration APIs are also implemented. This is an AI Consultancy Bootcamp proof of concept, not a production inventory system.

## 1. Run locally

### Existing project

Open Terminal in the project folder:

```bash
npm run dev
```

Open **http://127.0.0.1:3000**. Keep Terminal running; press **Ctrl+C** to stop the server. The sportswear planner needs no API key, database or Python service.

### New checkout

Install Node.js and npm first, then:

```bash
git clone https://github.com/nikadubinska7/FLOWSTOCK.git
cd FLOWSTOCK
npm ci
npm run dev
```

This workspace was verified with Node.js 25.8.1. Python is optional and needed only for the research pipeline and Python tests; that environment was verified with Python 3.14.2.

The default development server binds to your computer's loopback address. For a local production build:

```bash
npm run build
npm run start -- --hostname 127.0.0.1
```

Development, production and browser tests use separate generated folders: `.next-dev`, `.next`, and `.next-browser`. This prevents a build or test from overwriting files used by an open development session. If an older session stops responding after an update, restart `npm run dev` and reload the browser with **Cmd+Shift+R**.

## 2. Business scope and datasets

The default network has:

- **1 central DC**, **70 stores**, and **1,200 style-color-size SKUs**.
- **57,114 ranged store-SKU combinations**; each is a planning-table row.
- Daily planning, weekly store delivery days, fixed assortments and DC-to-store transfers.
- Mock inventory, demand, prices, margins, capacity rules, open orders and data issues supplied as CSVs.

Flowstock now separates the **data source** from the **snapshot**. Each source owns its latest package, generated planning days and run history, so switching sources cannot make one dataset appear as the latest package for another.

| Data source | Current state |
|---|---|
| Sportswear CSV | Ready; full planning, approval, shipping and next-day loop. |
| Microsoft Business Central | Read-only Production connection verified for CRONUS USA, Inc.; published location-level ledger fields were found, but warehouse activity is too sparse for direct store replenishment. |
| Grocery research CSV | Ready as an optional research fixture, isolated from sportswear outputs. |

The snapshot selector then offers snapshots belonging to the selected source:

| Snapshot | Purpose |
|---|---|
| Latest planning day | Default; loads the latest generated package, or the corrected sportswear starting package when no next day exists. |
| Original sportswear · 70 stores · 1,200 SKUs | Starts from the initial sportswear data with the documented mock capacity corrections. |
| Grocery demo · reference dataset | Small independent synthetic fixture: 8 stores × 36 products. |
| Grocery research data · model version | Locally prepared historical research package, available after importing and training. |

Planning API requests now carry both `source` and `snapshot`. Older snapshot-only clients remain supported and are assigned to their historical source automatically. Business Central cannot generate a plan until its API adapter has synchronized a validated local snapshot. See the [Business Central discovery report](docs/business_central_discovery.md).

The original sportswear CSVs are preserved in `data/seed/replenishment_mock_csv_package`. Inventory, forecasts, costs, prices and product identities are not inflated to make recommendations look better.

### Why the sportswear working copy has corrected capacities

All 140 original store-category groups already exceeded their stated hard capacities, and 8,890 store-SKU rows exceeded individual capacities. Enforcing the upgraded constraints therefore initially blocked every shipment. The owner approved a corrected **working copy**, leaving the source files unchanged:

- Category hard capacity accommodates at least existing stock plus one store receiving delivery.
- Category soft capacity accommodates at least existing stock, bounded by hard capacity.
- A SKU capacity below existing stock is raised only to that existing stock; it receives no extra replenishment room.
- Duplicated category capacities in `stores.csv` match the category rules.

The copy is generated automatically under `data/local/sportswear_runs/snapshots/`. Its `sportswear_capacity_adjustments.json` records the rule version, source hash and adjustments. These are mock assumptions requiring business calibration, not measured physical capacities. See [sportswear restoration and investigation notes](docs/sportswear_restoration.md).

## 3. Planner workflow

1. **Refresh.** Load the latest planning package. Recommendation and Final Qty reset to zero; Current State and Simulation match until a plan is generated.
2. **Choose a snapshot and generate the plan.** The default is Latest planning day. The full sportswear dataset took approximately 25–30 seconds to generate and load in the tested local browser. This is an observed duration, not a performance guarantee.
3. **Review the comparison.** Inspect inventory, lost sales risk, demand-weighted OOS risk, DC stock, expected margin, service fulfilment and constraints.
4. **Review rows and exceptions.** Search store/SKU/product; filter store, category, risk or status. Use **High risk · zero qty** for unresolved exceptions. Optional columns expose transit, forecasts, capacity-related reasons, confidence and other evidence. Click a store or a zero-recommendation reason to open row details.
5. **Edit Final Qty if necessary.** Simulation recalculates immediately. A quantity different from the system recommendation requires a comment. Invalid quantities cannot be approved.
6. **Approve selected or all valid filtered rows.** Review the confirmation summary, then choose shipping documents or approval only. “All valid” covers qualifying rows in the filtered dataset, including rows beyond the 350 currently rendered. The table's select-all checkbox selects the rendered rows.
7. **Receive outputs and advance.** Approval writes records and a next-day CSV package. Choosing shipping also downloads the CSV. The interface refreshes after approval; subsequent Refresh loads the latest package. Generate another plan against that updated inventory.

Rejecting a plan records the decision without creating shipments. One approval closes a plan and consumes its inventory snapshot: an additional approval needs updated inventory. Switching model versions does not make already-approved stock available again.

### Views and exports

- **Workspace:** KPI comparison, single-plan controls, filters, editable table, explanations and approval controls.
- **Data Issues:** supplied unresolved warnings and blockers, with affected rows.
- **Model health:** available research candidates, metrics, gate reports and administrator review controls.
- **Run History:** approved runs and their quantities/values.
- **Table export:** the filtered planning worksheet, explicitly unapproved.
- **Shipping export:** approved shipments, grouped by route + delivery date + store, with product, quantity, cost, retail value, plan/approval references and provenance.

The table currently renders the first **350 matching rows** for usability. Filters, totals and exports operate on the loaded dataset; this is not a complete virtualized spreadsheet.

## 4. What the KPIs mean

| KPI | Current State | Simulation |
|---|---|---|
| Inventory value | Store stock on hand + in-transit stock, valued at unit cost. | The same stock plus proposed Final Qty, valued at cost. |
| Lost sales risk | Value of unmet forecast demand over 14 days, at selling price. | Remaining unmet demand after the proposed shipment's recoverable contribution. |
| OOS risk | Unfulfilled forecast units ÷ total forecast units. | The same demand-weighted measure after replenishment. |
| DC free stock | Available DC stock, counted once per SKU. | Available DC stock less the plan's allocations. |

**OOS risk is not the percentage of SKUs physically out of stock.** Inventory value is the store/transit position, not total network inventory or a claim of reduced working capital. The new shipment cannot recover sales already lost before delivery. The prototype assumes uniform demand over the horizon and treats existing aggregate in-transit stock as available.

Delta colours use numeric changes and business direction:

- Lower inventory, lost sales risk and OOS risk are green; increases are amber.
- Higher DC free stock is green; reductions are amber because less stock remains available.
- No change is neutral grey. These colours describe the individual KPI, not whether the entire plan is commercially optimal.

### Risk and recommendation are different

**Current risk** describes the position before the plan. A high-risk SKU can receive zero because no DC stock exists, a complete pack will not fit, receiving/category capacity is exhausted, the SKU is ineligible, or a data blocker exists.

The table shows **actual recovered sales**, with a neutral €0 where nothing is recovered. Revenue at risk is shown separately. Sorting by recovered sales never substitutes at-risk revenue for a zero benefit. Each zero system recommendation has an explanation; the drawer includes quantities and limits.

For example, a SKU with capacity 7, stock 5 and pack size 6 has room for only 2 units. Its high risk does not permit a 6-unit shipment that violates capacity.

### Reproducible initial sportswear result

These are simulated outputs from the corrected initial package with default settings and no manual edits:

| Measure | Current | Recommended plan |
|---|---:|---:|
| Inventory value | €16,786,591 | €17,660,569 |
| Lost sales risk | €1,613,132 | €799,042 |
| OOS risk | 17.7% | 8.7% |
| DC free stock | 433,498 units | 400,086 units |
| New replenishment | 0 | 33,412 units |

The plan improves 6,299 rows, with projected recovered revenue of €814,090, recovered margin of €456,289 and zero shipment constraint violations. Of 4,832 high-current-risk rows, 3,102 receive a recommendation and 1,730 remain at zero for stated reasons. These figures are not realized sales, measured profit or proven client ROI.

## 5. Recommendation and approval logic

The active method is a **deterministic greedy allocation in complete packs**. It considers recoverable demand after delivery and combines normalized margin recovery and shortage reduction. It is explainable and repeatable; it does not certify a globally optimal solution.

Defaults in [`config/objective.json`](config/objective.json):

| Setting | Value |
|---|---|
| Objective version | `balanced-v1` |
| Margin / service weights | 50% / 50% |
| Service target | 90% |
| Forecast horizon | 14 days |
| Budget | None configured |
| Tie-breaks | Store ID, SKU ID, then pack ordinal |

Packs contributing towards the service target receive priority, followed by the weighted marginal score. The plan reports unmet service instead of bypassing constraints. Change the configuration version when changing its settings; this preserves the run's recorded objective.

Hard validation includes:

- Available **DC free stock**, shared across all stores for a SKU.
- Nonnegative whole quantities, complete packs and configured shipment limits.
- Fixed assortment, replenishable flag and disallowed lifecycle states.
- Store-SKU, cumulative category and store receiving capacities.
- Blocker-level data issues, delivery horizon and an optional plan budget.
- Comments on manual overrides; server-side validation before approval.

Low confidence and soft-capacity exceptions remain visible warnings. Final approval uses server-owned inventory and rules, not quantities or stock balances invented by a client. Source hashes, revision checks, idempotency keys and an inventory-consumption record protect against stale edits and duplicate approval.

The former three-scenario selector is intentionally removed. Older scenario descriptions in the original project instructions describe the earlier design, not the current workflow.

## 6. Next-day simulation and local storage

Approval creates a dated package containing updated inventory, orders, sales, forecasts and history:

- New approved quantities reduce DC free stock and increase reservations and store transit.
- Due orders move from transit into stock exactly once.
- Original sportswear open orders are treated as already dispatched; their arrival does not debit DC inventory again. New Flowstock orders retain reservation-until-arrival accounting.
- Simulated daily sales reduce available store stock across all rows.
- Sales history retains the latest 28-day window; forecasts receive a small deterministic adjustment.
- Model predictions are cleared on simulated next-day data, which uses the baseline forecast.
- The date advances by one calendar day, with the previous package and approval recorded.

```text
data/seed/replenishment_mock_csv_package/       # original sportswear input
data/seed/grocery_demo/                         # independent small fixture
data/local/sportswear_runs/
  snapshots/sportswear-capacity-v1-<hash>/       # corrected initial working copy
  YYYY-MM-DD/output/approved_replenishment/
  YYYY-MM-DD/output/shipping_docs/
  YYYY-MM-DD/APR-.../input/                     # next-day package
  active.json                                  # latest package pointer
.flowstock/                                    # local runs, registry, jobs, audit, keys
models/local/model-.../                         # optional trained research artifacts
```

Operational outputs, private state, downloaded research data and model artifacts are **not committed**. A new clone starts with the committed mock data and no trained local candidates. Historical grocery runs are retained locally when present; selecting and approving a research snapshot is a separate demonstration using that dataset.

## 7. AI copilot and optional forecasting research

### Copilot

Flowstock AI explains the supplied plan context, risks and calculations. A deterministic fallback works without credentials. Optional conversational responses use a configured API key and can send the supplied planning context to that provider. The copilot cannot approve shipments, edit quantities or promote models.

For optional configuration, copy `.env.example` to `.env.local`, fill only the settings you need, and restart the app. `OPENAI_API_KEY` and `OPENAI_MODEL` control conversational responses. The server-only `BC_*` settings enable read-only Business Central connection testing and discovery; they do not create a planning snapshot or enable recommendations from Business Central. Keep `.env.local` private.

### Grocery forecasting research: separate from sportswear

The implemented Python pipeline imports **FreshRetailNet-50K grocery data**, validates it, selects stores reproducibly and creates chronological train/validation/test splits. It compares seasonal and moving-average baselines with CPU gradient boosting, and trains a separate ranking challenger using a semi-synthetic margin proxy.

The verified import contains 70 stores, 556 products and 765,810 rows from the publisher's training file, plus 59,563 preserved evaluation rows. The 90-day training-file history spans 28 March–25 June 2024. Source amounts are normalized, not physical units. Product names, costs, inventory and operating quantities are synthetic overlays with explicit provenance and a versioned conversion.

Latest recorded held-out evidence:

| Forecast metric | ML candidate | Seasonal baseline | Moving average |
|---|---:|---:|---:|
| WAPE — lower is better | 22.31% | 20.78% | 20.34% |

The candidate underperforms both baselines and remains unpromoted. Proxy ranking NDCG@5 is approximately 0.9980 versus 0.9949 for its baseline; this measures a synthetic proxy, not actual allocation profit. Only 5,015 uncensored complete training examples remained after exclusions, a substantial limitation. See [evaluation results](docs/evaluation_results.json), [model card](docs/model_card.md) and [data card](docs/data_card_freshretailnet.md).

**There is no validated sportswear ML model.** Sportswear planning uses the supplied mock forecasts. Grocery predictions apply only to a matching, explicitly approved model snapshot; the ranking challenger is diagnostic and does not drive the active allocation objective.

### Sportswear forecasting research: Databricks Round 2

This study is deliberately separate from the web application's committed seed data. The private synthetic-data generator, generated bundle, Databricks notebooks and model artifacts are not tracked in this repository. The public repository records the design, controls, results and decisions needed to reproduce and review the work without publishing the synthetic generator or large datasets.

#### Dataset and evaluation boundary

| Item | Recorded value |
|---|---:|
| Network | 1 DC, 70 stores, 720 SKUs |
| Fixed assortment | 34,268 ranged store-SKU combinations |
| Development period | 1 July 2024–30 June 2026 |
| Daily development rows | 25,015,640 |
| Sealed evaluation period | 1 July–28 September 2026 |
| Sealed daily rows | 3,084,120 |
| Databricks bundle | 171 files in 24 monthly partitions |
| Raw Delta tables | 25 |

The uploaded bundle passed file-count and SHA-256 checks. It excludes generator code, private truth fields and sealed actual outcomes. The 90-day sealed period remains unread and unscored. The April–June internal holdout was used for the frozen baseline and first GBT evaluation; later candidates are selected only on the development tuning split and must not be treated as final validation results.

WAPE is `sum(abs(actual - forecast)) / sum(actual)`. Lower is better. Screens sometimes show `1 - WAPE` as an intuitive “forecast accuracy,” but that is only a presentation shorthand: it can be negative, it is sensitive to aggregation, and it is not a universal accuracy definition. The current minimum business target of 65% on that display is equivalent to **WAPE ≤ 0.35**; the preferred 70–80% range is **WAPE 0.30–0.20**.

#### Experiment log

| Step | Work completed | Result and decision |
|---:|---|---|
| 1–8 | Defined the synthetic sportswear blueprint, masters, operational history, validation rules and export bundle. | Built a checksum-validated, pre-backtest bundle with fixed assortment and a sealed future period. |
| 9 | Uploaded and verified the V2 bundle in Databricks. | 171 files extracted; recorded ZIP SHA-256; no sealed outcomes opened. |
| 10 | Loaded the raw bundle. | Created 25 Delta tables with 25,015,640 development rows. |
| 11 | Built leakage-controlled daily demand features and the feature contract. | 25,015,640 feature rows; 22,572,215 eligible labelled rows; 519,242 censored targets; 69 feature columns; 55 approved inputs. |
| 12 | Froze simple 28-day baselines and corrected the evaluation grain from daily diagnostics to the business horizon. | V1 was rejected as too weak: all-store WAPE 0.6455 and high-volume store-SKU WAPE 0.4959. V1 cleanup removed 35 tables and one bundle path while preserving the raw volume. |
| 12B–12C | Rebuilt and evaluated V2 at store-SKU and network-SKU level. | Balanced blend all-store WAPE 0.5200; high-volume store-SKU WAPE 0.3979; high-volume network-SKU seasonal WAPE 0.0860. The top 20% comprised 144 SKUs, 43.3% of units, with a 1,280-unit trailing-180-day threshold. The large gap between network and store WAPE points to store allocation as the main problem. |
| 13 | Created 28-day supervised examples. | 19 development origins; 1,850,472 examples; 1,332,201 model-eligible. Internal holdout: 102,804 examples, 74,575 complete. Approved inputs: 68. Sealed access: 0. |
| 14 | Trained the first Spark GBT residual model. | Internal WAPE 0.4866 versus 0.5200 baseline: 6.4% relative improvement. High-volume store WAPE 0.3691; high-volume network WAPE worsened from 0.0998 to 0.1273. Passed the minimal non-regression check but missed the business target. |
| 15 | Added hierarchical history features and removed planning-only capacity/replenishment fields from the demand model. | 1,953,276 output rows; 48,810 tuning examples, 48,791 eligible; 74,575 internal examples retained; 98.9% long-history coverage; 85 approved inputs; 8 planning-only fields excluded. |
| 16 | Tuned a hierarchical residual/reconciliation model on the development tuning origin. | Selected residual weight 1.00 and reconciliation weight 0.50. Store WAPE 0.4599 and network WAPE 0.0982 versus 0.5005 history anchor: 8.1% relative tuning improvement. |
| 17 | Screened AdaBoost and Elastic Net, as suggested by the teacher. | Elastic Net grid: three mixing values × two regularization values. Best was 0.50 / 0.010 with WAPE 0.4502, a 10.0% tuning improvement. Best AdaBoost was about 0.4803 on a deterministic 154,466-row sample. Neither met the target. |
| 18 | Screened three PyTorch embedding residual MLPs on an NVIDIA A10G. | 1,185,804 training rows; 48,791 tuning rows; 24 categorical and 61 numeric inputs. Removing early stopping and running 40 epochs did not improve beyond approximately 0.433 WAPE. Later epochs flattened or worsened, so training duration is not the main bottleneck. |
| 19 | Ran the store-allocation attainability diagnostic using only the development tuning origin. | History anchor WAPE 0.5005. Best feasible top-down candidate was seasonal network total + 12-block store share at 0.4595. Even a perfect network-SKU total + best lagged store share produced 0.4452, while a known total + perfect future store share produced 0.1022. Historical store shares are the primary limit. Internal and sealed access: 0. |
| 20 | Ran a two-stage dynamic store-share GPU screen using development data only. | Best candidate: `384×192×96`, epoch 10 after all 24 epochs ran, with a 75% anchor / 25% seasonal network total. Oracle-total allocation WAPE was 0.4236 and feasible WAPE was 0.4375: 12.6% better than the 0.5005 history anchor, but slightly worse than Step 18's 0.4331 and well above the 0.35 target. Internal and sealed access: 0. |
| 21 | Prepared a development-only stochastic noise-ceiling audit before training another architecture. | The audit calculates an optimistic Poisson WAPE floor at store-SKU/28-day, 56-day, store/category and network aggregation levels, plus velocity, intermittency, promotion and category segments. It uses only the 48,791 frozen development-tuning examples. Execution results are pending; internal validation and sealed access remain 0. |

Step 19 execution note: the first Cell 2 run on 6 October failed before producing diagnostic metrics because `.cache()` requested `PERSIST TABLE`, which Databricks Serverless Spark Connect does not support. Both persistence calls were removed and the corrected notebook completed on 8 October in about one minute. This compatibility failure did not access internal validation or sealed outcomes.

The three neural candidates were `256×128` (dropout 0.10, learning rate 0.001), `384×192×96` (dropout 0.15, learning rate 0.0007) and `256×256×128` (dropout 0.05, learning rate 0.0005). The best observed tuning WAPE of approximately 0.433 represents about 13.5% improvement over the 0.5005 history anchor, or about 56.7% on the `1 - WAPE` display. These development results are useful for diagnosis but are not final model evidence.

No sportswear candidate has been promoted. Step 19 shows that the network-SKU total is not the main obstacle: with actual future store shares, the known network total reaches WAPE 0.1022. Lagged store shares remain above WAPE 0.445 even when given the perfect future network total. The next candidate therefore needs a dynamic store-share model, with separate treatment of sparse series, followed by reconciliation to the network total. This diagnosis does not prove that WAPE ≤0.35 is guaranteed; it identifies the component that must improve before another governed evaluation.

Step 20 implemented that design as a development screen. It added normalized recent, seasonal and 3/6/12-block store-share priors to the approved feature set; trained store/SKU embedding networks with allocation-WAPE, share-divergence and occurrence losses; and reported overall plus velocity, intermittency, promotion and category segments. The model improved the simple Step 19 feasible top-down result from 0.4595 to 0.4375 and reduced the perfect-total allocation error from 0.4452 to 0.4236, but it did not beat the direct Step 18 neural result or pass the development gate. Segment WAPE was 0.4350 for Apparel, 0.4417 for Shoes, 0.4159 for stable series, 0.6260 for intermittent series and 0.4835 for sparse series; each improved its history anchor, but intermittency remains especially difficult. Further architecture tuning is paused pending a development-only noise-ceiling audit of the synthetic store-SKU targets. Internal validation and sealed outcomes remain excluded.

Step 21 is an attainability audit rather than a forecast candidate. Because the synthetic generator draws demand from a Poisson process, realized demand differs from its conditional mean even under a theoretically perfect forecast. The audit uses the frozen tuning targets to calculate an intentionally optimistic, target-derived lower bound for this random error. A lower bound above WAPE 0.20 would rule out an honest 80% `1 - WAPE` display at that reporting grain; a lower bound below 0.20 would show only that the goal is statistically plausible, not that the current model can achieve it. Target-derived values are diagnostic only and can never become model inputs or production predictions.

### Optional research commands

```bash
python3 -m venv .venv
.venv/bin/pip install -r ml/requirements.txt

# Smoke import, then the pinned full subset
.venv/bin/python ml/pipeline.py ingest --smoke-test
.venv/bin/python ml/pipeline.py ingest --stores 70 --revision 08c1fab7f9257bc73679d415d65d644165d351d4

# Train a candidate; this never promotes it
OMP_NUM_THREADS=4 LOKY_MAX_CPU_COUNT=4 .venv/bin/python ml/pipeline.py train --source freshretailnet
.venv/bin/python ml/pipeline.py evaluate --version MODEL_VERSION

# Independent synthetic research path
.venv/bin/python ml/pipeline.py offline
OMP_NUM_THREADS=4 LOKY_MAX_CPU_COUNT=4 .venv/bin/python ml/pipeline.py train --source offline

# Regenerate only the small grocery fixture
npm run demo:data
```

Replace `MODEL_VERSION` with a locally generated version. Public-source access worked without a token during verification; optional `HF_TOKEN` belongs in the environment. The source card identifies CC BY 4.0; attribution and transformations are documented in the data card.

## 8. Model governance and integration APIs

Model health provides metrics, artifact verification, approval/rejection, activation and rollback. Approval and activation are separate authenticated human actions. Promotion gates include non-regressing WAPE against both baselines and any comparable champion, absolute relative bias ≤20%, coverage ≥98%, fallback ≤2%, sufficient test cases, passing data/inference checks and zero allocation violations. A failed gate cannot be overridden by the copilot.

Monitoring can evaluate a referenced local outcome batch for forecast error, bias, interval coverage, fallback and segments. Without outcomes it reports insufficient evidence; no real post-deployment results are available.

| API area | Main routes |
|---|---|
| Health and validation | `/api/v1/health`, `/api/v1/validate` |
| Data/model jobs | `/api/v1/ingest`, `/api/v1/training`, `/api/v1/jobs/{id}` |
| Planning and decisions | `/api/v1/runs`, `/api/v1/runs/{id}`, `/override`, `/decision`, `/shipping` under a run |
| Model review and monitoring | `/api/v1/models`, `/api/v1/models/{id}`, `/api/v1/monitor` |

The [OpenAPI specification](docs/openapi.json) and [n8n integration contract](docs/n8n_integration_contract.md) describe payloads, polling, errors, authentication and retries. **No n8n workflow, scheduler or external application connection is configured.** Legacy `/api/recommend` and `/api/approve` return 410. The old export/next-day endpoints are informational; use approved-run shipping and the automatic approval simulation loop.

Local browser use obtains a same-origin planner session. Administrator mutations require a separate key. Configure `FLOWSTOCK_API_TOKEN`, `FLOWSTOCK_ADMIN_TOKEN` and `FLOWSTOCK_AUTH_MODE=required` for authenticated API clients. Otherwise the local instance generates private keys in `.flowstock/access.json`. This is local-demo access control, not production identity management.

## 9. What is still missing

| Area | Current limit / next work |
|---|---|
| Real operational data | Replace mock CSVs with validated ERP/POS/WMS feeds and reconciled stock/order balances. |
| Business Central synchronization | Connection testing and standard endpoint discovery are implemented. Complete sales/purchase line extraction, solve location-SKU inventory access, define missing planning defaults and materialize a validated Flowstock snapshot. |
| Capacity assumptions | Validate store/SKU/category capacities, receiving limits, case packs and delivery calendars with a planner. |
| Sportswear forecasting | Databricks baselines and GBT, Elastic Net, AdaBoost and PyTorch candidates are documented above. Best development-tuning WAPE remains approximately 0.433, short of the ≤0.35 target. Step 20's dynamic shares reached 0.4375 and did not pass. Run the prepared Step 21 stochastic noise-ceiling audit before choosing another architecture or changing the reporting grain; do not access internal validation or sealed outcomes yet. |
| Optimization | Benchmark the greedy allocator against a solver; add explicit holding-cost, logistics-cost and service trade-offs if required. Global optimality is not guaranteed. |
| Arrival and inventory timing | Replace uniform demand and aggregate transit assumptions with dated arrivals and time-phased inventory/capacity calculations. The current capacity check does not assume sales will create space before delivery. |
| Simulation realism | Add realistic demand uncertainty, calendar/promotion rollover, richer order states, returns and supply arrivals. Daily forecast adjustment is a simple simulation rule. |
| Perishability | Grocery shelf-life metadata is descriptive; expiry, waste and substitution are not optimized. |
| Business validation | Run a controlled pilot and measure realized service, inventory, margin and planner effort. Current improvements are simulated. |
| Performance and usability | Optimize large snapshot transfer and rendering; add full table pagination/virtualization, richer filters and clearer dataset-specific history/forecast diagnostics. |
| Durable operations | Add transactional persistence, robust recovery for interrupted jobs/partial approvals, backups and concurrent-user support. Local file locks are not a distributed queue. |
| Production security | Add user accounts/SSO, roles, deployment hardening, credential management and tamper-resistant audit storage. |
| Automation | Implement and test n8n workflows, scheduled refresh/training/monitoring and real outcome ingestion. APIs alone do not provide this automation. |
| Deployment and delivery | Establish hosted deployment, CI checks, dependency maintenance and a release process. |
| Capstone evidence | Complete client-specific discovery, baseline KPIs, costs/ROI assumptions, adoption and change-management plan, pilot evaluation and the final consultancy presentation. |

A failed or interrupted approval can leave a snapshot reserved while outputs are incomplete. Review the local audit and files before recovery; do not blindly delete locks or consumed-inventory records to retry. Approval is conservative about duplicates but is not an atomic database transaction.

## 10. Architecture and verification

The web application uses Next.js, React, TypeScript and Tailwind. Node handles CSV loading, allocation, approval and file outputs. Python is a batch research tool, not a second web service. No database is required for the prototype.

```text
src/components/           # planner, KPI cards, explanations, model review
src/lib/domain/           # CSV joins, constraints, allocation, simulation
src/lib/server/           # authenticated runs, jobs, model registry, audit
src/app/api/              # browser and versioned integration endpoints
config/                   # objective weights and promotion gates
ml/                       # reproducible grocery research pipeline
tests/                   # domain, integration, pipeline and browser checks
docs/                    # data/model cards, contracts and investigation notes
```

Run checks from the project folder:

```bash
npm test
npm run typecheck
npm run lint
npm run format:check
npm run build

# Python checks require the optional Python environment above
npm run test:python

# Browser checks use separate state, outputs and port 3100
npx playwright install chromium
npm run test:browser

# Optional: requires previously imported/trained local artifacts
FLOWSTOCK_LIVE_TEST=1 npm test -- tests/liveData.test.ts
```

Latest verified application checks: **30 TypeScript tests**, **6 Python tests**, **5 browser journeys**, type checking, ESLint, configured formatting and production build. The optional imported-data test is skipped in the standard suite. Browser checks cover data-source isolation, sportswear plan generation and the screenshot's zero-quantity explanation, authentication/idempotency, overrides, approvals, shipping and next-day refresh. Production build currently emits an advisory that the Next-specific ESLint plugin is not configured; the project's explicit lint checks run.

### Further documentation

- [Sportswear restoration, capacity corrections and UI investigations](docs/sportswear_restoration.md)
- [Architecture, assumptions and recovery](docs/architecture.md)
- [Implementation handover — includes historical grocery results](docs/implementation_report.md)
- [Complete data/domain audit](docs/data_domain_audit.md)
- [FreshRetailNet data card and attribution](docs/data_card_freshretailnet.md)
- [Business Central discovery and field-gap report](docs/business_central_discovery.md)
- [Field mapping](docs/data_mapping.md) and [research data contract](docs/data_contract.json)
- [Model card](docs/model_card.md) and [evaluation results](docs/evaluation_results.json)
- [OpenAPI specification](docs/openapi.json) and [n8n contract](docs/n8n_integration_contract.md)

This README describes current behavior. Earlier briefs and research documents retain historical scope; the active default is sportswear with one recommended plan.
