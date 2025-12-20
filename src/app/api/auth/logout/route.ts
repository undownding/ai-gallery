import { NextResponse } from "next/server";

import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from "@/lib/auth";

export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete({name :ACCESS_TOKEN_COOKIE,  path: "/" });
  response.cookies.delete({name: REFRESH_TOKEN_COOKIE, path: "/" });
  return response;
}
