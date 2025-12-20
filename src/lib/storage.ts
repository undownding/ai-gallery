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

async function convertBufferToWebp(buffer: Buffer, env: CloudflareEnv) {
    const imageBinding = env?.IMAGES;
    if (!imageBinding) {
        throw new Error("Cloudflare IMAGES binding is not configured; unable to convert uploads to WebP.");
    }

    try {
        const transformer = imageBinding.input(bufferToReadableStream(buffer));
        const transformation = await transformer.output({ format: "image/webp", quality: 85 });
        const response = await transformation.response();
        const converted = Buffer.from(await response.arrayBuffer());
        const mimeType = transformation.contentType() || DEFAULT_MIME_TYPE;
        return { buffer: converted, mimeType };
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

export async function uploadBinaryImage(
    data: ArrayBuffer | Buffer,
    _sourceMimeType: string = DEFAULT_MIME_TYPE,
    owner: UploadOwner,
): Promise<Upload> {
    const env = getCloudflareContext().env;
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
    const { buffer: webpBuffer, mimeType } = await convertBufferToWebp(buffer, env);
    const { id, key } = buildObjectKey(owner);

    const obj = await env.r2.put(key, webpBuffer, {
        httpMetadata: { contentType: mimeType },
    });

    return persistUpload(env, id, key, obj?.etag, owner);
}

export async function uploadBase64Image(
    base64String: string,
    _sourceMimeType: string = DEFAULT_MIME_TYPE,
    owner: UploadOwner,
): Promise<Upload> {
    return uploadBinaryImage(Buffer.from(base64String, "base64"), DEFAULT_MIME_TYPE, owner);
}

export async function getBase64Image(key: string): Promise<string> {
    const obj = await getCloudflareContext().env.r2.get(key);
    if (!obj) {
        throw new Error("Object not found");
    }
    const arrayBuffer = await obj.arrayBuffer();
    return Buffer.from(arrayBuffer).toString("base64");
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

    if (userId && upload.userId !== userId) {
        throw new Error("Upload not found");
    }

    const data = await getBase64Image(upload.key);
    return {
        mimeType: mimeTypeFromKey(upload.key),
        data,
    };
}