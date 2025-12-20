import dayjs from "dayjs";
import { Upload, uploads } from "@/db/schema";
import { v7 as uuidv7 } from "uuid";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getDb } from "@/db/client";
import { eq } from "drizzle-orm";

const DEFAULT_MIME_TYPE = "image/png";
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

type UploadOwner = {
    id: string;
    login: string;
};

function buildObjectKey(mimeType: string, owner: UploadOwner) {
    const ext = EXTENSION_MAP[mimeType] ?? "bin";
    const id = uuidv7();
    const prefix = dayjs().format("YYYY-MM");
    return { id, key: `${prefix}/${owner.login}_${owner.id}/${id}.${ext}` };
}

async function persistUpload(id: string, key: string, eTag: string | null | undefined, owner: UploadOwner) {
    return getDb(getCloudflareContext().env)
        .insert(uploads)
        .values({ id, key, eTag: eTag ?? "", userId: owner.id })
        .returning()
        .get();
}

export async function uploadBinaryImage(
    data: ArrayBuffer | Buffer,
    mimeType: string = DEFAULT_MIME_TYPE,
    owner: UploadOwner,
): Promise<Upload> {
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
    const normalizedMime = mimeType || DEFAULT_MIME_TYPE;
    const { id, key } = buildObjectKey(normalizedMime, owner);

    const obj = await getCloudflareContext().env.r2.put(key, buffer);

    return persistUpload(id, key, obj?.etag, owner);
}

export async function uploadBase64Image(
    base64String: string,
    mimeType: string = DEFAULT_MIME_TYPE,
    owner: UploadOwner,
): Promise<Upload> {
    return uploadBinaryImage(Buffer.from(base64String, "base64"), mimeType, owner);
}

export async function getBase64Image(key: string): Promise<string> {
    const obj = await getCloudflareContext().env.r2.get(key);
    if (!obj) {
        throw new Error("Object not found");
    }
    const arrayBuffer = await obj.arrayBuffer();
    return Buffer.from(arrayBuffer).toString('base64');
}

export async function getUploadById(id: string): Promise<Upload | null> {
    return await (getDb(getCloudflareContext().env)
        .select()
        .from(uploads)
        .where(eq(uploads.id, id))
        .get()) ?? null;
}

function mimeTypeFromKey(key: string): string {
    const ext = key.split('.').pop()?.toLowerCase();
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