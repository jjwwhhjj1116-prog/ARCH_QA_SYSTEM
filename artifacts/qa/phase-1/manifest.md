# Phase 1 Local Evidence Manifest

Date: 2026-09-01

Candidate: local vertical-slice checkpoint; not a production candidate

Toolchain used: Node.js v24.16.0, npm 11.13.0

Verified source commit: `8958d03042a1e62c38a7284473d8ca9a3daa9de5`

## Source scope

- Korean responsive application shell
- project creation, search, selection and persistence
- FIN/RC review-case creation, listing and persistence
- D1 schema, repository and append-only audit base
- private R2 storage port with snapshot-derived integrity metadata
- shared HTTP request boundary and fail-closed production actor resolver
- unit, API, migration, browser, accessibility and dependency checks

## Canonical database migration

- source: `drizzle/0001_initial.sql`
- Sites build artifact: `dist/.openai/drizzle/0001_initial.sql`
- SHA-256: `7555FC5EAF03DA7219C8DC4C3435CAF79F5480848A7055EF6B655C19B006A92D`
- local/test migration is applied twice to prove idempotence

The source and packaged `.openai/hosting.json` hashes also match. The generated Wrangler migration path resolves to `dist/.openai/drizzle` and is not a second migration source.

## Exclusions

- no customer workbooks or derived customer data
- no secrets or credentials
- no remote Cloudflare resource changes
- no production deployment
- no claim that ingestion or the FIN/RC review engine is complete
