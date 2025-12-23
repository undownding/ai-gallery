const ARTICLES_API_BASE = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "";

export function buildApiUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (!ARTICLES_API_BASE) {
    return normalizedPath;
  }
  return `${ARTICLES_API_BASE}${normalizedPath}`;
}

export async function safeReadError(response: Response): Promise<string | null> {
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
