# FIN review preparation follow-up — local verification

Date: 2026-09-07. Base commit: 67942a014c58f49b7a2b8d3d614a1ada3a62b028.
This report covers QC-PREPARE / QC-LARGE-XML / QC-RULE-ADMIN / QC-MODE-SWITCH,
not the complete product acceptance backlog. No production deployment is approved
or performed for this follow-up. The public-facing private Site remains v13.

## Changed behavior and acceptance evidence

| Scope                           | Acceptance IDs                           | Evidence                                                                                                                                                                                                                                                                           |
| ------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One explicit preparation action | MAP-001 (ADR-008), MAP-003, NORM-002/006 | Known FIN 6/7/8/9-column layouts and building summaries require matching title/header/content. Existing mappings survive; unsupported sheets and failed files are separate. Seven workbench component tests cover batch save, partial failure, manual provenance and mode changes. |
| Large XML streaming             | FILE-003/004, IMP-003, NORM-001/002      | Unit fixtures cover >8MiB formatted XML, Korean/CDATA/formulas/zero, truncated ZIP/XML, fake rows in comments/extensions, giant tokens, row/cell address mismatch. Hash/original bytes and source positions preserved.                                                             |
| Administrator-only guidelines   | AUTH-002/004/005                         | Reviewer/approver/viewer profile/trial/approval direct requests rejected. Owner/workspace_admin accepted. SQLite tests enforce role change at actual insert and preserve immutable histories. Non-admin state omits drafts/trials; direct trial read/export checks current role.   |
| Mode selection                  | FIND-002/004, CASE-003, UX/A11Y          | Local browser entered via left project, FIN team, upper STEP 2. Formula mode displayed 3 findings; duplicate mode displayed only ITEM-018 with building-summary references and plaster/metal evidence. Run identity and saved hold reason persisted.                               |
| Settings separation             | AUTH-005, CASE-003                       | Local Settings link opened the administrator editor; general review has only source preparation and results. Tutorial intentionally deferred.                                                                                                                                      |

## Commands

- `npm.cmd run check`: PASS — lint, format, typecheck, 226 tests / 32 files, production build.
- `npm.cmd exec vitest run app/review-workbench.test.tsx`: PASS — 7 component tests.
- `npm.cmd run db:migrate:local`: PASS — additive migration 0006 applied locally.
- `npm.cmd run db:migrate:test`: PASS — clean database, upgrade and idempotent re-apply.
- `npm.cmd run audit:prod -- --cache .npm-cache`: PASS — 0 known production vulnerabilities.
- `git diff --check`: PASS; migration 0006 contains no CRLF characters.
- `npm.cmd run test:coverage`: PASS — 226 tests; configured pre-existing core scope
  93.19% lines / 85.55% branches. This configured metric does not include all new
  `lib/review` files and must not be described as whole-workbench coverage.

Initial E2E setup failed because the owned 4179 dev server retained the Vinext dev
lock. That exact process was checked and stopped before re-running; no user server
or production process was stopped.

The first complete E2E body passed all 9 applicable tests (3 desktop skips are
mobile-only cases), but old teardown deletion failed against newly saved immutable
mapping history. Cleanup now archives only local synthetic test projects, preserving
source/mapping relationships instead of disabling constraints. Test deletion before
that failure affected synthetic E2E uploads only, not the separate local manual
fixture or actual Site data. Re-run `npm.cmd run test:e2e`: PASS, exit 0 —
9 passed / 3 intentionally skipped, 1.4 minutes. All four viewports (1440, 1280,
768, 360px) passed standard-source upload, one-click mapping, both review modes
and axe checks. Three skips apply only to the mobile-drawer test on larger screens.

Read-only subagent reviews checked FIN meanings, streaming XML safety and UI/API/DB
permission consistency. Final workflow review found no additional blocking defect;
all integration and browser results above were independently run by the main agent.

## Browser evidence and limits

Local URL: `http://127.0.0.1:4179/`. Only synthetic local project
`웹 검수 통합시험` was used. Existing run 651813f1-3ee3-434c-a280-b157540af10f:
18 canonical rows, 3 formula findings and 1 cross-trade duplicate candidate.
The original stored hold reason and source hashes remained visible after navigation.

`output/playwright/qc-duplicate-verified.png` is a full-page local screenshot.
The manual browser file-chooser bridge timed out on an additional fixture selection;
that attempt did not upload a new file and is not counted as a pass. The repository
E2E was expanded to upload a standard FIN fixture and exercise batch preparation
through the page itself, alongside both feature buttons and axe accessibility.

Independent parser audit on local Node: a 8,986,035-byte XML / 1,600,985-byte ZIP,
1,400 physical rows with 256 columns, retained 2 content rows; three runs measured
1,818 / 1,977 / 2,125 ms. This is NOT a deployed Cloudflare CPU/memory measurement.
An over-64MiB data-descriptor stream, oversized shared-text expansion and giant
attribute/token cases were rejected. The SAX dependency is pinned to ISC saxes 6.0.0;
upstream archival and local regression ownership are recorded in ADR-008.

The user's actual large internal XLSX files have not been re-opened in this change.
After deployment approval, validate their read/preview and actual Worker limits
without changing originals. No claims of complete FIN semantics, semantic AI
deduplication or all 20 proposed rules are made.

## Migration, rollback, deployment

0005 is already applied remotely and is unchanged. 0006 only replaces guideline
authorization guards and adds the trial-admin insert guard; no data deletion or
historical rewrite. Apply through Sites migrations only after approval. On code
rollback to v13, retain 0006's stricter guards and all D1/R2 data; old non-admin
guideline controls may be visible but must remain denied. Never undo protection
by dropping guards ad hoc. Keep the existing owner-only audience unchanged.
