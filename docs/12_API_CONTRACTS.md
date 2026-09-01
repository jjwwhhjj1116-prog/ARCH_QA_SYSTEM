# API Contracts

This document defines transport-independent contracts. Implement them as HTTP JSON routes or supported full-stack server actions in the chosen Sites starter.

## 1. Conventions

- Current local namespace: `/api`. Introduce a versioned namespace before a
  public compatibility commitment; do not pretend `/api/v1` exists today.
- JSON uses camelCase; database uses snake_case.
- IDs are opaque strings.
- Timestamps are UTC ISO-8601.
- Decimal quantities are canonical strings, never JSON floating-point truth.
- Null means absent/unknown and remains distinct from numeric zero.
- Protected operations derive the actor from verified server identity.
- Every current response exposes a safe top-level `requestId` and
  `x-request-id`; do not expose internal storage identifiers.
- List endpoints use cursor pagination with a bounded limit.
- Mutable commands require aggregate `version`/`If-Match`.
- Costly create/finalize actions accept an idempotency key.

## 2. Success and error envelopes

Success:

```json
{
  "data": {},
  "requestId": "req_..."
}
```

List:

```json
{
  "data": [],
  "page": { "nextCursor": "opaque-or-null", "limit": 50 },
  "requestId": "req_..."
}
```

Error:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "입력값을 확인해 주세요.",
    "requestId": "req_...",
    "details": [
      {
        "field": "mapping.fields.unit",
        "code": "REQUIRED",
        "message": "단위를 지정해 주세요."
      }
    ]
  }
}
```

Never return stack traces, SQL, R2 keys, auth details, or source-row dumps.

## 3. Standard status mapping

| Code                         | Typical status |
| ---------------------------- | -------------: |
| `AUTHENTICATION_REQUIRED`    |            401 |
| `FORBIDDEN`                  |            403 |
| `NOT_FOUND`                  |            404 |
| `VALIDATION_FAILED`          |        400/422 |
| `CONFLICT` / `STALE_VERSION` |            409 |
| `UNSUPPORTED_FILE`           |        415/422 |
| `FILE_LIMIT_EXCEEDED`        |        413/422 |
| `RATE_LIMITED`               |            429 |
| `INTERNAL_ERROR`             |            500 |

Use the status conventions of the verified framework consistently.

## 4. Project endpoints/use cases

### List projects

`GET /projects?status=&query=&cursor=&limit=`

Returns only projects for which the actor has active access.

### Create project

`POST /projects`

```json
{
  "projectCode": "P-2026-001",
  "name": "현장명",
  "clientName": "발주처",
  "location": "서울",
  "grossFloorArea": { "value": "12345.67", "unit": "m2" },
  "timezone": "Asia/Seoul"
}
```

### Update/archive/restore

Require `version`. Return the updated version. Archive/restore are explicit commands, not an overloaded generic patch.

## 5. Membership

- List: viewer and above.
- Add/change/revoke: owner/admin according to policy.
- Cannot revoke the last active owner.
- Every action is audited.
- Do not expose membership for unauthorized projects.

## 6. Review cases

Create:

```json
{
  "name": "마감 물량 1차 검토",
  "profileKind": "FIN",
  "description": "도급내역 2026-09"
}
```

Profile kind becomes immutable after source/review history according to policy.

## 7. Upload protocol

The current local Phase 2A boundary follows ADR-004. Metadata intent and one
authorized byte snapshot are separate requests; byte inspection, private R2
write and D1 completion occur inside the same bounded PUT operation.

### Create source-package intents

`POST /api/projects/{projectId}/cases/{caseId}/source-packages`

`Idempotency-Key` is required and scoped by project, case and actor. A package
contains 1..32 declarations:

```json
{
  "displayName": "1차 산출서와 집계표",
  "files": [
    {
      "filename": "내부산출서.xlsx",
      "contentType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "sizeBytes": 824110,
      "purpose": "quantity_source"
    }
  ]
}
```

The response returns package state, project-identity state and per-file opaque
upload/source IDs. It never returns an R2 key, object URL, client checksum or
server filesystem path. Reusing a key with the same canonical request returns
the existing package and its actual current states; a different request is 409.

### Store and complete one source file

`PUT /api/uploads/{uploadId}/bytes`

`Content-Type: application/octet-stream`

- reauthorizes active membership and `source:upload` against the package scope;
- bounds the stream by the declared size and the 20 MiB source limit;
- inspects one immutable snapshot, derives SHA-256 and writes the same bytes;
- rejects extension/type/signature/CRC/ZIP path/expansion/active-content errors;
- finalizes D1 only after the exact private R2 write succeeds;
- returns safe stored/package states, checksum, size and warning codes;
- accepts an identical-byte retry and rejects different bytes at the immutable key.

There is intentionally no separate public finalize endpoint in this slice. A
failed or stale claim can be retried, but automatic R2/D1 reconciliation and
expired-object cleanup remain mandatory before Gate 2.

### Abort/retry

Explicit abort, status and cleanup endpoints are not implemented. Current retry
reuses the same upload attempt after a recorded failure, or reclaims an
`uploading` claim older than five minutes. A later reconciliation design must
preserve history and use exact scoped keys.

### Current Phase 2A limitations

- `stored_unverified` is not mapping or review readiness.
- XLSX preflight validates ZIP/XML structure and prohibited content, not sheets,
  cells, formulas, merged ranges or header semantics.
- CSV currently requires UTF-8 and does not yet expose delimiter/encoding
  override.
- Project identity is pending; checksum duplicate decision UI is absent.
- No mapping, canonical dataset or deterministic FIN/RC review output exists.

## 8. Import inspection and mapping

### Start/continue inspection

Creates or claims an import job. If processing must be chunked, the server returns current state and the UI calls a bounded authorized continue action.

### Sheet inventory

Bounded metadata plus sampled preview:

```json
{
  "sheetId": "sh_...",
  "name": "마감수량",
  "visibility": "visible",
  "rowCount": 1024,
  "columnCount": 24,
  "formulaCount": 180,
  "candidateHeaderRows": [3, 4],
  "preview": {
    "columns": ["A", "B", "C"],
    "rows": [{ "rowIndex": 4, "cells": ["층", "품명", "수량"] }],
    "truncated": true
  }
}
```

### Save mapping draft

Requires version. Entries include source column, canonical field, confidence/reason, unit behavior, transform, and user-confirmed state.

### Confirm mapping

Validates required fields, duplicate targets, unit/floor/exclusion rules. Confirmation creates an immutable version.

### Normalize

Idempotent start/continue. Returns state, truthful progress, diagnostic counts and dataset ID when ready.

## 9. Review configuration and runs

### Confirm configuration

```json
{
  "profileVersionId": "rpv_...",
  "enabledRules": ["FIN-CALC-001", "FIN-SUM-002"],
  "ruleOverrides": {
    "FIN-CALC-001": {
      "absoluteTolerance": "0.01",
      "relativeTolerance": "0.001"
    }
  },
  "typicalFloorCohorts": [
    { "id": "typical-a", "floors": ["2F", "3F", "4F", "5F"] }
  ],
  "baselineIds": []
}
```

Server clamps or rejects values outside approved bounds.

### Start run

`POST /cases/{caseId}/review-runs`

Idempotency key required.

```json
{
  "datasetId": "ds_...",
  "configurationId": "cfg_...",
  "adjustmentIds": [],
  "contextualMode": "disabled"
}
```

Response: run ID/state/stage/progress, not inline unbounded results.

### Read/continue/cancel run

- Reauthorize each call.
- Continuation is idempotent and lease-protected.
- Cancellation is valid only in permitted stages.
- Terminal run is immutable.

## 10. Findings

List filters:

```text
state, level, severity, ruleId, floor, zone, category, itemQuery,
assignee, runId, cursor, limit, sort
```

List item contains summary fields only. Evidence loads in detail.

### Finding detail

Includes immutable issue/evidence, mutable projection version, paginated comments/state events, and authorized source-preview actions.

### State transition

```json
{
  "version": 4,
  "toState": "accepted_exception",
  "reason": "특수층 설계 조건으로 수량 차이 인정"
}
```

The server validates actor/state/policy and atomically appends event/audit.

### Comment

Plain text with bounded length. Any edit/delete policy preserves revisions or tombstones.

### Bulk action

Two-stage pattern:

1. preview selection and eligible/ineligible counts;
2. confirm with selection token/version and reason.

## 11. Adjustments

Create:

```json
{
  "datasetId": "ds_...",
  "canonicalRowId": "row_...",
  "fieldName": "declaredQuantity",
  "newValue": { "kind": "decimal", "value": "125.50", "unit": "m2" },
  "reason": "원본 오기 검토용 보정"
}
```

Server loads original/effective values and stores both. Field names are allowlisted. Revoke/supersede is explicit.

## 12. Run comparison

`GET /review-runs/{leftId}/compare/{rightId}`

Both runs must belong to the same authorized case or an explicitly supported comparison scope. Response is paginated and includes metadata deltas and finding continuity classification.

## 13. Reports

### Generate

Idempotent request includes run ID, allowed sections, formats, locale and report-policy version.

### Approval

Requires report version/checksum and optimistic version:

```json
{
  "version": 2,
  "decision": "approved",
  "reason": "필수 검토 항목 확인 완료",
  "expectedSha256": "..."
}
```

### Download

Authorize project/report, then stream or redirect through a short-lived approved mechanism. Use a safe `Content-Disposition` filename.

## 14. Audit

Cursor-paginated with bounded filters. Response metadata is redacted/allowlisted. Audit export is a separate authorized and audited operation.

## 15. Admin contracts

- Profile/rule/alias/tolerance/upload/retention/AI settings are versioned.
- Active versions are immutable.
- Activation/retirement is audited.
- Existing runs retain original version references.
- Admin preview shows affected future behavior.

## 16. Health/diagnostics

Protected or minimally revealing output includes:

- application version;
- schema migration version;
- binding availability booleans;
- environment mode;
- no secret values, project counts, object keys, or stack traces.

## 17. Caching

- Confidential/project responses: private/no-store unless a verified safe policy exists.
- Static versioned assets: cacheable.
- Report/source downloads: no public caching; explicit disposition and type.
- Never cache one user's authorized response for another user.

## 18. Contract tests

- request/response schema validation;
- role/project authorization matrix;
- error code/status stability;
- cursor tamper handling;
- idempotency duplicate/race;
- optimistic conflict;
- decimal string round-trip;
- bounded payload size;
- file/report download headers and authorization.
- wrong actor/project/case/upload identifier and permission revocation;
- declared/actual size and type/signature mismatch;
- ZIP traversal, duplicate paths, ZIP64, encryption, invalid deflate/CRC/XML,
  undeclared expansion, macro/ActiveX/OLE relationship and archive limits;
- immutable R2 same-byte retry and different-byte conflict;
- R2 success/D1 completion failure, failed-state retry and stale claim recovery;
- multi-file partial failure and package idempotency across different cases.
