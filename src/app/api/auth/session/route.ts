import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { ACCESS_TOKEN_COOKIE, verifyToken } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const token = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ user: null });
  }

  try {
    const env = getCloudflareContext().env;
    const payload = await verifyToken(token, "access", env);
    const userId = typeof payload.sub === "string" ? payload.sub : null;
    if (!userId) {
      throw new Error("Invalid token subject.");
    }

    const db = getDb(env);
    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user) {
      const response = NextResponse.json({ user: null }, { status: 404 });
      response.cookies.delete(ACCESS_TOKEN_COOKIE, { path: "/" });
      return response;
    }

    const { id, login, name, email, avatarUrl } = user;
    return NextResponse.json({ user: { id, login, name, email, avatarUrl } });
  } catch {
    const response = NextResponse.json({ user: null }, { status: 401 });
    response.cookies.delete(ACCESS_TOKEN_COOKIE, { path: "/" });
    return response;
  }
}
