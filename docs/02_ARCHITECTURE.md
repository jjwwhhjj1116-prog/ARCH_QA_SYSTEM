# Architecture

Status: target architecture; verify against the actual Sites starter in Phase 0.

## 1. Architectural drivers

The design prioritizes:

1. reproducible review decisions;
2. immutable lineage and run history;
3. secure project isolation;
4. failure recovery within a request-oriented Sites runtime;
5. testable domain logic independent of hosting;
6. selective, non-blocking ThreeUI enhancements; and
7. incremental delivery through a thin vertical slice.

## 2. Platform assumptions to verify

- Sites supports the chosen JavaScript/TypeScript full-stack project shape.
- D1 is available as the durable relational binding.
- R2 is available for source/report bytes.
- Workspace identity or Sign in with ChatGPT is available for the chosen access model.
- The local project can create a reviewable saved version before deployment.
- The runtime request, CPU, memory, upload, response, and build limits are compatible with the configured file limits.
- No design depends on an always-on process, raw TCP, or an unsupported external database.

Record verified values in `docs/DECISION_LOG.md` and `.env.example`. Do not invent `.openai/hosting.json` identifiers.

## 3. Context diagram

```text
Reviewer / Approver / Admin
          |
          v
FIN & RC Review Studio (Sites)
  |        |         |        |
  |        |         |        +--> Optional AI provider
  |        |         +-----------> Identity headers / platform sign-in
  |        +---------------------> R2: source and report objects
  +------------------------------> D1: projects, imports, runs, findings, audit

Development only:
Codex main agent -> bounded subagents -> code/tests/docs
                 -> ThreeUI MCP or official Community source for selected visuals
```

## 4. Runtime layers

### 4.1 Presentation layer

Responsibilities:

- routes, layouts, forms, tables, detail views, progress, accessible feedback;
- client-side interaction state;
- URL-backed filters and pagination;
- safe formatting of server-provided content;
- lazy ThreeUI enhancement boundaries.

Must not contain authorization, rule truth, direct D1/R2 calls, or mutable copies of canonical business state.

### 4.2 Transport/API layer

Responsibilities:

- parse and validate requests;
- resolve authenticated actor;
- invoke authorization policy;
- call application use cases;
- serialize typed success/error envelopes;
- add correlation IDs and safe response headers.

### 4.3 Application layer

Use cases include:

- create/update/archive project;
- add/remove member;
- create review case;
- initiate/finalize upload;
- inspect/parse/map/normalize source;
- configure/start/cancel/retry review;
- list/read/triage findings;
- create adjustment and rerun;
- compare runs;
- generate/approve report;
- execute retention/deletion.

This layer coordinates transactions and ports but does not embed framework-specific request objects.

### 4.4 Domain layer

Owns:

- canonical quantity row and value types;
- project/case/run/finding/report state transitions;
- review rule interfaces and preconditions;
- decimal-safe calculations and tolerances;
- severity/confidence policy;
- evidence schema;
- permission decisions expressed as policies;
- invariants for immutable source versions and completed runs.

The domain must compile and test without network, browser, D1, R2, Sites, or AI.

### 4.5 Import subsystem

Owns:

- file type/signature validation;
- safe XLSX/CSV reading;
- workbook/sheet inventory;
- header/data range candidates;
- mapping proposals;
- raw-to-canonical normalization;
- import diagnostics and lineage;
- deterministic parser versioning.

### 4.6 Review engine

Owns:

- rule registry and profile versions;
- eligibility/precondition evaluation;
- Level A deterministic rules;
- Level B cohort/statistics rules;
- Level C contextual adapter contract;
- finding assembly/deduplication;
- immutable snapshots and run metrics.

### 4.7 Adapters

Adapters implement ports for:

- D1 repositories and transactions;
- R2 objects and authorized downloads;
- identity/actor resolution;
- AI structured-output client;
- clock and ID generation;
- report renderer;
- safe structured logging.

## 5. Suggested source layout

Use the actual starter's conventions where required. Preserve conceptual boundaries.

```text
src/
  domain/
    ids.ts
    decimal.ts
    quantity.ts
    evidence.ts
    states.ts
    permissions.ts
  import/
    file-guards/
    xlsx/
    csv/
    mapping/
    normalization/
  review/
    core/
    profiles/fin/
    profiles/rc/
    statistics/
    contextual/
  application/
    projects/
    imports/
    reviews/
    findings/
    reports/
  ports/
  adapters/
    d1/
    r2/
    sites-auth/
    ai/
    reports/
  server/
    routes-or-actions/
    middleware/
  ui/
    app-shell/
    projects/
    import-flow/
    review-flow/
    findings/
    reports/
    components/
    threeui/
migrations/
tests/
  fixtures/
  unit/
  integration/
  e2e/
artifacts/qa/
```

If packages are supported cleanly, `domain`, `import`, and `review-engine` may become workspace packages. Do not introduce a monorepo solely for aesthetic separation.

## 6. Dependency rules

Allowed:

```text
ui -> transport types/client
transport -> application -> domain
application -> ports -> adapters (at composition root)
import -> domain canonical model
review -> domain canonical model
adapters -> ports + domain types
```

Forbidden:

- domain importing UI/server/Sites types;
- rules calling D1/R2 directly;
- React components importing raw database repositories;
- AI adapter writing findings without review-engine validation;
- parser returning framework-specific objects;
- business logic reading process/global environment directly.

## 7. Main data flows

### 7.1 Upload and import

```text
authorize project write
  -> create upload intent and R2 object key
  -> receive/store bytes through supported Sites path
  -> checksum + signature + archive guards
  -> create immutable source version
  -> inventory workbook / CSV
  -> user confirms sheets and mapping
  -> normalize in bounded chunks
  -> persist canonical rows + diagnostics
  -> mark dataset ready
```

Transaction boundaries:

- D1 intent creation is atomic.
- R2 write and D1 finalize cannot be one database transaction; use explicit states and reconciliation.
- An orphan-reconciler use case may delete expired unfinalized objects after retention, but only with safe, validated keys.

### 7.2 Review run

```text
authorize case review
  -> validate dataset/profile/config
  -> create queued immutable run snapshot
  -> claim stage with optimistic state transition
  -> load bounded canonical row pages
  -> run Level A and persist staged results idempotently
  -> compute Level B cohorts and persist results
  -> optionally request Level C derived slices
  -> validate contextual output
  -> assemble/dedupe findings and evidence
  -> finalize counts/checksum -> completed
```

If the runtime cannot finish representative data in one request, implement resumable stage/chunk endpoints driven by the authorized UI poller. Each chunk must be idempotent, bounded, and claimed with a lease/version. Do not fake background processing.

### 7.3 Triage and rerun

```text
read finding + version
  -> authorize reviewer
  -> validate state transition / correction
  -> append decision, adjustment, or comment
  -> update mutable projection with optimistic version
  -> append audit event
  -> optional new run snapshots selected adjustments
```

### 7.4 Report

```text
authorize report create
  -> validate run complete and approval blockers
  -> snapshot included decisions/findings
  -> render safe HTML/XLSX/(verified PDF)
  -> checksum + store R2 object
  -> create report version
  -> approver decision
  -> authorized download through server
```

## 8. Consistency model

- D1 is authoritative for metadata/state.
- R2 is authoritative for bytes only after a D1 record reaches `stored`/`available`.
- Source versions, completed runs, rule results, evidence, AI assessments, and generated report versions are immutable.
- Project metadata, mapping drafts, finding dispositions, comments, assignments, and draft reports are mutable through versioned commands.
- Every mutable aggregate uses `version` for optimistic concurrency.
- Event/audit rows are append-only.
- Derived counts are projections and can be rebuilt.

## 9. IDs and references

- Use opaque, non-sequential public IDs (UUIDv7/ULID equivalent supported by the stack).
- Database row IDs may use the same opaque ID to simplify authorization and logs.
- Never infer a project from an untrusted child ID without joining/validating ownership.
- R2 keys are generated server-side and contain opaque IDs, not raw project names or user filenames.
- Correlation IDs are safe to show; object keys and signed URLs are not.

## 10. Decimal and unit architecture

- Parse source numbers into `{ raw, coefficient, scale }` or a reviewed decimal library representation.
- Store a canonical decimal string plus unit code; never use a JavaScript float as the only persisted truth.
- Compare with rule-specific absolute and relative tolerance.
- Unit conversion is a pure service with explicit factor version and dimension class.
- Reject comparisons across incompatible dimension classes.
- Preserve source display and precision in evidence.

## 11. Formula architecture

- Parse only a restricted expression grammar needed for quantity calculations.
- Never evaluate arbitrary Excel formulas or JavaScript.
- Supported first-release operators: numeric literals, parentheses, unary signs, `+ - × * ÷ /`, and configurable count separators where unambiguous.
- Cell references may be read as lineage but evaluated only when the implementation has an explicit safe evaluator and fixture coverage.
- Unsupported functions produce `not_evaluated` diagnostics.
- The rule output includes parsed AST/version, operands, result, declared value, tolerance, and parse limitation.

## 12. Authorization architecture

Every protected use case receives an `Actor` and `ProjectScope`.

```ts
type Actor = {
  subject: string;
  email: string;
  displayName?: string;
};

type ProjectRole = 'owner' | 'reviewer' | 'approver' | 'viewer';
```

Rules:

- authenticate at the server boundary;
- load membership by actor subject/email and project ID;
- authorize the specific action, not merely route access;
- repeat checks for downloads and long-running stage calls;
- prevent an approver from approving when policy disallows self-approval;
- audit denied sensitive actions with safe identifiers.

## 13. AI boundary

The AI adapter accepts a minimized `ContextualReviewRequest` containing derived, typed fields. It does not accept arbitrary raw workbook bytes.

The adapter returns untrusted JSON. The review engine:

1. validates schema and size;
2. validates referenced row/finding/rule IDs exist in the run;
3. clamps confidence to allowed range;
4. removes unsupported claims;
5. adds provenance and `Level C` label;
6. persists the assessment separately from final finding state.

AI unavailability must produce a limitation and allow the run to complete as A/B-only when configured.

## 14. ThreeUI boundary

- Wrap every adopted component behind a local semantic component.
- Lazy-load 3D assets only on approved routes.
- Keep core content rendered before the enhancement.
- Handle `prefers-reduced-motion`, low-power/mobile mode, WebGL failure, and component errors.
- No review rule, API, or state depends on ThreeUI.

## 15. Error architecture

Error classes:

- `AUTHENTICATION_REQUIRED`
- `FORBIDDEN`
- `NOT_FOUND`
- `VALIDATION_FAILED`
- `CONFLICT`
- `UNSUPPORTED_FILE`
- `FILE_LIMIT_EXCEEDED`
- `IMPORT_FAILED`
- `RULE_PRECONDITION_MISSING`
- `REVIEW_FAILED`
- `AI_UNAVAILABLE`
- `EXPORT_FAILED`
- `RATE_LIMITED`
- `INTERNAL_ERROR`

Safe response:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "입력값을 확인해 주세요.",
    "correlationId": "opaque-id",
    "fieldIssues": [{ "field": "mapping.unit", "code": "REQUIRED" }]
  }
}
```

Internal detail goes to safe logs keyed by correlation ID, without source row content.

## 16. Migration architecture

- Numbered, immutable D1 migrations committed with code.
- Forward migration plus data/backfill and recovery/rollback notes.
- Schema version recorded in health/admin diagnostics.
- Additive changes first; deploy code compatible with old/new states when a migration cannot be atomic.
- Destructive column/table changes require explicit backup/export and approval.
- Seed only synthetic reference data and rule catalog versions.

## 17. Build and deployment architecture

1. local lint/type/test/build;
2. migration check on a disposable database;
3. browser E2E and visual/accessibility evidence;
4. source review and secret scan;
5. commit exact source state;
6. save a Sites version associated with that source state;
7. review saved candidate without deployment;
8. explicit user approval;
9. deploy the approved version;
10. set/verify the narrowest audience;
11. production smoke test and rollback readiness.

Never create multiple Sites projects for the same local application. Reuse `.openai/hosting.json` when present.

## 18. Key architectural decisions

Must be resolved in Phase 0 and recorded:

- ADR-001 actual Sites starter and routing/server mechanism;
- ADR-002 parser library and safe formula scope;
- ADR-003 decimal representation;
- ADR-004 request-bounded review execution/chunking;
- ADR-005 workspace identity versus public sign-in;
- ADR-006 report formats and PDF approach;
- ADR-007 AI provider/disabled mode;
- ADR-008 ThreeUI MCP versus Community/no enhancement;
- ADR-009 data retention and deletion;
- ADR-010 approval/self-approval policy.
