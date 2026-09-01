# Review Engine Specification

## 1. Purpose

The review engine converts a fixed canonical dataset and configuration snapshot into reproducible rule results and traceable findings. It must be deterministic for Level A/B when given the same engine version, rule versions, dataset, adjustments, and configuration.

## 2. Core interfaces

Illustrative TypeScript; adapt naming to the actual codebase.

```ts
type ReviewLevel = 'A' | 'B' | 'C';
type RuleStatus = 'pass' | 'finding' | 'skipped' | 'not_applicable' | 'failed';
type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

type RulePrerequisite = {
  canonicalFields: string[];
  dimensionClasses?: string[];
  minimumRows?: number;
  requiredBaselines?: string[];
};

type ReviewRule = {
  id: string;
  version: string;
  profile: 'FIN' | 'RC' | 'COMMON';
  level: ReviewLevel;
  prerequisites: RulePrerequisite;
  evaluate(context: RuleContext): AsyncIterable<RuleResult> | RuleResult[];
};

type RuleResult = {
  ruleId: string;
  ruleVersion: string;
  level: ReviewLevel;
  targetKey: string;
  status: RuleStatus;
  severity?: Severity;
  confidence?: string;
  evidence: Evidence[];
  limitations: Limitation[];
};
```

Rules do not access the database, network, AI, clock, random generator, or UI directly. The orchestrator supplies stable inputs and ports.

## 3. Run contract

Inputs:

- canonical dataset ID/checksum;
- active adjustment IDs/hashes;
- profile ID/version;
- rule manifest with rule IDs/versions;
- effective configuration snapshot;
- normalization/unit-table versions;
- project baselines and cohorts;
- engine/application versions;
- optional contextual adapter policy.

Outputs:

- result per rule target with status;
- finding candidates and evidence;
- limitations and skipped/not-applicable reasons;
- stage counts and duration;
- deterministic aggregate checksum for A/B outputs;
- separate provenance for Level C outputs.

## 4. Pipeline

### Stage 0 — Preflight

- Verify dataset `ready` and checksum.
- Verify profile/configuration confirmed.
- Resolve effective rows by applying selected adjustments without mutating originals.
- Validate units and required baseline types.
- Build read-only indexes for floor, category, item/spec, member, subtotal, and source key.
- Produce eligibility matrix for every enabled rule.

### Stage 1 — Deterministic rules

- Use decimal-safe operations.
- Evaluate only rules whose prerequisites are satisfied.
- Store `not_applicable` and `skipped` distinctly.
- Produce complete calculation evidence.

### Stage 2 — Statistical rules

- Build explicit cohorts from confirmed configuration.
- Exclude invalid/incompatible rows with evidence.
- Require minimum sample sizes.
- Record method and population summary.

### Stage 3 — Contextual/AI assistance

- Build minimized structured slices.
- Do not send raw bytes or unrelated rows.
- Validate response schema and references.
- Persist separately with Level C label.
- Failure adds a limitation; it does not discard A/B results.

### Stage 4 — Finding assembly

- Convert rule results to deterministic finding keys.
- Merge only when a documented merge policy applies.
- Link rather than erase overlapping findings.
- Assign severity/confidence from rule policy.
- Compute run summary and checksum.

## 5. Evidence contract

Every finding includes at least one evidence item and all applicable lineage.

```ts
type Evidence = {
  type:
    | 'source'
    | 'calculation'
    | 'comparison'
    | 'baseline'
    | 'context'
    | 'limitation';
  label: string;
  canonicalRowId?: string;
  sourceFileVersionId?: string;
  sheetName?: string;
  rowIndex?: number;
  columnKey?: string;
  rawValue?: unknown;
  normalizedValue?: unknown;
  unit?: string;
  expression?: string;
  operands?: Record<string, string>;
  expected?: string;
  actual?: string;
  absoluteDifference?: string;
  relativeDifference?: string;
  cohort?: CohortSummary;
};
```

Requirements:

- Evidence shown to users cannot contain an unbounded raw row dump.
- Calculations show exact values and tolerance.
- Statistical evidence shows sample size, center/spread method, threshold, exclusions, and peer scope.
- Contextual evidence distinguishes supplied facts from inferred text.
- Missing context is an explicit limitation.

## 6. Severity policy

Severity is rule-specific and does not equal confidence.

Suggested baseline:

- `critical`: deterministic high-impact inconsistency that blocks approval under policy;
- `high`: likely material quantity error or major missing/duplicate scope;
- `medium`: review-relevant inconsistency with moderate impact/uncertainty;
- `low`: minor issue, naming inconsistency, weak basis, or small difference;
- `info`: limitation, skipped rule, or non-blocking observation.

The implementation must avoid deriving impact from an arbitrary quantity magnitude when units/categories are incomparable.

## 7. Confidence policy

Store confidence as a decimal string `0..1` for prioritization, not probability truth.

- Level A: high only when parsing, operands, units, and preconditions are complete.
- Level B: based on sample size, cohort quality, method stability, and distance from threshold.
- Level C: capped below the configured maximum and always review-required.

Confidence changes require rule versioning.

## 8. Tolerance policy

Each calculation rule defines:

- absolute tolerance;
- relative tolerance;
- rounding scale/mode;
- allowed unit conversions;
- behavior near zero;
- whether source display rounding is acceptable.

Typical comparison:

```text
absDiff = |expected - actual|
relDiff = absDiff / max(|expected|, epsilon)
finding when absDiff > absTolerance AND relDiff > relTolerance
```

Do not use this blindly. Count/integer rules may require exact equality; near-zero quantities may use absolute tolerance only.

## 9. Canonical text policy

For grouping/dedup suggestion:

- Unicode normalization;
- trim/collapse whitespace;
- normalized punctuation and case where safe;
- preserve original text;
- do not remove meaningful specification symbols or dimensions;
- separate conservative deterministic key from fuzzy/contextual similarity.

Fuzzy text matching is Level C unless a domain-approved alias dictionary makes the equivalence deterministic.

## 10. Common rules

### COM-DATA-001 Required canonical field missing

- Level: A data-quality result.
- Preconditions: rule profile declares field required.
- Finding: a row lacks/has invalid required input.
- Evidence: row/cell, raw value, required field, dependent rules skipped.

### COM-UNIT-002 Incompatible or unknown unit

- Level A when configured unit map proves incompatibility; otherwise Level C review candidate.
- Never compare values across different dimension classes.

### COM-VALUE-003 Invalid numeric/negative/zero

- Level A only under explicit field/category policy.
- Blank, zero, invalid, and negative are separate conditions.

### COM-DUP-004 Exact duplicate source row

- Level A when the stable duplicate key and comparable fields are identical and policy excludes legitimate repeated lines.
- Otherwise Level C potential duplicate.

### COM-SUM-005 Detail/subtotal mismatch

- Level A.
- Group membership must be explicit from mapping/configuration.
- Evidence lists detail row IDs, sum, declared subtotal, difference, tolerance.

### COM-FORMULA-006 Restricted expression mismatch

- Level A if expression safely parses and operands/units are valid.
- Unsupported formula returns not-evaluated diagnostic.

### COM-REF-007 Reference-key inconsistency

- Level A for exact configured relationship; Level C for semantic reference suspicion.

## 11. FIN rule catalog

### FIN-CALC-001 Dimension calculation mismatch

Checks configured patterns such as:

- `length × height = area`;
- `length × width = area`;
- `area × count = quantity`;
- `length × width × thickness = volume`.

The mapping/profile identifies the applicable pattern. Do not infer a calculation solely from populated dimensions without a category/profile rule.

### FIN-SUM-002 Group total mismatch

Compares detail rows to explicit subtotals/totals.

### FIN-DUP-003 Exact/near duplicate item

- exact same normalized item/spec/location/dimensions/quantity: Level A candidate when repeated rows are not allowed;
- near-match or incomplete keys: Level C.

### FIN-NAME-004 Alias/spelling fragmentation

- Level A only for a confirmed alias dictionary;
- Level C for fuzzy similarity or AI suggestion.
- Evidence shows every original spelling and aggregated quantity separately.

### FIN-DIST-005 Same material dispersed across categories

- Level B/C depending on explicit category policy.
- Never merge source items automatically.

### FIN-OUTLIER-006 Cohort quantity outlier

Default robust approach:

- cohort by confirmed comparable category/item/spec/unit and floor group;
- minimum sample size 5 unless project policy says otherwise;
- use median and MAD or IQR;
- if spread is zero, use explicit absolute/relative deviation policy;
- show peer values/exclusions.

### FIN-FLOOR-007 Typical-floor discontinuity

Flags an item missing or materially different on one floor of a user-confirmed typical-floor cohort.

- Level B by default.
- Exclude mechanical/roof/basement/special floors unless explicitly included.

### FIN-SURFACE-008 Surface/category completeness candidate

Checks configured expected relationships among floor, wall, ceiling, exterior, insulation, brick, or interior-work categories.

- Level C unless a complete project template makes it deterministic.
- Must state that absence from supplied data is not proof of construction-scope omission.

### FIN-RATIO-009 Gross-floor-area ratio anomaly

- Level B.
- Requires trusted GFA baseline and domain-approved category range or historical cohort.
- Show units and source of range.

### FIN-BASIS-010 Weak or missing calculation basis

- Level C or data-quality warning.
- Examples: declared quantity with no dimensions/formula/reference where the profile expects them.

### FIN-DRAW-011 Structured reference mismatch

- Level A only when source and reference use an exact shared key and comparable values.
- Text/OCR/drawing inference remains Level C and needs explicit separate scope.

### FIN-UNIT-012 Suspicious unit or conversion

- Level A for incompatible units or invalid conversion;
- Level B for an unusual but possible unit in a peer cohort.

### FIN-ROUND-013 Excessive rounding delta

- Level A under category-specific rounding policy.
- Show pre-round and display-round values.

### FIN-SCOPE-014 Exterior envelope candidate

Contextual review for exterior wall/insulation/brick categories using configured scope expectations. Never a verified error without complete authoritative scope.

### FIN-LOCATION-015 Location coverage gap

Level B/C based on configured room/zone template and data completeness.

## 12. RC rule catalog

### RC-CONC-001 Concrete volume mismatch

Supported configured geometries may include:

- rectangular member: `length × width × height × count`;
- wall/slab: `area × thickness`;
- other shapes only with an explicit safe formula/profile.

Deduction/opening logic must be explicit; absence of deduction inputs adds a limitation.

### RC-FORM-002 Formwork area mismatch

Member-type-specific exposed-face formulas. The profile must state included/excluded faces and deductions. Do not apply one formula to all member types.

### RC-REBAR-003 Rebar weight mismatch

Requires bar diameter/length/count or another approved basis and a versioned weight table/formula. Splice, hook, waste, and lap assumptions must be explicit or listed as limitations.

### RC-MEMBER-004 Member geometry inconsistency

Exact same member ID/floor with conflicting dimensions is Level A. Similar members with unusual geometry are Level B.

### RC-DUP-005 Duplicate member quantity

Uses floor/member ID/type plus configured source key. Repeated segments must be supported through segment identifiers.

### RC-FLOOR-006 Typical-floor/member outlier

Robust cohort comparison by member type and confirmed comparable floors.

### RC-MISSING-007 Missing member/category candidate

Level C unless an authoritative member schedule or configured template proves expected membership.

### RC-UNIT-008 RC unit incompatibility

Concrete volume, formwork area, and rebar weight must remain in compatible dimension classes.

### RC-RATIO-009 Cross-quantity ratio anomaly

Examples: formwork/concrete or rebar/concrete by member type.

- Level B.
- Requires domain-approved ranges or sufficient historical cohort.
- Never compare across unlike member types without explicit policy.

### RC-DRAW-010 Structured schedule mismatch

Exact key comparison against a supplied, mapped member schedule may be Level A. Arbitrary drawing inference remains out of initial scope.

### RC-SUM-011 Member/floor subtotal mismatch

Level A with explicit grouping.

### RC-PREREQ-012 Evaluation prerequisite missing

Produces a limitation and `not_evaluated`, not a false pass.

## 13. Statistical methods

Allowed initial methods:

- median and median absolute deviation (MAD);
- interquartile range (IQR);
- relative deviation from user-confirmed typical-floor median;
- occurrence continuity across a confirmed cohort;
- domain-approved ratio bands;
- historical baseline percentile only when population provenance is recorded.

Rules:

- no opaque anomaly model in the first release;
- always show population definition and sample size;
- exclude rows with incompatible units/invalid values and list the exclusion count;
- do not generate high confidence from tiny cohorts;
- rule thresholds/config changes create a new version/config snapshot;
- tests cover zero spread, skew, outliers, missing values, and mixed units.

## 14. Finding key and deduplication

Suggested fingerprint inputs:

```text
rule ID/version + target canonical row/cohort IDs + normalized issue class + run ID
```

Within a run:

- identical fingerprint → one finding with merged ordered evidence;
- different rules on same row → separate but related findings unless a versioned merge policy exists;
- source-revision comparison links findings using a cross-run `continuity_key` that excludes run ID and includes stable source/business keys.

Never delete a finding because another rule is more severe. Link or mark duplicate through an audited decision.

## 15. State and human review

- Rules create `open` findings only.
- AI never sets human disposition.
- Every transition validates current state, role, version, required reason, and policy.
- `confirmed_error` requires human actor.
- `accepted_exception` requires reason and may require approver.
- `corrected` references one or more adjustments/source revisions.
- `closed` is a separate event and cannot erase the prior disposition.

## 16. Run comparison

Classify findings across runs as:

- `new`;
- `persistent_same`;
- `persistent_changed`;
- `resolved_by_adjustment`;
- `resolved_by_source_revision`;
- `not_evaluated_now`;
- `rule_changed`;
- `unable_to_match`.

Comparison must show whether dataset, mapping, normalization, rule, config, or adjustments changed. Do not imply source improvement when only the rule threshold changed.

## 17. Rule versioning

Increment a rule version when changing:

- prerequisites;
- formula or grouping;
- tolerance/threshold default;
- severity/confidence policy;
- evidence semantics;
- cohort definition;
- merge/fingerprint logic.

Text-only localization changes need not change the rule version if result semantics are identical.

## 18. Testing a rule

Every rule includes:

- positive finding fixture;
- clean/pass fixture;
- boundary/tolerance fixture;
- missing prerequisite fixture;
- invalid/mixed-unit fixture;
- evidence snapshot/structured assertion;
- deterministic repeat test;
- performance case for large cohort when relevant;
- domain-review notes and `needs-domain-validation` until approved.

Rule tests assert result semantics, not localized prose.
