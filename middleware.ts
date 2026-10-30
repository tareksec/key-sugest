import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, authToken, getAppPassword, isAuthDisabled, safeEqual } from "@/lib/auth";

const PUBLIC_PATHS = new Set(["/login", "/api/login"]);

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (PUBLIC_PATHS.has(pathname) || isAuthDisabled()) return NextResponse.next();

  const password = getAppPassword();
  const cookie = request.cookies.get(AUTH_COOKIE)?.value;
  if (password && cookie && safeEqual(cookie, await authToken(password))) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    const error = password ? "Unauthorized. Please sign in." : "APP_PASSWORD is not configured on the server.";
    return NextResponse.json({ error }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  if (pathname !== "/") loginUrl.searchParams.set("next", pathname + search);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
