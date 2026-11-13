import { NextRequest, NextResponse } from "next/server";

import {
  isSecureRequest,
  OWNER_SESSION_COOKIE,
} from "@/lib/dashboard-auth";

export async function POST(request: NextRequest) {
  const response = NextResponse.json(
    { authenticated: false },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );

  response.cookies.set({
    name: OWNER_SESSION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "strict",
    secure: isSecureRequest(request),
    path: "/",
    maxAge: 0,
  });

  return response;
}
