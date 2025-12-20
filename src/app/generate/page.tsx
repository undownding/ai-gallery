"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
import { usePathname } from "next/navigation";

import { AuthStatus, AUTH_SESSION_EVENT, type SessionUser } from "@/components/auth-status";
import type { AspectRatio, ImageSize } from "@/lib/gemini";

const MAX_REFERENCES = 8;

const aspectRatioPresets: { value: AspectRatio; label: string; hint: string }[] = [
  { value: "1:1", label: "Square", hint: "Album covers, avatars" },
  { value: "4:5", label: "Portrait", hint: "Editorial and fashion" },
  { value: "3:4", label: "Story", hint: "Mobile-first narratives" },
  { value: "16:9", label: "Cinematic", hint: "Landscape and film stills" },
  { value: "21:9", label: "Ultra-wide", hint: "Billboard mockups" },
];

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

type SessionResponse = {
  user: SessionUser | null;
};

export default function GeneratePage() {
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio | "">("");
  const [imageSize, setImageSize] = useState<ImageSize | "">("");
  const [referenceUploads, setReferenceUploads] = useState<ReferenceAsset[]>([]);
  const [status, setStatus] = useState<StreamStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [previewUpload, setPreviewUpload] = useState<UploadRecord | null>(null);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [showRenderOptions, setShowRenderOptions] = useState(false);

  const pathname = usePathname();

  const controllerRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previewUrlRegistry = useRef(new Set<string>());

  useEffect(() => {
    const registry = previewUrlRegistry.current;
    return () => {
      controllerRef.current?.abort();
      registry.forEach((url) => URL.revokeObjectURL(url));
      registry.clear();
    };
  }, []);

  useEffect(() => {
    let active = true;

    const applySession = (user: SessionUser | null) => {
      if (!active) return;
      setSessionUser(user);
      setSessionLoading(false);
    };

    const fetchSession = async () => {
      setSessionError(null);
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store" });
        if (!response.ok && response.status !== 401 && response.status !== 404) {
          throw new Error("Unable to load session.");
        }
        const payload = (await response.json()) as SessionResponse;
        applySession(payload.user ?? null);
      } catch (sessionIssue) {
        if (!active) return;
        setSessionError(sessionIssue instanceof Error ? sessionIssue.message : "Unable to load session.");
        applySession(null);
      }
    };

    const handleSessionEvent = (event: Event) => {
      const detail = (event as CustomEvent<SessionUser | null>).detail ?? null;
      applySession(detail);
    };

    fetchSession();
    window.addEventListener(AUTH_SESSION_EVENT, handleSessionEvent);

    return () => {
      active = false;
      window.removeEventListener(AUTH_SESSION_EVENT, handleSessionEvent);
    };
  }, []);

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

  const loginHref = useMemo(() => {
    const target = pathname && pathname.startsWith("/") ? pathname : "/generate";
    return `/api/auth/github?redirectTo=${encodeURIComponent(target)}`;
  }, [pathname]);

  const renderOptionsLabel = useMemo(() => {
    const sizeLabel = imageSize || "Auto";
    const ratioLabel = aspectRatio || "Auto";
    return `${sizeLabel} · ${ratioLabel}`;
  }, [aspectRatio, imageSize]);

  const handleFileSelection = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    if (referenceUploads.length >= MAX_REFERENCES) return;

    setUploadingFiles(true);
    setErrorMessage(null);

    try {
      const capacity = MAX_REFERENCES - referenceUploads.length;
      const trimmedFiles = files.slice(0, capacity);
      for (const file of trimmedFiles) {
        const res = await fetch("/api/storage/upload", {
          method: "PUT",
          headers: {
            "content-type": file.type || "application/octet-stream",
          },
          body: file,
        });

        if (!res.ok) {
          const message = await safeReadError(res);
          throw new Error(message || "Upload failed. Try again.");
        }

        const payload = (await res.json()) as { data?: UploadRecord };
        const upload = payload?.data;
        if (upload?.id && upload.key) {
          const previewUrl = URL.createObjectURL(file);
          previewUrlRegistry.current.add(previewUrl);
          setReferenceUploads((prev) => [...prev, { ...upload, previewUrl }]);
        }
      }
    } catch (uploadError) {
      setErrorMessage(uploadError instanceof Error ? uploadError.message : "Unable to upload file.");
    } finally {
      setUploadingFiles(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }, [referenceUploads.length]);

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
    setStatus("idle");
  }, []);

  const handleEvent = useCallback((packet: ParsedEvent) => {
    console.log("handleEvent:", packet);
    if (!packet) return;
    switch (packet.event) {
      case "image":
      case "done": {
        if (packet.data && typeof packet.data === "object" && "key" in (packet.data as UploadRecord)) {
          setPreviewUpload(packet.data as UploadRecord);
        }
        if (packet.event === "done") {
          setStatus("success");
        }
        break;
      }
      case "error": {
        const message = typeof (packet.data as { message?: string })?.message === "string"
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
    if (!prompt.trim()) return;
    if (!sessionUser) {
      setErrorMessage("Sign in to generate an image.");
      return;
    }

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setStatus("running");
    setErrorMessage(null);
    setPreviewUpload(null);

    const body: GenerationRequestPayload = {
      prompt: prompt.trim(),
      aspectRatio: aspectRatio || undefined,
      imageSize: imageSize || undefined,
      referenceUploadIds: referenceUploads.map((upload) => upload.id),
    };

    try {
      const stream = await openGenerationStream(body, controller.signal);
      await consumeStream(stream, handleEvent);
    } catch (error) {
      if ((error as DOMException)?.name === "AbortError") {
        return;
      }
      setStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      controllerRef.current = null;
    }
  }, [prompt, aspectRatio, imageSize, referenceUploads, handleEvent, sessionUser]);

  return (
    <>
      <div className="app-shell px-4 py-10 sm:px-6 lg:px-10">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-10">
          <div className="flex justify-end">
            <AuthStatus redirectTo={pathname ?? "/generate"} />
          </div>
          <section className="relative overflow-hidden rounded-[38px] border border-[var(--border)] bg-[var(--surface)]/95 p-8 text-[var(--foreground)] shadow-soft">
            <div className="pointer-events-none absolute inset-0 opacity-70">
              <div className="absolute -left-16 top-6 h-40 w-40 rounded-full bg-[var(--accent-soft)] blur-2xl" />
              <div className="absolute inset-x-10 bottom-0 h-40 rounded-[60px] bg-gradient-to-r from-[var(--accent-soft)] via-transparent to-[var(--accent-soft)] blur-3xl" />
            </div>
            <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-4">
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--muted)]">Playground</p>
                <h1 className="text-3xl font-semibold sm:text-4xl">Craft bespoke shots in seconds</h1>
                <p className="max-w-2xl text-sm text-[var(--muted)] sm:text-base">
                  Feed the Gemini image preview model with a cinematic brief, weave in references, and let the stream narrate each render hand-off.
                </p>
                <div className="flex flex-wrap gap-3 text-xs text-[var(--muted)]">
                  <StatusBadge status={status} />
                  <span className="inline-flex items-center justify-center rounded-full border border-[var(--border)] px-4 py-1 text-center">
                    {referenceUploads.length}/{MAX_REFERENCES} references linked
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowRenderOptions(true)}
                    className="flex items-center gap-3 rounded-full border border-[var(--border)] bg-[var(--surface)]/70 px-5 py-2 text-left text-[var(--foreground)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
                  >
                    <div className="flex flex-col leading-tight">
                      <span className="text-[0.6rem] uppercase tracking-[0.35em] text-[var(--muted)]">Render options</span>
                      <span className="text-sm font-semibold">{renderOptionsLabel}</span>
                    </div>
                  </button>
                </div>
              </div>
              <div className="flex flex-col gap-3 rounded-3xl border border-[var(--border)] bg-gradient-to-br from-[var(--surface)]/60 to-[var(--background)]/40 p-6 text-sm">
                <p className="text-xs uppercase tracking-[0.35em] text-[var(--muted)]">Live response</p>
                <p className="text-base font-semibold">{statusLabel(status)}</p>
                <p className="text-[var(--muted)]">The API streams structured SSE events: reference validation, image uploads, then completion meta.</p>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={handleGenerate}
                    disabled={!canSubmit}
                    className="flex-1 rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {status === "running" ? "Generating" : "Generate shot"}
                  </button>
                  <button
                    type="button"
                    onClick={stopGeneration}
                    disabled={status !== "running"}
                    className="rounded-full border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Stop
                  </button>
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
                Use your GitHub account to unlock the Gemini playground and persist reference uploads.
              </p>
              <a
                href={loginHref}
                className="mt-6 inline-flex items-center justify-center rounded-full bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[var(--accent-strong)]"
              >
                Sign in with GitHub
              </a>
              {sessionError && <p className="mt-3 text-xs text-[var(--accent)]">{sessionError}</p>}
            </div>
          ) : (
            <div className="grid gap-8 lg:grid-cols-[1.05fr_0.85fr]">
              <form className="space-y-6" onSubmit={(event) => event.preventDefault()}>
                <FieldGroup label="Prompt" description="Describe mood, composition, and stylistic cues. This text is required.">
                  <textarea
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    rows={6}
                    placeholder="e.g., Neon-drenched street market in Chongqing, rain-kissed pavement, anamorphic lens flares, f/1.4 depth"
                    className="w-full resize-none rounded-3xl border border-[var(--border)] bg-[var(--surface)]/80 p-4 text-sm text-[var(--foreground)] shadow-inner outline-none focus:border-[var(--accent)]"
                  />
                </FieldGroup>

                <FieldGroup
                  label="Reference uploads"
                  description="Optional. Attach up to eight guiding shots. The files are persisted immediately to R2 and referenced by the API."
                >
                  <div className="rounded-[30px] border border-dashed border-[var(--border)] bg-[var(--surface)]/70 p-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm text-[var(--muted)]">PNG, JPG, or WEBP · {referenceUploads.length}/{MAX_REFERENCES} linked</p>
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

                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      {referenceUploads.map((asset) => {
                        const preview = asset.previewUrl ?? resolveUploadUrl(asset.key);
                        return (
                          <div key={asset.id} className="relative overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--surface)] shadow-soft">
                            {preview ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={preview} alt="Reference upload" className="h-48 w-full object-cover" />
                            ) : (
                              <div className="flex h-48 items-center justify-center text-xs text-[var(--muted)]">
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
                        <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)]/40 p-6 text-sm text-[var(--muted)]">
                          Drop in moodboards, sketches, or photographic anchors to steer Gemini closer to your brand aesthetic.
                        </div>
                      )}
                    </div>
                  </div>
                </FieldGroup>

                <div className="rounded-[32px] border border-[var(--border)] bg-[var(--surface)]/70 p-6 text-sm text-[var(--muted)] shadow-soft">
                  <p className="text-sm font-semibold text-[var(--foreground)]">Creative direction tip</p>
                  <p className="mt-2">
                    Combine cinematic verbs with lighting and lens jargon for the most evocative renders. Adjust ratios and resolution from the pill above whenever you need tighter framing.
                  </p>
                </div>
              </form>

              <aside className="flex flex-col gap-6">
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
                        {status === "running" ? "Awaiting first image chunk..." : "Run a prompt to see the rendered asset."}
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
                      <span className="text-[var(--muted)]">Status</span>
                      <span className="font-semibold text-[var(--foreground)]">{statusLabel(status)}</span>
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
                      <span className="font-semibold">{referenceUploads.length}/{MAX_REFERENCES}</span>
                    </div>
                  </div>
                </div>

                {errorMessage && (
                  <div className="rounded-3xl border border-[var(--accent)] bg-[var(--accent-soft)]/70 p-4 text-sm text-[var(--alert-text)] shadow-soft">
                    {errorMessage}
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
                <p className="text-xs uppercase tracking-[0.35em] text-[var(--muted)]">Render options</p>
                <h2 id="render-options-heading" className="text-2xl font-semibold">Fine-tune the frame</h2>
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
              <FieldGroup label="Framing" description="Pick an aspect ratio preset. Leave empty for model default.">
                <div className="grid gap-3 sm:grid-cols-2">
                  {aspectRatioPresets.map((preset) => {
                    const active = aspectRatio === preset.value;
                    return (
                      <button
                        key={preset.value}
                        type="button"
                        onClick={() => setAspectRatio((prev) => (prev === preset.value ? "" : preset.value))}
                        className={`flex flex-col rounded-3xl border px-4 py-3 text-left transition ${active ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--border)] bg-[var(--surface)]/80 hover:border-[var(--accent)]"}`}
                      >
                        <span className="text-sm font-semibold">{preset.label}</span>
                        <span className="text-xs text-[var(--muted)]">{preset.value} · {preset.hint}</span>
                      </button>
                    );
                  })}
                </div>
              </FieldGroup>

              <FieldGroup label="Resolution" description="Higher targets stream larger inline images.">
                <div className="flex flex-wrap gap-3">
                  {resolutionPresets.map((preset) => {
                    const active = imageSize === preset.value;
                    return (
                      <button
                        key={preset.value}
                        type="button"
                        onClick={() => setImageSize((prev) => (prev === preset.value ? "" : preset.value))}
                        className={`rounded-full border px-5 py-2 text-sm font-semibold transition ${active ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--border)] bg-[var(--surface)]/80 hover:border-[var(--accent)]"}`}
                      >
                        {preset.label}
                        <span className="ml-2 text-xs font-normal text-[var(--muted)]">{preset.hint}</span>
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

function StatusBadge({ status }: { status: StreamStatus }) {
  const palette: Record<StreamStatus, string> = {
    idle: "border-[var(--border)] text-[var(--muted)]",
    running: "border-[var(--accent)] text-[var(--accent)]",
    success: "border-emerald-400 text-emerald-500",
    error: "border-red-400 text-red-500",
  };

  const label = statusLabel(status);

  return (
    <span className={`inline-flex items-center justify-center rounded-full border px-4 py-1 text-center text-xs font-semibold ${palette[status]}`}>
      {label}
    </span>
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

async function openGenerationStream(payload: GenerationRequestPayload, signal: AbortSignal) {
  const response = await fetch("/api/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify(payload),
    signal,
    cache: "no-store",
    redirect: "follow",
  });

  if (!response.ok || !response.body) {
    const message = await safeReadError(response);
    if (response.redirected && !response.body) {
      throw new Error(message || "Stream redirect succeeded but no body was returned.");
    }
    throw new Error(message || "Unable to start the generation stream.");
  }

  return response.body;
}

async function consumeStream(stream: ReadableStream<Uint8Array>, onEvent: (packet: ParsedEvent) => void) {
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

async function safeReadError(response: Response): Promise<string | null> {
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
