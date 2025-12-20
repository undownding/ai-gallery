"use client";

import { useCallback, useEffect, useState } from "react";

import type { ArticleResponsePayload } from "@/lib/articles";
import { safeReadError } from "@/lib/http";

export function useArticleDetail(paramsPromise: Promise<{ id: string }>) {
  const [articleId, setArticleId] = useState<string | null>(null);
  const [article, setArticle] = useState<ArticleResponsePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const resolved = await paramsPromise;
        if (isMounted) {
          setArticleId(resolved.id);
        }
      } catch (issue) {
        if (!isMounted) return;
        setArticleId(null);
        setError(issue instanceof Error ? issue.message : "Unable to load article.");
        setLoading(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [paramsPromise]);

  const loadArticle = useCallback(async () => {
    if (!articleId) return;
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
