# Production multi-XLSX storage incident — unresolved runtime capacity

## Verified production evidence

- User's existing batch: 16 XLSX files, UI initially reported 2 stored / 14 NETWORK_ERROR. No source deletion or replacement performed.
- Reused existing batch idempotency key through its visible retry control. No new project/package created.
- Sanitized Wrangler trace (no headers, cookies, source contents or raw errors): one observed upload `outcome=ok, status=200, cpuTime=1282`; another `outcome=exceededCpu, status=503, cpuTime=731`; subsequent failed requests `exceededCpu, status=503, cpuTime=10`.
- Thus network loss was a misleading UI classification: `response.json()` failed on platform-generated non-JSON resource-exhaustion responses.
- CSV MIME hotfix is a separate defect and is not evidence that multi-file XLSX or real AI/report cycle passed.

## Correction and release boundary

- `readUploadResponse` retains HTTP status and safe correlation ID for non-JSON 503/413/429 responses; raw platform pages are not displayed. Empty success is not counted as stored.
- Refreshed server list now removes already-stored files from failure counts. Final live observation before release: 4/16 stored; source selection left untouched, no reload that would lose selected files.
- Validation: lint/typecheck passed; full suite 386 passed before final count-reconciliation addition; final ReviewStudio suite 24 passed including commit-after-response-loss case. Direct Cloudflare build passed.
- Error-reporting release deployed successfully: `8b0cc0f2-b58b-4226-a1dd-97078ca067dc`. This is NOT a claim of runtime capacity resolution or completed XLSX/AI E2E.
- No automatic retries, source overwrites, security-check removal, schema migration, subscription or permission changes.
- Existing ZIP inspection includes full JS inflation, duplicate buffers, bitwise CRC and XML validation. Optimizing these does not establish that realistic workbooks fit a 10ms CPU limit.
- Full XLSX storage remains BLOCKED by runtime CPU capacity. Do not mark FILE-001, real Gemini or report E2E complete.
- Operational choice required: user-approved Workers Paid capacity, or separately approved compute architecture. Never change billing automatically.
- Rollback from this error-reporting release: previous Worker `e77f3b85-eb84-445c-80ef-5e7481774893`; database and Drive data remain compatible.

References: https://developers.cloudflare.com/workers/platform/limits/ and https://developers.cloudflare.com/workers/platform/pricing/ (checked 2026-09-09).
