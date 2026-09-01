PRAGMA foreign_keys = ON;
DELETE FROM audit_event WHERE project_id IN (SELECT id FROM project WHERE code LIKE 'E2E%');
DELETE FROM review_case WHERE project_id IN (SELECT id FROM project WHERE code LIKE 'E2E%');
DELETE FROM project_member WHERE project_id IN (SELECT id FROM project WHERE code LIKE 'E2E%');
DELETE FROM project WHERE code LIKE 'E2E%';
