import { relations, sql } from "drizzle-orm";
import { integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { v7 as uuidv7 } from "uuid";

export const users = sqliteTable(
  "users",
  {
    id: text("id").notNull().$defaultFn(uuidv7).primaryKey(),
    githubId: text("github_id").notNull(),
    login: text("login").notNull(),
    name: text("name"),
    email: text("email"),
    avatarUrl: text("avatar_url"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    lastLoginAt: text("last_login_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    isCreator: integer("is_creator", { mode: "boolean" }).notNull().default(false),
  },
  (table) => ({
    githubIdIdx: uniqueIndex("users_github_id_unique").on(table.githubId),
    emailIdx: uniqueIndex("users_email_unique").on(table.email),
  }),
);

export const uploads = sqliteTable("uploads", {
  id: text("id").notNull().$defaultFn(uuidv7).primaryKey(),
  key: text("key").notNull(),
  eTag: text("etag").notNull(),
  userId: text("user_id").references(() => users.id, {
    onDelete: "set null",
    onUpdate: "cascade",
  }),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const articles = sqliteTable("articles", {
  id: text("id").notNull().$defaultFn(uuidv7).primaryKey(),
  title: text("title"),
  text: text("text").notNull(),
  userId: text("user_id").notNull().references(() => users.id, {
    onDelete: "cascade",
    onUpdate: "cascade",
  }),
  isPublic: integer("is_public", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const articleThumbnailImages = sqliteTable(
  "article_thumbnail_images",
  {
    articleId: text("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade", onUpdate: "cascade" }),
    uploadId: text("upload_id")
      .notNull()
      .references(() => uploads.id, { onDelete: "cascade", onUpdate: "cascade" }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.articleId] }),
    uploadUnique: uniqueIndex("article_thumbnail_upload_unique").on(table.uploadId),
  }),
);

export const articleMediaAssets = sqliteTable(
  "article_media_assets",
  {
    articleId: text("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade", onUpdate: "cascade" }),
    uploadId: text("upload_id")
      .notNull()
      .references(() => uploads.id, { onDelete: "cascade", onUpdate: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.articleId, table.uploadId] }),
  ],
);

export const articleSourceAssets = sqliteTable(
  "article_source_assets",
  {
    articleId: text("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade", onUpdate: "cascade" }),
    uploadId: text("upload_id")
      .notNull()
      .references(() => uploads.id, { onDelete: "cascade", onUpdate: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.articleId, table.uploadId] }),
  ]
);

export type Upload = typeof uploads.$inferSelect;
export type NewUpload = typeof uploads.$inferInsert;
export type Article = typeof articles.$inferSelect;
export type NewArticle = typeof articles.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export const uploadsRelations = relations(uploads, ({ one, many }) => ({
  owner: one(users, {
    fields: [uploads.userId],
    references: [users.id],
  }),
  thumbnailLinks: many(articleThumbnailImages),
  mediaLinks: many(articleMediaAssets),
  sourceLinks: many(articleSourceAssets),
}));

export const articleThumbnailImagesRelations = relations(articleThumbnailImages, ({ one }) => ({
  article: one(articles, {
    fields: [articleThumbnailImages.articleId],
    references: [articles.id],
  }),
  upload: one(uploads, {
    fields: [articleThumbnailImages.uploadId],
    references: [uploads.id],
  }),
}));

export const articleMediaAssetsRelations = relations(articleMediaAssets, ({ one }) => ({
  article: one(articles, {
    fields: [articleMediaAssets.articleId],
    references: [articles.id],
  }),
  upload: one(uploads, {
    fields: [articleMediaAssets.uploadId],
    references: [uploads.id],
  }),
}));

export const articleSourceAssetsRelations = relations(articleSourceAssets, ({ one }) => ({
  article: one(articles, {
    fields: [articleSourceAssets.articleId],
    references: [articles.id],
  }),
  upload: one(uploads, {
    fields: [articleSourceAssets.uploadId],
    references: [uploads.id],
  }),
}));

export const articlesRelations = relations(articles, ({ one, many }) => ({
  author: one(users, {
    fields: [articles.userId],
    references: [users.id],
  }),
  thumbnailImage: one(articleThumbnailImages, {
    fields: [articles.id],
    references: [articleThumbnailImages.articleId],
  }),
  media: many(articleMediaAssets),
  sources: many(articleSourceAssets),
}));