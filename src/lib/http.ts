const ARTICLES_API_BASE = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "";

export function buildApiUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (!ARTICLES_API_BASE) {
    return normalizedPath;
  }
  return `${ARTICLES_API_BASE}${normalizedPath}`;
}

function formatErrorValue(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    const merged = value
      .map((entry) => formatErrorValue(entry))
      .filter((entry): entry is string => Boolean(entry))
      .join(", ");
    return merged.length ? merged : null;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

export async function safeReadError(response: Response): Promise<string | null> {
  try {
    const payload = (await response.clone().json()) as {
      error?: unknown;
      message?: unknown;
      body?: unknown;
      detail?: unknown;
      details?: unknown;
    };
    const parts = [payload.body, payload.error, payload.message, payload.detail, payload.details]
      .map((value) => formatErrorValue(value))
      .filter((value): value is string => Boolean(value));
    if (parts.length) {
      return Array.from(new Set(parts)).join(" — ");
    }
  } catch {
    // fall back to text
  }

  try {
    const text = await response.text();
    return text || null;
  } catch {
    return null;
  }
}
