import { NextRequest, NextResponse } from "next/server";

import { uploadBinaryImage } from "@/lib/storage";
import { getSessionUser } from "@/lib/session";

export async function PUT(request: NextRequest) {
    const user = await getSessionUser(request);
    if (!user) {
        return NextResponse.json({ error: "Sign in to upload files." }, { status: 401 });
    }

    let arrayBuffer: ArrayBuffer;

    try {
        arrayBuffer = await request.arrayBuffer();
    } catch {
        return NextResponse.json({ error: "Unable to read request body." }, { status: 400 });
    }

    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
        return NextResponse.json({ error: "Request body is empty." }, { status: 400 });
    }

    const mimeTypeHeader = request.headers.get("content-type");

    try {
        const upload = await uploadBinaryImage(arrayBuffer, mimeTypeHeader ?? undefined, user);
        return NextResponse.json({ data: upload });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unexpected error";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
