"use client";
/* eslint-disable @next/next/no-img-element */

import { Suspense, useCallback, useMemo, useRef, useState, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { AuthStatus } from "@/components/auth-status";
import {
  AUTH_SESSION_EVENT,
  fetchCurrentUser,
  getValidAccessToken,
  getStoredSessionUser,
  type SessionUser,
} from "@/lib/client-session";
import { ThemeToggle, useThemePreference } from "@/components/theme-toggle";
import { useArticleDetail, extractArticleDetail } from "@/hooks/use-article-detail";
import { buildApiUrl, safeReadError } from "@/lib/http";
import { resolveUploadUrl } from "@/lib/uploads-client";
import type { ArticleAsset as ArticleAssetModel, ArticleDetail } from "@/types/articles";

type ArticleAsset = ArticleAssetModel;
type UpdateMessage = { type: "success" | "error"; text: string } | null;

export default function ArticleDetailPage() {
  return (
    <Suspense fallback={<ArticlePageFallback />}>
      <ArticleDetailPageContent />
    </Suspense>
  );
}

function ArticleDetailSkeleton() {
  // 在客户端立即初始化主题（不创建状态）
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem("ai-gallery-theme");
    if (stored === "light" || stored === "dark") {
      document.documentElement.dataset.theme = stored;
    }
  }, []);
  
  return (
    <section className="grid gap-8 min-h-[600px] lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-stretch lg:flex-1 lg:min-h-0 lg:h-full lg:grid-rows-1">
      {/* MediaShowcase Skeleton */}
      <div className="relative border border-(--border)/40 bg-(--surface)/30 p-4 shadow-soft backdrop-blur-md backdrop-saturate-150 lg:flex lg:flex-col lg:min-h-0 lg:h-full">
        <div className="relative flex snap-x snap-mandatory overflow-x-auto bg-[var(--background)]/30 lg:flex-1 lg:min-h-0">
          <div className="relative min-w-full snap-center px-2 py-1 lg:h-full">
            <div className="relative flex h-[520px] lg:h-full w-full items-center justify-center bg-[var(--background)]/40">
              <div className="h-full w-full animate-pulse bg-gray-200 rounded-lg" />
            </div>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between lg:flex-shrink-0">
          <div className="h-3 w-48 animate-pulse bg-gray-200 rounded" />
        </div>
      </div>

      {/* Content Panel Skeleton */}
      <div className="space-y-8 rounded-2xl border border-(--border)/40 bg-(--surface)/30 p-8 shadow-soft backdrop-blur-md backdrop-saturate-150 lg:flex lg:flex-col lg:min-h-0 lg:h-full">
        {/* AuthorBadge Skeleton */}
        <div className="lg:flex-shrink-0">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 animate-pulse rounded-full bg-gray-200" />
            <div className="space-y-2">
              <div className="h-3 w-16 animate-pulse bg-gray-200 rounded" />
              <div className="h-5 w-32 animate-pulse bg-gray-200 rounded" />
              <div className="h-3 w-40 animate-pulse bg-gray-200 rounded" />
            </div>
          </div>
        </div>

        {/* Prompt Digest Skeleton */}
        <div className="space-y-3 lg:flex-1 lg:flex lg:flex-col lg:min-h-0">
          <div className="space-y-3">
            <div className="h-3 w-32 animate-pulse bg-gray-200 rounded" />
            <div className="h-10 w-full animate-pulse bg-gray-200 rounded" />
            <div className="space-y-2 lg:flex-1 lg:overflow-y-auto">
              <div className="h-4 w-full animate-pulse bg-gray-200 rounded" />
              <div className="h-4 w-full animate-pulse bg-gray-200 rounded" />
              <div className="h-4 w-5/6 animate-pulse bg-gray-200 rounded" />
              <div className="h-4 w-full animate-pulse bg-gray-200 rounded" />
              <div className="h-4 w-4/5 animate-pulse bg-gray-200 rounded" />
            </div>
          </div>
        </div>

        {/* Story Controls Skeleton */}
        <div className="space-y-3 lg:flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="h-3 w-28 animate-pulse bg-gray-200 rounded" />
            <div className="h-6 w-20 animate-pulse bg-gray-200 rounded-full" />
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="h-10 w-24 animate-pulse bg-gray-200 rounded-full" />
            <div className="h-10 w-32 animate-pulse bg-gray-200 rounded-full" />
          </div>
        </div>

        {/* SourcePeek Skeleton */}
        <div className="lg:flex-shrink-0">
          <div className="space-y-3">
            <div className="h-3 w-36 animate-pulse bg-gray-200 rounded" />
            <div className="flex items-center gap-3">
              <div className="h-20 w-20 animate-pulse bg-gray-200 rounded-2xl" />
              <div className="h-20 w-20 animate-pulse bg-gray-200 rounded-2xl" />
              <div className="h-20 w-20 animate-pulse bg-gray-200 rounded-2xl" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ArticleDetailPageContent() {
  const searchParams = useSearchParams();
  const requestedArticleId = searchParams.get("id");
  const { article, setArticle, articleId, loading, error, reload } =
    useArticleDetail(requestedArticleId);
  const [updatingVisibility, setUpdatingVisibility] = useState(false);
  const [updateMessage, setUpdateMessage] = useState<UpdateMessage>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [savingTitle, setSavingTitle] = useState(false);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [themeMode, setThemeMode] = useThemePreference();
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(() => getStoredSessionUser());
  const [isPromptExpanded, setIsPromptExpanded] = useState(false);
  const [previewAsset, setPreviewAsset] = useState<ArticleAsset | null>(null);

  const pathname = usePathname();
  const router = useRouter();

  const galleryAssets = useMemo(() => {
    if (!article) return [] as ArticleAsset[];
    if (article.media?.length) return article.media;
    return article.thumbnail ? [article.thumbnail] : [];
  }, [article]);

  const sourceAssets = article?.sources ?? [];

  const metadata = useMemo(
    () => ({
      created: article ? formatDate(article.createdAt) : "—",
      updated: article ? formatDate(article.updatedAt) : "—",
    }),
    [article],
  );

  const redirectBase = pathname ?? "/article";
  const redirectTarget = articleId ? `${redirectBase}?id=${articleId}` : redirectBase;
  const promptIsLong = (article?.text?.length ?? 0) > 320;

  useEffect(() => {
    setTitleDraft(article?.title ?? "");
    if (!article) {
      setEditingTitle(false);
      setTitleError(null);
    }
  }, [article?.title, article]);

  useEffect(() => {
    setIsPromptExpanded(false);
    setPreviewAsset(null);
  }, [article?.id]);

  useEffect(() => {
    if (!previewAsset) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPreviewAsset(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [previewAsset]);

  useEffect(() => {
    let active = true;

    const handleSessionBroadcast = (event: Event) => {
      if (!active) return;
      const detail = (event as CustomEvent<SessionUser | null>).detail ?? null;
      setSessionUser(detail);
    };

    window.addEventListener(AUTH_SESSION_EVENT, handleSessionBroadcast);

    (async () => {
      const user = await fetchCurrentUser();
      if (!active) return;
      setSessionUser(user);
    })();

    return () => {
      active = false;
      window.removeEventListener(AUTH_SESSION_EVENT, handleSessionBroadcast);
    };
  }, []);

  const authorId = article?.author?.id;
  const authorLogin = article?.author?.login;
  const userId = sessionUser?.id;
  const userLogin = sessionUser?.login;
  const canManageStory = Boolean(
    article &&
    sessionUser &&
    ((authorId && userId && authorId === userId) ||
      (authorLogin && userLogin && authorLogin === userLogin)),
  );
  const canToggleVisibility = canManageStory;
  const canEditTitle = canManageStory;

  const handleVisibilityToggle = useCallback(async () => {
    if (!article || !canToggleVisibility) return;
    setUpdatingVisibility(true);
    setUpdateMessage(null);
    try {
      const accessToken = await getValidAccessToken();
      if (!accessToken) {
        throw new Error("Unable to authenticate this session.");
      }
      const response = await fetch(buildApiUrl(`/articles/${article.id}`), {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ isPublic: !article.isPublic }),
      });
      if (!response.ok) {
        const message = (await safeReadError(response)) ?? "Unable to update article.";
        throw new Error(message);
      }
      const payload = await response.json();
      const nextArticle = extractArticleDetail(payload);
      if (!nextArticle) {
        throw new Error("Article response missing data.");
      }
      setArticle(nextArticle);
      setUpdateMessage({
        type: "success",
        text: nextArticle.isPublic ? "Story is now public." : "Story hidden from the gallery.",
      });
    } catch (issue) {
      setUpdateMessage({
        type: "error",
        text: issue instanceof Error ? issue.message : "Unable to update article.",
      });
    } finally {
      setUpdatingVisibility(false);
    }
  }, [article, canToggleVisibility, setArticle]);

  const handleRetry = useCallback(() => {
    setUpdateMessage(null);
    reload();
  }, [reload]);

  const handleBeginEditTitle = useCallback(() => {
    if (!canEditTitle) return;
    setEditingTitle(true);
    setTitleError(null);
    setUpdateMessage(null);
  }, [canEditTitle]);

  const handleCancelEditTitle = useCallback(() => {
    setEditingTitle(false);
    setTitleError(null);
    setTitleDraft(article?.title ?? "");
  }, [article?.title]);

  const handleSaveTitle = useCallback(async () => {
    if (!article || !canEditTitle) return;
    setSavingTitle(true);
    setTitleError(null);
    try {
      const accessToken = await getValidAccessToken();
      if (!accessToken) {
        throw new Error("Unable to authenticate this session.");
      }
      const response = await fetch(buildApiUrl(`/articles/${article.id}`), {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ title: titleDraft.trim() || null }),
      });
      if (!response.ok) {
        const message = (await safeReadError(response)) ?? "Unable to update title.";
        throw new Error(message);
      }
      const payload = await response.json();
      const nextArticle = extractArticleDetail(payload);
      if (!nextArticle) {
        throw new Error("Article response missing data.");
      }
      setArticle(nextArticle);
      setTitleDraft(nextArticle.title ?? "");
      setEditingTitle(false);
      setUpdateMessage({ type: "success", text: "Title updated." });
    } catch (issue) {
      setTitleError(issue instanceof Error ? issue.message : "Unable to update title.");
    } finally {
      setSavingTitle(false);
    }
  }, [article, canEditTitle, setArticle, titleDraft]);

  return (
    <div className="app-shell px-4 pb-10 pt-10 sm:px-6 lg:px-12 lg:pb-6 lg:flex lg:flex-col">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 lg:gap-8 lg:flex-1 lg:min-h-0 lg:h-full">
        {/* Top Navigation Bar */}
        <div className="flex items-center justify-between lg:shrink-0">
          <button
            type="button"
            onClick={() => router.push("/")}
            className="text-[11px] font-semibold uppercase tracking-[0.35em] text-(--muted) transition hover:text-(--accent)"
          >
            Back to feed
          </button>
          <div className="flex flex-col items-end gap-3 sm:flex-row sm:items-center sm:gap-4">
            <ThemeToggle mode={themeMode} onChange={setThemeMode} />
            <AuthStatus redirectTo={redirectTarget} />
          </div>
        </div>

        {loading ? (
          <ArticleDetailSkeleton />
        ) : error ? (
          <div className="space-y-4 rounded-2xl border border-(--border)/40 bg-(--surface)/30 p-8 text-center text-sm text-(--muted) backdrop-blur-md backdrop-saturate-150">
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
          <section className="grid gap-8 min-h-[600px] lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-stretch lg:flex-1 lg:min-h-0 lg:h-full lg:grid-rows-1">
              <MediaShowcase
                assets={galleryAssets}
                title={article.title}
                onViewAsset={setPreviewAsset}
              />
              <div className="space-y-8 rounded-2xl border border-(--border)/40 bg-(--surface)/30 p-8 shadow-soft backdrop-blur-md backdrop-saturate-150 lg:flex lg:flex-col lg:min-h-0 lg:h-full">
                <div className="lg:flex-shrink-0">
                  <AuthorBadge author={article.author} createdAt={metadata.created} />
                </div>

                <div className="space-y-3 lg:flex-1 lg:flex lg:flex-col lg:min-h-0">
                  <div className="space-y-3">
                    <p className="text-[11px] uppercase tracking-[0.4em] text-[var(--muted)]">
                      Prompt digest
                    </p>
                    {editingTitle && canEditTitle ? (
                      <div className="space-y-3">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                          <input
                            type="text"
                            autoFocus
                            value={titleDraft}
                            onChange={(event) => setTitleDraft(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" && !event.shiftKey) {
                                event.preventDefault();
                                handleSaveTitle();
                              }
                              if (event.key === "Escape") {
                                event.preventDefault();
                                handleCancelEditTitle();
                              }
                            }}
                            className="w-full rounded-2xl border border-(--border)/40 bg-(--surface)/30 px-5 py-3 text-2xl font-serif leading-snug text-[var(--foreground)] focus:border-[var(--accent)] focus:outline-none backdrop-blur-md backdrop-saturate-150 sm:text-3xl"
                            placeholder="Untitled concept"
                            disabled={savingTitle}
                          />
                          <div className="flex items-center gap-2 sm:shrink-0">
                            <button
                              type="button"
                              onClick={handleSaveTitle}
                              disabled={savingTitle}
                              className="rounded-full border border-[var(--border)] px-5 py-2 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {savingTitle ? "Saving…" : "Save"}
                            </button>
                            <button
                              type="button"
                              onClick={handleCancelEditTitle}
                              disabled={savingTitle}
                              className="rounded-full border border-transparent px-4 py-2 text-sm font-semibold text-[var(--muted)] transition hover:text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                        {titleError && <p className="text-sm text-[var(--accent)]">{titleError}</p>}
                      </div>
                    ) : (
                      <h2 className="font-serif text-2xl leading-snug text-[var(--foreground)] sm:text-3xl">
                        {article.title ?? "Untitled concept"}
                      </h2>
                    )}
                    <div
                      className={`relative text-base leading-relaxed text-[var(--foreground)] lg:flex-1 lg:overflow-y-auto ${
                        promptIsLong && !isPromptExpanded ? "max-h-72 overflow-hidden pr-4 lg:max-h-none" : ""
                      }`}
                    >
                      <p>{article.text}</p>
                      {promptIsLong && !isPromptExpanded && (
                        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[var(--surface)] via-[var(--surface)]/80 to-transparent lg:hidden" />
                      )}
                    </div>
                    {promptIsLong && (
                      <button
                        type="button"
                        onClick={() => setIsPromptExpanded((prev) => !prev)}
                        aria-expanded={isPromptExpanded}
                        className="mt-2 text-xs font-semibold uppercase tracking-[0.35em] text-[var(--foreground)] transition hover:text-[var(--accent)] lg:hidden"
                      >
                        {isPromptExpanded ? "Collapse prompt" : "Read full prompt"}
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-3 lg:flex-shrink-0">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-[0.35em] text-[var(--muted)]">
                    Story controls
                  </p>
                  {article && (
                    <span
                      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] ${
                        article.isPublic
                          ? "bg-emerald-500/20 text-emerald-500"
                          : "bg-[var(--muted)]/20 text-[var(--muted)]"
                      }`}
                    >
                      {article.isPublic ? "Public" : "Private"}
                    </span>
                  )}
                </div>
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-3">
                    {canEditTitle && !editingTitle && (
                      <button
                        type="button"
                        onClick={handleBeginEditTitle}
                        className="rounded-full border border-[var(--border)] px-6 py-3 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
                      >
                        Edit title
                      </button>
                    )}
                    {canToggleVisibility ? (
                      <button
                        type="button"
                        onClick={handleVisibilityToggle}
                        disabled={updatingVisibility}
                        className="rounded-full border border-[var(--border)] px-6 py-3 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {updatingVisibility
                          ? "Updating visibility…"
                          : article.isPublic
                            ? "Hide from gallery"
                            : "Publish to gallery"}
                      </button>
                    ) : (
                      <p className="text-xs text-[var(--muted)]">
                        Only the author can change the public status of this story.
                      </p>
                    )}
                    {editingTitle && (
                      <p className="text-xs text-[var(--muted)]">Editing title above…</p>
                    )}
                  </div>
                </div>
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

                <div className="lg:flex-shrink-0">
                  <SourcePeek assets={sourceAssets} />
                </div>
              </div>
            </section>
        ) : null}
        {previewAsset && (
          <ImagePreviewModal
            asset={previewAsset}
            title={article?.title ?? "Story media"}
            onClose={() => setPreviewAsset(null)}
          />
        )}
      </div>
    </div>
  );
}

function ArticlePageFallback() {
  return (
    <div className="app-shell px-4 pb-20 pt-10 sm:px-6 lg:px-12">
      <div className="mx-auto w-full max-w-4xl rounded-2xl border border-(--border)/40 bg-(--surface)/30 p-8 text-center text-sm text-(--muted) backdrop-blur-md backdrop-saturate-150">
        Loading story…
      </div>
    </div>
  );
}

function DetailStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-(--border)/40 bg-(--surface)/30 p-4 text-[var(--foreground)] backdrop-blur-md backdrop-saturate-150">
      <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">{label}</p>
      <p className="text-2xl font-semibold">{value}</p>
    </div>
  );
}

function MediaShowcase({
  assets,
  title,
  onViewAsset,
}: {
  assets: ArticleAsset[];
  title: string | null;
  onViewAsset?: (asset: ArticleAsset) => void;
}) {
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
      setActiveIndex((prev) =>
        next === prev ? prev : Math.max(0, Math.min(assets.length - 1, next)),
      );
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

  const scrollToIndex = useCallback((index: number) => {
    if (!listRef.current) return;
    const width = listRef.current.clientWidth;
    listRef.current.scrollTo({ left: index * width, behavior: "smooth" });
  }, []);

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
    "relative rounded-2xl border border-(--border)/40 bg-(--surface)/30 p-4 shadow-soft backdrop-blur-md backdrop-saturate-150 lg:flex lg:flex-col lg:min-h-0 lg:h-full";

  if (!hasMedia) {
    return (
      <div className={`${baseClasses} flex min-h-[420px] items-center justify-center text-center`}>
        <div className="space-y-2">
          <p className="text-sm font-semibold text-[var(--foreground)]">No media added yet</p>
          <p className="text-xs text-[var(--muted)]">
            Drop visuals here to open the horizontal showcase.
          </p>
        </div>
      </div>
    );
  }

  const showNavigation = assets.length > 1;

  return (
    <div className={baseClasses}>
      <div
        ref={listRef}
        className="relative flex snap-x snap-mandatory overflow-x-auto bg-[var(--background)]/30 lg:flex-1 lg:min-h-0"
        style={{ scrollSnapType: "x mandatory" }}
      >
        {showNavigation && (
          <>
            <button
              type="button"
              onClick={() => handleNavigate(-1)}
              className="absolute left-4 top-1/2 z-10 -translate-y-1/2 size-10 rounded-full border border-white/40 bg-black/60 text-white backdrop-blur transition hover:bg-black/80"
              aria-label="Previous image"
            >
              ←
            </button>
            <button
              type="button"
              onClick={() => handleNavigate(1)}
              className="absolute right-4 top-1/2 z-10 -translate-y-1/2 size-10 rounded-full border border-white/40 bg-black/60 text-white backdrop-blur transition hover:bg-black/80"
              aria-label="Next image"
            >
              →
            </button>
          </>
        )}
        {assets.map((asset, index) => {
          const src = resolveUploadUrl(asset.key);
          if (!src) return null;
          return (
            <div key={asset.id} className="relative min-w-full snap-center px-2 py-1 lg:h-full">
              <div className="relative flex h-[520px] lg:h-full w-full items-center justify-center bg-[var(--background)]/40">
                <img
                  src={src}
                  alt={title ?? "Article media"}
                  className="max-h-full max-w-full object-contain"
                />
                {onViewAsset && (
                  <button
                    type="button"
                    onClick={() => onViewAsset(asset)}
                    className="absolute bottom-6 right-8 rounded-full border border-white/40 bg-black/60 px-4 py-2 text-xs font-semibold text-white backdrop-blur transition hover:bg-black/80"
                  >
                    查看大图
                  </button>
                )}
              </div>
              <span className="absolute left-8 top-8 rounded-full bg-black/50 px-4 py-1 text-xs font-semibold text-white">
                {index + 1} / {assets.length}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex items-center justify-between lg:flex-shrink-0">
        <p className="text-xs uppercase tracking-[0.35em] text-[var(--muted)]">
          Swipe to explore · media set
        </p>
      </div>
    </div>
  );
}

function ImagePreviewModal({
  asset,
  title,
  onClose,
}: {
  asset: ArticleAsset;
  title: string;
  onClose: () => void;
}) {
  const src = resolveUploadUrl(asset.key);
  if (!src) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-5xl rounded-2xl border border-(--border)/40 bg-(--surface)/30 p-6 shadow-2xl backdrop-blur-md backdrop-saturate-150"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-6 top-6 rounded-full border border-[var(--border)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.35em] text-[var(--foreground)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
          aria-label="Close image preview"
        >
          Close
        </button>
        <div className="flex items-center justify-center">
          <img src={src} alt={title} className="max-h-[80vh] w-full object-contain" />
        </div>
        <p className="mt-4 text-center text-[11px] uppercase tracking-[0.4em] text-[var(--muted)]">
          {title}
        </p>
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
              className="h-20 w-20 rounded-2xl border border-(--border)/40 object-cover"
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
  author: ArticleDetail["author"];
  createdAt: string;
}) {
  const initials = author?.name?.slice(0, 1) ?? author?.login?.slice(0, 1) ?? "?";
  return (
    <div className="flex items-center gap-4">
      <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border border-[var(--border)] bg-[var(--background)]">
        {author?.avatarUrl ? (
          <img
            src={author.avatarUrl}
            alt={author.name ?? author.login}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-xl font-semibold text-[var(--foreground)]">{initials}</span>
        )}
      </div>
      <div>
        <p className="text-sm uppercase tracking-[0.4em] text-[var(--muted)]">Author</p>
        <p className="text-lg font-semibold text-[var(--foreground)]">
          {author?.name ?? author?.login ?? "Anonymous creator"}
        </p>
        <p className="text-xs text-[var(--muted)]">
          @{author?.login ?? "unknown"} · {createdAt}
        </p>
      </div>
    </div>
  );
}

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat("en", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(value));
  } catch {
    return value;
  }
}
