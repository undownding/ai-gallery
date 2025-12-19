import { NextRequest, NextResponse } from "next/server";

import { generateContent, type AspectRatio, type ImageSize } from "@/lib/gemini";
import {uploadBase64Image} from "@/lib/storage";
import {NewUpload} from "@/db/schema";

const encoder = new TextEncoder();

type GenerateRequestBody = {
    prompt?: string;
    aspectRatio?: AspectRatio;
    imageSize?: ImageSize;
};

function sendEvent(controller: ReadableStreamDefaultController<Uint8Array>, event: string, data: unknown) {
    controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
}

export async function POST(request: NextRequest) {
    let payload: GenerateRequestBody;

    try {
        payload = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
    }

    const { prompt, aspectRatio, imageSize } = payload ?? {};

    if (!prompt || typeof prompt !== "string") {
        return NextResponse.json({ error: "Field 'prompt' is required." }, { status: 400 });
    }

    const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
            try {
                let upload: NewUpload | null = null
                const response = await generateContent(prompt, aspectRatio, imageSize);
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
                            upload = await uploadBase64Image(inlineData.data, inlineData.mimeType)
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

    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
        },
    });
}
