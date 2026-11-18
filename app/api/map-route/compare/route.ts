import { NextRequest, NextResponse } from "next/server";
import { getVerifiedSession } from "@/lib/dashboard-auth";
import {
  readLimitedJsonBody,
  RequestBodyTooLargeError,
} from "@/lib/map-route-request-body.mjs";
import { MapNearbyError } from "@/lib/map-nearby-service.mjs";
import { publicRateLimits } from "@/lib/public-rate-limits.mjs";
import { fetchMapRouteComparison, parseMapRouteComparisonRequest } from "@/lib/map-route-comparison-service.mjs";
import { MapRouteError } from "@/lib/map-route-service.mjs";

const PUBLIC_CHAT_ENABLED = process.env.PUBLIC_CHAT_ENABLED === "true";
const MAX_REQUEST_BYTES = 2_048;

function errorResponse(code: string, message: string, status: number, details?: unknown) {
  return NextResponse.json(
    { error: { code, message, ...(details === undefined ? {} : { details }) } },
    { status, headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}

function rateLimitResponse(retryAfterMs: number) {
  const response = errorResponse("rate_limited", "Too many map requests. Please wait before trying again.", 429);
  response.headers.set("Retry-After", String(Math.max(1, Math.ceil(retryAfterMs / 1_000))));
  return response;
}

export async function POST(request: NextRequest) {
  if (!PUBLIC_CHAT_ENABLED) return errorResponse("chat_disabled", "Eric AI is temporarily unavailable.", 503);

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return errorResponse("request_too_large", "The route-comparison request is too large.", 413);
  }
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return errorResponse("invalid_request", "Send the route-comparison request as JSON.", 415);
  }

  const clientRateLimit = publicRateLimits.mapRequest(request.headers);
  if (!clientRateLimit.allowed) return rateLimitResponse(clientRateLimit.retryAfterMs);

  let session;
  try {
    session = await getVerifiedSession(request);
  } catch {
    return errorResponse("auth_unavailable", "Authentication is temporarily unavailable.", 503);
  }
  if (!session.authenticated || !session.sessionToken || !session.userId) {
    return errorResponse("owner_auth_required", "Authentication is required to use Eric AI.", 401);
  }

  const userRateLimit = publicRateLimits.mapUser(session.userId);
  if (!userRateLimit.allowed) return rateLimitResponse(userRateLimit.retryAfterMs);

  let body: unknown;
  try {
    body = await readLimitedJsonBody(request.body, MAX_REQUEST_BYTES);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return errorResponse("request_too_large", "The route-comparison request is too large.", 413);
    }
    return errorResponse("invalid_request", "The route-comparison request was not valid JSON.", 400);
  }

  if (!parseMapRouteComparisonRequest(body)) {
    return errorResponse(
      "invalid_route_comparison",
      "Provide a route origin, a nearby search center, supported categories, and a travel mode.",
      400,
    );
  }

  try {
    const result = await fetchMapRouteComparison(body);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    if (error instanceof MapRouteError || error instanceof MapNearbyError) {
      return errorResponse(error.code, error.message, error.status, error instanceof MapRouteError ? error.details : undefined);
    }
    return errorResponse("map_provider_unavailable", "Nearby route comparison is unavailable right now.", 502);
  }
}
