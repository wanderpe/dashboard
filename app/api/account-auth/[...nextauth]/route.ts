import { NextRequest, NextResponse } from "next/server";

import { handlers } from "@/auth";
import { publicRateLimits } from "@/lib/public-rate-limits.mjs";

export const GET = handlers.GET;

export async function POST(request: NextRequest) {
  if (new URL(request.url).pathname.endsWith("/callback/credentials")) {
    let email = "";
    try {
      const form = await request.clone().formData();
      const value = form.get("email");
      if (typeof value === "string") email = value;
    } catch {
      // Auth.js validates malformed callbacks; this guard still counts by client.
    }

    const rateLimit = publicRateLimits.login(request.headers, email);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: { code: "rate_limited", message: "Too many sign-in attempts. Try again later." } },
        {
          status: 429,
          headers: {
            "Cache-Control": "no-store, max-age=0",
            "Retry-After": String(Math.max(1, Math.ceil(rateLimit.retryAfterMs / 1000))),
          },
        },
      );
    }
  }

  return handlers.POST(request);
}
