# Public policy links release

- Cloudflare Worker: concost-qc-studio
- Version: 24fc961e-3017-432a-8166-38e46d4ca9d1
- Previous version: e5e8ca36-6d01-4c92-a63a-3aad961eade5
- No schema, permissions, Google Console or original-file changes.

## Delivered

- https://concost-qc-studio.jjwwhhjj1116.workers.dev/privacy
- https://concost-qc-studio.jjwwhhjj1116.workers.dev/terms
- Korean/Vietnamese links on login and company Drive settings. Native new-tab
  navigation preserves unsaved credentials; no consent checkbox was added.
- Scoped readable document styles retain the existing CONCOST identity.

## Verification

- npm.cmd run check: lint, format, types, 44 test files / 322 tests and build PASS.
- npm.cmd run build:cloudflare PASS; target QC D1, no R2, demo false verified.
- Anonymous production GET /privacy and /terms: HTTP 200 and document content.
- Anonymous production GET /api/projects: HTTP 401, protection retained.
- Anonymous homepage contains both policy links.
- Browser production privacy-to-terms navigation and both headings verified.
- Local desktop/privacy and 360px mobile/terms screenshots inspected; mobile
  scrollWidth equals clientWidth (345px), no horizontal overflow.

## Scope and operational review

Policy describes current code: Drive drive.file, encrypted connection credentials,
Cloudflare D1, eight-hour session cookie, manual deletion requests, archive not
permanent deletion, no automatic source cleanup, Gemini metadata check only.
No claim that OAuth approval, automatic deletion or generative AI review is complete.
Formal company legal identity, specific retention schedule and cross-border
processing disclosures require the company's operational/legal confirmation before
full production rollout. Google verification remains separate from publication.
