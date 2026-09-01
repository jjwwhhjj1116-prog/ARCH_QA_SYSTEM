# Owner-only Sites deployment manifest

Date: 2026-09-01  
Decision: **CONDITIONAL GO for owner-only synthetic diagnostics / NO-GO for customer data and shared operations**

## Immutable source

- Git commit: `3e9015f60a3c700a139aea46e94c3b706976c8f4`
- Sites version: `1`
- Archive content SHA-256: `d54054d6bf8c7c9507663e0a4664c920db1ba7bf3c2406d531db1480805d6076`
- Live URL: `https://fin-rc-review-studio.yun0421.chatgpt.site`
- Audience: custom allowlist containing only the current owner; no external visitors or groups

## Verified before deployment

- `npm run check:full`: PASS
- unit/API: 15 files, 73 tests PASS
- Playwright: 9 PASS, 3 intentional skips across 4 viewports
- coverage: lines 92.79%, branches 85.04%, functions 98.76%, statements 91.38%
- production dependency audit: 0 vulnerabilities
- source and packaged hosting/build inputs matched the committed state

## Verified after deployment

- deployment reached terminal `succeeded`
- application shell rendered from the deployed URL
- ChatGPT sign-in boundary presented to an unauthenticated browser
- unauthenticated `GET /api/projects` returned 401
- live D1 binding `DB` contains the 10 expected user tables
- access policy remained owner-only

## Known non-blocking diagnostic issue

- `/favicon.ico` returns 404. This does not affect the review workflow and should be fixed with the next UI asset release.

## Operational release blockers

1. Semantic workbook inspection, column mapping, canonical normalization and deterministic FIN/RC review are incomplete.
2. Hosted multi-account/project isolation has not been attacked end-to-end.
3. Remote R2 upload, D1/R2 orphan reconciliation, expiry cleanup, retention and deletion policies are not verified.
4. Worst-case XLSX expansion still needs a memory-safe streaming or lower-limit contract for the Workers runtime.
5. Actual customer workbooks must not be uploaded until these gates pass.

This manifest records a private web inspection environment, not a completed production product.
