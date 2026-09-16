CREATE TABLE `qc_drawing_attachment` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`review_case_id` text NOT NULL,
	`filename` text NOT NULL,
	`extension` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`status` text DEFAULT 'upload_pending' NOT NULL,
	`sha256` text,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`idempotency_key` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `user_profile`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`review_case_id`,`project_id`) REFERENCES `review_case`(`id`,`project_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "drawing_size" CHECK("qc_drawing_attachment"."size_bytes" BETWEEN 1 AND 209715200),
	CONSTRAINT "drawing_extension" CHECK("qc_drawing_attachment"."extension" IN ('pdf','dwg','dxf')),
	CONSTRAINT "drawing_status" CHECK("qc_drawing_attachment"."status" IN ('upload_pending','uploaded'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `drawing_actor_idempotency` ON `qc_drawing_attachment` (`project_id`,`review_case_id`,`created_by`,`idempotency_key`);--> statement-breakpoint
CREATE TABLE `qc_drive_upload` (
	`upload_id` text PRIMARY KEY NOT NULL,
	`connection_id` text NOT NULL,
	`file_id` text NOT NULL,
	`expected_sha256` text NOT NULL,
	`encrypted_session` text,
	`acknowledged_bytes` integer DEFAULT 0 NOT NULL,
	`lease` text,
	`lease_expires_at` integer DEFAULT 0 NOT NULL,
	`sha256` text,
	`state` text NOT NULL,
	FOREIGN KEY (`connection_id`) REFERENCES `qc_drive_connection`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "drive_upload_offset" CHECK("qc_drive_upload"."acknowledged_bytes" >= 0),
	CONSTRAINT "drive_upload_hash" CHECK(length("qc_drive_upload"."expected_sha256")=64 AND "qc_drive_upload"."expected_sha256" NOT GLOB '*[^0-9a-f]*'),
	CONSTRAINT "drive_upload_state" CHECK("qc_drive_upload"."state" IN ('uploading','uploaded')),
	CONSTRAINT "drive_upload_complete_hash" CHECK("qc_drive_upload"."state" <> 'uploaded' OR (length("qc_drive_upload"."sha256")=64 AND "qc_drive_upload"."sha256" NOT GLOB '*[^0-9a-f]*' AND "qc_drive_upload"."sha256" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `qc_drive_upload_file_id_unique` ON `qc_drive_upload` (`file_id`);