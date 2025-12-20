import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

import {
  DEFAULT_POST_LOGIN_REDIRECT,
  encodeStateCookie,
  GITHUB_STATE_COOKIE,
  getGithubAuthorizeUrl,
  sanitizeRedirectPath,
  STATE_COOKIE_TTL_SECONDS,
} from "@/lib/github";

const SECURE_COOKIE = process.env.NODE_ENV === "production";

export async function GET(request: NextRequest) {
  try {
    const env = getCloudflareContext().env;
    const redirectTarget = sanitizeRedirectPath(
      request.nextUrl.searchParams.get("redirectTo"),
      DEFAULT_POST_LOGIN_REDIRECT,
    );
    const state = createStateString();
    const { url } = await getGithubAuthorizeUrl(request.nextUrl.origin, state, env);

    const response = NextResponse.redirect(url);
    response.cookies.set(GITHUB_STATE_COOKIE, encodeStateCookie({ state, redirectTo: redirectTarget }), {
      httpOnly: true,
      secure: SECURE_COOKIE,
      sameSite: "lax",
      maxAge: STATE_COOKIE_TTL_SECONDS,
      path: "/",
    });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to start GitHub login.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function createStateString() {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
