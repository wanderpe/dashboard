import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/dashboard-auth";

const HERMES_CHAT_URL = "http://127.0.0.1:8642/v1/chat/completions";
const HERMES_MODEL = "hermes-agent";
const SESSION_ID_PATTERN =
  /^dashboard-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TURN_ID_PATTERN =
  /^turn-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_MESSAGES = 40;
const MAX_MESSAGE_LENGTH = 16_000;
const MAX_TOTAL_LENGTH = 80_000;
const UPSTREAM_TIMEOUT_MS = 5 * 60 * 1000;

type ClientMessage = {
  role: "user" | "assistant";
  content: string;
};

type ChatRequestBody = {
  messages?: unknown;
  requestId?: unknown;
  sessionId?: unknown;
};

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json(
    { error: { code, message } },
    {
      status,
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}

function parseMessages(value: unknown): ClientMessage[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_MESSAGES) {
    return null;
  }

  let totalLength = 0;
  const messages: ClientMessage[] = [];

  for (const entry of value) {
    if (!entry || typeof entry !== "object") {
      return null;
    }

    const role = "role" in entry ? entry.role : undefined;
    const content = "content" in entry ? entry.content : undefined;

    if (
      (role !== "user" && role !== "assistant") ||
      typeof content !== "string" ||
      content.trim().length === 0 ||
      content.length > MAX_MESSAGE_LENGTH
    ) {
      return null;
    }

    totalLength += content.length;
    if (totalLength > MAX_TOTAL_LENGTH) {
      return null;
    }

    messages.push({ role, content });
  }

  return messages.at(-1)?.role === "user" ? messages : null;
}

function createSseFrame(data: unknown) {
  return `data: ${JSON.stringify(data)}\n\n`;
}

function createMockStream() {
  const encoder = new TextEncoder();
  const completionId = `chatcmpl-mock-${generateUUID()}`;
  const created = Math.floor(Date.now() / 1000);
  const chunks = [
    "Mock stream connected. ",
    "The private chat route, browser-session conversation, ",
    "and incremental assistant rendering are working. ",
    "Configure the local Hermes API to replace this test response with live replies.",
  ];

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        controller.enqueue(
          encoder.encode(
            createSseFrame({
              id: completionId,
              object: "chat.completion.chunk",
              created,
              model: HERMES_MODEL,
              choices: [
                {
                  index: 0,
                  delta: { role: "assistant" },
                  finish_reason: null,
                },
              ],
            }),
          ),
        );

        for (const content of chunks) {
          await new Promise((resolve) => setTimeout(resolve, 90));
          controller.enqueue(
            encoder.encode(
              createSseFrame({
                id: completionId,
                object: "chat.completion.chunk",
                created,
                model: HERMES_MODEL,
                choices: [
                  {
                    index: 0,
                    delta: { content },
                    finish_reason: null,
                  },
                ],
              }),
            ),
          );
        }

        controller.enqueue(
          encoder.encode(
            createSseFrame({
              id: completionId,
              object: "chat.completion.chunk",
              created,
              model: HERMES_MODEL,
              choices: [
                {
                  index: 0,
                  delta: {},
                  finish_reason: "stop",
                },
              ],
            }),
          ),
        );
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}

function generateUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
    return hex.substring(0, 8) + "-" + hex.substring(8, 12) + "-" + hex.substring(12, 16) + "-" + hex.substring(16, 20) + "-" + hex.substring(20);
  }
  const fallback = new Uint8Array(16);
  if (typeof self !== "undefined" && typeof (self as unknown as { msCrypto?: Crypto }).msCrypto?.getRandomValues === "function") {
    (self as unknown as { msCrypto: Crypto }).msCrypto.getRandomValues(fallback);
  } else {
    for (let i = 0; i < 16; i++) fallback[i] = Math.floor(Math.random() * 256);
  }
  fallback[6] = (fallback[6] & 0x0f) | 0x40;
  fallback[8] = (fallback[8] & 0x3f) | 0x80;
  const hex = Array.from(fallback).map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex.substring(0, 8) + "-" + hex.substring(8, 12) + "-" + hex.substring(12, 16) + "-" + hex.substring(16, 20) + "-" + hex.substring(20);
}
async function getUpstreamError(response: Response) {
  const fallback = `Hermes returned HTTP ${response.status}.`;

  try {
    const body = (await response.json()) as {
      error?: { message?: unknown };
      message?: unknown;
    };
    const message = body.error?.message ?? body.message;
    return typeof message === "string" && message.trim()
      ? message.trim().slice(0, 400)
      : fallback;
  } catch {
    return fallback;
  }
}

export async function POST(request: NextRequest) {
  const { authenticated } = await verifySession(request);

  if (!authenticated) {
    return errorResponse(
      "owner_auth_required",
      "Owner authentication is required to use Hermes Chat.",
      401,
    );
  }

  let body: ChatRequestBody;

  try {
    body = (await request.json()) as ChatRequestBody;
  } catch {
    return errorResponse("invalid_request", "The chat request was not valid JSON.", 400);
  }

  const messages = parseMessages(body.messages);
  const requestId = typeof body.requestId === "string" ? body.requestId : "";
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";

  if (!messages) {
    return errorResponse(
      "invalid_messages",
      "Send 1 to 40 non-empty user and assistant messages, ending with a user message.",
      400,
    );
  }

  if (!SESSION_ID_PATTERN.test(sessionId)) {
    return errorResponse(
      "invalid_session",
      "The browser-session conversation identifier is invalid.",
      400,
    );
  }

  if (!TURN_ID_PATTERN.test(requestId)) {
    return errorResponse(
      "invalid_request_id",
      "The chat turn identifier is invalid.",
      400,
    );
  }

  if (process.env.HERMES_CHAT_MOCK === "true") {
    return new Response(createMockStream(), {
      headers: {
        "Cache-Control": "no-store, no-transform",
        "Content-Type": "text/event-stream; charset=utf-8",
        "X-Accel-Buffering": "no",
        "X-Hermes-Chat-Mode": "mock",
        "X-Hermes-Session-Id": sessionId,
      },
    });
  }

  const apiKey = process.env.HERMES_API_KEY?.trim();

  if (!apiKey) {
    return errorResponse(
      "hermes_not_configured",
      "Hermes Chat is not configured. Add HERMES_API_KEY to the dashboard server environment.",
      503,
    );
  }

  let upstream: Response;

  try {
    upstream = await fetch(HERMES_CHAT_URL, {
      method: "POST",
      headers: {
        Accept: "text/event-stream",
        "Idempotency-Key": requestId,
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Hermes-Session-Id": sessionId,
      },
      body: JSON.stringify({
        model: HERMES_MODEL,
        messages: [messages[messages.length - 1]],
        stream: true,
      }),
      cache: "no-store",
      signal: AbortSignal.any([
        request.signal,
        AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      ]),
    });
  } catch (error) {
    const timedOut =
      error instanceof DOMException && error.name === "TimeoutError";

    return errorResponse(
      timedOut ? "hermes_timeout" : "hermes_unavailable",
      timedOut
        ? "Hermes did not respond before the five-minute timeout."
        : "The dashboard could not reach Hermes at 127.0.0.1:8642.",
      502,
    );
  }

  if (!upstream.ok) {
    const upstreamMessage = await getUpstreamError(upstream);
    const isAuthError = upstream.status === 401 || upstream.status === 403;

    return errorResponse(
      isAuthError ? "hermes_auth_failed" : "hermes_request_failed",
      isAuthError
        ? "Hermes rejected the server-side API key. Check that HERMES_API_KEY matches API_SERVER_KEY."
        : upstreamMessage,
      upstream.status === 429 ? 429 : 502,
    );
  }

  if (!upstream.body) {
    return errorResponse(
      "hermes_empty_stream",
      "Hermes accepted the request but did not return a response stream.",
      502,
    );
  }

  const contentType = upstream.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("text/event-stream")) {
    await upstream.body.cancel();
    return errorResponse(
      "hermes_invalid_stream",
      "Hermes returned an unexpected response format instead of an event stream.",
      502,
    );
  }

  return new Response(upstream.body, {
    headers: {
      "Cache-Control": "no-store, no-transform",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no",
      "X-Hermes-Chat-Mode": "live",
      "X-Hermes-Session-Id":
        upstream.headers.get("x-hermes-session-id") ?? sessionId,
    },
  });
}
