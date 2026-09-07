# ADR-006 — Explicit, failure-safe source replacement

Status: accepted for implementation, 2026-09-03. Tasks: QC-UPLOAD-TOP,
QC-SOURCE-REPLACE. Main agent owns UI, ingestion, API, migration and tests;
auth_platform_reviewer supplies read-only concurrency/security review.

## Decision

- Keep the STEP 2 shortcut visible at the upload heading (disabled until an
  eligible stored source exists), as well as the existing bottom shortcut.
- Add an explicit choice between additional upload and replacement. Replacement
  previews and confirms exact package IDs/versions in the selected project/case
  only; other teams and legacy case records are not silently replaced.
- New packages persist immutable replacement targets and a nullable applied time.
  Pending replacement files never count as current review input, even when some
  or all bytes have been stored. Ordinary additional partial uploads are unchanged.
- File PUT continues to own byte inspection, immutable R2 write and D1 completion.
  A separate package POST applies replacement only after every file is stored and
  finalized. This is activation, not a second byte-finalization protocol.
- An atomic D1 batch inserts an audit marker after SQL-level scope, role, target
  version, activity, prior-supersession and complete-byte checks; only that marker
  permits the new package's applied-time update. Failed checks change nothing.
- Old packages are superseded by the applied relationship, not deleted. Current
  input and checklist exclude them; a collapsed previous-version list retains
  filenames and IDs. Original bytes, source versions and prior runs remain intact.
- A duplicate activation is a no-op; overlapping replacements conflict. Pending
  activation can be resumed after refresh without retransmitting stored bytes.

## Migration and recovery

Append two nullable columns; existing rows retain additive-upload semantics. The
repository's applied migrations have no Drizzle snapshots; generate an isolated
baseline/delta for inspection and append only its ALTER statements as 0004.
Do not rewrite 0001–0003 or invent applied snapshot metadata.
No R2 deletion/backfill. After replacement data exists, roll forward or retain
replacement-aware read filtering when rolling application code back: older code
does not understand pending/superseded sources and is not a safe rollback target.

## Verification scope

AUTH-002/003/004, FILE-001/005/007/009, CASE-003, AUD-001/002, SEC-003/004,
UI-001/002/003/004, A11Y-001/002 and REL-002/006. Test complete/partial uploads,
last-target conflict (all-or-none), concurrent replacement, replay, revoked role,
wrong scope, immutable originals, readiness, confirmation and upper navigation.
Only synthetic local data may be used for browser testing; deployment needs
explicit approval. This slice does not claim semantic parsing or AI execution.
