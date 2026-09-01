# Phase 2A test results

Source checkpoint: `8a171f8a837bc958c2f36d89f86f01a945311d67`

Environment: Windows, Node `v24.16.0`, npm `11.13.0`.

| Gate                           | Result                                                                      |
| ------------------------------ | --------------------------------------------------------------------------- |
| `npm run format:check`         | PASS                                                                        |
| `npm run lint`                 | PASS                                                                        |
| `npm run typecheck`            | PASS                                                                        |
| `npm run test`                 | PASS — 15 files, 73 tests                                                   |
| `npm run test:coverage`        | PASS — lines 92.79%, branches 85.04%, functions 98.76%, statements 91.38%   |
| `npm run db:migrate:test`      | PASS — clean apply, upgrade sequence, idempotency and ingestion constraints |
| `npm run test:e2e`             | PASS — 9 passed, 3 intentional mobile-only skips, 4 viewports               |
| `npm run build`                | PASS — project/case/package/byte API routes emitted                         |
| `npm run audit:prod`           | PASS — 0 production vulnerabilities                                         |
| repository secret-pattern scan | PASS — 0 matches (`git grep`, command recorded in `commands.md`)            |

The three Playwright skips are the same mobile-navigation test omitted from the
three non-mobile projects; the mobile project executes and passes it.
