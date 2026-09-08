CREATE TABLE `personal_ai_settings` (
	`subject` text PRIMARY KEY NOT NULL,
	`encrypted_key` text,
	`model` text,
	`version` integer NOT NULL,
	`checked_at` text
);
--> statement-breakpoint
CREATE TABLE `personal_ai_settings_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`subject` text NOT NULL,
	`action` text NOT NULL,
	`version` integer NOT NULL,
	`created_at` text NOT NULL
);
