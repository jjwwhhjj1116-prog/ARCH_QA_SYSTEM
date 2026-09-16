# Drive registration release — 2026-09-09

## Scope and deployment

- Existing worker: https://concost-qc-studio.jjwwhhjj1116.workers.dev/
- Final version: `7062a9a0-65cf-408f-8c83-1859265c1b51`.
- Previous stable worker: `8b0cc0f2-b58b-4226-a1dd-97078ca067dc`.
- Intermediate upload-only release: `a8dba1d1-d315-4f39-8d9c-d396e6a6af43`.
- Applied additive migration `0011_drive_upload.sql`, 5 statements; no existing data removed.
- Built entry `dist/server/index.js` SHA256:
  `de888c56989ed78471e4f812294eb93352c8e2d8230d98139fda2f03cbbdd70e`.
- Worktree already contained earlier releases as dirty/untracked changes. This is
  a build fingerprint, not a clean Git commit claim. No unrelated reset/staging.
- No billing/subscription change, R2 allocation, Gemini call, or business-file deletion.

## Evidence

- Full Vitest: **58 files / 501 tests PASS**.
- Typecheck, lint, Cloudflare build PASS.
- Local migration/idempotency test PASS before remote migration.
- Admin synthetic DWG-signature binary: **25,165,831 bytes**, 25 upload chunks.
  Reconciliation after 2 MiB returned the same acknowledged offset.
  Registered successfully; bounded range download SHA256 matched original.
- Employee synthetic CSV: **41 bytes**, registration and download hash PASS.
- Smoke tool completed exit 0 and verified each final test session was logged out.
- Test projects: `36503ce3-0f16-4d9b-a363-ce3accd8bd44` (admin),
  `e7ec700c-17fb-43e2-9881-729be4e4b429` (employee).
- First upload-only smoke found full 24MiB download exceededCpu at 1300ms.
  Fixed by requiring bounded <=1MiB download ranges; final smoke returned
  upload 200/download 206, no exceededCpu in captured final upload/download events.
  Observed CPU: upload 8–20ms, download 6–48ms; not a capacity guarantee.
- Chrome actual menu: Home -> synthetic project -> FIN team -> drawing panel
  listed the stored 24MiB file and download button. Clicking the actual button
  progressed from 0% to 62% and then returned enabled with no error after the
  full download/hash check. Browser range requests were 206 (13–81ms CPU).
  User's original tab and its
  selected business files were not reloaded or altered.
- Download button changed from link to a bounded-download action; equivalent
  accessibility-role tests were updated, not removed.

## Explicit limitations

- Registration is not workbook inspection. New XLSX/CSV stays `uploaded` with
  `inspection_pending`; it cannot yet feed AI review. Existing `stored` sources
  and reviews are unchanged. Large safe-parser promotion remains outstanding.
- Drawings are attachment-only, not AI-reviewed; 200MiB configured bound, 24MiB
  live-tested. Multi-employee concurrency and real 16-workbook batch not live-tested.
- This run did not implement automatic Drive retention/deletion. QA artifacts
  remain as clearly named synthetic records; no business data was deleted.
- Browser download assembles <=200MiB locally and verifies the complete hash
  before saving. Registration also uses native browser SHA256; Workers never
  decompress the full workbook in this path.
- First smoke's logout request omitted required JSON and did not revoke that
  session; it was memory-only and not retained. Subsequent smoke sends `{}` and
  verified logout. User's existing browser session was preserved.

## Rollback

Restore the prior worker version if required; retain additive tables and uploaded
objects for recovery. Never drop staging/attachment tables or delete company files
as a rollback step. Old clients receive an explicit refresh error on the old Drive
bytes endpoint. Refreshing an old tab discards native selected Files, so the user
must reselect unsaved files after adopting the new deployment.
