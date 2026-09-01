# Phase 2A migration results

Canonical sequence:

1. `0001_initial.sql`
2. `0002_ingestion.sql`
3. `0003_ingestion_case_idempotency.sql`

`npm run db:migrate:test` result:

```text
clean migration + idempotency + ingestion scope/invariant verification: PASS
```

The test applies the sequence to an isolated local D1 state, reapplies it,
verifies all ten current tables, checks project/case composite scope, rejects
an invalid stored source version and verifies case-scoped package idempotency.

Rollback policy: migrations are additive. Do not destructively roll back an
environment containing source metadata; stop writes and restore a verified D1
backup plus exact R2 objects instead.
