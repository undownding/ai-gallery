"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";

import { AuthStatus } from "@/components/auth-status";
import { ThemeToggle, useThemePreference } from "@/components/theme-toggle";
import { StableMarkdownTypewriter } from "@/components/stable-markdown-typewriter";
import type { AspectRatio, ImageSize } from "@/lib/gemini";
import {
  AUTH_POPUP_MESSAGE,
  AUTH_SESSION_EVENT,
  buildGithubAuthorizeUrl,
  fetchCurrentUser,
  getStoredSessionUser,
  getValidAccessToken,
  sanitizeRedirectPath,
  type AuthMessagePayload,
  type SessionUser,
} from "@/lib/client-session";
import { buildApiUrl, safeReadError } from "@/lib/http";

const MAX_REFERENCES = 8;
const nextTypewriterKey = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

const aspectRatioPresets: { value: AspectRatio; label: string; hint: string }[] = [
  { value: "1:1", label: "Square", hint: "Album covers, avatars" },
  { value: "4:5", label: "Portrait", hint: "Editorial and fashion" },
  { value: "3:4", label: "Story", hint: "Mobile-first narratives" },
  { value: "16:9", label: "Cinematic", hint: "Landscape and film stills" },
  { value: "21:9", label: "Ultra-wide", hint: "Billboard mockups" },
];

const AUTH_POPUP_FEATURES = "width=520,height=720,menubar=no,toolbar=no,status=no,location=no";

const resolutionPresets: { value: ImageSize; label: string; hint: string }[] = [
  { value: "1K", label: "1K", hint: "Fast draft" },
  { value: "2K", label: "2K", hint: "Social ready" },
  { value: "4K", label: "4K", hint: "Print detail" },
];

type UploadRecord = {
  id: string;
  key: string;
  eTag?: string;
  articleId?: string | null;
  createdAt?: string;
};

type ReferenceAsset = UploadRecord & { previewUrl?: string };

type StreamStatus = "idle" | "running" | "success" | "error";

type ArticleCreationState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "success"; articleId: string }
  | { status: "error"; error: string };

type ParsedEvent = {
  event: string;
  data: unknown;
};

type GenerationRequestPayload = {
  prompt: string;
  aspectRatio?: AspectRatio;
  imageSize?: ImageSize;
  referenceUploadIds: string[];
};

type TextChunkPayload = {
  text?: string;
};

type DoneEventPayload = {
  text?: string | null;
  upload?: UploadRecord | null;
  response?: unknown;
};

export default function GeneratePage() {
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio | "">("");
  const [imageSize, setImageSize] = useState<ImageSize | "">("");
  const [referenceUploads, setReferenceUploads] = useState<ReferenceAsset[]>([]);
  const [status, setStatus] = useState<StreamStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [previewUpload, setPreviewUpload] = useState<UploadRecord | null>(null);
  const [generatedUploads, setGeneratedUploads] = useState<UploadRecord[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(() => getStoredSessionUser());
  const [sessionLoading, setSessionLoading] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [inlineLoginPending, setInlineLoginPending] = useState(false);
  const [showRenderOptions, setShowRenderOptions] = useState(false);
  const [articleCreationState, setArticleCreationState] = useState<ArticleCreationState>({
    status: "idle",
  });
  const [submittedPrompt, setSubmittedPrompt] = useState<string | null>(null);
  const [submittedReferenceIds, setSubmittedReferenceIds] = useState<string[]>([]);
  const [redirectCountdown, setRedirectCountdown] = useState<number | null>(null);
  const [themeMode, setThemeMode] = useThemePreference();
  const [streamedText, setStreamedText] = useState<string>("");
  const [generationDuration, setGenerationDuration] = useState(0);
  const [typewriterSessionKey, setTypewriterSessionKey] = useState(() => nextTypewriterKey());
  const dismissError = useCallback(() => setErrorMessage(null), []);

  const pathname = usePathname();
  const router = useRouter();

  const controllerRef = useRef<AbortController | null>(null);
  const articlePersistControllerRef = useRef<AbortController | null>(null);
  const inlinePopupRef = useRef<Window | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previewUrlRegistry = useRef(new Set<string>());
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const thinkScrollRef = useRef<HTMLDivElement | null>(null);
  const hasImageChunkRef = useRef(false);

  const scrollToEnd = useCallback(() => {
    if (!thinkScrollRef.current) return;
    thinkScrollRef.current.scrollTop = thinkScrollRef.current.scrollHeight;
  }, []);

  const resetStreamedNarration = useCallback(() => {
    setStreamedText("");
    setTypewriterSessionKey(nextTypewriterKey());
  }, []);

  const clearRedirectTimers = useCallback(() => {
    if (redirectTimerRef.current) {
      clearTimeout(redirectTimerRef.current);
      redirectTimerRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setRedirectCountdown(null);
    resetStreamedNarration();
  }, [resetStreamedNarration]);

  useEffect(() => {
    return () => {
      controllerRef.current?.abort();
      articlePersistControllerRef.current?.abort();
      if (inlinePopupRef.current && !inlinePopupRef.current.closed) {
        inlinePopupRef.current.close();
      }
      previewUrlRegistry.current.forEach((url) => URL.revokeObjectURL(url));
      previewUrlRegistry.current.clear();
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      clearRedirectTimers();
    };
  }, [clearRedirectTimers]);

  useEffect(() => {
    if (status === "running") {
      setGenerationDuration(0);
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
      durationIntervalRef.current = setInterval(() => {
        setGenerationDuration((prev) => prev + 1);
      }, 1000);
      return;
    }

    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
  }, [status]);

  useEffect(() => {
    scrollToEnd();
  }, [streamedText, scrollToEnd]);

  useEffect(() => {
    let active = true;

    const applySession = (user: SessionUser | null) => {
      if (!active) return;
      setSessionError(null);
      setSessionUser(user);
      setSessionLoading(false);
    };

    const handleSessionEvent = (event: Event) => {
      const detail = (event as CustomEvent<SessionUser | null>).detail ?? null;
      applySession(detail);
    };

    window.addEventListener(AUTH_SESSION_EVENT, handleSessionEvent);

    (async () => {
      setSessionLoading(true);
      const user = await fetchCurrentUser();
      applySession(user);
    })();

    return () => {
      active = false;
      window.removeEventListener(AUTH_SESSION_EVENT, handleSessionEvent);
    };
  }, []);

  useEffect(() => {
    const handleAuthMessage = (event: MessageEvent) => {
      if (typeof window === "undefined") return;
      if (event.origin !== window.location.origin) return;
      const payload = event.data as AuthMessagePayload;
      if (!payload || payload.type !== AUTH_POPUP_MESSAGE) {
        return;
      }

      if (inlinePopupRef.current && !inlinePopupRef.current.closed) {
        inlinePopupRef.current.close();
        inlinePopupRef.current = null;
      }

      setInlineLoginPending(false);
      if (payload.status === "error") {
        setSessionError(payload.error || "Unable to sign in.");
      } else {
        setSessionError(null);
      }
    };

    window.addEventListener("message", handleAuthMessage);
    return () => window.removeEventListener("message", handleAuthMessage);
  }, []);

  useEffect(() => {
    if (sessionUser) {
      setInlineLoginPending(false);
      setSessionError(null);
    }
  }, [sessionUser]);

  const closeRenderOptions = useCallback(() => {
    setShowRenderOptions(false);
  }, []);

  useEffect(() => {
    if (!showRenderOptions) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeRenderOptions();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showRenderOptions, closeRenderOptions]);

  const resetRenderOptions = useCallback(() => {
    setAspectRatio("");
    setImageSize("");
  }, []);

  const canSubmit = prompt.trim().length > 0 && status !== "running" && Boolean(sessionUser);

  const generatedImageUrl = useMemo(() => {
    if (!previewUpload) return null;
    return resolveUploadUrl(previewUpload.key);
  }, [previewUpload]);

  const mediaUploadIds = useMemo(() => {
    if (!generatedUploads.length) {
      return [];
    }
    const lastId = generatedUploads[generatedUploads.length - 1]?.id;
    return lastId ? [lastId] : [];
  }, [generatedUploads]);

  const inlineLoginTarget = useMemo(() => {
    const candidate = pathname && pathname.startsWith("/") ? pathname : "/generate";
    return sanitizeRedirectPath(candidate, "/generate");
  }, [pathname]);

  const handleInlineLogin = useCallback(() => {
    if (typeof window === "undefined") return;
    setSessionError(null);
    setInlineLoginPending(true);

    const callbackUrl = new URL("/auth/github/callback", window.location.origin);
    callbackUrl.searchParams.set("redirectTo", inlineLoginTarget);

    let authorizeUrl: string;
    try {
      authorizeUrl = buildGithubAuthorizeUrl(callbackUrl.toString());
    } catch (issue) {
      setInlineLoginPending(false);
      setSessionError(issue instanceof Error ? issue.message : "Unable to start OAuth flow.");
      return;
    }

    const popup = window.open(authorizeUrl, "ai-gallery-github", AUTH_POPUP_FEATURES);
    if (!popup) {
      setInlineLoginPending(false);
      window.location.href = authorizeUrl;
      return;
    }

    inlinePopupRef.current = popup;
    popup.focus();
  }, [inlineLoginTarget]);

  const renderOptionsLabel = useMemo(() => {
    const sizeLabel = imageSize || "Auto";
    const ratioLabel = aspectRatio || "Auto";
    return `${sizeLabel} · ${ratioLabel}`;
  }, [aspectRatio, imageSize]);

  const creationStatus = articleCreationState.status;
  const createdArticleId = creationStatus === "success" ? articleCreationState.articleId : null;
  const creationError = creationStatus === "error" ? articleCreationState.error : null;

  const persistArticleDraft = useCallback(async () => {
    if (status !== "success") return;
    if (!submittedPrompt) return;
    if (!mediaUploadIds.length) return;
    if (!sessionUser) return;
    if (creationStatus !== "idle") return;

    setArticleCreationState({ status: "pending" });

    articlePersistControllerRef.current?.abort();
    const controller = new AbortController();
    articlePersistControllerRef.current = controller;

    try {
      const accessToken = await getValidAccessToken();
      if (!accessToken) {
        throw new Error("Session expired. Please sign in again.");
      }

      const response = await fetch(buildApiUrl("/articles"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          text: submittedPrompt,
          mediaId: mediaUploadIds,
          sourcesId: submittedReferenceIds,
        }),
        signal: controller.signal,
        credentials: "include",
      });

      if (!response.ok) {
        const message = (await safeReadError(response)) ?? "Unable to save article.";
        throw new Error(message);
      }

      const payload = (await response.json()) as { id?: string };
      const articleId = payload?.id;
      if (!articleId) {
        throw new Error("Article id is missing in the response.");
      }

      setArticleCreationState({ status: "success", articleId });
    } catch (error) {
      if ((error as DOMException)?.name === "AbortError") {
        return;
      }
      setArticleCreationState({
        status: "error",
        error: error instanceof Error ? error.message : "Unable to save article.",
      });
    } finally {
      if (articlePersistControllerRef.current === controller) {
        articlePersistControllerRef.current = null;
      }
    }
  }, [status, submittedPrompt, mediaUploadIds, submittedReferenceIds, sessionUser, creationStatus]);

  useEffect(() => {
    if (status !== "success") return;
    void persistArticleDraft();
  }, [status, persistArticleDraft]);

  useEffect(() => {
    if (creationStatus !== "success" || !createdArticleId) {
      return;
    }

    clearRedirectTimers();
    setRedirectCountdown(5);

    countdownIntervalRef.current = setInterval(() => {
      setRedirectCountdown((prev) => {
        if (prev === null) return prev;
        return prev > 0 ? prev - 1 : 0;
      });
    }, 1000);

    redirectTimerRef.current = setTimeout(() => {
      router.push(`/article?id=${createdArticleId}`);
    }, 5000);

    return () => {
      clearRedirectTimers();
    };
  }, [creationStatus, createdArticleId, clearRedirectTimers, router]);

  const handleImmediateRedirect = useCallback(() => {
    if (!createdArticleId) return;
    clearRedirectTimers();
    router.push(`/article?id=${createdArticleId}`);
  }, [createdArticleId, clearRedirectTimers, router]);

  const retryArticleSave = useCallback(() => {
    setArticleCreationState({ status: "idle" });
  }, []);

  const handleFileSelection = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      if (!files.length) return;
      if (referenceUploads.length >= MAX_REFERENCES) return;

      setUploadingFiles(true);
      setErrorMessage(null);

      try {
        const accessToken = await getValidAccessToken();
        if (!accessToken) {
          throw new Error("Session expired. Please sign in again.");
        }
        const uploadUrl = buildApiUrl("/upload/image");

        const capacity = MAX_REFERENCES - referenceUploads.length;
        const trimmedFiles = files.slice(0, capacity);
        for (const file of trimmedFiles) {
          const form = new FormData();
          form.append("file", file);

          const res = await fetch(uploadUrl, {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
            body: form,
            credentials: "include",
          });

          if (!res.ok) {
            const message = await safeReadError(res);
            throw new Error(message || "Upload failed. Try again.");
          }

          const payload = await res.json();
          const upload = parseUploadResponse(payload);
          if (upload?.id && upload.key) {
            const previewUrl = URL.createObjectURL(file);
            previewUrlRegistry.current.add(previewUrl);
            setReferenceUploads((prev) => [...prev, { ...upload, previewUrl }]);
          }
        }
      } catch (uploadError) {
        setErrorMessage(
          uploadError instanceof Error ? uploadError.message : "Unable to upload file.",
        );
      } finally {
        setUploadingFiles(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    },
    [referenceUploads.length],
  );

  const removeReference = useCallback((uploadId: string) => {
    setReferenceUploads((prev) => {
      const next = prev.filter((item) => {
        if (item.id === uploadId && item.previewUrl) {
          URL.revokeObjectURL(item.previewUrl);
          previewUrlRegistry.current.delete(item.previewUrl);
        }
        return item.id !== uploadId;
      });
      return next;
    });
  }, []);

  const stopGeneration = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    articlePersistControllerRef.current?.abort();
    articlePersistControllerRef.current = null;
    setStatus("idle");
    setGeneratedUploads([]);
    setArticleCreationState({ status: "idle" });
    setSubmittedPrompt(null);
    setSubmittedReferenceIds([]);
    resetStreamedNarration();
    hasImageChunkRef.current = false;
    clearRedirectTimers();
  }, [clearRedirectTimers, resetStreamedNarration]);

  const handleEvent = useCallback((packet: ParsedEvent) => {
    console.log("handleEvent:", packet);
    if (!packet) return;
    switch (packet.event) {
      case "text": {
        const textPayload = packet.data as TextChunkPayload;
        if (typeof textPayload?.text === "string" && textPayload.text) {
          setStreamedText((prev) => `${prev}${textPayload.text}`);
        }
        break;
      }
      case "image": {
        const uploadRecord = isUploadRecord(packet.data) ? (packet.data as UploadRecord) : null;
        if (uploadRecord) {
          hasImageChunkRef.current = true;
          setPreviewUpload(uploadRecord);
          setGeneratedUploads((prev) => {
            if (prev.some((item) => item.id === uploadRecord.id)) {
              return prev;
            }
            return [...prev, uploadRecord];
          });
        }
        break;
      }
      case "done": {
        const payload = packet.data as DoneEventPayload;
        const uploadRecord = isUploadRecord(payload?.upload)
          ? (payload?.upload as UploadRecord)
          : null;
        if (uploadRecord) {
          hasImageChunkRef.current = true;
          setPreviewUpload(uploadRecord);
          setGeneratedUploads((prev) => {
            if (prev.some((item) => item.id === uploadRecord.id)) {
              return prev;
            }
            return [...prev, uploadRecord];
          });
        }
        if (typeof payload?.text === "string" && payload.text) {
          setStreamedText(payload.text);
        }
        setStatus("success");
        break;
      }
      case "error": {
        const message =
          typeof (packet.data as { message?: string })?.message === "string"
            ? (packet.data as { message?: string }).message!
            : "Generation failed.";
        setErrorMessage(message);
        setStatus("error");
        break;
      }
      default:
        break;
    }
  }, []);

  const handleGenerate = useCallback(async () => {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) return;
    if (!sessionUser) {
      setErrorMessage("Sign in to generate an image.");
      return;
    }

    const accessToken = await getValidAccessToken();
    if (!accessToken) {
      setErrorMessage("Session expired. Please sign in again.");
      setStatus("error");
      return;
    }

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    clearRedirectTimers();
    setStatus("running");
    setErrorMessage(null);
    setPreviewUpload(null);
    setGeneratedUploads([]);
    setArticleCreationState({ status: "idle" });
    setSubmittedPrompt(trimmedPrompt);
    setSubmittedReferenceIds(referenceUploads.map((upload) => upload.id));
    resetStreamedNarration();
    hasImageChunkRef.current = false;

    const body: GenerationRequestPayload = {
      prompt: trimmedPrompt,
      aspectRatio: aspectRatio || undefined,
      imageSize: imageSize || undefined,
      referenceUploadIds: referenceUploads.map((upload) => upload.id),
    };

    try {
      const stream = await openGenerationStream(body, controller.signal, accessToken);
      await consumeStream(stream, handleEvent);
      setStatus((current) =>
        current === "running" && hasImageChunkRef.current ? "success" : current,
      );
    } catch (error) {
      if ((error as DOMException)?.name === "AbortError") {
        return;
      }
      setStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      controllerRef.current = null;
    }
  }, [
    prompt,
    aspectRatio,
    imageSize,
    referenceUploads,
    handleEvent,
    sessionUser,
    clearRedirectTimers,
    resetStreamedNarration,
  ]);

  const actionButtonLabel = status === "running" ? "STOP" : "Generte Shot";
  const actionButtonHandler = status === "running" ? stopGeneration : handleGenerate;
  const actionButtonDisabled = status !== "running" && !canSubmit;
  const actionButtonClasses =
    status === "running"
      ? "ml-auto w-full rounded-full border border-[var(--border)] bg-[var(--surface)]/80 px-6 py-3 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--accent)] hover:text-[var(--accent)] sm:w-auto"
      : "ml-auto w-full rounded-full bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto";

  return (
    <>
      {errorMessage && <ErrorBanner message={errorMessage} onDismiss={dismissError} />}
      <div className="app-shell px-4 py-10 sm:px-6 lg:px-10">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-10">
          <section className="relative overflow-hidden rounded-[32px] border border-[var(--border)] bg-[var(--surface)]/95 px-6 py-8 text-[var(--foreground)] shadow-soft sm:px-8 sm:py-10">
            <div className="pointer-events-none absolute inset-0 opacity-70">
              <div className="absolute -left-16 top-6 h-40 w-40 rounded-full bg-[var(--accent-soft)] blur-2xl" />
              <div className="absolute inset-x-10 bottom-0 h-40 rounded-[60px] bg-gradient-to-r from-[var(--accent-soft)] via-transparent to-[var(--accent-soft)] blur-3xl" />
            </div>
            <div className="pointer-events-auto absolute right-3 top-3 z-20 flex flex-col gap-2 sm:right-6 sm:top-6 sm:flex-row sm:gap-3">
              <ThemeToggle mode={themeMode} onChange={setThemeMode} />
              <AuthStatus redirectTo={pathname ?? "/generate"} />
            </div>
            <div className="relative z-10 flex flex-col gap-8 pt-16 sm:pt-20">
              <div className="space-y-3 max-w-3xl">
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--muted)]">
                  Playground
                </p>
                <div className="space-y-2">
                  <h1 className="text-3xl font-semibold sm:text-4xl">
                    Craft bespoke shots in seconds
                  </h1>
                  <p className="max-w-2xl text-sm text-[var(--muted)] sm:text-base">
                    Feed the Gemini image preview model with a cinematic brief, weave in references,
                    and let the stream narrate each render hand-off.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {sessionLoading ? (
            <div className="rounded-[32px] border border-[var(--border)] bg-[var(--surface)]/80 p-10 text-center text-sm text-[var(--muted)] shadow-soft">
              Preparing workspace…
            </div>
          ) : !sessionUser ? (
            <div className="rounded-[32px] border border-[var(--border)] bg-[var(--surface)]/90 p-10 text-center shadow-soft">
              <h2 className="text-2xl font-semibold">Sign in to start generating</h2>
              <p className="mt-3 text-sm text-[var(--muted)]">
                Use your GitHub account to unlock the Gemini playground and persist reference
                uploads.
              </p>
              <button
                type="button"
                onClick={handleInlineLogin}
                disabled={inlineLoginPending}
                className="mt-6 inline-flex items-center justify-center rounded-full bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {inlineLoginPending ? "Opening GitHub…" : "Sign in with GitHub"}
              </button>
              {sessionError && <p className="mt-3 text-xs text-[var(--accent)]">{sessionError}</p>}
            </div>
          ) : (
            <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
              <form className="flex flex-col gap-6" onSubmit={(event) => event.preventDefault()}>
                <FieldGroup
                  label="Image selection"
                  description="Optional. Attach up to eight guiding shots. Files persist immediately and stay in a single scroll row."
                >
                  <div className="rounded-[30px] border border-dashed border-[var(--border)] bg-[var(--surface)]/70 p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm text-[var(--muted)]">
                        PNG, JPG, or WEBP · {referenceUploads.length}/{MAX_REFERENCES} linked
                      </p>
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]">
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={handleFileSelection}
                          className="sr-only"
                          disabled={referenceUploads.length >= MAX_REFERENCES || uploadingFiles}
                        />
                        {uploadingFiles ? "Uploading..." : "Add references"}
                      </label>
                    </div>

                    <div className="mt-4 overflow-x-auto pb-2">
                      <div className="flex min-h-[12rem] gap-4">
                        {referenceUploads.map((asset) => {
                          const preview = asset.previewUrl ?? resolveUploadUrl(asset.key);
                          return (
                            <div
                              key={asset.id}
                              className="relative h-48 w-48 shrink-0 overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--surface)] shadow-soft"
                            >
                              {preview ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={preview}
                                  alt="Reference upload"
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <div className="flex h-full items-center justify-center px-4 text-center text-xs text-[var(--muted)]">
                                  Configure NEXT_PUBLIC_R2_PUBLIC_URL to preview stored keys.
                                </div>
                              )}
                              <button
                                type="button"
                                onClick={() => removeReference(asset.id)}
                                className="absolute right-3 top-3 rounded-full border border-[var(--border)] bg-[var(--surface)]/90 px-3 py-1 text-xs font-semibold text-[var(--foreground)] shadow-sm"
                              >
                                Remove
                              </button>
                            </div>
                          );
                        })}

                        {!referenceUploads.length && (
                          <div className="flex h-48 w-full min-w-[16rem] shrink-0 items-center justify-center rounded-3xl border border-[var(--border)] bg-[var(--surface)]/40 p-6 text-center text-sm text-[var(--muted)]">
                            Drop in moodboards, sketches, or photographic anchors to steer Gemini
                            closer to your brand aesthetic.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </FieldGroup>

                <FieldGroup
                  label="Prompt"
                  description="Describe mood, composition, and stylistic cues. This text is required."
                >
                  <textarea
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    rows={6}
                    placeholder="e.g., Neon-drenched street market in Chongqing, rain-kissed pavement, anamorphic lens flares, f/1.4 depth"
                    className="w-full resize-none rounded-3xl border border-[var(--border)] bg-[var(--surface)]/80 p-4 text-sm text-[var(--foreground)] shadow-inner outline-none focus:border-[var(--accent)]"
                  />
                </FieldGroup>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setShowRenderOptions(true)}
                    className="inline-flex flex-1 min-w-[240px] items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)]/70 px-4 py-3 text-left text-[var(--foreground)] transition hover:border-[var(--accent)] hover:text-[var(--accent)] sm:flex-none"
                  >
                    <div className="flex flex-col leading-tight">
                      <span className="text-[0.6rem] uppercase tracking-[0.35em] text-[var(--muted)]">
                        Options
                      </span>
                      <span className="text-sm font-semibold">{renderOptionsLabel}</span>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={actionButtonHandler}
                    disabled={actionButtonDisabled}
                    className={actionButtonClasses}
                  >
                    {actionButtonLabel}
                  </button>
                </div>
              </form>

              <aside className="flex flex-col gap-6">
                <div className="rounded-[32px] border border-[var(--border)] bg-[var(--surface)]/90 p-6 shadow-soft">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold">Think</h2>
                    <span className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
                      {statusLabel(status)}
                    </span>
                  </div>
                  <div
                    ref={thinkScrollRef}
                    className="mt-4 h-72 overflow-y-auto rounded-3xl border border-[var(--border)] bg-[var(--background)]/35 p-4 text-sm text-[var(--foreground)] thin-scrollbar"
                  >
                    {streamedText ? (
                      <StableMarkdownTypewriter
                        stableKey={typewriterSessionKey}
                        motionProps={{
                          className: "space-y-3 text-sm leading-relaxed text-[var(--foreground)]",
                          onAnimationComplete: () => {
                            console.log("Typewriter finished");
                          },
                          characterVariants: {
                            hidden: { opacity: 0 },
                            visible: { opacity: 1, transition: { opacity: { duration: 0 } } },
                          },
                          onCharacterAnimationComplete: scrollToEnd,
                        }}
                      >
                        {streamedText}
                      </StableMarkdownTypewriter>
                    ) : (
                      <p className="text-xs text-[var(--muted)]">
                        The narration feed prints here once the stream starts.
                      </p>
                    )}
                  </div>
                </div>

                <div className="relative overflow-hidden rounded-[32px] border border-[var(--border)] bg-gradient-to-br from-[var(--surface)] to-[var(--background)] p-6 shadow-soft">
                  <div className="pointer-events-none absolute inset-0 opacity-80">
                    <div className="absolute left-1/2 top-10 h-48 w-48 -translate-x-1/2 rounded-full bg-[var(--accent-soft)] blur-3xl" />
                    <div className="absolute inset-x-4 bottom-0 h-28 rounded-[60px] bg-[var(--accent-soft)]/60 blur-3xl" />
                  </div>
                  <div className="relative z-10 space-y-4">
                    <h2 className="text-lg font-semibold">Latest frame</h2>
                    {generatedImageUrl ? (
                      <div className="overflow-hidden rounded-[28px] border border-[var(--border)] bg-black/10">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={generatedImageUrl} alt="Generated" className="w-full" />
                      </div>
                    ) : (
                      <div className="flex h-64 flex-col items-center justify-center rounded-[28px] border border-dashed border-[var(--border)] bg-[var(--surface)]/60 text-center text-sm text-[var(--muted)]">
                        {status === "running"
                          ? "Awaiting first image chunk..."
                          : "Run a prompt to see the rendered asset."}
                      </div>
                    )}
                    {previewUpload?.createdAt && (
                      <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
                        Uploaded {new Date(previewUpload.createdAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>

                <div className="rounded-[32px] border border-[var(--border)] bg-[var(--surface)]/80 p-6 shadow-soft">
                  <h2 className="text-lg font-semibold">Run summary</h2>
                  <div className="mt-4 space-y-3 text-sm">
                    <div className="flex items-center justify-between border-b border-dashed border-[var(--border)] pb-3">
                      <span className="text-[var(--muted)]">Duration</span>
                      <span className="font-semibold text-[var(--foreground)]">
                        {formatDuration(generationDuration)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[var(--muted)]">Status</span>
                      <span className="font-semibold text-[var(--foreground)]">
                        {statusLabel(status)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[var(--muted)]">Resolution</span>
                      <span className="font-semibold">{imageSize || "Auto"}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[var(--muted)]">Aspect ratio</span>
                      <span className="font-semibold">{aspectRatio || "Auto"}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[var(--muted)]">References</span>
                      <span className="font-semibold">
                        {referenceUploads.length}/{MAX_REFERENCES}
                      </span>
                    </div>
                  </div>
                </div>

                {creationStatus !== "idle" && (
                  <div className="rounded-[32px] border border-[var(--border)] bg-[var(--surface)]/85 p-6 shadow-soft">
                    <h2 className="text-lg font-semibold">Story draft</h2>
                    {creationStatus === "pending" && (
                      <p className="mt-3 text-sm text-[var(--muted)]">
                        Saving this render with {mediaUploadIds.length} shot
                        {mediaUploadIds.length === 1 ? "" : "s"} and {submittedReferenceIds.length}{" "}
                        reference{submittedReferenceIds.length === 1 ? "" : "s"}.
                      </p>
                    )}
                    {creationStatus === "success" && (
                      <>
                        <p className="mt-3 text-sm text-[var(--muted)]">
                          Draft saved. Redirecting to the detail view in {redirectCountdown ?? 5}{" "}
                          second{(redirectCountdown ?? 5) === 1 ? "" : "s"} to decide whether to
                          publish.
                        </p>
                        <button
                          type="button"
                          onClick={handleImmediateRedirect}
                          className="mt-4 inline-flex items-center justify-center rounded-full border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
                        >
                          Open detail now
                        </button>
                      </>
                    )}
                    {creationStatus === "error" && (
                      <>
                        <p className="mt-3 text-sm text-[var(--accent)]">{creationError}</p>
                        <div className="mt-4 flex gap-3">
                          <button
                            type="button"
                            onClick={retryArticleSave}
                            className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--accent-strong)]"
                          >
                            Retry save
                          </button>
                          <button
                            type="button"
                            onClick={handleImmediateRedirect}
                            disabled={!createdArticleId}
                            className="rounded-full border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            View last draft
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </aside>
            </div>
          )}
        </div>
      </div>

      {showRenderOptions && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={closeRenderOptions}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="render-options-heading"
            className="w-full max-w-2xl rounded-[36px] border border-[var(--border)] bg-[var(--surface)] p-8 text-[var(--foreground)] shadow-soft"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.35em] text-[var(--muted)]">
                  Render options
                </p>
                <h2 id="render-options-heading" className="text-2xl font-semibold">
                  Fine-tune the frame
                </h2>
              </div>
              <button
                type="button"
                onClick={closeRenderOptions}
                className="rounded-full border border-[var(--border)] px-4 py-2 text-xs font-semibold text-[var(--foreground)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
              >
                Close
              </button>
            </div>

            <div className="mt-6 space-y-6">
              <FieldGroup
                label="Framing"
                description="Pick an aspect ratio preset. Leave empty for model default."
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  {aspectRatioPresets.map((preset) => {
                    const active = aspectRatio === preset.value;
                    return (
                      <button
                        key={preset.value}
                        type="button"
                        onClick={() =>
                          setAspectRatio((prev) => (prev === preset.value ? "" : preset.value))
                        }
                        className={`flex flex-col rounded-3xl border px-4 py-3 text-left transition ${active ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--border)] bg-[var(--surface)]/80 hover:border-[var(--accent)]"}`}
                      >
                        <span className="text-sm font-semibold">{preset.label}</span>
                        <span className="text-xs text-[var(--muted)]">
                          {preset.value} · {preset.hint}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </FieldGroup>

              <FieldGroup
                label="Resolution"
                description="Higher targets stream larger inline images."
              >
                <div className="flex flex-wrap gap-3">
                  {resolutionPresets.map((preset) => {
                    const active = imageSize === preset.value;
                    return (
                      <button
                        key={preset.value}
                        type="button"
                        onClick={() =>
                          setImageSize((prev) => (prev === preset.value ? "" : preset.value))
                        }
                        className={`rounded-full border px-5 py-2 text-sm font-semibold transition ${active ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--border)] bg-[var(--surface)]/80 hover:border-[var(--accent)]"}`}
                      >
                        {preset.label}
                        <span className="ml-2 text-xs font-normal text-[var(--muted)]">
                          {preset.hint}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </FieldGroup>
            </div>

            <div className="mt-6 flex flex-wrap justify-between gap-3">
              <button
                type="button"
                onClick={resetRenderOptions}
                className="rounded-full border border-[var(--border)] px-5 py-2 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
              >
                Reset to auto
              </button>
              <button
                type="button"
                onClick={closeRenderOptions}
                className="rounded-full bg-[var(--accent)] px-6 py-2 text-sm font-semibold text-white transition hover:bg-[var(--accent-strong)]"
              >
                Save & close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ErrorBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-4 sm:px-6">
      <div
        role="alert"
        aria-live="assertive"
        className="pointer-events-auto flex w-full max-w-3xl items-start gap-4 rounded-3xl border border-[var(--accent)] bg-[var(--surface)]/95 p-4 text-sm text-[var(--foreground)] shadow-soft"
      >
        <div className="flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--muted)]">
            Heads up
          </p>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm font-medium">{message}</p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-full border border-[var(--border)] px-3 py-1 text-xs font-semibold text-[var(--foreground)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
        >
          Close
        </button>
      </div>
    </div>
  );
}

function statusLabel(status: StreamStatus) {
  switch (status) {
    case "running":
      return "Streaming";
    case "success":
      return "Delivered";
    case "error":
      return "Interrupted";
    default:
      return "Idle";
  }
}

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function FieldGroup({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div>
        <p className="text-sm font-semibold text-[var(--foreground)]">{label}</p>
        {description && <p className="text-xs text-[var(--muted)]">{description}</p>}
      </div>
      {children}
    </div>
  );
}

function isUploadRecord(value: unknown): value is UploadRecord {
  if (!value || typeof value !== "object") {
    return false;
  }
  return "id" in value && "key" in value;
}

function parseUploadResponse(payload: unknown): UploadRecord | null {
  if (isUploadRecord(payload)) {
    return payload;
  }
  if (payload && typeof payload === "object" && "data" in payload) {
    const nested = (payload as { data?: unknown }).data;
    if (isUploadRecord(nested)) {
      return nested;
    }
  }
  return null;
}

async function openGenerationStream(
  payload: GenerationRequestPayload,
  signal: AbortSignal,
  accessToken: string,
) {
  const taskResponse = await fetch(buildApiUrl("/task/gemini"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
    signal,
    cache: "no-store",
    credentials: "include",
  });

  if (!taskResponse.ok) {
    const message = await safeReadError(taskResponse);
    throw new Error(message || "Unable to create generation task.");
  }

  const taskPayload = (await taskResponse.json()) as { taskId?: string };
  const taskId = taskPayload?.taskId;
  if (!taskId) {
    throw new Error("Task id is missing in the response.");
  }

  const streamResponse = await fetch(buildApiUrl(`/task/gemini/${taskId}/sse`), {
    method: "GET",
    headers: {
      Accept: "text/event-stream",
      Authorization: `Bearer ${accessToken}`,
    },
    signal,
    cache: "no-store",
    redirect: "follow",
    credentials: "include",
  });

  if (!streamResponse.ok || !streamResponse.body) {
    const message = await safeReadError(streamResponse);
    if (streamResponse.redirected && !streamResponse.body) {
      throw new Error(message || "Stream redirect succeeded but no body was returned.");
    }
    throw new Error(message || "Unable to start the generation stream.");
  }

  return streamResponse.body;
}

async function consumeStream(
  stream: ReadableStream<Uint8Array>,
  onEvent: (packet: ParsedEvent) => void,
) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const delimiterPattern = /\r?\n\r?\n/;
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let match: RegExpExecArray | null;
    while ((match = delimiterPattern.exec(buffer)) !== null) {
      const raw = buffer.slice(0, match.index).trim();
      buffer = buffer.slice(match.index + match[0].length);
      delimiterPattern.lastIndex = 0;
      const event = parseSsePacket(raw);
      if (event) onEvent(event);
    }
  }

  buffer += decoder.decode();

  if (buffer.trim()) {
    const event = parseSsePacket(buffer.trim());
    if (event) onEvent(event);
  }
}

function parseSsePacket(chunk: string): ParsedEvent | null {
  if (!chunk) return null;
  const lines = chunk.split(/\n+/);
  let eventName = "message";
  let dataPayload = "";

  for (const line of lines) {
    if (line.startsWith("event:")) {
      eventName = line.replace("event:", "").trim();
    } else if (line.startsWith("data:")) {
      dataPayload += line.replace("data:", "").trim();
    }
  }

  if (!dataPayload) {
    return { event: eventName, data: null };
  }

  try {
    return { event: eventName, data: JSON.parse(dataPayload) };
  } catch {
    return { event: eventName, data: dataPayload };
  }
}

function resolveUploadUrl(key: string | null | undefined) {
  if (!key) return null;
  const publicBase = process.env.NEXT_PUBLIC_R2_PUBLIC_URL;
  if (!publicBase) return null;
  return `${publicBase.replace(/\/$/, "")}/${key}`;
}
