CREATE TABLE employee_account (
 id TEXT PRIMARY KEY REFERENCES user_profile(id),
 email TEXT NOT NULL COLLATE NOCASE UNIQUE,
 password_hash TEXT NOT NULL,
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
 credential_version INTEGER NOT NULL DEFAULT 1,
 created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE employee_session (
 token_hash TEXT PRIMARY KEY,
 account_id TEXT NOT NULL REFERENCES employee_account(id),
 credential_version INTEGER NOT NULL,
 expires_at INTEGER NOT NULL,
 created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TRIGGER employee_identity_insert BEFORE INSERT ON employee_account BEGIN
 SELECT (CASE WHEN NOT EXISTS (SELECT 1 FROM user_profile u WHERE u.id=NEW.id AND lower(u.email)=lower(NEW.email)) THEN RAISE(ABORT,'EMPLOYEE_IDENTITY_MISMATCH') END);
END;
--> statement-breakpoint
CREATE TRIGGER employee_identity_update BEFORE UPDATE OF id,email ON employee_account BEGIN
 SELECT (CASE WHEN NEW.id<>OLD.id OR lower(NEW.email)<>lower(OLD.email) THEN RAISE(ABORT,'EMPLOYEE_IDENTITY_IMMUTABLE') END);
END;
--> statement-breakpoint
CREATE TRIGGER employee_profile_identity BEFORE UPDATE OF email ON user_profile WHEN EXISTS (SELECT 1 FROM employee_account e WHERE e.id=OLD.id AND lower(e.email)<>lower(NEW.email)) BEGIN SELECT RAISE(ABORT,'EMPLOYEE_IDENTITY_IMMUTABLE'); END;
--> statement-breakpoint
CREATE INDEX employee_session_expiry ON employee_session(expires_at);
--> statement-breakpoint
CREATE TABLE auth_attempt (
 bucket TEXT PRIMARY KEY,
 attempts INTEGER NOT NULL,
 expires_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE auth_event (
 id TEXT PRIMARY KEY,
 actor_id TEXT,
 outcome TEXT NOT NULL,
 request_id TEXT NOT NULL,
 created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE employee_roster_import (revision TEXT PRIMARY KEY, account_count INTEGER NOT NULL, created_at INTEGER NOT NULL);
--> statement-breakpoint
DROP TRIGGER qc_profile_member;
--> statement-breakpoint
CREATE TRIGGER qc_profile_member BEFORE INSERT ON qc_profile_version BEGIN
 SELECT (CASE WHEN NOT EXISTS (SELECT 1 FROM project_member pm JOIN project p ON p.id=pm.project_id JOIN user_profile u ON u.id=pm.user_id WHERE p.id=NEW.project_id AND p.status='active' AND pm.user_id=NEW.actor_id AND pm.role IN ('workspace_admin','project_owner','reviewer') AND lower(u.email) IN ('yjw@con-cost.com','yjpark@con-cost.com') AND NOT EXISTS (SELECT 1 FROM employee_account e WHERE e.id=u.id AND e.active=0)) THEN RAISE(ABORT,'QC_PERMISSION_CHANGED') END);
END;
--> statement-breakpoint
DROP TRIGGER qc_approval_member;
--> statement-breakpoint
CREATE TRIGGER qc_approval_member BEFORE INSERT ON qc_profile_approval BEGIN
 SELECT (CASE WHEN NOT EXISTS (SELECT 1 FROM project_member pm JOIN project p ON p.id=pm.project_id JOIN user_profile u ON u.id=pm.user_id WHERE p.id=NEW.project_id AND p.status='active' AND pm.user_id=NEW.actor_id AND pm.role IN ('workspace_admin','project_owner','reviewer') AND lower(u.email) IN ('yjw@con-cost.com','yjpark@con-cost.com') AND NOT EXISTS (SELECT 1 FROM employee_account e WHERE e.id=u.id AND e.active=0)) THEN RAISE(ABORT,'QC_PERMISSION_CHANGED') END);
 SELECT (CASE WHEN NOT EXISTS (SELECT 1 FROM qc_review_run WHERE id=NEW.trial_run_id AND project_id=NEW.project_id AND profile_id=NEW.profile_id AND trial=1) THEN RAISE(ABORT,'TRIAL_REQUIRED') END);
END;
--> statement-breakpoint
DROP TRIGGER qc_trial_admin;
--> statement-breakpoint
CREATE TRIGGER qc_trial_admin BEFORE INSERT ON qc_review_run WHEN NEW.trial=1 BEGIN
 SELECT (CASE WHEN NOT EXISTS (SELECT 1 FROM project_member pm JOIN project p ON p.id=pm.project_id JOIN user_profile u ON u.id=pm.user_id WHERE p.id=NEW.project_id AND p.status='active' AND pm.user_id=NEW.actor_id AND pm.role IN ('workspace_admin','project_owner','reviewer') AND lower(u.email) IN ('yjw@con-cost.com','yjpark@con-cost.com') AND NOT EXISTS (SELECT 1 FROM employee_account e WHERE e.id=u.id AND e.active=0)) THEN RAISE(ABORT,'QC_PERMISSION_CHANGED') END);
END;
