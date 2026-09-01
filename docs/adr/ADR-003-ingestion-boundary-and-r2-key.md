# ADR-003 — Local ingestion boundary and R2 key

Date: 2026-09-01

Status: Superseded by ADR-004

## Decision

- Treat a set of 산출서와 집계표 as one `source_package` from the first upload intent.
- Use `projects/{projectId}/cases/{caseId}/sources/{sourceVersionId}/files/{fileId}.{extension}` as the canonical private R2 key. Every identifier is server-generated and the original filename never enters the key.
- Keep JSON intent creation, bounded byte transfer and finalization as separate authorized operations.
- A file cannot become `stored` until one byte snapshot has produced matching size, SHA-256, signature/archive inspection and R2 metadata.
- The initial dependency-free XLSX guard reads bounded ZIP directory metadata only. It rejects unsupported ZIP64/encryption, traversal, duplicate paths, extreme expansion, macros, ActiveX and embedded objects. It does not claim to parse workbook semantics.
- Full XLSX sheet inspection remains fail-closed until a Cloudflare-compatible parser is selected and attacked with synthetic fixtures.
- Package state remains `stored_unverified` until project identity signals match. A conflicting file blocks the entire package; partial promotion is forbidden.
- Masonry bytes and rows remain in lineage. Later canonical rows receive `excluded_reason=MASONRY_SCOPE`; upload code never deletes masonry evidence.

## Consequences

- Cloudflare provisioning is not required for domain, migration and fake/local R2 tests.
- D1/R2 cannot share a transaction, so upload attempts preserve recoverable intermediate states and future reconciliation must use exact keys only.
- The UI must not call an upload intent “검수 준비 완료” or expose an R2 key.
- External workbook links are recorded but never followed by the current preflight. The full parser decision must define whether they are rejected or converted to a blocked review state.
