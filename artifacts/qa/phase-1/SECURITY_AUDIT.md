# Phase 1 Security Audit

Date: 2026-09-01
Decision: **NO-GO for production**

## Implemented controls

- Production actor resolution fails closed when verified workspace identity headers are absent.
- Local demo identity requires an explicit development-only launch flag.
- Client-supplied actor, role and ownership are not accepted by project or case APIs.
- Project and case visibility is membership-scoped in D1 queries.
- Case creation checks membership and active-project status in the same D1 transactional batch as the audit event.
- Request boundaries enforce same-site mutation, JSON content type, a 32 KiB body ceiling and bounded request IDs.
- API failures use bounded error envelopes and do not serialize raw exceptions.
- Project codes are NFKC-normalized, whitespace-free and upper-cased before persistence.
- R2 storage computes SHA-256 and byte size from one immutable byte snapshot; caller-provided metadata is comparison-only.
- No deployment, remote binding mutation or AI-provider call is included in local checks.

## Dependency audit

- high: 0
- critical: 0
- four moderate findings remain in the development-only `drizzle-kit` toolchain and are not loaded by the production application runtime

## Production blockers

- Confirm actual Sites identity header names, signature/trust boundary and workspace audience.
- Connect and verify real D1/R2 resources and deployment-specific migration handling.
- Implement an authorized upload application service; the current R2 adapter is only a tested port.
- Add file signature, archive, sheet, row, column and cell limits before accepting workbooks.
- Implement and domain-validate the deterministic FIN/RC review engine.
- Complete role-matrix, audit export, retention, deletion and download-authorization tests.
