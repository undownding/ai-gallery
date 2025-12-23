"use client";
/* eslint-disable @next/next/no-img-element */

import { Suspense, useCallback, useMemo, useRef, useState, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { AuthStatus, AUTH_SESSION_EVENT, type SessionUser } from "@/components/auth-status";
import { ThemeToggle, useThemePreference } from "@/components/theme-toggle";
import { useArticleDetail, extractArticleDetail } from "@/hooks/use-article-detail";
import { buildApiUrl, safeReadError } from "@/lib/http";
import { resolveUploadUrl } from "@/lib/uploads-client";
import type { ArticleAsset as ArticleAssetModel, ArticleDetail } from "@/types/articles";

type ArticleAsset = ArticleAssetModel;
type UpdateMessage = { type: "success" | "error"; text: string } | null;
type SessionResponse = { user: SessionUser | null };

export default function ArticleDetailPage() {
  return (
    <Suspense fallback={<ArticlePageFallback />}>
      <ArticleDetailPageContent />
    </Suspense>
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
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
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

    const readSession = async () => {
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store" });
        if (!response.ok && response.status !== 401 && response.status !== 404) {
          throw new Error("Unable to load session.");
        }
        const payload = (await response.json()) as SessionResponse;
        if (active) {
          setSessionUser(payload.user ?? null);
        }
      } catch {
        if (active) {
          setSessionUser(null);
        }
      }
    };

    readSession();

    if (typeof window === "undefined") {
      return () => {
        active = false;
      };
    }

    const handleSessionBroadcast = (event: Event) => {
      const detail = (event as CustomEvent<SessionUser | null>).detail ?? null;
      if (active) {
        setSessionUser(detail);
      }
    };

    window.addEventListener(AUTH_SESSION_EVENT, handleSessionBroadcast);

    return () => {
      active = false;
      window.removeEventListener(AUTH_SESSION_EVENT, handleSessionBroadcast);
    };
  }, []);

  const canManageStory = false;
  const canToggleVisibility = canManageStory;
  const canEditTitle = canManageStory;

  const handleVisibilityToggle = useCallback(async () => {
    if (!article || !canToggleVisibility) return;
    setUpdatingVisibility(true);
    setUpdateMessage(null);
    try {
      const response = await fetch(buildApiUrl(`/articles/${article.id}`), {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
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
      const response = await fetch(buildApiUrl(`/articles/${article.id}`), {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
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
              {editingTitle ? (
                <div className="space-y-3">
                  <label className="text-[11px] font-semibold uppercase tracking-[0.35em] text-[var(--muted)]">
                    Story title
                  </label>
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
                    className="w-full rounded-[28px] border border-[var(--border)] bg-[var(--background)]/60 px-6 py-4 text-3xl font-serif text-[var(--foreground)] focus:border-[var(--accent)] focus:outline-none"
                    placeholder="Untitled story"
                    disabled={savingTitle}
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleSaveTitle}
                      disabled={savingTitle}
                      className="rounded-full border border-[var(--border)] px-6 py-2 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {savingTitle ? "Saving title…" : "Save title"}
                    </button>
                    <button
                      type="button"
                      onClick={handleCancelEditTitle}
                      disabled={savingTitle}
                      className="rounded-full border border-transparent px-6 py-2 text-sm font-semibold text-[var(--muted)] transition hover:text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                  {titleError && <p className="text-sm text-[var(--accent)]">{titleError}</p>}
                </div>
              ) : (
                <div className="flex flex-wrap items-start gap-3">
                  <h1 className="text-[clamp(2.75rem,5vw,4.75rem)] font-serif leading-[1.08] text-[var(--foreground)]">
                    {article?.title ?? "Untitled story"}
                  </h1>
                  {canEditTitle && (
                    <button
                      type="button"
                      onClick={handleBeginEditTitle}
                      className="rounded-full border border-[var(--border)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-[var(--foreground)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
                    >
                      Edit title
                    </button>
                  )}
                </div>
              )}
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
            <MediaShowcase
              assets={galleryAssets}
              title={article.title}
              onViewAsset={setPreviewAsset}
            />
            <div className="space-y-8 rounded-[36px] border border-[var(--border)] bg-[var(--surface)]/90 p-8 shadow-soft">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <AuthorBadge author={article.author} createdAt={metadata.created} />
                <div className="text-right text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
                  <p>Story status</p>
                  <p className="text-base font-semibold text-[var(--foreground)]">{statusLabel}</p>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-[11px] uppercase tracking-[0.4em] text-[var(--muted)]">
                  Prompt digest
                </p>
                <h2 className="font-serif text-3xl leading-snug text-[var(--foreground)] sm:text-4xl">
                  {article.title ?? "Untitled concept"}
                </h2>
                <div
                  className={`relative text-base leading-relaxed text-[var(--foreground)] ${
                    promptIsLong && !isPromptExpanded ? "max-h-72 overflow-hidden pr-4" : ""
                  }`}
                >
                  <p>{article.text}</p>
                  {promptIsLong && !isPromptExpanded && (
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[var(--surface)] via-[var(--surface)]/80 to-transparent" />
                  )}
                </div>
                {promptIsLong && (
                  <button
                    type="button"
                    onClick={() => setIsPromptExpanded((prev) => !prev)}
                    aria-expanded={isPromptExpanded}
                    className="mt-2 text-xs font-semibold uppercase tracking-[0.35em] text-[var(--foreground)] transition hover:text-[var(--accent)]"
                  >
                    {isPromptExpanded ? "Collapse prompt" : "Read full prompt"}
                  </button>
                )}
              </div>

              <div className="space-y-3">
                <p className="text-xs uppercase tracking-[0.35em] text-[var(--muted)]">
                  Story controls
                </p>
                <div className="flex flex-wrap gap-3">
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

              <SourcePeek assets={sourceAssets} />
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
      <div className="mx-auto w-full max-w-4xl rounded-[32px] border border-[var(--border)] bg-[var(--surface)]/90 p-8 text-center text-sm text-[var(--muted)]">
        Loading story…
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
    "relative rounded-[40px] border border-[var(--border)] bg-[var(--surface)]/90 p-4 shadow-soft";

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
              <div className="relative flex h-[520px] w-full items-center justify-center rounded-[32px] bg-[var(--background)]/40">
                <img
                  src={src}
                  alt={title ?? "Article media"}
                  className="max-h-full w-full rounded-[32px] object-contain"
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

      <div className="mt-4 flex items-center justify-between">
        <p className="text-xs uppercase tracking-[0.35em] text-[var(--muted)]">
          Swipe to explore · media set
        </p>
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
        className="relative w-full max-w-5xl rounded-[36px] border border-[var(--border)] bg-[var(--surface)]/95 p-6 shadow-2xl"
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
