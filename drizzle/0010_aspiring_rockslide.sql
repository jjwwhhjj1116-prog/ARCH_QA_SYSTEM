CREATE TABLE `qc_drive_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`action` text NOT NULL,
	`connection_id` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `qc_drive_connection` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`client_id` text NOT NULL,
	`encrypted_secret` text NOT NULL,
	`encrypted_refresh` text NOT NULL,
	`folder_id` text NOT NULL,
	`state` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `qc_drive_oauth_state` (
	`state_hash` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`version` integer NOT NULL,
	`encrypted_verifier` text NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `qc_drive_object` (
	`object_key` text PRIMARY KEY NOT NULL,
	`connection_id` text NOT NULL,
	`file_id` text NOT NULL,
	`sha256` text NOT NULL,
	`size` integer NOT NULL,
	`content_type` text NOT NULL,
	`state` text NOT NULL,
	FOREIGN KEY (`connection_id`) REFERENCES `qc_drive_connection`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `qc_drive_object_file_id_unique` ON `qc_drive_object` (`file_id`);--> statement-breakpoint
CREATE TABLE `qc_drive_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`encrypted_secret` text NOT NULL,
	`target_email` text NOT NULL,
	`active_connection` text,
	`version` integer NOT NULL
);
