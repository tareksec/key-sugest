// Shared by middleware (Edge runtime) and route handlers, so only Web Crypto APIs are used here.

export const AUTH_COOKIE = "kwi_auth";
export const AUTH_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

/** The configured password, or null when none is set. */
export function getAppPassword(): string | null {
  const password = process.env.APP_PASSWORD?.trim();
  return password ? password : null;
}

/** Without a password the gate is open in development and closed in production. */
export function isAuthDisabled(): boolean {
  return !getAppPassword() && process.env.NODE_ENV !== "production";
}

/** Cookie value derived from the password, so changing APP_PASSWORD signs everyone out. */
export async function authToken(password: string): Promise<string> {
  const data = new TextEncoder().encode(`key-suggest:v1:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
