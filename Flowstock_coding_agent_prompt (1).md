# Coding Agent Prompt — Flowstock ML and Orchestration-Ready Upgrade

You are the senior full-stack and ML engineer responsible for upgrading the existing **Flowstock** repository into a credible, demo-ready proof of concept for explainable retail replenishment.

## Mission

Extend the current product without rebuilding it from scratch. Preserve the existing interface, deterministic allocation logic, business constraints, and working user journeys unless a change is necessary for this brief.

The current product generates three alternative allocation scenarios. Replace that behaviour with **one recommended plan per run**. The single plan must optimize expected margin and service level together while respecting available stock and every other hard operational constraint. The planner may still inspect, override, comment on, approve, or reject the recommendation, but must not be asked to choose among scenarios.

Implement four connected capabilities:

1. Import and prepare a reproducible subset of the **FreshRetailNet-50K** dataset.
2. Add an explainable ML demand-forecasting capability.
3. Add an explainable store-SKU ranking capability while retaining deterministic optimization and constraint enforcement.
4. Add safe model-monitoring and candidate-retraining capabilities, with mandatory human approval before any model promotion.

Prepare stable API endpoints and integration documentation for a future n8n workflow. **Do not create the actual n8n workflow in this task.** The product owner will build it later with guided, step-by-step assistance.

The complete POC must consistently represent a fresh-grocery retail business. The domain-alignment requirements below supersede earlier sportswear framing in the repository.

The result is a bootcamp POC, not a production system. It must work end to end, be honest about synthetic and proxy data, and be straightforward to demonstrate to a non-technical client.

---

## Non-negotiable principles

- Flowstock is decision support, not autonomous replenishment.
- A human planner must be able to inspect, override, comment on, approve, or reject a recommendation.
- The ML forecast and ranking outputs must never bypass the existing hard business constraints.
- Produce exactly one optimized recommendation plan per replenishment run; remove the three-scenario choice from the product experience.
- Treat available stock as a hard constraint, not a soft preference. Never allocate more stock than is available at the DC or store/source location defined by the current architecture.
- Keep the current deterministic forecast/ranking approach as a visible baseline and runtime fallback.
- Use a consistent fresh-grocery domain throughout the platform. Preserve encoded source identifiers and normalized sales; use a separate, deterministic synthetic grocery display catalogue and explicitly labelled synthetic operational fields. Never represent normalized sales as verified physical units.
- Do not describe a proxy or synthetic ranking target as a real observed allocation outcome.
- Do not let an LLM decide whether a numeric model passes its deployment gate.
- Do not allow an “agent” to write model code, edit thresholds, deploy a model, or promote a candidate without explicit human approval.
- Never commit raw downloaded data, Hugging Face credentials, tokens, local model binaries, caches, or secrets.
- Prefer the repository’s current stack and conventions. Add a separate Python service only if the existing architecture cannot responsibly host the ML pipeline.
- Preserve unrelated user changes and avoid broad rewrites.

---

## Domain alignment and complete platform data review

FreshRetailNet-50K is a fresh-retail dataset containing perishable grocery products. It is not a sportswear dataset.

Update Flowstock so the complete POC consistently represents a **fresh-grocery retail business**. Do not combine real grocery demand records with sportswear product names, categories, attributes, images, or interface copy.

### Preserve the real source data

Preserve the following source fields and their relationships without changing their meaning:

* `city_id`
* `store_id`
* `management_group_id`
* `first_category_id`
* `second_category_id`
* `third_category_id`
* `product_id`
* dates and hourly structure
* normalized sales amounts
* stockout information
* discounts
* activity and holiday indicators
* weather variables

The source category and product IDs are encoded. Do not claim that their real semantic names are known unless an authoritative mapping is supplied by the dataset publisher.

The dataset’s `sale_amount` and `hours_sale` fields are normalized sales amounts. Do not automatically present them as literal physical units. If Flowstock requires integer units for its allocation demonstration, create a documented derived or synthetic operational quantity and label its provenance clearly.

### Create a grocery-appropriate display catalogue

Create a deterministic synthetic display catalogue for the selected source products so that the application is understandable to users.

The catalogue may use plausible fresh-grocery names such as:

* Whole Milk 1L
* Free-Range Eggs, 12 Pack
* Bananas 1kg
* Baby Spinach 200g
* Tomatoes 500g
* Chicken Breast 500g
* Salmon Fillet 300g
* Greek Yogurt 500g
* Sourdough Bread
* Frozen Mixed Berries 500g

Use a sufficiently varied set of grocery products rather than repeating these examples.

The display catalogue must:

* maintain a stable one-to-one mapping between every selected source `product_id` and one synthetic display SKU;
* preserve the original encoded product and category IDs;
* assign category-consistent names, units, case packs and attributes;
* use a fixed seed or committed mapping so names do not change between runs;
* contain unique product names where practical;
* mark every generated name and descriptive attribute as synthetic;
* never imply that a generated grocery name is the real identity of the encoded FreshRetailNet product.

Keep the source and display fields separate. For example:

```text
source_product_id
source_first_category_id
source_second_category_id
source_third_category_id
display_product_name
display_department
display_category
display_subcategory
display_pack_description
display_unit_of_measure
display_metadata_origin = "synthetic_grocery_overlay"
```

Create a coherent synthetic grocery hierarchy, for example:

* Fresh Produce
* Dairy and Eggs
* Meat and Poultry
* Seafood
* Bakery
* Chilled and Ready Meals
* Frozen Foods
* Beverages
* Pantry Essentials

The hierarchy is a presentation overlay unless verified source category names become available. Document this limitation.

### Replace sportswear-specific operational attributes

Review whether every synthetic field is appropriate for grocery retail.

Remove or replace sportswear-specific fields such as:

* clothing size;
* colourway;
* style;
* apparel collection;
* shoe size;
* fashion season;
* sportswear product type.

Use relevant grocery attributes where needed:

* weight or volume;
* unit of measure;
* case-pack quantity;
* storage temperature;
* chilled, frozen or ambient classification;
* shelf-life band;
* expiry or waste-risk indicator;
* grocery department and category.

These operational attributes are synthetic unless directly supported by the source dataset.

Synthetic price, cost, margin, inventory, shelf life, case pack, capacity and replenishment constraints must be deterministic, internally consistent and explicitly labelled. Do not imply that FreshRetailNet provides currency, product cost or gross margin.

### Review all data used by the platform

Perform a repository-wide data and domain audit before implementation. Inspect and update every place where demo, seed, fixture, mock, sample or derived data is created or displayed, including:

* source CSV and Parquet mappings;
* database seeds and migrations;
* hard-coded constants;
* JSON fixtures;
* mock API responses;
* notebooks and training fixtures;
* synthetic-data generators;
* frontend state and fallback data;
* product and store filters;
* dashboards and charts;
* recommendation explanations;
* allocation tables;
* approval screens;
* shipping exports;
* downloaded example files;
* tests and snapshots;
* README examples;
* API documentation;
* n8n integration examples;
* screenshots, icons and product imagery, if present.

Remove unsupported sportswear terminology and data from the active grocery POC. Replace clothing imagery with grocery-appropriate or neutral product visuals. Preserve historical records only when required for migration or audit purposes, and prevent them from appearing in new demo runs.

### Store and location presentation

The source store and city identifiers are encoded. Preserve those IDs.

### Recommendations and explanations

All generated recommendations must use grocery-appropriate language. For example:

> Send 4 cases of Whole Milk 1L to Store 014. Forecast demand and recent stockout exposure indicate a service-level risk. The allocation remains within available DC stock and is expected to improve simulated gross margin.

Explanations must distinguish:

* demand and stockout patterns derived from FreshRetailNet;
* forecasts generated by the ML model;
* synthetic product names and commercial attributes;
* simulated margin and service-level results;
* real operational evidence that remains unavailable.

### Documentation changes

Update the README, data card, model card, architecture documentation and UI disclosures to state clearly:

* FreshRetailNet represents fresh/perishable retail rather than sportswear;
* the real dataset supplies encoded store-product demand, promotions, stockouts and contextual information;
* actual product and category names are unavailable;
* product names and category labels displayed by Flowstock are synthetic grocery overlays;
* price, cost, margin, DC inventory and replenishment constraints are synthetic;
* commercial results are simulated and require validation with real client data;
* the dataset is licensed under CC BY 4.0, subject to verification against the retrieved dataset card.

Do not retain statements that the imported dataset represents a sportswear company.

### Validation and acceptance criteria

Add automated checks confirming that:

* every selected source product has exactly one stable display product;
* every display product belongs to a valid grocery hierarchy;
* product names, units and category assignments are internally consistent;
* real source identifiers remain unchanged;
* all synthetic display and commercial fields contain provenance metadata;
* normalized sales are not silently relabelled as literal units;
* sportswear-specific demo products and attributes no longer appear in active UI routes, APIs, exports, fixtures or documentation;
* the app, model pipeline and optimizer use the same selected source products and stores;
* recommendation explanations use grocery terminology;
* offline demo fixtures represent the same grocery domain as the full-data workflow.

Include the audit results in the final implementation report. List every dataset, fixture and generator found, what was changed, what remains synthetic, and any domain inconsistencies that could not be resolved.

---

## Phase 0 — Inspect before changing anything

Start by reading the complete README and inspecting the repository structure, current data schema, UI routes/components, existing calculation engine, APIs, tests, scripts, dependency files, environment examples, and git status.

Then produce a short implementation note containing:

- current architecture and technology stack;
- current Flowstock input/output CSV schemas;
- repository-wide data/domain audit covering every dataset, fixture, generator, active UI/API/export path, image, and documentation example; identify sportswear content to replace and any historical records to isolate;
- existing forecast, ranking, three-scenario generation/selection, allocation, constraint, approval, override, and export logic;
- proposed files/modules to add or modify;
- any conflicts between this brief and the actual repository;
- a sequenced implementation plan.

Do not pause for approval unless a material ambiguity would change the product behaviour, require destructive work, or make a requirement impossible. Otherwise, make the smallest reasonable assumption, document it, and proceed.

---

## Phase 1 — FreshRetailNet ingestion and reproducible subset

### Source

Use the Hugging Face dataset:

- Repository: `Dingdong-Inc/FreshRetailNet-50K`
- Train file: `data/train.parquet`
- Evaluation file: `data/eval.parquet`

Start from this requested loading approach:

```python
import pandas as pd

splits = {
    "train": "data/train.parquet",
    "eval": "data/eval.parquet",
}

df = pd.read_parquet(
    "hf://datasets/Dingdong-Inc/FreshRetailNet-50K/" + splits["train"]
)
```

Authentication may be performed locally with `huggingface-cli login` or a supported `HF_TOKEN` environment variable. Do not place a token in source code, configuration committed to git, logs, notebooks, or documentation examples.

### Robust import requirements

Create a reproducible CLI or script that:

- checks dependencies and gives a useful error if Hugging Face filesystem support or authentication is missing;
- can load both train and evaluation parquet files;
- supports a `--smoke-test` or equivalent mode that processes a very small sample;
- caches data only in a gitignored local directory;
- validates column names, types, required identifiers, date coverage, nulls, duplicates, negative values, and row counts;
- logs dataset version/revision when available, retrieval date, selection seed, filters, and resulting date/store/SKU counts;
- does not silently continue if the observed schema differs from the expected mapping;
- writes curated, analysis-ready data locally in an efficient format such as Parquet;
- is idempotent and deterministic when run with the same source revision, configuration, and seed.

If the exact loading code fails because the dataset is gated, its schema has changed, or the local environment lacks support, implement a documented fallback using the official Hugging Face Hub APIs. Do not scrape the website and do not fabricate data to hide the failure. The application must still support a small committed synthetic fixture so tests and the demo shell can run without network access.

### Select approximately 70 stores

Create a deterministic, documented subset approximating the fictional client profile:

- target: 70 stores;
- retain enough products and observations to create meaningful store-SKU time series;
- prioritize stores with adequate date coverage and non-trivial demand rather than simply taking the first 70 IDs;
- avoid choosing stores based on the final test period’s target outcomes;
- use a fixed seed for any tie-breaking or sampling;
- write a manifest listing selected stores, selection rules, exclusions, row counts, date range, and source revision.

Do not force the result to exactly 1,200 SKUs if doing so damages the time-series quality. Keep the usable real products for modelling and create the required stable one-to-one synthetic grocery display catalogue. Use the same selected source stores and products throughout the application, model pipeline, and optimizer. Preserve encoded source hierarchy separately from the synthetic display hierarchy.

### Privacy

Exclude customer-level or personally identifiable data. Use only the minimum store-product-time and contextual fields required for this POC.

---

## Phase 2 — Map the source to Flowstock’s data contract

Inspect the existing Flowstock CSVs before defining the mapping. Create a machine-readable schema plus a human-readable mapping document with, for every target field:

- Flowstock field name;
- source FreshRetailNet column, if any;
- transformation and unit;
- target type and null policy;
- whether the field is real, derived, synthetic, or unavailable;
- validation rule;
- downstream use.

At minimum, the canonical POC contract should cover these logical entities. Adapt their physical names to existing repository conventions rather than creating duplicates:

1. `sales_history`: date/timestamp, encoded store and product IDs, original daily/hourly normalized sales amounts, discount/activity/holiday indicators, stockout information, and relevant contextual variables. Preserve source values and hourly relationships. Store any derived or synthetic operational quantities separately, with their conversion, scale, units, and provenance; do not claim physical unit demand is observed.
2. `stores`: store ID and any real source attributes; synthetic retail format, region, capacity, service days, or other confidential operating attributes only when required.
3. `products`: source product ID and encoded source hierarchy, mapped one-to-one to a synthetic grocery display SKU; separate synthetic display name, department/category/subcategory, pack description, weight/volume, unit of measure, storage classification, shelf-life band, waste-risk indicator, case pack, cost, selling price, and gross margin as needed. Include field-level provenance and do not infer real semantic identities from encoded IDs.
4. `inventory_snapshot`: store-SKU on-hand, in-transit, reserved, safety stock, and timestamp.
5. `dc_inventory`: DC-SKU available stock and timestamp.
6. `constraints`: pack size, min/max shipment, store/category capacity, assortment eligibility, delivery calendar, and budget constraints.
7. `recommendations`: run/model IDs, store, SKU, forecast, interval, score, proposed quantity, reasons, constraint adjustments, objective contributions, status, and timestamps. All recommendation rows for a run belong to the same single optimized plan; no scenario-choice field should be required for new runs.
8. `decisions`: recommendation ID, user action, original and final quantity, override reason/comment, approver, and timestamps.

### Fields that should normally remain synthetic

Unless the observed dataset genuinely contains them, treat the following as synthetic and label them in the data itself and documentation:

- one-DC network design and DC inventory;
- current store on-hand and in-transit inventory if not present in source;
- wholesale cost, selling price, and margin if unavailable;
- grocery display product names/taxonomy, weight/volume, storage classification, shelf life, and waste-risk attributes;
- pack sizes and case constraints;
- store/category capacity;
- fixed assortment eligibility;
- delivery routes, calendars, and lead times;
- replenishment budgets;
- historic planner decisions, overrides, approvals, and shipment outcomes.

Use deterministic generators with a fixed seed and coherent business rules. Synthetic values must be plausible, internally consistent, and traceable through a `data_origin` or equivalent field. Never overwrite real source values with synthetic ones without preserving provenance.

Add validation tests for referential integrity, unique keys, non-negative quantities, valid date ordering, consistent units/currency, inventory balance assumptions, pack multiples, capacity limits, and assortment eligibility.

---

## Phase 3 — Time splits and leakage prevention

Derive the exact date range from the downloaded data and document the resulting calendar dates.

For the expected approximately 90-day FreshRetailNet history, use a chronological split shared across all series:

- first 60 days: training;
- next 15 days: validation/model selection;
- final 15 days: untouched test set.

If the actual date coverage differs, preserve the intent: approximately two-thirds training, one-sixth validation, and one-sixth test, with at least 14 days in validation and test where possible. Document any deviation.

Requirements:

- split by time, never random rows;
- use the same cutoff dates for all store-SKU series;
- fit encoders, imputers, scalers, target statistics, and model selection only on training data;
- calculate lag and rolling features using information available strictly before each prediction timestamp;
- do not use future stockout, promotion, weather, inventory, or realised sales values as contemporaneous features unless they would genuinely be known at prediction time;
- keep the test set sealed until final evaluation;
- include automated leakage tests.

Use rolling-origin validation inside the training/validation window if the data volume permits.

---

## Phase 4 — Demand forecasting

### Prediction task

Define the primary forecasting label as future normalized sales over the replenishment horizon for each source store-product series. Preserve the source scale and describe any censoring-adjusted demand estimate as derived, not observed physical demand. If no horizon exists in Flowstock, default to the next 7 calendar days and make it configurable.

For integer allocation, define a separate documented, deterministic conversion to derived or synthetic operational quantities. Record conversion parameters/version and provenance, preserve the original normalized forecasts, and use a consistent operational scale for inventory, case packs, capacity, ranking proxies, and simulated commercial calculations. Report forecasting metrics with their target scale explicitly stated.

Observed sales during stockouts are censored demand, not necessarily true demand. Where source stockout information supports it:

- create an explicit stockout/censoring feature;
- avoid treating stockout-zero sales as unquestioned zero demand;
- implement and document a conservative adjustment or exclusion policy;
- report performance separately for stockout-affected and unaffected observations.

### Models

Implement:

1. seasonal-naive baseline;
2. moving-average or equivalent deterministic baseline compatible with current Flowstock logic;
3. one global gradient-boosted model trained across store-SKU series.

Choose the gradient-boosting library that best fits the repository and environment. Prefer a reliable CPU-friendly implementation. Do not add deep learning solely for appearance.

Candidate features include only those present and usable without leakage:

- lagged units;
- rolling means, medians, volatility, and recent non-zero frequency;
- day-of-week and calendar features;
- store and product identifiers/encodings;
- product/store hierarchy where available;
- promotion and discount information known at forecast time;
- recent stockout status;
- weather/context only if available for both training and forecast time;
- synthetic product lifecycle or season only when clearly identified as synthetic.

### Outputs

For every prediction return:

- point forecast;
- lower and upper interval or calibrated prediction range;
- model name and version;
- forecast horizon and generation timestamp;
- confidence/quality indicator with a documented definition;
- top contributing signals or business-readable reasons;
- fallback indicator when the ML model cannot safely score the row.

Use SHAP or an appropriate model-native explanation method if practical. Convert technical feature contributions into controlled, fact-based explanation templates. Do not use a generative model to invent numeric reasons.

### Evaluation

Report at least:

- WAPE as the primary portfolio metric;
- MAE;
- bias/mean error;
- interval coverage, if intervals are produced;
- performance by store, product/category, demand volume, and stockout status;
- comparison with both baselines;
- cold-start/insufficient-history coverage;
- inference failures and fallback rate.

Use safeguards for zero-demand denominators. Do not claim an improvement unless the held-out test result supports it. If the ML model loses to the baseline, keep the baseline as champion and report the honest result.

---

## Phase 5 — Explainable store-SKU ranking and allocation

### Correct unit of ranking

Rank **store-SKU opportunities**, not stores in isolation. A store can be high priority for one SKU and low priority for another.

The business target is expected incremental gross margin from sending one additional pack of a SKU to a store, subject to operational constraints.

### Labels and honesty boundary

FreshRetailNet does not provide historical DC allocation decisions and counterfactual incremental sales. Therefore a true causal replenishment label is unavailable.

Implement two layers:

1. **Explainable deterministic priority baseline** using forecast demand, projected inventory cover, stockout risk, margin, recent sales, service level, and configured business priorities.
2. **ML challenger ranking/opportunity model** trained only on a clearly named proxy/semi-synthetic label.

Define and document the proxy label as follows unless the repository data supports a better defensible formulation:

```text
future_shortage_units = max(future_horizon_demand - projected_available_inventory, 0)
ranking_value_proxy = min(future_shortage_units, pack_size) * synthetic_unit_margin
ranking_relevance = a documented ordinal bin of ranking_value_proxy
```

Here, future horizon demand is an operational-quantity proxy derived from realised normalized sales through the documented conversion, not observed physical demand. Projected inventory, pack size, and unit margin may be synthetic. All terms in the proxy formula must use consistent operational units. Mark the resulting label as `proxy_semi_synthetic`. Never call it observed incremental profit.

If a learning-to-rank algorithm is unsuitable because the dataset or dependencies cannot support correct grouped training, use a supervised model for the proxy opportunity value and sort its predictions within each SKU/replenishment run. Explain that design in the documentation.

### Allocation remains deterministic

The ranking model proposes relative priority. The existing deterministic optimizer or allocation engine must remain the final layer applying:

- DC stock availability;
- pack-size multiples;
- min/max shipment;
- assortment eligibility;
- store/category capacity;
- delivery calendar/lead-time rules;
- optional budget constraints;
- non-negative integer quantities.

Every proposed quantity must record which constraints affected it. If the optimizer fails or produces an infeasible result, return a safe error/fallback; never silently emit an invalid plan.

### Replace three scenarios with one optimized plan

Remove the current logic and interface that generate or ask the user to choose among three scenarios. Every replenishment run must produce exactly **one recommended allocation plan**.

Use a transparent, deterministic multi-objective optimization that balances expected incremental margin and service-level improvement while respecting available stock as a hard constraint. Use a formulation equivalent to:

```text
maximize:
    margin_weight  * normalized_expected_incremental_margin
  + service_weight * normalized_service_level_gain

subject to:
    total allocation by SKU <= available DC stock by SKU
    all pack-size, assortment, capacity, delivery, budget, and quantity constraints
```

Define the terms consistently:

- `expected_incremental_margin` = expected sell-through units attributable to the shipment × unit margin;
- `service_level_gain` = forecast shortage reduced, or the resulting improvement in forecast demand fulfilment/fill rate;
- `available_stock` is a hard upper bound and must not be included merely as another weighted score;
- unallocated stock is allowed when there is no eligible or economically sensible demand.

Normalize the two objective components before combining them so scale differences do not make one objective dominate accidentally. Store the objective definition, component values, weights, service-level target/floor if used, constraint set, model versions, and deterministic tie-breaking rule with every run.

Use configurable, versioned weights with safe defaults of `margin_weight = 0.5` and `service_weight = 0.5`, unless the current repository already contains approved business weights that can be reused and documented. Weights are administrative configuration, not scenario choices in the planner UI. Changing them creates a new configuration version and audit event.

Where the optimizer supports it, enforce a configured minimum service-level floor before optimizing residual stock for margin. If available stock makes the floor infeasible, produce the best feasible plan, flag the shortfall clearly, and explain which SKUs/stores remain underserved. Never fabricate feasibility.

For each plan and recommendation, expose a concise explanation of:

- expected incremental margin and margin contribution;
- projected service level before and after allocation;
- available stock, allocated stock, and residual stock;
- binding constraints;
- why this store-SKU received stock ahead of lower-ranked alternatives.

Update data models, APIs, UI copy, exports, fixtures, and tests so new runs have one plan rather than an array of alternative scenarios. Remove scenario-name/scenario-selection inputs from new-run and approval flows. Preserve any historical scenario records through a safe migration or read-only compatibility layer if they already exist; do not destroy audit history.

### Ranking evaluation

Use metrics appropriate to ranked recommendations, such as NDCG@K or Precision@K against the proxy relevance label, plus business simulation metrics:

- proxy incremental margin captured;
- projected service level before and after the single optimized plan;
- available, allocated, and residual stock reconciliation by SKU;
- projected stockout units avoided;
- allocation coverage;
- constraint violation count, which must be zero;
- difference versus the deterministic baseline;
- stability of rankings under small input changes.

Keep evaluation language explicit that commercial outcomes are simulated and require a real pilot.

---

## Phase 6 — Safe model-maintenance agent

Implement a bounded maintenance workflow/service rather than an autonomous code-changing agent.

It may:

- validate new input data;
- detect schema changes and data-quality failures;
- compute forecast accuracy, bias, interval coverage, drift, and fallback rates;
- segment failures by store/category/SKU volume;
- trigger training of a candidate model;
- evaluate champion versus challenger using fixed numeric gates;
- prepare a plain-language report from verified metrics;
- create a promotion request for human review;
- activate an approved candidate;
- roll back to a previously approved model.

It must not:

- modify source code or evaluation thresholds;
- choose its own deployment metrics;
- promote or deploy a model without an authenticated approval action;
- hide a failed gate behind an LLM-generated recommendation;
- delete previous model versions or audit records.

### Model registry and states

For the POC, implement a lightweight registry consistent with the repository. Each model version needs:

- immutable version/run ID;
- data revision and date boundaries;
- code/config version where available;
- parameters and features;
- evaluation metrics;
- artifact path/checksum;
- state: `candidate`, `approved`, `champion`, `rejected`, or `rolled_back`;
- approver, timestamp, and reason for state changes.

Use fixed, configurable promotion gates. A candidate must at minimum:

- pass all data and inference tests;
- not regress primary accuracy beyond the documented tolerance;
- remain within the bias threshold;
- have zero allocation constraint violations;
- meet minimum scoring coverage and maximum fallback rate;
- pass a human approval step.

If insufficient post-deployment outcomes exist, report “not enough evidence” rather than approving automatically.

An LLM may optionally summarize already-computed metrics into plain language, but the application must also work without an LLM/API key. Any generated summary must cite the exact metric values supplied to it and must not control promotion.

---

## Phase 7 — APIs and future n8n integration contract

Expose stable, authenticated endpoints or equivalent service functions that fit the existing architecture. Reuse current APIs where sensible. The exact URL structure may adapt to the repository, but support these logical operations:

- health/readiness;
- ingest or validate a data batch by reference/run ID;
- start a forecast/recommendation run asynchronously and generate one optimized allocation plan;
- get run status and errors;
- retrieve the single plan, its objective summary, forecasts, and recommendations with pagination;
- submit planner override/comment;
- approve or reject a replenishment plan;
- export the approved shipping CSV;
- run model monitoring;
- train/evaluate a candidate model;
- retrieve champion-versus-challenger report;
- approve/reject promotion;
- activate or roll back an approved model.

Requirements:

- use run IDs and file/storage references rather than sending the full multi-million-row dataset in webhook payloads;
- make write operations idempotent where possible;
- validate all payloads with explicit schemas;
- return machine-readable status and error codes;
- include correlation/run IDs in logs and responses;
- protect approval and model-promotion actions;
- maintain a complete audit trail;
- provide OpenAPI/schema documentation if supported by the stack;
- include example requests, responses, and curl commands;
- provide a small mock/demo mode so the integration can be demonstrated without downloading the full dataset.

Do not expose scenario-selection parameters for new runs. The n8n-facing response should contain one `plan_id`, one approval state, the objective weights/version, expected margin, projected service level, and stock reconciliation. If backward compatibility requires a collection-shaped response, it must contain exactly one current plan and be documented as transitional.

Create `docs/n8n_integration_contract.md` describing the future node-by-node handoff at the API-contract level, including authentication assumptions, payload examples, polling/callback behaviour, timeouts, retries, and idempotency keys.

**Do not export or implement an n8n workflow JSON in this task. Do not attempt to configure an n8n instance.** Only make Flowstock ready for the later guided workflow build.

---

## Phase 8 — Flowstock UI upgrades

Integrate the new capabilities into the existing UI without replacing its design system.

The demo journey must let a planner:

1. select or refresh a data snapshot;
2. start a recommendation run and see status/progress;
3. view forecast quantity, lower/upper range, model version, and fallback state;
4. compare ML output with the deterministic baseline;
5. view the one optimized plan, including expected margin, projected service level, and available/allocated/residual stock;
6. view ranked store-SKU recommendations within that plan;
7. open a recommendation and see business-readable drivers, objective contributions, and applied constraints;
8. override quantity and enter a reason/comment;
9. approve or reject the plan without choosing a scenario;
10. export the approved warehouse/shipping CSV;
11. inspect a model health card showing accuracy, bias, data freshness, champion version, challenger status, and last approval.

Remove the current three-scenario cards, tabs, selector, comparison controls, and scenario-specific approval state. Replace them with one clearly labelled **Recommended plan** view and a compact objective summary. Do not remove the planner’s ability to compare the ML forecast against the deterministic forecast baseline; that model comparison is diagnostic and is not an allocation-scenario choice.

Clearly badge data and results as appropriate:

- real source data;
- derived fields;
- synthetic operational assumptions;
- proxy/semi-synthetic ranking label;
- simulated business impact;
- real pilot evidence not yet available.

Do not display unsupported ROI or revenue claims as measured outcomes.

Include accessible loading, empty, partial-success, fallback, and error states. Preserve the existing manual/deterministic demo path if ML artifacts are unavailable.

---

## Phase 9 — Documentation, licensing, and reproducibility

Add or update documentation covering:

- local setup and exact commands;
- optional Hugging Face authentication;
- full-data and smoke-test ingestion;
- model training and evaluation;
- starting all services;
- running the UI demo;
- running monitoring and candidate retraining;
- approving or rejecting a candidate;
- rollback;
- tests and linting;
- future n8n integration;
- architecture and data flow;
- source-versus-synthetic field mapping;
- assumptions, risks, and known limitations.

Create a dedicated dataset card or `docs/data_card_freshretailnet.md` that includes:

- exact dataset name and URL;
- publisher/maintainer;
- source revision/commit when retrievable;
- retrieval date;
- observed schema and date range;
- subset method and selected-store manifest;
- transformations;
- train/validation/test dates;
- intended use and prohibited interpretations;
- domain alignment: fresh/perishable retail throughout the POC; encoded source product/category identities remain unknown and displayed grocery names/hierarchies are synthetic overlays;
- short-history and stockout-censoring limitations;
- synthetic operational fields;
- privacy considerations;
- attribution instructions;
- licensing.

Verify the licence from the dataset card or repository files at implementation time. It is expected to be **CC BY 4.0**, but do not state this as verified until checked against the retrieved source. If confirmed, include the required attribution and a link to the licence. If the dataset metadata conflicts or no licence can be verified, stop redistribution of derived/raw data, document the uncertainty, and keep only scripts and small independently created fixtures in the repository.

Update `.gitignore` for downloaded data, model artifacts, caches, local registries/databases, environment files, and secrets. Provide `.env.example` with names only and safe non-secret defaults.

---

## Phase 10 — Tests and quality gates

Add tests appropriate to the repository. At minimum cover:

### Data

- schema validation;
- source-to-target mapping;
- provenance flags;
- deterministic subset selection;
- time split boundaries;
- leakage prevention;
- synthetic generator reproducibility;
- referential integrity.

### Models

- baseline forecasts;
- feature availability at prediction time;
- forecast output schema and non-negative handling;
- interval ordering;
- ranking proxy construction;
- ranking group integrity;
- champion fallback;
- promotion-gate pass/fail cases;
- deterministic results under fixed seeds where practical.

### Allocation

- DC inventory conservation;
- pack multiples;
- capacity and assortment rules;
- non-negative integer quantities;
- zero constraint violations in generated plans;
- exactly one optimized plan per run;
- correct calculation and normalization of margin and service objective components;
- deterministic objective weights and tie-breaking;
- available/allocated/residual stock reconciliation;
- infeasible service-floor handling and clear shortfall flags;
- absence of scenario-selection inputs in new-run and approval flows;
- safe handling of infeasible cases.

### API/integration

- request validation;
- authentication/authorization around approval actions;
- idempotency;
- asynchronous run state transitions;
- audit-log creation;
- export schema;
- model approval and rollback.

### UI

- primary planner journey;
- one recommended plan and no three-scenario selector;
- margin, projected service level, and stock reconciliation summary;
- baseline/ML comparison;
- explanation and constraint display;
- override reason requirement;
- approval/rejection;
- fallback and error states.

Full tests must not require network access or a Hugging Face token. Use small fixtures. Put optional live-data tests behind an explicit marker/flag.

Run the repository’s formatter, linter, type checker, unit tests, integration tests, and build. Fix failures introduced by this work. Report pre-existing failures separately rather than concealing them.

---

## Required deliverables

When finished, the repository should contain:

1. reproducible FreshRetailNet ingestion and ~70-store subset tooling;
2. source-to-Flowstock mapping and provenance metadata;
3. deterministic synthetic operational-data generator;
4. chronological train/validation/test pipeline;
5. demand baselines and global gradient-boosted forecast model;
6. prediction intervals/confidence and explanations;
7. deterministic ranking baseline and ML challenger using an explicit proxy label;
8. deterministic constraint-aware multi-objective allocation producing one recommended plan optimized for margin and service level within available stock;
9. model registry, monitoring, candidate evaluation, approval, and rollback;
10. orchestration-ready APIs and `docs/n8n_integration_contract.md`;
11. updated Flowstock UI for the end-to-end planner demo;
12. data card, model cards, architecture/data-flow documentation, limitations, licence attribution, and runbook;
13. automated tests and small offline fixtures;
14. sample approved shipping CSV and sanitized example API payloads;
15. complete data/domain audit report and stable synthetic grocery display mapping, including provenance and unresolved inconsistencies.

---

## Definition of done

The task is complete only when all of the following are true:

- A new developer can follow the README and run a small offline demo without credentials.
- An authenticated developer can import the requested dataset using the documented command.
- The dataset subset and split are reproducible and documented with actual dates and counts.
- Every relevant field is labelled real, derived, synthetic, or unavailable.
- Every selected source product has exactly one stable grocery display product; encoded source IDs and hierarchy remain intact.
- Active UI routes, APIs, exports, fixtures, imagery, and documentation contain no unsupported sportswear products or attributes; offline and imported-data paths use the same grocery domain.
- Normalized sales remain distinct from derived/synthetic operational quantities; commercial results are clearly simulated.
- Forecast outputs include a baseline comparison, range/confidence, explanation, and model version.
- Ranking occurs at store-SKU level and its proxy/semi-synthetic nature is explicit.
- Each run produces exactly one recommended plan; the three-scenario choice has been removed from new-run and approval flows.
- The plan uses a documented, versioned balance of expected margin and service-level gain, with available stock enforced as a hard constraint.
- The plan reconciles available, allocated, and residual stock by SKU and explains any unmet service target.
- Every recommended shipment satisfies all hard constraints or is rejected as infeasible.
- The planner can override, comment, approve/reject, and export through the UI.
- Model monitoring can create and evaluate a candidate, but promotion cannot occur without approval.
- The system can fall back safely to the deterministic baseline.
- The future n8n integration can call documented endpoints with small payloads and run IDs.
- No actual n8n workflow has been created.
- No secrets, raw dataset, large generated data, or unlicensed redistributable content are committed.
- Tests, linting, type checks, and build pass, except for clearly reported pre-existing failures.

---

## Final response format

At completion, report:

1. concise outcome summary;
2. architecture implemented;
3. files added and changed;
4. exact commands to ingest data, run smoke mode, train, evaluate, start the app/services, and run tests;
5. observed source schema, subset counts, and exact split dates;
6. forecast and ranking metrics, clearly separating real held-out metrics from simulated commercial metrics;
7. model promotion gates and current champion/challenger state;
8. limitations and unresolved risks;
9. test/build results, including any pre-existing failures;
10. the API endpoints that will be used in the later n8n build;
11. confirmation that the former three-scenario flow was replaced safely, including any data/API migration or compatibility decisions;
12. the final optimization objective, weights/configuration version, service-level definition, stock constraints, and deterministic tie-breaker;
13. a short, ordered checklist for the product owner’s customer demo;
14. repository-wide data/domain audit results: every dataset, fixture and generator found, changes made, remaining synthetic fields, preserved historical records, and any unresolved domain inconsistencies.

Do not report a requirement as complete unless it is implemented and verified. Clearly label anything deferred.
