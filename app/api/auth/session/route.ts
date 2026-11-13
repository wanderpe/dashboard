import { NextRequest, NextResponse } from "next/server";

import { verifySession } from "@/lib/dashboard-auth";

function getChatMode() {
  if (process.env.HERMES_CHAT_MOCK === "true") {
    return "mock" as const;
  }

  return process.env.HERMES_API_KEY?.trim() ? ("live" as const) : ("unconfigured" as const);
}

export async function GET(request: NextRequest) {
  const { authenticated, configured } = await verifySession(request);

  return NextResponse.json(
    {
      authenticated,
      configured,
      chatMode: getChatMode(),
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}
