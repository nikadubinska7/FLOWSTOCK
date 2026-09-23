# Sportswear restoration — 22 September 2026

The original 70-store / 1,200-SKU dataset is the default again. It has 57,114 ranged store-SKU rows. The single-plan allocator, objective weights, model registry, APIs, overrides, human approvals, shipping documents and simulation workflow remain in place. No commits were made.

## Why Simulation initially showed no change

All 140 store-category groups in the original CSVs already held more stock plus in-transit stock than their hard category limits. The old implementation did not enforce those limits; the upgraded engine does. This correctly resulted in zero shipments. A further 8,890 store-SKU rows already exceeded their individual capacities.

The owner selected a corrected working copy. Original CSVs are unchanged. The versioned `sportswear-capacity-v1` adapter writes a copy below `data/local/sportswear_runs/snapshots/`:

- Category hard capacity = maximum of original hard capacity and existing stock plus one store receiving delivery.
- Category soft capacity = maximum of original soft capacity and existing stock, bounded by hard capacity.
- Store-SKU capacity = maximum of original capacity and existing stock. Overstocked rows get no new headroom.
- Duplicated category capacities in stores.csv match capacity_rules.csv.

Only capacity fields in stores.csv, capacity_rules.csv and assortment.csv change. Stock, forecasts, prices, product identifiers, DC balances, sales history, receiving limits and case packs are preserved. A JSON manifest records the source hash, rule version, old/new category capacities and number of adjusted SKU rows. These remain synthetic operational assumptions, not measured store capacities.

## Forecast/model compatibility

Sportswear plans use the original supplied mock forecasts and style-color-size names. Existing grocery candidates, evaluations and human promotion controls are retained, but grocery-trained models are not applied to sportswear. The `demo` API snapshot still means the legacy grocery fixture; `sportswear` selects the corrected sportswear starting package, and `latest` selects its latest simulation day by default. Research packages remain selectable and clearly labelled.

## Simulation compatibility

The original 22,942 open orders total 193,409 units, exactly matching store in-transit stock, but exceed independent DC reserved balances. They are treated as already dispatched. Their arrival moves transit into store stock without debiting the DC again. New Flowstock orders retain the existing reserve-until-arrival accounting and are explicitly marked. The next-day forecast lookup now uses a key map to handle 57,114 rows efficiently; its calculation is unchanged.

## Verified initial plan

| KPI | Current | Simulation |
|---|---:|---:|
| Inventory at cost, including transit | €16,786,591 | €17,660,569 |
| Lost sales risk, 14 days | €1,613,132 | €799,042 |
| Unfulfilled forecast demand | 17.7% | 8.7% |
| DC free stock | 433,498 | 400,086 |
| Replenishment units | 0 | 33,412 |

6,299 rows improve; zero shipment constraint violations. Projected recovered revenue is €814,090 and recovered margin €456,289. These are simulated figures under the unchanged KPI formulas, not realized gains.

The full-package regression checks dataset counts, unchanged inventory/forecast/product/history bytes, allocation feasibility and DC reconciliation, shipping provenance, 4,637 original orders arriving on the next day, correct reservation accounting and successful loading of the next package. Existing grocery and model-control regression tests remain intact. Verification: 23 TypeScript tests and 4 browser journeys pass, including the full sportswear plan in the browser; TypeScript, ESLint and configured formatting checks pass.

## Use

Run `npm run dev` as before. Reload the browser, click **Refresh**, choose **Original sportswear · 70 stores · 1,200 SKUs** for the initial snapshot, then **Generate recommended plan**. After an approval, select **Latest planning day** to plan from updated inventory. A browser reload defaults to the latest planning day.

## Running-session repair — 23 September 2026

A subsequent check of the owner's actual server on port 3000 reproduced 404 responses for its JavaScript and CSS assets. The previous development server, production build and browser-test server shared `.next`, allowing verification to remove files still referenced by the running app. The data and allocation calculation were not the cause of this second failure.

Development now uses `.next-dev`, production build/start uses `.next`, and browser tests use `.next-browser`. A configuration regression test checks this separation. The actual port-3000 browser was then verified to load all 57,114 rows and change Simulation from the initial state to 33,412 replenishment units, €17.7m inventory, €799k lost-sales risk and 8.7% unfulfilled demand, with no browser errors. Only a draft plan was created; no user shipments were approved.

## High-risk zero recommendations — 24 September 2026

The saved plan had 4,832 high-current-risk rows: 3,102 with a positive recommendation and 1,730 with zero. The old table substituted revenue at risk whenever recovered revenue was zero, displayed this as green “Impact”, and sorted it above many genuine recommendations. This put 191 zero-quantity rows among the first 350 shown.

The table now displays actual expected recovered sales, including a neutral €0, and separately labels baseline revenue at risk. Sorting uses actual recovered sales, without substituting risk or imposing a different primary risk order. “Current risk” explicitly describes the pre-plan state. Zero system quantities have a clickable reason with numeric details in the drawer; “High risk · zero qty” provides direct exception access. Reason codes distinguish no need, no DC stock, case-pack limits and specific capacities, and duplicate reason fragments are removed. Copilot and risk explanations use the same zero-recommendation evidence.

Primary causes among the 1,730 zero high-risk rows in this snapshot: 731 cannot obtain a complete pack from initial DC free stock; 381 cannot fit a pack under SKU capacity; 376 are not replenishable; 158 are constrained by store receiving capacity; 68 lose out under scarce-stock allocation; 9 have blocking data issues; 7 have no recoverable demand under the current forecast/arrival calculation. Where multiple constraints apply, the drawer lists them.

Screenshot examples: STR068 / SKU000539 has capacity 7, stock 5, no transit and a pack of 6. Its room is only 2, so a 6-unit shipment would violate capacity. STR026 / SKU001127 has zero free DC stock. STR028 / SKU001180 already has 3 on hand plus 8 in transit against capacity 11. These quantities correctly stay zero. No inventory, capacity or allocation weights were inflated to manufacture shipments. The complete plan remains 33,412 units with zero shipment violations.

The full sportswear regression checks that all 1,730 high-risk zero rows have a specific explanation and all first 350 rows under recovered-sales descending order have positive shipments. Targeted tests cover the screenshot's capacity case, DC scarcity, receiving limits, no-demand cases and sorting.
