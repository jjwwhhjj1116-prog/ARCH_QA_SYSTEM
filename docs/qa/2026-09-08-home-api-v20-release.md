# QC Home / Google connection release

- Target: https://concost-qc-studio.jjwwhhjj1116.workers.dev/
- Deployed version: `50195a55-1d56-497d-aeb4-540b3f31c838`
- Prior turn version: `5f0334d6-48d3-489f-8a2e-e21311e8176a`
- Same QC-only D1; no R2 or Claim Center changes. Employee login on, local demo off.

## Fixes

- Google requests failed before transmission: workerd rejects `redirect: 'error'`.
  Gemini and Drive now use `manual` and reject non-success redirects without
  forwarding credentials. Gemini returns bounded, safe error classifications.
- Model discovery uses Google's actual generateContent-capable model list.
  No guessed model ID is required. Verification still precedes encrypted save.
- Repaired 33 display names from the original workbook with guarded name-only
  SQL. Fresh read-only comparison found zero remaining differences. Passwords,
  roles and account IDs were not modified by this repair.
- Home is the default entry after login. Explicit Settings deep links remain.
- Left navigation holds Home, Project, STEP1, STEP2 formula/duplicate review,
  STEP3 finish/structure branches and Settings. Project CRUD is in the right
  workspace. Existing upload/review permissions and readiness gates remain.
- Inactive finish/structure groups collapse; active group opens. Apartment
  retaining-wall and slab routes are included. Mobile Home shows project scope.

## Evidence

- `npm.cmd run check`: lint, formatting, typecheck, 43 test files / 317 tests,
  production build PASS.
- `npm.cmd run build:cloudflare`: PASS; generated binding target checked before deploy.
- Approved live smoke: admin and employee login HTTP200, personal settings200,
  company settings admin200 / employee403, authenticated Home content, readable
  account name, logout and revoked-session401 all PASS.
- Live synthetic invalid-key POST reaches Google and returns
  `AI_AUTHENTICATION_FAILED` after the fix; before it returned
  `AI_PROVIDER_UNAVAILABLE`. No saved user key was read, changed or transmitted
  by this probe; no generation or source upload took place.
- Local browser: Home, right-side creation, mobile menu and selected-project
  context inspected. Captures in `.impeccable/review/`. Targeted finish review SHIP.
- Existing helpers reused; no added SDK or new UI framework.

## Boundaries / remaining work

Actual valid personal API-key verification and encrypted save were not executed
with the user's key. User should enter their key, load available models, select
the desired returned model and verify/save. Real Google Drive OAuth consent is
still required. Connecting a key does not itself implement Gemini-generated
review: baseline review remains deterministic; AI generation and unfinished
analysis engines are not claimed complete. No heavy-source cleanup was run.

Rollback via the prior Worker version preserves the D1 name repair and secrets;
do not regenerate encryption keys or restore the old broken display names.
