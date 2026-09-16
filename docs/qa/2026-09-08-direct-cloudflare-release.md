# Direct Cloudflare QC release evidence

- Public login URL: https://concost-qc-studio.jjwwhhjj1116.workers.dev/
- Active version verified with Wrangler deployments list: `5f0334d6-48d3-489f-8a2e-e21311e8176a` (100%).
- Isolated QC D1: `concost-qc-studio-db`; migrations through 0010 applied. No R2 binding or subscription required by this deployment. Existing Sites and Claim Center resources remain unchanged.
- `npm.cmd run check`: formatting, TypeScript, 43 test files / 295 tests, and build passed.
- User-authorized live smoke: administrator login 200, company settings 200, personal settings 200; employee login 200, company settings 403, personal settings 200. Test sessions logged out and revocation verified. No projects or sources changed.

## Production authentication correction

Cloudflare production rejected the legacy 600,000-iteration PBKDF2 operation. The password cost was not lowered: new records use native scrypt N=16384, r=8, p=5 with random salts. Local production Worker authentication and regression tests passed before the guarded migration.

The read-only credential workbook was checked against all 33 prior password hashes. Identifiers and passwords were preserved. The migration required all previous hashes to match before updating any account, and incremented credential versions. A CLI output parsing error occurred after execution; rather than repeating the mutation, a read-only query verified 33 compatible records and minimum credential version 2. Secrets, passwords and cookies are not included in this record.

## Explicit remaining boundaries

Read-only live D1 verification found zero company Drive settings and zero Drive connections. OAuth application setup and administrator Google consent are still required; Drive storage is implemented but not yet verified against a real authorized company account. Default target is concost.dt@gmail.com and administrators can replace it.

The in-app QC tab still displayed the login page after the user reported login, so another browser session must not be assumed accessible. Do not copy authentication tokens from the reference application.

Real Gemini review generation, heavy-original cleanup and old Sites project migration remain incomplete. Key configuration, transport tests and deployment success do not establish those workflows as working.

Normal `npm run check` builds the legacy Sites target locally. Before any further direct deployment, run `npm.cmd run build:cloudflare` and verify the generated bindings. Preserve the encryption key and existing Drive connections during rollback.
