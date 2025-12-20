"use client";
/* eslint-disable @next/next/no-img-element */

import { useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";

import { AuthStatus } from "@/components/auth-status";
import { ThemeToggle, useThemePreference } from "@/components/theme-toggle";
import { useArticleDetail } from "@/hooks/use-article-detail";
import type { ArticleAssetPayload } from "@/lib/articles";
import { resolveUploadUrl } from "@/lib/uploads-client";

const sectionTitleClasses = "text-xs uppercase tracking-[0.4em] text-[var(--muted)]";

type ArticleAsset = ArticleAssetPayload;

type PageParams = {
  params: Promise<{
    id: string;
  }>;
};

export default function PromptDetailPage({ params }: PageParams) {
  const { article, loading, error, reload } = useArticleDetail(params);
  const [themeMode, setThemeMode] = useThemePreference();
  const router = useRouter();
  const pathname = usePathname();

  const redirectTarget = pathname ?? "/";
  const sources = article?.sources ?? [];
  const supportingMedia = useMemo(() => {
    if (!article) return [] as ArticleAsset[];
    if (article.media.length) return article.media;
    return article.thumbnailImage ? [article.thumbnailImage] : [];
  }, [article]);

  const metadata = useMemo(
    () => ({
      created: article ? formatDate(article.createdAt) : "—",
      updated: article ? formatDate(article.updatedAt) : "—",
    }),
    [article],
  );

  return (
    <div className="app-shell px-4 pb-20 pt-10 sm:px-6 lg:px-12">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-10">
        <header className="rounded-[40px] border border-[var(--border)] bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.12),_transparent_55%)] p-8 text-[var(--foreground)] shadow-soft">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="space-y-4">
              <button
                type="button"
                onClick={() => router.push(article ? `/articles/${article.id}` : "/articles")}
                className="text-[11px] font-semibold uppercase tracking-[0.35em] text-[var(--muted)] transition hover:text-[var(--accent)]"
              >
                Back to story
              </button>
              <h1 className="text-4xl font-serif sm:text-5xl">{article?.title ?? "Prompt detail"}</h1>
              <p className="text-sm text-[var(--muted)]">
                Full prompt transcript & reference sources
              </p>
            </div>
            <div className="flex flex-col items-end gap-3 sm:flex-row sm:items-center sm:gap-4">
              <ThemeToggle mode={themeMode} onChange={setThemeMode} />
              <AuthStatus redirectTo={redirectTarget} />
            </div>
          </div>
          <div className="mt-8 grid gap-4 text-sm sm:grid-cols-2">
            <InfoToken label="Created" value={metadata.created} />
            <InfoToken label="Updated" value={metadata.updated} />
          </div>
        </header>

        {loading ? (
          <div className="rounded-[32px] border border-[var(--border)] bg-[var(--surface)]/90 p-8 text-center text-sm text-[var(--muted)]">
            Loading prompt…
          </div>
        ) : error ? (
          <div className="space-y-4 rounded-[32px] border border-[var(--border)] bg-[var(--surface)]/90 p-8 text-center text-sm text-[var(--muted)]">
            <p>{error}</p>
            <button
              type="button"
              onClick={reload}
              className="rounded-full border border-[var(--border)] px-5 py-2 text-xs font-semibold text-[var(--foreground)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              Retry
            </button>
          </div>
        ) : article ? (
          <div className="space-y-10">
            <section className="rounded-[36px] border border-[var(--border)] bg-[var(--surface)]/95 p-8 shadow-soft">
              <p className={sectionTitleClasses}>Prompt</p>
              <h2 className="mt-2 text-3xl font-semibold text-[var(--foreground)]">完整提示词</h2>
              <p className="mt-6 whitespace-pre-line text-base leading-relaxed text-[var(--foreground)]">
                {article.text}
              </p>
            </section>

            <section className="rounded-[36px] border border-[var(--border)] bg-[var(--surface)]/95 p-8 shadow-soft">
              <p className={sectionTitleClasses}>Reference sources</p>
              <h2 className="mt-2 text-3xl font-semibold text-[var(--foreground)]">素材来源</h2>
              {sources.length ? (
                <div className="mt-6 grid gap-6 sm:grid-cols-2">
                  {sources.map((asset, index) => (
                    <SourceCard key={asset.id} asset={asset} index={index} />
                  ))}
                </div>
              ) : (
                <div className="mt-6 rounded-3xl border border-dashed border-[var(--border)] bg-[var(--background)]/80 p-8 text-center text-sm text-[var(--muted)]">
                  没有上传引用素材。
                </div>
              )}
            </section>

            <section className="rounded-[36px] border border-[var(--border)] bg-[var(--surface)]/95 p-8 shadow-soft">
              <p className={sectionTitleClasses}>Supporting media</p>
              <h2 className="mt-2 text-3xl font-semibold text-[var(--foreground)]">灵感画面</h2>
              {supportingMedia.length ? (
                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  {supportingMedia.map((asset) => {
                    const src = resolveUploadUrl(asset.key);
                    if (!src) return null;
                    return (
                      <img
                        key={asset.id}
                        src={src}
                        alt={article.title ?? "Article media"}
                        className="h-64 w-full rounded-[28px] object-cover"
                      />
                    );
                  })}
                </div>
              ) : (
                <p className="mt-6 text-sm text-[var(--muted)]">没有附加的媒体文件。</p>
              )}
            </section>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function InfoToken({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)]/80 px-6 py-4">
      <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">{label}</p>
      <p className="text-xl font-semibold text-[var(--foreground)]">{value}</p>
    </div>
  );
}

function SourceCard({ asset, index }: { asset: ArticleAsset; index: number }) {
  const src = resolveUploadUrl(asset.key);
  if (!src) return null;
  return (
    <article className="space-y-4 rounded-[28px] border border-[var(--border)] bg-[var(--background)]/80 p-5">
      <div className="relative overflow-hidden rounded-[20px] border border-[var(--border)]">
        <img src={src} alt={`Source ${index + 1}`} className="h-64 w-full object-cover" />
        <span className="absolute left-4 top-4 rounded-full bg-black/60 px-3 py-1 text-xs font-semibold text-white">
          #{index + 1}
        </span>
      </div>
      <a
        href={src}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--foreground)] underline-offset-4 hover:underline"
      >
        打开原图
        <span aria-hidden>↗</span>
      </a>
      <p className="text-xs text-[var(--muted)]">文件键：{asset.key}</p>
    </article>
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
