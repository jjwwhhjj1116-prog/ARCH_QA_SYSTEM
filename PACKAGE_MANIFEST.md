# Package Manifest

This is a self-contained, instruction-first implementation package for **FIN & RC AI Quantity Review Studio**. Extract the ZIP into a new repository or place its contents at the root of the target repository, then open `START_HERE.md`.

## Root control documents

- `START_HERE.md` — exact first-run sequence and stop conditions.
- `AGENTS.md` — repository-wide Codex rules and completion contract.
- `README.md` — package overview, scope, and operating model.
- `PACKAGE_MANIFEST.md` — this inventory.

## Codex configuration

- `.codex/config.toml` — subagent concurrency and optional project-scoped ThreeUI MCP configuration.
- `.codex/agents/*.toml` — repo mapper, platform architect, review-engine, data-platform, frontend, QA, security, and release roles.

## Product and engineering specification

- `docs/00_MASTER_PRD.md`
- `docs/01_ORCHESTRATOR.md`
- `docs/02_ARCHITECTURE.md`
- `docs/03_DATA_MODEL.md`
- `docs/04_REVIEW_ENGINE.md`
- `docs/05_UI_SYSTEM.md`
- `docs/06_ACCEPTANCE_CRITERIA.md`
- `docs/07_QA_PLAN.md`
- `docs/08_CODING_AND_REPO_RULES.md`
- `docs/09_SECURITY_AND_PRIVACY.md`
- `docs/10_THREEUI_MCP.md`
- `docs/11_RELEASE_CHECKLIST.md`
- `docs/12_API_CONTRACTS.md`
- `docs/13_OBSERVABILITY_AND_OPERATIONS.md`
- `docs/DECISION_LOG.md`
- `docs/THREEUI_COMPONENT_LOG.md`
- `docs/REFERENCES.md`

## Execution prompts

- `prompts/ORCHESTRATOR_START_PROMPT.md` — paste only when manually bootstrapping an orchestrator.
- `prompts/SUBAGENT_PROMPTS.md` — bounded role prompts and handoff expectations.
- `prompts/PHASE_PROMPTS.md` — prompts for discovery through release readiness.

## Work-control templates

- `tasks/BACKLOG.md` — sequenced epics, dependencies, and definition of done.
- `tasks/TASK_TEMPLATE.md`
- `tasks/HANDOFF_TEMPLATE.md`
- `tasks/ADR_TEMPLATE.md`
- `tasks/BUG_REPORT_TEMPLATE.md`
- `tasks/QA_EVIDENCE_TEMPLATE.md`
- `tasks/PR_REVIEW_TEMPLATE.md`
- `tasks/DOMAIN_RULE_REVIEW_TEMPLATE.md`
- `tasks/MIGRATION_RUNBOOK_TEMPLATE.md`

## Environment inventory

- `templates/ENVIRONMENT_KEYS.example` — variable names only; never store secret values in the repository.

## Intended use

Codex must first inspect the actual repository, Sites project, official live documentation, permissions, and available ThreeUI tools. It may create application source only after Phase 0 findings are recorded. It may save a Sites candidate version after verification, but may not deploy to production without explicit user approval.

The ZIP must preserve UTF-8 filenames and file contents. No secrets, credentials, proprietary sample workbooks, or generated application binaries are included.

## Current implementation overlay

The repository now contains a tested local vertical slice in addition to the original 43-file instruction package.

| Path                             | Implemented responsibility                            |
| -------------------------------- | ----------------------------------------------------- |
| `app/review-studio.tsx`          | Korean workbench with source-package upload workflow  |
| `app/api/projects/`              | project, case and source-package intent APIs          |
| `app/api/uploads/`               | authorized bounded source-byte transfer               |
| `lib/auth/`, `lib/http/`         | actor and request security boundaries                 |
| `lib/projects/`, `lib/cases/`    | services and D1 repositories                          |
| `lib/files/`                     | private R2 storage contract and integrity adapter     |
| `lib/ingestion/`                 | package/file/version/upload lifecycle and D1 adapter  |
| `lib/imports/`                   | structural XLSX/CSV preflight, not semantic parsing   |
| `db/`, `drizzle/0001..0003`      | schema, ingestion lineage and scoped idempotency      |
| `tests/e2e/`                     | browser, responsive, accessibility and isolation flow |
| `artifacts/qa/phase-1/`          | reproducible local evidence and NO-GO limitations     |
| `artifacts/qa/phase-2/`          | secure-upload checkpoint evidence and Gate 2 gaps     |
| `package.json`, `vite.config.ts` | build and full verification commands                  |

Cloudflare provisioning and deployment remain intentionally deferred. The local slice includes source-package intent, bounded byte upload, structural XLSX/CSV preflight and private source storage. It does not yet include semantic workbook inspection, mapping, canonical normalization or the FIN/RC review engine.
