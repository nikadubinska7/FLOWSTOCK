# Databricks AI platform runbook

## What is implemented

Flowstock V3 has three separate responsibilities:

1. **AI demand forecast** — a Spark GBT model predicts the next 28 days for each ranged store-SKU from lagged sales and known-at-origin retail signals.
2. **AI store ranking** — a second Spark GBT model estimates marginal demand value for each store-SKU. The planner uses this score when DC stock is scarce.
3. **AI orchestration** — a scheduled, idempotent API operation synchronizes the published Delta snapshot, validates the complete planning contract and creates one recommended plan.

The AI outputs propose demand and priority. Fixed rules still enforce assortment, DC free stock, packs, store-SKU capacity, category capacity, receiving capacity and approval controls.

## Data and evaluation design

The V3 generator creates 104 weekly observations for the existing 70-store, 720-SKU, 34,268-assortment network. Its learnable signals are stable store/product effects, season, planned promotions, lifecycle, trend and retail-event weeks. Small deterministic measurement noise keeps the history realistic without recreating V2's irreducible sparse Poisson floor.

The forecast features contain only lagged observations, static attributes and future-known calendar/promotion values. Training, validation and holdout are chronological. The ranking model trains on earlier periods and is evaluated on the forecast holdout. The notebook stops before publishing when a gate fails.

Acceptance gates:

| Gate                                                 | Required |
| ---------------------------------------------------- | -------: |
| Forecast holdout WAPE                                |   ≤ 0.20 |
| Relative improvement over moving average             |    ≥ 10% |
| Ranking top-20% value capture versus oracle ordering |    ≥ 90% |

These are target thresholds until a Databricks run produces evidence.

## First Databricks run

1. Import and run the private notebook `databricks_notebooks/15_build_v3_ai_platform.py` on Serverless compute.
2. Wait for `FLOWSTOCK V3 AI PLATFORM PASSED`.
3. Save the displayed forecast WAPE, baseline WAPE, relative improvement and ranking capture in `README.md`.
4. Confirm these tables exist in `workspace.default`:
   - `flowstock_v3_weekly_sales`
   - `flowstock_v3_model_metrics`
   - `flowstock_app_snapshot_manifest`
   - the 16 `flowstock_app_*` planning-contract tables
5. Confirm the two Spark models are saved below `/Volumes/workspace/default/flowstock_raw/models/flowstock_v3_gbt_4w_20261009` and the MLflow run exists under `/Shared/flowstock-v3-ai-platform`.

## Flowstock connection

Create a SQL warehouse and grant the application principal `CAN USE` on it plus `SELECT` on the serving tables. Configure the application with:

```text
DATABRICKS_HOST=<workspace hostname without https://>
DATABRICKS_WAREHOUSE_ID=<SQL warehouse ID>
DATABRICKS_CLIENT_ID=<service-principal application ID>
DATABRICKS_CLIENT_SECRET=<service-principal OAuth secret>
DATABRICKS_CATALOG=workspace
DATABRICKS_SCHEMA=default
DATABRICKS_APP_TABLE_PREFIX=flowstock_app
FLOWSTOCK_DATABRICKS_RUNS_DIR=<persistent writable directory>
```

For a short local test, `DATABRICKS_TOKEN` can replace the OAuth client settings. Do not commit credentials.

In Flowstock:

1. Select **Databricks sportswear V3**.
2. Click **Test connection**.
3. Click **Sync data**.
4. Confirm 34,268 rows load and the snapshot date is 2026-06-30.
5. Generate the recommended plan.
6. Confirm the run audit reports 34,268 model-forecast rows and 34,268 learned-ranking rows.
7. Exercise manual override, approval, shipping CSV and next-day refresh.

## Nightly operation

Schedule an authenticated POST to:

```text
/api/v1/orchestration/nightly
```

Use the administrator token. The operation synchronizes the newest published snapshot, validates it, and creates one idempotent plan per snapshot. Repeated calls for the same snapshot return the existing run. Approval remains a human decision.

## Deployment conditions

The host needs persistent writable storage for `.flowstock`, Databricks materialized snapshots and generated approval/shipping outputs. A stateless serverless host will lose those files. Deployment is ready only after the production build, connector test, first sync, generated plan, approval/shipping test and restart-persistence test all pass in the hosted environment.
