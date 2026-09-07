# v15 Build Notes — employee workstation / product baseline

2026-09-07. Candidate; publication and final verification are recorded separately.
This addendum supersedes older fixed-sidebar and mandatory-guideline descriptions
without replacing the established DESIGN.md visual system.

## User-visible behavior

- Sidebar 220–380px (default 248), drag/keyboard/Home/End/double-click plus Settings
  range control. Width and Korean/Vietnamese preference persist in this browser.
  Mobile uses an accessible drawer. Source names, formulas, units and human decisions
  remain in their original language; display translation never rewrites evidence.
- Settings use white, sky-blue and pink cards, real connected/unconfigured labels,
  personal preferences and a separate administrator guideline surface.
- STEP 2 primary **전체 자료 확인 후 검수 시작** prepares recognized sheets and runs
  a product baseline without per-file save clicks. It remains distinct from
  **승인 지침으로 추가 검수**. Failed sources and uncertain mappings remain limitations.
- Real completed-file progress, resume, persisted immutable results, human decisions
  and XLSX report. No timer-generated percentage or automatic quantity correction.

## Rule scope and cost

| Product rule   | Evidence and limitations                                                                                                                                                                              |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BASIC-SYNTAX   | Supported arithmetic syntax/calculability. Unresolved variables/references are unevaluated, not an established FIN source error.                                                                      |
| BASIC-QUANTITY | Compare only when a saved mapping explicitly identifies quantity as the direct formula result. No inferred conversion/rounding/repetition convention.                                                 |
| ITEM-018       | Building-summary same item/spec/unit/part across material codes/trades; human candidate only. Missing code/trade remains partly unevaluated. No semantic synonym merging or automatic trade movement. |

The baseline invokes no external LLM: **0 external AI tokens**. Hosting/storage still
have their own costs. No drawing check, actual dimension validation, universal
decimal-error detection or Vietnamese item synonym classification is claimed.
Project decimal/range rules require separately configured and approved evidence.
Report final approval, RC, masonry and tutorial remain outside this slice.

## Resource limits and recovery

XLSX upload 20MiB; selected expanded XML 64MiB; expanded cell text 8MiB;
shared strings 4MiB; content rows 50,000/file, physical rows 200,000, 30 sheets,
256 columns. Parsed rows remain bounded in memory; this is not unlimited streaming.
Baseline catalog 20,000 items/file, findings 2,000/file and 8,000 total; persisted
part 12MiB and combined input 16MiB. Approved legacy guideline runs retain their
separate 20,000-row/10MiB input and 6MiB output limits.

Baseline jobs snapshot source/mapping/engine policy, claim per-file leases, verify
saved part hashes, and resume through client requests. This is not a background
queue that continues after the browser closes. Original files and earlier runs
remain intact. Source/membership/policy changes fail closed. Automatic mapping and
final-result audits have distinct request IDs; unique audit guards remain enabled.
Obsolete private partial objects currently require a future retention job.

## Authentication / activation boundary

Employee login is implemented behind `EMPLOYEE_LOGIN_ENABLED`, OFF in production
for this release. 33 supplied account records were validated and locally converted
to salted PBKDF2 hashes; neither workbook nor hashes are in Git/build artifacts.
The roster has NOT been uploaded to production. Never publish those private files.

Only yjw@con-cost.com and yjpark@con-cost.com are application administrators.
Application administration does not confer access to other projects. Existing
ChatGPT actor/project ownership is unchanged; employee IDs do not inherit it.
Before activation, approve the Sites audience transition and specify account-to-
existing-project membership. Otherwise users can authenticate but cannot see old
projects. Do not enable the flag before production-runtime authentication passes.

Sessions use opaque tokens, hashed server storage, 8-hour expiry, Secure/HttpOnly/
SameSite cookies, credential-version revocation and same-origin mutations. Login
rate limits apply per normalized account and trusted Cloudflare address when present.

## Migration / rollback

0007 adds accounts/sessions/rate/audit tables and identity/two-admin SQL guards.
0008 adds baseline jobs/runs/decisions with immutable snapshots and scope guards.
Both are additive. Do not rewrite previously applied migrations or delete R2/D1
history. Disabling employee login reverts to the current Sites identity policy.
Code rollback must retain new tables and strengthened guards; older UI may show
actions now denied server-side. A rollback that loses the ability to show newer
baseline results is a UI limitation, not permission to delete those results.

## Verification log

- Local real-SQL migration/permission/immutability tests and auth/service tests.
- First-run auto-mapping audit collision regression uses the real unique SQL index.
- E2E: 24,000 synthetic detail rows, XML 10,137,513 bytes (> old 8MiB), complete
  upload → first baseline → saved result; measured review portion 2,786ms locally.
  This is not a performance guarantee or actual employee/source accuracy audit.
- E2E 360/768/1280/1440 CSS px: upload/replacement, top actions, formula/duplicate
  navigation, baseline result, VI execution/confirmation, settings, resize, keyboard,
  accessibility and existing permissions regression. Latest complete run: 10 passed,
  6 intentional viewport skips (large file only desktop; drawer only mobile).
- UI reviewer found mobile settings compression and untranslated progress/confirmation;
  both corrected. Original evidence is retained; not every free-form server message
  or source-derived explanation has a Vietnamese translation.
- `npm run check`: lint, formatting, TypeScript, 251 tests in 37 files and production
  build PASS. Coverage configured subset (not whole UI/engine): statements 92.61%,
  branches 85.38%, functions 98.44%, lines 93.70%. Clean migration/idempotency/scope
  test PASS. Production dependency audit: 0 vulnerabilities. Final four-viewport
  E2E rerun: 10 passed, 6 intended skips; large-file review portion 2,799ms.
- **Employee activation blocked:** production-local `test-employee-worker.mjs`
  intermittently loses its Miniflare upstream connection with HTTP 500. Login,
  session, project isolation and logout individually returned expected responses,
  but the entire smoke did not pass. Body draining, sequential fixture lifecycle,
  sandbox-independent execution and connection-close probe did not resolve it.
  Do not claim production-ready employee authentication. Unit/session tests do not
  replace this runtime gate. Release keeps the feature OFF and the existing audience.
- Publication evidence is recorded after the exact tested source is pushed and
  the saved version is deployed; these notes do not claim deployment success.

Acceptance focus: source lineage, server authorization, no fabricated successful
evaluation, immutable runs/decisions, actionable top controls, recovery and accessibility
from docs/06_ACCEPTANCE_CRITERIA.md and docs/07_QA_PLAN.md. This is not full Gate 2
or all 20 proposed FIN rules acceptance. Employee activation remains explicitly pending.
