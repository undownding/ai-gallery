CREATE TABLE `uploads` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`etag` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `articles` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`text` text NOT NULL,
	`is_public` integer DEFAULT false NOT NULL,
	`preview_image_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`preview_image_id`) REFERENCES `uploads`(`id`) ON UPDATE cascade ON DELETE set null
);
--> statement-breakpoint
ALTER TABLE `uploads`
ADD COLUMN `article_id` text REFERENCES `articles`(`id`) ON UPDATE cascade ON DELETE set null;
