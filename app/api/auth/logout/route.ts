import { NextRequest, NextResponse } from 'next/server';
import {
  getSessionToken,
  isSecureRequest,
  SESSION_COOKIE,
  revokeSession,
} from '@/lib/dashboard-auth';

export async function POST(request: NextRequest) {
  const token = await getSessionToken();
  if (token) await revokeSession(token);

  const response = NextResponse.json(
    { authenticated: false },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  );

  response.cookies.set({
    name: SESSION_COOKIE,
    value: '',
    httpOnly: true,
    sameSite: 'strict',
    secure: isSecureRequest(request),
    path: '/',
    maxAge: 0,
  });

  return response;
}
