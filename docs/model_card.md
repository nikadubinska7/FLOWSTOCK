# Forecast and opportunity model cards

## Forecast

One global CPU HistGradientBoostingRegressor, fixed seed 42, 80 iterations, 15 leaves, regularization 1. Features: strictly lagged daily sales at 1/7 days, lagged rolling mean/standard deviation/nonzero frequency, past stockout hours, future calendar weekday. No contemporaneous actual promotion, weather, stockout or future sales enter predictors. Missing calendar dates remain missing, not zero demand. Complete feature windows are required.

Target: next 14 calendar days' **normalized sales amounts**; not physical units or recovered true demand. Training excludes horizons affected by known stockouts to avoid treating censored zero sales as unquestioned demand. This conservative exclusion can bias representation: evaluation reports affected and unaffected groups. No claim of latent-demand recovery. Training feature/label windows finish before training cutoff; validation and test label windows lie fully within their own periods. Publisher's separate 7-day eval split is preserved, not mixed into training or the 14-day held-out test.

Baselines: previous 7-day seasonal repeat summed over two weeks, and previous 14-day moving average. The existing moving-average runtime baseline remains champion; the validation-suggested seasonal baseline is recorded without silently switching the current application baseline. Shared chronological cutoffs. No hyperparameter tuning on the test set. Validation selects a suggested winner; promotion additionally rejects test regression against either baseline. This does not refit or retune using the test set.

Range: fixed 90th percentile absolute validation residual about the ML point estimate, lower clipped to zero; empirical coverage reported on test. Not a guaranteed conditional interval. Quality = 1/(1 + residual radius / max(point, .01)), a precision indicator, not probability of correctness. Fallback's 0–2×mean range is uncalibrated and disclosed. Global validation permutation importance supplies controlled signal descriptions; these are not local causal feature attributions.

Models score prepared snapshots; an approved matching version may supply forecasts for that snapshot. Next simulated days clear model scoring metadata and use the deterministic fallback until a new scoring package is prepared. Serialized models are local trusted artifacts, checked by checksum; never load third-party pickle files.

## Opportunity challenger

Global gradient boosting regresses a `proxy_semi_synthetic` opportunity label. Target = min(max(realized normalized horizon sales × synthetic scale 10 − synthetic available inventory, 0), synthetic case pack) × synthetic unit margin. No historical allocation decisions or causal incremental profit exist. Grouped NDCG@5 compares store-product opportunities within the same product and forecast date. Continuous proxy relevance is evaluated; documented ordinal bins support inspection.

The ranking challenger is diagnostic: after aligning its proxy operations with the grocery package it scores NDCG@5 0.9980 versus 0.9949 for the deterministic proxy baseline. This is a small improvement against a semi-synthetic label, not causal evidence. The combined candidate cannot be promoted because the forecast accuracy gate fails. The active allocation priority remains transparent expected marginal margin plus shortage reduction, normalized by total recoverable margin and units. Do not describe proxy NDCG or simulated commercial value as actual financial results.

## Gates and registry

`config/promotion_gates.json`: zero allowed WAPE regression, absolute relative bias ≤0.20, coverage ≥0.98, fallback ≤0.02, at least 20 test cases, data/inference tests passed, and zero constrained-allocation violations. Inspection recomputes allocation feasibility and checks artifact hash. An existing ML champion must have comparable revision/split dates and no worse candidate accuracy; otherwise approval is blocked as insufficient comparable evidence.

States: candidate → approved → champion; rejected and rolled_back retained. Administrator identity and reason recorded for every mutation. Activation is separate from approval. Rollback accepts only a previously approved version. Human review is mandatory even when all numeric gates pass. No LLM is involved.

No live post-deployment outcomes are available. Monitoring reports “not enough evidence” until a referenced outcome batch is supplied. Prediction shift versus baseline is a simple drift diagnostic, not a comprehensive distribution drift detector. Evaluation reports contain store/product/source-category/demand-volume/stockout segments.
