import { NextRequest, NextResponse } from "next/server";

import { getVerifiedSession } from "@/lib/dashboard-auth";

export async function GET(request: NextRequest) {
  const session = await getVerifiedSession(request);
  return NextResponse.json(
    {
      authenticated: session.authenticated,
      chatMode: session.chatMode,
      userId: session.userId,
      profile: session.profile,
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}
