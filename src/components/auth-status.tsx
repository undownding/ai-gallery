"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  AUTH_POPUP_MESSAGE,
  AUTH_SESSION_EVENT,
  broadcastSession,
  buildGithubAuthorizeUrl,
  clearStoredSession,
  fetchCurrentUser,
  getStoredSessionUser,
  sanitizeRedirectPath,
  type AuthMessagePayload,
  type SessionUser,
} from "@/lib/client-session";

const POPUP_WIDTH = 520;
const POPUP_HEIGHT = 720;
const POPUP_BASE_FEATURES = "menubar=no,toolbar=no,status=no,location=no";

const getPopupFeatures = () => {
  if (typeof window === "undefined") {
    return `width=${POPUP_WIDTH},height=${POPUP_HEIGHT},${POPUP_BASE_FEATURES}`;
  }

  const screenLeft = window.screenLeft ?? window.screenX ?? 0;
  const screenTop = window.screenTop ?? window.screenY ?? 0;
  const viewportWidth = window.innerWidth ?? document.documentElement.clientWidth ?? screen.width;
  const viewportHeight =
    window.innerHeight ?? document.documentElement.clientHeight ?? screen.height;
  const left = Math.max(screenLeft + (viewportWidth - POPUP_WIDTH) / 2, 0);
  const top = Math.max(screenTop + (viewportHeight - POPUP_HEIGHT) / 2, 0);

  return `width=${POPUP_WIDTH},height=${POPUP_HEIGHT},left=${left},top=${top},${POPUP_BASE_FEATURES}`;
};

export type AuthStatusProps = {
  redirectTo: string;
};

export function AuthStatus({ redirectTo }: AuthStatusProps) {
  const [user, setUser] = useState<SessionUser | null>(() => getStoredSessionUser());
  const [loading, setLoading] = useState(true);
  const [logoutPending, setLogoutPending] = useState(false);
  const [loginPending, setLoginPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const popupRef = useRef<Window | null>(null);
  const targetPath = useMemo(() => sanitizeRedirectPath(redirectTo, "/"), [redirectTo]);

  const refreshSession = useCallback(async (options: { silent?: boolean } = {}) => {
    if (!options.silent) {
      setLoading(true);
      setError(null);
    }
    const nextUser = await fetchCurrentUser();
    setUser(nextUser);
    broadcastSession(nextUser);
    if (!options.silent) {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    const handleSessionEvent = (event: Event) => {
      if (!active) return;
      const nextUser = (event as CustomEvent<SessionUser | null>).detail ?? null;
      setUser(nextUser);
    };

    void refreshSession();

    window.addEventListener(AUTH_SESSION_EVENT, handleSessionEvent);

    return () => {
      active = false;
      window.removeEventListener(AUTH_SESSION_EVENT, handleSessionEvent);
    };
  }, [refreshSession]);

  useEffect(() => {
    const handleAuthMessage = (event: MessageEvent) => {
      if (typeof window === "undefined") return;
      if (event.origin !== window.location.origin) return;
      const payload = event.data as AuthMessagePayload;
      if (!payload || payload.type !== AUTH_POPUP_MESSAGE) {
        return;
      }

      if (popupRef.current && !popupRef.current.closed) {
        popupRef.current.close();
        popupRef.current = null;
      }

      if (payload.status === "success") {
        setLoginPending(false);
        setError(null);
        if (payload.user) {
          setUser(payload.user);
          broadcastSession(payload.user);
          setLoading(false);
        } else {
          void refreshSession({ silent: true });
        }
      } else {
        setLoginPending(false);
        setError(payload.error || "Unable to sign in.");
      }
    };

    window.addEventListener("message", handleAuthMessage);
    return () => window.removeEventListener("message", handleAuthMessage);
  }, [refreshSession]);

  useEffect(() => {
    return () => {
      if (popupRef.current && !popupRef.current.closed) {
        popupRef.current.close();
        popupRef.current = null;
      }
    };
  }, []);

  const handleLogin = useCallback(() => {
    if (typeof window === "undefined") return;
    setError(null);
    setLoginPending(true);

    const callbackUrl = new URL("/auth/github/callback", window.location.origin);
    callbackUrl.searchParams.set("redirectTo", targetPath);

    let authorizeUrl: string;
    try {
      authorizeUrl = buildGithubAuthorizeUrl(callbackUrl.toString());
    } catch (issue) {
      setLoginPending(false);
      setError(issue instanceof Error ? issue.message : "Unable to start OAuth flow.");
      return;
    }

    const popup = window.open(authorizeUrl, "ai-gallery-github", getPopupFeatures());
    if (!popup) {
      setLoginPending(false);
      window.location.href = authorizeUrl;
      return;
    }

    popupRef.current = popup;
    popup.focus();
  }, [targetPath]);

  const handleLogout = useCallback(() => {
    setLogoutPending(true);
    setError(null);
    clearStoredSession();
    setUser(null);
    broadcastSession(null);
    setLogoutPending(false);
  }, []);

  if (loading) {
    return (
      <div className="inline-flex h-12 items-center gap-3 rounded-full border border-[var(--border)] bg-[var(--surface)]/80 px-5 text-sm font-semibold text-[var(--muted)]">
        <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--muted)]" aria-hidden />
        Checking sign-in…
      </div>
    );
  }

  if (user) {
    return (
      <div className="inline-flex min-h-[3rem] items-center gap-3 rounded-full border border-[var(--border)] bg-[var(--surface)]/80 px-5 py-2 text-sm text-[var(--foreground)]">
        <div className="flex items-center gap-2">
          {user.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.avatarUrl}
              alt={user.login}
              className="h-8 w-8 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--border)] text-xs font-semibold">
              {user.login.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="flex flex-col leading-tight">
            <span className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
              Signed in
            </span>
            <span className="font-semibold">{user.name ?? user.login}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          disabled={logoutPending}
          className="text-xs font-semibold text-[var(--muted)] transition hover:text-[var(--accent)] disabled:opacity-60"
        >
          {logoutPending ? "Signing out…" : "Sign out"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleLogin}
        disabled={loginPending}
        className="inline-flex h-12 items-center gap-3 rounded-full border border-[var(--border)] bg-[var(--surface)]/80 px-5 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-60"
      >
        <span className="h-2 w-2 rounded-full bg-[var(--accent)]" aria-hidden />
        {loginPending ? "Waiting for GitHub…" : "Sign in with GitHub"}
      </button>
      {error && <span className="text-xs text-[var(--accent)]">{error}</span>}
    </div>
  );
}
