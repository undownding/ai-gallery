import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getCloudflareContext } from "@opennextjs/cloudflare";

import { getDb } from "@/db/client";
import { users, type User } from "@/db/schema";
import { ACCESS_TOKEN_COOKIE, verifyToken } from "@/lib/auth";

export type SessionUser = User;

type Env = ReturnType<typeof getCloudflareContext>["env"];

export async function getSessionUser(request: NextRequest, env?: Env): Promise<SessionUser | null> {
  const token = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  if (!token) {
    return null;
  }

  const runtimeEnv = env ?? getCloudflareContext().env;

  try {
    const payload = await verifyToken(token, "access", runtimeEnv);
    const userId = typeof payload.sub === "string" ? payload.sub : null;
    if (!userId) {
      return null;
    }

    const db = getDb(runtimeEnv);
    return (await db.query.users.findFirst({ where: eq(users.id, userId) })) ?? null;
  } catch {
    return null;
  }
}
