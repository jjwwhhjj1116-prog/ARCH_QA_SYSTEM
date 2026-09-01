# Phase 0 QA Manifest

## Verified

- implementation package SHA-256 matched the supplied digest
- official Sites scaffold created with shadcn, D1 and R2 bindings
- baseline production build completed
- Git remote points to the user-supplied empty repository
- deployment commands are absent from ordinary check scripts

## Required before Phase 1 gate

- [x] lint, format, typecheck, unit tests and production build all pass
- [x] production authentication has no local fallback
- [x] project create/list membership tests pass for the implemented slice
- [x] local D1 migration executes successfully and remains idempotent
- [x] keyboard-capable controls and axe scans cover the first meaningful workflow
- [ ] migration rollback evidence and expanded cross-project fixtures (Phase 1 remaining)

## Deferred by user

- Cloudflare resource provisioning
- saved Site deployment and audience configuration
- production smoke test
