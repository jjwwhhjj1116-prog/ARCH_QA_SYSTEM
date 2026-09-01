# FIN & RC AI Quantity Review Studio

## Codex Sites + ThreeUI MCP Execution Master PRD

Version: 2.0

Status: implementation baseline

Product name: **FIN & RC Review Studio**

Short name: **FIN&RC QA**

---

## 0. Top-level directive

Build a real internal work application, not a static demo.

When a construction project team uploads FIN (finishing work) or RC (reinforced-concrete work) quantity-calculation material, the product must:

1. preserve and version the source;
2. parse and normalize the data;
3. validate calculations and structural consistency;
4. detect errors, omissions, duplicates, outliers, and suspicious patterns;
5. present evidence and limitations for every finding;
6. let a human reviewer correct, classify, comment, resolve, and approve findings;
7. re-run review without losing history;
8. export a traceable QA report; and
9. retain a project-level audit history.

The product must include working authentication/access control, project management, upload, parsing, mapping, review execution, progress states, results, user correction, rerun, report generation, history, and failure recovery.

AI is advisory. Deterministic arithmetic and data rules remain the source of verified error decisions.

---

## 1. Problem statement

FIN and RC quantity reviews are often performed with large spreadsheets whose structure varies by contractor, project, discipline, estimator, and phase. Reviewers repeatedly perform the same high-cost activities:

- find the header and data region of each sheet;
- interpret project-specific column names and units;
- reconcile formulas with displayed quantities;
- find missing, duplicated, or dispersed items;
- compare floors, areas, members, and related quantities;
- judge whether an anomaly is an error or a legitimate project condition;
- write findings and evidence into a report; and
- repeat the work when a revised workbook arrives.

Manual review is slow and difficult to reproduce. A pure AI review is also unsafe because it can infer context that the source does not contain. The product must combine reproducible calculations, statistical signals, and human-controlled contextual analysis.

---

## 2. Goals

### G1. Reduce review time

Automate structural inspection, calculation checks, duplicate detection, cross-floor comparison, anomaly surfacing, evidence assembly, and report drafting.

### G2. Make every result explainable

Every finding must show the exact source reference, normalized values, rule, calculation, comparison population, and known limitation.

### G3. Support FIN and RC without mixing their assumptions

Use a shared ingestion and evidence pipeline with separate FIN and RC rule profiles.

### G4. Preserve review history

Keep immutable source versions and review runs so a user can compare revisions, reproduce results, and audit decisions.

### G5. Keep the human in control

Users decide mappings, corrections, finding disposition, applicability, approval, and final report status.

### G6. Deliver as a focused Sites application

Use the supported Sites runtime, durable relational storage, file storage, identity, versioning, and access controls. Keep the initial application private until reviewed.

---

## 3. Non-goals for the first production release

The first release does not promise:

- full BIM/IFC or CAD quantity extraction;
- OCR-based interpretation of arbitrary drawings;
- execution of Excel macros, external workbook links, or embedded scripts;
- universal automatic mapping for every contractor workbook;
- structural engineering design verification;
- automatic final approval without a named human reviewer;
- replacement of a quantity surveyor, estimator, architect, or structural engineer;
- financial transactions or payment-card processing;
- real-time multi-user co-editing of the same finding;
- an autonomous background worker fleet outside supported Sites patterns;
- a legal conclusion that a contractor's quantity is correct or fraudulent.

These may be added only through a separate approved scope and threat/domain review.

---

## 4. Users and roles

### 4.1 Workspace administrator

Can manage product-wide settings, rule profiles, retention policy, allowed users/groups, and audit exports. Cannot silently alter an approved review run.

### 4.2 Project owner

Creates a project, manages project members, uploads source versions, initiates reviews, and requests final approval/export.

### 4.3 Quantity reviewer

Maps data, reviews findings, enters corrections, comments, changes finding disposition, and performs reruns.

### 4.4 Approver

Reviews unresolved limitations and approval evidence, then approves or rejects a report. The approver must be identifiable in the audit history.

### 4.5 Viewer/auditor

Reads projects, sources, runs, decisions, and reports but cannot change review state.

### 4.6 System service

Parses, normalizes, reviews, exports, and logs actions within explicit authorization and runtime boundaries.

### Permission principles

- A user may see or mutate a project only when server-side membership/role checks pass.
- Role changes and sharing changes are audited.
- Access to a Site and access to a record inside the app are separate controls.
- The least-privilege role is the default.

---

## 5. Core objects and terminology

| Term           | Definition                                                                              |
| -------------- | --------------------------------------------------------------------------------------- |
| Project        | The long-lived container for one construction project                                   |
| Review case    | One FIN or RC review scope inside a project                                             |
| Source file    | An uploaded workbook/CSV/document object                                                |
| Source version | Immutable version of a source file                                                      |
| Import job     | One attempt to parse and normalize a source version                                     |
| Mapping        | User-confirmed mapping from source columns to canonical fields                          |
| Canonical row  | Normalized, typed quantity row with source lineage                                      |
| Review profile | FIN or RC configuration and rule set                                                    |
| Review run     | Immutable execution of a profile against a fixed dataset/configuration                  |
| Rule result    | Machine execution output for one rule and target population                             |
| Finding        | Reviewable issue or suspicion derived from one or more rule results                     |
| Evidence       | Source references, calculations, baselines, comparisons, and limitations                |
| Disposition    | Human conclusion such as open, confirmed, accepted exception, corrected, not applicable |
| Report         | Versioned export of selected run and review state                                       |

---

## 6. Review classification model

### Level A — Deterministic

The conclusion is reproducible from explicit data or a fixed rule.

Examples:

- source expression says `10 × 3` but quantity says `25`;
- grouped detail rows sum to `980`, but declared subtotal is `1,020`;
- the same stable source key appears twice with identical dimensions and quantity;
- a negative area appears where the configured rule forbids it.

Level A may be labeled `verified error` only when all required operands, units, tolerances, and rule preconditions are present.

### Level B — Statistical

The result is an anomaly relative to a defined population or baseline.

Examples:

- one floor quantity is materially outside the distribution of comparable floors;
- a concrete-to-formwork ratio deviates from the configured member-class range;
- an item appears on every typical floor except one.

Level B must show the comparison cohort, method, sample size, threshold, and confidence. It is not automatically an error.

### Level C — Contextual / AI-assisted

The result depends on semantic interpretation, incomplete source context, document relationships, or a language model.

Examples:

- a material name may be an inconsistent spelling of another item;
- an exterior insulation item may be missing based on neighboring work categories;
- an explanation is inconsistent with the row's dimensions;
- a drawing-versus-workbook mismatch is suspected from available text.

Level C must be labeled `review required`, identify missing context, and never close itself.

---

## 7. Primary end-to-end journeys

### Journey A — First FIN review

1. User signs in and creates a project.
2. User creates a FIN review case.
3. User uploads an XLSX or CSV.
4. System validates the file and stores an immutable source version.
5. System detects sheets, header candidates, data ranges, formulas, hidden content, and sample rows.
6. User selects sheets and confirms column mapping, units, floor normalization, and exclusions.
7. System normalizes rows and shows validation errors/warnings.
8. User fixes mapping or explicitly accepts supported exclusions.
9. User starts a FIN review run.
10. System runs deterministic rules, statistical rules, then optional contextual enrichment.
11. User reviews findings, filters by severity/level/rule/floor/item, and opens evidence details.
12. User corrects a canonical value through a non-destructive adjustment or marks a disposition.
13. User reruns the review, compares results, and confirms no history was lost.
14. Approver reviews limitations/unresolved high-severity findings.
15. User exports a report and the system records the report version and checksum.

### Journey B — Revised source comparison

1. User uploads a revised source version.
2. System proposes reuse of a prior mapping but requires confirmation when headers/units changed.
3. System imports and runs the selected profile.
4. Results show new, persistent, resolved-by-source-change, and changed findings.
5. Prior human decisions remain attached to their original source/run and may be suggested, never silently copied.

### Journey C — RC review

1. User creates an RC case and selects enabled member/quantity categories.
2. User maps member, floor, geometry, concrete, formwork, rebar, and unit fields as available.
3. System runs only rules whose required inputs are present.
4. Unsupported rule families display `not evaluated` with missing prerequisites.
5. User reviews calculations, cross-member ratios, duplicates, missing categories, and floor anomalies.

### Journey D — Failure recovery

1. Upload/import/review/export fails with a stable error code and correlation/run ID.
2. Completed stages remain recorded.
3. User can correct mapping/configuration and retry without re-uploading valid source bytes.
4. The retry is a new attempt linked to the failed one.
5. No failed partial run appears as approved or complete.

---

## 8. Functional requirements

### 8.1 Authentication and identity

- Support workspace-authenticated identity for private internal use when available.
- If a public Site is later required, use the platform sign-in flow and perform authorization in server-side code.
- Normalize email identity for lookup while preserving the presented identity for audit.
- Show current user and role.
- Provide sign-out where the selected platform flow supports it.
- Reject missing/invalid identity on protected server routes.

### 8.2 Project management

- Create, list, search, open, archive, and restore projects.
- Store project code, name, client, location, gross floor area, building/floor metadata, currency/quantity locale, and notes.
- Separate active, archived, and recently reviewed projects.
- Manage members and roles with audit history.
- Archive is reversible; permanent deletion follows the retention/deletion policy and confirmation flow.

### 8.3 Review case management

- Create FIN or RC cases.
- Set case name, scope, source baseline, profile version, status, owner, reviewer, and approver.
- Statuses: `draft`, `ready`, `reviewing`, `needs_attention`, `awaiting_approval`, `approved`, `archived`.
- Prevent approval when blocking criteria are unmet.

### 8.4 File upload

- Initial parsing scope: XLSX and CSV.
- Validate filename, extension, content signature, compressed archive limits, object size, sheet count, row count, column count, cell length, and formula presence.
- Store raw bytes in R2 under an opaque key; never make source files public.
- Compute a content checksum and detect duplicate bytes.
- Let the user label a file as quantity source, reference, revision, or report attachment.
- Do not execute macros, external links, formulas, or embedded content.
- Show queued/uploading/validating/stored/parsing/ready/failed states.
- Support retry and cancellation where safe.

Default engineering limits, pending platform validation:

- 25 MiB per workbook/CSV;
- 30 sheets per workbook;
- 25,000 imported data rows per review case for the first release;
- 250 columns per sheet;
- 32,000 characters per cell;
- bounded uncompressed ZIP expansion and compression ratio.

The implementation may tighten these limits to match verified Sites runtime constraints. Changes must be documented and surfaced before upload.

### 8.5 Workbook/CSV inspection

- List sheets, visibility, dimensions, candidate header rows, merged ranges, formula count, non-empty count, and warnings.
- Allow preview of a bounded sample without loading the entire workbook into the browser.
- Detect Korean and English header variants.
- Detect CSV delimiter and encoding; allow the user to override.
- Treat hidden rows/columns as included by default but flag them and allow explicit exclusion.

### 8.6 Column mapping

Canonical fields include, where applicable:

- source item ID;
- discipline/profile;
- work category, subcategory;
- item name, material, specification;
- unit;
- floor/zone/room/location;
- member type/member ID;
- count;
- length, width, height, thickness, area, volume, weight;
- formula/expression;
- calculated quantity;
- declared quantity;
- subtotal/group key;
- note/evidence text;
- source drawing/reference key.

Requirements:

- Propose mapping using exact aliases first, then normalized aliases, then contextual suggestion.
- Show confidence and reason for each proposal.
- Require confirmation for low-confidence or unit-sensitive mapping.
- Save mapping versions and allow reuse on a compatible revision.
- Validate required fields per enabled rule profile.
- Never hide unmapped source columns; retain them in lineage/raw representation subject to size policy.

### 8.7 Normalization

- Preserve raw value and normalized value separately.
- Normalize whitespace, Unicode, common unit spelling, floor labels, category labels, and numeric formatting.
- Keep original precision; apply rule-specific comparison tolerance.
- Support Korean number formatting and common punctuation variants.
- Convert units only through an explicit conversion table and record the conversion.
- Represent unknown, blank, zero, and invalid as distinct states.
- Manual adjustments create overlay records with author, reason, old/new value, and timestamp.

### 8.8 Import validation

Classify issues as blocking error, warning, or information.

Examples:

- required mapped field absent;
- ambiguous decimal separator;
- incompatible units in a comparison group;
- invalid numeric value;
- formula parse failure;
- subtotal mixed with detail rows;
- duplicate source key;
- excessive empty rows;
- hidden rows/columns present;
- external link or unsupported formula present.

The user must see counts and affected locations before starting review.

### 8.9 Review configuration

- Select FIN or RC profile version.
- Enable/disable non-mandatory rules with reason.
- Configure tolerances only within admin-approved bounds.
- Define typical-floor cohorts, excluded floors/zones, category aliases, and project baselines.
- Snapshot the effective configuration into every review run.

### 8.10 Review execution

- Create an immutable run with dataset, mapping, profile, rule, normalization, and application versions.
- Execute eligible Level A rules first, then Level B, then optional Level C.
- Track stage and truthful progress: `queued`, `preparing`, `deterministic`, `statistical`, `contextual`, `assembling`, `completed`, `failed`, `cancelled`.
- Store results idempotently and prevent duplicate runs from double-writing findings.
- A contextual-provider failure must not invalidate completed Level A/B output.
- The result summary must show evaluated, skipped, not-applicable, failed, and finding counts.

### 8.11 Finding management

- List and filter by status, level, severity, confidence, profile, rule, sheet, floor, zone, category, item, assignee, and run.
- Support stable search across item/spec/note/rule/source key.
- Finding detail shows:
  - title and plain-language explanation;
  - level, severity, confidence, state;
  - exact source values and locations;
  - normalized values and conversions;
  - formula/calculation or statistical method;
  - comparison cohort and thresholds;
  - contextual evidence and limitations;
  - comments, adjustments, and state history;
  - related findings and prior-run comparison.
- Dispositions: `open`, `investigating`, `confirmed_error`, `accepted_exception`, `corrected`, `not_applicable`, `duplicate_finding`, `deferred`, `closed`.
- Closing requires a reason. High/critical closure may require reviewer/approver policy.
- Bulk actions are limited, preview their impact, and are audited.

### 8.12 Manual correction and rerun

- Never edit raw source bytes or canonical imported row in place.
- Corrections are overlays scoped to a dataset version.
- Show original and effective values.
- Validate units/type before accepting a correction.
- Rerun uses a declared set of adjustments and produces a new run.
- Compare run summaries and finding-level outcomes.

### 8.13 AI/contextual assistance

Optional capabilities:

- cluster likely spelling/terminology variants;
- summarize evidence already produced by deterministic/statistical rules;
- propose a review question;
- identify potential missing categories with explicit prerequisites;
- draft a finding explanation or report narrative;
- compare structured text from multiple supplied sources.

Controls:

- AI can be disabled globally/project/run.
- Minimize submitted fields and avoid raw workbook transfer when a derived slice suffices.
- Validate structured output against a schema.
- Record provider, model identifier, prompt-policy version, input field categories, timestamp, and validation result.
- Reject unsupported rule IDs/source references.
- Do not let AI set `confirmed_error`, `corrected`, `closed`, or `approved`.
- Mark all AI-derived statements and show limitations.

### 8.14 Reports

Generate a versioned report containing:

- project/case metadata;
- source file names, checksums, versions, and review run ID;
- profile/rule/configuration versions;
- executive summary by level/severity/state;
- data-quality and skipped-rule limitations;
- detailed findings with evidence and reviewer disposition;
- unresolved high/critical items;
- adjustments and rerun comparison;
- reviewer and approver identity/timestamps;
- disclaimer that contextual findings require professional review;
- export timestamp and application version.

Exports:

- XLSX for sortable finding/detail tables;
- printable HTML and, where verified reliable, PDF;
- optional machine-readable JSON for controlled integration.

Protect spreadsheet exports from formula injection. Store the generated artifact in R2 with checksum and audit entry.

### 8.15 Audit and history

Audit at minimum:

- authentication/authorization failures at safe detail;
- project/case create/update/archive/delete;
- membership/role changes;
- upload, download, parse, mapping, normalization;
- review start/cancel/complete/fail;
- rule configuration changes;
- adjustments, comments, disposition changes;
- report generate/approve/download;
- retention/deletion and sharing changes.

Audit events are append-only at the application layer and must not contain secrets or full confidential rows.

### 8.16 Administration

- Manage alias dictionaries and profile versions.
- Enable/disable rule versions prospectively.
- Set allowed tolerance ranges, upload limits, retention, and AI mode.
- View health and failed-job summary without exposing source content.
- Export an audit package for authorized users.

---

## 9. FIN review scope

The FIN profile must support extensible rules for:

- arithmetic and formula mismatch;
- length × height, width × length, area, volume, count multiplication;
- detail-to-subtotal and subtotal-to-total reconciliation;
- duplicate and near-duplicate rows;
- same material split across inconsistent names/specifications;
- unit inconsistency and suspicious conversion;
- negative, zero, or implausible dimension/quantity;
- outliers within a relevant cohort;
- typical-floor discontinuity and floor-to-floor variation;
- missing floor, zone, room, or surface category patterns;
- floor, wall, ceiling, exterior wall, insulation, brick, and interior-work completeness candidates;
- gross-floor-area or configured baseline ratios;
- weak/missing calculation basis;
- drawing/reference-key mismatch when comparable structured references exist;
- items requiring professional review.

Missing-category rules must never claim an error solely because an item is absent from one workbook. They must show the expected pattern/baseline and missing context.

---

## 10. RC review scope

RC is an independent profile with extensible families for:

- concrete volume calculations;
- formwork area calculations;
- reinforcing steel quantity/weight calculations when adequate inputs exist;
- foundation, wall, column, beam, slab, stair, and other configured member categories;
- member/floor duplicates and omissions;
- geometry inconsistencies;
- unit mismatch;
- detail/subtotal/total mismatch;
- floor/member outliers;
- concrete/formwork/rebar ratios by member type;
- structure drawing/reference comparison when structured comparable data exists;
- missing prerequisites and review-required candidates.

The application is not a structural-design checker. It reviews quantity data consistency and defined calculation rules only.

---

## 11. Information architecture and screens

1. Sign-in/access screen
2. Project dashboard
3. Project detail and case list
4. Create/edit project
5. Review case overview
6. Source files and versions
7. Upload and validation
8. Sheet selection and preview
9. Column mapping
10. Normalization/data-quality review
11. Review configuration
12. Review progress
13. Results dashboard
14. Findings table
15. Finding detail/evidence drawer or page
16. Adjustments
17. Run comparison
18. Report builder/preview
19. Approval view
20. Audit/history
21. Admin rule/profile settings
22. Error, empty, unauthorized, and recovery states

Detailed UI rules live in `docs/05_UI_SYSTEM.md`.

---

## 12. Data requirements

- Relational metadata and review records in D1.
- Raw source and generated reports in R2.
- Immutable source versions and review runs.
- Strong foreign-key relationships and project-scoped authorization.
- Soft archive for normal user workflows; controlled hard deletion for retention requests.
- Checksums for source/report artifacts.
- Explicit schema, parser, normalization, rule, profile, and application versions.
- Bounded JSON for immutable snapshots; normalized relational tables for query-heavy entities.

See `docs/03_DATA_MODEL.md` for tables, keys, indexes, and lifecycle.

---

## 13. API requirements

- Typed JSON endpoints or equivalent Sites server actions.
- Server-side identity and project authorization on every protected operation.
- Stable error envelope with safe message, machine code, correlation ID, and field issues.
- Idempotency keys for upload finalization, review start, and report generation.
- Cursor pagination for findings, rows, audit, and runs.
- Optimistic concurrency for mutable review decisions.
- Signed/authorized file access; no raw public R2 keys.
- Cancellation and retry only where state transition permits.

See `docs/12_API_CONTRACTS.md`.

---

## 14. Non-functional requirements

### Security

- Server-side authorization and least privilege.
- Upload hardening, formula-injection defense, XSS-safe rendering, CSRF-aware mutations, secret isolation, and safe logs.
- Confidential-by-default Sites access.
- Threat model and security tests before production.

### Privacy

- Data minimization and documented retention.
- No sensitive source content in analytics or general logs.
- AI disabled or minimized where project policy requires it.
- Explain identity data used by the application.

### Reliability

- Idempotent stage writes.
- Recoverable failed imports/runs.
- Immutable completed run.
- Migration forward/rollback plan.
- No partial result reported as complete.

### Performance targets for the first release

Pending validation against the selected starter and representative fixtures:

- dashboard first meaningful content: target ≤ 2.5 seconds on a normal corporate connection;
- route interaction response: target ≤ 200 ms for local UI state and ≤ 1 second for typical server reads;
- 10,000-row normalized dataset review: target ≤ 60 seconds without contextual AI;
- finding list: cursor-paginated and responsive with 10,000 findings;
- client JavaScript budget: establish and enforce a measured baseline; ThreeUI additions require a separate lazy-loaded budget;
- no continuous main-thread animation that blocks input;
- WebGL/ThreeUI failures do not block core work.

### Accessibility

- Target WCAG 2.2 AA for primary flows.
- Keyboard-complete upload, mapping, results, triage, and approval.
- Visible focus, semantic labels, status text beyond color, reduced motion, zoom/reflow, and accessible tables/detail views.

### Localization

- Korean-first UI.
- No logic that assumes Korean text is ASCII or English-word tokenized.
- Dates/numbers formatted for display without changing stored canonical values.

### Observability

- Correlation IDs, job/run IDs, safe structured logs, stage duration, error code counts, and audit events.
- No workbook row contents in routine logs.

---

## 15. ThreeUI design requirement

ThreeUI is used only where it improves comprehension or product identity without harming dense review work.

Candidate placements:

- restrained sign-in/onboarding visual;
- project dashboard header accent;
- upload/processing state visualization;
- empty-state illustration;
- optional report-summary visual.

Forbidden placements:

- animated shader behind forms or data tables;
- WebGL required for navigation or understanding a finding;
- unbounded render loop on review/report pages;
- inaccessible canvas-only controls;
- Pro assets/source without verified entitlement;
- components adopted from screenshots without source/license validation.

Every adopted component needs performance, mobile, reduced-motion, failure fallback, attribution/license, and entitlement evidence.

---

## 16. State models

### Import job

`created → uploading → validating → stored → inspecting → mapping_required → normalizing → ready`

Failure/cancellation states may be entered only from valid transitions. Retry creates a new attempt linked to the prior attempt.

### Review run

`queued → preparing → deterministic → statistical → contextual? → assembling → completed`

Terminal alternatives: `failed`, `cancelled`. A completed run is immutable.

### Finding

`open → investigating → confirmed_error | accepted_exception | corrected | not_applicable | deferred → closed`

`duplicate_finding` references a canonical finding. Reopening creates an audit event.

### Report

`draft → generated → awaiting_approval → approved | rejected → superseded`

Only an approved report may be labeled final.

---

## 17. Metrics

Product metrics, excluding confidential source content:

- time from upload to mapped/ready;
- time from ready to completed review;
- rule evaluation counts and failure/skipped rates;
- findings by level/severity/state;
- reviewer confirmation, exception, correction, and false-positive rates by rule version;
- rerun delta and reopened findings;
- report approval cycle time;
- import/review/export error rate;
- percentage of findings with complete evidence;
- accessibility/performance regression status.

Metrics must not substitute for domain correctness. Rule changes require reviewed examples and versioning.

---

## 18. Delivery phases

### Phase 0 — Discovery and contracts

Verify repository, Sites starter/runtime, D1/R2/auth bindings, ThreeUI access, sample availability, commands, and constraints. Freeze canonical schemas and decision log.

### Phase 1 — Secure vertical skeleton

Authentication, project/case shell, D1 migrations, R2 adapter, audit base, app shell, health/error pattern.

### Phase 2 — Ingestion

Upload, file validation, workbook/CSV inspection, mapping, normalization, data-quality UI, fixtures.

### Phase 3 — Deterministic review MVP

Run lifecycle, FIN Level A high-value rules, finding evidence, results UI, adjustments, rerun.

### Phase 4 — Statistical and RC profiles

Level B framework, cohorts, FIN patterns, RC rule families, not-evaluated prerequisites, run comparison.

### Phase 5 — Contextual assistance and reports

Optional AI adapter, contextual review safeguards, report generation, approval, audit export.

### Phase 6 — Hardening and saved candidate

Security, accessibility, performance, migration/rollback, end-to-end QA, privacy/retention, saved Sites version. No production deploy yet.

### Phase 7 — Approved release

User reviews saved candidate and checklist. Only after explicit approval: deploy saved version, set minimal audience, smoke-test intended visitor flow, and record release evidence.

---

## 19. Release-blocking criteria

Any of the following blocks production release:

- a user can access another project's data by changing an ID;
- a raw source or report object is publicly readable without authorization;
- completed runs can be mutated in place;
- source lineage or rule version is absent from a finding;
- AI output can mark a finding or report approved;
- critical/high findings can disappear without a state event;
- exports allow spreadsheet formula injection;
- upload validation permits macros/scripts to execute;
- required migrations lack rollback/recovery notes;
- core flow fails keyboard/accessibility checks;
- representative fixtures do not reproduce expected Level A results;
- deployment/audience change lacks explicit user approval;
- unresolved secrets or confidential fixture data exist in the repository.

---

## 20. Acceptance and completion

Detailed, testable acceptance IDs are defined in `docs/06_ACCEPTANCE_CRITERIA.md`. The product is complete only when the required acceptance matrix, QA evidence, security review, and release checklist pass.

The implementation must remain honest about unsupported formats, missing domain baselines, skipped rules, AI limitations, and unverified platform assumptions.
