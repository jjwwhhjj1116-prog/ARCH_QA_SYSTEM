# Phase 2A verification commands

Run from the repository root:

```powershell
npm run format
npm run lint
npm run format:check
npm run typecheck
npm run test
npm run test:coverage
npm run db:migrate:test
npm run test:e2e
npm run build
npm run audit:prod
git diff --check
git --version
git grep -n -E 'BEGIN (RSA|OPENSSH|EC) PRIVATE KEY|AKIA[0-9A-Z]{16}|sk-[A-Za-z0-9]{20,}' -- . ':(exclude)artifacts/qa/phase-2/commands.md'
```

All commands passed for source checkpoint
`8a171f8a837bc958c2f36d89f86f01a945311d67`. Browser and migration summaries
are recorded in the adjacent evidence files. The secret-pattern scan used Git
`2.54.0.windows.1`; exit code 1 with no output means zero matches.
