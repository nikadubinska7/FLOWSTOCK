# AGENTS.md

## Project Name

Flowstock — AI-assisted replenishment planning for store networks.

## Project Purpose

Build a fully working web prototype of an AI-assisted replenishment planning interface for a sportswear retail business.

The business setup is:

- 1 central distribution center, referred to as DC
- 70 owned retail stores
- 1,200 style-color-size SKUs
- Daily replenishment planning
- Weekly DC-to-store deliveries
- Fixed store assortment
- Replenishment only from DC to stores
- Mock CSV files are used instead of ERP/POS/WMS integrations

The prototype should allow a planner or business leader to:

1. Refresh operational data from CSV files.
2. View current inventory, out-of-stock risk, and lost sales risk.
3. Run one of three smart replenishment scenarios.
4. See the projected business impact immediately.
5. Manually override recommended quantities.
6. Validate constraints before approval.
7. Approve selected or all replenishment rows.
8. Generate shipping documents.
9. Generate a new updated CSV package for the next simulated planning day.

The product should feel like a realistic planning cockpit, not a static dashboard.

---

## Intended User

The intended user is a retail planner, supply chain planner, merchandise planner, allocation manager, or business leader.

The user is not expected to be technical. The interface should avoid technical terminology unless it is common in retail supply chain operations.

Use clear wording, visible explanations, and guided workflows.

---

## User Context

The project owner works on Mac and has basic familiarity with:

- VS Code
- Terminal
- GitHub

The project owner does not code.

Any setup instructions, terminal commands, or technical decisions should be explained clearly and practically and step-by-step. do not proceed to the next step until project owner says so.

Avoid assuming deep software engineering knowledge.

---

## Core Business Concept

The tool compares two business states:

### 1. Current State

The current position before a replenishment recommendation is applied.

Show:

- Inventory value
- Days of cover
- Out-of-stock percentage
- Lost sales value
- Margin at risk if available
- DC free stock

### 2. Simulation

The projected position after the selected recommendation or manual edits are applied.

Show:

- Projected inventory value
- Projected days of cover
- Projected out-of-stock percentage
- Projected lost sales value
- Recovered revenue
- Recovered margin if available
- DC free stock remaining
- Number of stores/SKUs improved
- Number of constraint violations

For each KPI, show the delta versus Current State where possible.

Example:

- Lost Sales: €302.9k → €214.6k, improvement €88.3k
- OOS: 12.4% → 7.9%, improvement 4.5 percentage points
- Inventory: €4.8m → €5.0m, increase €0.2m

---

## Required Application Behavior

### Refresh

The Refresh button loads the latest CSV package.

After Refresh:

- The main table should show current store-SKU rows.
- `Sys. recommended qty` should be blank or zero.
- `Final qty` should be blank or zero.
- Current State and Simulation KPIs should be equal.
- The user can then run a scenario.

---

## Smart Replenishment Buttons

The interface needs one block called either:

- Smart Replenishment
- AI Replenishment

It contains three buttons.

### 1. Inventory Optimization

Goal: reduce unnecessary stock while maintaining acceptable service.

Behavior:

- Lower target cover multiplier
- Prioritize avoiding overstock
- Avoid replenishing slow-moving SKUs unless stockout risk is high
- Respect DC free stock, store capacity, pack multiple, lifecycle, and assortment constraints

Expected outcome:

- Lower inventory increase
- Fewer unnecessary shipments
- Some remaining lost sales risk may be acceptable

### 2. Lost Sales Recovery

Goal: minimize lost sales.

Behavior:

- Higher target cover multiplier
- Prioritize stockout rows
- Prioritize high revenue and high gross margin risk
- Prioritize promo SKUs and high-demand SKUs
- Use available DC stock to recover the most commercial value

Expected outcome:

- Higher replenishment quantity
- Lower out-of-stock risk
- Higher store inventory

### 3. Optimal Recommendation

Goal: balanced default recommendation.

Behavior:

- Optimize gross margin recovery first
- Include service level target
- Penalize excess inventory
- Penalize inefficient logistics
- Respect all constraints

Expected outcome:

- Best default scenario for business users
- Balanced inventory and availability

---

## Recommendation Logic

Use transparent deterministic logic for the prototype. It does not need a real machine learning model.

For every store-SKU row:

### Step 1: Load data

Join the following files:

- `store_inventory.csv`
- `stores.csv`
- `sku_master.csv`
- `dc_inventory.csv`
- `assortment.csv`
- `forecast_next_28d.csv`
- `promo_calendar.csv`
- `open_orders.csv`
- `capacity_rules.csv`
- `data_quality_issues.csv`

Use `store_id` and `sku_id` as the main join keys.

### Step 2: Calculate demand need

Use the 7-day and 14-day forecast because planning is daily but delivery frequency is weekly.

Suggested prototype formula:

```text
planning_horizon_days = 7 + delivery_lead_time_days
forecast_demand = forecast_daily_sales_base * planning_horizon_days
adjusted_forecast_demand = forecast_demand * seasonal_index * (1 + promo_uplift_pct)
```

If `forecast_next_14_units` is available, it can be used directly as a practical proxy.

### Step 3: Calculate target stock

```text
target_stock = adjusted_forecast_demand * scenario_target_cover_multiplier + min_presentation_qty
```

Then cap target stock by:

- `store_sku_capacity_units`
- category hard capacity
- lifecycle and replenishable flag

### Step 4: Calculate raw need

```text
raw_need = target_stock - stock_on_hand - in_transit_qty
```

Then:

```text
raw_need = max(0, raw_need)
```

### Step 5: Apply pack multiple

Use `pack_multiple` from `sku_master.csv`.

```text
recommended_qty = ceil(raw_need / pack_multiple) * pack_multiple
```

If raw need is very small and rounding would create overstock, allow the scenario to recommend zero.

### Step 6: Score rows for scarce DC stock

When total demand for a SKU exceeds DC free stock, allocate stock to the highest-value rows first.

Recommended priority score:

```text
priority_score =
  expected_lost_margin_recovery
  * forecast_confidence
  * store_sku_priority
  * service_level_target
  * promo_factor
  - overstock_penalty
  - logistics_penalty
```

For a prototype, this can be simplified to:

```text
priority_score =
  margin_at_risk
  * forecast_confidence
  * store_sku_priority
  * (1 + promo_uplift_pct)
```

### Step 7: Constrained allocation

For each SKU:

1. Sort store rows by priority score descending.
2. Allocate recommended quantity while DC free stock remains.
3. Respect pack multiple.
4. If the remaining DC free stock is smaller than the pack multiple, recommend zero for remaining rows.
5. Add reason code `DC shortage allocation` for rows that were reduced due to scarcity.

---

## Required Table

The main working table should have one row per ranged store-SKU.

Each row starts with a selection checkbox.

Required columns:

- Store
- Category
- SKU
- Product description or style-color-size
- System recommended quantity
- Final quantity
- Stock on hand
- In-transit quantity
- Average daily sales
- Forecast next 7 days
- Forecast next 14 days
- Days of cover
- Projected days of cover after replenishment
- Days to delivery
- Pack multiple / MOQ
- DC total stock
- DC free stock
- Revenue at risk
- Margin at risk
- Expected recovered revenue
- Expected recovered margin
- Forecast confidence
- Promo flag
- Risk level
- Reason code
- Constraint status
- Comment

The user should be able to filter important columns.

For the prototype, prioritize filters for:

- Store
- Category
- SKU
- Risk level
- Reason code
- Constraint status
- Promo flag
- Manual override
- Data issue
- Final quantity greater than zero

Full Excel-style filtering for every column is useful but not required for the first version.

---

## Manual Override Behavior

The user can manually edit `Final qty`.

When `Final qty` differs from `Sys. recommended qty`:

- Mark the row as manually revised.
- Require a comment.
- Immediately recalculate Simulation KPIs.
- Do not allow approval unless the comment is present.

---

## Approval Behavior

There should be two approval buttons:

### Approve All

Approves all currently visible or all valid rows, depending on UI wording.

Recommended wording:

- `Approve all valid rows`
- Avoid approving blocked rows.

### Approve Selected

Approves only selected rows.

Before approval, show a confirmation modal.

Required modal text:

```text
You are going to approve replenishment for:

Stores: __
SKUs: __
Total replenishment units: __
Inventory value: __
Expected recovered revenue: __
Expected recovered margin: __
Rows with manual override: __
Blocked rows excluded: __

Confirm to proceed?
```

Buttons:

- Confirm
- Cancel

After Confirm, show a second modal:

```text
Create shipping documents for approved rows?
```

Options:

- Yes, create by route and delivery date
- No, approval only

---

## Approval Blocking Rules

Approval must be blocked at row level when:

1. Final quantity is higher than DC free stock available after allocation.
2. Final quantity is not a multiple of pack multiple / MOQ.
3. Final quantity was manually changed but comment is empty.
4. Store-SKU is not ranged in `assortment.csv`.
5. SKU is not replenishable.
6. Projected store-SKU stock exceeds hard SKU capacity.
7. Projected category stock exceeds hard category capacity.
8. There is a blocker-level data quality issue.

Warnings should be allowed but visible.

Examples of warning cases:

- Low forecast confidence
- Soft capacity exceeded
- Promo uplift unusually high
- DC free stock low after approval
- Forecast bias detected

---

## Shipping Documents

For this prototype, shipping documents should be created by:

```text
route_id + delivery_date + store_id
```

This is the best approach because it supports DC picking, loading, transport routing, and store receiving.

Generate shipping documents as CSV files.

Recommended output fields:

- shipping_doc_id
- approval_id
- route_id
- delivery_date
- store_id
- store_name
- sku_id
- style_color_size
- category
- approved_qty
- pack_multiple
- unit_cost
- selling_price
- total_cost_value
- total_retail_value

Save them in a generated output folder, for example:

```text
data/runs/2026-05-15/outputs/shipping_docs/
```

---

## CSV Simulation Loop

The prototype must support repeated simulated runs over time.

Each time an approval is completed, generate a new CSV package for the next simulated business day.

Example folder flow:

```text
data/runs/2026-05-15/input/
data/runs/2026-05-15/output/
data/runs/2026-05-16/input/
data/runs/2026-05-16/output/
```

The next day input package should reflect the previous approval.

### After approval, update the next package as follows

#### `dc_inventory.csv`

For approved rows:

```text
dc_free_stock = dc_free_stock - approved_qty
dc_reserved_stock = dc_reserved_stock + approved_qty
```

When shipping is created, either keep as reserved or move it into open orders depending on implementation simplicity.

#### `open_orders.csv`

Create one row per approved store-SKU shipment.

Fields:

- order_id
- store_id
- sku_id
- order_qty
- ship_date
- expected_arrival_date
- status

Use delivery date based on store weekly delivery day.

#### `store_inventory.csv`

At minimum:

- Keep `stock_on_hand` as current minus simulated daily sales.
- Add approved shipments to `in_transit_qty`.

When an open order reaches its expected arrival date:

```text
stock_on_hand = stock_on_hand + order_qty
in_transit_qty = in_transit_qty - order_qty
open_order.status = Delivered
```

#### `sales_history_28d.csv`

Simulate one new day of sales using forecast.

Suggested simple formula:

```text
daily_sales = random demand around forecast_daily_sales_base
actual_sales = min(daily_sales, stock_on_hand)
```

Append the simulated sales row.

Keep only the latest 28 days for active simulation.

#### `forecast_next_28d.csv`

Refresh the forecast after simulated sales.

For the prototype, this can be simple:

- Slightly adjust forecast up if recent sales exceed forecast.
- Slightly adjust forecast down if recent sales are below forecast.
- Keep promo uplift if promo is still upcoming or active.
- Update confidence slightly based on forecast error.

#### `simulation_state.csv`

Advance `run_date` by one day.

Record:

- previous package
- new package
- approved scenario
- number of approved rows
- total approved units
- total retail value
- total cost value

---

## Capacity Approach

Use three capacity layers.

### 1. Store receiving capacity

From `stores.csv`:

- `receiving_capacity_units_per_delivery`

This limits how many total units a store can receive in one delivery.

### 2. Store category capacity

From `capacity_rules.csv`:

- `soft_capacity_units`
- `hard_capacity_units`

Soft capacity creates a warning.

Hard capacity blocks approval.

### 3. Store-SKU capacity

From `assortment.csv`:

- `store_sku_capacity_units`

This prevents unrealistic overfilling of one SKU.

---

## Optimization Approach

The best default approach is:

```text
gross-margin-weighted service-level optimization with inventory penalty
```

Plain-language explanation:

The system should prioritize SKUs and stores where replenishment is likely to protect profitable sales, while avoiding excess inventory and respecting operational limits.

The three scenarios use different weights:

### Inventory Optimization

Prioritize:

- Lower inventory
- Lower overstock
- Reduced unnecessary shipments

### Lost Sales Recovery

Prioritize:

- Revenue at risk
- Margin at risk
- Stockout risk
- Promo demand

### Optimal Recommendation

Prioritize:

- Gross margin recovery
- Service level
- Practical inventory level
- Capacity and logistics constraints

---

## Reason Codes

Every recommended row should have one or more reason codes.

Use these:

- Low days cover
- Projected stockout
- Promo uplift
- Demand spike
- Forecast under-call correction
- Store priority
- DC shortage allocation
- Pack multiple rounding
- Capacity capped
- Soft capacity warning
- Hard capacity blocked
- No replenishment needed
- SKU not replenishable
- Not ranged
- Data issue
- Manual override

---

## Risk Levels

Use simple risk levels:

- Low
- Medium
- High
- Blocked

Suggested logic:

### Blocked

Any approval-blocking issue exists.

### High

- Days cover <= 2
- High margin at risk
- Stockout projected before next delivery
- Promo active/upcoming with low stock

### Medium

- Days cover below target but not urgent
- Forecast confidence low
- DC stock limited

### Low

- Healthy cover
- No major issue
- No urgent replenishment need

---

## UI Requirements

The interface should be clean, modern, and business-facing.

The attached screenshot is a style reference only, not a functional reference.

Style direction:

- Dark, modern planning cockpit
- Clear KPI cards
- Scenario buttons
- Compact but readable data table
- Strong filter/search area
- Row-level status badges
- Right-side explanation drawer
- Clear approval modal
- Minimal clutter

The app should work well on a Mac laptop screen.

---

## Recommended Pages / Views

### 1. Main Workspace

This is the primary screen.

Sections:

- Header
- Refresh button
- Current State KPI block
- Simulation KPI block
- Smart Replenishment button block
- Filters
- Working table
- Approval buttons
- Row explanation drawer

### 2. Data Issues View

Shows:

- blocker issues
- warning issues
- affected store-SKU rows
- issue description
- whether issue blocks approval

### 3. Scenario Comparison View

Shows:

- Current State
- Inventory Optimization
- Lost Sales Recovery
- Optimal Recommendation
- Manual Plan

Compare:

- total replenishment units
- inventory value
- lost sales
- recovered revenue
- recovered margin
- OOS %
- constraint violations

### 4. Run History View

Shows generated simulation days and approved scenarios.

---

## Recommended Technical Stack

Use a simple, local-first stack.

Preferred stack:

- Next.js
- TypeScript
- React
- Tailwind CSS
- Local CSV files
- Node.js API routes or server actions
- No external database required for first prototype

Reason:

- Easy to run locally on Mac
- Good for dashboard-style interfaces
- Can read and write CSV files locally
- Suitable for later deployment if needed

If a database is needed later, use SQLite. Do not add it unless required.

---

## Suggested Project Folder Structure

```text
flowstock/
  AGENTS.md
  README.md
  package.json
  next.config.js
  tsconfig.json
  tailwind.config.ts
  postcss.config.js
  .gitignore
  .env.example

  public/
    favicon.ico

  data/
    seed/
      replenishment_mock_csv_package/
        stores.csv
        sku_master.csv
        dc_inventory.csv
        assortment.csv
        store_inventory.csv
        sales_history_28d.csv
        forecast_next_28d.csv
        promo_calendar.csv
        open_orders.csv
        capacity_rules.csv
        optimization_parameters.csv
        data_quality_issues.csv
        approval_history.csv
        manual_overrides.csv
        simulation_state.csv
        file_manifest.csv

    runs/
      2026-05-15/
        input/
        output/
          approved_replenishment/
          shipping_docs/
          next_package/

  src/
    app/
      page.tsx
      layout.tsx
      globals.css

      api/
        refresh/
          route.ts
        recommend/
          route.ts
        approve/
          route.ts
        simulate-next-day/
          route.ts
        export/
          route.ts

    components/
      layout/
        AppHeader.tsx
        Sidebar.tsx

      kpi/
        KpiCard.tsx
        KpiPanel.tsx
        DeltaBadge.tsx

      replenishment/
        ScenarioButtons.tsx
        ReplenishmentTable.tsx
        TableFilters.tsx
        RowStatusBadge.tsx
        QuantityEditor.tsx
        ApprovalBar.tsx
        ApprovalModal.tsx
        ShippingDocsModal.tsx
        RowExplanationDrawer.tsx

      data-issues/
        DataIssuesPanel.tsx

      scenario/
        ScenarioComparison.tsx

      common/
        Button.tsx
        Card.tsx
        Modal.tsx
        Badge.tsx
        Select.tsx
        SearchInput.tsx

    lib/
      csv/
        readCsv.ts
        writeCsv.ts
        csvSchemas.ts

      domain/
        types.ts
        joins.ts
        kpiCalculations.ts
        replenishmentEngine.ts
        scenarioWeights.ts
        constraints.ts
        riskScoring.ts
        reasonCodes.ts
        simulationEngine.ts
        shippingDocuments.ts
        dataQuality.ts

      utils/
        dates.ts
        numbers.ts
        formatters.ts
        filePaths.ts

    styles/
      theme.ts

  tests/
    replenishmentEngine.test.ts
    constraints.test.ts
    kpiCalculations.test.ts
    simulationEngine.test.ts
```

---

## Implementation Priorities

Build in this order.

### Phase 1 — Data loading

- Create app shell
- Load CSV files from `data/seed/replenishment_mock_csv_package`
- Join rows into working table
- Show Current State KPIs
- Show table with filters

### Phase 2 — Recommendation scenarios

- Add three scenario buttons
- Implement deterministic replenishment logic
- Populate `Sys. recommended qty`
- Copy system qty into `Final qty`
- Calculate Simulation KPIs

### Phase 3 — Manual overrides

- Allow editing Final Qty
- Require comment if changed
- Recalculate Simulation KPIs immediately

### Phase 4 — Approval validation

- Add Approve Selected
- Add Approve All Valid
- Validate constraints
- Show approval modal
- Write approval outputs

### Phase 5 — Shipping docs

- Generate route/date/store-based shipping document CSVs
- Save to output folder

### Phase 6 — Simulation loop

- Generate next-day CSV package
- Update inventory, open orders, sales, forecast, and simulation state
- Allow Refresh to use the latest generated package

---

## Definition of Done

The prototype is complete when:

1. It runs locally on Mac.
2. It loads the provided CSV package.
3. It displays Current State KPIs.
4. It displays the working replenishment table.
5. All three smart replenishment buttons generate different recommendations.
6. Simulation KPIs update after each scenario.
7. Manual quantity edits update Simulation KPIs.
8. Manual override comments are required.
9. Approval blocks invalid rows.
10. Approval confirmation modal shows business summary.
11. Shipping document CSVs can be generated.
12. A next-day CSV package can be generated after approval.
13. Refresh can load the next generated package.
14. The interface is clean and understandable for a non-technical business user.

---

## Important Product Principles

- Do not build a static mockup. Build a working prototype.
- Do not hide the recommendation logic. Make it explainable.
- Do not approve rows with invalid constraints.
- Do not optimize only for revenue. Use gross margin, service level, and inventory risk.
- Do not treat DC total stock as available stock. Use DC free stock.
- Do not recommend SKUs outside fixed store assortment.
- Do not ignore pack multiple / MOQ.
- Do not make the user inspect every row. Highlight exceptions.
- Do not require a database unless absolutely necessary.
- Keep the app easy to run locally on Mac.
