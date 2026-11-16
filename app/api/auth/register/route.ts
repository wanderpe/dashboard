import { NextRequest, NextResponse } from 'next/server';
import { registerFriendAccount, revokeSession } from '@/lib/dashboard-auth';
import { publicRateLimits } from '@/lib/public-rate-limits.mjs';

function field(body: Record<string, unknown>, key: string) {
  return typeof body[key] === 'string' ? body[key].trim() : '';
}

export async function POST(request: NextRequest) {
  const rateLimit = publicRateLimits.registration(request.headers);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: { code: 'rate_limited', message: 'Too many account-creation attempts. Try again later.' } },
      {
        status: 429,
        headers: {
          'Cache-Control': 'no-store, max-age=0',
          'Retry-After': String(Math.max(1, Math.ceil(rateLimit.retryAfterMs / 1000))),
        },
      },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: { code: 'invalid_request', message: 'Enter your profile details.' } },
      { status: 400 },
    );
  }

  const name = field(body, 'name');
  const username = field(body, 'username');
  const email = field(body, 'email');
  const password = typeof body.password === 'string' ? body.password : '';

  if (!name || !username || !email || !password) {
    return NextResponse.json(
      { error: { code: 'invalid_request', message: 'Name, username, email, and password are required.' } },
      { status: 400 },
    );
  }
  if (name.length > 80 || username.length > 40 || email.length > 254) {
    return NextResponse.json(
      { error: { code: 'invalid_request', message: 'One or more profile fields are too long.' } },
      { status: 400 },
    );
  }
  if (password.length < 8 || password.length > 256) {
    return NextResponse.json(
      { error: { code: 'invalid_request', message: 'Password must be 8 to 256 characters long.' } },
      { status: 400 },
    );
  }

  try {
    const registrationSession = await registerFriendAccount({ username, email, password, name });
    await revokeSession(registrationSession.token);
    return NextResponse.json(
      { accountCreated: true },
      { status: 201, headers: { 'Cache-Control': 'no-store, max-age=0' } },
    );
  } catch (error) {
    const status = error && typeof error === 'object' && 'statusCode' in error && typeof error.statusCode === 'number'
      ? error.statusCode
      : 503;
    const clientError = status >= 400 && status < 500;
    return NextResponse.json(
      {
        error: {
          code: clientError ? 'account_creation_failed' : 'account_service_unavailable',
          message: clientError
            ? 'Could not create an account with those details.'
            : 'Account creation is temporarily unavailable. Please try again later.',
        },
      },
      { status },
    );
  }
}
