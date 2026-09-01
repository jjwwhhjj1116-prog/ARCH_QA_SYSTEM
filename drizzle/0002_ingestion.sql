PRAGMA foreign_keys = ON;

CREATE UNIQUE INDEX IF NOT EXISTS review_case_id_project_uq ON review_case(id,project_id);

CREATE TABLE IF NOT EXISTS source_package (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL REFERENCES project(id),
  review_case_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('draft','receiving','validating','stored_unverified','identity_matched','blocked','rejected','aborted')),
  project_identity_status TEXT NOT NULL CHECK(project_identity_status IN ('pending','matched','unknown','conflict')),
  hard_rule_version TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL CHECK(length(request_hash) = 64 AND request_hash NOT GLOB '*[^0-9a-f]*'),
  version INTEGER NOT NULL CHECK(version >= 1),
  created_by TEXT NOT NULL REFERENCES user_profile(id),
  created_at INTEGER NOT NULL,
  CONSTRAINT source_package_case_project_fk FOREIGN KEY(review_case_id,project_id) REFERENCES review_case(id,project_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS source_package_actor_idempotency_uq ON source_package(project_id,review_case_id,created_by,idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS source_package_scope_uq ON source_package(id,project_id,review_case_id);
CREATE INDEX IF NOT EXISTS source_package_case_idx ON source_package(review_case_id,created_at);

CREATE TABLE IF NOT EXISTS source_file (
  id TEXT PRIMARY KEY NOT NULL,
  package_id TEXT NOT NULL REFERENCES source_package(id),
  project_id TEXT NOT NULL REFERENCES project(id),
  review_case_id TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK(purpose IN ('quantity_source','reference','attachment')),
  declared_document_kind TEXT NOT NULL CHECK(declared_document_kind IN ('takeoff','summary','unknown')),
  display_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('active','archived')),
  created_by TEXT NOT NULL REFERENCES user_profile(id),
  created_at INTEGER NOT NULL,
  CONSTRAINT source_file_case_project_fk FOREIGN KEY(review_case_id,project_id) REFERENCES review_case(id,project_id),
  CONSTRAINT source_file_package_scope_fk FOREIGN KEY(package_id,project_id,review_case_id) REFERENCES source_package(id,project_id,review_case_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS source_file_scope_uq ON source_file(id,package_id,project_id,review_case_id);
CREATE INDEX IF NOT EXISTS source_file_package_idx ON source_file(package_id,created_at);

CREATE TABLE IF NOT EXISTS source_file_version (
  id TEXT PRIMARY KEY NOT NULL,
  source_file_id TEXT NOT NULL REFERENCES source_file(id),
  package_id TEXT NOT NULL REFERENCES source_package(id),
  project_id TEXT NOT NULL REFERENCES project(id),
  review_case_id TEXT NOT NULL,
  version_number INTEGER NOT NULL CHECK(version_number >= 1),
  original_filename TEXT NOT NULL,
  extension_claimed TEXT NOT NULL CHECK(extension_claimed IN ('xlsx','csv')),
  extension_detected TEXT CHECK(extension_detected IN ('xlsx','csv')),
  content_type_claimed TEXT NOT NULL,
  content_type_detected TEXT,
  size_bytes INTEGER NOT NULL CHECK(size_bytes > 0),
  sha256 TEXT CHECK(sha256 IS NULL OR (length(sha256) = 64 AND sha256 NOT GLOB '*[^0-9a-f]*')),
  r2_object_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('upload_pending','uploaded','validating','stored','rejected','deleted')),
  validation_summary_json TEXT,
  project_identity_status TEXT NOT NULL CHECK(project_identity_status IN ('pending','matched','unknown','conflict')),
  created_by TEXT NOT NULL REFERENCES user_profile(id),
  created_at INTEGER NOT NULL,
  stored_at INTEGER,
  CONSTRAINT source_version_case_project_fk FOREIGN KEY(review_case_id,project_id) REFERENCES review_case(id,project_id),
  CONSTRAINT source_version_file_scope_fk FOREIGN KEY(source_file_id,package_id,project_id,review_case_id) REFERENCES source_file(id,package_id,project_id,review_case_id),
  CONSTRAINT source_version_stored_invariant CHECK(
    status <> 'stored' OR (
      sha256 IS NOT NULL AND
      extension_detected IS NOT NULL AND
      content_type_detected IS NOT NULL AND
      validation_summary_json IS NOT NULL AND
      stored_at IS NOT NULL
    )
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS source_version_number_uq ON source_file_version(source_file_id,version_number);
CREATE UNIQUE INDEX IF NOT EXISTS source_version_scope_uq ON source_file_version(id,package_id,project_id,review_case_id);
CREATE INDEX IF NOT EXISTS source_version_project_sha_idx ON source_file_version(project_id,sha256);

CREATE TABLE IF NOT EXISTS upload_attempt (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL REFERENCES project(id),
  review_case_id TEXT NOT NULL,
  package_id TEXT NOT NULL REFERENCES source_package(id),
  source_file_version_id TEXT NOT NULL REFERENCES source_file_version(id),
  created_by TEXT NOT NULL REFERENCES user_profile(id),
  state TEXT NOT NULL CHECK(state IN ('created','uploading','uploaded','finalizing','finalized','failed','expired')),
  idempotency_key TEXT NOT NULL,
  r2_object_key TEXT NOT NULL,
  expected_size INTEGER NOT NULL CHECK(expected_size > 0),
  error_code TEXT,
  correlation_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK(version >= 1),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  CONSTRAINT upload_attempt_case_project_fk FOREIGN KEY(review_case_id,project_id) REFERENCES review_case(id,project_id),
  CONSTRAINT upload_attempt_source_scope_fk FOREIGN KEY(source_file_version_id,package_id,project_id,review_case_id) REFERENCES source_file_version(id,package_id,project_id,review_case_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS upload_attempt_actor_idempotency_uq ON upload_attempt(project_id,created_by,idempotency_key);
CREATE INDEX IF NOT EXISTS upload_attempt_expiry_idx ON upload_attempt(state,expires_at);

CREATE TABLE IF NOT EXISTS import_job (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL REFERENCES project(id),
  review_case_id TEXT NOT NULL,
  package_id TEXT NOT NULL REFERENCES source_package(id),
  source_file_version_id TEXT NOT NULL REFERENCES source_file_version(id),
  parser_name TEXT NOT NULL,
  parser_version TEXT NOT NULL,
  hard_rule_version TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('queued','inspecting','needs_mapping','blocked','ready','failed')),
  stage TEXT NOT NULL,
  progress_current INTEGER NOT NULL CHECK(progress_current >= 0),
  progress_total INTEGER NOT NULL CHECK(progress_total >= 0),
  work_lease_token TEXT,
  lease_expires_at INTEGER,
  version INTEGER NOT NULL CHECK(version >= 1),
  error_code TEXT,
  correlation_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  completed_at INTEGER,
  failed_at INTEGER,
  CONSTRAINT import_job_case_project_fk FOREIGN KEY(review_case_id,project_id) REFERENCES review_case(id,project_id),
  CONSTRAINT import_job_source_scope_fk FOREIGN KEY(source_file_version_id,package_id,project_id,review_case_id) REFERENCES source_file_version(id,package_id,project_id,review_case_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS import_job_source_version_uq ON import_job(source_file_version_id);
CREATE INDEX IF NOT EXISTS import_job_package_idx ON import_job(package_id,created_at);
