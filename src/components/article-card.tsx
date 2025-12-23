"use client";
/* eslint-disable @next/next/no-img-element */

import type { ArticleAsset, ArticleRecord } from "@/types/articles";

type ArticleCardProps = {
  article: ArticleRecord;
  onSelect: (articleId: string) => void;
};

export function ArticleCard({ article, onSelect }: ArticleCardProps) {
  const coverSrc = resolveMediaCover(article);

  return (
    <button type="button" className="article-card" onClick={() => onSelect(article.id)}>
      <div className="card-media">
        {coverSrc ? (
          <img src={coverSrc} alt={article.title ?? "Article cover"} loading="lazy" />
        ) : (
          <div className="card-media__placeholder">Awaiting media</div>
        )}
        <span className="card-chip">{formatDate(article.createdAt)}</span>
      </div>
      <div className="flex flex-col gap-2 text-left">
        <h3 className="text-base font-semibold text-[var(--foreground)]">
          {article.title ?? "Untitled story"}
        </h3>
        <p className="line-clamp-3 text-sm text-[var(--muted)]">{article.text}</p>
        <div className="flex items-center justify-between text-xs text-[var(--muted)]">
          <span>{formatShots(article)}</span>
          <span>Open story</span>
        </div>
      </div>
    </button>
  );
}

export function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(
      new Date(value),
    );
  } catch {
    return value;
  }
}

function resolveMediaCover(article: ArticleRecord) {
  const candidate = article.thumbnailImage ?? article.media[0] ?? null;
  return resolveAssetUrl(candidate);
}

function resolveAssetUrl(asset: ArticleAsset | null | undefined) {
  if (!asset?.key) return null;
  if (asset.key.startsWith("http")) return asset.key;
  const publicBase = process.env.NEXT_PUBLIC_R2_PUBLIC_URL;
  if (publicBase) return `${publicBase.replace(/\/$/, "")}/${asset.key}`;
  return `/api/uploads/${encodeURIComponent(asset.key)}`;
}

function formatShots(article: ArticleRecord) {
  const count = article.media.length || (article.thumbnailImage ? 1 : 0);
  return `${count} shot${count === 1 ? "" : "s"}`;
}
