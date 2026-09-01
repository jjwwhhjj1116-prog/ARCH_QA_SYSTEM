# Reproduction Commands

Run from the repository root with Node.js 22.13 or newer.

```powershell
npm ci
npm run db:migrate:local
$env:LOCAL_DEMO_MODE = 'true'
npm run dev
```

Full local verification:

```powershell
npm run check:full
```

The full gate runs lint, formatting, TypeScript, unit/API tests, production build, coverage, clean/idempotent D1 migration, Playwright and the production dependency audit. Playwright owns a dedicated local port and cleans its synthetic records during teardown.
