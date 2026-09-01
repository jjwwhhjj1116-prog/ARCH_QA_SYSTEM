# Decision Log

Use this file as the human-readable index of accepted architecture and product decisions. Create one ADR from `tasks/ADR_TEMPLATE.md` for every material decision, then add a row here.

| ID    | Date       | Decision                                                                                                                             | Status     | ADR / evidence                                          | Owner               |
| ----- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------- | ------------------------------------------------------- | ------------------- |
| D-001 | 2026-09-01 | D1 is the system of record for structured application data; R2 stores source files, exports, and large artifacts                     | Accepted   | `docs/adr/ADR-001-local-first-sites-runtime.md`         | Platform architect  |
| D-002 | 2026-09-01 | Every analysis result is tied to an immutable source version, normalized dataset version, profile version, and engine version        | Accepted   | `docs/02_ARCHITECTURE.md`                               | Review-engine owner |
| D-003 | 2026-09-01 | Findings use Level A/B/C confidence semantics and may not be upgraded by AI alone                                                    | Accepted   | `docs/adr/ADR-002-review-boundaries.md`                 | Review-engine owner |
| D-004 | 2026-09-01 | ThreeUI is enhancement-only and cannot own critical application state or block core workflows                                        | Accepted   | `docs/10_THREEUI_MCP.md`                                | Frontend owner      |
| D-005 | 2026-09-01 | A saved Sites version and a production deployment are separate release actions; deployment requires explicit user approval           | Accepted   | `docs/11_RELEASE_CHECKLIST.md`                          | Orchestrator        |
| D-006 | 2026-09-01 | Cloudflare provisioning and remote deployment are deferred; local D1 is the only active persistence target in this slice             | Superseded | `artifacts/qa/deployment-candidate-1/manifest.md`       | Main                |
| D-007 | 2026-09-01 | Continue with local workbook ingestion and deterministic review before remote Cloudflare integration                                 | Accepted   | `tasks/BACKLOG.md`                                      | Main                |
| D-008 | 2026-09-01 | Source packages are mandatory; use the opaque case-scoped R2 key and keep project identity unverified until parser evidence          | Superseded | `docs/adr/ADR-003-ingestion-boundary-and-r2-key.md`     | Main                |
| D-009 | 2026-09-01 | Complete each source byte upload from one authorized snapshot; use exact-key retry and keep reconciliation as a Gate 2 requirement   | Accepted   | `docs/adr/ADR-004-single-snapshot-upload-completion.md` | Main                |
| D-010 | 2026-09-01 | Deploy the exact verified commit to an owner-only Sites environment for synthetic diagnostics; customer-data operations remain NO-GO | Accepted   | `artifacts/qa/deployment-candidate-1/manifest.md`       | Main                |

## Status values

- `Proposed`: awaiting evidence or owner sign-off.
- `Accepted`: the implementation must follow it.
- `Superseded`: replaced by another decision; link the replacement.
- `Rejected`: evaluated and deliberately not adopted.

Do not silently rewrite accepted decisions. Add a new decision and mark the old one superseded.
