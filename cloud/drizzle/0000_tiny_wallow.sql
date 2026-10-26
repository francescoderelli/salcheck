CREATE TABLE `audit` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`at` text NOT NULL,
	`actor` text NOT NULL,
	`event` text NOT NULL,
	`record_key` text NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `comparisons` (
	`import_id` text NOT NULL,
	`key` text NOT NULL,
	`ra` text NOT NULL,
	`data` text NOT NULL,
	PRIMARY KEY(`import_id`, `key`)
);
--> statement-breakpoint
CREATE INDEX `comparison_ra` ON `comparisons` (`ra`);--> statement-breakpoint
CREATE TABLE `current_rows` (
	`key` text PRIMARY KEY NOT NULL,
	`ra` text NOT NULL,
	`data` text NOT NULL,
	`import_id` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `current_ra` ON `current_rows` (`ra`);--> statement-breakpoint
CREATE TABLE `declarations` (
	`key` text PRIMARY KEY NOT NULL,
	`ra` text NOT NULL,
	`data` text NOT NULL,
	`version` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `declaration_ra` ON `declarations` (`ra`);--> statement-breakpoint
CREATE TABLE `mutation_guard` (
	`id` text PRIMARY KEY NOT NULL,
	`valid` integer NOT NULL,
	CONSTRAINT "guard_valid" CHECK("mutation_guard"."valid"=1)
);
--> statement-breakpoint
CREATE TABLE `imports` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`owner` text NOT NULL,
	`created_at` text NOT NULL,
	`committed_at` text,
	`expected` integer NOT NULL,
	`base_revision` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`hash` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`owner_id` text,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `staged` (
	`import_id` text NOT NULL,
	`key` text NOT NULL,
	`ra` text NOT NULL,
	`data` text NOT NULL,
	PRIMARY KEY(`import_id`, `key`)
);
--> statement-breakpoint
CREATE TABLE `state` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
