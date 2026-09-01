# Phase 2A fixture manifest

No customer workbook or confidential project row is committed.

| Fixture source                                                        | Coverage                                                                            |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `lib/imports/inspect-source-file.test.ts` generated ZIP/XML/CSV bytes | valid minimal XLSX, CRC/deflate/XML/path/duplicate/expansion/active-content attacks |
| `lib/http/bounded-bytes.test.ts` generated request streams            | size, media type and overflow boundaries                                            |
| `lib/files/storage.test.ts` fake R2 bindings                          | exact key, immutable retry, lineage/checksum/size metadata                          |
| `lib/ingestion/*.test.ts` generated declarations and bytes            | package fingerprint, service failure/retry boundaries                               |
| `tests/e2e/project-flow.spec.ts` in-memory CSV buffers                | UI upload, authorization, idempotency and responsive accessibility                  |

Expected results are encoded as assertions. Generated ZIP entries use valid
deflate and CRC values before each targeted mutation.
