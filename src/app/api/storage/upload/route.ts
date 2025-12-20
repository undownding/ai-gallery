import { NextRequest, NextResponse } from "next/server";

import { uploadImage } from "@/lib/storage";
import { getSessionUser } from "@/lib/session";

export async function PUT(request: NextRequest) {
    const user = await getSessionUser(request);
    if (!user) {
        return NextResponse.json({ error: "Sign in to upload files." }, { status: 401 });
    }

    const bodyStream = request.body;
    if (!bodyStream) {
        return NextResponse.json({ error: "Request body is empty." }, { status: 400 });
    }

    const mimeTypeHeader = request.headers.get("content-type");

    try {
        const upload = await uploadImage(bodyStream, mimeTypeHeader ?? undefined, user);
        return NextResponse.json({ data: upload });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unexpected error";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
