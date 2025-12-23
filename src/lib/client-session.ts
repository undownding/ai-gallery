"use client";

import { buildApiUrl } from "@/lib/http";

export type SessionUser = {
  id: string;
  login: string;
  name?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
  isCreator?: boolean;
};

export type TokenPayloadDto = {
  accessToken: string;
  accessTokenExpireIn: number;
  refreshToken: string;
  refreshTokenExpireIn: number;
  user: SessionUser;
};

export const AUTH_SESSION_EVENT = "ai-gallery:session";
export const AUTH_POPUP_MESSAGE = "ai-gallery:github-auth";

const TOKEN_STORAGE_KEY = "ai-gallery:token-payload";
const USER_STORAGE_KEY = "ai-gallery:session-user";
const TOKEN_SKEW_MS = 5_000;

let userCache: SessionUser | null = null;
let profilePromise: Promise<SessionUser | null> | null = null;
let refreshPromise: Promise<TokenPayloadDto | null> | null = null;

type StoredTokenPayload = {
  accessToken: string;
  accessTokenExpireIn: number;
  refreshToken: string;
  refreshTokenExpireIn: number;
};

type ProfileResponse = {
  user: SessionUser | null;
  unauthorized: boolean;
};

type AuthMessageSuccess = {
  type: typeof AUTH_POPUP_MESSAGE;
  status: "success";
  user: SessionUser | null;
  redirectTo?: string | null;
};

type AuthMessageError = {
  type: typeof AUTH_POPUP_MESSAGE;
  status: "error";
  error: string;
  redirectTo?: string | null;
};

export type AuthMessagePayload = AuthMessageSuccess | AuthMessageError;

type UnknownRecord = Record<string, unknown>;

function getLocalStorage() {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isExpired(timestamp: number, skew = TOKEN_SKEW_MS) {
  if (!timestamp) return true;
  return Date.now() >= timestamp - skew;
}

function readStoredTokens(): StoredTokenPayload | null {
  const storage = getLocalStorage();
  if (!storage) return null;
  const raw = storage.getItem(TOKEN_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as UnknownRecord;
    const accessToken = typeof parsed.accessToken === "string" ? parsed.accessToken : null;
    const refreshToken = typeof parsed.refreshToken === "string" ? parsed.refreshToken : null;
    const accessTokenExpireIn = Number(parsed.accessTokenExpireIn);
    const refreshTokenExpireIn = Number(parsed.refreshTokenExpireIn);
    if (!accessToken || !refreshToken) {
      return null;
    }
    return { accessToken, refreshToken, accessTokenExpireIn, refreshTokenExpireIn };
  } catch {
    return null;
  }
}

function writeStoredTokens(payload: StoredTokenPayload) {
  const storage = getLocalStorage();
  if (!storage) return;
  storage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(payload));
}

function extractUser(payload: unknown): SessionUser | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  if ("data" in payload && payload.data && typeof payload.data === "object") {
    return payload.data as SessionUser;
  }
  if ("user" in payload && payload.user && typeof payload.user === "object") {
    return payload.user as SessionUser;
  }
  return payload as SessionUser;
}

async function requestProfile(accessToken: string): Promise<ProfileResponse> {
  const response = await fetch(buildApiUrl("/users/me"), {
    headers: { Authorization: `Bearer ${accessToken}` },
    credentials: "include",
    cache: "no-store",
  });

  if (response.status === 401 || response.status === 403) {
    return { user: null, unauthorized: true };
  }

  if (!response.ok) {
    const message = `Profile request failed (${response.status})`;
    throw new Error(message);
  }

  const payload = extractUser(await response.json());
  const user = payload && typeof payload.id === "string" ? payload : null;
  return { user, unauthorized: false };
}

async function ensureAccessToken(): Promise<string | null> {
  const stored = readStoredTokens();
  if (stored && !isExpired(stored.accessTokenExpireIn)) {
    return stored.accessToken;
  }
  const refreshed = await refreshTokens();
  return refreshed?.accessToken ?? null;
}

export function getStoredSessionUser() {
  if (userCache) {
    return userCache;
  }
  const storage = getLocalStorage();
  if (!storage) return null;
  const raw = storage.getItem(USER_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SessionUser;
    if (parsed && typeof parsed.id === "string") {
      userCache = parsed;
      return parsed;
    }
  } catch {
    storage.removeItem(USER_STORAGE_KEY);
  }
  return null;
}

export function saveSessionUser(user: SessionUser | null) {
  const storage = getLocalStorage();
  if (!storage) return;
  userCache = user;
  if (user) {
    storage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
  } else {
    storage.removeItem(USER_STORAGE_KEY);
  }
}

export function persistTokenPayload(payload: TokenPayloadDto) {
  const normalized: StoredTokenPayload = {
    accessToken: payload.accessToken,
    refreshToken: payload.refreshToken,
    accessTokenExpireIn: Number(payload.accessTokenExpireIn),
    refreshTokenExpireIn: Number(payload.refreshTokenExpireIn),
  };
  writeStoredTokens(normalized);
  saveSessionUser(payload.user ?? null);
}

export function clearStoredSession() {
  const storage = getLocalStorage();
  if (!storage) return;
  userCache = null;
  storage.removeItem(TOKEN_STORAGE_KEY);
  storage.removeItem(USER_STORAGE_KEY);
}

export function broadcastSession(user: SessionUser | null) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(AUTH_SESSION_EVENT, { detail: user }));
}

export function getValidRefreshToken() {
  const stored = readStoredTokens();
  if (!stored) return null;
  if (isExpired(stored.refreshTokenExpireIn, 0)) {
    return null;
  }
  return stored.refreshToken;
}

export async function getValidAccessToken() {
  return ensureAccessToken();
}

export async function refreshTokens(): Promise<TokenPayloadDto | null> {
  if (refreshPromise) {
    return refreshPromise;
  }
  const refreshToken = getValidRefreshToken();
  if (!refreshToken) {
    return null;
  }

  refreshPromise = (async () => {
    const response = await fetch(buildApiUrl("/auth/token"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
      cache: "no-store",
    });

    if (!response.ok) {
      clearStoredSession();
      return null;
    }

    const payload = (await response.json()) as TokenPayloadDto;
    persistTokenPayload(payload);
    return payload;
  })()
    .catch((error) => {
      console.warn("Unable to refresh tokens", error);
      clearStoredSession();
      return null;
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

export async function fetchCurrentUser() {
  if (profilePromise) {
    return profilePromise;
  }

  profilePromise = (async () => {
    const accessToken = await ensureAccessToken();
    if (!accessToken) {
      clearStoredSession();
      return null;
    }

    try {
      let attempt = await requestProfile(accessToken);
      if (attempt.user) {
        saveSessionUser(attempt.user);
        return attempt.user;
      }

      if (!attempt.unauthorized) {
        return null;
      }

      const refreshed = await refreshTokens();
      if (!refreshed) {
        clearStoredSession();
        return null;
      }

      attempt = await requestProfile(refreshed.accessToken);
      if (attempt.user) {
        saveSessionUser(attempt.user);
        return attempt.user;
      }

      if (attempt.unauthorized) {
        clearStoredSession();
      }
      return null;
    } catch (error) {
      console.warn("Unable to fetch session user", error);
      return null;
    }
  })().finally(() => {
    profilePromise = null;
  });

  return profilePromise;
}

export function isAuthenticated() {
  return Boolean(getStoredSessionUser() && getValidRefreshToken());
}

export function buildGithubAuthorizeUrl(callbackUrl: string) {
  const target = buildApiUrl("/auth/github");
  const url = new URL(target, typeof window !== "undefined" ? window.location.origin : undefined);
  url.searchParams.set("redirectTo", callbackUrl);
  return url.toString();
}

export function sanitizeRedirectPath(candidate: string | null | undefined, fallback = "/") {
  if (!candidate || !candidate.startsWith("/")) {
    return fallback;
  }
  if (candidate.startsWith("//")) {
    return fallback;
  }
  return candidate;
}
