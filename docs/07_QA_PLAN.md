# QA Plan

## 1. Quality objective

Prove that the product is correct enough to support professional review, safe enough for confidential project data, usable across the required interface range, and honest about what it did not evaluate.

QA is evidence generation, not a final manual click-through.

## 2. Test pyramid

### Unit tests

Fast, deterministic coverage for:

- decimal parsing/arithmetic/rounding/tolerance;
- unit compatibility/conversion;
- Unicode/text normalization;
- restricted formula tokenization/parsing/evaluation;
- state transitions and permissions;
- mapping validation;
- every rule and evidence shape;
- statistical cohorts, thresholds, edge cases;
- finding fingerprint/merge/comparison;
- spreadsheet export escaping;
- AI response schema/reference validation.

### Integration tests

Use a disposable D1-compatible database and test R2/auth fakes or verified local bindings for:

- migrations and constraints;
- repositories/transactions;
- project isolation and roles;
- upload intent/finalize/reconcile;
- import persistence/chunk retry;
- review run idempotency/immutability;
- finding concurrency/state history;
- report storage/download/approval;
- audit event allowlisting;
- retention/deletion partial failure.

### End-to-end tests

Browser tests cover realistic user paths and server authorization:

- sign-in/unauthorized;
- project/case create;
- upload/inspect/map/normalize;
- review configure/start/progress/re-entry;
- results/filter/detail;
- triage/adjust/rerun/compare;
- report/generate/approve/download;
- conflict/error/retry;
- admin settings by role.

### Manual/domain review

Required for:

- FIN/RC rule assumptions and tolerances;
- representative real sanitized workbooks;
- calculation evidence readability;
- false-positive/false-negative review;
- report wording and professional disclaimer;
- Sites access/audience and production candidate.

## 3. Fixture catalog

All committed fixtures are synthetic or irreversibly sanitized.

### Workbook structure fixtures

- `xlsx/simple-fin-clean.xlsx`
- `xlsx/fin-formula-mismatch.xlsx`
- `xlsx/multi-sheet-korean-headers.xlsx`
- `xlsx/header-offset-and-merged.xlsx`
- `xlsx/hidden-rows-columns.xlsx`
- `xlsx/formulas-and-external-links.xlsx`
- `xlsx/duplicate-and-subtotals.xlsx`
- `xlsx/mixed-units.xlsx`
- `xlsx/corrupt.xlsx`
- `xlsx/high-compression.xlsx`
- `xlsx/large-boundary.xlsx`
- `csv/utf8-comma.csv`
- `csv/cp949-comma.csv` when supported safely
- `csv/tab-delimited.tsv` if explicitly supported
- `csv/formula-injection.csv`
- `csv/malformed-quotes.csv`

### FIN semantic fixtures

- clean typical floors;
- one typical-floor missing item;
- legitimate special-floor deviation;
- exact duplicate and legitimate repeated segment;
- alias dictionary exact match and fuzzy near-match;
- GFA baseline in compatible/incompatible units;
- surface category absent with incomplete context;
- rounding boundary and near-zero values.

### RC semantic fixtures

- rectangular concrete member clean/mismatch;
- wall/slab volume with explicit deductions;
- member-specific formwork faces;
- rebar basis complete/incomplete;
- conflicting member dimensions;
- segmented repeated member;
- typical-floor member anomaly;
- mixed area/volume/weight units;
- ratio cohorts by member type.

### Security fixtures

- HTML/script strings in cells;
- dangerous spreadsheet prefixes `=`, `+`, `-`, `@`, tab/CR variants;
- path traversal filenames;
- oversized XML/ZIP expansion patterns;
- spoofed MIME/extension;
- external workbook links/macros;
- long Unicode/RTL/control characters;
- IDs belonging to another project.

## 4. Golden result policy

Use structured golden files only for stable semantics:

- rule ID/version;
- target key;
- status;
- normalized numeric evidence;
- limitation codes;
- finding key/level/severity.

Do not golden-test entire localized prose or timestamps. Golden changes require a reason, rule version review, and diff approval.

## 5. Unit test matrix for every rule

Each rule must cover:

1. clean pass;
2. obvious finding;
3. exact threshold;
4. just below/above threshold;
5. missing prerequisite;
6. blank versus zero;
7. negative value where applicable;
8. incompatible/unknown unit;
9. adjustment overlay;
10. deterministic rerun;
11. evidence completeness;
12. large cohort/performance when relevant.

Statistical rules also cover small sample, zero spread, skew, multiple outliers, excluded floor, and changed cohort.

## 6. Import/parser tests

Validate:

- signature before parse;
- bounded archive expansion;
- no macro/formula execution;
- sheet inventory accuracy;
- hidden/merged metadata;
- header candidate behavior;
- encoding/delimiter detection and override;
- raw/normalized lineage;
- deterministic dataset checksum;
- parser failure code/correlation;
- chunk retry/idempotency;
- no unbounded preview payload.

Use resource instrumentation to measure peak memory and duration on boundary fixtures where supported.

## 7. Database/migration tests

For every migration:

- apply from empty;
- upgrade previous schema/data fixture;
- verify foreign keys and unique constraints;
- verify query indexes/plans for findings and canonical rows;
- run application repository tests;
- confirm completed run immutability at application boundary;
- record recovery/rollback approach.

Do not test production migrations first on production.

## 8. Authorization/security tests

### IDOR matrix

For each resource endpoint/action:

- unauthenticated;
- viewer same project;
- reviewer same project;
- approver same project;
- owner same project;
- admin according to policy;
- user from another project;
- revoked member;
- malformed/nonexistent ID.

### Upload abuse

- extension/signature mismatch;
- archive expansion/compression ratio;
- excessive sheet/row/column/cell;
- corrupt XML/workbook;
- path traversal filename;
- macro/external link/embedded object;
- duplicate upload race;
- orphan cleanup exact scope.

### Web threats

- stored/reflected XSS in project/source/cell/comment text;
- spreadsheet formula injection in every export path;
- mutation origin/CSRF assumptions according to the chosen framework;
- open redirect in return/download links;
- sensitive data in URL/query/log/error;
- secret scanning and dependency audit;
- access to raw R2/public URLs;
- optimistic concurrency bypass.

### AI threats

- prompt-like workbook text remains data;
- AI output with invented row/rule IDs is rejected;
- oversized/malformed output is rejected;
- AI tries to set approved/closed state;
- provider error/timeout/rate limit;
- raw prompt/source not logged.

## 9. Accessibility test plan

Automated checks are necessary but insufficient.

Manual keyboard script:

1. sign in/open project;
2. create case;
3. select and upload file without drag/drop;
4. select sheet/map fields/fix errors;
5. configure/start review and leave/return;
6. filter findings/open detail;
7. change disposition/add adjustment;
8. generate/approve report;
9. navigate back and verify focus/context.

Verify:

- landmarks/headings/skip link;
- visible focus and focus order;
- dialogs and drawers;
- live region restraint;
- input labels/errors/help;
- table headers/sort/selection;
- status not color-only;
- chart alternatives;
- contrast;
- 200% zoom and text spacing;
- reduced motion;
- no-WebGL fallback;
- screen-reader names in Korean.

## 10. Responsive and visual QA

At 360×800, 768×1024, 1280×800, and 1440×900 capture:

- dashboard;
- case overview;
- upload validation;
- mapping with error;
- data quality;
- review progress;
- results and filters;
- finding detail;
- run comparison;
- report/approval;
- unauthorized and server error.

Check clipping, overlap, scroll regions, sticky elements, long Korean labels, large decimals, blank values, focus rings, and print layout.

Visual snapshot updates require human review; do not bulk-accept unexplained diffs.

## 11. Performance test plan

Datasets:

- S: 100 rows;
- M: 2,500 rows;
- L: 10,000 rows;
- boundary: configured maximum.

Measure:

- upload validation and inspection;
- normalization duration/peak resources;
- Level A and B run duration per rule;
- D1 query duration and page size;
- finding list interaction and memory;
- report generation duration/size;
- initial and route bundle sizes;
- WebGL/ThreeUI incremental bundle, main-thread work, frame budget, pause behavior.

Record machine/runtime/build and do not compare numbers from materially different environments as a regression signal.

## 12. Reliability/failure injection

Simulate:

- R2 upload succeeds and D1 finalize fails;
- D1 intent succeeds and R2 upload fails;
- parse fails halfway;
- duplicate chunk request;
- lease expires;
- review Level A rule throws for one target;
- statistical stage fails;
- AI times out;
- report rendering or R2 store fails;
- browser refresh at every workflow stage;
- optimistic-concurrency collision;
- deletion partially fails.

Expected behavior: honest state, no duplicate/partial-complete data, safe retry or operator recovery, correlation/audit evidence.

## 13. Browser compatibility

Use the browsers supported by the selected Sites/organization policy. At minimum validate the current corporate target browsers and mobile Safari/Chrome behavior if mobile access is required. Record versions in QA evidence rather than assuming evergreen parity.

## 14. Release test sequence

1. clean install/lockfile integrity;
2. format/lint;
3. typecheck;
4. unit tests;
5. migration empty/upgrade;
6. integration tests;
7. build;
8. dependency/license/secret/security scans;
9. E2E core and role/IDOR matrix;
10. accessibility;
11. responsive visual review;
12. performance baseline;
13. report fixture inspection;
14. acceptance matrix update;
15. saved Sites candidate review;
16. explicit deployment approval;
17. post-deploy smoke and access check.

## 15. Evidence structure

```text
artifacts/qa/<release-or-commit>/
  manifest.md
  acceptance-matrix.md
  commands.md
  unit/
  integration/
  e2e/
  accessibility/
  visual/
  performance/
  security/
  migrations/
  reports/
```

`manifest.md` records commit, environment, commands, pass/fail/skip, known limitations, and reviewer.

## 16. Exit criteria

- All P0 criteria pass.
- All P1 criteria pass or have explicit user-approved deferral with risk/owner/date.
- No open critical security/correctness issue.
- No unexplained test skip or flaky core test.
- Domain reviewer signs off rule assumptions/representative fixtures.
- Saved candidate matches reviewed commit and migration set.
- Deployment and audience are explicitly approved.
