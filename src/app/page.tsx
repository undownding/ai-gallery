"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { ArticleCard, formatDate } from "@/components/article-card";
import { ArticleCardSkeleton } from "@/components/article-card-skeleton";
import { AuthStatus } from "@/components/auth-status";
import {
  AUTH_SESSION_EVENT,
  fetchCurrentUser,
  getStoredSessionUser,
  type SessionUser,
} from "@/lib/client-session";
import { ThemeToggle, useThemePreference } from "@/components/theme-toggle";
import { buildApiUrl } from "@/lib/http";
import type { ArticleRecord } from "@/types/articles";

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
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(() => getStoredSessionUser());

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
      const query = params.toString();
      const url = `${buildApiUrl("/articles")}${query ? `?${query}` : ""}`;
      const response = await fetch(url, { cache: "no-store", credentials: "include" });
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
      const user = await fetchCurrentUser();
      if (!active) return;
      setSessionUser(user);
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
      articles.reduce((sum, item) => {
        const mediaCount = item.media?.length ?? 0;
        if (mediaCount) {
          return sum + mediaCount;
        }
        return sum + (item.thumbnail ? 1 : 0);
      }, 0),
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
          <header className="rounded-2xl border border-(--border)/40 bg-(--surface)/30 p-6 backdrop-blur-md backdrop-saturate-150">
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-(--muted)">
                  Banana Gallery
                </p>
                <h1 className="text-3xl font-semibold text-foreground sm:text-4xl">
                  Sharing your banana life
                </h1>
                <p className="max-w-2xl text-sm text-(--muted) sm:text-base">{heroSubtitle}</p>
              </div>
              <div className="flex flex-col items-end gap-3 sm:flex-row sm:items-center sm:gap-4">
                <ThemeToggle mode={themeMode} onChange={setThemeMode} />
                <AuthStatus redirectTo={pathname ?? "/"} />
              </div>
            </div>
          </header>

          <section className="space-y-6">

            <div className="feed-grid">
              {articles.map((article) => (
                <ArticleCard key={article.id} article={article} onSelect={handleCardSelect} />
              ))}
              {loading && (
                <>
                  <ArticleCardSkeleton />
                  <ArticleCardSkeleton />
                  <ArticleCardSkeleton />
                  <ArticleCardSkeleton />
                </>
              )}
              {loading && articles.length === 0 && (
                <>
                  <ArticleCardSkeleton />
                  <ArticleCardSkeleton />
                  <ArticleCardSkeleton />
                  <ArticleCardSkeleton />
                </>
              )}
            </div>

            {error && <div className="alert-card">{error}</div>}

            {!articles.length && initialized && !loading && !error && (
              <div className="rounded-2xl border border-dashed border-(--border) bg-(--surface)/70 p-8 text-center text-sm text-(--muted)">
                No public articles yet. Be the first to drop a story.
              </div>
            )}

            <div className="flex flex-col items-center gap-3 text-xs text-(--muted)">
              {hasMore && !loading && (
                <button
                  type="button"
                  onClick={requestMore}
                  className="rounded-full border border-(--border) px-6 py-2 text-xs font-semibold text-foreground transition-colors hover:border-(--accent) hover:text-(--accent)"
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
