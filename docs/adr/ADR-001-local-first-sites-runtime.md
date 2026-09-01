# ADR-001 — Sites runtime, local-first delivery

- **Status:** Accepted
- **Date:** 2026-09-01

## Decision

Use the official OpenAI Sites Vinext scaffold with logical D1 `DB` and R2 `FILES` bindings. Build and verify locally first. Do not provision, deploy, change audience, or invent resource identifiers until the user gives separate approval.

## Consequences

Domain and repository ports must permit local tests without weakening production authentication. Platform-specific limits remain explicit validation items rather than assumed facts.
