# Orchestrator Instructions

## 1. Main-agent mandate

The main agent owns:

- interpretation of the PRD and user decisions;
- current repository truth;
- architecture and shared contracts;
- task sequencing and file ownership;
- integration and conflict resolution;
- acceptance/QA evidence;
- migration/release/deployment gates;
- final communication with the user.

Subagents provide bounded work and evidence. They do not replace the main agent's integration verification.

## 2. Operating rules

1. Read `START_HERE.md`, `AGENTS.md`, all numbered `docs/`, and current `git status` before implementation.
2. Start with Phase 0; do not let implementation agents guess shared contracts.
3. Spawn agents only for concrete independent work.
4. Give write agents exclusive path ownership.
5. Use read-only agents for exploration, review, security, QA, and platform research.
6. Wait for required results, reconcile contradictions, and record decisions.
7. Integrate in small vertical slices that build/test.
8. Re-run shared checks in the main thread.
9. Do not deploy or widen access without explicit user approval.

## 3. Phase 0 — Discovery and contract freeze

### Main-agent preflight

- Inspect repository root, project instructions, worktree status, package manager, scripts, source layout, migrations, tests, `.openai/hosting.json`, `.codex/`, environment examples, and existing docs.
- Identify user-owned changes and protected paths.
- Create/update `docs/DECISION_LOG.md` and task statuses.

### Parallel Wave 0A — Read-only discovery

Run up to three independent agents:

1. `repo_mapper`
   - Map code, scripts, test stack, hosting manifest, dirty files, and likely ownership boundaries.
2. `platform_architect`
   - Verify actual Sites starter/runtime, D1/R2/auth integration patterns, limits, and migration/report constraints from current code and official docs/tools.
3. `qa_auditor`
   - Map current coverage, fixture gaps, browser/a11y/security/performance tooling, and release-command baseline.

Optional fourth `security_reviewer` maps threat-relevant surfaces if there is already code.

### Required Wave 0A return format

```text
Objective
Facts with file/tool references
Unknowns
Risks
Recommended decisions
Files that would be owned/affected
Validation commands
```

### Contract freeze gate

The main agent records and publishes:

- verified app shape, package manager and commands;
- module/path ownership map;
- canonical row/value/unit/lineage schema;
- review rule/result/finding/evidence contracts;
- API success/error/idempotency/concurrency contracts;
- D1 tables/migration plan and R2 key/binding names;
- identity/role/approval policy;
- upload/parser scope and verified limits;
- review execution model: single request or resumable chunk;
- AI disabled/enabled adapter boundary;
- ThreeUI MCP/community decision;
- release/QA commands and evidence paths.

No parallel write wave begins until dependent contracts are frozen or the tasks do not touch them.

## 4. Phase 1 — Secure vertical skeleton

Goal: a private, testable path from authenticated user to project/case storage with audit/error patterns.

### Suggested Wave 1 ownership

- `data_platform`: migrations, repositories, D1/R2/auth adapters, application authorization, audit base.
- `frontend_ui`: app shell, identity/project/case routes and all basic states, using frozen contracts.
- `security_reviewer`: read-only review of identity, IDOR, R2 and secret design after first integration.
- `qa_auditor`: read-only test/evidence plan and coverage review.

The main agent owns composition root, shared types and integration conflicts.

### Gate 1

- type/lint/unit/integration/build pass;
- project role matrix and cross-project denial pass;
- migrations apply empty;
- R2 adapter has private exact-key contract;
- UI includes unauthorized/error/loading/empty states;
- no deployment.

## 5. Phase 2 — Ingestion

Goal: safe XLSX/CSV source version → inspection → confirmed mapping → ready canonical dataset.

### Suggested Wave 2

- `data_platform` or a dedicated import worker owns parser/import server paths and migrations.
- `frontend_ui` owns upload/sheet/mapping/data-quality UI.
- `review_engine` may build decimal/unit/formula primitives only if their canonical contracts are already frozen.
- `security_reviewer` audits hostile file handling and export/parser dependencies.
- `qa_auditor` creates/reviews synthetic fixtures and import evidence.

### Gate 2

- FILE/IMP/MAP/NORM P0 acceptance criteria pass;
- parser hostile/boundary fixtures pass;
- raw/normalized/lineage and checksum reproducibility pass;
- refresh/retry/failure states verified;
- no unbounded browser preview.

## 6. Phase 3 — Deterministic review MVP

Goal: FIN Level A run lifecycle → findings/evidence → human disposition/adjustment → rerun.

### Suggested Wave 3

- `review_engine` exclusively owns review core, FIN rules and unit tests.
- `data_platform` owns review persistence, run orchestration, findings/adjustments APIs.
- `frontend_ui` owns configuration/progress/results/detail/adjustment views.
- `qa_auditor` and `security_reviewer` run after integration, read-only.

Freeze rule/evidence and run-state contracts before this wave. No agent edits another agent's owned paths.

### Gate 3

- RUN/RULE/FIN/FIND/ADJ P0 criteria pass;
- A/B deterministic checksum repeat passes;
- completed run immutability and optimistic conflict pass;
- keyboard browser flow passes;
- evidence is domain-readable.

## 7. Phase 4 — Statistics and RC

Goal: robust cohorts/outliers and separate RC profile.

### Suggested Wave 4

- `review_engine`: statistics, FIN B rules, RC rule families and fixtures.
- `data_platform`: baselines/cohorts/profile version storage and comparison queries.
- `frontend_ui`: cohort/config UI, RC prerequisites, run comparison.
- `qa_auditor`: statistical edge cases, performance and comparison audit.

### Gate 4

- no tiny-cohort false certainty;
- unit/member/floor cohorts explicit;
- RC missing inputs show not evaluated;
- domain review of formulas/tolerances recorded;
- representative L dataset performance measured.

## 8. Phase 5 — Contextual assistance and reports

Goal: optional Level C adapter and traceable report/approval.

### Suggested Wave 5

- `review_engine`: contextual request/output validation and Level C assembly.
- `data_platform`: AI adapter, assessments, report artifact/approval/audit APIs.
- `frontend_ui`: contextual labels/limitations, report preview/approval/audit.
- `security_reviewer`: prompt injection, minimization, approval integrity and report download.
- `qa_auditor`: AI-disabled/error/malformed output and report injection fixtures.

### Gate 5

- AI disabled mode passes;
- AI cannot mutate human states;
- report binds exact checksum/versions;
- formula-injection/XSS/download authorization passes;
- PDF is included only when verified.

## 9. Phase 6 — UI polish, ThreeUI and hardening

ThreeUI integration occurs only after core routes are functionally stable.

### Suggested Wave 6

- `frontend_ui`: approved ThreeUI wrappers and UI refinements.
- `qa_auditor`: browser, visual, a11y, performance and fallback evidence.
- `security_reviewer`: dependency/license/network/privacy review.
- `release_manager`: read-only release and migration evidence audit.

### Gate 6

- all P0 and required P1 acceptance evidence complete;
- no critical/high security/correctness issue;
- viewport/keyboard/reduced-motion/no-WebGL pass;
- performance budgets pass;
- saved candidate may be prepared, but not deployed.

## 10. Phase 7 — Saved candidate and approved release

### Candidate steps

1. Main agent verifies clean source and exact commit.
2. Run release QA sequence.
3. `release_manager` audits checklist/evidence read-only.
4. Build and save a Sites version associated with the exact source state.
5. Review candidate, source changes, migrations, access and core smoke path.
6. Present candidate evidence, open risks and intended audience to user.
7. Stop for explicit deployment and audience approval.

### After explicit approval

1. Deploy the approved saved version only.
2. Set the approved narrow audience.
3. Run intended/unauthorized visitor smoke tests.
4. Inspect production status/logs.
5. Record URL/version/commit/audience/rollback.
6. If smoke fails, restrict access/rollback according to the approved plan.

## 11. File ownership protocol

Before each write wave, publish a table:

| Agent | Objective | Owned paths | Read-only dependencies | Forbidden paths | Acceptance IDs |
| ----- | --------- | ----------- | ---------------------- | --------------- | -------------- |

Rules:

- Shared canonical types and migrations have one owner.
- An agent may read any needed file but edits only owned paths.
- If a needed change crosses ownership, return a proposed diff/request to the main agent.
- Generated lockfile changes have one owner.
- Main agent resolves merge/conflicts and runs integration checks.

## 12. Subagent task contract

Every delegation message contains:

```text
Role and bounded objective
Current phase/task IDs
Facts/decisions already frozen
Inputs and required docs
Owned paths (or read-only)
Forbidden paths/actions
Acceptance IDs
Expected tests/evidence
Required return format
Whether to wait for another contract
```

Use `prompts/SUBAGENT_PROMPTS.md`.

## 13. Return and integration protocol

Write-agent return:

```text
Outcome
Files changed
Contract decisions used
Tests run and exact results
Acceptance IDs addressed
Migrations/dependencies/docs changed
Known limits/risks
Follow-up for main agent
```

Review-agent return:

```text
Findings ordered by severity
Evidence with file/symbol/route/rule references
Reproduction or failing test
Acceptance/security impact
Recommended action
No-change statement if clean
```

The main agent:

- inspects diffs;
- reconciles shared contracts;
- runs integration tests;
- updates decision/backlog/evidence;
- never marks a phase complete from summaries alone.

## 14. Conflict and contradiction handling

When two agents disagree:

1. collect concrete evidence;
2. prefer verified repository/platform behavior;
3. check PRD/security/data invariants;
4. choose the smallest reversible decision;
5. record it in `docs/DECISION_LOG.md` or ADR;
6. steer/re-run the affected bounded task;
7. update contracts before more dependent work.

## 15. Blocking policy

Do not stop the whole project merely because optional inputs are absent.

- No ThreeUI MCP: use Community/no enhancement.
- No real workbook: use synthetic fixtures and mark domain validation pending.
- No AI key: implement disabled adapter and A/B product.
- No Sites binding yet: implement ports/fakes/local tests, keep platform acceptance blocked.

Stop and request user direction only when a missing choice would materially change scope, data policy, deployment, external cost, or irreversible action.

## 16. Status update format

```text
Phase / completed gate
Implemented and verified
Active parallel work
Blocked items and impact
Next safe integration step
No deployment/access changes unless explicitly stated
```
