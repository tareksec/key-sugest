import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, AUTH_MAX_AGE, authToken, getAppPassword, safeEqual } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FAILED_LOGIN_DELAY_MS = 800;

export async function POST(request: NextRequest) {
  const password = getAppPassword();
  if (!password) {
    return NextResponse.json({ error: "APP_PASSWORD is not configured on the server." }, { status: 500 });
  }

  let submitted = "";
  try {
    const body = (await request.json()) as { password?: unknown };
    submitted = typeof body.password === "string" ? body.password : "";
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const expected = await authToken(password);
  if (!safeEqual(await authToken(submitted), expected)) {
    // Slow down guessing.
    await new Promise((resolve) => setTimeout(resolve, FAILED_LOGIN_DELAY_MS));
    return NextResponse.json({ error: "Wrong password." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(AUTH_COOKIE, expected, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: AUTH_MAX_AGE,
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(AUTH_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return response;
}
