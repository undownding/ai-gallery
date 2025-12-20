"use client";
/* eslint-disable @next/next/no-img-element */

import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

import { AuthStatus } from "@/components/auth-status";
import { ThemeToggle, useThemePreference } from "@/components/theme-toggle";
import { useArticleDetail } from "@/hooks/use-article-detail";
import type { ArticleAssetPayload, ArticleResponsePayload } from "@/lib/articles";
import { safeReadError } from "@/lib/http";
import { resolveUploadUrl } from "@/lib/uploads-client";

type ArticleAsset = ArticleAssetPayload;
type UpdateMessage = { type: "success" | "error"; text: string } | null;

type PageParams = {
  params: Promise<{
    id: string;
  }>;
};

export default function ArticleDetailPage({ params }: PageParams) {
  const { article, setArticle, articleId, loading, error, reload } = useArticleDetail(params);
  const [updatingVisibility, setUpdatingVisibility] = useState(false);
  const [updateMessage, setUpdateMessage] = useState<UpdateMessage>(null);
  const [themeMode, setThemeMode] = useThemePreference();

  const pathname = usePathname();
  const router = useRouter();

  const galleryAssets = useMemo(() => {
    if (!article) return [] as ArticleAsset[];
    if (article.media.length) return article.media;
    return article.thumbnailImage ? [article.thumbnailImage] : [];
  }, [article]);

  const sourceAssets = article?.sources ?? [];

  const statusLabel = article
    ? article.isPublic
      ? "Public on gallery"
      : "Private draft"
    : "Loading status…";

  const shotsCount = galleryAssets.length;
  const metadata = useMemo(
    () => ({
      created: article ? formatDate(article.createdAt) : "—",
      updated: article ? formatDate(article.updatedAt) : "—",
    }),
    [article],
  );

  const viewerCanEdit = article?.viewerCanEdit ?? false;
  const redirectTarget = pathname ?? (articleId ? `/articles/${articleId}` : "/");
  const promptHref = articleId ? `/articles/${articleId}/prompt` : null;
  const promptIsLong = (article?.text?.length ?? 0) > 320;

  const handleVisibilityToggle = useCallback(async () => {
    if (!article || !article.viewerCanEdit) return;
    setUpdatingVisibility(true);
    setUpdateMessage(null);
    try {
      const response = await fetch(`/api/articles/${article.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublic: !article.isPublic }),
      });
      if (!response.ok) {
        const message = (await safeReadError(response)) ?? "Unable to update article.";
        throw new Error(message);
      }
      const payload = (await response.json()) as { data: ArticleResponsePayload };
      setArticle(payload.data);
      setUpdateMessage({
        type: "success",
        text: payload.data.isPublic ? "Story is now public." : "Story hidden from the gallery.",
      });
    } catch (issue) {
      setUpdateMessage({
        type: "error",
        text: issue instanceof Error ? issue.message : "Unable to update article.",
      });
    } finally {
      setUpdatingVisibility(false);
    }
  }, [article, setArticle]);

  const handlePromptNavigate = useCallback(() => {
    if (!promptHref) return;
    router.push(promptHref);
  }, [promptHref, router]);

  const handleRetry = useCallback(() => {
    setUpdateMessage(null);
    reload();
  }, [reload]);

  return (
    <div className="app-shell px-4 pb-20 pt-10 sm:px-6 lg:px-12">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10">
        <header className="rounded-[40px] border border-[var(--border)] bg-[var(--surface)]/95 p-8 shadow-soft ring-1 ring-white/5">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="space-y-4">
              <button
                type="button"
                onClick={() => router.push("/")}
                className="text-[11px] font-semibold uppercase tracking-[0.35em] text-[var(--muted)] transition hover:text-[var(--accent)]"
              >
                Back to feed
              </button>
              <p className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] px-4 py-1 text-[10px] uppercase tracking-[0.4em] text-[var(--muted)]">
                灵感胶囊 · Xiaohongshu 布局
              </p>
              <h1 className="text-4xl font-serif text-[var(--foreground)] sm:text-5xl">
                {article?.title ?? "Untitled story"}
              </h1>
              <p className="text-sm text-[var(--muted)]">{statusLabel}</p>
            </div>
            <div className="flex flex-col items-end gap-3 sm:flex-row sm:items-center sm:gap-4">
              <ThemeToggle mode={themeMode} onChange={setThemeMode} />
              <AuthStatus redirectTo={redirectTarget} />
            </div>
          </div>
          <div className="mt-8 grid gap-4 text-sm sm:grid-cols-3">
            <DetailStat label="Shots" value={shotsCount} />
            <DetailStat label="Created" value={metadata.created} />
            <DetailStat label="Last updated" value={metadata.updated} />
          </div>
        </header>

        {loading ? (
          <div className="rounded-[32px] border border-[var(--border)] bg-[var(--surface)]/90 p-8 text-center text-sm text-[var(--muted)]">
            Loading article…
          </div>
        ) : error ? (
          <div className="space-y-4 rounded-[32px] border border-[var(--border)] bg-[var(--surface)]/90 p-8 text-center text-sm text-[var(--muted)]">
            <p>{error}</p>
            <button
              type="button"
              onClick={handleRetry}
              className="rounded-full border border-[var(--border)] px-5 py-2 text-xs font-semibold text-[var(--foreground)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              Retry
            </button>
          </div>
        ) : article ? (
          <section className="grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
            <MediaShowcase assets={galleryAssets} title={article.title} />
            <div className="space-y-8 rounded-[36px] border border-[var(--border)] bg-[var(--surface)]/90 p-8 shadow-soft">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <AuthorBadge author={article.author} createdAt={metadata.created} />
                <div className="text-right text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
                  <p>Story status</p>
                  <p className="text-base font-semibold text-[var(--foreground)]">{statusLabel}</p>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-[11px] uppercase tracking-[0.4em] text-[var(--muted)]">Prompt 摘要</p>
                <h2 className="text-3xl font-semibold text-[var(--foreground)]">
                  {article.title ?? "无标题灵感"}
                </h2>
                <div className={`relative text-base leading-relaxed text-[var(--foreground)] ${
                  promptIsLong ? "max-h-72 overflow-hidden pr-4" : ""
                }`}>
                  <p>{article.text}</p>
                  {promptIsLong && (
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[var(--surface)] via-[var(--surface)]/80 to-transparent" />
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-xs uppercase tracking-[0.35em] text-[var(--muted)]">深入阅读</p>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={handlePromptNavigate}
                    disabled={!promptHref}
                    className="rounded-full bg-[var(--foreground)] px-6 py-3 text-sm font-semibold text-[var(--background)] shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    查看详情
                  </button>
                  {viewerCanEdit ? (
                    <button
                      type="button"
                      onClick={handleVisibilityToggle}
                      disabled={updatingVisibility}
                      className="rounded-full border border-[var(--border)] px-6 py-3 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {updatingVisibility
                        ? "Updating…"
                        : article.isPublic
                          ? "Hide from gallery"
                          : "Publish to gallery"}
                    </button>
                  ) : (
                    <p className="text-xs text-[var(--muted)]">Sign in as the author to publish this story.</p>
                  )}
                </div>
                <p className="text-xs text-[var(--muted)]">在新页面完整查看 prompt 文本与引用 source</p>
                {updateMessage && (
                  <p
                    className={`text-sm ${
                      updateMessage.type === "success" ? "text-emerald-500" : "text-[var(--accent)]"
                    }`}
                  >
                    {updateMessage.text}
                  </p>
                )}
              </div>

              <SourcePeek assets={sourceAssets} />
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function DetailStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)]/80 p-4 text-[var(--foreground)]">
      <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">{label}</p>
      <p className="text-2xl font-semibold">{value}</p>
    </div>
  );
}

function MediaShowcase({ assets, title }: { assets: ArticleAsset[]; title: string | null }) {
  const hasMedia = assets.length > 0;
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!hasMedia) return;
    const node = listRef.current;
    if (!node) return;
    const handleScroll = () => {
      if (!node) return;
      const width = node.clientWidth || 1;
      const next = Math.round(node.scrollLeft / width);
      setActiveIndex((prev) => (next === prev ? prev : Math.max(0, Math.min(assets.length - 1, next))));
    };
    node.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      node.removeEventListener("scroll", handleScroll);
    };
  }, [assets.length, hasMedia]);

  useEffect(() => {
    if (!hasMedia) return;
    setActiveIndex((prev) => Math.min(prev, assets.length - 1));
  }, [assets.length, hasMedia]);

  const scrollToIndex = useCallback(
    (index: number) => {
      if (!listRef.current) return;
      const width = listRef.current.clientWidth;
      listRef.current.scrollTo({ left: index * width, behavior: "smooth" });
    },
    [],
  );

  const handleNavigate = useCallback(
    (direction: -1 | 1) => {
      if (!hasMedia) return;
      const next = (activeIndex + direction + assets.length) % assets.length;
      scrollToIndex(next);
      setActiveIndex(next);
    },
    [activeIndex, assets.length, hasMedia, scrollToIndex],
  );

  const baseClasses =
    "relative rounded-[40px] border border-[var(--border)] bg-[var(--surface)]/90 p-4 shadow-soft";

  if (!hasMedia) {
    return (
      <div className={`${baseClasses} flex min-h-[420px] items-center justify-center text-center`}>
        <div className="space-y-2">
          <p className="text-sm font-semibold text-[var(--foreground)]">暂时没有配图</p>
          <p className="text-xs text-[var(--muted)]">上传媒体后，这里会展示可横向滑动的灵感画面</p>
        </div>
      </div>
    );
  }

  return (
    <div className={baseClasses}>
      <div
        ref={listRef}
        className="flex snap-x snap-mandatory overflow-x-auto rounded-[32px] bg-[var(--background)]/30"
        style={{ scrollSnapType: "x mandatory" }}
      >
        {assets.map((asset, index) => {
          const src = resolveUploadUrl(asset.key);
          if (!src) return null;
          return (
            <div key={asset.id} className="relative min-w-full snap-center px-2 py-1">
              <img
                src={src}
                alt={title ?? "Article media"}
                className="h-[520px] w-full rounded-[32px] object-cover"
              />
              <span className="absolute left-8 top-8 rounded-full bg-black/50 px-4 py-1 text-xs font-semibold text-white">
                {index + 1} / {assets.length}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <p className="text-xs uppercase tracking-[0.35em] text-[var(--muted)]">左右滑动 · 媒体集</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => handleNavigate(-1)}
            className="size-10 rounded-full border border-[var(--border)] text-[var(--foreground)] transition hover:border-[var(--accent)]"
          >
            ←
          </button>
          <button
            type="button"
            onClick={() => handleNavigate(1)}
            className="size-10 rounded-full border border-[var(--border)] text-[var(--foreground)] transition hover:border-[var(--accent)]"
          >
            →
          </button>
        </div>
      </div>
    </div>
  );
}

function SourcePeek({ assets }: { assets: ArticleAsset[] }) {
  if (!assets.length) return null;
  const preview = assets.slice(0, 3);
  const remaining = assets.length - preview.length;

  return (
    <div className="space-y-3">
      <p className="text-xs uppercase tracking-[0.35em] text-[var(--muted)]">Reference sources</p>
      <div className="flex items-center gap-3">
        {preview.map((asset) => {
          const src = resolveUploadUrl(asset.key);
          if (!src) return null;
          return (
            <img
              key={asset.id}
              src={src}
              alt="Source reference"
              className="h-20 w-20 rounded-2xl border border-[var(--border)] object-cover"
            />
          );
        })}
        {remaining > 0 && (
          <span className="rounded-2xl border border-dashed border-[var(--border)] px-4 py-3 text-xs text-[var(--muted)]">
            +{remaining} more
          </span>
        )}
      </div>
    </div>
  );
}

function AuthorBadge({
  author,
  createdAt,
}: {
  author: ArticleResponsePayload["author"];
  createdAt: string;
}) {
  const initials = author?.name?.slice(0, 1) ?? author?.login?.slice(0, 1) ?? "?";
  return (
    <div className="flex items-center gap-4">
      <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border border-[var(--border)] bg-[var(--background)]">
        {author?.avatarUrl ? (
          <img src={author.avatarUrl} alt={author.name ?? author.login} className="h-full w-full object-cover" />
        ) : (
          <span className="text-xl font-semibold text-[var(--foreground)]">{initials}</span>
        )}
      </div>
      <div>
        <p className="text-sm uppercase tracking-[0.4em] text-[var(--muted)]">Author</p>
        <p className="text-lg font-semibold text-[var(--foreground)]">
          {author?.name ?? author?.login ?? "匿名创作者"}
        </p>
        <p className="text-xs text-[var(--muted)]">@{author?.login ?? "unknown"} · {createdAt}</p>
      </div>
    </div>
  );
}

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(
      new Date(value),
    );
  } catch {
    return value;
  }
}
