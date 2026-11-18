import { NextRequest, NextResponse } from "next/server";
import { getVerifiedSession } from "@/lib/dashboard-auth";
import {
  readLimitedJsonBody,
  RequestBodyTooLargeError,
} from "@/lib/map-route-request-body.mjs";
import { publicRateLimits } from "@/lib/public-rate-limits.mjs";
import {
  fetchMapNearbyPlaces,
  MapNearbyError,
  parseMapNearbyRequest,
} from "@/lib/map-nearby-service.mjs";

const PUBLIC_CHAT_ENABLED = process.env.PUBLIC_CHAT_ENABLED === "true";
const MAX_REQUEST_BYTES = 2_048;

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json(
    { error: { code, message } },
    { status, headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}

function rateLimitResponse(retryAfterMs: number) {
  const response = errorResponse(
    "rate_limited",
    "Too many map requests. Please wait before trying again.",
    429,
  );
  response.headers.set("Retry-After", String(Math.max(1, Math.ceil(retryAfterMs / 1_000))));
  return response;
}

export async function POST(request: NextRequest) {
  if (!PUBLIC_CHAT_ENABLED) {
    return errorResponse("chat_disabled", "Eric AI is temporarily unavailable.", 503);
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return errorResponse("request_too_large", "The nearby-places request is too large.", 413);
  }
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return errorResponse("invalid_request", "Send the nearby-places request as JSON.", 415);
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
      return errorResponse("request_too_large", "The nearby-places request is too large.", 413);
    }
    return errorResponse("invalid_request", "The nearby-places request was not valid JSON.", 400);
  }

  const nearbyRequest = parseMapNearbyRequest(body);
  if (!nearbyRequest) {
    return errorResponse(
      "invalid_nearby_search",
      "Provide a place to search around, one or more supported categories, and a radius up to 5 km.",
      400,
    );
  }

  try {
    const result = await fetchMapNearbyPlaces(nearbyRequest);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    if (error instanceof MapNearbyError || (error && typeof error === "object" && "status" in error && "code" in error)) {
      const providerError = error as { code: string; message: string; status: number };
      return errorResponse(providerError.code, providerError.message, providerError.status);
    }
    return errorResponse("map_provider_unavailable", "Nearby places are unavailable right now. Try again shortly.", 502);
  }
}
