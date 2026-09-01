# AGENTS.md — FIN & RC Review Studio

## Mission

Build a production-minded, private internal web application that ingests FIN and RC quantity-workbook data, preserves source lineage, runs deterministic/statistical/contextual review profiles, lets reviewers resolve findings with an audit trail, and exports a traceable QA report.

The application is a decision-support system. It must never present an AI guess as a verified quantity error.

## Instruction precedence and required reading

- Follow system and user instructions first, then this file, then the detailed documents under `docs/`.
- Read `START_HERE.md` before making changes.
- Read all numbered files in `docs/` before finalizing architecture or schema.
- Treat `docs/06_ACCEPTANCE_CRITERIA.md` as the definition of required behavior.
- Treat `docs/07_QA_PLAN.md` and `docs/11_RELEASE_CHECKLIST.md` as release gates.
- If the repository state contradicts a document, inspect the real state, record the decision in `docs/DECISION_LOG.md`, and update the affected specification in the same change.

## Non-negotiable product rules

1. Preserve every imported source value and its lineage: file, version, sheet, row, cell/column, parser version, and normalization version.
2. Separate review results into:
   - Level A: deterministic and reproducible from data or formulas.
   - Level B: statistical or pattern-based anomaly.
   - Level C: contextual or AI-assisted suspicion requiring human review.
3. Every finding must include rule ID, level, severity, confidence, evidence, source references, run ID, and review state.
4. Never silently overwrite user corrections, mappings, decisions, comments, or prior review runs.
5. Re-running a review creates a new immutable run. Supersession is explicit; history remains readable.
6. AI output cannot directly change source quantities, close findings, or mark a report approved.
7. FIN and RC use separate rule profiles on a shared pipeline. Do not force FIN assumptions into RC rules.
8. Missing source context must reduce confidence and produce a limitation, not a fabricated conclusion.
9. All authorization checks happen server-side. UI hiding is not authorization.
10. No production deployment, audience expansion, domain change, or external sharing without explicit user approval.

## Default implementation boundaries

- Prefer the Sites-recommended TypeScript full-stack starter actually present in the environment.
- Use D1 for relational records and R2 for uploaded/generated files when Sites provisions those bindings.
- Keep `.openai/hosting.json` free of secrets. Do not invent a `project_id`; reuse the exact value Sites creates.
- Keep local development values in `.env`; commit only `.env.example` with names and safe placeholders.
- Store timestamps as UTC ISO-8601. Render in the user's locale/time zone.
- Use integer minor units or explicit decimal-safe handling for quantities. Never depend on unchecked binary floating-point equality.
- Validate every external boundary: request body, query, file metadata, parsed cell value, AI structured output, and environment configuration.
- Keep domain logic independent of React, Sites bindings, and transport code.

## Repository architecture target

Adapt names to the actual starter, but preserve these dependency directions:

```text
UI/routes -> application services -> domain/review engine
                                  -> ports/interfaces
Sites/D1/R2/auth adapters --------> ports/interfaces
parsers --------------------------> canonical import model
```

The domain and review-engine packages must be runnable in unit tests without Sites, D1, R2, a browser, or an AI provider.

Suggested ownership boundaries:

- `src/domain/` or `packages/domain/`: canonical types, invariants, review contracts
- `src/review/` or `packages/review-engine/`: rules, statistics, scoring, evidence
- `src/import/`: workbook parsers, mappings, normalization
- `src/server/`: API/application services and authorization
- `src/adapters/`: D1, R2, auth, AI, clock, ID generation
- `src/ui/`: routes, screens, components, client state
- `tests/fixtures/`: synthetic and sanitized data only
- `artifacts/qa/`: generated test evidence, not source-of-truth code

## Work protocol

### Before editing

- Inspect `git status`, project instructions, package manager, scripts, hosting manifest, schema/migrations, and tests.
- Locate existing changes and preserve unrelated user work.
- State the phase, task IDs, owned files, expected tests, and acceptance IDs.
- For a risky or cross-cutting decision, add/update an ADR or `docs/DECISION_LOG.md` first.

### During implementation

- Work in vertical slices that leave the repository buildable.
- Use migrations; never mutate production schema ad hoc.
- Add or update tests in the same change as behavior.
- Keep generated files deterministic and clearly separated.
- Prefer small pure functions for formula parsing, normalization, rules, and scoring.
- Return typed error codes and safe user messages. Log diagnostic detail without raw sensitive workbook content.
- Never add a new production dependency without checking its license, maintenance status, bundle/runtime impact, and whether the existing stack already solves the need.

### Before handing off

- Run the smallest relevant checks, then the full release checks appropriate to the phase.
- Report exact commands, results, skipped checks, and remaining risk.
- Map completed work to acceptance IDs.
- Include migration and rollback notes for schema or storage changes.
- Do not claim a browser flow passed without browser evidence.

## Subagent policy

Use subagents because this project contains independent domain, platform, UI, and QA work. Delegation is required when at least two bounded tasks can proceed without editing the same files.

Good parallel tasks:

- read-only repository mapping
- Sites/runtime compatibility research
- review-rule design and fixture review
- UI accessibility or performance audit
- test-plan or security review
- independent validation after implementation

Do not parallelize:

- two agents editing the same files
- schema design and API implementation before the schema contract is frozen
- shared canonical types while dependent agents are coding against them
- deployment and active feature implementation

Orchestration rules:

1. The main agent owns requirements, canonical contracts, integration, and final verification.
2. Give every subagent a bounded objective, inputs, allowed files, forbidden files, acceptance IDs, and required return format.
3. Prefer read-only agents for exploration and review.
4. Freeze shared contracts before write agents run in parallel.
5. Each write agent must have exclusive file ownership.
6. Wait for all required results and reconcile contradictions explicitly.
7. Re-run integration checks in the main thread; a subagent's claim is not final evidence.
8. Never delegate secrets, deployment approval, audience changes, or destructive migrations.

Use the project-scoped agents under `.codex/agents/` when available. See `prompts/SUBAGENT_PROMPTS.md` and `docs/01_ORCHESTRATOR.md`.

## ThreeUI rules

- Use ThreeUI as a selective enhancement, not the primary data-table framework.
- Search the catalog first, then inspect item metadata, source, dependencies, license/entitlement, and implementation prompt before adding anything.
- Record each adopted item and source in `docs/THREEUI_COMPONENT_LOG.md`.
- Prefer components that preserve semantic HTML, keyboard navigation, reduced-motion behavior, and acceptable bundle/performance budgets.
- Do not place continuous WebGL effects behind tables, forms, upload controls, or report content.
- Every 3D/shader enhancement needs a reduced-motion path, a WebGL failure fallback, and a no-animation/mobile fallback.
- If ThreeUI MCP is unavailable or unauthenticated, use the official Community package/source only as described in `docs/10_THREEUI_MCP.md`. Do not scrape or bypass entitlement controls.

## Data and security rules

- Treat uploaded workbooks as confidential construction-project data.
- Validate extension, MIME signature, archive expansion, sheet/row/cell limits, and formulas before processing.
- Never execute workbook macros, embedded scripts, external links, or formulas.
- Defend CSV/XLSX exports against spreadsheet formula injection by escaping dangerous leading characters.
- Use opaque IDs in URLs. Authorize project membership on every server operation.
- Use least-privilege access. Default new Sites to owner/admin-only.
- Never log secrets, auth headers, full source rows, AI prompts containing raw confidential data, or signed file URLs.
- Add retention/deletion behavior before production use. Destructive deletion requires confirmation and an audit record.
- Any AI integration must minimize submitted fields, use structured output validation, record provider/model/prompt-policy versions, and support a disabled mode.

## Testing rules

At minimum, maintain:

- unit tests for canonicalization, decimal math, formula parsing, each rule, severity/confidence scoring, and state transitions
- parser fixtures for valid, malformed, multi-sheet, merged-cell, hidden-row, formula, duplicate, Korean text, and large inputs
- integration tests for D1 repositories, R2 object lifecycle, authorization, idempotency, and review-run persistence
- end-to-end tests for sign-in/access, project creation, upload, mapping, review, triage, rerun, export, and recovery
- accessibility checks for keyboard, focus, labels, contrast, screen-reader names, reduced motion, and zoom
- security checks for IDOR, upload abuse, formula injection, XSS, CSRF assumptions, secret leakage, and authorization bypass
- visual checks at 360, 768, 1280, and 1440 CSS pixels

Do not weaken or delete tests to make a build pass. If a test is invalid, explain and replace it with equivalent coverage.

## UI rules

- Korean-first copy with concise construction-domain labels. Keep codes, rule IDs, and schema identifiers in English.
- Desktop-first for dense review work, but all primary flows must remain usable at 360px width.
- Use semantic status labels in addition to color.
- Persist filters in the URL when practical and do not lose user work on navigation.
- Long-running actions show queued/running/completed/failed states, progress where truthful, retry guidance, and a stable run ID.
- Tables need sticky context, sortable/filterable columns, keyboard access, empty/loading/error states, and an accessible detail view.
- Destructive actions require explicit confirmation and explain impact.

## Documentation and decision discipline

- Update relevant docs when behavior or contracts change.
- Record assumptions that require domain confirmation as `needs-domain-validation`.
- Record platform-dependent choices as `needs-platform-validation` until verified in the actual Sites project.
- Add a rule catalog entry and test examples for every new FIN/RC rule.
- Keep `tasks/BACKLOG.md` statuses honest. A task is done only with code, tests, and acceptance evidence.

## Definition of done

A feature is done only when:

- behavior matches the PRD and acceptance criteria
- authorization and failure paths are implemented
- tests pass and evidence is captured
- accessibility is checked
- audit and lineage requirements are satisfied
- docs/migrations/rollback notes are current
- no secrets or unapproved licensed assets are committed
- the main agent has run integration verification

A release is done only after the user approves deployment and the complete release checklist passes.
