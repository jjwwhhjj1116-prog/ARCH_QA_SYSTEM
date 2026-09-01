# ADR-004 — Single-snapshot source upload completion

Date: 2026-09-01

Status: Accepted; supersedes ADR-003

## Context

ADR-003 separated JSON intent creation, byte transfer and finalization. The local
Sites runtime does not provide a client-visible private R2 transfer primitive,
and exposing an object key or accepting a client-supplied checksum would weaken
the lineage boundary. A second finalize call would also require the server to
read the object again, creating another time-of-check/time-of-use boundary.

## Decision

- A set of 산출서와 집계표 is one project- and case-scoped `source_package`.
- `POST /api/projects/{projectId}/cases/{caseId}/source-packages` creates only
  metadata intents and opaque upload IDs.
- `PUT /api/uploads/{uploadId}/bytes` is one authorized, request-bounded
  operation. It claims the attempt, reads one byte snapshot, checks declared
  size and structural safety, derives SHA-256, writes that exact snapshot to
  private R2, and records D1 completion.
- The client never supplies an authoritative checksum and never receives an R2
  key or object URL. The server may return its derived checksum, detected type
  and bounded validation warning codes for local progress and retry UX.
- The canonical object key remains
  `projects/{projectId}/cases/{caseId}/sources/{sourceVersionId}/files/{fileId}.{extension}`.
- Same-byte retry is idempotent. Different bytes at the same immutable key are
  rejected.
- A failed inspection or D1 completion records the attempt as `failed`, which
  can be reclaimed. An `uploading` claim older than five minutes is reclaimable
  with a new correlation ID and optimistic version.
- `stored_unverified` means bytes and structural preflight are complete, not
  that workbook semantics, project identity or review readiness are verified.
- R2/D1 cross-resource reconciliation and expired-object cleanup remain a Gate
  2 requirement. Until implemented, the product remains NO-GO for deployment.
- Masonry bytes remain in immutable lineage and are excluded only in the later
  canonical/review pipeline.

## Consequences

- Hashing and parsing operate on the same snapshot and do not trust client
  summaries.
- A separate public finalize endpoint is intentionally absent in this slice.
- An R2 success followed by D1 failure is recoverable by the failed/stale claim
  retry path because the exact-key R2 adapter accepts only identical bytes.
- Automated reconciliation is still required for abandoned objects and
  repeated D1 outages; the retry path is not a retention policy.
- Full XLSX semantic inspection, mapping and identity matching remain separate
  later stages.

## Verification

- Service tests inject R2 success/D1 completion failure and failed-state write
  failure.
- Browser tests cover viewer denial, a collaborator retry after inspection
  failure, identical-byte retry and different-byte conflict.
- Migration tests verify package/case/project scope and stored-state invariants.
