CREATE TABLE qc_basic_job (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES project(id), case_id TEXT NOT NULL,
 actor_id TEXT NOT NULL REFERENCES user_profile(id), request_key TEXT NOT NULL,
 sources_json TEXT NOT NULL, mappings_json TEXT NOT NULL, policy_json TEXT NOT NULL, parts_json TEXT NOT NULL DEFAULT '[]',
 cursor INTEGER NOT NULL DEFAULT 0, version INTEGER NOT NULL DEFAULT 0,
 lease_token TEXT, lease_until INTEGER NOT NULL DEFAULT 0,
 state TEXT NOT NULL CHECK(state IN ('running','completed','failed')),
 error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 FOREIGN KEY(case_id,project_id) REFERENCES review_case(id,project_id),
 UNIQUE(project_id,case_id,actor_id,request_key)
);
--> statement-breakpoint
CREATE TABLE qc_basic_run (
 id TEXT PRIMARY KEY REFERENCES qc_basic_job(id), project_id TEXT NOT NULL REFERENCES project(id), case_id TEXT NOT NULL,
 object_key TEXT NOT NULL UNIQUE, sha256 TEXT NOT NULL,
 finding_count INTEGER NOT NULL, row_count INTEGER NOT NULL,
 actor_id TEXT NOT NULL REFERENCES user_profile(id), created_at TEXT NOT NULL,
 FOREIGN KEY(case_id,project_id) REFERENCES review_case(id,project_id), UNIQUE(id,project_id)
);
--> statement-breakpoint
CREATE TABLE qc_basic_decision (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES project(id), run_id TEXT NOT NULL,
 finding_id TEXT NOT NULL, disposition TEXT NOT NULL CHECK(disposition IN ('needs_fix','normal','hold')),
 reason TEXT NOT NULL, actor_id TEXT NOT NULL REFERENCES user_profile(id), created_at TEXT NOT NULL,
 FOREIGN KEY(run_id,project_id) REFERENCES qc_basic_run(id,project_id)
);
--> statement-breakpoint
CREATE INDEX qc_basic_run_case ON qc_basic_run(project_id,case_id,created_at);
--> statement-breakpoint
CREATE INDEX qc_basic_job_case ON qc_basic_job(project_id,case_id,actor_id,state);
--> statement-breakpoint
CREATE TRIGGER qc_basic_run_update BEFORE UPDATE ON qc_basic_run BEGIN SELECT RAISE(ABORT,'immutable run'); END;
--> statement-breakpoint
CREATE TRIGGER qc_basic_run_delete BEFORE DELETE ON qc_basic_run BEGIN SELECT RAISE(ABORT,'immutable run'); END;
--> statement-breakpoint
CREATE TRIGGER qc_basic_decision_update BEFORE UPDATE ON qc_basic_decision BEGIN SELECT RAISE(ABORT,'immutable decision'); END;
--> statement-breakpoint
CREATE TRIGGER qc_basic_decision_delete BEFORE DELETE ON qc_basic_decision BEGIN SELECT RAISE(ABORT,'immutable decision'); END;
--> statement-breakpoint
CREATE TRIGGER qc_basic_job_member BEFORE INSERT ON qc_basic_job BEGIN
 SELECT (CASE WHEN NOT EXISTS (SELECT 1 FROM project_member pm JOIN project p ON p.id=pm.project_id JOIN review_case rc ON rc.project_id=p.id WHERE p.id=NEW.project_id AND p.status='active' AND rc.id=NEW.case_id AND rc.status<>'archived' AND rc.discipline='FIN' AND pm.user_id=NEW.actor_id AND pm.role IN ('workspace_admin','project_owner','reviewer') AND NOT EXISTS (SELECT 1 FROM employee_account a WHERE a.id=pm.user_id AND a.active=0)) THEN RAISE(ABORT,'QC_PERMISSION_CHANGED') END);
END;
--> statement-breakpoint
CREATE TRIGGER qc_basic_job_write BEFORE UPDATE ON qc_basic_job BEGIN
 SELECT (CASE WHEN OLD.state='completed' OR NEW.project_id<>OLD.project_id OR NEW.case_id<>OLD.case_id OR NEW.actor_id<>OLD.actor_id OR NEW.sources_json<>OLD.sources_json OR NEW.mappings_json<>OLD.mappings_json OR NEW.policy_json<>OLD.policy_json THEN RAISE(ABORT,'immutable job snapshot') END);
 SELECT (CASE WHEN NOT EXISTS (SELECT 1 FROM project_member pm JOIN project p ON p.id=pm.project_id JOIN review_case rc ON rc.project_id=p.id WHERE p.id=NEW.project_id AND p.status='active' AND rc.id=NEW.case_id AND rc.status<>'archived' AND pm.user_id=NEW.actor_id AND pm.role IN ('workspace_admin','project_owner','reviewer') AND NOT EXISTS (SELECT 1 FROM employee_account a WHERE a.id=pm.user_id AND a.active=0)) THEN RAISE(ABORT,'QC_PERMISSION_CHANGED') END);
END;
--> statement-breakpoint
CREATE TRIGGER qc_basic_run_member BEFORE INSERT ON qc_basic_run BEGIN
 SELECT (CASE WHEN NOT EXISTS (SELECT 1 FROM project_member pm JOIN project p ON p.id=pm.project_id JOIN review_case rc ON rc.project_id=p.id WHERE p.id=NEW.project_id AND p.status='active' AND rc.id=NEW.case_id AND rc.status<>'archived' AND rc.discipline='FIN' AND pm.user_id=NEW.actor_id AND pm.role IN ('workspace_admin','project_owner','reviewer') AND NOT EXISTS (SELECT 1 FROM employee_account a WHERE a.id=pm.user_id AND a.active=0)) THEN RAISE(ABORT,'QC_PERMISSION_CHANGED') END);
END;
--> statement-breakpoint
CREATE TRIGGER qc_basic_decision_member BEFORE INSERT ON qc_basic_decision BEGIN
 SELECT (CASE WHEN NOT EXISTS (SELECT 1 FROM project_member pm JOIN project p ON p.id=pm.project_id JOIN qc_basic_run r ON r.project_id=p.id JOIN review_case rc ON rc.id=r.case_id WHERE p.id=NEW.project_id AND p.status='active' AND r.id=NEW.run_id AND rc.status<>'archived' AND pm.user_id=NEW.actor_id AND pm.role IN ('workspace_admin','project_owner','reviewer','approver') AND NOT EXISTS (SELECT 1 FROM employee_account a WHERE a.id=pm.user_id AND a.active=0)) THEN RAISE(ABORT,'QC_PERMISSION_CHANGED') END);
END;
