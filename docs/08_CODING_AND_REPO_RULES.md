# Coding and Repository Rules

## 1. General standard

Prefer boring, explicit, typed code for business-critical review behavior. Optimize for reproducibility, evidence, auditability, and safe maintenance over clever abstractions.

## 2. Repository hygiene

- Inspect `git status` before and after each task.
- Preserve all unrelated user changes.
- Do not use destructive reset/checkout operations to discard work.
- Keep commits/changes phase-scoped and reviewable.
- Never commit secrets, raw customer workbooks, production exports, signed URLs, or local DB/storage state.
- Generated QA evidence belongs under `artifacts/qa/`; large/transient files are ignored unless intentionally delivered.
- Do not edit generated lock/build artifacts manually.
- Use the repository's existing package manager; do not mix lockfile ecosystems.

## 3. Required scripts

The final repository should expose documented equivalents of:

```text
dev
format / format:check
lint
typecheck
test
test:unit
test:integration
test:e2e
test:a11y
test:security
test:performance
db:migrate
db:migrate:test
build
qa:release
```

If the Sites starter uses different names, document the exact mapping in `README.md` and `artifacts/qa/.../commands.md`.

## 4. TypeScript rules

- Strict type checking.
- Avoid `any`; use `unknown` at untrusted boundaries and validate/narrow it.
- Domain IDs use branded/opaque types where practical.
- Discriminated unions for lifecycle states and result variants.
- Exhaustive `switch` with a never check.
- `null`/missing/invalid/zero are explicit.
- Avoid ambient global business state.
- Environment values are parsed once into a typed config at composition root.
- Export narrow public interfaces; keep implementation details local.

## 5. Validation

Validate at every trust boundary:

- identity headers;
- route/action parameters;
- JSON body/query;
- upload metadata and bytes;
- workbook structures/cell values;
- database JSON snapshots;
- environment config;
- AI output;
- migration/backfill assumptions.

Validation errors use stable codes and field paths. Never expose stack traces or raw source data to clients.

## 6. Decimal and quantity rules

- Do not persist or compare quantity truth using binary floating point alone.
- One reviewed decimal representation across import, rules, DB, and export.
- Decimal strings use a canonical non-locale format in APIs/DB.
- Display formatting is a UI concern.
- Every quantity has an explicit unit/dimension class or is explicitly unitless.
- Rounding and tolerance are rule inputs and evidence.
- Unit conversion functions are pure, versioned, and tested.

## 7. Domain modeling

- Constructors/factories enforce invariants.
- Completed immutable entities have no normal update method.
- State transitions live in domain/application code, not UI conditionals.
- Rules return structured evidence and limitation codes, not only prose.
- Profiles are data/manifests plus registered implementations; version them.
- Do not use exception text as a machine state.

## 8. Database rules

- All schema changes use numbered migrations.
- Foreign keys and uniqueness enforce critical relationships.
- Every project child query includes/validates project scope.
- Use transactions for state + event/audit updates when supported.
- Optimistic concurrency for mutable aggregates.
- Cursor pagination for unbounded lists.
- Select only needed columns; never return raw/unmapped JSON in list endpoints.
- Avoid N+1 evidence/member queries.
- Query-plan check for representative finding/canonical-row filters.
- Store bounded JSON with schema version; do not turn D1 into an opaque document store.

## 9. R2/file rules

- Object keys generated server-side from opaque IDs.
- Validate the resolved key belongs to the project record before read/delete.
- File downloads stream through an authorized path or a narrowly scoped, short-lived platform mechanism.
- Never expose a permanent public source/report URL.
- Checksum every immutable artifact.
- R2/D1 cross-resource operations use explicit pending/finalized/failed states and reconciliation.
- Deletion uses exact literal keys from authorized D1 rows, never broad user-controlled prefixes.

## 10. Parser rules

- Content signature before parser dispatch.
- Bounded archive expansion, sheet/row/column/cell/formula counts.
- No macro, external link, formula, embedded object, or script execution.
- Streaming/bounded reads where library/runtime permits.
- Preview payload is sampled and bounded.
- Source lineage captured during parse, not reconstructed later.
- Parser errors have stable codes and source position where safe.
- Parser library additions require security/maintenance/license review.

## 11. Review rule rules

- One file/module per cohesive rule family; rule ID/version declared adjacent to implementation.
- Pure evaluation over supplied context.
- Eligibility/prerequisites separated from finding calculation.
- No hidden default tolerance; every effective value comes from versioned config/profile.
- Evidence values are typed and ordered deterministically.
- Missing input is skipped/not-evaluated, not pass.
- Every semantic change increments version and updates catalog/docs/fixtures.
- Level C cannot be upgraded to A/B because AI sounds confident.

## 12. API/server rules

- Authenticate, authorize, validate, then mutate.
- Use one safe error envelope and correlation ID.
- Idempotency on upload finalize, review start/chunks, and report generation.
- `If-Match`/version for mutable commands.
- Mutation endpoints/actions reject unsupported content types and excessive bodies.
- Never accept role/project IDs from the UI as proof of authorization.
- Avoid source data in URL query strings.
- Security headers and caching policy are explicit; confidential responses are not publicly cached.

## 13. React/UI rules

- Server data and UI state are separate.
- Forms use typed validation shared where safe, but server validation remains authoritative.
- No business truth only in client state/localStorage.
- URL owns shareable filter/page state.
- Preserve focus and navigation context.
- Components render all states: loading/empty/error/unauthorized/conflict/partial.
- Use semantic HTML first; ARIA supplements rather than repairs unsuitable markup.
- User/source text is text, not injected HTML.
- Lazy-load large optional visual/report modules.
- No unbounded browser rendering of canonical rows/findings.

## 14. ThreeUI rules

- Adopt through the workflow in `docs/10_THREEUI_MCP.md`.
- Wrap third-party source in a local boundary and document modifications.
- Keep license/attribution files for copied/package assets.
- No entitlement bypass or Pro source in the repository without verified right.
- Tree/lazy-load and error-bound every optional ThreeUI route.
- Add reduced-motion, static, and no-WebGL behavior before marking complete.

## 15. AI code rules

- Adapter behind a port and feature flag.
- No provider SDK usage inside domain/rule modules.
- Structured schema with strict reference validation.
- Minimized field categories and bounded token/response sizes.
- Timeouts, retry budget, and rate-limit handling.
- No raw prompt or source content in general logs.
- Provenance and limitations persisted.
- AI-disabled test path is mandatory.

## 16. Error and logging rules

- User messages are actionable and localized.
- Logs are structured with event name, safe IDs, stage, duration, result, correlation ID.
- Never log auth headers, cookies, secrets, full file names if policy forbids, raw rows, full comments, AI prompt/content, object keys, or signed URLs.
- Redaction occurs before the logger call.
- Unexpected errors are wrapped; the safe client receives `INTERNAL_ERROR` and correlation ID.

## 17. Test rules

- Behavior change and tests ship together.
- Unit tests do not depend on network/time/random; inject those.
- Integration tests use isolated IDs/database/storage.
- E2E creates/cleans its own project-scoped synthetic data.
- Do not use production credentials/data.
- No arbitrary sleep for synchronization; wait on state/condition.
- Flaky test is a bug; quarantine only with owner/issue/expiry and non-core coverage.
- Do not delete or weaken a test merely to pass.
- Snapshot tests require semantic assertions for critical content.

## 18. Dependency rules

Before adding a production dependency, record:

- problem and alternatives;
- license;
- current maintenance/security posture;
- bundle/runtime footprint;
- Sites compatibility;
- server/client placement;
- transitive/native/WASM implications;
- upgrade/removal plan.

Pin through the lockfile. Avoid duplicate libraries for validation, date, decimal, spreadsheet, UI, or charts without a clear reason.

## 19. Documentation rules

- Public behavior/API/schema/rule change updates its specification.
- ADR/decision log for cross-cutting choices.
- Migration includes operation/recovery notes.
- Every rule has catalog and examples.
- Every adopted ThreeUI item has component log.
- Every release has acceptance/QA manifest.
- Use `needs-domain-validation` and `needs-platform-validation` honestly.

## 20. Review checklist for each change

- Scope/task/acceptance IDs clear.
- Unrelated changes absent.
- Identity/project authorization present.
- Validation/error states present.
- Lineage/audit/immutability preserved.
- Tests cover success, boundary, failure, conflict.
- Accessibility/responsive considered.
- No secret/confidential fixture.
- Docs/migration/rollback updated.
- Exact commands/results reported.
