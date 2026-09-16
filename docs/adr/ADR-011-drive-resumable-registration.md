# ADR-011 — Registration independent of workbook inspection

2026-09-09. User requests no added paid Workers subscription, company Drive
storage for authorized employees, and large drawing attachments. This supersedes
ADR-004's single-request inspection/storage coupling for the direct Drive target.
Legacy Sites/R2 upload remains unchanged.

## Contract (registration slice deployed; inspection promotion outstanding)

- Add an authenticated `/api/uploads/:uploadId/transfer` endpoint: POST initiates
  or reconciles, PUT sends one chunk with `Upload-Offset`, GET reads safe state.
- Chunks are 1 MiB, except the final chunk. Total is at most 200 MiB for
  attachment-only PDF/DWG/DXF; quantity XLSX/CSV retains 20 MiB.
- The server binds each upload to its existing project/case/source version and
  one company Drive connection/file ID. Every operation checks project upload
  permission, active package and expiry. Company tokens/session URLs never leave
  the server. Persist the session encrypted with upload-specific AAD.
- A CAS lease prevents competing chunk requests. Drive's acknowledged range is
  authoritative after interruption. Never blindly allocate another object.
- Downloads also use <=1MiB authenticated ranges. The browser checks the complete
  downloaded SHA-256 before releasing the file. Whole large responses are rejected
  to avoid the CPU failure reproduced in the first live smoke.
- Finalization verifies provider metadata and provider SHA-256, not a browser
  checksum claim alone: the provider checksum must match the browser's native
  SHA-256 of the selected file. Missing provider checksum remains pending. Immutable bytes
  are registered as `uploaded`, with explicit `inspection_pending` (quantity)
  or `attachment_only` evidence. No parser job or review-readiness promotion.
- Existing `stored` sources and reviews remain unchanged. Pending sources and
  attachments cannot enter server parsers/reviews. Full hostile-workbook guards
  remain mandatory before a future inspection promotion.
- Drawing metadata uses a separate `qc_drawing_attachment` table; the original
  XLSX/CSV constraints remain intact. `qc_drive_upload` links either upload kind
  to a private provider session, with application-level scope validation.
- This slice repairs registration, not the later large-workbook inspection
  runtime. Do not describe pending files as ready for AI review.
- No billing changes, new dependencies, automatic deletion, R2 subscription,
  access expansion, or migration of existing company files.

## Verification / rollout

FILE-002/005/007/009, AUTH-001..004, SEC-003, NORM-007: test bounded chunks,
signature rejection, offsets/retry/concurrency, employee versus viewer/other
project access, expired/aborted/replaced scope, no secrets in responses, and
provider checksum/size failure. Apply additive migration locally before release.
Production approval exists in the conversation; deployment still requires tests.
Rollback disables the new client path; keep new uploaded metadata and files for
recovery, never delete the new table or company objects on rollback.
