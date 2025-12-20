import { eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { getDb } from "@/db/client";
import { articles } from "@/db/schema";
import { serializeArticle } from "@/lib/articles";
import { getSessionUser } from "@/lib/session";
import { getCloudflareContext } from "@opennextjs/cloudflare";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const { id: articleId } = await (context.params)
  if (!articleId) {
    return NextResponse.json({ error: "Missing article id." }, { status: 400 });
  }

  const env = getCloudflareContext().env;
  const db = getDb(env);
  const user = await getSessionUser(request, env);

  const article = await db.query.articles.findFirst({
    where: eq(articles.id, articleId),
    with: {
      author: true,
      thumbnailImage: { with: { upload: true } },
      media: { with: { upload: true } },
      sources: { with: { upload: true } },
    },
  });

  if (!article) {
    return NextResponse.json({ error: "Article not found." }, { status: 404 });
  }

  const viewerIsOwner = Boolean(user && user.id === article.userId);

  if (!article.isPublic && !viewerIsOwner) {
    return NextResponse.json({ error: "Article not found." }, { status: 404 });
  }

  return NextResponse.json({ data: serializeArticle(article, { viewerCanEdit: viewerIsOwner }) });
}

type UpdateArticleBody = {
  isPublic?: boolean;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id: articleId } = await context.params;
  if (!articleId) {
    return NextResponse.json({ error: "Missing article id." }, { status: 400 });
  }

  const env = getCloudflareContext().env;
  const user = await getSessionUser(request, env);
  if (!user) {
    return NextResponse.json({ error: "Sign in to update this article." }, { status: 401 });
  }

  let payload: UpdateArticleBody;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  if (typeof payload.isPublic !== "boolean") {
    return NextResponse.json({ error: "Field 'isPublic' must be a boolean." }, { status: 400 });
  }

  const db = getDb(env);
  const existing = await db.query.articles.findFirst({ where: eq(articles.id, articleId) });
  if (!existing) {
    return NextResponse.json({ error: "Article not found." }, { status: 404 });
  }

  if (existing.userId !== user.id) {
    return NextResponse.json({ error: "You do not have permission to update this article." }, { status: 403 });
  }

  await db
    .update(articles)
    .set({ isPublic: payload.isPublic, updatedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(articles.id, articleId))
    .run();

  const article = await db.query.articles.findFirst({
    where: eq(articles.id, articleId),
    with: {
      author: true,
      thumbnailImage: { with: { upload: true } },
      media: { with: { upload: true } },
      sources: { with: { upload: true } },
    },
  });

  if (!article) {
    return NextResponse.json({ error: "Article not found." }, { status: 404 });
  }

  return NextResponse.json({ data: serializeArticle(article, { viewerCanEdit: true }) });
}
