# Settings auth-key compatibility and reference refinement

- Reference reviewed: https://github.com/jjwwhhjj1116-prog/CONCOST-CLAIM-CENTER, commit 76f42a79204847b444542d97903f9a7b3538e7f1.
- Relevant source: apps/cloudflare/src/index.ts validPreviewApiKey; apps/web/src/routes/PreviewSettings.tsx and PreviewSettings.css.
- Reproduced defect: QC rejected every dotted AQ. key before provider access and truncated input above 256 characters. Reference supports dotted keys up to 512 characters. No user's real key was inspected.
- Fix: 20–512 printable ASCII characters, outer trim only, reject internal whitespace/control characters; preserve fixed provider origin, header-only secrets, verified-before-save, encryption and account isolation.
- Validation errors identify key/model/version without echoing input. UI shows current saved model, scope, dirty/error/confirmed states and per-field recovery instructions. Reference-informed two-column form/help layout; existing orange/blue/yellow semantics preserved. Admin rules remain admin-only.
- npm.cmd run check: lint, format, typecheck, 263 tests, production build passed, including a final rerun after translated-label/storage-state refinement.
- npm.cmd run test:e2e: 10 passed, 6 existing viewport skips, four viewports; settings accessibility and desktop/mobile screenshots inspected. Final refinement only corrects Vietnamese tab label and unavailable-storage status wording/color.
- No schema or production data change. No live provider key submitted. Google authentication is only confirmed after the user's actual save succeeds.
- Rollback: v18, f87810670fcc594c758c6002b201bcb109308721.
