import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const ADMIN_COOKIE = "any_movie_admin";
const SESSION_SECONDS = 60 * 60 * 12;

function configuredCredentials() {
  return {
    username: process.env.ADMIN_USERNAME?.trim() || "",
    password: process.env.ADMIN_PASSWORD || "",
  };
}

function safeEqual(left: string, right: string) {
  const leftDigest = createHmac("sha256", "any-movie-credential-check").update(left).digest();
  const rightDigest = createHmac("sha256", "any-movie-credential-check").update(right).digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

function signingSecret() {
  const { password } = configuredCredentials();
  return process.env.ADMIN_SESSION_SECRET || password;
}

function signature(payload: string) {
  return createHmac("sha256", signingSecret()).update(payload).digest("base64url");
}

export function adminIsConfigured() {
  const { username, password } = configuredCredentials();
  return username.length >= 3 && password.length >= 12;
}

export function validAdminCredentials(username: string, password: string) {
  if (!adminIsConfigured()) return false;
  const configured = configuredCredentials();
  return safeEqual(username.trim().toLowerCase(), configured.username.toLowerCase())
    && safeEqual(password, configured.password);
}

export function createAdminToken() {
  const { username } = configuredCredentials();
  const payload = Buffer.from(JSON.stringify({
    sub: username,
    exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS,
  })).toString("base64url");
  return `${payload}.${signature(payload)}`;
}

function verifyAdminToken(token?: string) {
  if (!token || !adminIsConfigured()) return false;
  const [payload, suppliedSignature] = token.split(".");
  if (!payload || !suppliedSignature || !safeEqual(suppliedSignature, signature(payload))) return false;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { sub?: string; exp?: number };
    const { username } = configuredCredentials();
    return parsed.sub === username && typeof parsed.exp === "number" && parsed.exp > Date.now() / 1000;
  } catch {
    return false;
  }
}

export async function isAdminRequest() {
  const store = await cookies();
  return verifyAdminToken(store.get(ADMIN_COOKIE)?.value);
}

export function adminCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
    maxAge: SESSION_SECONDS,
  };
}
