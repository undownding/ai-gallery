import { and, desc, eq, lt, type SQL } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { getDb, type EnvWithDb } from "@/db/client";
import { articles } from "@/db/schema";
import {getCloudflareContext} from "@opennextjs/cloudflare"

export const runtime = "edge";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

type RouteContext = {
  env: EnvWithDb;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const searchParams = request.nextUrl.searchParams;
  const afterId = searchParams.get("afterId");
  const pageSize = clampPageSize(searchParams.get("limit"));
  const db = getDb(getCloudflareContext().env);

  let visibilityFilter: SQL | undefined = eq(articles.isPublic, true);
  if (afterId) {
    visibilityFilter = and(visibilityFilter, lt(articles.id, afterId));
  }

    const rows = await db.query.articles.findMany({
        where: visibilityFilter,
        orderBy: [desc(articles.id)],
        limit: pageSize,
    })

  const nextAfterId = rows.length === pageSize ? rows[rows.length - 1].id : null;

  return NextResponse.json({
    data: rows,
    pageInfo: {
      nextAfterId,
      hasMore: nextAfterId !== null,
    },
  });
}

function clampPageSize(rawLimit: string | null) {
  const parsed = Number(rawLimit);
  if (Number.isFinite(parsed)) {
    return Math.min(Math.max(Math.trunc(parsed), 1), MAX_PAGE_SIZE);
  }
  return DEFAULT_PAGE_SIZE;
}
