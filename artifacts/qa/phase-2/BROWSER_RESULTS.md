# Phase 2A browser results

`npm run test:e2e`: 9 passed, 3 expected skips, 0 failed.

| Viewport | Main upload flow | axe WCAG A/AA | Mobile text navigation |
| -------- | ---------------- | ------------- | ---------------------- |
| 1440×900 | PASS             | PASS          | not applicable         |
| 1280×800 | PASS             | PASS          | not applicable         |
| 768×1024 | PASS             | PASS          | not applicable         |
| 360×800  | PASS             | PASS          | PASS                   |

The main flow creates a project and FIN case, uploads two CSV 산출서와 집계표
through the visible UI, verifies an NFKC filename, denies a viewer, recovers a
collaborator inspection failure, completes two files, retries identical bytes,
rejects changed bytes, replays package idempotency, separates the same key in a
second case, denies mixed project scope and verifies reload persistence.

Known limitation: upload package status is not yet restored into the panel after
a route refresh.
