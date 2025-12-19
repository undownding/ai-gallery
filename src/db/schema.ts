import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { v7 as uuidv7 } from "uuid";

export const uploads = sqliteTable("uploads", {
  id: text("id").notNull().$defaultFn(uuidv7).primaryKey(),
  key: text("key").notNull(),
  eTag: text("etag").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export type Upload = typeof uploads.$inferSelect;
export type NewUpload = typeof uploads.$inferInsert;

export const articles = sqliteTable("articles", {
  id: text("id").notNull().$defaultFn(uuidv7).primaryKey(),
  title: text("title").notNull(),
  text: text("text").notNull(),
  media: text("media", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
  isPublic: integer("is_public", { mode: "boolean" }).notNull().default(false),
  previewImageId: text("preview_image_id").references(() => uploads.id, {
    onDelete: "set null",
    onUpdate: "cascade",
  }),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export type Article = typeof articles.$inferSelect;
export type NewArticle = typeof articles.$inferInsert;
