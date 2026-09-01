PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS user_profile (id TEXT PRIMARY KEY NOT NULL, email TEXT NOT NULL, display_name TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS user_profile_email_uq ON user_profile(email);
CREATE TABLE IF NOT EXISTS project (id TEXT PRIMARY KEY NOT NULL, code TEXT NOT NULL, name TEXT NOT NULL, client_name TEXT, status TEXT NOT NULL CHECK(status IN ('active','archived')), created_by TEXT NOT NULL REFERENCES user_profile(id), created_at INTEGER NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS project_code_uq ON project(code);
CREATE TABLE IF NOT EXISTS project_member (id TEXT PRIMARY KEY NOT NULL, project_id TEXT NOT NULL REFERENCES project(id), user_id TEXT NOT NULL REFERENCES user_profile(id), role TEXT NOT NULL CHECK(role IN ('workspace_admin','project_owner','reviewer','approver','viewer')), created_at INTEGER NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS project_member_project_user_uq ON project_member(project_id,user_id);
CREATE INDEX IF NOT EXISTS project_member_user_idx ON project_member(user_id);
CREATE TABLE IF NOT EXISTS review_case (id TEXT PRIMARY KEY NOT NULL, project_id TEXT NOT NULL REFERENCES project(id), name TEXT NOT NULL, discipline TEXT NOT NULL CHECK(discipline IN ('FIN','RC')), status TEXT NOT NULL CHECK(status IN ('draft','ready','reviewing','needs_attention','awaiting_approval','approved','archived')), owner_id TEXT NOT NULL REFERENCES user_profile(id), reviewer_id TEXT REFERENCES user_profile(id), approver_id TEXT REFERENCES user_profile(id), created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS review_case_project_idx ON review_case(project_id);
CREATE TABLE IF NOT EXISTS audit_event (id TEXT PRIMARY KEY NOT NULL, project_id TEXT NOT NULL REFERENCES project(id), actor_id TEXT NOT NULL REFERENCES user_profile(id), action TEXT NOT NULL, target_type TEXT NOT NULL, target_id TEXT NOT NULL, payload_json TEXT NOT NULL, request_id TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS audit_event_project_time_idx ON audit_event(project_id,created_at);
CREATE UNIQUE INDEX IF NOT EXISTS audit_event_request_uq ON audit_event(request_id);
