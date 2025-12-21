import dayjs from "dayjs";
import { Upload, uploads } from "@/db/schema";
import { v7 as uuidv7 } from "uuid";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getDb } from "@/db/client";
import { eq } from "drizzle-orm";

const DEFAULT_MIME_TYPE = "image/webp";
const TARGET_EXTENSION = "webp";
const EXTENSION_MAP: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
};

const INVERSE_EXTENSION_MAP: Record<string, string> = Object.entries(EXTENSION_MAP).reduce(
    (acc, [mime, ext]) => {
        acc[ext] = mime;
        return acc;
    },
    {} as Record<string, string>,
);

type CloudflareEnv = ReturnType<typeof getCloudflareContext>["env"];

type UploadOwner = {
    id: string;
    login: string;
};

type UploadInput = ArrayBuffer | Buffer | Uint8Array | ReadableStream<Uint8Array> | string;

function isReadableStreamInput(data: UploadInput): data is ReadableStream<Uint8Array> {
    return typeof ReadableStream !== "undefined" && data instanceof ReadableStream;
}

function isBufferInput(data: UploadInput): data is Buffer {
    return typeof Buffer !== "undefined" && Buffer.isBuffer(data);
}

function isUint8ArrayInput(data: UploadInput): data is Uint8Array {
    return data instanceof Uint8Array;
}

function isArrayBufferInput(data: UploadInput): data is ArrayBuffer {
    return data instanceof ArrayBuffer;
}

function buildObjectKey(owner: UploadOwner) {
    const ext = TARGET_EXTENSION;
    const id = uuidv7();
    const prefix = dayjs().format("YYYY-MM");
    return { id, key: `${prefix}/${owner.login}_${owner.id}/${id}.${ext}` };
}

function bufferToReadableStream(buffer: Uint8Array): ReadableStream<Uint8Array> {
    return new ReadableStream({
        start(controller) {
            controller.enqueue(buffer);
            controller.close();
        },
    });
}

function inputToReadableStream(data: UploadInput): ReadableStream<Uint8Array> {
    if (isReadableStreamInput(data)) {
        return data;
    }

    if (typeof data === "string") {
        return bufferToReadableStream(new TextEncoder().encode(data));
    }

    if (isBufferInput(data)) {
        return bufferToReadableStream(new Uint8Array(data));
    }

    if (isUint8ArrayInput(data)) {
        return bufferToReadableStream(data);
    }

    if (isArrayBufferInput(data)) {
        return bufferToReadableStream(new Uint8Array(data));
    }

    throw new Error("Unsupported upload input type");
}

async function readableStreamToString(stream: ReadableStream<Uint8Array>): Promise<string> {
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    while (true) {
        const { done, value } = await reader.read();
        if (done) {
            break;
        }
        if (value) {
            chunks.push(value);
        }
    }
    if (chunks.length === 0) {
        return "";
    }
    if (chunks.length === 1) {
        return new TextDecoder().decode(chunks[0]);
    }
    const totalLength = chunks.reduce((size, chunk) => size + chunk.length, 0);
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.length;
    }
    return new TextDecoder().decode(combined);
}

async function convertStreamToWebp(
    source: ReadableStream<Uint8Array>,
    env: CloudflareEnv,
    isBase64: boolean,
): Promise<{ stream: ReadableStream<Uint8Array>; mimeType: string }> {
    const imageBinding = env?.IMAGES;
    if (!imageBinding) {
        throw new Error("Cloudflare IMAGES binding is not configured; unable to convert uploads to WebP.");
    }

    try {
        const inputOptions: ImageInputOptions = {};
        if (isBase64) {
            inputOptions.encoding = "base64";
        }
        const transformer = imageBinding.input(source, inputOptions);
        const transformation = await transformer.output({ format: "image/webp", quality: 85 });
        const response = await transformation.response();
        const stream = response.body as ReadableStream<Uint8Array> | null;
        if (!stream) {
            throw new Error("Image transformer did not produce a readable stream.");
        }
        const mimeType = transformation.contentType() || DEFAULT_MIME_TYPE;
        return { stream, mimeType };
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unexpected error";
        throw new Error(`Unable to convert upload to WebP: ${message}`);
    }
}

async function persistUpload(env: CloudflareEnv, id: string, key: string, eTag: string | null | undefined, owner: UploadOwner) {
    return getDb(env)
        .insert(uploads)
        .values({ id, key, eTag: eTag ?? "", userId: owner.id })
        .returning()
        .get();
}

export async function uploadImage(
    data: UploadInput,
    _sourceMimeType: string = DEFAULT_MIME_TYPE,
    owner: UploadOwner,
    isBase64: boolean = false,
): Promise<Upload> {
    const env = getCloudflareContext().env;
    const sourceStream = inputToReadableStream(data);
    const { stream, mimeType } = await convertStreamToWebp(sourceStream, env, isBase64);
    const { id, key } = buildObjectKey(owner);

    const obj = await env.r2.put(key, stream, {
        httpMetadata: { contentType: mimeType },
    });

    return persistUpload(env, id, key, obj?.etag, owner);
}

export async function uploadBase64Image(
    base64String: string,
    _sourceMimeType: string = DEFAULT_MIME_TYPE,
    owner: UploadOwner,
): Promise<Upload> {
    return uploadImage(base64String, DEFAULT_MIME_TYPE, owner, true);
}

export async function getBase64Image(key: string): Promise<string> {
    const imageBinding = getCloudflareContext().env.IMAGES!;
    const stream = await getImageStream(key);
    const transformer = imageBinding.input(stream);
    const transformation = await transformer.output({ format: "image/webp" });
    const base64Stream = transformation.image({ encoding: "base64" });
    return readableStreamToString(base64Stream);
}

export async function getImageStream(key: string): Promise<ReadableStream<Uint8Array>> {
    const obj = await getCloudflareContext().env.r2.get(key);
    if (!obj) {
        throw new Error("Object not found");
    }
    const body = obj.body as ReadableStream<Uint8Array> | null;
    if (!body) {
        throw new Error("Object body is empty");
    }
    return body;
}

export async function getImage(key: string): Promise<ArrayBuffer> {
    const obj = await getCloudflareContext().env.r2.get(key);
    if (!obj) {
        throw new Error("Object not found");
    }
    return await obj.arrayBuffer();
}

export async function getUploadById(id: string): Promise<Upload | null> {
    return await (getDb(getCloudflareContext().env)
        .select()
        .from(uploads)
        .where(eq(uploads.id, id))
        .get()) ?? null;
}

function mimeTypeFromKey(key: string): string {
    const ext = key.split(".").pop()?.toLowerCase();
    if (!ext) {
        return DEFAULT_MIME_TYPE;
    }
    return INVERSE_EXTENSION_MAP[ext] ?? DEFAULT_MIME_TYPE;
}

export async function getUploadInlineData(
    uploadId: string,
    userId?: string,
): Promise<{ mimeType: string; data: string }> {
    const upload = await getUploadById(uploadId);
    if (!upload) {
        throw new Error(`Upload ${uploadId} not found`);
    }

    // if (userId && upload.userId !== userId) {
    //     throw new Error("Upload not found");
    // }

    const data = await getBase64Image(upload.key);
    return {
        mimeType: mimeTypeFromKey(upload.key),
        data,
    };
}