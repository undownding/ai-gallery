"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type ArticleRecord = {
  id: string;
  title: string;
  text: string;
  media: string[];
  previewImageId: string | null;
  createdAt: string;
  updatedAt: string;
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
      if (!response.ok) throw new Error("Feed is resting. Please try again in a moment.");
      const payload: ArticlesResponse = await response.json();
      setArticles((prev) => (cursor ? [...prev, ...payload.data] : payload.data));
      setNextCursor(payload.pageInfo.nextAfterId);
      setHasMore(payload.pageInfo.hasMore);
    } catch (err) {
      setError(err instanceof Error ? err.message : "We could not load the feed.");
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
    if (!hasMore) return;
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          requestMore();
        }
      },
      { rootMargin: "45% 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, requestMore]);

  const heroSubtitle = useMemo(() => {
    if (!articles.length) return "Curated photo stories from creators worldwide";
    const latest = articles[0];
    return `Latest drop · ${formatDate(latest.createdAt)}`;
  }, [articles]);

  return (
    <div className="min-h-screen w-full px-4 pb-16 pt-12 sm:px-8 lg:px-12">
      <section className="relative mx-auto flex w-full max-w-6xl flex-col gap-8 rounded-[40px] border border-white/10 bg-black/40 p-8 text-white shadow-[0_40px_120px_rgba(0,0,0,0.55)] backdrop-blur-2xl">
        <div className="hero-blur" />
        <div className="relative z-10 flex flex-col gap-6">
          <div className="pill self-start text-white/80">City diaries</div>
          <div className="flex flex-col gap-4">
            <h1 className="text-balance text-4xl font-semibold leading-tight tracking-tight text-white sm:text-5xl lg:text-6xl">
              Capture candid sparks of everyday life
            </h1>
            <p className="max-w-2xl text-base text-white/70 sm:text-lg">{heroSubtitle}</p>
          </div>
          <div className="flex flex-wrap gap-4 text-sm text-white/80">
            <div className="pill">Trending now</div>
            <div className="pill">Analog glow</div>
            <div className="pill">Night strolls</div>
          </div>
          <div className="grid gap-4 text-sm text-white/70 sm:grid-cols-3">
            <Stat label="Shots curated" value={articles.length} suffix="+" />
            <Stat label="Creators live" value={hasMore ? "Streaming" : "Complete"} />
            <Stat label="Mood" value={articles[0]?.title ?? "Awaiting drop"} />
          </div>
        </div>
      </section>

      <section className="mx-auto mt-12 w-full max-w-6xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4 text-white/80">
          <div>
            <h2 className="text-2xl font-semibold text-white">Fresh waterfall</h2>
            <p className="text-sm text-white/60">
              Scroll through the latest public articles. New drops stream in real-time.
            </p>
          </div>
          <button
            className="rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-white transition hover:border-white hover:bg-white/10"
            onClick={() => fetchPage(null)}
          >
            Refresh feed
          </button>
        </header>

        <div className="columns-1 gap-6 space-y-6 sm:columns-2 lg:columns-3">
          {articles.map((article) => (
            <ArticleCard key={article.id} article={article} />
          ))}
        </div>

        {error && (
          <div className="mt-10 rounded-3xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-200">
            {error}
          </div>
        )}

        {!articles.length && initialized && !loading && !error && (
          <div className="mt-10 rounded-3xl border border-dashed border-white/20 bg-white/5 p-8 text-center text-white/70">
            No public articles yet. Share your first drop to light up the feed.
          </div>
        )}

        <div className="mt-10 flex flex-col items-center gap-4 text-white/70">
          {loading && <span>Loading stories...</span>}
          {hasMore && !loading && (
            <button
              className="rounded-full border border-white/20 px-6 py-2 text-sm font-semibold text-white transition hover:border-white hover:bg-white/10"
              onClick={requestMore}
            >
              Load more
            </button>
          )}
          <div ref={sentinelRef} className="h-1 w-full" aria-hidden />
        </div>
      </section>
    </div>
  );
}

function ArticleCard({ article }: { article: ArticleRecord }) {
  const coverSrc = resolveMediaCover(article);
  const shots = article.media.length || (article.previewImageId ? 1 : 0);
  return (
    <article className="masonry-card text-white/90">
      <div className="masonry-card__cover aspect-[3/4]">
        {coverSrc ? (
          <img src={coverSrc} alt={article.title} loading="lazy" />
        ) : (
          <div className="flex h-full items-center justify-center text-xs uppercase tracking-[0.2em] text-white/40">
            Awaiting media
          </div>
        )}
        <div className="pointer-events-none absolute bottom-4 left-4 z-10 rounded-full border border-white/30 bg-black/40 px-3 py-1 text-xs font-medium text-white">
          {formatDate(article.createdAt)}
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-3">
        <h3 className="text-lg font-semibold text-white">{article.title}</h3>
        <p
          className="text-sm text-white/70"
          style={{
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {article.text}
        </p>
        <div className="flex items-center justify-between text-xs text-white/60">
          <span>{shots} shots</span>
          <button className="rounded-full border border-white/20 px-3 py-1 text-xs font-semibold text-white transition hover:border-white hover:bg-white/10">
            Collect
          </button>
        </div>
      </div>
    </article>
  );
}

function Stat({
  label,
  value,
  suffix,
}: {
  label: string;
  value: string | number;
  suffix?: string;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
      <div className="text-xs uppercase tracking-[0.2em] text-white/60">{label}</div>
      <div className="text-2xl font-semibold text-white">
        {value}
        {suffix ?? ""}
      </div>
    </div>
  );
}

function resolveMediaCover(article: ArticleRecord) {
  const candidate = article.previewImageId ?? article.media[0];
  if (!candidate) return null;
  if (candidate.startsWith("http")) return candidate;
  const publicBase = process.env.NEXT_PUBLIC_R2_PUBLIC_URL;
  if (publicBase) return `${publicBase.replace(/\/$/, "")}/${candidate}`;
  return `/api/uploads/${encodeURIComponent(candidate)}`;
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
