# Flowstock upgrade handover — 22 September 2026

> Subsequent update: the default dataset has been restored to sportswear. See [sportswear restoration](sportswear_restoration.md) for the corrected working copy and current results. The grocery implementation/evaluation below is retained as historical evidence.

## Outcome

The active POC now represents fresh-grocery retail and creates one constrained recommended plan per run. No commits were made. No real candidate was promoted or rejected on the user's behalf. Legacy data is retained outside active grocery routes, and no n8n workflow/instance was created.

## Architecture and changed files

The existing Next.js/React/TypeScript/Tailwind web application remains the single service. Python is a batch tool for Parquet preparation and scikit-learn CPU models, not another web server. Local CSV, JSON model/run records, checksums, atomic writes, inventory reservations and append-only audit events support this single-user POC.

Added: `ml/grocery.py`, `ml/pipeline.py`, pinned Python requirements, objective/gate configuration, `src/lib/server/*`, `/api/v1/[...path]`, session endpoint, single-plan allocator, data validator, availability calculations, recommended-plan and model-health components, independent grocery CSV fixture, API/data/model cards, examples and automated tests.

Changed: workspace, row evidence, table, KPI calculations, joins, approval/shipping/simulation handling, CSV parser, paths, package scripts, README and ignores. Removed active three-scenario engine/selector/comparison components. Existing unrelated copilot and KPI work was retained and integrated. See data_domain_audit.md for the complete dataset/fixture/generator review.

## Start the platform

From the project directory:

```bash
npm run dev
```

Open the address printed in Terminal (normally http://127.0.0.1:3000). Dependencies are installed in this workspace. A new checkout first needs `npm install`. The offline UI works without model API keys or a running Python service.

## Exact data, model and verification commands

```bash
# New-machine Python setup only
python3 -m venv .venv
.venv/bin/pip install -r ml/requirements.txt

# Real source smoke import, then reproducible full subset
.venv/bin/python ml/pipeline.py ingest --smoke-test
.venv/bin/python ml/pipeline.py ingest --stores 70 --revision 08c1fab7f9257bc73679d415d65d644165d351d4

# Train/evaluate a candidate; this never promotes it
OMP_NUM_THREADS=4 LOKY_MAX_CPU_COUNT=4 .venv/bin/python ml/pipeline.py train --source freshretailnet

# Inspect the verified final real-data evaluation without retraining
.venv/bin/python ml/pipeline.py evaluate --version model-20260922T184234546500

# Independent offline model demonstration
.venv/bin/python ml/pipeline.py offline
OMP_NUM_THREADS=4 LOKY_MAX_CPU_COUNT=4 .venv/bin/python ml/pipeline.py train --source offline

# Recreate committed grocery fixture
npm run demo:data

# Verification
npm test
npm run test:python
npm run typecheck
npm run lint
npm run format:check
npm run build
npm run test:browser
FLOWSTOCK_LIVE_TEST=1 npm test -- tests/liveData.test.ts
```

Fresh machines need `npx playwright install chromium` for browser tests. Full tests use offline fixtures; the final command is optional and requires already-imported local artifacts. No Hugging Face token was required by the public source during verification. Optional credentials stay in local environment files.

## Observed source, subset and dates

Verified repository: Dingdong-Inc/FreshRetailNet-50K. Pinned revision: `08c1fab7f9257bc73679d415d65d644165d351d4`. Licence verified as CC BY 4.0 in the retrieved dataset card; attribution and modifications are documented in data_card_freshretailnet.md.

The source schema contains encoded city/store/product/hierarchy IDs; date; normalized daily/hourly sales; stockout count/hourly status; discount, holiday/activity and weather fields. The manifest records exact names and types. Original encoded relationships and normalized amounts remain in Parquet. No source category/product semantic names or physical unit counts are inferred.

Selection: 70 stores, 556 products, 8,509 store-product series and 765,810 training-file daily rows. The publisher's separate eval split contributes 59,563 preserved rows for selected stores, kept separate because its seven-day horizon does not cover the current fourteen-day target.

- Training: 2024-03-28 through 2024-05-26.
- Validation: 2024-05-27 through 2024-06-10.
- Held-out test: 2024-06-11 through 2024-06-25.

The conservative exclusion of stockout-affected training horizons leaves 5015 complete training examples; validation and test each contain 17,018 horizon examples. This substantial exclusion is a limitation, not proof of uncensored demand recovery.

## Forecast and ranking evidence

Final real-data candidate: `model-20260922T184234546500`.

| Held-out metric | ML | Seasonal baseline | Moving-average baseline |
|---|---:|---:|---:|
| WAPE | 22.31% | 20.78% | 20.34% |
| MAE, normalized sales | 3.7982 | 3.5379 | 3.4640 |
| Mean error, normalized sales | −2.3855 | −1.1026 | −1.1340 |

ML relative bias: −14.01%. Empirical interval coverage: 85.30% for the nominal 90% validation-residual range. Prepared-snapshot scoring coverage: 100%, fallback: 0%; the runtime still uses baseline because no ML candidate is approved. Store/product/category/volume/stockout segments are retained in local reports.

Proxy ranking NDCG@5: 0.997966 challenger versus 0.994931 baseline across 692 eligible product-date groups. A 1% change to the lagged seven-day mean changes predicted proxy score by 0.001227 on average. This semi-synthetic target uses synthetic inventory, case packs and margins; it is not an observed allocation-profit label. The challenger remains diagnostic because the combined forecast candidate fails its accuracy gate.

The independent synthetic model run was also completed: its ML WAPE is 4.92% versus 6.07% moving-average and 7.20% seasonal. These are fixture results only and cannot support a claim of real-data improvement.

## Simulated single-plan results

The final imported snapshot produced one plan across all 8,509 rows with **zero shipment constraint violations**.

- Synthetic DC quantities: available 941,861, allocated 42,000, residual 899,861.
- Simulated expected margin: EUR 128,323.86.
- Projected forecast fulfilment: 25.00% → 27.89%.
- Unmet 90% service target: 62.11 percentage points, explicitly disclosed with underserved rows.

These numbers describe one synthetic operational overlay of historical grocery patterns. They are not realized revenue, causal margin recovery or client ROI. The model review API also compares constrained ML and baseline simulations.

## Objective, controls and migration

`balanced-v1`: 0.5 normalized expected incremental margin + 0.5 normalized shortage reduction. Denominators are total recoverable margin and shortage in the input. Pack opportunities towards the 90% service target are considered first, then weighted marginal contribution. Equal scores break by store ID, SKU ID and pack ordinal. DC availability is a hard cap, along with complete cases, eligibility, lifecycle, shipment limits, store-product/category/receiving capacities, delivery horizon and optional budget. Binding adjustments are attached to rows.

This deterministic greedy heuristic has **no global-optimality certificate**. It returns a feasible plan and reports unmet service; it does not assert that every infeasible target has been mathematically proven impossible. Model scores never bypass constraints.

New run/approval schemas have no scenario selector. Old `/api/recommend` and `/api/approve` return 410 and direct clients to run APIs. Legacy CSVs and old scenario history fields remain read-only compatibility material outside active data roots. Approved inventory cannot be reused through a new model version. Next-day packages are versioned by approval ID rather than overwriting an existing branch.

## Registry and promotion gates

Actual champion: `deterministic-v1`. Real and synthetic trained artifacts remain candidates. Current real-data candidate fails the accuracy gate; no model was promoted.

Fixed gates (`gates-v1`): non-regressing WAPE against both baselines and any comparable champion, absolute relative bias ≤20%, coverage ≥98%, fallback ≤2%, at least 20 test cases, passing data/inference checks and zero allocation violations. Artifact hashes are checked. Explicit authenticated human approval is required before a separate activation action; rollback only accepts previously approved versions. The local administrator key is private and was not printed or committed.

## Future n8n endpoints

`/api/v1/health`, `/validate`, `/ingest`, `/training`, `/jobs/{id}`, `/runs`, `/runs/{id}`, `/runs/{id}/override`, `/runs/{id}/decision`, `/runs/{id}/shipping`, `/models`, `/models/{id}`, `/monitor`.

OpenAPI schemas, examples, authentication assumptions, polling/retry and idempotency rules are in openapi.json and n8n_integration_contract.md. No workflow JSON was exported.

## Verification and practical limits

Passing checks: 22 TypeScript/domain/integration tests, 6 Python data/leakage tests, 4 browser/API journeys, and the optional full imported-data verification. TypeScript checking, ESLint, configured Prettier checks and production build pass. The build emits an advisory that the Next-specific ESLint plugin is not configured; the explicit project lint checks do run. No pre-existing failing test was concealed. Live conversational API calls were not used for validation.

Limits: single local process/filesystem queue; interrupted running jobs/partial approval writes require operator review; synthetic grocery labels and commercial assumptions; historical normalized/censored data; descriptive shelf-life metadata, not expiry optimization; uniform demand and aggregate in-transit timing; prepared-snapshot inference rather than a realtime model service; no real post-deployment outcomes. Monitoring reports insufficient evidence unless a referenced outcome batch is supplied. Authentication is local-demo planner identity plus a separate administrator secret, not production SSO.

## Customer demo checklist

1. Open the platform and choose Offline grocery demo or the latest prepared FreshRetailNet snapshot.
2. Generate the single plan; point out margin/service trade-off, stock reconciliation and unmet target.
3. Open a row; distinguish historical source patterns, synthetic product identity, model forecast and deterministic fallback.
4. Edit a quantity and add the required reason; demonstrate a blocked invalid case.
5. Approve valid rows, confirm, create/download shipping CSV, then Refresh to the next simulated day.
6. Open Model health; show the real candidate's failed accuracy gate and explain why baseline stays active.

A sanitized approved independent-fixture shipping example and API payloads are in `docs/examples/`. No commit has been made; the project owner should review the running platform first.
