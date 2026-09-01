# Observability and Operations

## 1. Goals

- Diagnose failures without exposing workbook content.
- Reconstruct what stage/version/config produced a result.
- Detect authorization, reliability, performance, and cost regressions.
- Support rollback/recovery decisions with evidence.

## 2. Structured event fields

Allowlisted common fields:

```text
timestamp
level
eventName
applicationVersion
environment
correlationId
actorUserId (internal opaque or hashed as policy requires)
projectId / caseId (opaque)
uploadId / importJobId / datasetId / reviewRunId / reportId
stage
ruleId / ruleVersion (no source values)
durationMs
attempt
outcome
errorCode
counts (bounded aggregate only)
```

Never log raw source rows/cells, original object keys, signed URLs, auth headers/cookies, secrets, comments, AI prompt/content, or full report text.

## 3. Event catalog

### Access

- `auth.identity_resolved`
- `auth.required`
- `auth.denied`
- `membership.changed`

### Upload/import

- `upload.intent_created`
- `upload.bytes_received`
- `upload.validation_rejected`
- `upload.finalized`
- `upload.reconciliation_needed`
- `import.stage_started/completed/failed`
- `mapping.confirmed`
- `dataset.ready`

### Review

- `review.created`
- `review.stage_started/completed/failed`
- `review.rule_summary`
- `review.contextual_unavailable`
- `review.completed/cancelled`

Avoid one production log line per row/finding. Use aggregate summaries and sampled safe diagnostics only under an approved debug mode.

### Triage/report

- `finding.state_changed`
- `adjustment.created/revoked`
- `report.generated/approved/rejected/downloaded`

### Operations

- `migration.applied/failed`
- `retention.cleanup_summary`
- `deletion.started/partial/completed`
- `deployment.smoke_passed/failed` in release evidence where supported.

## 4. Metrics

Safe aggregate metrics:

- request/error/denial counts by safe route/action code;
- upload rejection classes;
- import/review/report duration by stage and size bucket;
- rule evaluated/skipped/failed/finding counts by rule version;
- contextual-provider availability/latency without content;
- D1/R2 operation failures;
- optimistic conflicts;
- orphan/retention cleanup counts;
- client performance and ThreeUI error/fallback counts only if privacy-safe and approved.

Do not treat Sites built-in traffic analytics as application audit or product-correctness telemetry.

## 5. Correlation and support

- Generate/propagate one correlation ID per request/operation.
- Long jobs also have stable job/run IDs.
- Show safe correlation ID on user-facing failures.
- Support asks for project/case/job/run IDs, not source screenshots/content unless explicitly authorized.
- Provide an admin diagnostic view with safe states/versions/errors.

## 6. Alert candidates

Define final thresholds after baseline. Initial candidates:

- repeated `INTERNAL_ERROR` or binding failures;
- spike in authorization denials unrelated to known testing;
- upload/import failure rate above normal;
- stuck leases/jobs beyond configured age;
- active rule execution failures;
- report checksum/store failure;
- deletion/reconciliation partial failure;
- ThreeUI route crash or leaked WebGL contexts;
- p95 stage duration exceeds approved target.

Every alert needs an owner, severity, runbook, and no confidential payload.

## 7. Operational runbooks

### Stuck import/review

1. Read job/run state, stage, lease expiry, attempt, error code and version.
2. Confirm no active lease remains.
3. Use the supported retry/resume command; do not edit completed results.
4. If data repair is needed, create an explicit repair migration/tool with backup/evidence.
5. Record resolution and regression test.

### R2/D1 reconciliation

1. Query pending upload/report records older than threshold.
2. Resolve exact authorized object keys from D1.
3. Check object existence/metadata without exposing content.
4. Finalize valid operation or delete exact orphan according to policy.
5. Record aggregate/audit event.

### AI outage

1. Disable contextual mode through versioned/admin config if necessary.
2. Keep A/B review available.
3. Mark affected runs with limitation, not false C completion.
4. Avoid uncontrolled retries/cost.
5. Re-enable only after health/contract validation.

### Bad rule release

1. Retire the affected rule/profile version prospectively.
2. Identify impacted runs by version.
3. Do not mutate old runs.
4. Publish a corrected version and regression fixtures.
5. Offer authorized rerun/comparison and disclose the rule change.

### Suspected data exposure

Follow `docs/09_SECURITY_AND_PRIVACY.md`: restrict Site access, preserve safe evidence, rotate secrets, identify scope/version, and redeploy only an approved candidate.

## 8. Backup and recovery

Before a risky migration/deletion/release:

- document export/backup mechanisms available in the actual Sites environment;
- capture schema/migration version and artifact inventory;
- define recovery point and compatibility;
- test restore/rebuild with non-production data where possible;
- inventory R2 objects through authorized D1 metadata, not broad app-code bucket listing.

Do not promise recovery objectives until platform capabilities are verified.

## 9. Support/admin view

Authorized view may show:

- application/schema/rule versions;
- binding availability;
- failed/stuck jobs with safe IDs/stages/error codes;
- last successful cleanup;
- profile status;
- audit query/export.

It must not expose raw workbook content by default or offer arbitrary SQL/object browsing.

## 10. Operational acceptance

- Every core failure returns a correlation ID and safe code.
- Representative failure injections are diagnosable from safe state/logs.
- Stuck/orphan/retry paths are tested.
- Rule and app versions trace every run/report.
- Runbooks are linked from release and incident processes.
