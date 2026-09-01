# Data Model

Target: D1 relational metadata plus R2 object content. Confirm exact SQL features in the actual Sites environment.

## 1. Model principles

- Project-scoped data isolation.
- Immutable source versions, completed runs, rule results, evidence, AI assessments, and report artifacts.
- Mutable decisions use optimistic concurrency and append-only history.
- Raw bytes live in R2; D1 stores object metadata/checksums.
- Raw source values and normalized values are separate.
- All timestamps are UTC text or another verified sortable representation.
- Quantity values are stored as canonical decimal strings with explicit units.
- JSON snapshots are bounded, versioned, and used only where immutability is valuable.

## 2. Entity overview

```text
project
  ├─ project_member
  ├─ review_case
  │    ├─ source_file ─ source_file_version ─ import_job
  │    │                                  ├─ import_sheet
  │    │                                  ├─ mapping_version
  │    │                                  ├─ canonical_dataset ─ canonical_row
  │    │                                  └─ import_diagnostic
  │    ├─ review_run ─ rule_result ─ finding ─ finding_evidence
  │    │                                  ├─ finding_decision
  │    │                                  ├─ finding_comment
  │    │                                  └─ finding_state_event
  │    ├─ adjustment
  │    └─ report_version ─ report_approval
  ├─ rule_configuration
  ├─ project_baseline
  └─ audit_event
```

## 3. Core tables

The types below are logical. Adapt D1 syntax with migrations.

### 3.1 `user_profile`

| Column                     | Notes                                          |
| -------------------------- | ---------------------------------------------- |
| `id`                       | opaque ID                                      |
| `auth_subject`             | stable provider subject when available; unique |
| `email_normalized`         | unique lookup value                            |
| `email_display`            | presented email                                |
| `display_name`             | optional                                       |
| `status`                   | active/disabled                                |
| `created_at`, `updated_at` | UTC                                            |

Never use display name as identity or authorization key.

### 3.2 `project`

| Column                                                  | Notes                                         |
| ------------------------------------------------------- | --------------------------------------------- |
| `id`                                                    | opaque public ID                              |
| `project_code`                                          | workspace-scoped unique code where configured |
| `name`                                                  | required                                      |
| `client_name`, `location`                               | optional metadata                             |
| `gross_floor_area_decimal`, `gross_floor_area_unit`     | optional baseline                             |
| `timezone`                                              | defaults to Asia/Seoul for display            |
| `status`                                                | active/archived/deletion_pending              |
| `version`                                               | optimistic concurrency                        |
| `created_by`, `created_at`, `updated_at`, `archived_at` | audit fields                                  |

### 3.3 `project_member`

Composite uniqueness on `(project_id, user_id)`.

| Column                                   | Notes                          |
| ---------------------------------------- | ------------------------------ |
| `project_id`, `user_id`                  | membership                     |
| `role`                                   | owner/reviewer/approver/viewer |
| `status`                                 | active/revoked                 |
| `created_by`, `created_at`, `updated_at` | audit                          |

At least one active owner must remain.

### 3.4 `review_case`

| Column                                                  | Notes                                |
| ------------------------------------------------------- | ------------------------------------ |
| `id`, `project_id`                                      | scope                                |
| `profile_kind`                                          | FIN/RC                               |
| `name`, `description`                                   | user data                            |
| `status`                                                | lifecycle state                      |
| `owner_user_id`, `reviewer_user_id`, `approver_user_id` | optional assignments                 |
| `current_dataset_id`, `current_run_id`                  | projections, not history replacement |
| `version`                                               | optimistic concurrency               |
| timestamps                                              | lifecycle                            |

### 3.5 `source_file`

Logical file identity across revisions.

| Column                               | Notes                                |
| ------------------------------------ | ------------------------------------ |
| `id`, `project_id`, `review_case_id` | scope                                |
| `purpose`                            | quantity_source/reference/attachment |
| `display_name`                       | sanitized display name               |
| `status`                             | active/archived                      |
| `created_by`, `created_at`           | audit                                |

### 3.6 `source_file_version`

Immutable after `stored`.

| Column                                          | Notes                                             |
| ----------------------------------------------- | ------------------------------------------------- |
| `id`, `source_file_id`, `project_id`            | denormalized project for safe scoping             |
| `version_number`                                | unique per source file                            |
| `original_filename`                             | safe bounded text                                 |
| `content_type_claimed`, `content_type_detected` | validation evidence                               |
| `size_bytes`                                    | integer                                           |
| `sha256`                                        | content checksum                                  |
| `r2_object_key`                                 | private opaque key                                |
| `status`                                        | upload_pending/validating/stored/rejected/deleted |
| `validation_summary_json`                       | bounded immutable snapshot                        |
| `created_by`, `created_at`, `stored_at`         | audit                                             |

Recommended uniqueness: `(project_id, sha256, purpose)` may detect duplicates but must not prevent intentional versioning without a business decision.

### 3.7 `upload_attempt`

Tracks R2/D1 reconciliation.

| Column                                       | Notes                                               |
| -------------------------------------------- | --------------------------------------------------- |
| `id`, `project_id`, `source_file_version_id` | scope                                               |
| `state`                                      | created/uploading/uploaded/finalized/failed/expired |
| `idempotency_key`                            | unique per actor/project operation                  |
| `r2_object_key`                              | generated server-side                               |
| `error_code`, `correlation_id`               | safe diagnostics                                    |
| timestamps                                   | lifecycle                                           |

### 3.8 `import_job`

One attempt against a fixed source version and parser version.

| Column                                                         | Notes                 |
| -------------------------------------------------------------- | --------------------- |
| `id`, `project_id`, `review_case_id`, `source_file_version_id` | scope                 |
| `attempt_number`, `supersedes_import_job_id`                   | retry chain           |
| `parser_name`, `parser_version`                                | reproducibility       |
| `state`, `stage`, `progress_current`, `progress_total`         | truthful progress     |
| `work_lease_token`, `lease_expires_at`                         | resumable chunk claim |
| `started_at`, `completed_at`, `failed_at`                      | timing                |
| `error_code`, `correlation_id`                                 | diagnostics           |

### 3.9 `import_sheet`

| Column                                                             | Notes                              |
| ------------------------------------------------------------------ | ---------------------------------- |
| `id`, `import_job_id`                                              | scope                              |
| `sheet_index`, `sheet_name`                                        | source identity                    |
| `visibility`                                                       | visible/hidden/very_hidden/unknown |
| `row_count`, `column_count`, `formula_count`, `merged_range_count` | inventory                          |
| `candidate_header_rows_json`                                       | bounded candidates                 |
| `selected`                                                         | mapping decision                   |
| `diagnostic_summary_json`                                          | bounded                            |

### 3.10 `mapping_version`

Immutable after confirmation.

| Column                                                | Notes                           |
| ----------------------------------------------------- | ------------------------------- |
| `id`, `project_id`, `review_case_id`, `import_job_id` | scope                           |
| `version_number`                                      | case-local                      |
| `status`                                              | draft/confirmed/superseded      |
| `mapping_json`                                        | source-to-canonical definitions |
| `units_json`, `floor_rules_json`, `exclusions_json`   | explicit decisions              |
| `mapping_schema_version`                              | parser contract                 |
| `created_by`, `confirmed_by`, timestamps              | audit                           |
| `version`                                             | draft optimistic concurrency    |

### 3.11 `canonical_dataset`

| Column                                                          | Notes                             |
| --------------------------------------------------------------- | --------------------------------- |
| `id`, `project_id`, `review_case_id`                            | scope                             |
| `source_file_version_id`, `import_job_id`, `mapping_version_id` | fixed lineage                     |
| `normalization_version`, `unit_table_version`                   | reproducibility                   |
| `status`                                                        | building/ready/invalid/superseded |
| `row_count`, `valid_row_count`, `warning_count`, `error_count`  | summary                           |
| `dataset_checksum`                                              | deterministic canonical checksum  |
| timestamps                                                      | lifecycle                         |

### 3.12 `canonical_row`

Core query fields should be relational columns; optional source extras may be bounded JSON.

| Column                                                                                    | Notes                                  |
| ----------------------------------------------------------------------------------------- | -------------------------------------- |
| `id`, `dataset_id`, `project_id`, `review_case_id`                                        | scoped opaque ID                       |
| `source_sheet_id`, `source_row_index`                                                     | lineage                                |
| `source_key`                                                                              | optional stable input key              |
| `work_category`, `sub_category`, `item_name`, `material`, `specification`                 | normalized text                        |
| `floor_code`, `zone_code`, `room_code`, `location_text`                                   | location                               |
| `member_type`, `member_id`                                                                | RC context                             |
| `unit_code`, `dimension_class`                                                            | unit safety                            |
| `count_decimal`, `length_decimal`, `width_decimal`, `height_decimal`, `thickness_decimal` | canonical decimal strings              |
| `area_decimal`, `volume_decimal`, `weight_decimal`                                        | geometry                               |
| `declared_quantity_decimal`, `calculated_quantity_decimal`                                | quantity                               |
| `formula_text`, `subtotal_key`, `reference_key`, `note_text`                              | review inputs                          |
| `raw_values_json`                                                                         | bounded raw mapped values              |
| `unmapped_values_json`                                                                    | bounded policy-controlled extras       |
| `lineage_json`                                                                            | cell/column references and conversions |
| `row_hash`                                                                                | deterministic comparison               |
| `created_at`                                                                              | immutable                              |

Do not store numeric zero for blank/invalid. Use null plus diagnostics.

### 3.13 `import_diagnostic`

| Column                                                     | Notes                    |
| ---------------------------------------------------------- | ------------------------ |
| `id`, `project_id`, `import_job_id`, `dataset_id`          | scope                    |
| `severity`                                                 | error/warning/info       |
| `code`                                                     | stable code              |
| `message_key`                                              | localized display lookup |
| `source_sheet_id`, `source_row_index`, `source_column_key` | optional location        |
| `details_json`                                             | bounded safe values      |

### 3.14 `adjustment`

Append-only correction overlay.

| Column                                                                 | Notes                       |
| ---------------------------------------------------------------------- | --------------------------- |
| `id`, `project_id`, `review_case_id`, `dataset_id`, `canonical_row_id` | scope                       |
| `field_name`                                                           | allowlisted canonical field |
| `old_value_json`, `new_value_json`                                     | typed value snapshots       |
| `reason`                                                               | required                    |
| `status`                                                               | active/revoked/superseded   |
| `created_by`, `created_at`, `revoked_by`, `revoked_at`                 | audit                       |

Active adjustment uniqueness may be enforced for `(dataset_id, row_id, field_name)` through application transaction plus index strategy.

### 3.15 `rule_profile_version`

System/admin-controlled immutable catalog.

| Column                                   | Notes                      |
| ---------------------------------------- | -------------------------- |
| `id`, `profile_kind`, `semantic_version` | FIN/RC version             |
| `status`                                 | draft/active/retired       |
| `rule_manifest_json`                     | rule IDs/versions/defaults |
| `created_at`, `activated_at`             | lifecycle                  |

### 3.16 `rule_configuration`

| Column                                   | Notes                                 |
| ---------------------------------------- | ------------------------------------- |
| `id`, `project_id`, `review_case_id`     | scope                                 |
| `profile_version_id`                     | base profile                          |
| `configuration_json`                     | enablement/tolerances/cohorts/aliases |
| `status`                                 | draft/confirmed/superseded            |
| `created_by`, `confirmed_by`, timestamps | audit                                 |
| `version`                                | optimistic concurrency for draft      |

### 3.17 `project_baseline`

| Column                               | Notes                                    |
| ------------------------------------ | ---------------------------------------- |
| `id`, `project_id`, `review_case_id` | scope                                    |
| `baseline_type`                      | GFA/typical_floor/member_ratio/custom    |
| `key`, `value_decimal`, `unit_code`  | value                                    |
| `scope_json`                         | applicable floor/category/member filters |
| `source`, `status`, `version`        | provenance                               |
| `created_by`, timestamps             | audit                                    |

### 3.18 `review_run`

Immutable after terminal finalization.

| Column                                             | Notes                                  |
| -------------------------------------------------- | -------------------------------------- |
| `id`, `project_id`, `review_case_id`, `dataset_id` | fixed scope                            |
| `supersedes_run_id`                                | comparison chain                       |
| `profile_version_id`, `rule_configuration_id`      | fixed rules                            |
| `application_version`, `review_engine_version`     | reproducibility                        |
| `adjustment_snapshot_json`                         | selected adjustment IDs/hashes         |
| `effective_config_snapshot_json`                   | bounded immutable config               |
| `state`, `stage`, progress fields                  | lifecycle                              |
| `idempotency_key`                                  | duplicate protection                   |
| `result_checksum`                                  | final deterministic aggregate checksum |
| evaluated/skipped/failed/finding counts            | summary projections                    |
| started/completed/failed timestamps                | timing                                 |
| `error_code`, `correlation_id`                     | diagnostics                            |

### 3.19 `rule_result`

| Column                              | Notes                                      |
| ----------------------------------- | ------------------------------------------ |
| `id`, `project_id`, `review_run_id` | scope                                      |
| `rule_id`, `rule_version`, `level`  | identity                                   |
| `target_key`                        | deterministic target/cohort key            |
| `status`                            | pass/finding/skipped/not_applicable/failed |
| `severity`, `confidence_decimal`    | when applicable                            |
| `result_json`, `limitation_json`    | bounded structured result                  |
| `result_hash`                       | idempotency/dedup                          |
| `created_at`                        | immutable                                  |

Unique `(review_run_id, rule_id, rule_version, target_key)`.

### 3.20 `finding`

Finding content is immutable for a run; mutable projection fields are versioned.

| Column                                                | Notes                                 |
| ----------------------------------------------------- | ------------------------------------- |
| `id`, `project_id`, `review_case_id`, `review_run_id` | scope                                 |
| `finding_key`                                         | deterministic rule/target fingerprint |
| `rule_id`, `rule_version`, `level`                    | provenance                            |
| `title_key`, `summary_text`                           | safe display                          |
| `severity`, `confidence_decimal`                      | review priority                       |
| `current_state`, `assignee_user_id`                   | mutable projection                    |
| `canonical_finding_id`                                | duplicate-finding link                |
| `version`                                             | optimistic concurrency                |
| `created_at`, `updated_at`, `closed_at`               | lifecycle                             |

Unique `(review_run_id, finding_key)`.

### 3.21 `finding_evidence`

| Column                                                        | Notes                                                     |
| ------------------------------------------------------------- | --------------------------------------------------------- |
| `id`, `project_id`, `finding_id`                              | scope                                                     |
| `evidence_type`                                               | source/calculation/comparison/baseline/context/limitation |
| `canonical_row_id`, `source_file_version_id`, source position | optional lineage                                          |
| `label`, `value_json`                                         | bounded typed evidence                                    |
| `sort_order`                                                  | stable report order                                       |
| `created_at`                                                  | immutable                                                 |

### 3.22 `finding_state_event`

Append-only transition log with `from_state`, `to_state`, reason, actor, timestamp, prior version, and metadata.

### 3.23 `finding_comment`

Append-only comments. Support edit/delete only if policy requires it; retain revision/tombstone audit rather than silent replacement.

### 3.24 `ai_assessment`

| Column                                                     | Notes                                     |
| ---------------------------------------------------------- | ----------------------------------------- |
| `id`, `project_id`, `review_run_id`, optional `finding_id` | scope                                     |
| `provider`, `model_id`, `prompt_policy_version`            | provenance                                |
| `input_categories_json`, `input_hash`                      | minimized audit, no raw prompt by default |
| `output_json`, `schema_version`                            | validated bounded output                  |
| `validation_status`, `limitations_json`                    | trust boundary                            |
| `created_at`                                               | immutable                                 |

### 3.25 `report_version`

| Column                                                | Notes                             |
| ----------------------------------------------------- | --------------------------------- |
| `id`, `project_id`, `review_case_id`, `review_run_id` | fixed scope                       |
| `version_number`, `status`                            | lifecycle                         |
| `format`, `r2_object_key`, `sha256`, `size_bytes`     | artifact                          |
| `snapshot_json`                                       | included counts/decision versions |
| `generated_by`, `generated_at`, `superseded_at`       | audit                             |

### 3.26 `report_approval`

Append-only approval/rejection decisions with approver, decision, reason, report checksum, timestamp, and policy version.

### 3.27 `audit_event`

| Column                                       | Notes                                   |
| -------------------------------------------- | --------------------------------------- |
| `id`, `project_id`                           | optional project scope                  |
| `actor_user_id`, `actor_subject_hash`        | safe actor reference                    |
| `action`, `resource_type`, `resource_id`     | stable event                            |
| `outcome`                                    | success/denied/failed                   |
| `correlation_id`, `ip_metadata_policy_value` | only if approved/privacy-safe           |
| `metadata_json`                              | allowlisted, no raw source rows/secrets |
| `created_at`                                 | append-only                             |

## 4. Index plan

At minimum:

- `project(status, updated_at desc)`
- `project_member(user_id, status, project_id)`
- `review_case(project_id, status, updated_at desc)`
- `source_file_version(project_id, source_file_id, version_number desc)`
- `import_job(review_case_id, created_at desc)`
- `canonical_row(dataset_id, floor_code, work_category, item_name)`
- `canonical_row(dataset_id, member_type, member_id)`
- `canonical_row(dataset_id, source_sheet_id, source_row_index)`
- `review_run(review_case_id, created_at desc)`
- `rule_result(review_run_id, status, rule_id)`
- `finding(review_run_id, current_state, severity, level)`
- `finding(project_id, updated_at desc)`
- `finding_evidence(finding_id, sort_order)`
- `finding_state_event(finding_id, created_at)`
- `audit_event(project_id, created_at desc)`
- `report_version(review_case_id, version_number desc)`

Add indexes based on query evidence, not speculation. Test query plans with representative fixtures.

## 5. R2 key scheme

Generated server-side only:

```text
projects/{projectOpaqueId}/sources/{sourceVersionOpaqueId}/original
projects/{projectOpaqueId}/reports/{reportVersionOpaqueId}/{format}
projects/{projectOpaqueId}/temporary/{uploadAttemptOpaqueId}
```

Do not include original filenames, client names, project codes, emails, or secrets in keys.

Object metadata should be minimal and non-sensitive. Authorize every read via D1/project membership before fetching the key.

## 6. Retention and deletion

Default proposal, requiring owner/admin confirmation:

- unfinalized temporary uploads: delete after 24 hours;
- failed import/review metadata: retain 90 days for audit unless project policy differs;
- active project source/runs/reports: retain until project retention policy expires;
- archived project: remain accessible to authorized users;
- deletion request: mark `deletion_pending`, produce an impact summary, require confirmation, delete R2 objects with verified scoped keys, delete/anonymize D1 data in ordered steps, and append a retained minimal deletion audit record where lawful/required.

Never run broad recursive deletion with an unresolved project/object prefix.

## 7. Concurrency rules

- Draft aggregate updates require `If-Match`/version or equivalent request field.
- State transitions use `UPDATE ... WHERE id=? AND state=? AND version=?` and verify affected rows.
- One active normalization claim per import job stage/chunk.
- One active execution claim per review run stage/chunk.
- A duplicate idempotency key returns the existing operation/result.
- Comments and events are append-only and do not conflict with finding projection updates.

## 8. Data-quality invariants

- `canonical_row.dataset_id` must match the same project/case.
- `review_run.dataset_id`, profile and configuration cannot change after creation.
- Completed/failed/cancelled runs reject result mutation except an approved repair migration.
- Finding rule/run/project IDs must agree.
- Evidence must reference rows/sources inside the same project and run dataset.
- Report checksum and run ID are fixed at approval.
- A closed finding has at least one valid state event and reason.
- Blank and zero remain distinct.
- Unit conversion includes source unit, target unit, factor/version, and original value.

## 9. Migration/test requirements

- Apply every migration to an empty database.
- Apply upgrades from the previous release fixture.
- Verify foreign keys, uniqueness, state constraints, and indexes.
- Test D1 transaction behavior used by each command.
- Seed only synthetic aliases/rule manifests.
- Capture schema dump and migration log in release evidence.
