# Personal Gemini settings

User request, 2026-09-08: replace status-only settings with key entry, verified save, model changes and disconnect.

- Personal credentials belong exclusively to the authenticated subject, never a caller-supplied owner. Existing organization/admin routes retain the two-email administrator policy.
- Encrypt keys using AES-256-GCM, a fresh IV and subject-bound authenticated data. The independent `AI_SETTINGS_ENCRYPTION_KEY` stays in Sites secrets; no plaintext credential is persisted in D1, browser storage, responses or logs.
- Verify key/model availability with Google's model metadata endpoint before replacing a saved configuration. This is not inference and sends no workbook data. Existing basic review remains independent of external AI.
- Require expected version on save/disconnect. Keep a disconnected tombstone to prevent stale requests and implicit environment fallback. Append settings-specific audit metadata atomically; no fabricated project scope.
- Additive migration only. Rollback to v16 leaves this isolated table unused; do not remove the encryption secret while encrypted rows exist.
- ERP and Mem0 remain unavailable integrations, explicitly separated from working controls. Do not invent switches that have no operational effect.

Acceptance: AUTH-001, AUTH-005, AUD-001/002, SEC-003, AI-001/002, A11Y-002, REL-002. Main owns implementation and release; settings_audit is read-only.
