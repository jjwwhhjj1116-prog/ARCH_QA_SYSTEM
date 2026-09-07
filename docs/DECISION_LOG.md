# Decision Log

## 2026-09-07 — Review preparation and admin-only guideline settings

ADR-008 supersedes the normal-workflow guideline tab and per-sheet standard-header
confirmation. One batch prepares safely recognized labels; uncertain semantics stay
unreviewable. Stream large XLSX XML with independent resource guards. Guideline
draft/trial/activation moves to administrator Settings with additive DB guards.
Formula/duplicate mode changes must be observable before and after execution.
Tutorial remains explicitly deferred. No production publication authorization yet.

## 2026-09-07 — Actual FIN evidence workstation and private publishing

User explicitly requests a major UI/review rebuild, staged global skills, subagents and deployment. ADR-007 and `CONCOST_QC_WORKSTATION_GUIDE.md` define the bounded first implementation. Add mapping/profile/run/approval/decision immutable records (0005) with atomic role/CAS guards. Owner activation of a tested guideline is configuration authorization, not report approval; final report/self-approval remains unavailable. No automated source correction. Four implemented rule families plus unreviewable parsing, not a claim that all 20 proposed checks work. AI semantic classification, variable resolution and drawing/quantity correctness remain needs-domain-validation.

Main consolidates live CSS and preserves prior upload/replacement behavior. Read-only agents independently test FIN semantics, UI state and large-input safety; resulting regression fixes cover cross-trade headers, zero baseline, summary/detail isolation and mapping collision. Three global skills installed/validated, see `QC_SKILL_PIPELINE.md`. Keep current owner-only audience and existing original files. This user request authorizes publishing, not audience expansion.

## 2026-09-03 — Source replacement and upper workflow action

QC-UPLOAD-TOP / QC-SOURCE-REPLACE: [ADR-006](adr/ADR-006-source-package-replacement.md)
defines explicit, all-files-success replacement within the selected case. Preserve
immutable originals and previous runs; hide superseded input from active review.
Use two additive nullable D1 columns and transaction-level authorization/audit
markers. The upper STEP 2 action remains visible even before storage, disabled
until usable saved input exists. Production release remains approval-gated.

Use this file as the human-readable index of accepted architecture and product decisions. Create one ADR from `tasks/ADR_TEMPLATE.md` for every material decision, then add a row here.

| ID    | Date       | Decision                                                                                                                                                                                                 | Status     | ADR / evidence                                          | Owner               |
| ----- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------- | ------------------- |
| D-001 | 2026-09-01 | D1 is the system of record for structured application data; R2 stores source files, exports, and large artifacts                                                                                         | Accepted   | `docs/adr/ADR-001-local-first-sites-runtime.md`         | Platform architect  |
| D-002 | 2026-09-01 | Every analysis result is tied to an immutable source version, normalized dataset version, profile version, and engine version                                                                            | Accepted   | `docs/02_ARCHITECTURE.md`                               | Review-engine owner |
| D-003 | 2026-09-01 | Findings use Level A/B/C confidence semantics and may not be upgraded by AI alone                                                                                                                        | Accepted   | `docs/adr/ADR-002-review-boundaries.md`                 | Review-engine owner |
| D-004 | 2026-09-01 | ThreeUI is enhancement-only and cannot own critical application state or block core workflows                                                                                                            | Accepted   | `docs/10_THREEUI_MCP.md`                                | Frontend owner      |
| D-005 | 2026-09-01 | A saved Sites version and a production deployment are separate release actions; deployment requires explicit user approval                                                                               | Accepted   | `docs/11_RELEASE_CHECKLIST.md`                          | Orchestrator        |
| D-006 | 2026-09-01 | Cloudflare provisioning and remote deployment are deferred; local D1 is the only active persistence target in this slice                                                                                 | Superseded | `artifacts/qa/deployment-candidate-1/manifest.md`       | Main                |
| D-007 | 2026-09-01 | Continue with local workbook ingestion and deterministic review before remote Cloudflare integration                                                                                                     | Accepted   | `tasks/BACKLOG.md`                                      | Main                |
| D-008 | 2026-09-01 | Source packages are mandatory; use the opaque case-scoped R2 key and keep project identity unverified until parser evidence                                                                              | Superseded | `docs/adr/ADR-003-ingestion-boundary-and-r2-key.md`     | Main                |
| D-009 | 2026-09-01 | Complete each source byte upload from one authorized snapshot; use exact-key retry and keep reconciliation as a Gate 2 requirement                                                                       | Accepted   | `docs/adr/ADR-004-single-snapshot-upload-completion.md` | Main                |
| D-010 | 2026-09-01 | Deploy the exact verified commit to an owner-only Sites environment for synthetic diagnostics; customer-data operations remain NO-GO                                                                     | Accepted   | `artifacts/qa/deployment-candidate-1/manifest.md`       | Main                |
| D-011 | 2026-09-01 | Replace the light desktop-console shell with a responsive high-tech dark glass web workspace while retaining Korean text navigation and explicit non-engine states                                       | Superseded | Replaced by D-017                                       | Main / UI reviewer  |
| D-012 | 2026-09-01 | Make ERP-matching project name the user-facing identity; generate the opaque internal project code server-side and never require manual code entry                                                       | Accepted   | `lib/projects/service.ts`, E2E project flow             | Main                |
| D-013 | 2026-09-01 | Treat Sites identity plus the private access list as the current gate, not as verified company-employment SSO; show local auth bypass prominently                                                        | Accepted   | `app/page.tsx`, `app/review-studio.tsx`                 | Platform / Main     |
| D-014 | 2026-09-02 | Add an application-level exact-email allowlist after Sites identity, fail closed in production, and keep local demo unavailable in production                                                            | Accepted   | `lib/auth/account-access.ts`, `app/page.tsx`            | Platform / Main     |
| D-015 | 2026-09-02 | Separate project registration from project data upload, use the official CON COST logo, and encode the five-stage workflow with distinct non-semantic stage colors                                       | Superseded | Replaced by D-017                                       | Main / UI reviewer  |
| D-016 | 2026-09-02 | Keep Gemini credentials server-only; expose only configuration readiness and an authenticated connection test until review input mapping is implemented                                                  | Accepted   | `lib/server/ai/gemini-config.ts`, settings API          | AI / Platform       |
| D-017 | 2026-09-02 | Use the Claim Center light visual system, one left-side project boundary, a three-step rail, and two equal primary AI review choices; remove the redundant right-side selector and dark gradient banners | Accepted   | `DESIGN.md`, `app/review-studio.tsx`, browser evidence  | Main / UI reviewer  |

D-018 (2026-09-03, Accepted): 팀 선택은 기존 계보를 재사용하며 파일명 체크리스트는 제출 안내로만 사용한다. 일부 자료가 누락되어도 서버 저장 확인된 자료로 다음 단계에 진입할 수 있다. 근거: [ADR-005](adr/ADR-005-team-selection-and-document-availability.md). Owner: Main / Platform reviewer.

## Status values

- `Proposed`: awaiting evidence or owner sign-off.
- `Accepted`: the implementation must follow it.
- `Superseded`: replaced by another decision; link the replacement.
- `Rejected`: evaluated and deliberately not adopted.

Do not silently rewrite accepted decisions. Add a new decision and mark the old one superseded.
