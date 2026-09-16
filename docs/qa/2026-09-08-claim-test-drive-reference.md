# QC Google Drive transition — reference findings

Status: Drive transport, persistent administrator OAuth/account switching,
source/intermediate/result storage integration, and direct Cloudflare build are
implemented. Real Google consent and provider-backed file smoke remain pending.
The old Sites deployment and its data remain unchanged.

## Approved scope

User requested Cloudflare hosting, employee login, personal Gemini review,
administrator-only guidelines, and company Google Drive storage in a separate QC
folder. Preserve reports/review evidence; offer explicit deletion of original
attachments after a stored report is available. Do not activate R2 billing.

## Exact reference

- Repository: https://github.com/jjwwhhjj1116-prog/CONCOST-CLAIM-CENTER_TEST-SERVER
- Inspected commit: b3ec5b74f90c7e33898f5d7e31d93e47b4af6862
- Local sibling checkout: `../claim-center-test-reference` (read-only reference).
- `apps/web/src/routes/PreviewSettings.tsx`: embedded `PreviewGoogleDriveSetup`.
- `apps/cloudflare/src/google-drive.ts`: drive.file scope, offline OAuth, PKCE,
  token exchange/refresh, AES-GCM, folder creation, upload/download.
- `apps/cloudflare/src/index.ts`: authenticated company OAuth handlers and
  personal/organization AI credential resolution; real provider text generation.
- `wrangler.jsonc`: Worker/D1/static assets, no R2 binding; configured company
  account differs from an earlier user screenshot. User confirmed
  `concost.dt@gmail.com`, and explicitly requested administrator-controlled
  account changes on 2026-09-08.

## Implemented transport slice

- `lib/files/google-drive.ts`: account chooser with drive.file/PKCE, code
  exchange and refresh, exact expected-account verification and real quota
  fields (missing quota is not a zero/10GB allowance).
- Stable ID allocation, isolated QC folder creation, resumable upload with
  exact byte snapshot, metadata verification and bounded/checksummed download.
- Provider-supplied upload URLs are restricted to the Google upload endpoint;
  redirects are rejected. Errors do not echo provider secrets or file content.
- Unknown writes, including success responses with conflicting metadata, are
  marked uncertain for reconciliation, never automatically retried with a new ID.
- `lib/files/google-drive.test.ts` covers these boundaries with synthetic data.
- Independent read-only review found one uncertainty-flag edge; fixed with a
  regression test. No new SDK or dependency was added (ponytail reuse policy).

The direct build now selects Drive in `r2-factory.ts` and review result storage.
Migration 0010 adds encrypted connections, one-use actor-bound OAuth state,
logical object locations and audit records. Account replacement only activates
after account verification and QC folder creation; old objects retain their
original connection. Settings provides administrator-only setup/account changes.
This is not a migration of old Sites data. Heavy-original cleanup and real Gemini
review generation are still incomplete and must not be represented as active.

## Integration requirements

1. Keep QC employee authentication and the exact two administrator addresses:
   yjw@con-cost.com and yjpark@con-cost.com. Never copy reference session cookies,
   credentials, administrator data, database IDs, or production secrets.
2. Company OAuth must use QC-specific one-use actor-bound state, PKCE, expiry,
   encryption AAD, callback registration, and an administrator's explicit consent.
   Keep drive.file scope; do not expand to all company files.
3. Replace every file path, not just upload: private source adapter plus direct
   FILES calls in `lib/review/server.ts` and `baseline-server.ts` cover sources,
   completed runs and intermediate evidence. Use D1 to track exact Drive IDs,
   checksums, operation state and logical source lineage.
4. Keep the current Sites deployment/data unchanged until a verified transfer
   exists. Copy, verify bytes/checksum, then switch location; never claim a new
   empty Cloudflare database contains the old projects.
5. A completed report must remain readable/exportable without original bytes.
   Cleanup targets come from the saved run, not the current upload list. Preserve
   report/evidence and audit records; explain effects on runs sharing originals.
6. Reserve cleanup atomically before deleting exact files. Block active work and
   old finalized-upload replay (currently able to re-create missing objects).
   Persist per-file failure/retry state. Never report success for partial failure.
7. Credential existence is not connection health. Reference status can still
   report CONNECTED after refresh failure; QC must expose reauthorization needed.
8. Reference multipart code uses a backing buffer; QC must transmit only the
   intended byte range. Unknown upload outcome must reconcile by stable ID rather
   than blindly creating duplicates.

## Required tests before release

- Employee/admin/viewer and forged-header access checks on the actual Worker.
- OAuth state reuse, expiration, wrong actor/account, and refresh failure.
- Upload retry, checksum, wrong folder, inaccessible/deleted Drive objects.
- Gemini valid/invalid key, unavailable model, quota/timeout, strict Level C
  source-reference validation; A/B results remain available on AI failure.
- Report saved/readable before cleanup; cleanup failure/retry; no other run's
  revised upload deleted; old upload replay cannot resurrect deleted originals.
- Real menu/login/settings/upload/review/report smoke plus private file access.

No original files or Claim Center resources were changed. Direct Cloudflare uses
the new QC database and no R2 binding. See the direct release record for actual
deployment and account provisioning status; neither is implied by unit tests.
