import { NextRequest, NextResponse } from "next/server";
import { getVerifiedSession } from "@/lib/dashboard-auth";
import {
  readLimitedJsonBody,
  RequestBodyTooLargeError,
} from "@/lib/map-route-request-body.mjs";
import { publicRateLimits } from "@/lib/public-rate-limits.mjs";
import {
  fetchMapRoute,
  MapRouteError,
  parseMapRouteRequest,
} from "@/lib/map-route-service.mjs";

const PUBLIC_CHAT_ENABLED = process.env.PUBLIC_CHAT_ENABLED === "true";
const MAX_REQUEST_BYTES = 2_048;

function errorResponse(code: string, message: string, status: number, details?: unknown) {
  return NextResponse.json(
    { error: { code, message, ...(details === undefined ? {} : { details }) } },
    {
      status,
      headers: { "Cache-Control": "no-store, max-age=0" },
    },
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
    return errorResponse("request_too_large", "The map request is too large.", 413);
  }
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return errorResponse("invalid_request", "Send the route request as JSON.", 415);
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
      return errorResponse("request_too_large", "The map request is too large.", 413);
    }
    return errorResponse("invalid_request", "The map request was not valid JSON.", 400);
  }

  const routeRequest = parseMapRouteRequest(body);
  if (!routeRequest) {
    return errorResponse(
      "invalid_route",
      "Provide an origin, destination, and a supported travel mode.",
      400,
    );
  }

  try {
    const route = await fetchMapRoute(routeRequest);
    return NextResponse.json(route, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    if (error instanceof MapRouteError) {
      return errorResponse(error.code, error.message, error.status, error.details);
    }
    return errorResponse("map_provider_unavailable", "Map routing is unavailable right now.", 502);
  }
}
