import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { getDb } from "@/db/client";
import { articles } from "@/db/schema";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const runtime = "edge";

type RouteContext = {
  params: {
    id: string;
  };
};

export async function GET(_request: NextRequest, context: RouteContext) {
  const articleId = context.params?.id;
  if (!articleId) {
    return NextResponse.json({ error: "Missing article id." }, { status: 400 });
  }

  const db = getDb(getCloudflareContext().env);

  const rows = await db
    .select({
      id: articles.id,
      title: articles.title,
      text: articles.text,
      media: articles.media,
      previewImageId: articles.previewImageId,
      createdAt: articles.createdAt,
      updatedAt: articles.updatedAt,
    })
    .from(articles)
    .where(and(eq(articles.id, articleId), eq(articles.isPublic, true)))
    .limit(1);

  const article = rows[0];

  if (!article) {
    return NextResponse.json({ error: "Article not found." }, { status: 404 });
  }

  return NextResponse.json({ data: article });
}
