# Phase 2A acceptance matrix

| ID            | State       | Evidence / limitation                                                                                                |
| ------------- | ----------- | -------------------------------------------------------------------------------------------------------------------- |
| AUTH-003      | PARTIAL     | Local mixed-scope requests are denied; hosted two-account foreign-resource IDOR proof remains a release gate.        |
| AUTH-004      | PASS-local  | Viewer role receives 403 before request-body read/R2 storage; hosted multi-account proof remains a release gate.     |
| FILE-001      | PARTIAL     | XLSX/CSV structural validation and private storage exist; semantic import and remote binding proof do not.           |
| FILE-002      | PASS-local  | Extension, declared type and signature mismatches return stable codes.                                               |
| FILE-003      | PARTIAL     | Request, ZIP entry, expansion, CRC and malformed archive limits exist; sheet/row/column/cell semantic limits do not. |
| FILE-004      | PASS-local  | Macro, ActiveX/OLE declarations and DTD/entity content are rejected; external links are recorded and never followed. |
| FILE-005      | PASS-local  | Filename, claimed/detected type, size, SHA-256, actor, time and validation snapshot are retained.                    |
| FILE-006      | BLOCKED     | Duplicate checksum is not yet presented for an intentional reuse/version choice.                                     |
| FILE-007      | PARTIAL     | Failed/stale claims and exact same-byte retry recover request failures; automated orphan reconciliation is absent.   |
| FILE-008      | BLOCKED     | Expired upload reconciliation and deletion are not implemented.                                                      |
| FILE-009      | PARTIAL     | Keyboard file picker, progress, error and same-package retry exist; refresh/status restoration is incomplete.        |
| IMP-001       | BLOCKED     | No semantic XLSX sheet inventory or bounded preview.                                                                 |
| IMP-002       | BLOCKED     | CSV is UTF-8-only; delimiter/encoding detection and override are absent.                                             |
| IMP-003       | PARTIAL     | Structural inspection is bounded; semantic preview is absent.                                                        |
| MAP-001..004  | NOT STARTED | Mapping versions and UI are not implemented.                                                                         |
| NORM-001..008 | NOT STARTED | Canonical normalization/persistence is not implemented.                                                              |

Overall Gate 2: **NO-GO**.
