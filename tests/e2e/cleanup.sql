PRAGMA foreign_keys = ON;
-- Local-only test projects now contain immutable mapping/run evidence. Archive
-- them instead of deleting referenced originals or weakening foreign keys.
UPDATE project SET status = 'archived'
WHERE created_by = 'local-user-owner'
  AND (code LIKE 'E2E%' OR name LIKE '브라우저 통합 검수 %');
