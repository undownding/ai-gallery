import type { Article, Upload } from "@/db/schema";

export type ArticleAssetPayload = Pick<Upload, "id" | "key" | "eTag" | "createdAt">;

export type ArticleResponsePayload = {
  id: string;
  title: string | null;
  text: string;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  thumbnailImage: ArticleAssetPayload | null;
  media: ArticleAssetPayload[];
  sources: ArticleAssetPayload[];
  viewerCanEdit: boolean;
};

type UploadLink = { upload: Upload | null } | null | undefined;

type ArticleWithAssets = Article & {
  thumbnailImage?: UploadLink;
  media?: UploadLink[];
  sources?: UploadLink[];
};

const isAsset = (value: ArticleAssetPayload | null): value is ArticleAssetPayload => Boolean(value);

function toAsset(link?: UploadLink): ArticleAssetPayload | null {
  if (!link || !link.upload) {
    return null;
  }

  const { id, key, eTag, createdAt } = link.upload;
  return { id, key, eTag, createdAt };
}

export function serializeArticle(
  article: ArticleWithAssets,
  options?: { viewerCanEdit?: boolean },
): ArticleResponsePayload {
  return {
    id: article.id,
    title: article.title ?? null,
    text: article.text,
    isPublic: article.isPublic,
    createdAt: article.createdAt,
    updatedAt: article.updatedAt,
    thumbnailImage: toAsset(article.thumbnailImage),
    media: (article.media ?? []).map((entry) => toAsset(entry)).filter(isAsset),
    sources: (article.sources ?? []).map((entry) => toAsset(entry)).filter(isAsset),
    viewerCanEdit: Boolean(options?.viewerCanEdit),
  };
}
