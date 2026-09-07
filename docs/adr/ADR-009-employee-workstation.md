# ADR-009 — Employee access and actionable review

Date: 2026-09-07. Status: implementation approved; audience change pending.

User request supersedes platform-only login and project-owner guideline administration.
Only yjw@con-cost.com and yjpark@con-cost.com are application administrators.
Project membership still controls source access. Employee accounts do not implicitly
receive access to every project. Existing actor IDs and immutable history remain intact.

Implement roster-based password authentication behind an explicit server feature flag.
Import only locally salted password hashes; never put the supplied workbook, passwords,
session tokens, or password hashes into source control/build artifacts/tool output.
Use opaque HttpOnly SameSite sessions, server-side revocation, rate limits, and exact
origin mutation checks. Public login availability is a separate Sites audience change,
not implied by deploying a password form. Preserve platform reserved auth routes.

The operating interface inherits the existing Claim Center-inspired light palette:
white work surfaces, sky-blue controls, pink duplicate review, mint completed states.
Resizable sidebar shares one width variable with the content offset; keyboard and
non-drag range controls remain available. Vietnamese is a UI display preference, never
a mutation of source names, formulae, units, evidence, or saved human decisions.

Top-level review starts source preparation and an explicit product baseline regardless
of approved project guidelines; approved-guideline review is a separate action.
Baseline is not a guideline approval, final report
approval, or confirmation of real-world dimensions. Progress reports completed work,
not timer-based percentages. Failed sources remain visible as limitations.
Keep large source processing bounded and reduce repeated canonical metadata before
raising row budgets. Original files and existing review runs remain immutable.

Verification: employee authentication/CSRF/rate limits; two-admin-only writes including
DB guards; project isolation; resize/locale persistence; settings card layout; source
batch preparation and large synthetic workbooks; truthful baseline coverage/report;
existing regression suite and deployed version/audience evidence. Tutorial deferred.
