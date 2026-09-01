DROP INDEX IF EXISTS source_package_actor_idempotency_uq;
CREATE UNIQUE INDEX source_package_actor_idempotency_uq
  ON source_package(project_id,review_case_id,created_by,idempotency_key);
