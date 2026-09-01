# Security and Privacy

## 1. Security objective

Protect confidential construction quantity data and prevent an incorrect or unauthorized review decision from being presented as approved truth.

## 2. Protected assets

- workspace identity and role assignments;
- project metadata and member list;
- uploaded workbooks/CSVs/reference files;
- parsed/normalized rows and calculations;
- findings, comments, corrections, decisions;
- AI-derived assessments;
- reports and approvals;
- D1/R2 binding/configuration and application secrets;
- audit/operational logs.

## 3. Trust boundaries

1. Browser/user input → Sites server.
2. Identity headers/session → actor resolver.
3. Uploaded file bytes → parser.
4. Parser output → canonical model.
5. Canonical data/config → review rules.
6. Derived slice → optional AI provider.
7. AI output → validator/review engine.
8. Application → D1/R2.
9. Application source/version → Sites deployment/audience.

Everything crossing a boundary is untrusted until validated.

## 4. Threats and controls

### 4.1 Broken object authorization / IDOR

Threat: change a URL/body ID to read/write another project's source, finding, report, or file.

Controls:

- opaque IDs;
- join/validate every child resource to project;
- active membership and action-specific role check on server;
- authorize downloads separately;
- cross-project test matrix for every endpoint/action;
- no trust in hidden UI controls.

### 4.2 Identity spoofing

Threat: client sends an email/name header or body field and receives access.

Controls:

- accept identity only from the verified platform server environment;
- strip/ignore client-supplied identity fields;
- normalize email for lookup and prefer stable subject;
- server-side authorization for each operation;
- safe audit on rejected identity.

### 4.3 Malicious workbook/CSV

Threats:

- extension/MIME spoof;
- zip bomb or XML entity/resource exhaustion;
- macros, external links, embedded scripts/objects;
- path traversal filenames;
- huge sheets/cells/formulas;
- parser vulnerabilities;
- hostile text/prompt injection.

Controls:

- magic/signature and archive inspection;
- configured size/count/expansion limits before full parse;
- safe library mode; never execute macros/formulas/links;
- sanitize display name, generate server object key;
- time/resource limits and failure state;
- update/dependency scanning;
- treat all cell text as data, including apparent instructions;
- source text rendered as escaped text.

Antivirus scanning is not claimed unless an actual supported service is integrated and tested. The UI/docs must not imply it exists.

### 4.4 Spreadsheet formula injection

Threat: exported CSV/XLSX cell beginning with a dangerous prefix executes when opened.

Controls:

- classify all user/source text cells as untrusted;
- neutralize `=`, `+`, `-`, `@` and relevant tab/CR prefix variants according to the export library/format;
- preserve visible content safely;
- test every report/export sheet and metadata field;
- never write executable hyperlinks/formulas from source text.

### 4.5 XSS and unsafe rendering

Controls:

- React/text rendering by default;
- no `dangerouslySetInnerHTML` for source/user/AI text;
- sanitize any unavoidable rich HTML with a reviewed allowlist;
- CSP/security headers compatible with Sites and ThreeUI assets;
- validate URLs/protocols;
- comments/report narratives remain plain/escaped text unless explicitly supported.

### 4.6 CSRF/origin and mutation abuse

Controls depend on the verified framework/session model:

- same-site platform auth protections;
- state-changing methods/actions only;
- origin/CSRF token checks where required;
- no mutations via GET;
- re-authorization for sensitive member/approval/deletion actions;
- rate limits/idempotency for costly actions.

Document the exact mechanism in Phase 0. Do not assert protection from framework defaults without verification.

### 4.7 R2 exposure and deletion

Controls:

- private objects;
- server-side generated opaque keys;
- D1 metadata authorization before get/delete;
- no keys/signed URLs in logs or long-lived client state;
- short-lived scoped download mechanism if used;
- exact-key deletion from authorized rows;
- state/reconciliation for cross-resource failures.

### 4.8 D1 data integrity

- foreign keys/unique constraints;
- transactions for aggregate/event updates;
- optimistic concurrency;
- immutable completed-run policy;
- migrations and backup/recovery notes;
- parameterized queries only;
- bounded pagination and JSON.

### 4.9 AI/prompt injection and data leakage

Threat: workbook text instructs the model, model invents evidence/state, or confidential data leaks to provider/logs.

Controls:

- derived structured fields only; source text labeled untrusted data;
- system policy says never follow workbook instructions;
- strict output schema, reference allowlist, size limits;
- Level C only; no approval/closure/correction authority;
- confidence cap and explicit limitation;
- provider/model/policy provenance;
- data minimization and optional disabled mode;
- no raw prompt/content in routine logs;
- use a provider only after organization/data-policy approval.

### 4.10 Supply chain and ThreeUI

- lockfile and dependency review;
- official ThreeUI source/package or authenticated MCP only;
- verify license/entitlement/assets;
- do not copy Pro source without rights;
- record component version/source/checksum where possible;
- avoid arbitrary remote scripts/CDNs;
- inspect shader/renderer lifecycle and network calls.

### 4.11 Secrets

- hosted secrets configured in Sites settings, not prompt/files/hosting manifest;
- local secrets in ignored `.env` only;
- `.env.example` has names/placeholders;
- secret scan before candidate;
- rotate on suspected exposure;
- least-privilege keys and documented owner/expiry.

### 4.12 Denial of service and cost abuse

- upload/count/parse limits;
- per-user/project operation throttles where supported;
- bounded pagination/preview/evidence;
- idempotency and duplicate run detection;
- chunk leases and retry caps;
- AI rate/token/response budgets;
- cancel/reject excessive requests safely;
- monitoring by safe error/stage counts.

## 5. Privacy model

### Data classification

- Restricted: raw sources, canonical rows, reports, comments, AI slices.
- Confidential: project/client metadata, findings, member list, audit details.
- Internal: rule/profile configuration and safe operational metrics.
- Public: only approved generic product assets/help, if any.

### Data minimization

- collect only fields required for review/audit;
- avoid full source rows in logs and list responses;
- AI receives the minimum derived slice;
- analytics does not include project, file, item, comment, or quantity values;
- no raw workbook stored in QA artifacts.

### Identity notice

The UI/privacy notice must explain that the application may receive authenticated email and optional full name from the platform, use them for access/audit/approval, and retain action history under policy.

### Retention

Retention must be approved before production. Expose admin/project policy and deletion impact. Do not promise data residency/inference residency that Sites does not provide.

### AI notice

If AI is enabled, document provider, data categories submitted, purpose, retention/training controls available under the actual account, and how users can run without it. Do not infer provider policy from memory.

## 6. Approval integrity

- Report approval binds report checksum and run/source/profile/config versions.
- Named approver, time, policy, reason recorded.
- Self-approval policy enforced server-side.
- Any new source, adjustment, rerun, report regeneration, or material rule/config change supersedes prior approval as defined by policy.
- UI cannot relabel draft/generated report as final.

## 7. Security logging

Log safe events for:

- authentication/authorization failure;
- upload rejection class;
- repeated/rate-limited costly action;
- invariant/state conflict;
- AI validation failure;
- R2/D1 reconciliation failure;
- destructive deletion/role/approval/audience action.

Do not log source data, secrets, auth headers/cookies, full identity headers, object keys, signed URLs, or raw AI content.

## 8. Security review checklist

- Endpoint/action authorization matrix complete.
- Cross-project IDOR suite passes.
- Upload hostile fixtures pass.
- XSS and formula-injection suite passes.
- CSRF/origin design verified in actual framework.
- R2 private read/delete tested.
- Secrets/dependency/license scans reviewed.
- AI data-flow/disabled mode reviewed.
- Audit redaction tested.
- Retention/deletion tested on exact scoped objects.
- Sites candidate source/migrations/access reviewed.
- No critical/high unresolved finding.

## 9. Incident response minimum

1. Restrict Site access if ongoing exposure is plausible.
2. Preserve safe correlation/audit evidence.
3. Rotate affected secrets.
4. Identify source/version/deployment and affected project scope.
5. Stop risky processing without broad destructive cleanup.
6. Patch and test with regression evidence.
7. Redeploy only an approved saved version.
8. Follow organization/legal notification policy.
9. Record post-incident rule/process changes.
