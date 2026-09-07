CREATE TABLE qc_profile_version (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES project(id),
 version INTEGER NOT NULL, profile_json TEXT NOT NULL, actor_id TEXT NOT NULL REFERENCES user_profile(id), created_at TEXT NOT NULL,
 UNIQUE(project_id, version), UNIQUE(id, project_id)
);
--> statement-breakpoint
CREATE TABLE qc_mapping_version (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES project(id), case_id TEXT NOT NULL,
 mappings_json TEXT NOT NULL, actor_id TEXT NOT NULL REFERENCES user_profile(id), created_at TEXT NOT NULL, base_id TEXT NOT NULL,
 UNIQUE(project_id,case_id,base_id),
 FOREIGN KEY(case_id, project_id) REFERENCES review_case(id, project_id)
);
--> statement-breakpoint
CREATE INDEX qc_mapping_case ON qc_mapping_version(project_id, case_id, created_at);
--> statement-breakpoint
CREATE TABLE qc_review_run (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES project(id), case_id TEXT NOT NULL,
 profile_id TEXT NOT NULL, profile_version INTEGER NOT NULL, trial INTEGER NOT NULL CHECK(trial IN (0,1)),
 object_key TEXT NOT NULL UNIQUE, sha256 TEXT NOT NULL, finding_count INTEGER NOT NULL, row_count INTEGER NOT NULL,
 actor_id TEXT NOT NULL REFERENCES user_profile(id), created_at TEXT NOT NULL,
 UNIQUE(id, project_id), FOREIGN KEY(case_id, project_id) REFERENCES review_case(id, project_id),
 FOREIGN KEY(profile_id, project_id) REFERENCES qc_profile_version(id, project_id)
);
--> statement-breakpoint
CREATE INDEX qc_run_case ON qc_review_run(project_id, case_id, created_at);
--> statement-breakpoint
CREATE TABLE qc_profile_approval (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES project(id), profile_id TEXT NOT NULL UNIQUE,
 trial_run_id TEXT NOT NULL, actor_id TEXT NOT NULL REFERENCES user_profile(id), created_at TEXT NOT NULL,
 FOREIGN KEY(profile_id, project_id) REFERENCES qc_profile_version(id, project_id),
 FOREIGN KEY(trial_run_id, project_id) REFERENCES qc_review_run(id, project_id)
);
--> statement-breakpoint
CREATE TABLE qc_review_decision (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES project(id), run_id TEXT NOT NULL, finding_id TEXT NOT NULL,
 disposition TEXT NOT NULL CHECK(disposition IN ('needs_fix','normal','hold')), reason TEXT NOT NULL,
 actor_id TEXT NOT NULL REFERENCES user_profile(id), created_at TEXT NOT NULL,
 FOREIGN KEY(run_id, project_id) REFERENCES qc_review_run(id, project_id)
);
--> statement-breakpoint
CREATE INDEX qc_decision_run ON qc_review_decision(project_id, run_id, created_at);
--> statement-breakpoint
CREATE TRIGGER qc_profile_immutable_update BEFORE UPDATE ON qc_profile_version BEGIN SELECT RAISE(ABORT, 'immutable profile'); END;
--> statement-breakpoint
CREATE TRIGGER qc_profile_immutable_delete BEFORE DELETE ON qc_profile_version BEGIN SELECT RAISE(ABORT, 'immutable profile'); END;
--> statement-breakpoint
CREATE TRIGGER qc_mapping_immutable_update BEFORE UPDATE ON qc_mapping_version BEGIN SELECT RAISE(ABORT, 'immutable mapping'); END;
--> statement-breakpoint
CREATE TRIGGER qc_mapping_immutable_delete BEFORE DELETE ON qc_mapping_version BEGIN SELECT RAISE(ABORT, 'immutable mapping'); END;
--> statement-breakpoint
CREATE TRIGGER qc_run_immutable_update BEFORE UPDATE ON qc_review_run BEGIN SELECT RAISE(ABORT, 'immutable run'); END;
--> statement-breakpoint
CREATE TRIGGER qc_run_immutable_delete BEFORE DELETE ON qc_review_run BEGIN SELECT RAISE(ABORT, 'immutable run'); END;
--> statement-breakpoint
CREATE TRIGGER qc_decision_immutable_update BEFORE UPDATE ON qc_review_decision BEGIN SELECT RAISE(ABORT, 'immutable decision'); END;
--> statement-breakpoint
CREATE TRIGGER qc_decision_immutable_delete BEFORE DELETE ON qc_review_decision BEGIN SELECT RAISE(ABORT, 'immutable decision'); END;
--> statement-breakpoint
CREATE TRIGGER qc_approval_immutable_update BEFORE UPDATE ON qc_profile_approval BEGIN SELECT RAISE(ABORT, 'immutable approval'); END;
--> statement-breakpoint
CREATE TRIGGER qc_approval_immutable_delete BEFORE DELETE ON qc_profile_approval BEGIN SELECT RAISE(ABORT, 'immutable approval'); END;
-- Insert guards execute inside the same D1 batch as the record and its audit event.
--> statement-breakpoint
CREATE TRIGGER qc_profile_member BEFORE INSERT ON qc_profile_version BEGIN
 SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM project_member pm JOIN project p ON p.id=pm.project_id WHERE p.id=NEW.project_id AND p.status='active' AND pm.user_id=NEW.actor_id AND pm.role IN ('workspace_admin','project_owner','reviewer')) THEN RAISE(ABORT,'QC_PERMISSION_CHANGED') END;
END;
--> statement-breakpoint
CREATE TRIGGER qc_mapping_member BEFORE INSERT ON qc_mapping_version BEGIN
 SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM project_member pm JOIN project p ON p.id=pm.project_id JOIN review_case rc ON rc.project_id=p.id WHERE p.id=NEW.project_id AND p.status='active' AND rc.id=NEW.case_id AND rc.status<>'archived' AND rc.discipline='FIN' AND pm.user_id=NEW.actor_id AND pm.role IN ('workspace_admin','project_owner','reviewer')) THEN RAISE(ABORT,'QC_PERMISSION_CHANGED') END;
 SELECT CASE WHEN NEW.base_id<>COALESCE((SELECT id FROM qc_mapping_version WHERE project_id=NEW.project_id AND case_id=NEW.case_id ORDER BY rowid DESC LIMIT 1),'initial') THEN RAISE(ABORT,'MAPPING_CONFLICT') END;
END;
--> statement-breakpoint
CREATE TRIGGER qc_run_member BEFORE INSERT ON qc_review_run BEGIN
 SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM project_member pm JOIN project p ON p.id=pm.project_id JOIN review_case rc ON rc.project_id=p.id WHERE p.id=NEW.project_id AND p.status='active' AND rc.id=NEW.case_id AND rc.status<>'archived' AND rc.discipline='FIN' AND pm.user_id=NEW.actor_id AND pm.role IN ('workspace_admin','project_owner','reviewer')) THEN RAISE(ABORT,'QC_PERMISSION_CHANGED') END;
 SELECT CASE WHEN NEW.trial=0 AND NOT EXISTS (SELECT 1 FROM qc_profile_approval WHERE profile_id=NEW.profile_id AND project_id=NEW.project_id) THEN RAISE(ABORT,'PROFILE_NOT_APPROVED') END;
END;
--> statement-breakpoint
CREATE TRIGGER qc_approval_member BEFORE INSERT ON qc_profile_approval BEGIN
 SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM project_member pm JOIN project p ON p.id=pm.project_id WHERE p.id=NEW.project_id AND p.status='active' AND pm.user_id=NEW.actor_id AND pm.role IN ('workspace_admin','project_owner','approver')) THEN RAISE(ABORT,'QC_PERMISSION_CHANGED') END;
 SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM qc_review_run WHERE id=NEW.trial_run_id AND project_id=NEW.project_id AND profile_id=NEW.profile_id AND trial=1) THEN RAISE(ABORT,'TRIAL_REQUIRED') END;
END;
--> statement-breakpoint
CREATE TRIGGER qc_decision_member BEFORE INSERT ON qc_review_decision BEGIN
 SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM project_member pm JOIN project p ON p.id=pm.project_id JOIN qc_review_run r ON r.project_id=p.id JOIN review_case rc ON rc.id=r.case_id AND rc.project_id=p.id WHERE p.id=NEW.project_id AND p.status='active' AND r.id=NEW.run_id AND r.trial=0 AND rc.status<>'archived' AND pm.user_id=NEW.actor_id AND pm.role IN ('workspace_admin','project_owner','reviewer','approver')) THEN RAISE(ABORT,'QC_PERMISSION_CHANGED') END;
END;
