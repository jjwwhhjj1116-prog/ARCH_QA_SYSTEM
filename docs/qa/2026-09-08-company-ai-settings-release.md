# Company AI and settings release — 2026-09-08

Worker: concost-qc-studio
URL: https://concost-qc-studio.jjwwhhjj1116.workers.dev/
Version: 6e84c62b-31c5-4928-8b73-10755236e669
Previous version: 24fc961e-3017-432a-8166-38e46d4ca9d1

## Scope

- Personal account/password and display settings separated from administrator connections and review instructions.
- Company Gemini subject stores encrypted credentials separately; explicit promotion preserves existing personal connection, checks configuration version, and re-encrypts with company AAD. Only the two allowlisted administrators may configure it.
- Administrator natural-language instruction list persists in versioned profiles. Approved instructions can be explicitly selected for Gemini sample review. No automatic paid execution on connection.
- AI candidates retain source row references and immutable profile/model/token metadata. Basic deterministic findings remain available on provider failure.
- Maximum 60 row-instruction pairs, 60 rows, 10 instructions, 48KiB input; missing and excluded results are unevaluated. Structured profile conditions/exceptions also exclude AI input. This is not full-workbook generative review.
- Request claim prevents duplicate paid submission; company cap 10 requests per 15 minutes. No automatic provider retries. Monetary cost is unknown, not zero.
- Building SVG favicon and public privacy disclosure updated.

## Verification

- npm run check passed: lint, format, types, 375 tests, build.
- Two additional UI regression tests passed with their suites: 28 tests.
- Direct Cloudflare build and deploy succeeded; employee login enabled, demo disabled, Google Drive storage, existing D1, no R2.
- Production anonymous GET root/favicon/privacy/terms: 200. Root references new SVG; privacy contains bounded AI disclosure.
- Production anonymous company API and projects API: 401.
- Local non-admin personal settings inspected in the browser; company controls absent. Admin menu/promotion exercised using synthetic component tests.

## Remaining live verification

No authenticated production administrator session was available in the in-app browser. Existing real key has NOT been promoted by this run. Administrator must use the promotion action after login. No real password was changed and no paid Gemini review was executed. Synthetic adapter/integration tests do not prove live model output or production Drive persistence for an AI run.

No database migration or credential rotation was performed. Existing projects, source files and Drive connections were retained.
