"use client";
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { AuthStatus, AUTH_SESSION_EVENT } from "@/components/auth-status";
import type { SessionUser } from "@/components/auth-status";
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
  thumbnailImage: ArticleAsset | null;
  media: ArticleAsset[];
  sources: ArticleAsset[];
  createdAt: string;
  updatedAt: string;
  viewerCanEdit: boolean;
};

type ArticlesResponse = {
  data: ArticleRecord[];
  pageInfo: {
    nextAfterId: string | null;
    hasMore: boolean;
  };
};

const PAGE_SIZE = 12;

export default function Home() {
  const [articles, setArticles] = useState<ArticleRecord[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);

  const [themeMode, setThemeMode] = useThemePreference();
  const pathname = usePathname();
  const router = useRouter();

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(false);

  const fetchPage = useCallback(async (cursor: string | null) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (cursor) params.set("afterId", cursor);
      const response = await fetch(`/api/articles?${params.toString()}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Feed is cooling down. Try again shortly.");
      const payload: ArticlesResponse = await response.json();
      setArticles((prev) => (cursor ? [...prev, ...payload.data] : payload.data));
      setNextCursor(payload.pageInfo.nextAfterId);
      setHasMore(payload.pageInfo.hasMore);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load the feed right now.");
    } finally {
      loadingRef.current = false;
      setLoading(false);
      setInitialized(true);
    }
  }, []);

  const requestMore = useCallback(() => {
    if (!hasMore || loadingRef.current) return;
    fetchPage(nextCursor);
  }, [fetchPage, hasMore, nextCursor]);

  useEffect(() => {
    fetchPage(null);
  }, [fetchPage]);

  useEffect(() => {
    let active = true;

    const handleSessionEvent = (event: Event) => {
      if (!active) return;
      const detail = (event as CustomEvent<SessionUser | null>).detail ?? null;
      setSessionUser(detail);
    };

    window.addEventListener(AUTH_SESSION_EVENT, handleSessionEvent);

    (async () => {
      try {
        const res = await fetch("/api/auth/session", { cache: "no-store" });
        if (!active) return;
        if (!res.ok && res.status !== 401 && res.status !== 404) {
          throw new Error("Session request failed");
        }
        const payload = (await res.json()) as { user: SessionUser | null };
        if (!active) return;
        setSessionUser(payload.user);
      } catch {
        if (active) {
          setSessionUser(null);
        }
      }
    })();

    return () => {
      active = false;
      window.removeEventListener(AUTH_SESSION_EVENT, handleSessionEvent);
    };
  }, []);

  useEffect(() => {
    if (!hasMore) return;
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          requestMore();
        }
      },
      { rootMargin: "40% 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, requestMore]);

  const heroSubtitle = useMemo(() => {
    if (!articles.length) return "Fresh drops from AI-powered creators.";
    return `Latest update · ${formatDate(articles[0].createdAt)}`;
  }, [articles]);

  const totalShots = useMemo(
    () =>
      articles.reduce((sum, item) => sum + (item.media.length || (item.thumbnailImage ? 1 : 0)), 0),
    [articles],
  );

  const handleCardSelect = useCallback(
    (articleId: string) => {
      router.push(`/article?id=${articleId}`);
    },
    [router],
  );

  return (
    <>
      <div className="app-shell px-4 pb-16 pt-10 sm:px-6 lg:px-10">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
          <header className="rounded-3xl border border-[var(--border)] bg-[var(--surface)]/90 p-6 shadow-soft backdrop-blur">
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
                  AI Gallery
                </p>
                <h1 className="text-3xl font-semibold text-[var(--foreground)] sm:text-4xl">
                  City stories in your pocket
                </h1>
                <p className="max-w-2xl text-sm text-[var(--muted)] sm:text-base">{heroSubtitle}</p>
              </div>
              <div className="flex flex-col items-end gap-3 sm:flex-row sm:items-center sm:gap-4">
                <ThemeToggle mode={themeMode} onChange={setThemeMode} />
                <AuthStatus redirectTo={pathname ?? "/"} />
              </div>
            </div>
            <div className="mt-6 grid gap-4 text-sm sm:grid-cols-3">
              <HeroStat label="Stories live" value={articles.length} />
              <HeroStat label="Shots archived" value={totalShots} />
              <HeroStat label="Status" value={hasMore ? "Streaming" : "Up to date"} />
            </div>
          </header>

          <section className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 text-xs text-[var(--muted)]">
              <span>
                Showing {articles.length} article{articles.length === 1 ? "" : "s"} · {totalShots}{" "}
                media
              </span>
              <button
                type="button"
                onClick={() => fetchPage(null)}
                className="rounded-full border border-[var(--border)] px-4 py-2 text-xs font-semibold text-[var(--foreground)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
              >
                Refresh feed
              </button>
            </div>

            <div className="feed-grid">
              {articles.map((article) => (
                <ArticleCard key={article.id} article={article} onSelect={handleCardSelect} />
              ))}
            </div>

            {error && <div className="alert-card">{error}</div>}

            {!articles.length && initialized && !loading && !error && (
              <div className="rounded-3xl border border-dashed border-[var(--border)] bg-[var(--surface)]/70 p-8 text-center text-sm text-[var(--muted)]">
                No public articles yet. Be the first to drop a story.
              </div>
            )}

            <div className="flex flex-col items-center gap-3 text-xs text-[var(--muted)]">
              {loading && <span>Loading more stories...</span>}
              {hasMore && !loading && (
                <button
                  type="button"
                  onClick={requestMore}
                  className="rounded-full border border-[var(--border)] px-6 py-2 text-xs font-semibold text-[var(--foreground)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
                >
                  Load more
                </button>
              )}
              <div ref={sentinelRef} className="h-1 w-full" aria-hidden />
            </div>
          </section>
        </div>
      </div>
      {sessionUser?.isCreator && (
        <a
          href="/generate"
          aria-label="Open the generator"
          title="Create a new drop"
          className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--accent)] text-lg font-semibold text-[var(--surface)] shadow-[0_12px_30px_rgba(0,0,0,0.25)] transition hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        >
          ✦
        </a>
      )}
    </>
  );
}

function ArticleCard({
  article,
  onSelect,
}: {
  article: ArticleRecord;
  onSelect: (articleId: string) => void;
}) {
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

function HeroStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)]/80 p-4 text-[var(--foreground)]">
      <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">{label}</p>
      <p className="text-2xl font-semibold">{value}</p>
    </div>
  );
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

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(
      new Date(value),
    );
  } catch {
    return value;
  }
}

function formatShots(article: ArticleRecord) {
  const count = article.media.length || (article.thumbnailImage ? 1 : 0);
  return `${count} shot${count === 1 ? "" : "s"}`;
}
