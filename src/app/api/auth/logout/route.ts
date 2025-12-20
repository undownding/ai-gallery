import { NextResponse } from "next/server";

import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from "@/lib/auth";

export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete(ACCESS_TOKEN_COOKIE, { path: "/" });
  response.cookies.delete(REFRESH_TOKEN_COOKIE, { path: "/" });
  return response;
}
