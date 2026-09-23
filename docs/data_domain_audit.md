# Complete data/domain audit

## Before implementation

The repository contained 16 CSV seed files and one README.txt under `data/seed/replenishment_mock_csv_package`; they include encoded fictional apparel SKUs, apparel attributes, sports store labels and promotion descriptions. Existing tests had one apparel row factory. There were no database migrations, notebooks, product images, screenshots, JSON business fixtures or synthetic-data generators. Next.js data and UI modules directly used legacy catalogue/scenario field names.

## Legacy datasets: preserved, never active

| Dataset | Disposition |
|---|---|
| `.DS_Store` | Legacy package retained for audit compatibility; excluded from active loader and all new runs |
| `README.txt` | Legacy package retained for audit compatibility; excluded from active loader and all new runs |
| `approval_history.csv` | Legacy package retained for audit compatibility; excluded from active loader and all new runs |
| `assortment.csv` | Legacy package retained for audit compatibility; excluded from active loader and all new runs |
| `capacity_rules.csv` | Legacy package retained for audit compatibility; excluded from active loader and all new runs |
| `data_quality_issues.csv` | Legacy package retained for audit compatibility; excluded from active loader and all new runs |
| `dc_inventory.csv` | Legacy package retained for audit compatibility; excluded from active loader and all new runs |
| `file_manifest.csv` | Legacy package retained for audit compatibility; excluded from active loader and all new runs |
| `forecast_next_28d.csv` | Legacy package retained for audit compatibility; excluded from active loader and all new runs |
| `manual_overrides.csv` | Legacy package retained for audit compatibility; excluded from active loader and all new runs |
| `open_orders.csv` | Legacy package retained for audit compatibility; excluded from active loader and all new runs |
| `optimization_parameters.csv` | Legacy package retained for audit compatibility; excluded from active loader and all new runs |
| `promo_calendar.csv` | Legacy package retained for audit compatibility; excluded from active loader and all new runs |
| `sales_history_28d.csv` | Legacy package retained for audit compatibility; excluded from active loader and all new runs |
| `simulation_state.csv` | Legacy package retained for audit compatibility; excluded from active loader and all new runs |
| `sku_master.csv` | Legacy package retained for audit compatibility; excluded from active loader and all new runs |
| `store_inventory.csv` | Legacy package retained for audit compatibility; excluded from active loader and all new runs |
| `stores.csv` | Legacy package retained for audit compatibility; excluded from active loader and all new runs |

Historical `data/runs` is preserved but no longer scanned by the grocery loader. `AGENTS.md` and the supplied coding brief remain historical/user instruction sources; grocery requirements supersede conflicting domain instructions. No historical audit records are deleted.

## Active replacements and provenance

- `ml/grocery.py`: deterministic synthetic grocery display/operations generator, unique names and stable source IDs, grocery hierarchy, temperature/shelf-life attributes. The same generator serves demo and imported source packages.
- `data/seed/grocery_demo`: all active CSV entities regenerated, 288 ranged rows / 8 synthetic stores / 36 synthetic products, 28-day independent sales fixture. All demand here is synthetic. File manifest and field-level schema included.
- `ml/pipeline.py`: source Parquet preserved with original identifiers, normalized daily/hourly sales and contextual fields. Locally curated source, publisher eval, manifests and model artifacts are gitignored. Normalized-to-operational conversion is explicitly synthetic.
- `docs/data_contract.json`: each generated target field includes source mapping, type, null policy, origin, validation, unit and downstream use. Encoded real categories stay separate from display hierarchy.
- `tests/testRows.ts`, Python and browser fixtures: grocery terminology and coherent capacities. API tests reference fixture IDs, never actual client identities.
- Working table, drawer, filters, approval outputs, shipping documents and frontend context: use `productName` / `display_product_name`; colour/style/size columns removed from active CSV outputs.
- Scenario selection components and allocation module removed. One server-owned plan per run. Legacy scenario history reader retained only for compatibility.
- README, data/model cards and orchestration contract rewritten for the active grocery domain. No n8n JSON exists.

## Unavailable evidence and unresolved limits

Source product names, semantic categories, currency, costs, inventory, allocation decisions and causal profit are unavailable. All display and commercial attributes remain synthetic. Shelf-life attributes are descriptive rather than a validated expiry/waste model. No actual product imagery exists to replace. The legacy package remains visibly non-grocery if opened directly, but is deliberately isolated and inaccessible through new snapshot selection. Real-data fixtures are not committed.
