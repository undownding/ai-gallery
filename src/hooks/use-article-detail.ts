"use client";

import { useCallback, useEffect, useState } from "react";

import type { ArticleResponsePayload } from "@/lib/articles";
import { safeReadError } from "@/lib/http";

const MISSING_ID_ERROR = "Missing article id. Append '?id=<articleId>' to the URL.";

export function useArticleDetail(articleId: string | null) {
  const [article, setArticle] = useState<ArticleResponsePayload | null>(null);
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
      const response = await fetch(`/api/articles/${articleId}`, { cache: "no-store" });
      if (!response.ok) {
        const message = (await safeReadError(response)) ?? "Unable to load article.";
        throw new Error(message);
      }
      const payload = (await response.json()) as { data: ArticleResponsePayload };
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

  return {
    articleId,
    article,
    setArticle,
    loading,
    error,
    reload: loadArticle,
  } as const;
}
