"use client";

import { useCallback, useEffect, useState } from "react";

import { buildArticlesApiUrl, safeReadError } from "@/lib/http";
import type { ArticleDetail } from "@/types/articles";

const MISSING_ID_ERROR = "Missing article id. Append '?id=<articleId>' to the URL.";

export function useArticleDetail(articleId: string | null) {
  const [article, setArticle] = useState<ArticleDetail | null>(null);
  const [loading, setLoading] = useState(() => Boolean(articleId));
  const [error, setError] = useState<string | null>(null);

  const loadArticle = useCallback(async () => {
    if (!articleId) {
      setArticle(null);
      setError(MISSING_ID_ERROR);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(buildArticlesApiUrl(`/articles/${articleId}`), {
        cache: "no-store",
        credentials: "include",
      });
      if (!response.ok) {
        const message = (await safeReadError(response)) ?? "Unable to load article.";
        throw new Error(message);
      }
      const payload = await response.json();
      const nextArticle = extractArticleDetail(payload);
      if (!nextArticle) {
        throw new Error("Article not found.");
      }
      setArticle(nextArticle);
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

  return {
    articleId,
    article,
    setArticle,
    loading,
    error,
    reload: loadArticle,
  } as const;
}

export function extractArticleDetail(payload: unknown): ArticleDetail | null {
  if (payload == null) {
    return null;
  }

  if (typeof payload === "object" && "data" in (payload as Record<string, unknown>)) {
    const nested = (payload as { data?: ArticleDetail | null }).data;
    return normalizeArticleDetail(nested ?? null);
  }

  return normalizeArticleDetail(payload as ArticleDetail | null);
}

function normalizeArticleDetail(value: ArticleDetail | null): ArticleDetail | null {
  if (!value) return null;
  return {
    ...value,
    media: value.media ?? [],
    sources: value.sources ?? [],
  };
}
