# ADR-007 — FIN evidence workstation

2026-09-07 · accepted for implementation

The user requests a substantial private-site rebuild, actual source-based review and specialized skills. Main owns Site edits, schema, integration and deployment. Independent agents audit FIN semantics, workflow and OSS skills. Existing upload/replacement/auth flows remain authoritative.

## Decision

- Keep originals and completed runs immutable. Parse only authorized stored XLSX/CSV with bounded size/rows/XML; never execute workbook content.
- Add a pure decimal expression/rule engine: arithmetic mismatch, unresolved expression, explicit numeric range/decimal-shift cohort and building-summary duplicate candidates. Other proposed rules remain visibly unavailable. FIN first; RC/masonry deferred. Missing context is not normal.
- Confirm mapping; maintain draft/active guideline versions, trials, frozen run evidence and append-only human decisions. D1 stores metadata/versions; private R2 stores bounded evidence. Approval requires a matching trial.
- Consolidate historical CSS into a light workstation; keep project navigation left, actions above long content, connected source/rule/evidence views.
- Add fast-xml-parser 5.10.1 (MIT, maintained, current DOCTYPE fix verified upstream) alongside existing fflate. Reject DOCTYPE/ENTITY and bound selected ZIP extraction. Existing stack has no cell XML parser.
- Synthetic data for QA; unchanged owner-only production audience. No real-project test deletions.

## Validation and rollback

Test source lineage, explicit missing data, 10→100 with valid peers, normal 100, missing roles/peers, unresolved variables, subtotal exclusion, cross-trade duplicates, server authorization and immutable versions. Migration 0005 is additive. Roll back runtime without dropping tables or originals. Over-limit sources are unreviewed, not silently truncated. Deterministic checks do not imply AI semantic review or drawing validation.
