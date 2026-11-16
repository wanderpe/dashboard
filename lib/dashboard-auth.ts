import "server-only";

import { headers } from "next/headers";
import { getToken } from "next-auth/jwt";
import { NextRequest } from 'next/server';

export const SESSION_COOKIE = 'harvy_dashboard_session';

const SESSION_API_URL = process.env.SESSION_API_URL ?? 'http://127.0.0.1:3001';

export function isSecureRequest(request: NextRequest) {
  const forwardedProtocol = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  return forwardedProtocol === 'https' || new URL(request.url).protocol === 'https:';
}

export interface SessionTokenRecord {
  token: string;
  id: string;
  userId: string;
  displayName: string | null;
  username?: string | null;
  email?: string | null;
  expiresAt: string;
}

export async function registerFriendAccount(input: {
  username: string;
  email: string;
  password: string;
  name: string;
}) {
  const response = await fetch(`${SESSION_API_URL}/api/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    cache: 'no-store',
  });

  if (!response.ok) {
    await throwSessionApiError(response, 'Could not create the chat account.');
  }

  const data = (await response.json()) as {
    id: string;
    username: string | null;
    email: string | null;
    sessionToken: string;
    expiresAt: string;
  };

  return {
    token: data.sessionToken,
    id: data.id,
    userId: data.id,
    displayName: input.name,
    username: data.username,
    email: data.email,
    expiresAt: data.expiresAt,
  };
}

export async function loginFriendAccount(email: string, password: string): Promise<SessionTokenRecord> {
  const response = await fetch(`${SESSION_API_URL}/api/users/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
    cache: 'no-store',
  });

  if (!response.ok) {
    await throwSessionApiError(response, 'Invalid email or password.');
  }

  const data = (await response.json()) as {
    userId: string;
    userEmail: string | null;
    sessionToken: string;
    expiresAt: string;
  };

  const profileResponse = await fetch(`${SESSION_API_URL}/api/users/me`, {
    headers: { 'x-session-token': data.sessionToken },
    cache: 'no-store',
  });
  const profile = profileResponse.ok
    ? (await profileResponse.json()) as { displayName?: string | null; username?: string | null; email?: string | null }
    : null;

  return {
    token: data.sessionToken,
    id: data.userId,
    userId: data.userId,
    displayName: profile?.displayName ?? null,
    username: profile?.username ?? null,
    email: profile?.email ?? data.userEmail,
    expiresAt: data.expiresAt,
  };
}

async function throwSessionApiError(response: Response, fallback: string): Promise<never> {
  const body = (await response.json().catch(() => null)) as {
    message?: string;
    error?: { message?: string };
  } | null;
  const error = new Error(
    body?.message ?? body?.error?.message ?? fallback,
  ) as Error & { statusCode?: number };
  error.statusCode = response.status >= 400 && response.status < 500
    ? response.status
    : 503;
  throw error;
}

export async function revokeSession(token: string) {
  await fetch(`${SESSION_API_URL}/api/sessions/${encodeURIComponent(token)}/revoke`, {
    method: 'DELETE',
    cache: 'no-store',
  }).catch(() => undefined);
}

export async function getSessionToken() {
  const requestHeaders = await headers();
  const jwt = await getToken({
    req: { headers: requestHeaders },
    secret: process.env.AUTH_SECRET,
    secureCookie: process.env.NODE_ENV === 'production',
  });
  const authSessionToken = jwt?.sessionToken;
  return typeof authSessionToken === 'string' && authSessionToken ? authSessionToken : null;
}

export interface SessionState {
  authenticated: boolean;
  chatMode: 'live' | 'mock' | 'unconfigured';
}

export interface VerifiedSession extends SessionState {
  sessionToken: string | null;
  userId: string | null;
  profile: {
    displayName: string | null;
    username: string | null;
  } | null;
}

export async function getVerifiedSession(request: NextRequest): Promise<VerifiedSession> {
  const sessionToken = (await getSessionToken()) ?? request.headers.get('x-session-token');

  if (!sessionToken) {
    return {
      authenticated: false,
      chatMode: 'unconfigured',
      sessionToken: null,
      userId: null,
      profile: null,
    };
  }

  try {
    const response = await fetch(
      `${SESSION_API_URL}/api/sessions/${encodeURIComponent(sessionToken)}/verify`,
      { method: 'GET', cache: 'no-store' },
    );

    if (!response.ok) {
      return {
        authenticated: false,
        chatMode: 'unconfigured',
        sessionToken: null,
        userId: null,
        profile: null,
      };
    }

    const session = (await response.json()) as {
      userId?: string | null;
      profile?: { displayName?: unknown; username?: unknown } | null;
    };
    const profile = session.profile && typeof session.profile === 'object'
      ? {
          displayName: typeof session.profile.displayName === 'string' ? session.profile.displayName : null,
          username: typeof session.profile.username === 'string' ? session.profile.username : null,
        }
      : null;
    return {
      authenticated: true,
      chatMode: 'live',
      sessionToken,
      userId: session.userId ?? null,
      profile,
    };
  } catch {
    return {
      authenticated: false,
      chatMode: 'unconfigured',
      sessionToken: null,
      userId: null,
      profile: null,
    };
  }
}

export async function verifySession(request: NextRequest): Promise<SessionState> {
  const { authenticated, chatMode } = await getVerifiedSession(request);
  return { authenticated, chatMode };
}
