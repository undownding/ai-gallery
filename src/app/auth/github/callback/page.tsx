"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import {
  AUTH_POPUP_MESSAGE,
  broadcastSession,
  fetchCurrentUser,
  persistTokenPayload,
  sanitizeRedirectPath,
  type AuthMessagePayload,
  type TokenPayloadDto,
} from "@/lib/client-session";
import { buildApiUrl } from "@/lib/http";

const SUCCESS_REDIRECT_DELAY_MS = 1_500;
const INLINE_REDIRECT_DELAY_MS = 3_000;

type FlowState = "idle" | "processing" | "success" | "error";

type StatusCopy = {
  title: string;
  body: string;
};

export default function GithubCallbackPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [state, setState] = useState<FlowState>("idle");
  const [statusCopy, setStatusCopy] = useState<StatusCopy>({
    title: "Processing sign-in",
    body: "Hold tight while we finish the GitHub handshake.",
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [redirectTo, setRedirectTo] = useState("/");
  const [countdown, setCountdown] = useState<number | null>(null);
  const [openerAvailable, setOpenerAvailable] = useState(false);

  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const redirectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sessionCode = useMemo(() => searchParams.get("code"), [searchParams]);
  const oauthError = useMemo(() => searchParams.get("error"), [searchParams]);
  const redirectCandidate = useMemo(
    () => sanitizeRedirectPath(searchParams.get("redirectTo"), "/"),
    [searchParams],
  );

  useEffect(() => {
    setRedirectTo(redirectCandidate);
  }, [redirectCandidate]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setOpenerAvailable(Boolean(window.opener && !window.opener.closed));
  }, []);

  useEffect(() => {
    if (state !== "success") return;

    if (openerAvailable) {
      redirectTimeoutRef.current = setTimeout(() => {
        try {
          window.close();
        } catch {
          router.replace(redirectTo);
        }
      }, SUCCESS_REDIRECT_DELAY_MS);
      return () => {
        if (redirectTimeoutRef.current) {
          clearTimeout(redirectTimeoutRef.current);
          redirectTimeoutRef.current = null;
        }
      };
    }

    setCountdown(Math.floor(INLINE_REDIRECT_DELAY_MS / 1000));
    countdownIntervalRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null || prev <= 0) {
          return prev;
        }
        return prev - 1;
      });
    }, 1_000);

    redirectTimeoutRef.current = setTimeout(() => {
      router.replace(redirectTo);
    }, INLINE_REDIRECT_DELAY_MS);

    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
      if (redirectTimeoutRef.current) {
        clearTimeout(redirectTimeoutRef.current);
        redirectTimeoutRef.current = null;
      }
    };
  }, [state, openerAvailable, redirectTo, router]);

  useEffect(() => {
    if (state !== "idle") return;

    if (oauthError) {
      const reason = (() => {
        try {
          return decodeURIComponent(oauthError);
        } catch {
          return oauthError;
        }
      })();
      setState("error");
      setStatusCopy({ title: "Authorization denied", body: "GitHub declined the request." });
      setErrorMessage(reason || "GitHub returned an error.");
      notifyOpener({
        type: AUTH_POPUP_MESSAGE,
        status: "error",
        error: reason,
        redirectTo: redirectCandidate,
      });
      return;
    }

    if (!sessionCode) {
      setState("error");
      setStatusCopy({
        title: "Missing authorization code",
        body: "We could not read the GitHub response.",
      });
      setErrorMessage("The required OAuth code is missing.");
      notifyOpener({
        type: AUTH_POPUP_MESSAGE,
        status: "error",
        error: "Missing OAuth code.",
        redirectTo: redirectCandidate,
      });
      return;
    }

    setState("processing");
    setStatusCopy({
      title: "Finalizing sign-in",
      body: "Swapping the GitHub code for session tokens.",
    });

    (async () => {
      try {
        const tokenPayload = await exchangeGithubCode(sessionCode);
        persistTokenPayload(tokenPayload);
        setStatusCopy({
          title: "Loading your profile",
          body: "Tokens stored successfully. Fetching your account details...",
        });

        const user = await fetchCurrentUser();
        if (!user) {
          throw new Error("Unable to load the current user profile.");
        }

        broadcastSession(user);
        const hasOpener = Boolean(
          typeof window !== "undefined" && window.opener && !window.opener.closed,
        );
        setOpenerAvailable(hasOpener);
        notifyOpener({
          type: AUTH_POPUP_MESSAGE,
          status: "success",
          user,
          redirectTo: redirectCandidate,
        });
        setState("success");
        setStatusCopy({
          title: "Signed in",
          body: hasOpener
            ? "You can close this window now."
            : "Redirecting you back to the gallery...",
        });
        setErrorMessage(null);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to complete sign-in.";
        setState("error");
        setStatusCopy({
          title: "Sign-in failed",
          body: "We hit an error while completing the flow.",
        });
        setErrorMessage(message);
        notifyOpener({
          type: AUTH_POPUP_MESSAGE,
          status: "error",
          error: message,
          redirectTo: redirectCandidate,
        });
      }
    })();
  }, [state, oauthError, sessionCode, redirectCandidate]);

  useEffect(() => {
    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
      if (redirectTimeoutRef.current) {
        clearTimeout(redirectTimeoutRef.current);
        redirectTimeoutRef.current = null;
      }
    };
  }, []);

  const showCountdown = state === "success" && !openerAvailable && countdown !== null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--background)] px-4 py-16">
      <div className="w-full max-w-lg rounded-[32px] border border-[var(--border)] bg-[var(--surface)]/95 p-10 text-center shadow-soft">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--muted)]">
          GitHub OAuth
        </p>
        <h1 className="mt-4 text-3xl font-semibold text-[var(--foreground)]">{statusCopy.title}</h1>
        <p className="mt-3 text-sm text-[var(--muted)]">{statusCopy.body}</p>
        {errorMessage && (
          <p className="mt-4 rounded-2xl border border-[var(--accent)]/40 bg-[var(--accent)]/5 px-4 py-3 text-sm text-[var(--accent)]">
            {errorMessage}
          </p>
        )}
        {showCountdown && (
          <p className="mt-4 text-xs uppercase tracking-[0.35em] text-[var(--muted)]">
            Redirecting in {countdown}s…
          </p>
        )}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => {
              if (openerAvailable) {
                try {
                  window.close();
                } catch {
                  router.replace(redirectTo);
                }
              } else {
                router.replace(redirectTo);
              }
            }}
            className="rounded-full border border-[var(--border)] px-6 py-3 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            Continue
          </button>
          <Link
            href="/"
            className="rounded-full border border-transparent px-6 py-3 text-sm font-semibold text-[var(--muted)] transition hover:text-[var(--foreground)]"
          >
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}

async function exchangeGithubCode(code: string) {
  const response = await fetch(buildApiUrl("/auth/github/token"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
    cache: "no-store",
  });

  if (!response.ok) {
    const message = `Token exchange failed (${response.status}).`;
    throw new Error(message);
  }

  return (await response.json()) as TokenPayloadDto;
}

function notifyOpener(payload: AuthMessagePayload) {
  if (typeof window === "undefined") return;
  try {
    window.opener?.postMessage(payload, window.location.origin);
  } catch {
    // Ignore cross-window failures.
  }
}
