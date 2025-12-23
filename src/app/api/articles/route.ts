import { and, desc, eq, inArray, lt, type SQL } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { getDb } from "@/db/client";
import {
  articleMediaAssets,
  articleSourceAssets,
  articleThumbnailImages,
  articles,
  uploads,
} from "@/db/schema";
import { serializeArticle, type ArticleResponsePayload } from "@/lib/articles";
import { getSessionUser, type SessionUser } from "@/lib/session";
import { getImageStream, getUploadById, uploadImage } from "@/lib/storage";
import { getCloudflareContext } from "@opennextjs/cloudflare";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
const MAX_MEDIA_UPLOADS = 12;
const MAX_SOURCE_UPLOADS = 8;
const THUMBNAIL_TARGET_EDGE = 500;

export async function GET(request: NextRequest) {
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
    with: {
      thumbnailImage: {
        with: { upload: true },
      },
      media: {
        with: { upload: true },
      },
    },
  });

  const data: ArticleResponsePayload[] = rows.map((article) => serializeArticle(article));

  const nextAfterId = rows.length === pageSize ? rows[rows.length - 1].id : null;

  return NextResponse.json({
    data,
    pageInfo: {
      nextAfterId,
      hasMore: nextAfterId !== null,
    },
  });
}

type CreateArticleBody = {
  text?: string;
  title?: string;
  mediaId?: string[];
  sourcesId?: Array<string | null>;
};

type SanitizedCreateArticle = {
  text: string;
  title: string | null;
  mediaUploadIds: string[];
  sourceUploadIds: string[];
};

export async function POST(request: NextRequest) {
  const env = getCloudflareContext().env;
  const user = await getSessionUser(request, env);
  if (!user) {
    return NextResponse.json({ error: "Sign in to save a story." }, { status: 401 });
  }

  let payload: CreateArticleBody;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const validation = validateCreateBody(payload);
  if (!validation.success) {
    return NextResponse.json({ error: validation.message }, { status: validation.status });
  }

  const { text, title, mediaUploadIds, sourceUploadIds } = validation.value;

  // Disable ownership check for now
  // const ownership = await ensureUploadsOwnedByUser(env, [...mediaUploadIds, ...sourceUploadIds], user.id);
  // if (!ownership.success) {
  //   return NextResponse.json({ error: ownership.message }, { status: ownership.status });
  // }

  const thumbnailUpload = await createThumbnailFromMedia(mediaUploadIds[0], user);

  const db = getDb(env);
  let articleId: string | null = null;

  try {
    const created = await db
      .insert(articles)
      .values({ text, title, userId: user.id, isPublic: false })
      .returning({ id: articles.id })
      .get();

    articleId = created.id;

    const insertOperations: Promise<unknown>[] = [
      db
        .insert(articleThumbnailImages)
        .values({ articleId: created.id, uploadId: thumbnailUpload.id })
        .run(),
    ];

    if (mediaUploadIds.length) {
      const mediaValues = mediaUploadIds.map((uploadId) => ({ articleId: created.id, uploadId }));
      insertOperations.push(db.insert(articleMediaAssets).values(mediaValues).run());
    }

    if (sourceUploadIds.length) {
      const sourceValues = sourceUploadIds.map((uploadId) => ({ articleId: created.id, uploadId }));
      insertOperations.push(db.insert(articleSourceAssets).values(sourceValues).run());
    }

    await Promise.all(insertOperations);
  } catch (error) {
    if (articleId) {
      await db.delete(articles).where(eq(articles.id, articleId)).run();
    }
    const message = error instanceof Error ? error.message : "Unable to save article.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  if (!articleId) {
    return NextResponse.json({ error: "Unable to save article." }, { status: 500 });
  }

  const article = await db.query.articles.findFirst({
    where: eq(articles.id, articleId),
    with: {
      thumbnailImage: { with: { upload: true } },
      media: { with: { upload: true } },
      sources: { with: { upload: true } },
    },
  });

  if (!article) {
    return NextResponse.json({ error: "Article not found after creation." }, { status: 500 });
  }

  return NextResponse.json(
    { data: serializeArticle(article, { viewerCanEdit: true }) },
    { status: 201 },
  );
}

function clampPageSize(rawLimit: string | null) {
  const parsed = Number(rawLimit);
  if (Number.isFinite(parsed)) {
    return Math.min(Math.max(Math.trunc(parsed), 1), MAX_PAGE_SIZE);
  }
  return DEFAULT_PAGE_SIZE;
}

function validateCreateBody(
  body: CreateArticleBody,
):
  | { success: true; value: SanitizedCreateArticle }
  | { success: false; message: string; status: number } {
  if (!body || typeof body !== "object") {
    return { success: false, message: "Invalid JSON payload.", status: 400 };
  }

  const textValue = typeof body.text === "string" ? body.text.trim() : "";
  if (!textValue) {
    return { success: false, message: "Field 'text' is required.", status: 400 };
  }

  const mediaUploadIds = extractUploadIds(body.mediaId);
  if (!mediaUploadIds.length) {
    return { success: false, message: "Provide at least one media upload.", status: 400 };
  }
  if (mediaUploadIds.length > MAX_MEDIA_UPLOADS) {
    return {
      success: false,
      message: `A maximum of ${MAX_MEDIA_UPLOADS} media uploads is supported.`,
      status: 400,
    };
  }

  const sourceUploadIds = extractUploadIds(body.sourcesId ?? []);
  if (sourceUploadIds.length > MAX_SOURCE_UPLOADS) {
    return {
      success: false,
      message: `A maximum of ${MAX_SOURCE_UPLOADS} source uploads is supported.`,
      status: 400,
    };
  }

  const title = typeof body.title === "string" ? body.title.trim() : null;

  return {
    success: true,
    value: {
      text: textValue,
      title: title || null,
      mediaUploadIds,
      sourceUploadIds,
    },
  };
}

function extractUploadIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const collected = raw
    .map((entry) => {
      if (typeof entry === "string") {
        return entry.trim();
      }
      if (entry && typeof entry === "object" && "id" in entry) {
        const value = (entry as { id?: string | null }).id;
        return typeof value === "string" ? value.trim() : "";
      }
      return "";
    })
    .filter((id) => Boolean(id));

  return Array.from(new Set(collected));
}

async function ensureUploadsOwnedByUser(
  env: ReturnType<typeof getCloudflareContext>["env"],
  uploadIds: string[],
  userId: string,
) {
  const uniqueIds = Array.from(new Set(uploadIds));

  if (!uniqueIds.length) {
    return { success: true } as const;
  }

  const db = getDb(env);
  const rows = await db
    .select({ id: uploads.id, userId: uploads.userId })
    .from(uploads)
    .where(inArray(uploads.id, uniqueIds));

  if (rows.length !== uniqueIds.length) {
    return {
      success: false,
      status: 404 as const,
      message: "One or more uploads are missing.",
    } as const;
  }

  const unauthorized = rows.find((row) => row.userId !== userId);
  if (unauthorized) {
    return {
      success: false,
      status: 403 as const,
      message: "One or more uploads are unavailable.",
    } as const;
  }

  return { success: true } as const;
}

async function createThumbnailFromMedia(uploadId: string, user: SessionUser) {
  const env = getCloudflareContext().env;
  const upload = await getUploadById(uploadId);
  const imageBinding = env?.IMAGES;

  if (!upload) {
    throw new Error("Media upload not found.");
  }

  if (!imageBinding) {
    return upload;
  }

  try {
    const originalStream = await getImageStream(upload.key);
    const [infoStream, transformStream] = originalStream.tee();
    const resizeTransform: { width?: number; height?: number; fit: "scale-down" } = {
      fit: "scale-down",
    };

    try {
      const info = await imageBinding.info(infoStream);
      if ("width" in info && "height" in info && info.width > 0 && info.height > 0) {
        if (info.width <= info.height) {
          resizeTransform.width = THUMBNAIL_TARGET_EDGE;
        } else {
          resizeTransform.height = THUMBNAIL_TARGET_EDGE;
        }
      } else {
        resizeTransform.width = THUMBNAIL_TARGET_EDGE;
      }
    } catch (infoError) {
      console.warn("Unable to read image metadata", infoError);
      resizeTransform.width = THUMBNAIL_TARGET_EDGE;
      resizeTransform.height = THUMBNAIL_TARGET_EDGE;
    }

    const transformer = imageBinding.input(transformStream);
    const transformation = await transformer
      .transform(resizeTransform)
      .output({ format: "image/webp", quality: 80 });

    const response = transformation.response();
    const resizedBuffer = Buffer.from(await response.arrayBuffer());
    const mimeType = transformation.contentType() || "image/webp";

    return uploadImage(resizedBuffer, mimeType, user);
  } catch (error) {
    console.error("Unable to transform thumbnail", error);
    return upload;
  }
}
