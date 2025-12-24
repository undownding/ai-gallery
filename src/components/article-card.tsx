"use client";
/* eslint-disable @next/next/no-img-element */

import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import type { ArticleAsset, ArticleRecord } from "@/types/articles";

dayjs.extend(relativeTime);

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
      <div className="flex flex-1 flex-col gap-2 text-left">
        <div className="flex flex-col gap-2">
          <h3 className="text-base font-semibold text-foreground">
            {article.title ?? "Untitled story"}
          </h3>
          <p className="line-clamp-3 text-sm text-(--muted)">{article.text}</p>
        </div>
        <div className="mt-auto flex items-center justify-between text-xs text-(--muted)">
          <span>{dayjs(article.createdAt).fromNow()}</span>
          <div className="flex items-center gap-2">
            {article.author?.avatarUrl ? (
              <img
                src={article.author.avatarUrl}
                alt={article.author.name ?? article.author.login}
                className="h-5 w-5 rounded-full"
              />
            ) : (
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--muted)] text-[10px] font-semibold text-[var(--background)]">
                {(article.author?.name ?? article.author?.login ?? "?").slice(0, 1).toUpperCase()}
              </div>
            )}
            <span>{article.author?.name ?? article.author?.login ?? "Anonymous"}</span>
          </div>
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
  const candidate = article.thumbnail ?? article.media?.[0] ?? null;
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
  const mediaCount = article.media?.length ?? 0;
  const count = mediaCount || (article.thumbnail ? 1 : 0);
  return `${count} shot${count === 1 ? "" : "s"}`;
}
