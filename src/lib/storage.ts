import dayjs from "dayjs";
import {NewUpload, Upload, uploads} from "@/db/schema";
import {v7 as uuidv7} from "uuid";
import {getCloudflareContext} from "@opennextjs/cloudflare";
import {getDb} from "@/db/client";

export async function uploadBase64Image(base64String: string, mimeType: string = 'image/png'): Promise<Upload> {
    const extMap: Record<string, string> = {
        "image/png": "png",
        "image/jpeg": "jpg",
        "image/jpg": "jpg",
        "image/gif": "gif",
        "image/webp": "webp"
    };
    const ext = extMap[mimeType] ?? "bin";
    const id = uuidv7();
    const key = `${dayjs().format("YYYY-MM/DD")}/${id}.${ext}`;

    const obj = await getCloudflareContext().env.r2.put(key, Buffer.from(base64String, 'base64'));

    return getDb(getCloudflareContext().env).insert(uploads).values({
        id,
        key,
        eTag: obj?.etag ?? ''
    }).returning().get()
}

export async function getBase64Image(key: string): Promise<string> {
    const obj = await getCloudflareContext().env.r2.get(key);
    if (!obj) {
        throw new Error("Object not found");
    }
    const arrayBuffer = await obj.arrayBuffer();
    return Buffer.from(arrayBuffer).toString('base64');
}