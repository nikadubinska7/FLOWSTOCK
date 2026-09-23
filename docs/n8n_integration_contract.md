# Future n8n integration contract — v1

No workflow JSON or n8n instance is created. Next.js is the sole HTTP service. Python commands are bounded local jobs; no LLM controls evaluation gates.

## Authentication

Use `Authorization: Bearer $FLOWSTOCK_API_TOKEN` for planner operations and `Authorization: Bearer $FLOWSTOCK_ADMIN_TOKEN` for ingestion, training and model actions. Configure tokens outside source control. Without environment tokens the local server generates `.flowstock/access.json` with restrictive permissions. Do not share or commit that file. `FLOWSTOCK_AUTH_MODE=required` disables the localhost demo session. Local mode bootstraps a same-origin, HttpOnly, SameSite=Strict planner cookie; it is intended only for a single-user machine bound to 127.0.0.1. It never grants administrator access.

## Logical node handoff

1. Schedule/manual trigger → GET `/api/v1/health`.
2. POST `/api/v1/ingest` with `{ "source": "smoke" }` or `freshretailnet` (`offline` generates independent synthetic modelling data without network), admin token, unique `Idempotency-Key`. Poll GET `/api/v1/jobs/{id}`. No dataset contents travel through webhooks.
3. POST `/api/v1/validate` with `{ "snapshot": "sportswear" }`, `latest`, `demo` (legacy grocery fixture), or a completed grocery `model-…` prepared package ID.
4. Optional POST `/api/v1/training` with `{ "source": "freshretailnet" }`; poll job status, retrieve model report. Training creates a candidate only.
5. POST `/api/v1/runs` with `{ "snapshot": "sportswear" }` and `Idempotency-Key`. Response 202 has one `id`, one `plan_id`, `status`, and `approval_state`.
6. GET `/api/v1/runs/{id}?offset=0&limit=100` until `ready`/`failed`; paginate up to 1,000 rows per request. Response contains one summary, weights/version, projected service, expected simulated margin, and per-SKU available/allocated/residual reconciliation.
7. Human review → POST `/api/v1/runs/{id}/override` with `{ "revision": 0, "edits": [{ "id": "001|1", "finalQty": 12, "comment": "Planner adjusted expected demand" }] }`. Use returned revision for later edits. Comments are required; invalid quantities remain blocked for approval.
8. Explicit human confirmation → POST `/api/v1/runs/{id}/decision` with `{ "action": "approve", "row_ids": ["001|1"], "create_shipping": true, "reason": "Reviewed by planner" }`. Reject with action `reject`, empty row list and false shipping. Approval closes the plan, validates server-owned quantities, and consumes the underlying inventory snapshot once, even if another model version supplied its forecasts.
9. GET `/api/v1/runs/{id}/shipping` downloads approved CSV. Not available before approval or when shipping was declined.
10. POST `/api/v1/monitor` with `{}` returns no-evidence status until actual outcomes exist. Optionally reference a locally prepared `.flowstock/outcomes/{batch}.json` with `{ "outcome_batch": "batch" }`. The contract is an array of `actual,predicted,baseline,lower,upper,fallback,store_id,category`; values must use the same documented scale and horizon. The API calculates WAPE, MAE, relative bias, coverage, fallback and prediction shift, including store/category segments.
11. GET `/api/v1/models` → list champion/candidates; GET `/api/v1/models/{version}` → fixed gates, champion comparison and constrained simulation. POST same model URL with `{ "action": "approve", "reason": "Reviewed numeric evidence" }`, administrator token. Separate actions `activate`, `reject`, `rollback`; rollback requires a previously human-approved version. Never connect automatic success branches directly to promotion approval.

## Polling, failure, retry and persistence

No callbacks are implemented. Poll at 1–3 seconds; allow up to 30 minutes for full ingestion/training. HTTP clients can use 30-second individual timeouts. On 409 `BUSY_RETRY`, retry with exponential backoff. Creation idempotency keys are bound to payloads; reuse with different inputs returns 409. Repeated identical decisions return the recorded result. Override revisions prevent overwriting concurrent edits. Unknown fields (including scenario selection) are rejected. Errors have `{ "error": { "code": "…", "message": "…" }, "correlation_id": "…" }`.

This local POC uses filesystem locks and persistent run/job JSON, not a distributed queue. Queued recommendation jobs resume when polled. Interrupted running jobs and stale `.flowstock/write.lock` require operator inspection/restart; do not delete locks or consumed snapshots blindly. A failed shipping/approval write leaves the source snapshot reserved to prevent duplicate shipping. Review partial outputs before recovery. Audit is append-only `.flowstock/audit.jsonl`; local filesystem access is the trust boundary, not tamper-proof compliance storage.

GET `/api/v1/runs` lists the most recent 100 persisted runs for the history view. Formal request schemas are in `docs/openapi.json`.

## Example requests

```bash
curl -s http://127.0.0.1:3000/api/v1/health
curl -s -X POST http://127.0.0.1:3000/api/v1/runs \
  -H "Authorization: Bearer $FLOWSTOCK_API_TOKEN" \
  -H 'Content-Type: application/json' -H 'Idempotency-Key: demo-run-001' \
  -d '{"snapshot":"demo"}'
curl -s "http://127.0.0.1:3000/api/v1/runs/RUN_ID?offset=0&limit=100" \
  -H "Authorization: Bearer $FLOWSTOCK_API_TOKEN"
```

Legacy `/api/recommend` and `/api/approve` return 410 with `USE_RUN_API`. `/api/refresh` remains the browser's read-only snapshot loader. There is no scenario-selection payload in the v1 contract.
