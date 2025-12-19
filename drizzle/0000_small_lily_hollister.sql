CREATE TABLE `articles` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`text` text NOT NULL,
	`is_public` integer DEFAULT false NOT NULL,
	`preview_image_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `uploads` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`etag` text NOT NULL,
	`article_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE `articles`
ADD CONSTRAINT `articles_preview_image_id_uploads_id_fk`
FOREIGN KEY (`preview_image_id`) REFERENCES `uploads`(`id`) ON UPDATE cascade ON DELETE set null;
--> statement-breakpoint
ALTER TABLE `uploads`
ADD CONSTRAINT `uploads_article_id_articles_id_fk`
FOREIGN KEY (`article_id`) REFERENCES `articles`(`id`) ON UPDATE cascade ON DELETE set null;
