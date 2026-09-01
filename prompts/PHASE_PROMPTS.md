# Phase Prompts

Use these after the previous phase gate passes.

## Phase 0 — Discovery

```text
Run Phase 0 from docs/01_ORCHESTRATOR.md. Delegate independent read-only work to repo_mapper, platform_architect and qa_auditor; add security_reviewer only if code already exposes relevant surfaces. Wait for all required results. Reconcile repository truth, update docs/DECISION_LOG.md, publish the ownership table and freeze shared contracts. Do not implement product features, install unapproved dependencies, authenticate ThreeUI, save/deploy a Site or change access.
```

## Phase 1 — Secure skeleton

```text
Implement Phase 1 as a vertical slice: verified identity -> project membership authorization -> project/case persistence -> audited safe response -> accessible app shell. Use data_platform and frontend_ui with non-overlapping paths after contracts are frozen; have security_reviewer and qa_auditor inspect the integrated slice. Pass Gate 1 and update acceptance evidence. Do not deploy.
```

## Phase 2 — Ingestion

```text
Implement secure XLSX/CSV upload, source versioning, inspection, sheet/header selection, mapping, normalization, lineage and data-quality diagnostics. Split parser/server and UI ownership. Use synthetic hostile/boundary fixtures. Complete all P0 FILE/IMP/MAP/NORM criteria, failure recovery and browser evidence. Do not start review-engine rules against an unstable canonical contract.
```

## Phase 3 — Deterministic FIN MVP

```text
Implement immutable review-run lifecycle, high-value FIN Level A rules, findings/evidence, triage, adjustment overlays and rerun. Freeze rule/result/finding/evidence/run contracts first. Give review_engine, data_platform and frontend_ui exclusive paths, then integrate in the main thread. Prove deterministic checksum repeat, source lineage, state concurrency and keyboard end-to-end flow.
```

## Phase 4 — Statistics and RC

```text
Add explicit cohort/statistical methods and the independent RC profile. Require sample-size/unit/member/floor preconditions and visible not-evaluated behavior. Implement run comparison that distinguishes source, mapping, rule, config and adjustment changes. Capture domain-validation items and representative performance evidence.
```

## Phase 5 — Contextual and reports

```text
Add the optional Level C adapter with minimized structured input, strict output/reference validation and AI-disabled behavior. Add versioned report generation, export injection defense, approval checksum and audit. Have security_reviewer and qa_auditor test prompt-like input, invented references, provider failures, XSS/formula injection and download authorization.
```

## Phase 6 — Hardening and ThreeUI

```text
Complete accessibility, responsive, performance, security, operational and release evidence. Only now research/adopt a small approved ThreeUI enhancement through docs/10_THREEUI_MCP.md; use Community/no enhancement if entitlement or performance is unsuitable. Verify lazy loading, cleanup, reduced motion, static/no-WebGL/error fallbacks. Prepare but do not deploy a saved Sites candidate.
```

## Phase 7 — Release

```text
Run the complete release checklist on the exact candidate commit. Have release_manager audit it read-only. Save a reviewable Sites version without deploying, inspect source/migrations/access and present evidence, risks, intended audience and rollback to the user. Stop for explicit approval. After approval, deploy only that saved version, set only the approved audience, run intended/unauthorized visitor smoke checks, inspect production health and record release evidence.
```
