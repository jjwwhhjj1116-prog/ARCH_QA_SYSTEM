# ADR-002 — Review and authority boundaries

- **Status:** Accepted
- **Date:** 2026-09-01

## Decision

Keep Level A deterministic, Level B statistical and Level C contextual/AI-assisted. AI is disabled by default and cannot confirm, correct, close, approve or mutate source data. Project membership and self-approval policy are server-enforced.

## Consequences

Certainty, severity, workflow state and human disposition are stored separately. Reports and UI must expose skipped prerequisites and limitations.
