import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

import { getDb } from "@/db/client";
import { users, type NewUser } from "@/db/schema";
import {
  ACCESS_TOKEN_COOKIE,
  ACCESS_TOKEN_TTL_SECONDS,
  issueTokenPair,
  REFRESH_TOKEN_COOKIE,
  REFRESH_TOKEN_TTL_SECONDS,
} from "@/lib/auth";
import {
  decodeStateCookie,
  DEFAULT_POST_LOGIN_REDIRECT,
  exchangeCodeForToken,
  fetchGithubPrimaryEmail,
  fetchGithubProfile,
  GITHUB_STATE_COOKIE,
  sanitizeRedirectPath,
} from "@/lib/github";

const SECURE_COOKIE = process.env.NODE_ENV === "production";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  if (!code || !state) {
    return NextResponse.json({ error: "Missing OAuth parameters." }, { status: 400 });
  }

  const cookieValue = request.cookies.get(GITHUB_STATE_COOKIE)?.value;
  const storedState = decodeStateCookie(cookieValue);
  if (!storedState || storedState.state !== state) {
    return NextResponse.json({ error: "Invalid or expired OAuth state." }, { status: 400 });
  }

  const env = getCloudflareContext().env;
  const redirectUri = new URL("/api/auth/github/callback", request.nextUrl.origin).toString();

  try {
    const githubToken = await exchangeCodeForToken(code, redirectUri, env);
    const profile = await fetchGithubProfile(githubToken);
    const primaryEmail = profile.email ?? (await fetchGithubPrimaryEmail(githubToken));

    const githubId = String(profile.id ?? "").trim();
    if (!githubId) {
      throw new Error("GitHub profile id missing.");
    }

    const db = getDb(env);
    const now = new Date().toISOString();

    const existing = await db.query.users.findFirst({
      where: eq(users.githubId, githubId),
    });

    const userUpdate = {
      login: profile.login,
      name: profile.name ?? profile.login,
      email: primaryEmail ?? null,
      avatarUrl: profile.avatar_url ?? null,
      updatedAt: now,
      lastLoginAt: now,
    } satisfies Partial<NewUser>;

    let userId: string;

    if (existing) {
      await db
        .update(users)
        .set(userUpdate)
        .where(eq(users.id, existing.id));
      userId = existing.id;
    } else {
      const inserted = await db
        .insert(users)
        .values({
          githubId,
          login: profile.login,
          name: profile.name ?? profile.login,
          email: primaryEmail ?? null,
          avatarUrl: profile.avatar_url ?? null,
          createdAt: now,
          updatedAt: now,
          lastLoginAt: now,
        })
        .returning()
        .get();
      if (!inserted) {
        throw new Error("Unable to persist user.");
      }
      userId = inserted.id;
    }

    const tokens = await issueTokenPair(userId, env);

    const redirectPath = sanitizeRedirectPath(storedState.redirectTo, DEFAULT_POST_LOGIN_REDIRECT);
    const destination = new URL(redirectPath, request.nextUrl.origin);

    const response = NextResponse.redirect(destination);

    response.cookies.set(ACCESS_TOKEN_COOKIE, tokens.accessToken, {
      httpOnly: true,
      secure: SECURE_COOKIE,
      sameSite: "lax",
      maxAge: ACCESS_TOKEN_TTL_SECONDS,
      path: "/",
    });

    response.cookies.set(REFRESH_TOKEN_COOKIE, tokens.refreshToken, {
      httpOnly: true,
      secure: SECURE_COOKIE,
      sameSite: "lax",
      maxAge: REFRESH_TOKEN_TTL_SECONDS,
      path: "/",
    });

    response.cookies.delete(GITHUB_STATE_COOKIE, { path: "/" });

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "GitHub login failed.";
    const fallback = new URL("/", request.nextUrl.origin);
    fallback.searchParams.set("authError", message);
    const response = NextResponse.redirect(fallback);
    response.cookies.delete(GITHUB_STATE_COOKIE, { path: "/" });
    return response;
  }
}
