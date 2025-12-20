import { readEnvValue, type SecretBinding } from "@/lib/env";

const AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const TOKEN_URL = "https://github.com/login/oauth/access_token";
const PROFILE_URL = "https://api.github.com/user";
const EMAILS_URL = "https://api.github.com/user/emails";
const USER_AGENT = "ai-gallery";

export type GithubEnv = {
  GITHUB_CLIENT_ID?: string | SecretBinding;
  GITHUB_CLIENT_SECRET?: string | SecretBinding;
};

export type GithubProfile = {
  id: number;
  login: string;
  name?: string | null;
  email?: string | null;
  avatar_url?: string | null;
};

export type GithubEmailRecord = {
  email: string;
  primary: boolean;
  verified: boolean;
};

export type GithubStateCookiePayload = {
  state: string;
  redirectTo: string;
};

export const GITHUB_STATE_COOKIE = "github_oauth_state";
export const STATE_COOKIE_TTL_SECONDS = 60 * 90;
export const DEFAULT_POST_LOGIN_REDIRECT = "/generate";

export async function getGithubAuthorizeUrl(origin: string, state: string, env?: GithubEnv) {
  const clientId = await readEnvValue(env?.GITHUB_CLIENT_ID, "GITHUB_CLIENT_ID");
  const redirectUri = new URL("/api/auth/github/callback", origin).toString();
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", "read:user user:email");
  url.searchParams.set("state", state);
  url.searchParams.set("allow_signup", "true");
  return { url: url.toString(), redirectUri };
}

export function sanitizeRedirectPath(candidate: string | null | undefined, fallback = DEFAULT_POST_LOGIN_REDIRECT) {
  if (!candidate || !candidate.startsWith("/")) {
    return fallback;
  }
  if (candidate.startsWith("//")) {
    return fallback;
  }
  return candidate;
}

export function encodeStateCookie(payload: GithubStateCookiePayload) {
  return Buffer.from(JSON.stringify(payload), "utf-8").toString("base64url");
}

export function decodeStateCookie(value?: string | null): GithubStateCookiePayload | null {
  if (!value) {
    return null;
  }
  try {
    const json = Buffer.from(value, "base64url").toString("utf-8");
    return JSON.parse(json) as GithubStateCookiePayload;
  } catch {
    return null;
  }
}

export async function exchangeCodeForToken(code: string, redirectUri: string, env?: GithubEnv) {
  const clientId = await readEnvValue(env?.GITHUB_CLIENT_ID, "GITHUB_CLIENT_ID");
  const clientSecret = await readEnvValue(env?.GITHUB_CLIENT_SECRET, "GITHUB_CLIENT_SECRET");
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
    },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri }),
  });

  if (!response.ok) {
    throw new Error("GitHub token exchange failed.");
  }

  const payload = (await response.json()) as { access_token?: string; error?: string; error_description?: string };
  if (payload.error) {
    throw new Error(payload.error_description || payload.error || "GitHub token exchange failed.");
  }
  if (!payload.access_token) {
    throw new Error("GitHub access token missing.");
  }
  return payload.access_token;
}

export async function fetchGithubProfile(accessToken: string) {
  const response = await fetch(PROFILE_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": USER_AGENT,
      Accept: "application/vnd.github+json",
    },
  });

  if (!response.ok) {
    throw new Error("Unable to fetch GitHub profile.");
  }

  return (await response.json()) as GithubProfile;
}

export async function fetchGithubPrimaryEmail(accessToken: string) {
  const response = await fetch(EMAILS_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": USER_AGENT,
      Accept: "application/vnd.github+json",
    },
  });

  if (!response.ok) {
    return null;
  }

  const records = (await response.json()) as GithubEmailRecord[];
  const primary = records.find((record) => record.primary && record.verified);
  return primary?.email ?? null;
}
