import { SignJWT, jwtVerify, type JWTPayload } from "jose";

import { readEnvValue, type SecretBinding } from "@/lib/env";

const encoder = new TextEncoder();

export const ACCESS_TOKEN_COOKIE = "ai_gallery_access";
export const REFRESH_TOKEN_COOKIE = "ai_gallery_refresh";
export const ACCESS_TOKEN_TTL_SECONDS = 60 * 90;
export const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 14;

type TokenKind = "access" | "refresh";

type AuthEnv = {
  AUTH_JWT_SECRET?: string | SecretBinding;
};

export type TokenPair = {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: number;
  refreshTokenExpiresAt: number;
};

async function resolveJwtSecret(env?: AuthEnv) {
  return readEnvValue(env?.AUTH_JWT_SECRET, "AUTH_JWT_SECRET");
}

async function signToken(userId: string, kind: TokenKind, ttlSeconds: number, env?: AuthEnv) {
  const secret = await resolveJwtSecret(env);
  const key = encoder.encode(secret);
  const issuedAtSeconds = Math.floor(Date.now() / 1000);
  const expiresAtSeconds = issuedAtSeconds + ttlSeconds;

  const token = await new SignJWT({ kind, sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(issuedAtSeconds)
    .setExpirationTime(expiresAtSeconds)
    .sign(key);

  return { token, expiresAt: expiresAtSeconds * 1000 };
}

export async function issueTokenPair(userId: string, env?: AuthEnv): Promise<TokenPair> {
  const [access, refresh] = await Promise.all([
    signToken(userId, "access", ACCESS_TOKEN_TTL_SECONDS, env),
    signToken(userId, "refresh", REFRESH_TOKEN_TTL_SECONDS, env),
  ]);

  return {
    accessToken: access.token,
    refreshToken: refresh.token,
    accessTokenExpiresAt: access.expiresAt,
    refreshTokenExpiresAt: refresh.expiresAt,
  };
}

export async function verifyToken(token: string, expectedKind: TokenKind, env?: AuthEnv) {
  const secret = await resolveJwtSecret(env);
  const key = encoder.encode(secret);
  const { payload } = await jwtVerify(token, key);
  if (!payload || payload.kind !== expectedKind) {
    throw new Error("Invalid token kind.");
  }
  return payload as JWTPayload & { kind: TokenKind; sub: string };
}
