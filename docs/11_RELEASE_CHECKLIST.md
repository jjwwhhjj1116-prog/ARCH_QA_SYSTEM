# Release Checklist

Copy this file to `artifacts/qa/<release>/release-checklist.md` and add evidence links. Do not edit the template to hide failures.

## 1. Scope and source

- [ ] Release ID/version and exact commit recorded.
- [ ] Included task IDs and acceptance IDs listed.
- [ ] Unrelated/user changes preserved and reviewed.
- [ ] Working tree/source state for candidate is known.
- [ ] Lockfile and package manager are consistent.
- [ ] No confidential source fixture or generated customer report is included.
- [ ] No secret, token, `.env`, signed URL, R2 key, or credential is committed.

## 2. Product contract

- [ ] PRD behavior for the release slice is implemented.
- [ ] Level A/B/C distinction appears in UI/report.
- [ ] Source lineage and rule/profile/config versions are complete.
- [ ] Missing prerequisites are `not evaluated`, not pass.
- [ ] AI cannot approve/close/correct and AI-disabled mode passes.
- [ ] Raw source and completed runs remain immutable.
- [ ] Human state changes/adjustments have actor/reason/history.

## 3. Database/storage

- [ ] Migrations apply to an empty database.
- [ ] Upgrade path from the prior release fixture passes.
- [ ] Foreign keys/unique constraints/indexes verified.
- [ ] Migration backup/recovery/rollback notes complete.
- [ ] D1/R2 binding names verified against the actual Site.
- [ ] R2 objects are private and authorized through the server.
- [ ] Upload/report cross-resource failure recovery passes.
- [ ] Retention/orphan cleanup uses exact scoped keys.

## 4. Authentication/authorization

- [ ] Identity is derived from verified platform context.
- [ ] Role matrix passes for every protected resource/action.
- [ ] Cross-project IDOR suite passes.
- [ ] Revoked/unauthorized users are denied without data leak.
- [ ] Download/delete/report approval are separately authorized.
- [ ] Last-owner and self-approval policies pass.
- [ ] Site audience remains owner/admin-only during review.

## 5. Upload/parser/security

- [ ] Signature/type/size/count/archive guards pass.
- [ ] Corrupt, spoofed, high-compression, macro/link/script fixtures fail safely.
- [ ] No formula/macro/external content executes.
- [ ] XSS tests pass for source/project/comment/AI text.
- [ ] Spreadsheet formula-injection tests pass for all exports.
- [ ] CSRF/origin/mutation design is verified for the actual framework.
- [ ] Dependency, license and secret scans reviewed.
- [ ] Threat model updated and no critical/high unresolved issue.

## 6. Review engine

- [ ] Every active rule has ID/version/prerequisites/tests/evidence.
- [ ] Decimal/unit/tolerance boundary tests pass.
- [ ] FIN deterministic rules pass representative fixtures.
- [ ] Statistical cohort/sample/zero-spread/mixed-unit tests pass.
- [ ] RC prerequisite and member-specific formula tests pass.
- [ ] A/B deterministic checksum repeat passes.
- [ ] Contextual failure leaves valid A/B results and a limitation.
- [ ] Run comparison identifies changed inputs/rules/config.
- [ ] Domain reviewer approved active assumptions or unresolved items are explicitly blocked/deferred.

## 7. UI/accessibility

- [ ] Primary journey passes at 360, 768, 1280 and 1440 widths.
- [ ] Keyboard-only journey passes.
- [ ] Focus/dialog/drawer/stepper/table behavior passes.
- [ ] Labels/errors/status/live-region behavior passes.
- [ ] Contrast/zoom/text-spacing checks pass.
- [ ] Status is not color-only.
- [ ] Back/forward/refresh preserves safe workflow context.
- [ ] Loading/empty/error/unauthorized/conflict/partial states reviewed.
- [ ] Korean long text and large/blank quantities reviewed.

## 8. ThreeUI

- [ ] Every adopted item is in the component log.
- [ ] Source/entitlement/license/notices verified.
- [ ] Dependencies and network behavior reviewed.
- [ ] Core routes do not load Three.js/ThreeUI in the initial chunk.
- [ ] Reduced-motion, static, no-WebGL and error fallback pass.
- [ ] Render loop/resources clean up on hidden/offscreen/unmount.
- [ ] Bundle/runtime/mobile impact meets the approved budget.
- [ ] No source/project/user data is sent to visual dependencies.

## 9. QA and performance

- [ ] Clean install/build passes.
- [ ] Format/lint/typecheck/unit/integration/E2E pass.
- [ ] Accessibility/security suites pass.
- [ ] Migration and report fixture evidence passes.
- [ ] S/M/L and boundary performance is recorded.
- [ ] Finding list/review runtime meets target or verified chunk/recovery path.
- [ ] No unexplained flaky/skip in core coverage.
- [ ] Acceptance matrix completed for all P0/P1.
- [ ] QA manifest includes environment, commands and results.

## 10. Reports/audit/operations

- [ ] Report identifies exact source/run/profile/rules/config/app/engine versions.
- [ ] Report includes Level separation, limitations, unresolved blockers and disclaimer.
- [ ] Report artifact is private, checksummed and authorized.
- [ ] Approval binds report checksum and actor/policy/reason.
- [ ] Required audit events exist and are redacted.
- [ ] Safe logs/correlation IDs diagnose injected failures.
- [ ] Stuck job, reconciliation, AI outage and bad-rule runbooks reviewed.

## 11. Sites saved candidate

- [ ] Existing `.openai/hosting.json` project ID reused.
- [ ] Exact reviewed commit is used to build/save the candidate.
- [ ] Hosted environment key names configured; secret values are not in the repository.
- [ ] Candidate is saved without production deployment.
- [ ] Candidate source changes and migrations reviewed.
- [ ] Owner/admin preview completes the core smoke flow.
- [ ] Candidate URL/version/commit recorded.

## 12. Deployment approval gate

All items below require explicit user approval.

- [ ] User approves the exact saved version for production deployment.
- [ ] User approves intended audience/access level.
- [ ] User approves any public sign-in/custom-domain change separately.
- [ ] Rollback version and data compatibility are recorded.

If any item is unchecked, stop before deployment.

## 13. Post-deploy

- [ ] Deployment reports success and the production URL is recorded.
- [ ] Intended authorized visitor completes the smoke flow.
- [ ] Unintended/unauthorized visitor is denied as expected.
- [ ] Source/report objects remain private.
- [ ] Identity, D1, R2, upload, review and report smoke checks pass.
- [ ] Production logs show no new crash/auth/binding issue.
- [ ] Rollback path remains available.
- [ ] Release note, QA manifest and audit/deployment evidence finalized.

## 14. Go/no-go decision

- Decision: `GO` / `NO-GO`
- Candidate version/commit:
- Approved audience:
- User approval reference:
- Decision owner:
- Date/time UTC:
- Open risks/deferrals:
- Rollback target:
