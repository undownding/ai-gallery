"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
import { usePathname } from "next/navigation";

import { AuthStatus } from "@/components/auth-status";
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

export default function GeneratePage() {
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio | "">("");
  const [imageSize, setImageSize] = useState<ImageSize | "">("");
  const [referenceUploads, setReferenceUploads] = useState<ReferenceAsset[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [status, setStatus] = useState<StreamStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [previewUpload, setPreviewUpload] = useState<UploadRecord | null>(null);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const pathname = usePathname();

  const controllerRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previewUrlRegistry = useRef(new Set<string>());

  useEffect(() => {
    return () => {
      controllerRef.current?.abort();
      previewUrlRegistry.current.forEach((url) => URL.revokeObjectURL(url));
      previewUrlRegistry.current.clear();
    };
  }, []);

  const canSubmit = prompt.trim().length > 0 && status !== "running";

  const generatedImageUrl = useMemo(() => {
    if (!previewUpload) return null;
    return resolveUploadUrl(previewUpload.key);
  }, [previewUpload]);

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
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to upload file.");
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
    console.log(`handleEvent:`, packet);
    if (!packet) return;
    switch (packet.event) {
      case "text": {
        const message = typeof (packet.data as { text?: string })?.text === "string"
          ? (packet.data as { text?: string }).text!
          : "";
        if (message) {
          setLogs((prev) => [...prev, message]);
        }
        break;
      }
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

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setStatus("running");
    setLogs([]);
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
  }, [prompt, aspectRatio, imageSize, referenceUploads, handleEvent]);

  return (
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
                Feed the Gemini image preview model with a cinematic brief, tweak ratios, and optionally weave in reference uploads. The response stream narrates the creative reasoning as the pixels render.
              </p>
              <div className="flex flex-wrap gap-3 text-xs text-[var(--muted)]">
                <StatusBadge status={status} />
                <span className="rounded-full border border-[var(--border)] px-4 py-1">{referenceUploads.length}/{MAX_REFERENCES} references linked</span>
                {imageSize && <span className="rounded-full border border-[var(--border)] px-4 py-1">{imageSize} target res</span>}
                {aspectRatio && <span className="rounded-full border border-[var(--border)] px-4 py-1">{aspectRatio} frame</span>}
              </div>
            </div>
            <div className="flex flex-col gap-3 rounded-3xl border border-[var(--border)] bg-gradient-to-br from-[var(--surface)]/60 to-[var(--background)]/40 p-6 text-sm">
              <p className="text-xs uppercase tracking-[0.35em] text-[var(--muted)]">Live response</p>
              <p className="text-base font-semibold">{statusLabel(status)}</p>
              <p className="text-[var(--muted)]">The API streams structured SSE events: narrative text, image uploads, then closing meta.</p>
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

        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
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

            <FieldGroup label="Framing" description="Pick an aspect ratio preset. Leave empty for model default.">
              <div className="grid gap-3 md:grid-cols-2">
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
                          <img src={preview} alt="Reference upload" className="h-48 w-full object-cover" />
                        ) : (
                          <div className="flex h-48 items-center justify-center text-xs text-[var(--muted)]">Configure NEXT_PUBLIC_R2_PUBLIC_URL to preview stored keys.</div>
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
          </form>

          <aside className="flex flex-col gap-6">
            <div className="rounded-[32px] border border-[var(--border)] bg-[var(--surface)]/90 p-6 shadow-soft">
              <h2 className="text-lg font-semibold">Response feed</h2>
              <p className="text-sm text-[var(--muted)]">Streaming notes from the model arrive here before each pixel batch.</p>
              <div className="mt-4 space-y-3">
                {logs.map((entry, index) => (
                  <div key={`${index}-${entry.slice(0, 10)}`} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)]/70 p-4 text-sm">
                    <div className="mb-1 text-xs uppercase tracking-[0.25em] text-[var(--muted)]">Step {index + 1}</div>
                    <p>{entry}</p>
                  </div>
                ))}
                {!logs.length && (
                  <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)]/40 p-4 text-sm text-[var(--muted)]">
                    Waiting for the next generation run. Trigger a prompt to watch the stream populate.
                  </div>
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

            {errorMessage && (
              <div className="rounded-3xl border border-[var(--accent)] bg-[var(--accent-soft)] p-4 text-sm text-[var(--alert-text)] shadow-soft">
                {errorMessage}
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
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
    <span className={`rounded-full border px-4 py-1 text-xs font-semibold ${palette[status]}`}>
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
