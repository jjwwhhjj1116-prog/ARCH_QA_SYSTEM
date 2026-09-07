DROP TRIGGER qc_profile_member;
--> statement-breakpoint
CREATE TRIGGER qc_profile_member BEFORE INSERT ON qc_profile_version BEGIN
 SELECT (CASE WHEN NOT EXISTS (SELECT 1 FROM project_member pm JOIN project p ON p.id=pm.project_id WHERE p.id=NEW.project_id AND p.status='active' AND pm.user_id=NEW.actor_id AND pm.role IN ('workspace_admin','project_owner')) THEN RAISE(ABORT,'QC_PERMISSION_CHANGED') END);
END;
--> statement-breakpoint
DROP TRIGGER qc_approval_member;
--> statement-breakpoint
CREATE TRIGGER qc_approval_member BEFORE INSERT ON qc_profile_approval BEGIN
 SELECT (CASE WHEN NOT EXISTS (SELECT 1 FROM project_member pm JOIN project p ON p.id=pm.project_id WHERE p.id=NEW.project_id AND p.status='active' AND pm.user_id=NEW.actor_id AND pm.role IN ('workspace_admin','project_owner')) THEN RAISE(ABORT,'QC_PERMISSION_CHANGED') END);
 SELECT (CASE WHEN NOT EXISTS (SELECT 1 FROM qc_review_run WHERE id=NEW.trial_run_id AND project_id=NEW.project_id AND profile_id=NEW.profile_id AND trial=1) THEN RAISE(ABORT,'TRIAL_REQUIRED') END);
END;
--> statement-breakpoint
CREATE TRIGGER qc_trial_admin BEFORE INSERT ON qc_review_run WHEN NEW.trial=1 BEGIN
 SELECT (CASE WHEN NOT EXISTS (SELECT 1 FROM project_member pm JOIN project p ON p.id=pm.project_id WHERE p.id=NEW.project_id AND p.status='active' AND pm.user_id=NEW.actor_id AND pm.role IN ('workspace_admin','project_owner')) THEN RAISE(ABORT,'QC_PERMISSION_CHANGED') END);
END;
