PRAGMA foreign_keys=OFF;--> statement-breakpoint
INSERT INTO `users` ("id", "github_id", "login", "name", "email", "avatar_url")
SELECT 'legacy-user', 'legacy-user', 'legacy-user', 'Legacy User', NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM `users` WHERE `id` = 'legacy-user');
--> statement-breakpoint
CREATE TABLE `__new_articles` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text,
	`text` text NOT NULL,
	`user_id` text NOT NULL,
	`is_public` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_articles`("id", "title", "text", "user_id", "is_public", "created_at", "updated_at") SELECT "id", "title", "text", 'legacy-user', "is_public", "created_at", "updated_at" FROM `articles`;--> statement-breakpoint
DROP TABLE `articles`;--> statement-breakpoint
ALTER TABLE `__new_articles` RENAME TO `articles`;--> statement-breakpoint
CREATE TABLE `__new_uploads` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`etag` text NOT NULL,
	`user_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE cascade ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_uploads`("id", "key", "etag", "user_id", "created_at") SELECT "id", "key", "etag", NULL, "created_at" FROM `uploads`;--> statement-breakpoint
DROP TABLE `uploads`;--> statement-breakpoint
ALTER TABLE `__new_uploads` RENAME TO `uploads`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `article_media_assets` (
	`article_id` text NOT NULL,
	`upload_id` text NOT NULL,
	PRIMARY KEY(`article_id`, `upload_id`),
	FOREIGN KEY (`article_id`) REFERENCES `articles`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`upload_id`) REFERENCES `uploads`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `article_source_assets` (
	`article_id` text NOT NULL,
	`upload_id` text NOT NULL,
	PRIMARY KEY(`article_id`, `upload_id`),
	FOREIGN KEY (`article_id`) REFERENCES `articles`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`upload_id`) REFERENCES `uploads`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `article_thumbnail_images` (
	`article_id` text PRIMARY KEY NOT NULL,
	`upload_id` text NOT NULL,
	FOREIGN KEY (`article_id`) REFERENCES `articles`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`upload_id`) REFERENCES `uploads`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `article_thumbnail_upload_unique` ON `article_thumbnail_images` (`upload_id`);