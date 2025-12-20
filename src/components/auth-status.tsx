"use client";

import { useEffect, useMemo, useState } from "react";

export type SessionUser = {
  id: string;
  login: string;
  name?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
  isCreator?: boolean;
};

type SessionResponse = {
  user: SessionUser | null;
};

export const AUTH_SESSION_EVENT = "ai-gallery:session";

type AuthStatusProps = {
  redirectTo: string;
};

function broadcastSession(user: SessionUser | null) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(AUTH_SESSION_EVENT, { detail: user }));
}

export function AuthStatus({ redirectTo }: AuthStatusProps) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [logoutPending, setLogoutPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/auth/session", { cache: "no-store" });
        if (!res.ok && res.status !== 401 && res.status !== 404) {
          throw new Error("Unable to load session.");
        }
        const payload = (await res.json()) as SessionResponse;
        if (active) {
          const nextUser = payload?.user ?? null;
          setUser(nextUser);
          broadcastSession(nextUser);
        }
      } catch (sessionError) {
        if (active) {
          setError(sessionError instanceof Error ? sessionError.message : "Session error");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const loginHref = useMemo(() => {
    const target = redirectTo.startsWith("/") ? redirectTo : "/";
    return `/api/auth/github?redirectTo=${encodeURIComponent(target)}`;
  }, [redirectTo]);

  const handleLogout = async () => {
    setLogoutPending(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (!res.ok) {
        throw new Error("Logout failed.");
      }
      setUser(null);
      broadcastSession(null);
    } catch (logoutError) {
      setError(logoutError instanceof Error ? logoutError.message : "Logout failed");
    } finally {
      setLogoutPending(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-full border border-[var(--border)] px-4 py-2 text-xs text-[var(--muted)]">
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
            <img src={user.avatarUrl} alt={user.login} className="h-8 w-8 rounded-full object-cover" />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--border)] text-xs font-semibold">
              {user.login.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="flex flex-col leading-tight">
            <span className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Signed in</span>
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
      <a
        href={loginHref}
        className="inline-flex h-12 items-center gap-3 rounded-full border border-[var(--border)] bg-[var(--surface)]/80 px-5 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
      >
        <span className="h-2 w-2 rounded-full bg-[var(--accent)]" aria-hidden />
        Sign in with GitHub
      </a>
      {error && <span className="text-xs text-[var(--accent)]">{error}</span>}
    </div>
  );
}
