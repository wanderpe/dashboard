import "server-only";

import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";

export const OWNER_SESSION_COOKIE = "harvy_dashboard_owner";

// Legacy self-contained owner session (HMAC of the owner token). Kept so
// existing UI/config still resolves; the dashboard now hands out bearer
// sessions from the sessions-api instead of deriving a client-side HMAC.

const SESSION_PURPOSE = "harvy-dashboard-owner-session-v1";
const MIN_OWNER_TOKEN_LENGTH = 24;
const SESSION_API_URL = process.env.SESSION_API_URL ?? "http://127.0.0.1:3001";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export function getOwnerToken() {
  const value = process.env.DASHBOARD_OWNER_TOKEN?.trim() ?? "";
  return value.length >= MIN_OWNER_TOKEN_LENGTH ? value : null;
}

export function isOwnerAuthConfigured() {
  return getOwnerToken() !== null;
}

export function verifyOwnerToken(candidate: string) {
  const ownerToken = getOwnerToken();
  return ownerToken !== null && safeEqual(candidate, ownerToken);
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export function getOwnerSessionValue() {
  const ownerToken = getOwnerToken();
  if (!ownerToken) return null;
  return createHmac("sha256", ownerToken).update(SESSION_PURPOSE).digest("base64url");
}

export function verifyOwnerSession(candidate: string | undefined) {
  const expected = getOwnerSessionValue();
  return expected !== null && !!candidate && safeEqual(candidate, expected);
}

export function isSecureRequest(request: NextRequest) {
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  return forwardedProtocol === "https" || new URL(request.url).protocol === "https:";
}

export interface SessionTokenRecord {
  token: string;
  id: string;
  expiresAt: string;
}

// Handshake with the sessions-api backend: issues a bearer session for the
// authenticated owner (or any configured user). The token is later handed to
// the browser as an httpOnly session cookie.
export async function registerOwnerSession(
  userId: string = process.env.OWNER_USER_ID ?? "owner",
  userEmail: string = process.env.OWNER_USER_EMAIL ?? "owner@lab.local",
): Promise<SessionTokenRecord> {
  const res = await fetch(`${SESSION_API_URL}/api/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: userId ?? null, userEmail: userEmail ?? null }),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } };
    throw new Error(body?.error?.message ?? "Could not register dashboard session.");
  }

  const data = (await res.json()) as SessionTokenRecord & { token: string };
  return { token: data.token, id: data.id, expiresAt: data.expiresAt };
}

export async function getSessionToken(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(OWNER_SESSION_COOKIE)?.value ?? null;
}

export function setSessionToken(token: string, request: NextRequest): NextResponse {
  const response = NextResponse.next();
  response.cookies.set({
    name: OWNER_SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "strict",
    secure: isSecureRequest(request),
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return response;
}

export function removeSessionToken(request: NextRequest): NextResponse {
  const response = NextResponse.next();
  response.cookies.set({
    name: OWNER_SESSION_COOKIE,
    value: "",
    expires: new Date(0),
    path: "/",
  });
  return response;
}

export interface SessionState {
  authenticated: boolean;
  configured: boolean;
  chatMode: "live" | "mock" | "unconfigured";
}

// Verifies the browser's session token against the sessions-api. The token
// lives in the httpOnly cookie; a client-provided token may also be sent via
// the X-Session-Token header on non-browser/mobile clients.
export async function verifySession(
  request: NextRequest,
): Promise<SessionState> {
  const token = (await getSessionToken()) ?? request.headers.get("x-session-token");
  if (!token) {
    return { authenticated: false, configured: isOwnerAuthConfigured(), chatMode: "unconfigured" };
  }

  try {
    const res = await fetch(
      `${SESSION_API_URL}/api/sessions/${encodeURIComponent(token)}/verify`,
      { method: "GET" },
    );

    if (res.status === 401 || res.status === 403 || !res.ok) {
      return { authenticated: false, configured: isOwnerAuthConfigured(), chatMode: "unconfigured" };
    }

    return { authenticated: true, configured: isOwnerAuthConfigured(), chatMode: "live" };
  } catch {
    return { authenticated: false, configured: isOwnerAuthConfigured(), chatMode: "unconfigured" };
  }
}
