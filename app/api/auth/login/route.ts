import { NextRequest, NextResponse } from "next/server";

import {
  isOwnerAuthConfigured,
  isSecureRequest,
  OWNER_SESSION_COOKIE,
  registerOwnerSession,
  verifyOwnerToken,
} from "@/lib/dashboard-auth";

export async function POST(request: NextRequest) {
  if (!isOwnerAuthConfigured()) {
    return NextResponse.json(
      {
        error: {
          code: "owner_auth_not_configured",
          message:
            "Owner access is not configured. Set DASHBOARD_OWNER_TOKEN in the dashboard server environment.",
        },
      },
      { status: 503 },
    );
  }

  let ownerToken = "";

  try {
    const body = (await request.json()) as { ownerToken?: unknown };
    ownerToken = typeof body.ownerToken === "string" ? body.ownerToken : "";
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "invalid_request",
          message: "Enter the dashboard owner token.",
        },
      },
      { status: 400 },
    );
  }

  if (!verifyOwnerToken(ownerToken)) {
    return NextResponse.json(
      {
        error: {
          code: "invalid_owner_token",
          message: "That owner token was not accepted.",
        },
      },
      { status: 401 },
    );
  }

  let sessionToken = "";
  try {
    const session = await registerOwnerSession();
    sessionToken = session.token;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not register a dashboard session.";
    return NextResponse.json(
      {
        error: {
          code: "sessions_api_unavailable",
          message,
        },
      },
      { status: 503 },
    );
  }

  const response = NextResponse.json(
    { authenticated: true },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );

  response.cookies.set({
    name: OWNER_SESSION_COOKIE,
    value: sessionToken,
    httpOnly: true,
    sameSite: "strict",
    secure: isSecureRequest(request),
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  return response;
}
