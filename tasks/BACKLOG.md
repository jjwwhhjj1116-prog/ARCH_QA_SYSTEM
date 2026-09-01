# Implementation Backlog

Statuses: `TODO`, `IN_PROGRESS`, `BLOCKED`, `DONE`.

Completion requires code, tests, acceptance evidence and updated docs—not implementation alone.

## Phase 0 — Discovery and contracts

| ID     | Task                                                                | Owner                                  | Depends              | Acceptance / output     | Status      |
| ------ | ------------------------------------------------------------------- | -------------------------------------- | -------------------- | ----------------------- | ----------- |
| P0-001 | Inspect instructions, git state, project root and user changes      | main + repo_mapper                     | —                    | repository map          | DONE        |
| P0-002 | Map package manager, scripts, app/server routes, tests and fixtures | repo_mapper                            | P0-001               | PLAT-004                | DONE        |
| P0-003 | Inspect `.openai/hosting.json` and existing Sites linkage           | repo_mapper + platform_architect       | P0-001               | PLAT-002                | DONE        |
| P0-004 | Verify Sites starter/runtime/build compatibility                    | platform_architect                     | P0-002               | PLAT-001                | DONE        |
| P0-005 | Verify D1/R2 binding names and local/test strategy                  | platform_architect                     | P0-003               | PLAT-003                | IN_PROGRESS |
| P0-006 | Verify identity/access/sign-in mechanism                            | platform_architect + security_reviewer | P0-004               | AUTH-001/002            | BLOCKED     |
| P0-007 | Verify upload/request/build/storage constraints                     | platform_architect                     | P0-004               | decision log            | DONE        |
| P0-008 | Decide parser library and restricted formula scope                  | main                                   | P0-002/P0-007        | parser ADR              | IN_PROGRESS |
| P0-009 | Decide decimal representation and unit table                        | main + review_engine consult           | P0-002               | ADR-003                 | DONE        |
| P0-010 | Freeze canonical row/value/lineage schema                           | main                                   | P0-008/P0-009        | NORM contracts          | DONE        |
| P0-011 | Freeze rule/result/finding/evidence/run contracts                   | main                                   | P0-010               | RUN/RULE/FIND contracts | DONE        |
| P0-012 | Freeze D1/R2 model and migration ownership                          | main + data_platform consult           | P0-005/P0-010/P0-011 | data contract           | DONE        |
| P0-013 | Freeze API/error/idempotency/concurrency contract                   | main                                   | P0-006/P0-012        | API contract            | DONE        |
| P0-014 | Decide request-bounded or resumable review execution                | main + platform_architect              | P0-007/P0-011        | ADR-004                 | DONE        |
| P0-015 | Decide report formats/PDF path and AI disabled boundary             | main                                   | P0-004/P0-007        | ADR-006/007             | DONE        |
| P0-016 | Verify ThreeUI MCP tool schema/entitlement or fallback              | main + platform_architect              | P0-004               | ADR-008/component log   | BLOCKED     |
| P0-017 | Map QA/security/a11y/performance tools and commands                 | qa_auditor                             | P0-002               | QA baseline             | DONE        |
| P0-018 | Publish file ownership table and Phase 1 batch                      | main                                   | P0-010..017          | orchestrator gate       | DONE        |

## Phase 1 — Secure vertical skeleton

| ID     | Task                                                         | Owner                          | Depends             | Acceptance / output | Status      |
| ------ | ------------------------------------------------------------ | ------------------------------ | ------------------- | ------------------- | ----------- |
| P1-001 | Establish typed environment/config and health diagnostics    | data_platform                  | P0-018              | PLAT-003/005        | IN_PROGRESS |
| P1-002 | Create baseline D1 migrations and migration tests            | data_platform                  | P0-012/P1-001       | REL-002             | DONE        |
| P1-003 | Implement verified actor resolver                            | data_platform                  | P0-006              | AUTH-001            | IN_PROGRESS |
| P1-004 | Implement project membership/role policy                     | data_platform                  | P1-002/P1-003       | AUTH-002..006       | IN_PROGRESS |
| P1-005 | Implement project/case repositories and application services | data_platform                  | P1-002/P1-004       | PROJ/CASE           | DONE        |
| P1-006 | Implement safe error envelope/correlation/log redaction      | data_platform                  | P1-001              | API/OBS             | DONE        |
| P1-007 | Implement append-only audit base                             | data_platform                  | P1-002/P1-006       | AUD-001/002         | DONE        |
| P1-008 | Implement R2 port/adapter contract with exact private keys   | data_platform                  | P0-005/P1-004       | AUTH-007            | IN_PROGRESS |
| P1-009 | Build Korean-first app shell and identity state              | frontend_ui                    | P0-013              | UI/A11Y             | DONE        |
| P1-010 | Build project dashboard/create/detail/case shell             | frontend_ui                    | P1-005 API contract | PROJ/CASE E2E       | DONE        |
| P1-011 | Implement loading/empty/error/unauthorized/conflict states   | frontend_ui                    | P1-009/P1-010       | UI-003              | IN_PROGRESS |
| P1-012 | Add project role/cross-project integration tests             | data_platform                  | P1-004/P1-005       | AUTH-003/004/005    | IN_PROGRESS |
| P1-013 | Add Phase 1 browser keyboard flow                            | frontend_ui                    | P1-010/P1-011       | A11Y-001            | DONE        |
| P1-014 | Security and QA audit integrated skeleton                    | security_reviewer + qa_auditor | P1-001..013         | Gate 1              | IN_PROGRESS |
| P1-015 | Main-agent integration checks and evidence                   | main                           | P1-014              | Gate 1 complete     | IN_PROGRESS |

## Phase 2 — Ingestion

| ID     | Task                                                         | Owner                                     | Depends              | Acceptance / output | Status      |
| ------ | ------------------------------------------------------------ | ----------------------------------------- | -------------------- | ------------------- | ----------- |
| P2-001 | Add source/upload/import/dataset migrations                  | data_platform                             | P1-015               | data model          | IN_PROGRESS |
| P2-002 | Implement upload intent/finalize/idempotency                 | data_platform                             | P2-001/P1-008        | FILE-001/007        | IN_PROGRESS |
| P2-003 | Implement signature/type/filename/size guards                | data_platform                             | P0-008/P2-002        | FILE-002/003        | IN_PROGRESS |
| P2-004 | Implement archive/sheet/row/column/cell safety limits        | data_platform                             | P2-003               | FILE-003/004        | IN_PROGRESS |
| P2-005 | Implement XLSX safe inspection                               | data_platform                             | P2-004               | IMP-001/003         | TODO        |
| P2-006 | Implement CSV encoding/delimiter inspection                  | data_platform                             | P2-003               | IMP-002             | TODO        |
| P2-007 | Implement mapping draft/proposal/confirm versions            | data_platform                             | P0-010/P2-005/P2-006 | MAP-001..003        | TODO        |
| P2-008 | Implement decimal/unit/text/floor normalization              | review_engine or assigned import owner    | P0-009/P0-010        | NORM-001..005       | TODO        |
| P2-009 | Implement canonical dataset persistence/checksum/diagnostics | data_platform                             | P2-007/P2-008        | NORM-006..008       | TODO        |
| P2-010 | Implement resumable import state/lease if required           | data_platform                             | P0-014/P2-009        | failure recovery    | TODO        |
| P2-011 | Create synthetic structure/semantic/security fixtures        | qa owner or assigned implementation owner | P0-017/P2-003        | fixture catalog     | IN_PROGRESS |
| P2-012 | Build upload and validation UI                               | frontend_ui                               | P2-002/P2-003 API    | FILE-009            | IN_PROGRESS |
| P2-013 | Build sheet inventory/preview UI                             | frontend_ui                               | P2-005/P2-006 API    | IMP UI              | TODO        |
| P2-014 | Build mapping/unit/floor/exclusion UI                        | frontend_ui                               | P2-007 API           | MAP-004             | TODO        |
| P2-015 | Build data-quality/diagnostic/skipped-rule UI                | frontend_ui                               | P2-009 API           | NORM-006/007        | TODO        |
| P2-016 | Add refresh/retry/conflict/browser ingestion tests           | frontend_ui + data_platform owned tests   | P2-012..015          | E2E                 | IN_PROGRESS |
| P2-017 | Hostile upload/security/performance audit                    | security_reviewer + qa_auditor            | P2-001..016          | Gate 2              | TODO        |
| P2-018 | Main integration and Gate 2 evidence                         | main                                      | P2-017               | Gate 2 complete     | TODO        |

## Phase 3 — Deterministic FIN MVP

| ID     | Task                                                    | Owner                                   | Depends                | Acceptance / output   | Status |
| ------ | ------------------------------------------------------- | --------------------------------------- | ---------------------- | --------------------- | ------ |
| P3-001 | Implement review profile/rule registry and eligibility  | review_engine                           | P0-011/P2-018          | RULE-001/002          | TODO   |
| P3-002 | Implement restricted formula parser/evaluator           | review_engine                           | P0-008/P2-008          | RULE-003              | TODO   |
| P3-003 | Implement tolerance/evidence/finding fingerprint core   | review_engine                           | P3-001/P2-008          | RULE-004/005/FIND-001 | TODO   |
| P3-004 | Implement COM data/unit/value/duplicate/subtotal rules  | review_engine                           | P3-001..003            | common rules          | TODO   |
| P3-005 | Implement FIN-CALC-001 and FIN-SUM-002                  | review_engine                           | P3-002..004            | FIN-001/002           | TODO   |
| P3-006 | Implement FIN exact duplicate/unit/rounding rules       | review_engine                           | P3-003/P3-004          | FIN-003               | TODO   |
| P3-007 | Add clean/boundary/missing/mixed-unit/repeat tests      | review_engine                           | P3-004..006            | RUN-009/RULE          | TODO   |
| P3-008 | Add review run/rule result/finding/evidence migrations  | data_platform                           | P0-012/P3-003 contract | RUN/FIND storage      | TODO   |
| P3-009 | Implement run create/stage/idempotency/immutability     | data_platform                           | P0-014/P3-008          | RUN-001..005/007/008  | TODO   |
| P3-010 | Implement finding list/detail/state/events/comments     | data_platform                           | P3-008/P3-009          | FIND-001/003/005/010  | TODO   |
| P3-011 | Implement adjustment overlay and rerun snapshot         | data_platform                           | P2-009/P3-009          | ADJ/CMP-001           | TODO   |
| P3-012 | Build review configuration/progress UI                  | frontend_ui                             | P3-009 API             | RUN-004/008           | TODO   |
| P3-013 | Build results/findings/evidence/history UI              | frontend_ui                             | P3-010 API             | FIND-002..004         | TODO   |
| P3-014 | Build disposition/comment/adjustment UI                 | frontend_ui                             | P3-010/P3-011 API      | FIND/ADJ              | TODO   |
| P3-015 | Add end-to-end FIN review/rerun/refresh/conflict flow   | frontend_ui + data_platform owned tests | P3-012..014            | Gate 3 E2E            | TODO   |
| P3-016 | Domain evidence review and deterministic checksum audit | qa_auditor                              | P3-001..015            | Gate 3                | TODO   |
| P3-017 | Security review of findings/state/adjustment auth       | security_reviewer                       | P3-008..015            | Gate 3 SEC            | TODO   |
| P3-018 | Main integration and Gate 3 evidence                    | main                                    | P3-016/P3-017          | Gate 3 complete       | TODO   |

## Phase 4 — Statistics, RC and comparison

| ID     | Task                                                     | Owner                  | Depends         | Acceptance / output | Status |
| ------ | -------------------------------------------------------- | ---------------------- | --------------- | ------------------- | ------ |
| P4-001 | Implement robust cohort/MAD/IQR primitives               | review_engine          | P3-018          | statistical core    | TODO   |
| P4-002 | Implement FIN alias fragmentation policy                 | review_engine          | P4-001          | FIN-004             | TODO   |
| P4-003 | Implement FIN outlier/typical-floor rules                | review_engine          | P4-001          | FIN-005/006         | TODO   |
| P4-004 | Implement FIN completeness/GFA/basis/reference guards    | review_engine          | P4-001          | FIN-007..010        | TODO   |
| P4-005 | Implement RC profile prerequisites and unit classes      | review_engine          | P3-003/P4-001   | RC-008/010          | TODO   |
| P4-006 | Implement RC concrete/formwork/rebar rules               | review_engine          | P4-005          | RC-001..003         | TODO   |
| P4-007 | Implement RC member/duplicate/floor/missing/ratio rules  | review_engine          | P4-005/P4-001   | RC-004..009         | TODO   |
| P4-008 | Add RC/statistical domain fixtures and performance tests | review_engine          | P4-001..007     | RULE/RC             | TODO   |
| P4-009 | Add baselines/cohorts/config/profile-version persistence | data_platform          | P4-001 contract | config storage      | TODO   |
| P4-010 | Implement cross-run continuity/comparison API            | data_platform          | P3-009/P3-010   | CMP-002/003         | TODO   |
| P4-011 | Build cohort/baseline/profile config UI                  | frontend_ui            | P4-009 API      | FIN/RC config       | TODO   |
| P4-012 | Build RC prerequisite/not-evaluated and result views     | frontend_ui            | P4-005..010 API | RC-010              | TODO   |
| P4-013 | Build run comparison UI                                  | frontend_ui            | P4-010 API      | CMP-002/003         | TODO   |
| P4-014 | Domain reviewer sign-off workflow/evidence               | main + domain reviewer | P4-002..008     | domain validation   | TODO   |
| P4-015 | Statistical/RC QA and L-dataset performance audit        | qa_auditor             | P4-001..013     | Gate 4              | TODO   |
| P4-016 | Main integration and Gate 4 evidence                     | main                   | P4-014/P4-015   | Gate 4 complete     | TODO   |

## Phase 5 — Contextual assistance, reports and audit

| ID     | Task                                                       | Owner                                     | Depends              | Acceptance / output | Status |
| ------ | ---------------------------------------------------------- | ----------------------------------------- | -------------------- | ------------------- | ------ |
| P5-001 | Define minimized contextual request/output schemas         | review_engine + main contract             | P4-016               | AI-002/003          | TODO   |
| P5-002 | Implement output/reference validation and Level C assembly | review_engine                             | P5-001               | AI-003/005          | TODO   |
| P5-003 | Implement AI-disabled adapter and provider boundary        | data_platform                             | P5-001               | AI-001/006          | TODO   |
| P5-004 | Persist AI assessment provenance/limitations safely        | data_platform                             | P5-002/P5-003        | AI-004              | TODO   |
| P5-005 | Add malicious/malformed/timeout AI tests                   | review_engine + data_platform owned tests | P5-002..004          | AI P0               | TODO   |
| P5-006 | Add report/approval/audit migrations                       | data_platform                             | P3-008/P4-016        | report model        | TODO   |
| P5-007 | Implement XLSX export with formula-injection defense       | data_platform                             | P5-006               | REP-003/004         | TODO   |
| P5-008 | Implement printable HTML and verified PDF decision         | data_platform                             | P0-015/P5-006        | REP-004/005         | TODO   |
| P5-009 | Implement private artifact/checksum/download               | data_platform                             | P1-008/P5-007/P5-008 | REP-004/006         | TODO   |
| P5-010 | Implement report approval/self-approval/supersession       | data_platform                             | P5-006/P5-009        | REP-006/007         | TODO   |
| P5-011 | Implement audit query/export/admin basics                  | data_platform                             | P1-007/P5-006        | AUD-003             | TODO   |
| P5-012 | Build Level C labels/limitations/error UI                  | frontend_ui                               | P5-002..004 API      | AI UI               | TODO   |
| P5-013 | Build report preview/generate/approval UI                  | frontend_ui                               | P5-007..010 API      | REP UI              | TODO   |
| P5-014 | Build audit/admin UI                                       | frontend_ui                               | P5-011 API           | AUD UI              | TODO   |
| P5-015 | Security audit AI/report/XSS/injection/download/approval   | security_reviewer                         | P5-001..014          | Gate 5 SEC          | TODO   |
| P5-016 | QA audit AI-disabled/failure/report fixtures               | qa_auditor                                | P5-001..014          | Gate 5 QA           | TODO   |
| P5-017 | Main integration and Gate 5 evidence                       | main                                      | P5-015/P5-016        | Gate 5 complete     | TODO   |

## Phase 6 — Hardening and ThreeUI

| ID     | Task                                                           | Owner                                         | Depends       | Acceptance / output   | Status |
| ------ | -------------------------------------------------------------- | --------------------------------------------- | ------------- | --------------------- | ------ |
| P6-001 | Complete full keyboard/screen-reader/zoom/contrast audit fixes | frontend_ui                                   | P5-017        | A11Y P0/P1            | TODO   |
| P6-002 | Complete required viewport/error/long-Korean visual fixes      | frontend_ui                                   | P5-017        | UI-001..005           | TODO   |
| P6-003 | Establish performance baselines/budgets and fix regressions    | main + implementation owner                   | P5-017        | PERF-001/002          | TODO   |
| P6-004 | Research up to three ThreeUI candidates                        | platform_architect or read-only catalog agent | P0-016/P6-003 | component scorecards  | TODO   |
| P6-005 | Approve ThreeUI candidate or Community/no-enhancement fallback | main                                          | P6-004        | ADR/component log     | TODO   |
| P6-006 | Implement approved lazy wrapper/fallback only                  | frontend_ui                                   | P6-005        | PERF-003/004/A11Y-004 | TODO   |
| P6-007 | Verify ThreeUI license/network/privacy/cleanup/performance     | security_reviewer + qa_auditor                | P6-006        | ThreeUI gate          | TODO   |
| P6-008 | Complete retention/deletion/reconciliation tests/runbooks      | data_platform                                 | P5-017        | RET/SEC-004           | TODO   |
| P6-009 | Complete operations/admin diagnostics and failure injection    | data_platform                                 | P5-017        | OBS/reliability       | TODO   |
| P6-010 | Full security regression and threat-model closeout             | security_reviewer                             | P6-001..009   | SEC P0                | TODO   |
| P6-011 | Full QA/acceptance/performance/visual evidence                 | qa_auditor                                    | P6-001..010   | REL-001               | TODO   |
| P6-012 | Main fixes/integration and saved-candidate readiness           | main                                          | P6-011        | Gate 6                | TODO   |

## Phase 7 — Candidate and release

| ID     | Task                                                          | Owner                  | Depends   | Acceptance / output | Status |
| ------ | ------------------------------------------------------------- | ---------------------- | --------- | ------------------- | ------ |
| P7-001 | Verify exact commit, clean source, migrations and QA manifest | main                   | P6-012    | release source      | TODO   |
| P7-002 | Release-manager read-only audit                               | release_manager        | P7-001    | GO/NO-GO            | TODO   |
| P7-003 | Resolve NO-GO findings and re-run evidence                    | assigned owner + main  | P7-002    | checklist pass      | TODO   |
| P7-004 | Save Sites candidate without production deployment            | main                   | P7-002 GO | PLAT-006/REL-003    | TODO   |
| P7-005 | Review candidate source/migrations/access/core smoke          | main + qa_auditor      | P7-004    | candidate evidence  | TODO   |
| P7-006 | Present candidate, risks, audience and rollback to user       | main                   | P7-005    | approval request    | TODO   |
| P7-007 | Obtain explicit deployment and audience approval              | user                   | P7-006    | REL-004             | TODO   |
| P7-008 | Deploy only approved saved version                            | main                   | P7-007    | production URL      | TODO   |
| P7-009 | Verify intended and unauthorized visitor behavior             | main + qa_auditor      | P7-008    | REL-005             | TODO   |
| P7-010 | Inspect production health and finalize release evidence       | main + release_manager | P7-009    | release complete    | TODO   |

## Critical path

```text
P0 contracts
 -> P1 auth/data shell
 -> P2 canonical ingestion
 -> P3 deterministic FIN vertical slice
 -> P4 statistical/RC
 -> P5 reports/contextual
 -> P6 hardening
 -> P7 saved candidate -> explicit approval -> deploy
```

ThreeUI and AI are not on the critical path.

## Current execution note — 2026-09-01

- The statuses above separate local code completion from remote platform verification.
- P0-005 and P1-008 remain `IN_PROGRESS`: local `DB`/`FILES` contracts and the R2 adapter exist, but actual Cloudflare resources are intentionally deferred.
- P1-002 is complete only for the initial migration on a clean local database plus idempotent reapplication; release upgrade/recovery fixtures remain a later hardening requirement.
- P1-005, P1-009, P1-010 and P1-013 are complete for the project/review-case slice, not for ingestion or the review engine.
- P1-012 still needs the complete production role matrix even though project-scoped case denial is covered locally.
- The Phase 1 product gate remains **NO-GO**. Development now proceeds locally into Phase 2 ingestion and Phase 3 deterministic review without waiting for Cloudflare provisioning.
- Phase 2A now has additive ingestion migrations, package-intent API, bounded byte upload, structural XLSX/CSV preflight, exact private R2 storage and a basic multi-file upload UI.
- The current byte request performs authorized storage and D1 completion against one inspected snapshot. Orphan reconciliation, expired cleanup, status refresh, semantic workbook inspection, project identity verification, mapping and canonical normalization remain incomplete.
- The Phase 2 gate remains **NO-GO** until those missing boundaries and Phase 2 evidence are completed; P2-001..004, P2-012 and P2-016 therefore remain `IN_PROGRESS`.
