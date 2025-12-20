"use client";
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { AuthStatus } from "@/components/auth-status";
import { ThemeToggle, useThemePreference } from "@/components/theme-toggle";

type ArticleAsset = {
  id: string;
  key: string;
  eTag: string;
  createdAt: string;
};

type ArticleRecord = {
  id: string;
  title: string | null;
  text: string;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  thumbnailImage: ArticleAsset | null;
  media: ArticleAsset[];
  sources: ArticleAsset[];
  viewerCanEdit: boolean;
};

type ArticleDetailResponse = {
  data: ArticleRecord;
};

type UpdateMessage = { type: "success" | "error"; text: string } | null;

type PageParams = {
  params: {
    id: string;
  };
};

export default function ArticleDetailPage({ params }: PageParams) {
  const articleId = params.id;
  const [article, setArticle] = useState<ArticleRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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

  const loadArticle = useCallback(async () => {
    setLoading(true);
    setError(null);
    setUpdateMessage(null);
    try {
      const response = await fetch(`/api/articles/${articleId}`, { cache: "no-store" });
      if (!response.ok) {
        const message = (await safeReadError(response)) ?? "Unable to load article.";
        throw new Error(message);
      }
      const payload = (await response.json()) as ArticleDetailResponse;
      setArticle(payload.data);
    } catch (issue) {
      setArticle(null);
      setError(issue instanceof Error ? issue.message : "Unable to load article.");
    } finally {
      setLoading(false);
    }
  }, [articleId]);

  useEffect(() => {
    loadArticle();
  }, [loadArticle]);

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
      const payload = (await response.json()) as ArticleDetailResponse;
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
  }, [article]);

  const shotsCount = article ? article.media.length || (article.thumbnailImage ? 1 : 0) : 0;

  const metadata = useMemo(
    () => ({
      created: article ? formatDate(article.createdAt) : "—",
      updated: article ? formatDate(article.updatedAt) : "—",
    }),
    [article],
  );

  const viewerCanEdit = article?.viewerCanEdit ?? false;

  return (
    <div className="app-shell px-4 pb-16 pt-10 sm:px-6 lg:px-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <header className="rounded-3xl border border-[var(--border)] bg-[var(--surface)]/90 p-6 shadow-soft">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => router.push("/")}
                className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--muted)] transition hover:text-[var(--accent)]"
              >
                Back to feed
              </button>
              <h1 className="text-3xl font-semibold text-[var(--foreground)] sm:text-4xl">
                {article?.title ?? "Untitled story"}
              </h1>
              <p className="text-sm text-[var(--muted)]">{statusLabel}</p>
            </div>
            <div className="flex flex-col items-end gap-3 sm:flex-row sm:items-center sm:gap-4">
              <ThemeToggle mode={themeMode} onChange={setThemeMode} />
              <AuthStatus redirectTo={pathname ?? `/articles/${articleId}`} />
            </div>
          </div>
          <div className="mt-6 grid gap-4 text-sm sm:grid-cols-3">
            <DetailStat label="Shots" value={shotsCount} />
            <DetailStat label="Created" value={metadata.created} />
            <DetailStat label="Last updated" value={metadata.updated} />
          </div>
        </header>

        {loading ? (
          <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)]/80 p-8 text-center text-sm text-[var(--muted)]">
            Loading article…
          </div>
        ) : error ? (
          <div className="space-y-4 rounded-3xl border border-[var(--border)] bg-[var(--surface)]/80 p-8 text-center text-sm text-[var(--muted)]">
            <p>{error}</p>
            <button
              type="button"
              onClick={loadArticle}
              className="rounded-full border border-[var(--border)] px-4 py-2 text-xs font-semibold text-[var(--foreground)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              Retry
            </button>
          </div>
        ) : article ? (
          <section className="space-y-6">
            <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)]/80 p-6 shadow-soft">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">Story status</p>
                  <p className="text-lg font-semibold text-[var(--foreground)]">{statusLabel}</p>
                </div>
                {viewerCanEdit ? (
                  <button
                    type="button"
                    onClick={handleVisibilityToggle}
                    disabled={updatingVisibility}
                    className="rounded-full border border-[var(--border)] px-5 py-2 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
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
              {updateMessage && (
                <p
                  className={`mt-4 text-sm ${
                    updateMessage.type === "success" ? "text-emerald-500" : "text-[var(--accent)]"
                  }`}
                >
                  {updateMessage.text}
                </p>
              )}
            </div>

            <article className="space-y-6 rounded-3xl border border-[var(--border)] bg-[var(--surface)]/80 p-6 shadow-soft">
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">Narrative</p>
                <p className="text-base text-[var(--foreground)]">{article.text}</p>
              </div>

              <div className="space-y-3">
                <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">Gallery</p>
                {galleryAssets.length ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {galleryAssets.map((asset) => {
                      const src = resolveUploadUrl(asset.key);
                      return src ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={asset.id}
                          src={src}
                          alt={article.title ?? "Article media"}
                          className="h-72 w-full rounded-[28px] object-cover"
                        />
                      ) : null;
                    })}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--background)]/60 p-8 text-center text-sm text-[var(--muted)]">
                    No media attached.
                  </div>
                )}
              </div>

              {sourceAssets.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">Reference sources</p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {sourceAssets.map((asset) => {
                      const src = resolveUploadUrl(asset.key);
                      return src ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={asset.id}
                          src={src}
                          alt={article.title ?? "Reference source"}
                          className="h-52 w-full rounded-[24px] object-cover"
                        />
                      ) : null;
                    })}
                  </div>
                </div>
              )}
            </article>
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

function resolveUploadUrl(key: string | null | undefined) {
  if (!key) return null;
  const publicBase = process.env.NEXT_PUBLIC_R2_PUBLIC_URL;
  if (publicBase) {
    return `${publicBase.replace(/\/$/, "")}/${key}`;
  }
  return `/api/uploads/${encodeURIComponent(key)}`;
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

async function safeReadError(response: Response): Promise<string | null> {
  try {
    const payload = (await response.clone().json()) as { error?: string; message?: string };
    return payload.error ?? payload.message ?? null;
  } catch {
    try {
      const text = await response.text();
      return text || null;
    } catch {
      return null;
    }
  }
}
