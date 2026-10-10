# Databricks AI platform runbook

## What is implemented

Flowstock V3 has three separate responsibilities:

1. **AI demand forecast** — the selected PyTorch store/SKU embedding MLP predicts the next 28 days for each ranged store-SKU from learned entity representations, lagged sales and known-at-origin retail signals.
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

The forecast comparison has passed: the selected MLP scored held-out WAPE 0.0249 on 274,144 later rows. Spark GBT scored 0.0448, ElasticNet scored 0.0680 and the declared synthetic legacy proxy scored 0.3399 on those same rows. The separate ranking GBT achieved 99.1% top-20% value capture and passed its 90% gate.

## First Databricks run

1. Import the private notebook `databricks_notebooks/17_deploy_v3_mlp_ranking_serving.py`.
2. Run Cells 1–2 on Serverless GPU Small. Wait for 1,248,949 training, 274,144 holdout and 34,268 planning predictions.
3. Switch to Serverless CPU and run Cell 3. Serverless Spark model logging must use a Unity Catalog Volume temporary directory, currently `/Volumes/workspace/default/flowstock_raw/models/flowstock_v3_pytorch_embedding_mlp_20261010/mlflow_tmp`.
4. If Cell 3 reaches the 99.1% ranking result and fails only at `mlflow.spark.log_model`, run the documented logging-only recovery. Do not retrain: the planning scores, pipeline and deployment metrics already exist.
5. Run Cell 4 only after the complete ranking MLflow run exists. Wait for `FLOWSTOCK V3 MLP + AI RANKING SNAPSHOT PUBLISHED`.
6. Save the displayed ranking capture and serving result in `README.md`.
7. Confirm these tables exist in `workspace.default`:
   - `flowstock_v3_weekly_sales`
   - `flowstock_v3_forecast_model_comparison_ranked`
   - `flowstock_v3_deployment_metrics`
   - `flowstock_app_snapshot_manifest`
   - the 16 `flowstock_app_*` planning-contract tables
8. Confirm the selected MLP checkpoint and ranking model exist below `/Volumes/workspace/default/flowstock_raw/models/`, and confirm the forecast and ranking MLflow runs exist under `/Shared/flowstock-v3-ai-platform`.

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
