# Decision Log

## 2026-09-15 — Bounded comparison context across AI batches

Keep assessment targets capped at 60 row/instruction pairs. Each request also receives projected comparison rows from the unchanged case snapshot, including earlier/later batches, only within the existing 48KiB UTF-8 request limit. R aliases are targets, C aliases are context only; returned C checks are rejected. Prompt version is fin-gemini-evidence-2-context. Context availability is not proof of correct AI comparison or approved quantities.

Persist optional ai.contextComplete in the existing run JSON (no DB migration). Missing/false context, excluded/unprojectable context and inherited parent issues block full completion. Parent run remains immutable. Resolve cited known aliases to original peer IDs and evidence locations; unsupported/missing evidence remains human-review-required. Oversized whole-case context is still incomplete: this does not implement unlimited global comparison. No key/model/deployment or cost authorization changes.

## 2026-09-11 — Shared private Gemini HTTP outbound

The saved company key successfully listed Gemini models after main Worker Seoul-near
placement, but the existing project DO trial still failed HTTP 400. Main Worker
placement does not relocate existing DOs. Keep DO namespace, project IDs, recovery
claims/checkpoints and immutable runs intact. Use a private default-fetch Worker
with Seoul-near placement via GEMINI_OUTBOUND for both settings and review calls.
No public endpoint, new key store, key replacement, automatic retry, schema change,
plan upgrade or source upload is introduced. Only the fixed Google models endpoints
are allowed, request bodies are bounded and only provider-required headers pass.
Placement is proximity guidance, not a data-residency guarantee. Actual generateContent
and saved-report success remain required operational checks; models.list is not proof.
Rollback: redeploy the prior main Worker; leave DO/recovery/data unchanged.
References: https://developers.cloudflare.com/workers/configuration/placement/
and https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/.

## 2026-09-11 AI 저장 복구 로컬 구현 결정

기존 프로젝트별 Durable Object의 영속 저장소에 AI 응답 후의 정확한 Run 스냅샷을 Drive 저장 전에 보관한다. actor/case/requestKey별 시작 기록으로 자동 재과금을 막으며 저장 실패 시 resume-ai-save는 저장만 재시도한다. 큰 본문은 제한된 청크와 원자적 상태 전환으로 보관하고 완료 후 본문만 정리한다. 용량 상한은 호출 전에 검사한다. 새 D1 테이블·namespace·유료 플랜 전환은 없다. 응답 수신과 영속 저장 사이 프로세스 종료는 복구 불가 상태로 남기며 자동 AI 재호출하지 않는다. 로컬 후보이며 운영 배포·실제 공급자 검증은 별도다.

## 2026-09-08 — QC home and workflow navigation

The user's explicit navigation request supersedes the project-list sidebar and
horizontal workflow rail. Home is the default authenticated landing view; only
an intentional settings deep link or OAuth callback opens Settings. Project
creation, selection and recoverable archival live in the right workspace. The
left navigation owns STEP 1 sources, STEP 2 formula/duplicate review and STEP 3
trade analysis. Existing source readiness, review navigation guards and server
permissions remain in force. Unimplemented analysis calculations stay visibly
unavailable; adding a menu does not implement an engine.

Windows roster extraction now uses ASCII JSON to preserve Korean/Vietnamese
names. A name-only, identity-and-old-name guarded repair corrected 33 existing
QC profiles, verified against the original workbook. Passwords, roles and IDs
were not changed. The CLI write summary did not return the expected rows, so no
write was repeated: a fresh name-only comparison confirmed zero mismatches.

Gemini model choices come from Google models.list for the provided key rather
than a static default. Retrieval does not save the key. Provider error diagnosis
and real Cloudflare outbound verification remain separate from UI tests.

## 2026-09-07 — D-019 Employee workstation and product baseline

[ADR-009](adr/ADR-009-employee-workstation.md) supersedes project-owner guideline
administration: only yjw@con-cost.com and yjpark@con-cost.com qualify, in addition
to project membership. Employee authentication remains feature-flagged OFF until
the audience and account/project transition are approved. Current Sites identity
and owner-only access remain active; existing identities/history are not reassigned.

Whole-source product baseline is the primary top action, independent of approved
guidelines. Approved guideline review remains separate. File-by-file progress and
immutable baseline results use additive migrations 0007/0008. UI preferences add
KO/VI and a 220–380px sidebar. See the [v15 build notes](qa/2026-09-07-employee-workstation-v15.md)
for verification, scope limits, activation and rollback. No audience expansion is authorized.

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

## 2026-09-08 — User-authorized direct Cloudflare and Google Drive

The user explicitly requests employee login on their Cloudflare account instead
of Sites and Google Drive instead of R2. This supersedes Sites-only hosting/file
binding requirements for the direct target, not for the preserved Sites target.
`wrangler.cloudflare.json` selects the isolated QC Worker/D1; direct builds force
employee authentication, disable demo identity and contain no R2 binding.
Only yjw@con-cost.com and yjpark@con-cost.com can configure company Drive.

Migration 0010 is additive. OAuth is actor-bound, one-use, expiring and PKCE-based;
secrets are AES-GCM encrypted with connection-specific subjects. Default company
account is concost.dt@gmail.com, editable by administrators. A verified new account
and created QC folder are prerequisites for an atomic active-connection switch.
Prior connection credentials are retained solely to read their existing objects.
Stable Google object IDs and checksums support uncertain-write reconciliation.

Recovery: do not drop 0010 tables or rotate the AES key after encrypted records
exist. Keep previous connection records and old Sites deployment/data intact.
Rollback the direct Worker code only to a Drive-aware version; never point the
old R2 adapter at Drive logical keys. Initial release has no preceding direct
version; failed access smoke must keep protected APIs fail-closed.
Heavy-original cleanup and actual Gemini-generated review remain outstanding;
this release is connection/login infrastructure, not full product acceptance.

## 2026-09-08 — Personal/admin settings and explicit company AI

The user requests separate personal settings (password/preferences) and administrator
settings (API, company Drive, review guidelines), plus a building favicon. Only the
two designated application administrators may mutate/read secret configuration.
Password changes reuse credential_version, require the current password, throttle
attempts, compare-and-swap and audit atomically, and invalidate previous sessions.
No account data or roster secrets are changed during development or testing.

The user explicitly approved using the currently connected Gemini key as a company
key, including staff review charges. A separate encrypted company subject reuses
the existing settings store. Promotion is an authenticated administrator mutation;
no secret is returned to staff, no existing company setting is silently replaced.
Natural-language instruction lists extend versioned profile JSON, not source data.
AI is opt-in per run, uses bounded derived rows, emits only Level C candidates, and
records coverage/provenance/usage; unknown monetary cost remains unknown, not zero.
Existing baseline/AI-disabled runs remain available. No destructive schema change.

## 2026-09-09 — Windows local baseline preview

The user prioritizes the general review cycle; contractor manual conformance is a
later extension. `desktop/` reuses the existing source guards, baseline and XLSX
export, isolated from the deployed web. Electron 44.3.0 and electron-builder
26.15.3 (MIT) are development dependencies; the runtime is substantially larger
than the web. Native file processing justifies the runtime for this Windows preview.
Authentication initially reuses the approved server login inside a sandboxed,
memory-only session. PKCE is not implemented. No roster, company key or persisted
cookie is distributed. Main-process IPC is allowlisted; project roles are checked
against existing server responses before and after review. This does not establish
tamper-resistant offline membership enforcement. No production migration/deploy.
The preview is local/trial only: no AI calls, mapping editor, cloud synchronization
or signed updater yet. Packaging configuration is unsigned and is not a release
approval. Verification and next steps are recorded in WEB_DESKTOP_PLAN.md section 11.

## 2026-09-09 — Desktop mapping and administrator draft slice

Desktop 0.1.1 reuses Mapping and versioned project Profile contracts. Mapping
overrides bind filename, SHA and sheet, are revalidated in the worker, and are
snapshotted in each local report. Preview has per-cell/sheet and aggregate bounds.
No new database or schema is introduced. Administrator drafts use the existing
authenticated server route and append a new version; source profile conditions,
exceptions and tolerances are preserved. Listing-digest recheck detects stale
drafts but is not an atomic server lock. Trial/activation requires server sources
and remains a subsequent slice. Production server/AI calls were not made in this
verification; a synthetic transport exercises the actual desktop handlers.

## 2026-09-09 — Desktop trial transport boundary

Reuse the existing server review routes for administrator trial/detail/approval;
do not introduce a second approval store. This slice fixes includeAi=false and
keeps activation blocked when enabled AI instructions have no evaluated coverage.
Desktop IPC serializes instruction mutations before authentication; uncertain
POST transport/response failures never trigger automatic retries or report success.
This is not durable exactly-once execution. Recover through server history.
ADR-011 uploaded/inspection_pending files are not review-ready stored sources.
No client assertion is accepted as a replacement for safe inspection promotion.
UI lifecycle controls, source promotion/synchronization and paid AI remain separate
unfinished work. No production mutations, migration, deploy or installer replacement.

## 2026-09-14 — Bounded Gemini unavailability recovery

Live review d348d6f0-b8d2-4f70-905b-a53691e67162 received Google HTTP 503;
the same saved company key/model minimal generation probe then hit the 25s deadline.
Neither proves invalid credentials or a workbook-size failure. Earlier one-off
success after removing responseSchema is not evidence of a permanent repair.
Keep the saved key/model, source data, strict output validation and DO recovery claim.
Review may retry only explicit upstream-marked HTTP 503, at most twice (1s/2s;
honor Retry-After up to 10s, otherwise stop), recording each retry in limitations.
Network exceptions, timeouts, redirects, other status codes and malformed successful
responses are never retried. The total generation deadline is 60s including waits.
The fixed-text probe remains one request; Promise.race guarantees termination even
if transport ignores abort. No dependency, schema, binding or paid-plan changes.
Acceptance scope: AI failure isolation and bounded execution, RUN-002/RUN-006.
Live verification remains required; unit tests alone do not establish provider recovery.
