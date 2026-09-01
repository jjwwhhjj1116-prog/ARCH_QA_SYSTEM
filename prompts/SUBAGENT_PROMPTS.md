# Subagent Prompts

Replace bracketed placeholders. Every prompt is intentionally bounded.

## 1. Generic task envelope

```text
Role: [CUSTOM_AGENT_NAME]
Phase/task IDs: [PHASE] / [TASK_IDS]
Objective: [ONE CONCRETE BOUNDED OUTCOME]

Read first:
- AGENTS.md
- [RELEVANT DOCS]
- [RELEVANT SOURCE FILES]

Frozen decisions/contracts:
- [FACTS THE AGENT MUST NOT REDESIGN]

Owned paths:
- [EXCLUSIVE PATHS OR "read-only; no edits"]

Forbidden:
- Do not edit outside owned paths.
- Do not change shared contracts, migrations, lockfile, deployment, Sites access, secrets, or third-party authentication unless explicitly listed as owned.
- Preserve existing user changes.

Acceptance IDs:
- [IDS]

Required verification:
- [COMMANDS / FIXTURES / EVIDENCE]

Return exactly:
1. Outcome
2. Facts/decisions used
3. Files changed (or inspected if read-only)
4. Tests/commands and exact results
5. Acceptance IDs addressed
6. Risks, unknowns, and parent-agent actions
```

## 2. Repository mapper

```text
Use the repo_mapper agent in read-only mode.

Map the current repository for Phase 0. Identify the actual project root, applicable AGENTS instructions, dirty/untracked files, package manager and scripts, app/server entry points, routing, Sites manifest, D1/R2/auth code, schema/migrations, tests, fixtures, build/deploy assumptions, and plausible exclusive path boundaries for data platform, review engine, UI and QA. Do not propose a greenfield layout before mapping the real one.

Return facts with file/symbol references, unknowns, risks, recommended ownership table, and exact baseline validation commands. Do not edit, install, authenticate, save/deploy or change access.
```

## 3. Platform architect

```text
Use the platform_architect agent in read-only mode.

Verify the current project's compatibility with Codex Sites and the product requirements. Check actual starter/runtime shape, `.openai/hosting.json` reuse, D1/R2 binding names, identity mechanism, upload/request constraints, migration support, request-bounded or resumable processing, report generation options, environment/secrets, saved version versus deployment, and project-scoped MCP configuration. Use current official documentation/tool evidence when needed and label inference.

Return a decision table: topic, verified fact, evidence, proposed choice, fallback, validation status. Include blocking versus non-blocking unknowns. Do not create or deploy a Site, change the manifest/audience, authenticate ThreeUI, or edit files.
```

## 4. Review engine implementation

```text
Use the review_engine agent.

Phase/task IDs: [TASK_IDS]
Objective: Implement [EXACT RULE/PRIMITIVE FAMILY] against the already-frozen canonical and evidence contracts.
Owned paths: [REVIEW_ENGINE_PATHS], [UNIT_TEST_PATHS], [FIXTURE_PATHS]
Read-only dependencies: [SHARED_TYPES]
Forbidden paths: [SERVER/UI/MIGRATION/LOCKFILE PATHS]
Acceptance IDs: [RULE/FIN/RC/RUN IDS]

Requirements:
- Pure and deterministic; no D1/R2/React/Sites/provider SDK.
- Decimal-safe, unit/dimension-safe, explicit tolerances.
- Missing prerequisites are skipped/not evaluated.
- Evidence and limitations are complete and deterministically ordered.
- Add clean, finding, boundary, missing, mixed-unit, adjustment and repeat tests.
- Increment/version semantics only as approved.

Return files, tests/results, evidence examples, performance note, domain assumptions and any requested shared-contract change for the parent to decide.
```

## 5. Data platform implementation

```text
Use the data_platform agent.

Phase/task IDs: [TASK_IDS]
Objective: Implement [EXACT USE CASE / ADAPTER / MIGRATION / API SLICE].
Owned paths: [SERVER/ADAPTER/MIGRATION/INTEGRATION TEST PATHS]
Read-only dependencies: [DOMAIN/REVIEW CONTRACTS]
Forbidden paths: [UI/REVIEW SEMANTICS/OTHER MIGRATIONS/LOCKFILE]
Acceptance IDs: [IDS]

Requirements:
- Verified server identity and action-specific project authorization.
- Validation at every boundary, safe error envelope, correlation ID.
- Idempotency/optimistic concurrency where specified.
- Immutable sources/completed runs/reports and append-only events.
- Private exact-key R2 access and recoverable D1/R2 states.
- Migration plus empty/upgrade/recovery tests.
- Safe redacted audit/logging.

Return exact migration/recovery notes, files, commands/results, security assumptions and integration points for the parent.
```

## 6. Frontend/UI implementation

```text
Use the frontend_ui agent.

Phase/task IDs: [TASK_IDS]
Objective: Implement [EXACT ROUTES/FLOW/COMPONENTS] against frozen API contracts.
Owned paths: [UI PATHS], [BROWSER TEST PATHS]
Read-only dependencies: [TRANSPORT TYPES/TOKENS]
Forbidden paths: [SERVER/DOMAIN/MIGRATIONS/LOCKFILE]
Acceptance IDs: [UI/A11Y/FLOW IDS]

Requirements:
- Korean-first semantic UI.
- Loading, empty, filtered-empty, error, unauthorized, conflict and partial states.
- Keyboard/focus/labels/status text/reduced-motion/accessibility.
- Preserve navigation and unsaved/confirmed state.
- Bounded paginated tables and evidence details.
- ThreeUI only if specifically assigned and already approved; lazy with static/no-WebGL/error fallback.
- UI is not authorization.

Return screenshots/evidence paths, browser/test results, responsive/focus notes, contract gaps for the parent, and no unrelated redesign.
```

## 7. QA audit

```text
Use the qa_auditor agent in read-only mode.

Audit [SCOPE/COMMIT/DIFF] against these acceptance IDs: [IDS]. Read `docs/06_ACCEPTANCE_CRITERIA.md` and `docs/07_QA_PLAN.md`. Inspect implementation/tests and run only safe non-mutating commands authorized by the parent.

Lead with findings ordered P0/P1/P2. For each include: title, affected acceptance ID, file/symbol/test reference, reproduction or missing fixture, expected versus actual, release impact, and the smallest defensible fix. Also list unverified claims/skipped evidence and a clean statement for categories with no finding. Do not edit or accept snapshots.
```

## 8. Security review

```text
Use the security_reviewer agent in read-only mode.

Review [SCOPE/DIFF] against `docs/09_SECURITY_AND_PRIVACY.md` and acceptance IDs [SEC/AUTH/FILE/REP IDS]. Focus on project IDOR, identity spoofing, role checks, R2 authorization/deletion, malicious workbook/CSV limits, formula/macro/link non-execution, XSS, spreadsheet formula injection, CSRF/origin assumptions, secret/log leakage, AI prompt injection/minimization, optimistic concurrency, deletion scope and report approval checksum.

Return only evidence-backed findings ordered by severity. Include attack/reproduction path where safe, impacted data/action, file/symbol references, missing test, acceptance impact and recommended remediation. End with tested categories that were clean and remaining uncertainty. Do not edit or use real confidential data.
```

## 9. Release audit

```text
Use the release_manager agent in read-only mode.

Audit candidate [COMMIT/VERSION] using `docs/11_RELEASE_CHECKLIST.md`. Verify source state, lockfile, migrations empty/upgrade/recovery, all required command results, acceptance matrix, browser/access evidence, secret/license/security results, ThreeUI provenance/performance/fallback, report checksum/authorization, saved Sites version linkage, approved audience and rollback.

Return GO/NO-GO with blocking items first. Every passed gate needs evidence. Do not save/deploy, change access/domain, run destructive migrations, or infer user approval.
```

## 10. ThreeUI catalog research

```text
Use a read-only agent with access to the configured ThreeUI MCP.

Objective: Find at most three candidates for [PLACEMENT], following `docs/10_THREEUI_MCP.md`.
Use catalog search first, then inspect each item's metadata, prompt, source/dependencies, assets, license/entitlement and controls. Do not download/adopt Pro source without verified entitlement and do not edit the repository.

Return the component scorecard for each candidate, reject reasons, recommended item or Community/no-enhancement fallback, expected wrapper/fallback, and validation plan. Do not authenticate without user action.
```

## 11. Agent follow-up/steer

```text
Keep the same role and owned paths. Address only these review points:
- [POINTS]

Do not broaden scope. Re-run [CHECKS]. Return the updated outcome, exact changed files/results and remaining risks.
```
