# FreshRetailNet-50K data card

Publisher: Dingdong-Inc. Source: https://huggingface.co/datasets/Dingdong-Inc/FreshRetailNet-50K

Source revision: `08c1fab7f9257bc73679d415d65d644165d351d4`. Retrieved 19 September 2026. Verified `license: cc-by-4.0` and the licence statement in the retrieved publisher README. Licence: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Attribution: Dingdong-Inc, *FreshRetailNet-50K: A Stockout-Annotated Censored Demand Dataset for Latent Demand Recovery and Forecasting in Fresh Retail*, Wang et al., 2025, https://arxiv.org/abs/2505.16319. Flowstock adds a selected-store subset, forecasting transformations and a synthetic grocery display/operations overlay. No endorsement implied.

## Observed data and split

70 selected stores, 556 encoded source products, 765,810 rows from the publisher train file. Publisher eval file retains 59,563 rows for those stores separately. Full source history: 2024-03-28 through 2024-06-25.

- Training: 2024-03-28–2024-05-26 (60 days).
- Validation: 2024-05-27–2024-06-10 (15 days).
- Untouched test: 2024-06-11–2024-06-25 (15 days).

Selection uses only training-window coverage (at least 80% of dates), positive demand, then coverage, observation count and a seed-42 hash tie-break. The manifest contains selected IDs, excluded store count, observed dtypes and revision. Product counts remain usable source products rather than a fixed catalogue size. Row-group smoke mode observed one store, 12 products and 1,000 training rows; it is deliberately a connectivity/schema check, not a representative selection.

## Schema and transformations

Original fields: city_id, store_id, management_group_id, first_category_id, second_category_id, third_category_id, product_id, dt, sale_amount, hours_sale, stock_hour6_22_cnt, hours_stock_status, discount, holiday_flag, activity_flag, precpt, avg_temperature, avg_humidity, avg_wind_level. Raw selected rows retain original daily/hourly structure, identifiers, numeric values and context in Parquet. No actual names or category semantics are known.

`catalogue()` makes a stable one-to-one synthetic grocery display mapping. Encoded source hierarchy stays separate from department/category presentation. Weight/volume, names, unit labels, case packs, temperatures, shelf-life/waste bands, prices, costs, margins, inventory, receiving/capacity rules, delivery routes and schedules are synthetic. Names include source IDs to ensure uniqueness without suggesting decoded identities.

Normalized sales are never claimed to be physical units. `scale10-v1` maps one normalized amount to 10 synthetic operational quantities for allocation demonstration. The factor is fixed, arbitrary and explicit, not recovered from publisher normalization. Commercial currency is synthetic EUR. Forecast evaluation stays in source normalized scale; margin/service simulation uses the converted operational scale consistently.

## Limitations and privacy

Fresh/perishable retail demand only. Ninety days do not support annual seasonality claims. Stockouts censor sales; excluded training horizons and separate evaluation segments do not establish true latent demand. Weather and contemporaneous future stockout/promotion values are preserved but not used as unknown-at-prediction-time features. Encoded store/product data, no customer-level or personal data is imported. Generated product names are presentation only. Real inventory, allocation outcomes and causal profit are unavailable.

Raw/curated Parquet, model artifacts and local registries stay gitignored. Committed demo CSVs are independently synthetic and reproducible without credentials. Historical legacy seed files are outside active grocery data roots. Do not use simulated margin as real ROI evidence. See data_contract.json, freshretailnet_manifest.json and model_card.md.
