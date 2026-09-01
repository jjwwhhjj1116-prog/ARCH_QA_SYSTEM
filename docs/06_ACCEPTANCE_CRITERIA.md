# Acceptance Criteria

Legend:

- `P0`: release blocking.
- `P1`: required for first production release unless explicitly deferred by the user with documented risk.
- `P2`: planned enhancement.
- Evidence codes: `UT` unit, `IT` integration, `E2E` browser, `A11Y`, `SEC`, `PERF`, `DOC`, `MANUAL`.

## 1. Platform and repository

| ID       | Pri | Criterion                                                                                                                       | Evidence      |
| -------- | --: | ------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| PLAT-001 |  P0 | The actual Sites-compatible starter, build command, output, local run command, and runtime bindings are recorded and pass.      | DOC, IT       |
| PLAT-002 |  P0 | `.openai/hosting.json`, if present, is read and its exact project ID is reused; the code never invents or rewrites it.          | DOC, review   |
| PLAT-003 |  P0 | D1 and R2 binding names match provisioned Sites bindings and are checked at startup/health without logging secrets.             | IT            |
| PLAT-004 |  P0 | Repository includes deterministic install, typecheck, lint, test, build, migration, and E2E commands or documented equivalents. | CI/DOC        |
| PLAT-005 |  P0 | No secret is committed; `.env.example` contains keys only.                                                                      | SEC           |
| PLAT-006 |  P1 | A saved candidate can be created from the exact reviewed source state without deploying.                                        | MANUAL/DOC    |
| PLAT-007 |  P0 | Deployment cannot occur as part of ordinary build/test and requires explicit user approval.                                     | review/MANUAL |

## 2. Identity and authorization

| ID       | Pri | Criterion                                                                            | Evidence  |
| -------- | --: | ------------------------------------------------------------------------------------ | --------- |
| AUTH-001 |  P0 | Protected server operations reject requests without a valid platform identity.       | IT, SEC   |
| AUTH-002 |  P0 | Project reads and writes verify active membership server-side.                       | IT, SEC   |
| AUTH-003 |  P0 | Changing a project/case/file/run/finding ID cannot access another project's data.    | SEC, E2E  |
| AUTH-004 |  P0 | Viewer cannot upload, map, run, triage, approve, or manage members.                  | IT, E2E   |
| AUTH-005 |  P0 | Reviewer cannot perform admin-only or disallowed approval actions.                   | IT        |
| AUTH-006 |  P1 | Role changes and denied sensitive actions create safe audit events.                  | IT        |
| AUTH-007 |  P0 | File download is authorized through the application; R2 keys/objects are not public. | SEC, IT   |
| AUTH-008 |  P1 | The UI shows current identity/role and a supported sign-out path.                    | E2E, A11Y |
| AUTH-009 |  P0 | Self-approval policy is enforced on the server and covered by tests.                 | IT        |

## 3. Projects and cases

| ID       | Pri | Criterion                                                                                    | Evidence  |
| -------- | --: | -------------------------------------------------------------------------------------------- | --------- |
| PROJ-001 |  P1 | Authorized user can create a project with required metadata and see it in the dashboard.     | E2E       |
| PROJ-002 |  P1 | Project update uses optimistic concurrency and reports a recoverable conflict.               | IT, E2E   |
| PROJ-003 |  P1 | Archive is reversible and does not delete sources/runs.                                      | IT, E2E   |
| PROJ-004 |  P0 | A project cannot lose its last active owner through a normal membership action.              | IT        |
| CASE-001 |  P1 | User can create separate FIN and RC cases.                                                   | E2E       |
| CASE-002 |  P0 | A case's profile kind cannot silently change after review history exists.                    | IT        |
| CASE-003 |  P1 | Case overview clearly shows current source, dataset, run, report, blockers, and next action. | E2E, A11Y |
| CASE-004 |  P0 | Approval state cannot be reached while configured blockers remain.                           | IT, E2E   |

## 4. Upload and source management

| ID       | Pri | Criterion                                                                                                   | Evidence  |
| -------- | --: | ----------------------------------------------------------------------------------------------------------- | --------- |
| FILE-001 |  P0 | Supported XLSX and CSV fixtures upload, validate, store privately, and create immutable source versions.    | IT, E2E   |
| FILE-002 |  P0 | Unsupported extension/signature mismatch is rejected with a stable error code.                              | UT, IT    |
| FILE-003 |  P0 | Oversize, excessive sheet/row/column/cell, zip-bomb-like expansion, and corrupt workbook cases fail safely. | SEC, IT   |
| FILE-004 |  P0 | Macros, embedded scripts, external links, and formulas are never executed.                                  | SEC, UT   |
| FILE-005 |  P1 | Original filename, detected type, size, checksum, version, actor, and timestamp are retained.               | IT        |
| FILE-006 |  P1 | Duplicate checksum is shown before intentional versioning/reuse.                                            | E2E       |
| FILE-007 |  P0 | R2 write/D1 finalize failure leaves a recoverable state and no source marked ready without bytes.           | IT        |
| FILE-008 |  P1 | Expired temporary uploads can be reconciled using exact scoped keys.                                        | IT, SEC   |
| FILE-009 |  P1 | Upload progress/error/retry is keyboard accessible and survives route refresh where supported.              | E2E, A11Y |

## 5. Inspection, mapping, normalization

| ID       | Pri | Criterion                                                                                                            | Evidence |
| -------- | --: | -------------------------------------------------------------------------------------------------------------------- | -------- |
| IMP-001  |  P1 | Workbook inventory shows sheet visibility, dimensions, formulas, merged ranges, and header candidates.               | IT, E2E  |
| IMP-002  |  P1 | CSV delimiter/encoding is detected and user-overridable.                                                             | UT, E2E  |
| IMP-003  |  P0 | Preview is bounded and does not send/load an unbounded workbook into the client.                                     | IT, PERF |
| MAP-001  |  P1 | Mapping suggestion includes confidence/reason and requires confirmation.                                             | E2E      |
| MAP-002  |  P0 | Required profile fields and incompatible duplicate targets block confirmation.                                       | UT, E2E  |
| MAP-003  |  P1 | Confirmed mapping is immutable/versioned; revisions may propose reuse but never silently apply incompatible mapping. | IT, E2E  |
| MAP-004  |  P1 | Unit/floor/exclusion decisions appear in a before/after preview.                                                     | E2E      |
| NORM-001 |  P0 | Raw and normalized values are preserved separately with source sheet/row/cell lineage.                               | UT, IT   |
| NORM-002 |  P0 | Blank, zero, invalid, and negative values remain distinct.                                                           | UT       |
| NORM-003 |  P0 | Unit conversions are allowlisted, dimension-safe, versioned, and evidenced.                                          | UT       |
| NORM-004 |  P0 | Decimal values remain stable across import, storage, review, and report.                                             | UT, IT   |
| NORM-005 |  P1 | Korean Unicode, whitespace, punctuation, and header aliases normalize without corrupting original text.              | UT       |
| NORM-006 |  P1 | Import errors/warnings/info link to their source positions and show dependent skipped rules.                         | E2E      |
| NORM-007 |  P0 | Blocking import errors prevent review start; warnings follow configured acknowledgment policy.                       | IT, E2E  |
| NORM-008 |  P0 | Dataset checksum is stable for identical canonical input/configuration.                                              | UT       |

## 6. Review run lifecycle

| ID      | Pri | Criterion                                                                                                      | Evidence |
| ------- | --: | -------------------------------------------------------------------------------------------------------------- | -------- |
| RUN-001 |  P0 | Starting a run snapshots dataset, adjustments, profile, rules, config, normalization, engine and app versions. | IT       |
| RUN-002 |  P0 | Duplicate idempotency key returns the existing run and does not duplicate results.                             | IT       |
| RUN-003 |  P0 | Run stages follow valid transitions and a completed run is immutable.                                          | UT, IT   |
| RUN-004 |  P1 | Progress states are truthful, refresh-safe, and include stable run/correlation IDs.                            | E2E      |
| RUN-005 |  P0 | Chunk/stage retries are idempotent if resumable processing is used.                                            | IT       |
| RUN-006 |  P0 | Failed contextual AI leaves completed A/B results valid and records a limitation.                              | IT       |
| RUN-007 |  P0 | Skipped, not-applicable, failed, evaluated, and finding counts are distinct and correct.                       | UT, IT   |
| RUN-008 |  P1 | Safe cancellation produces a terminal cancelled run without partial-complete labeling.                         | IT, E2E  |
| RUN-009 |  P0 | Same inputs and versions produce identical Level A/B checksum/results.                                         | UT, IT   |

## 7. Common and FIN rules

| ID       | Pri | Criterion                                                                                                             | Evidence |
| -------- | --: | --------------------------------------------------------------------------------------------------------------------- | -------- |
| RULE-001 |  P0 | Every enabled rule has ID, version, level, prerequisites, status, evidence, limitation behavior, and tests.           | UT, DOC  |
| RULE-002 |  P0 | Missing prerequisites yield skipped/not-evaluated, never a false pass.                                                | UT       |
| RULE-003 |  P0 | Formula evaluation uses a restricted grammar and rejects unsupported expressions safely.                              | UT, SEC  |
| RULE-004 |  P0 | Calculation comparisons use explicit decimal tolerance/rounding policy.                                               | UT       |
| RULE-005 |  P0 | Mixed/incompatible units are excluded or rejected with evidence.                                                      | UT       |
| FIN-001  |  P0 | Configured dimension formula mismatch is detected with operands, expected/actual, difference, tolerance, and lineage. | UT, E2E  |
| FIN-002  |  P0 | Detail/subtotal mismatch is detected from explicit group membership.                                                  | UT       |
| FIN-003  |  P1 | Exact duplicate detection distinguishes configured legitimate repeats and near-match candidates.                      | UT       |
| FIN-004  |  P1 | Confirmed aliases aggregate deterministically; fuzzy aliases remain Level C and never auto-merge rows.                | UT, IT   |
| FIN-005  |  P1 | Outlier rule shows cohort, sample size, method, thresholds, exclusions, and peer scope.                               | UT, E2E  |
| FIN-006  |  P1 | Typical-floor discontinuity only compares user-confirmed comparable floors.                                           | UT       |
| FIN-007  |  P0 | Missing-surface/scope candidate is labeled Level C with missing-context limitation, not verified error.               | UT, E2E  |
| FIN-008  |  P1 | GFA ratio rule requires a trusted baseline and compatible units.                                                      | UT       |
| FIN-009  |  P1 | Weak calculation basis is review-required and cites which basis fields are absent.                                    | UT       |
| FIN-010  |  P0 | Drawing/reference rule cannot claim an exact mismatch without structured comparable keys/values.                      | UT       |

## 8. RC rules

| ID     | Pri | Criterion                                                                                       | Evidence |
| ------ | --: | ----------------------------------------------------------------------------------------------- | -------- |
| RC-001 |  P1 | Concrete volume uses member-type/configured geometry and lists deductions/limitations.          | UT       |
| RC-002 |  P1 | Formwork area uses member-specific face rules; no universal formula is applied.                 | UT       |
| RC-003 |  P1 | Rebar weight runs only with approved inputs/table/formula and lists lap/hook/waste limitations. | UT       |
| RC-004 |  P1 | Same member/floor conflicting dimensions produce deterministic evidence.                        | UT       |
| RC-005 |  P1 | Duplicate member rule supports explicit segment identifiers.                                    | UT       |
| RC-006 |  P1 | RC typical-floor/member outlier uses compatible member cohorts.                                 | UT       |
| RC-007 |  P0 | Missing member/category remains Level C unless an authoritative schedule proves expectation.    | UT       |
| RC-008 |  P0 | Volume, area, and weight are never compared as the same dimension.                              | UT       |
| RC-009 |  P1 | Cross-quantity ratio anomaly uses member-type and recorded approved range/cohort.               | UT       |
| RC-010 |  P1 | Missing input families are visibly not evaluated, not zero or pass.                             | E2E      |

## 9. Findings and human review

| ID       | Pri | Criterion                                                                                                 | Evidence  |
| -------- | --: | --------------------------------------------------------------------------------------------------------- | --------- |
| FIND-001 |  P0 | Every finding has rule/version, level, severity, confidence, run, evidence, source references, and state. | IT        |
| FIND-002 |  P0 | Level A/B/C labels and limitations are visible in list/detail/report.                                     | E2E, A11Y |
| FIND-003 |  P1 | Filtering/search/pagination preserve URL state and can handle representative result volume.               | E2E, PERF |
| FIND-004 |  P1 | Detail opens source/calculation/comparison/history without losing list context.                           | E2E       |
| FIND-005 |  P0 | State transitions validate role/current state/version/reason and append an event.                         | UT, IT    |
| FIND-006 |  P0 | AI cannot set confirmed/corrected/closed/approved states.                                                 | IT, SEC   |
| FIND-007 |  P0 | High/critical findings cannot disappear without explicit result/state/version explanation.                | IT        |
| FIND-008 |  P1 | Duplicate findings link to a canonical finding and retain history.                                        | IT        |
| FIND-009 |  P1 | Bulk action previews impact, skips ineligible items, and audits each outcome.                             | IT, E2E   |
| FIND-010 |  P0 | Conflict returns compare/refresh guidance without overwriting another reviewer's decision.                | IT, E2E   |

## 10. Adjustments and comparison

| ID      | Pri | Criterion                                                                                          | Evidence |
| ------- | --: | -------------------------------------------------------------------------------------------------- | -------- |
| ADJ-001 |  P0 | Adjustment never edits raw source/canonical row in place.                                          | IT       |
| ADJ-002 |  P0 | Adjustment records old/new typed value, unit, reason, author, time, dataset, and field.            | IT       |
| ADJ-003 |  P0 | Invalid type/unit/field is rejected.                                                               | UT, IT   |
| ADJ-004 |  P1 | Adjustment is revoked/superseded rather than silently deleted.                                     | IT, E2E  |
| CMP-001 |  P1 | Rerun snapshots selected adjustments and creates a new immutable run.                              | IT       |
| CMP-002 |  P1 | Comparison labels new/persistent/changed/resolved/not-evaluated/rule-changed/unmatched.            | UT, E2E  |
| CMP-003 |  P0 | Comparison identifies whether source, mapping, normalization, rule, config, or adjustment changed. | IT, E2E  |

## 11. AI/contextual review

| ID     | Pri | Criterion                                                                                                          | Evidence    |
| ------ | --: | ------------------------------------------------------------------------------------------------------------------ | ----------- |
| AI-001 |  P0 | Product works in AI-disabled mode; Level A/B functionality and report remain available.                            | IT, E2E     |
| AI-002 |  P0 | AI receives minimized structured slices, not raw workbook bytes by default.                                        | SEC, review |
| AI-003 |  P0 | AI response is schema/size/reference validated and invalid output is rejected safely.                              | UT, IT      |
| AI-004 |  P0 | Assessment records provider/model/prompt-policy/schema/input hash/limitations without logging secrets/raw prompts. | IT, SEC     |
| AI-005 |  P0 | All AI-derived findings are Level C, review-required, and confidence-capped.                                       | UT, E2E     |
| AI-006 |  P1 | Provider timeout/rate/error appears as a limitation/retry state and not an A/B run failure.                        | IT          |

## 12. Reports and audit

| ID      | Pri | Criterion                                                                                                             | Evidence   |
| ------- | --: | --------------------------------------------------------------------------------------------------------------------- | ---------- |
| REP-001 |  P0 | Report identifies project/case/source checksums/run/profile/rules/config/engine/app versions.                         | IT, MANUAL |
| REP-002 |  P0 | Report separates Level A/B/C and includes data limitations/skipped rules.                                             | MANUAL     |
| REP-003 |  P0 | Exported cells are protected against spreadsheet formula injection.                                                   | UT, SEC    |
| REP-004 |  P1 | XLSX and printable HTML are generated, stored privately with checksum, and downloaded through authorization.          | IT, E2E    |
| REP-005 |  P1 | PDF is included only after verified reliable rendering; otherwise UI/docs state printable HTML is the supported path. | MANUAL     |
| REP-006 |  P0 | Only an approved report is labeled final and approval binds the exact checksum.                                       | IT         |
| REP-007 |  P0 | Report approval/rejection records named actor, reason, time, and policy.                                              | IT, E2E    |
| AUD-001 |  P0 | Required sensitive actions append safe audit events.                                                                  | IT         |
| AUD-002 |  P0 | Audit/log metadata excludes secrets, auth headers, full source rows, raw AI prompts, and signed URLs.                 | SEC        |
| AUD-003 |  P1 | Authorized auditor can filter and export audit history.                                                               | E2E        |

## 13. UI, accessibility, performance

| ID       | Pri | Criterion                                                                                                                | Evidence    |
| -------- | --: | ------------------------------------------------------------------------------------------------------------------------ | ----------- |
| UI-001   |  P0 | Primary flow is complete at 360, 768, 1280 and 1440 widths without blocked controls.                                     | E2E, visual |
| UI-002   |  P0 | Back/forward navigation does not reset confirmed mapping or lose unsaved work without warning.                           | E2E         |
| UI-003   |  P0 | Loading, empty, filtered-empty, error, unauthorized, conflict and partial states exist for primary views.                | E2E         |
| UI-004   |  P1 | Long actions show truthful stage/progress and recoverable error guidance.                                                | E2E         |
| UI-005   |  P0 | Severity/level/state are not communicated by color alone.                                                                | A11Y        |
| A11Y-001 |  P0 | Core journey is keyboard complete with visible focus and correct focus management.                                       | A11Y, E2E   |
| A11Y-002 |  P0 | Forms have labels, associated errors, and accessible summaries.                                                          | A11Y        |
| A11Y-003 |  P0 | Tables, sort, pagination, dialogs, progress and charts have accessible names/state/equivalents.                          | A11Y        |
| A11Y-004 |  P0 | Reduced motion removes nonessential animation and core work remains usable without WebGL.                                | A11Y, E2E   |
| A11Y-005 |  P1 | Contrast, 200% zoom and text-spacing checks pass on core routes.                                                         | A11Y        |
| PERF-001 |  P1 | Representative 10,000-row review meets the agreed A/B runtime target or documents/implements bounded resumable behavior. | PERF        |
| PERF-002 |  P1 | Finding list remains responsive at representative volume with bounded server pagination.                                 | PERF        |
| PERF-003 |  P0 | ThreeUI/Three.js code is lazy and absent from core review route initial bundles.                                         | PERF        |
| PERF-004 |  P1 | WebGL loop pauses offscreen/hidden and uses an approved DPR/device fallback.                                             | PERF        |

## 14. Security, retention, release

| ID      | Pri | Criterion                                                                                                                    | Evidence        |
| ------- | --: | ---------------------------------------------------------------------------------------------------------------------------- | --------------- |
| SEC-001 |  P0 | Threat model covers IDOR, uploads, XSS, CSRF assumptions, formula injection, secret leakage, R2 access and AI data exposure. | SEC, DOC        |
| SEC-002 |  P0 | User-controlled text renders safely; no workbook HTML/script executes.                                                       | SEC             |
| SEC-003 |  P0 | Mutations use the supported anti-CSRF/origin/auth pattern and server authorization.                                          | SEC             |
| SEC-004 |  P0 | Destructive project/data deletion requires exact scope, impact preview, confirmation and audit.                              | IT, SEC         |
| RET-001 |  P1 | Retention values are documented and expired temporary uploads are cleaned safely.                                            | IT, DOC         |
| RET-002 |  P0 | Deletion does not use unresolved/broad R2 paths and reports partial failure for recovery.                                    | IT, SEC         |
| REL-001 |  P0 | Full required test/QA matrix passes on the candidate commit.                                                                 | CI, QA manifest |
| REL-002 |  P0 | Migrations pass empty and upgrade paths with backup/recovery notes.                                                          | IT, DOC         |
| REL-003 |  P0 | Candidate is saved and reviewed before production deployment.                                                                | MANUAL          |
| REL-004 |  P0 | User explicitly approves deployment and audience.                                                                            | approval record |
| REL-005 |  P0 | Post-deploy smoke test verifies intended visitor access and denies unintended access.                                        | E2E/MANUAL      |
| REL-006 |  P0 | Rollback target/version and data compatibility are recorded before deployment.                                               | DOC             |

## 15. Acceptance evidence rule

For every P0/P1 item, `artifacts/qa/<release>/acceptance-matrix.md` must include:

- criterion ID;
- implementation reference;
- test/evidence path;
- command and result;
- date/commit;
- reviewer;
- status: pass/fail/blocked/not-applicable;
- reason for any not-applicable or approved deferral.

No criterion passes solely because an agent says it passed.
