import {and, eq} from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { getDb } from "@/db/client";
import { articles } from "@/db/schema";
import { serializeArticle } from "@/lib/articles";
import { getCloudflareContext } from "@opennextjs/cloudflare";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  const { id: articleId } = await (context.params)
  if (!articleId) {
    return NextResponse.json({ error: "Missing article id." }, { status: 400 });
  }

  const db = getDb(getCloudflareContext().env);

    const rows = await db.query.articles.findMany({
      where: and(eq(articles.id, articleId), eq(articles.isPublic, true)),
      with: {
        thumbnailImage: {
          with: { upload: true },
        },
        media: {
          with: { upload: true },
        },
        sources: {
          with: { upload: true },
        },
      },
    })

  const article = rows[0];

  if (!article) {
    return NextResponse.json({ error: "Article not found." }, { status: 404 });
  }

    return NextResponse.json({ data: serializeArticle(article) });
}
