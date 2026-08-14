CREATE TABLE `partner_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`password_hash` text,
	`failed_attempts` integer DEFAULT 0 NOT NULL,
	`locked_until` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`last_login_at` text
);
--> statement-breakpoint
CREATE TABLE `partner_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`partner_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `partner_accounts` (`id`, `display_name`) VALUES ('mclovin', 'McLovin');
--> statement-breakpoint
INSERT INTO `partner_accounts` (`id`, `display_name`) VALUES ('casual', 'Casual');
