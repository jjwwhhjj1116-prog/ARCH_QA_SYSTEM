# Phase 2A security audit

Source checkpoint: `8a171f8a837bc958c2f36d89f86f01a945311d67`

## Verified locally

- Same-site mutation and production authentication fail-closed boundaries
- Project/case/actor membership checks on package creation and byte claim
- Viewer denial before body read, R2 write or D1 completion
- Cross-project/case composite foreign keys and case-scoped idempotency
- No R2 key, upload path, SQL, stack or auth detail in public responses
- NFKC/control/path-safe filenames and canonical client/server matching
- Request body cap and declared/actual byte equality
- CSV ZIP disguise, NUL, invalid UTF-8 and empty-file rejection
- ZIP64, encryption, unsupported compression, traversal, duplicate entries,
  overlapping local ranges, local/central filename confusion, CRC and XML errors
- Declared and actual expansion limits using bounded streaming inflation
- VBA, macro-enabled content, ActiveX/OLE/package relationships, embeddings,
  DTD/entities rejection; external links are warnings and never fetched
- Exact opaque R2 keys, immutable different-byte conflict, same-byte retry and
  fail-closed scope/checksum/size metadata reads
- R2 success/D1 completion failure records a retryable failure; stale uploading
  claims can be reclaimed after five minutes

## Open risks

- Automated exact-key reconciliation and expired/orphan object cleanup
- Remote Sites identity/header and multi-account IDOR verification
- Semantic workbook limits, mapping and formula-policy attacks
- Retention/deletion workflow and operational alerts

Conclusion: the local byte-ingestion boundary is suitable as a development
checkpoint. The full product remains NO-GO.
