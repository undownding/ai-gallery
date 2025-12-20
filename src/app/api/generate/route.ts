import dayjs from "dayjs";
import { and, eq, inArray } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

import { getDb } from "@/db/client";
import { NewUpload, uploads } from "@/db/schema";
import { generateContent, type AspectRatio, type ImageSize } from "@/lib/gemini";
import { getSessionUser, type SessionUser } from "@/lib/session";
import { uploadBase64Image } from "@/lib/storage";

const encoder = new TextEncoder();
const TOKEN_PARAM = "payload";
const TOKEN_TTL_SECONDS = 30;
const MAX_REFERENCE_UPLOADS = 8;

type GenerateRequestBody = {
    prompt?: string;
    aspectRatio?: AspectRatio;
    imageSize?: ImageSize;
    referenceUploadIds?: string[];
};

type SanitizedGeneratePayload = {
    prompt: string;
    aspectRatio?: AspectRatio;
    imageSize?: ImageSize;
    referenceUploadIds: string[];
};

type SignedGeneratePayload = SanitizedGeneratePayload & { ts: number };

const SSE_HEADERS = {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
};

function sendEvent(controller: ReadableStreamDefaultController<Uint8Array>, event: string, data: unknown) {
    controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
}

function validateGenerateRequest(payload?: GenerateRequestBody):
    | { success: true; value: SanitizedGeneratePayload }
    | { success: false; message: string; status?: number } {
    if (!payload) {
        return { success: false, message: "Invalid JSON payload.", status: 400 };
    }

    const { prompt, aspectRatio, imageSize, referenceUploadIds } = payload;

    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
        return { success: false, message: "Field 'prompt' is required.", status: 400 };
    }

    if (aspectRatio !== undefined && typeof aspectRatio !== "string") {
        return { success: false, message: "Field 'aspectRatio' must be a string.", status: 400 };
    }

    if (imageSize !== undefined && typeof imageSize !== "string") {
        return { success: false, message: "Field 'imageSize' must be a string.", status: 400 };
    }

    let sanitizedUploadIds: string[] = [];

    if (referenceUploadIds !== undefined) {
        if (!Array.isArray(referenceUploadIds)) {
            return { success: false, message: "Field 'referenceUploadIds' must be an array of upload IDs.", status: 400 };
        }

        const trimmedIds = referenceUploadIds.map((id) => (typeof id === "string" ? id.trim() : ""));
        if (trimmedIds.some((id) => !id)) {
            return { success: false, message: "Field 'referenceUploadIds' must contain non-empty strings.", status: 400 };
        }

        const uniqueIds = Array.from(new Set(trimmedIds));
        if (uniqueIds.length > MAX_REFERENCE_UPLOADS) {
            return { success: false, message: `A maximum of ${MAX_REFERENCE_UPLOADS} reference uploads is supported.`, status: 400 };
        }

        sanitizedUploadIds = uniqueIds;
    }

    return {
        success: true,
        value: {
            prompt: prompt.trim(),
            aspectRatio: aspectRatio || undefined,
            imageSize: imageSize || undefined,
            referenceUploadIds: sanitizedUploadIds,
        },
    };
}

function encodeSignedPayload(payload: SanitizedGeneratePayload) {
    const signed: SignedGeneratePayload = { ...payload, ts: Date.now() };
    return Buffer.from(JSON.stringify(signed), "utf-8").toString("base64url");
}

function decodeSignedPayload(token: string): SignedGeneratePayload | null {
    try {
        const json = Buffer.from(token, "base64url").toString("utf-8");
        return JSON.parse(json) as SignedGeneratePayload;
    } catch {
        return null;
    }
}

function createGenerationStream(params: SanitizedGeneratePayload, user: SessionUser) {
    const { prompt, aspectRatio, imageSize, referenceUploadIds } = params;

    return new ReadableStream<Uint8Array>({
        async start(controller) {
            try {
                let upload: NewUpload | null = null;
                const response = await generateContent(prompt, aspectRatio, imageSize, referenceUploadIds, user.id);
                const candidates = response.candidates ?? [];

                for (const candidate of candidates) {
                    const parts = candidate.content?.parts ?? [];
                    for (const part of parts) {
                        const text = (part as { text?: string }).text;
                        if (text) {
                            sendEvent(controller, "text", { text });
                            continue;
                        }

                        const inlineData = (part as { inlineData?: { data?: string; mimeType?: string } }).inlineData;
                        if (inlineData?.data) {
                            upload = await uploadBase64Image(inlineData.data, inlineData.mimeType, user);
                            sendEvent(controller, "image", upload);
                        }
                    }
                }

                if (upload) {
                    sendEvent(controller, "done", upload);
                } else {
                    sendEvent(controller, "done", response);
                }
            } catch (error) {
                const message = error instanceof Error ? error.message : "Unexpected error";
                sendEvent(controller, "error", { message });
            } finally {
                controller.close();
            }
        },
    });
}

export async function POST(request: NextRequest) {
    const env = getCloudflareContext().env;
    const user = await getSessionUser(request, env);
    if (!user) {
        return NextResponse.json({ error: "Sign in to start a generation." }, { status: 401 });
    }

    let payload: GenerateRequestBody | undefined;

    try {
        payload = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
    }

    const validation = validateGenerateRequest(payload);
    if (!validation.success) {
        return NextResponse.json({ error: validation.message }, { status: validation.status ?? 400 });
    }

    const redirectUrl = new URL(request.url);
    redirectUrl.search = "";
    redirectUrl.searchParams.set(TOKEN_PARAM, encodeSignedPayload(validation.value));

    return NextResponse.redirect(redirectUrl, 302);
}

export async function GET(request: NextRequest) {
    const env = getCloudflareContext().env;
    const user = await getSessionUser(request, env);
    if (!user) {
        return NextResponse.json({ error: "Sign in to stream a generation." }, { status: 401 });
    }

    const token = request.nextUrl.searchParams.get(TOKEN_PARAM);
    if (!token) {
        return NextResponse.json({ error: "Missing payload token." }, { status: 400 });
    }

    const signedPayload = decodeSignedPayload(token);
    if (!signedPayload) {
        return NextResponse.json({ error: "Invalid payload token." }, { status: 400 });
    }

    const { ts, ...rawPayload } = signedPayload;
    const timestamp = typeof ts === "number" ? ts : Number(ts);
    if (!Number.isFinite(timestamp)) {
        return NextResponse.json({ error: "Missing payload timestamp." }, { status: 400 });
    }

    const isExpired = dayjs().diff(dayjs(timestamp), "second", true) > TOKEN_TTL_SECONDS;
    if (isExpired) {
        return NextResponse.json({ error: "Payload token expired." }, { status: 401 });
    }

    const validation = validateGenerateRequest(rawPayload);
    if (!validation.success) {
        return NextResponse.json({ error: validation.message }, { status: validation.status ?? 400 });
    }

    const ownershipCheck = await ensureReferenceOwnership(validation.value.referenceUploadIds, user.id, env);
    if (ownershipCheck && ownershipCheck.error) {
        return NextResponse.json({ error: ownershipCheck.error }, { status: ownershipCheck.status });
    }

    const stream = createGenerationStream(validation.value, user);
    return new Response(stream, { headers: SSE_HEADERS });
}

type Env = ReturnType<typeof getCloudflareContext>["env"];

async function ensureReferenceOwnership(uploadIds: string[], userId: string, env: Env) {
    if (!uploadIds.length) {
        return null;
    }

    const db = getDb(env);
    const owned = await db
        .select({ id: uploads.id })
        .from(uploads)
        .where(and(inArray(uploads.id, uploadIds), eq(uploads.userId, userId)));

    if (owned.length !== uploadIds.length) {
        return {
            error: "One or more reference uploads are unavailable.",
            status: 403 as const,
        };
    }

    return null;
}
