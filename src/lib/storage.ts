import dayjs from "dayjs";
import {NewUpload, uploads} from "@/db/schema";
import {v7 as uuidv7} from "uuid";
import {getCloudflareContext} from "@opennextjs/cloudflare";
import {getDb} from "@/db/client";

export async function uploadBase64Image(base64String: string, mimeType: string = 'image/png'): Promise<NewUpload> {
    const extMap: Record<string, string> = {
        "image/png": "png",
        "image/jpeg": "jpg",
        "image/jpg": "jpg",
        "image/gif": "gif",
        "image/webp": "webp"
    };
    const ext = extMap[mimeType] ?? "bin";
    const key = `${dayjs().format("YYYY-MM/DD")}/${uuidv7()}.${ext}`;

    const obj = await getCloudflareContext().env.r2.put(key, Buffer.from(base64String, 'base64'));

    return getDb(getCloudflareContext().env).insert(uploads).values({
        key,
        eTag: obj?.etag ?? ''
    }).returning().get()
}