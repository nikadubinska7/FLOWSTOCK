# Flowstock comprehensive technical summary

**Status date:** 10 October 2026  
**Purpose of this document:** factual source material for an LLM or human creating a presentation deck. It is intentionally detailed and should not be treated as finished slide copy.

## 1. Rules for interpreting the evidence

1. Keep the three dataset stages separate. Results from one dataset must not be attributed to another.
2. Dataset 3 is referred to technically as **Flowstock V3**. It is the regenerated and enriched successor to Flowstock V2, created because V2 could not support the required store-SKU accuracy. Calling both datasets “V2” would make the model results ambiguous.
3. WAPE is:

   ```text
   WAPE = sum(abs(actual - forecast)) / sum(actual)
   ```

   Lower is better. The project sometimes displays `1 - WAPE` as an intuitive percentage. That display is useful for communication but is not a universal definition of forecast accuracy and changes materially with aggregation level.

4. The Flowstock V3 data and all reported commercial impacts are synthetic or simulated. The results prove that the technical workflow operates on a learnable dataset; they do not prove realized client revenue, margin or production performance.
5. The final comparison between Spark GBT, ElasticNet and the PyTorch embedding MLP is fair because all three use the same target, chronological split and later holdout rows.
6. The 66.0% baseline in the final comparison is a declared **synthetic legacy category-rate proxy**. A stronger four-week moving-average benchmark also exists and must be disclosed separately. The legacy proxy must not be presented as the best possible non-ML forecast.
7. AI produces the demand forecast and store-priority score. Fixed rules continue to enforce DC availability, assortment, pack/MOQ, capacities, lifecycle, delivery horizon and human approval.

---

## 2. Business problem and intended operating model

Flowstock is an AI-assisted DC-to-store replenishment planning platform for a sportswear retail network. The target operating model is:

- one central distribution centre;
- 70 retail stores;
- fixed store assortment;
- daily planning with weekly store deliveries;
- store-SKU demand forecasts;
- priority ranking when DC stock is scarce;
- constrained allocation respecting physical and business limits;
- planner review, manual overrides and explicit approval;
- shipping-document creation and a simulated next-day planning package.

The planner sees two states:

- **Current State:** store stock plus transit, forecast shortage, lost-sales risk, OOS risk and DC free stock before a recommendation;
- **Simulation:** the projected position after the system recommendation and any manual edits.

The system produces one recommended plan. It does not ask the user to choose among multiple competing model outputs. The planner may edit `Final Qty`, but a changed quantity requires a comment and is revalidated before approval.

---

## 3. Current technical solution

### 3.1 Application architecture

The application is a local-first web prototype built with:

- Next.js;
- React;
- TypeScript;
- Tailwind CSS;
- Node.js API routes;
- CSV packages and local JSON records for prototype persistence;
- Databricks Delta serving tables accessed through a Databricks SQL warehouse;
- PyTorch for the selected embedding forecast model;
- Spark ML for GBT and ElasticNet forecast challengers and for the store-ranking model;
- MLflow for experiment/model logging.

The Next.js application is the only web service. Databricks performs model training, scoring and serving-table publication. The application synchronizes an immutable Databricks snapshot into the same CSV contract used by the planning engine.

### 3.2 End-to-end data and decision flow

```text
Historical sales and retail attributes
        ↓
Databricks feature preparation
        ↓
PyTorch store/SKU embedding demand forecast
        ↓
Spark GBT store-priority score
        ↓
Published flowstock_app_* Delta tables and snapshot manifest
        ↓
Flowstock Databricks connector and local immutable snapshot
        ↓
Constrained marginal-pack allocation
        ↓
Planner review, override and validation
        ↓
Approval and shipping CSVs
        ↓
Next simulated planning-day package
```

### 3.3 Databricks serving integration

The deployed V3 snapshot is published under the `flowstock_app_*` Delta-table contract. The immutable serving snapshot ID is `2026-06-30`.

The connector has successfully:

- authenticated to Databricks;
- read the published snapshot manifest;
- verified 70 stores and 720 SKUs;
- synchronized all 34,268 ranged store-SKU planning rows;
- reproduced nonzero Current State KPIs in the actual Flowstock application.

Credentials are held only in ignored local environment configuration. For a production deployment, the personal access token used for the short local test should be replaced with service-principal OAuth and managed secrets.

### 3.4 Forecast component

The selected forecast is a PyTorch neural network with learned store and SKU embeddings plus numeric demand/history and future-known retail features. It predicts four-week demand at store-SKU level.

The selected configuration is:

- architecture: `384 × 192 × 96` hidden layers;
- learned store and SKU representations;
- learning rate: `0.0007`;
- selected epoch: 15;
- validation WAPE: 0.0239;
- held-out WAPE: 0.0249;
- held-out `1 - WAPE` display: 97.5%;
- held-out forecast bias: -0.0024;
- planning rows scored: 34,268.

The model checkpoint and inference outputs were persisted. Historical training/holdout predictions and all planning-origin predictions were generated before the serving snapshot was published.

### 3.5 Store-ranking component

A separate Spark GBT estimates marginal demand value for each store-SKU. Its purpose is to rank which stores should receive the next available units when a SKU has insufficient DC stock to cover every store.

The ranking model:

- is distinct from the demand-forecast model;
- trains on earlier periods;
- is evaluated on the later forecast holdout;
- scores all 34,268 planning rows;
- achieved 99.1% top-20% value capture;
- passed the predefined 90% acceptance gate;
- is logged in MLflow.

“Top-20% value capture” means that the top fifth of rows chosen by the model captures 99.1% of the total evaluation target value captured by an oracle ordering. Because the evaluation data is synthetic, this is evidence of ranking fidelity to the synthetic target, not realized causal profit.

### 3.6 Allocation and optimization component

The active plan is created by a deterministic constrained marginal-pack allocator. Its objective weights are:

| Objective input           | Weight |
| ------------------------- | -----: |
| Expected margin recovery  |    40% |
| Service/shortage recovery |    40% |
| Learned AI ranking        |    20% |

Additional configuration:

- service floor: 90%;
- planning horizon: 14 days;
- no active budget cap;
- deterministic tie-break: learned rank followed by store ID and SKU ID.

The algorithm creates pack-level opportunities, ranks them by normalized margin, service and learned-ranking contribution, and allocates while resources remain. It produces a feasible plan but has no mathematical global-optimality certificate.

Hard controls take precedence over the AI scores:

- DC free stock by SKU;
- store-SKU assortment;
- SKU replenishable and lifecycle status;
- pack multiple/MOQ;
- store-SKU capacity;
- store-category hard capacity;
- store receiving capacity;
- minimum and maximum shipment;
- delivery within the planning horizon;
- blocker-level data-quality issues;
- optional budget if configured.

Warnings remain visible for conditions such as low forecast confidence and soft-capacity exceedance.

### 3.7 Current KPI formulas

Key calculations include:

```text
Current store inventory value
= sum((stock on hand + in transit) × unit cost)

Projected store inventory value
= sum((stock on hand + in transit + final quantity) × unit cost)

Current lost-sales risk
= sum(max(0, forecast next 14 days - stock on hand - in transit)
      × selling price)

Projected lost-sales risk
= sum(remaining forecast shortage × selling price)
```

Inventory is valued at cost. Lost-sales risk is valued at retail selling price. These KPIs use different monetary bases and must be labelled accordingly.

### 3.8 Current operational snapshot

After correcting the initial uniform stock-cover assumption, the active V3 snapshot has:

| Current State KPI            | Verified value |
| ---------------------------- | -------------: |
| Planning rows                |         34,268 |
| Rows with 14-day demand risk |         18,459 |
| Inventory value at cost      |    €16,821,234 |
| Days of cover                |           13.5 |
| Demand-weighted OOS risk     |          13.2% |
| Lost-sales risk at retail    |     €4,890,743 |
| Margin at risk               |     €2,578,895 |
| DC free stock                |  351,618 units |

The first generated balanced plan produced:

| Plan result                          | Verified value |
| ------------------------------------ | -------------: |
| Recommended transfer                 |   71,800 units |
| Rows with positive recommendations   |         11,766 |
| DC free stock after recommendation   |  279,818 units |
| Projected store inventory at cost    |    €19,540,046 |
| Increase in store inventory at cost  |     €2,718,811 |
| Lost-sales risk after recommendation |       €887,548 |
| Simulated retail revenue protected   |     €4,003,195 |
| Service before recommendation        |          86.8% |
| Service after recommendation         |          97.4% |
| Shipment constraint violations       |              0 |

The €2.719m increase is an internal transfer from DC to stores, not newly purchased company inventory. The same 71,800 units are deducted from DC free stock.

Pack/MOQ rounding is a material issue in this plan:

- 46,599 units directly cover the calculated 14-day shortage;
- 25,201 units are above immediate row-level shortage because small needs are rounded to complete packs;
- the rounding surplus costs €836,551;
- approximately 35% of transferred units are therefore rounding surplus.

This does not violate the current hard constraints, but it demonstrates the need for an explicit holding-cost or minimum-benefit threshold in a future optimizer.

### 3.9 Planner workflow already implemented

The application supports:

- refresh and data-source/snapshot selection;
- current and simulated KPI panels;
- one recommended plan;
- filtering and row-level explanations;
- AI forecast, AI ranking and automated-orchestration provenance;
- manual Final Qty editing;
- mandatory comments for manual overrides;
- immediate KPI recalculation;
- constraint blocking and warnings;
- approve selected rows or all valid visible rows;
- approval confirmation summary;
- route/date/store shipping-document CSVs;
- next-day package simulation;
- run history;
- model-health and monitoring APIs;
- export.

### 3.10 AI orchestration

The implemented orchestration endpoint is:

```text
POST /api/v1/orchestration/nightly
```

It automatically:

1. synchronizes the newest published Databricks snapshot;
2. validates the planning contract;
3. creates or retrieves one idempotent run for that snapshot;
4. executes the recommendation engine;
5. records the number of rows with model forecasts and learned ranking scores;
6. writes an audit event and returns the run summary.

Repeated calls for the same snapshot return the same planning run, preventing duplicate recommendations or inventory consumption. Human approval remains mandatory.

The orchestration capability is implemented but is not currently connected to an external scheduler or notification service. It is therefore accurate to describe it as **automated AI orchestration ready to be scheduled**, rather than a fully operated nightly production workflow.

### 3.11 Governance and monitoring

Controls already represented in the prototype include:

- chronological validation and holdout periods;
- predefined forecast and ranking acceptance gates;
- MLflow experiment logging;
- persisted checkpoints and scored outputs;
- immutable serving snapshot manifest;
- model health and inspection endpoints;
- separate human approval and activation actions;
- audit records;
- idempotency protection;
- manual override reasons;
- approval-level constraint validation;
- monitoring calculations for WAPE, MAE, bias, interval coverage, fallback and prediction shift when actual outcomes are supplied.

No real post-deployment outcomes are available yet, so live monitoring correctly reports insufficient evidence until an outcome batch is provided.

---

## 4. AI forecast and ranking journey

## 4.1 Dataset 1 — Microsoft Business Central / CRONUS USA

### What was received and connected

A read-only Microsoft Business Central connection was established using Microsoft Entra service-to-service OAuth.

Verified source:

- environment: Production;
- company: CRONUS USA, Inc.;
- 80 items;
- 3 item variants;
- 826 item-ledger entries;
- 8 defined locations;
- 20 sales-order headers;
- 14 purchase-order headers;
- ledger date range: 1 March 2024 to 1 August 2026.

The tenant also exposes a published OData `ItemLedgerEntries` service containing location code, remaining quantity, unit of measure, lot and expiration fields that are absent from the standard API response.

### Data limitations found

The apparent date range was long, but the usable operational density was too low:

- the latest 90 calendar days contained only 56 ledger entries;
- all 56 recent entries used a blank location;
- 798 of 826 total ledger entries used a blank location;
- only 23 historical entries used MAIN, 2 used WEST, 1 used EAST and 2 used OUT. LOG.;
- several defined locations had no ledger activity;
- the company did not behave like one active DC supplying a network of retail stores;
- no direct store-assortment source was confirmed;
- no store-SKU or store-category capacity source was confirmed;
- promotions, forecast, routes and delivery calendars were not available from the confirmed standard sources;
- sales-order and purchase-order line extraction remained to be completed.

### Decision

The connection itself succeeded, but this dataset could not support meaningful store-SKU forecasting or DC-to-store ranking. Sync and plan generation were therefore deliberately left disabled for Business Central.

The project requested a more comprehensive dataset with:

- materially longer and denser store-SKU sales history;
- active location-level movement;
- a clear DC/store relationship;
- inventory by SKU and location;
- assortment;
- prices and costs;
- promotion/calendar signals;
- open orders and incoming supply;
- capacity and delivery constraints.

### Lesson

Connectivity is not the same as AI readiness. A technically accessible ERP dataset may still lack the history, entity structure, target definition and operational attributes required to train and evaluate a replenishment model.

---

## 4.2 Dataset 2 — Databricks Flowstock V2

### Dataset scope

Flowstock V2 was a large synthetic sportswear dataset designed to support controlled modelling and a sealed evaluation boundary.

| Item                   |                           V2 scope |
| ---------------------- | ---------------------------------: |
| Network                |          1 DC, 70 stores, 720 SKUs |
| Fixed assortment       |      34,268 store-SKU combinations |
| Development period     |           1 July 2024–30 June 2026 |
| Daily development rows |                         25,015,640 |
| Sealed period          |           1 July–28 September 2026 |
| Sealed daily rows      |                          3,084,120 |
| Databricks bundle      | 171 files in 24 monthly partitions |
| Raw Delta tables       |                                 25 |

The bundle excluded generator code, private truth fields and sealed actual outcomes. The sealed 90-day period remained unopened during the development search.

### Feature and training preparation

The pipeline created leakage-controlled daily features and later 28-day supervised examples.

Recorded preparation results included:

- 25,015,640 feature rows;
- 22,572,215 eligible labelled rows;
- 519,242 censored targets;
- initially 69 feature columns and 55 approved model inputs;
- 19 development forecast origins;
- 1,850,472 28-day examples;
- 1,332,201 model-eligible examples;
- later hierarchical preparation with 85 approved inputs;
- planning-only capacity/replenishment fields excluded from the demand model.

### Baselines and grain diagnosis

Early evaluation showed a major difference between network and store allocation accuracy:

| V2 benchmark                     |   WAPE | `1 - WAPE` display |
| -------------------------------- | -----: | -----------------: |
| Balanced blend, all stores       | 0.5200 |              48.0% |
| High-volume store-SKU            | 0.3979 |              60.2% |
| High-volume network-SKU seasonal | 0.0860 |              91.4% |

The network-SKU result was strong while store-SKU results remained weak. This indicated that predicting total SKU demand was not the main problem; allocating that total across individual stores was the limiting factor.

### Forecast trials

#### Spark GBT residual model

- Internal WAPE: 0.4866 versus 0.5200 baseline.
- Relative improvement: 6.4%.
- High-volume store WAPE: 0.3691.
- High-volume network WAPE worsened from 0.0998 to 0.1273.
- Decision: passed only a minimal non-regression check and missed the business target.

#### Hierarchical residual and reconciliation model

- Selected residual weight: 1.00.
- Selected reconciliation weight: 0.50.
- Store WAPE: 0.4599.
- Network WAPE: 0.0982.
- History anchor: 0.5005.
- Relative tuning improvement: 8.1%.
- Decision: improvement, but still outside the minimum WAPE 0.35 target.

#### AdaBoost and ElasticNet

- ElasticNet grid: three mixing values × two regularization values.
- Best ElasticNet: mixing 0.50, regularization 0.010.
- Best ElasticNet WAPE: 0.4502.
- Relative tuning improvement: 10.0%.
- Best AdaBoost: approximately 0.4803 on a deterministic 154,466-row sample.
- Decision: neither met the target; ElasticNet was not better than the later neural model.

#### PyTorch embedding residual MLP screen

Training setup:

- NVIDIA A10G GPU;
- 1,185,804 training rows;
- 48,791 tuning rows;
- 24 categorical inputs;
- 61 numeric inputs.

Architectures screened:

| Candidate         | Dropout | Learning rate |
| ----------------- | ------: | ------------: |
| `256 × 128`       |    0.10 |        0.0010 |
| `384 × 192 × 96`  |    0.15 |        0.0007 |
| `256 × 256 × 128` |    0.05 |        0.0005 |

The `256 × 128` model produced the best comparable development result:

- tuning WAPE: 0.4331;
- `1 - WAPE` display: 56.7%;
- improvement over the 0.5005 history anchor: approximately 13.5% relative;
- removing early stopping and running 40 epochs did not improve the result; later epochs flattened or worsened.

#### Store-allocation attainability diagnostic

This diagnostic separated network-total forecasting from store-share allocation:

- history anchor WAPE: 0.5005;
- best feasible top-down result, seasonal network total plus 12-block store share: 0.4595;
- perfect future network-SKU total plus best historical store share: 0.4452;
- known network total plus perfect future store share: 0.1022.

Interpretation: even perfect network totals could not overcome poor lagged store shares. Store allocation was the central dataset limitation.

#### Dynamic store-share neural model

The two-stage GPU model used normalized recent, seasonal and 3/6/12-block store-share priors.

- best architecture: `384 × 192 × 96`;
- selected epoch: 10 after all 24 epochs ran;
- network total blend: 75% anchor / 25% seasonal;
- oracle-total allocation WAPE: 0.4236;
- feasible WAPE: 0.4375;
- improvement over history anchor: 12.6%;
- result was still worse than the direct embedding MLP at 0.4331.

Segment WAPE:

- Apparel: 0.4350;
- Shoes: 0.4417;
- stable: 0.4159;
- intermittent: 0.6260;
- sparse: 0.4835.

Intermittent store-SKU demand was especially difficult.

#### Noise-ceiling audit

Before another architecture was trained, an intentionally optimistic target-derived stochastic floor was measured across 48,791 store-SKU/28-day tuning groups.

- optimistic Poisson noise-floor WAPE: 0.4014;
- equivalent `1 - WAPE` display: 59.9%;
- no tested store-SKU segment reached WAPE 0.20;
- top-20% velocity segment: 0.3278;
- medium velocity: 0.4169;
- low velocity: 0.5176;
- stable: 0.3897;
- intermittent: 0.5085;
- sparse: 0.3687.

The target-derived diagnostic was never used as a model input. Its purpose was to determine whether further tuning was statistically justified.

#### Final WAPE-aligned neural trial

The final authorized trial optimized direct absolute error to align training with the WAPE numerator and included an occurrence head for intermittent demand.

- best candidate: `direct_mae_384_192_96`;
- raw WAPE: 0.4341;
- calibrated WAPE: 0.4340;
- it did not beat the earlier embedding MLP at 0.4331.

Final V2 ranking:

| Rank | V2 candidate                                  |              WAPE |
| ---: | --------------------------------------------- | ----------------: |
|    1 | PyTorch embedding residual MLP, Step 18       |            0.4331 |
|    2 | Direct-MAE neural model, Step 22              | 0.4340 calibrated |
|    3 | Dynamic store-share neural model, Step 20     |   0.4375 feasible |
|    4 | ElasticNet, Step 17                           |            0.4502 |
|    5 | Hierarchical residual/reconciliation, Step 16 |            0.4599 |

### Final V2 diagnosis and decision

The model search was stopped because:

- the best result was WAPE 0.4331, below the minimum desired `1 - WAPE` display of 65%;
- the optimistic random-error floor was already near WAPE 0.40;
- network-level demand was predictable, but historical store shares were not stable enough;
- sparse and intermittent demand dominated many store-SKU series;
- additional architectures did not materially move the result;
- removing early stopping did not reveal hidden performance;
- the final WAPE-aligned trial failed to beat the earlier MLP.

The problem was therefore diagnosed primarily as a dataset/data-generating-process limitation rather than a lack of model complexity.

The V2 work remains useful because it demonstrates disciplined failure analysis: compare baselines, test multiple model families, diagnose hierarchy/allocation error, estimate attainability, stop when evidence shows diminishing returns, and avoid claiming an unattainable accuracy target.

---

## 4.3 Dataset 3 — regenerated and enriched Databricks Flowstock V3

### Why a third dataset was created

The project required a credible end-to-end AI forecast and ranking demonstration. V2 could not support the target at store-SKU/28-day grain because its sparse stochastic demand and unstable store shares created an optimistic WAPE floor near 0.40.

The project owner therefore authorized a regenerated synthetic dataset with stronger observable retail signals. The change was explicit and documented; V2 results were retained rather than overwritten.

### Dataset design

V3 retains the operating network:

- 70 stores;
- 720 SKUs;
- 34,268 ranged store-SKU combinations.

It creates 104 weekly observations per combination:

```text
34,268 store-SKU pairs × 104 weeks = 3,563,872 rows
```

Learnable signals include:

- stable store effects;
- stable product effects;
- smooth annual seasonality;
- known promotions;
- lifecycle status;
- trend;
- retail-event weeks;
- recent and rolling lagged sales;
- service and margin attributes;
- small deterministic measurement noise.

The key change is that relevant future-known business signals and stable historical structure are present in the data. This gives the models information from which store-SKU demand can actually be learned.

### Leakage and evaluation design

- Features use lagged observations, static attributes and future-known calendar/promotion values.
- Training, validation and holdout are chronological.
- The later holdout is not used for model selection.
- Ranking trains on earlier periods and is evaluated on the forecast holdout.
- Publication stops if acceptance gates fail.

Recorded split sizes for the final forecast comparison:

| Split         |      Rows |
| ------------- | --------: |
| Training      | 1,248,949 |
| Validation    |   308,412 |
| Later holdout |   274,144 |

Acceptance gates:

| Gate                                     | Required |
| ---------------------------------------- | -------: |
| Forecast held-out WAPE                   |   ≤ 0.20 |
| Relative improvement over moving average |    ≥ 10% |
| Ranking top-20% value capture            |    ≥ 90% |

### Initial Spark GBT forecast trial

After correcting an incomplete-lag/NaN feature issue, the first V3 Spark GBT passed:

- validation WAPE: 0.0371;
- later holdout WAPE: 0.0457;
- held-out `1 - WAPE` display: 95.4%;
- four-week moving-average baseline WAPE: 0.1174;
- weighted absolute error reduction relative to that baseline: 61.1%.

This showed that V3 contained strong predictive signal.

### Fair three-model forecast comparison

Spark GBT, Spark ElasticNet and the PyTorch store/SKU embedding MLP were then compared using the same four-week store-SKU target, chronological splits and holdout rows.

| Model                                | Validation WAPE | Held-out WAPE | Held-out `1 - WAPE` display | Decision                   |
| ------------------------------------ | --------------: | ------------: | --------------------------: | -------------------------- |
| PyTorch store/SKU embedding MLP      |          0.0239 |        0.0249 |                       97.5% | Selected                   |
| Spark GBT                            |          0.0374 |        0.0448 |                       95.5% | Strong challenger          |
| Spark ElasticNet                     |          0.0615 |        0.0680 |                       93.2% | Strong linear benchmark    |
| Synthetic legacy category-rate proxy |          0.4196 |        0.3399 |                       66.0% | Presentation baseline only |

Important baseline distinction:

- the **legacy proxy** is a deliberately simple category demand rate multiplied by a fixed 0.65 availability factor; it represents a conservative non-personalized business process;
- the **moving average** is a stronger store-SKU time-series benchmark and scored WAPE 0.1174 in the initial GBT evaluation;
- the 66.0% legacy baseline should be used only if it is clearly labelled as a synthetic legacy proxy.

### Selected MLP training result

- architecture: `384 × 192 × 96`;
- fixed 15 epochs completed;
- selected epoch: 15;
- validation WAPE at selected epoch: 0.0239;
- untouched holdout WAPE: 0.0249;
- training time: 430.2 seconds;
- compute: NVIDIA A10G;
- checkpoint persisted and later reloaded successfully.

### AI ranking trial

The deployment pipeline trained a separate Spark GBT marginal-value ranker.

Results:

- top-20% value capture: 99.1%;
- acceptance gate: 90%;
- gate passed;
- forecast holdout WAPE reproduced at 0.0249;
- forecast bias: -0.0024;
- all 34,268 planning rows received ranking scores;
- ranking pipeline and deployment metrics persisted;
- ranking model logged to MLflow.

### Deployment and application integration

The deployment path completed the following:

1. loaded and verified the selected MLP checkpoint;
2. generated 1,248,949 training predictions;
3. generated 274,144 holdout predictions;
4. generated 34,268 planning-origin predictions;
5. logged the forecast experiment/model information to MLflow;
6. trained, evaluated and logged the separate ranking GBT;
7. published the complete `flowstock_app_*` serving contract;
8. created immutable snapshot `2026-06-30`;
9. tested the live SQL connector;
10. synchronized and loaded every planning row into Flowstock;
11. generated the first constrained AI-assisted plan.

MLflow emitted warnings that model signatures were missing. This did not block the current checkpoint/Delta serving path, but signatures are required before formal Unity Catalog model registration.

### What changed between V2 and V3

| Area                      | V2                                                    | V3                                                |
| ------------------------- | ----------------------------------------------------- | ------------------------------------------------- |
| Demand process            | Sparse, highly stochastic, Poisson-like               | Stable entity effects plus controlled small noise |
| Store shares              | Historically unstable                                 | Learnable store effects                           |
| Seasonality               | Insufficient at store-SKU grain                       | Smooth and explicit                               |
| Promotions/events         | Weak/noisy signals                                    | Known-at-origin structured signals                |
| Attainable store-SKU WAPE | Optimistic floor near 0.40                            | Held-out MLP WAPE 0.0249                          |
| Best model outcome        | MLP WAPE 0.4331                                       | MLP WAPE 0.0249                                   |
| Ranking                   | Store-share diagnostics; no passing production ranker | Separate GBT, 99.1% top-20% capture               |
| Application serving       | Development research only                             | Published snapshot and live connector             |

### Interpretation

The performance gain does not come only from changing algorithms. It comes mainly from changing data quality and signal structure:

- longer consistent history;
- stable store/product relationships;
- explicit seasonality;
- known promotion and calendar information;
- cleaner complete features;
- less irreducible random variation.

The project demonstrates that model architecture matters, but data learnability and target design matter more.

---

## 5. Consolidated model-results table

| Dataset          | Model/benchmark                      | Evaluation context                  |   WAPE | `1 - WAPE` display | Outcome                      |
| ---------------- | ------------------------------------ | ----------------------------------- | -----: | -----------------: | ---------------------------- |
| Business Central | No valid model                       | Insufficient store-location history |    N/A |                N/A | Requested richer data        |
| Flowstock V2     | Balanced baseline                    | All stores, 28-day                  | 0.5200 |              48.0% | Weak                         |
| Flowstock V2     | High-volume store-SKU baseline       | 28-day                              | 0.3979 |              60.2% | Below target                 |
| Flowstock V2     | High-volume network-SKU seasonal     | Aggregated network-SKU              | 0.0860 |              91.4% | Shows aggregation effect     |
| Flowstock V2     | Spark GBT residual                   | Internal                            | 0.4866 |              51.3% | Small improvement            |
| Flowstock V2     | Hierarchical residual/reconciliation | Development tuning                  | 0.4599 |              54.0% | Below target                 |
| Flowstock V2     | ElasticNet                           | Development tuning                  | 0.4502 |              55.0% | Below target                 |
| Flowstock V2     | Dynamic store-share neural           | Development tuning                  | 0.4375 |              56.3% | Did not beat direct MLP      |
| Flowstock V2     | Direct-MAE neural                    | Development tuning                  | 0.4340 |              56.6% | Final trial, second place    |
| Flowstock V2     | Embedding residual MLP               | Development tuning                  | 0.4331 |              56.7% | V2 winner; target missed     |
| Flowstock V3     | Synthetic legacy proxy               | Later holdout                       | 0.3399 |              66.0% | Presentation baseline        |
| Flowstock V3     | Moving average                       | Earlier GBT holdout evaluation      | 0.1174 |              88.3% | Stronger supporting baseline |
| Flowstock V3     | ElasticNet                           | Same later holdout                  | 0.0680 |              93.2% | Third in fair comparison     |
| Flowstock V3     | Spark GBT                            | Same later holdout                  | 0.0448 |              95.5% | Second in fair comparison    |
| Flowstock V3     | PyTorch embedding MLP                | Same later holdout                  | 0.0249 |              97.5% | Selected forecast            |

Do not place the V2 development-tuning metrics beside V3 holdout metrics without labelling their different datasets and evaluation status.

---

## 6. Technical opportunities and recommended next steps

### 6.1 Replace synthetic inputs with production-grade operational data

Highest priority:

- complete Business Central sales- and purchase-order line extraction;
- reconcile SKU/location inventory and movement history;
- classify DC, store and logistics locations;
- obtain at least 12–24 months of dense store-SKU sales history;
- add assortment validity dates;
- add promotions, markdowns, events and price changes;
- add dated open orders, incoming supply and expected arrivals;
- validate case packs/MOQs;
- validate store-SKU, category and receiving capacities;
- add routes, delivery calendars and lead-time variability;
- identify censored demand during stockouts.

Without these inputs, production forecast and replenishment performance cannot be established.

### 6.2 Forecast-model opportunities

- Use rolling-origin backtesting across multiple dates instead of relying on one validation/holdout boundary.
- Add calibrated prediction intervals and use uncertainty in the allocation objective.
- Evaluate hierarchical reconciliation across store, region, SKU and category.
- Add intermittent-demand specialists such as Croston-family benchmarks and hurdle/count models where appropriate.
- Model stockout censoring and lost demand rather than treating observed sales as unconstrained demand.
- Add monitoring by velocity, intermittency, lifecycle, promotion and category.
- Add drift detection for features, predictions and residuals.
- Compare the global embedding MLP with temporal deep-learning models only after real-data volume justifies them.
- Register signed models in Unity Catalog with explicit input/output signatures.

### 6.3 Ranking opportunities

- Train on observed allocation decisions and realized outcomes rather than a synthetic marginal-value target.
- Measure realized margin, service improvement and sell-through after allocation.
- Compare ranking performance using NDCG/value capture and downstream constrained-plan value.
- Investigate uplift or causal ranking if historical treatment/control variation exists.
- Introduce exploration only in a controlled pilot with planner safeguards.
- Monitor ranking stability and fairness across stores, regions and store formats.

### 6.4 Optimization opportunities

- Replace or benchmark the greedy marginal-pack allocator with a mixed-integer solver.
- Add explicit holding cost, markdown risk and overstock penalty.
- Add explicit transport, handling and shipment-frequency costs.
- Add a minimum recovered-value-per-pack threshold to control rounding surplus.
- Make service targets category/store specific.
- Add budget and working-capital constraints.
- Model dated arrivals and expected sales between planning time and delivery.
- Optimize across multiple periods instead of one 14-day horizon.
- Add fairness/minimum-allocation rules where business policy requires them.

The immediate evidence for this work is the first V3 plan: 25,201 of 71,800 units were above immediate row-level shortage due to pack rounding.

### 6.5 Orchestration and MLOps opportunities

- Connect the implemented nightly endpoint to Databricks Workflows, a scheduler or n8n.
- Add authenticated planner notifications and exception alerts.
- Record visible orchestration stages and timestamps in the UI.
- Add automatic retry with bounded backoff for safe read/sync operations.
- Keep human approval for plan release and model promotion.
- Add automated data-quality gates before scoring.
- Add champion/challenger evaluation and scheduled retraining criteria.
- Add live post-deployment outcome ingestion.
- Add signed model registry entries, version lineage and rollback validation.
- Exercise failure/recovery and duplicate-run tests in the deployed environment.

### 6.6 Platform and deployment opportunities

- Deploy to a host with persistent writable storage or replace local files with managed storage.
- Replace local JSON/filesystem state with a transactional database.
- Use a durable job queue for multi-user or multi-process operation.
- Add backups and tested disaster recovery.
- Add SSO, roles and least-privilege access.
- Replace personal tokens with service-principal OAuth and secret management.
- Add tamper-resistant audit retention.
- Add full table virtualization/server-side pagination for 34,268+ rows.
- Add production logging, metrics, tracing and alerts.
- Run connector, sync, plan, approval, shipping and restart-persistence smoke tests on the final host.

### 6.7 Business-validation opportunities

- Validate every cost, price, margin, capacity and service assumption with planners.
- Run a shadow-mode pilot before operational use.
- Compare the plan against planner decisions and the existing replenishment process.
- Measure realized WAPE, bias, service, OOS, inventory, margin and planner effort.
- Define acceptable trade-offs by category and store type.
- Establish ownership for overrides, model review, data quality and incident handling.
- Quantify ROI only from measured pilot outcomes, not the synthetic simulation.

---

## 7. Current limitations that must remain visible

- V3 is synthetic and intentionally more learnable than V2.
- The 97.5% `1 - WAPE` display is a transformed WAPE result, not a universal accuracy guarantee.
- The 66.0% legacy baseline is synthetic and intentionally simple.
- Commercial impacts are simulated, not realized.
- Ranking value capture is measured against a synthetic target.
- The greedy allocator is feasible but not globally optimal.
- Pack rounding generated a material inventory surplus in the first plan.
- No real post-deployment outcome batch exists yet.
- The nightly orchestration endpoint is implemented but has no external scheduler.
- The prototype uses local filesystem persistence and is not ready for multi-user production operation.
- Business Central connection is verified, but it does not yet provide a valid planning snapshot.
- Model signatures must be added before formal Unity Catalog model registration.
- Human approval remains required for plan release and model lifecycle changes.

---

## 8. Core conclusions for downstream deck generation

1. **The first constraint was data readiness, not model selection.** Business Central was accessible but operationally sparse and incomplete for store-level replenishment.
2. **The V2 experiments showed the value of disciplined negative results.** Multiple model families improved on weak baselines, but store allocation remained bounded by unstable shares and stochastic sparse demand. The project stopped tuning when the evidence showed the target was not attainable.
3. **V3 demonstrated the complete AI platform on data with observable signal.** The same chronological holdout comparison selected the PyTorch embedding MLP over Spark GBT and ElasticNet, and a separate ranking GBT passed its value-capture gate.
4. **The working solution is hybrid.** AI predicts demand and priority; deterministic constraints and human approval control execution.
5. **The platform now connects Databricks outputs to a working replenishment cockpit.** Forecasts, ranking scores, constrained recommendations, overrides, approval, shipping outputs and simulation form one coherent flow.
6. **The next value lies in production data, measured outcomes and optimizer refinement.** The strongest immediate technical opportunity is to replace synthetic assumptions with dense operational history and measure results in a controlled pilot.

---

## 9. Source references inside the repository

- `README.md` — complete experiment and implementation log.
- `docs/business_central_discovery.md` — verified Business Central connection and data-readiness assessment.
- `docs/databricks_ai_platform.md` — V3 model, deployment, connector and orchestration runbook.
- `docs/architecture.md` — application and allocation architecture.
- `docs/model_card.md` — model governance and limitations.
- `docs/n8n_integration_contract.md` — automation API and retry/idempotency contract.
- `docs/sportswear_restoration.md` — sportswear planning and capacity corrections.
- `config/objective.json` — current margin/service/ranking weights and service floor.
- `src/lib/domain/plan.ts` — constrained marginal-pack allocation implementation.
- `src/lib/domain/constraints.ts` — row and aggregate approval constraints.
- `src/lib/domain/kpiCalculations.ts` — KPI formulas.
- `src/lib/server/orchestration.ts` — idempotent nightly Databricks sync-and-plan operation.
