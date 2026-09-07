# ADR-008 — Review preparation and administrator settings

2026-09-07, accepted. Phase FIN workstation follow-up: QC-PREPARE, QC-LARGE-XML,
QC-RULE-ADMIN, QC-MODE-SWITCH. Main owns all changes; agents provide read-only audits.

The normal review flow is prepare sources, run an approved profile, inspect results.
Guideline drafting, trials and activation belong only to left Settings for current
workspace_admin/project_owner members. Enforce both API and atomic D1 insert guards
in additive migration 0006; never edit already-applied 0005 or historical records.

One explicit batch action reads files sequentially and saves recognized header
layouts together. Only unique required column aliases can be recognized. Preserve
existing explicit mappings; unknown layouts remain needs-confirmation, not normal.
Recognition confirms column labels only: formula-result arithmetic, dimension role,
unit and comparable cohorts remain unconfirmed. No filename-only correctness claims.
This supersedes MAP-001's per-sheet confirmation for safely recognized labels only.

Read selected XLSX XML incrementally, not as a complete DOM/archive. Keep separate
compressed/XML/fragment/shared-text/expanded-cell/row/column limits; no partial review
is labeled complete. Source hashes, immutable versions and original bytes are kept.
Clear prior inspection before a different file is loaded or fails. Missing sources
must not block other independently usable sources.

Use existing fflate streaming inflation and promote the already-installed saxes
6.0.0 (ISC) to a pinned production dependency. Its SAX event API validates complete
XML and selects only worksheet/sheetData/row and sst/si; no regex-based row framing.
Upstream is archived: retain exact version, own regression tests and audit advisory
checks. Source: https://github.com/lddubeau/saxes. Token/fragment limits are ours
because saxes does not provide configurable internal buffer limits.

Formula and duplicate modes retain case/run identity, but expose different titles,
source-purpose guidance and result filtering. Unsaved edits require confirmation
before navigation and are discarded only after acceptance. No tutorial in this change.

Owned files: lib/review/{workbook,xml-stream,contracts,server,permissions} and tests;
app/{review-workbench,review-studio,workstation.css}; drizzle/0006; QA/docs.
Acceptance: >8MB XML fixture reads with bounded memory; malicious expansion rejects;
batch preparation preserves mappings and reports per-file failures; reviewers cannot
draft/trial/approve at API or DB; clicking both modes changes heading and results.
Run unit/integration tests, lint, typecheck, build, migration upgrade and local browser
flow. Publishing this follow-up requires user approval; audience remains unchanged.
