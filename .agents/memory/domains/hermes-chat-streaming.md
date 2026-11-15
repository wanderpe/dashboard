---
id: domain.hermes-chat-streaming
tag: [TAG:HERMES_CHAT]
domain: Hermes Agent LLM Chat & SSE Streaming
updated: 2026-11-15T05:40:00+08:00
relevant_services:
  - app/api/chat/route.ts
  - components/hermes-chat.tsx
relevant_models:
  - app/api/chat/route.ts
---

# Domain: Hermes Agent LLM Chat & SSE Streaming `[TAG:HERMES_CHAT]`

## 1. Domain Overview
Enables private browser-session chat with the local Hermes AI agent (`hermes-agent`) listening on `http://127.0.0.1:8642`. The dashboard server acts as an authenticated reverse proxy supporting Server-Sent Events (SSE), session continuity via `X-Hermes-Session-Id`, turn replay protection via `Idempotency-Key`, and offline mock streaming.

---

## 2. Core Service Architecture

| Service / Class | File Path | Responsibility & Rules |
| :--- | :--- | :--- |
| `chat-route` | [`app/api/chat/route.ts`](file:///d:/homelab-dashboard/homelab-dashboard/app/api/chat/route.ts) | **Reverse Proxy**: Enforces owner auth, validates message arrays (max 40 turns, 16k chars), maps requests to `HERMES_CHAT_URL`, forwards SSE stream chunks, and manages mock streaming (`HERMES_CHAT_MOCK=true`). |
| `hermes-chat` | [`components/hermes-chat.tsx`](file:///d:/homelab-dashboard/homelab-dashboard/components/hermes-chat.tsx) | **Interactive UI**: Client interface maintaining conversation history in `sessionStorage`, rendering streamed markdown tokens, handling authentication modals, and providing auto-scrolling terminal output. |

---

## 3. Key Models & Schema

| Model / Entity | File Path | Key Attributes & Invariants |
| :--- | :--- | :--- |
| `ClientMessage` | [`app/api/chat/route.ts`](file:///d:/homelab-dashboard/homelab-dashboard/app/api/chat/route.ts) | Message tuple `{ role: "user" \| "assistant", content: string }`. Final message must be from `"user"`. |
| `SessionIdentifiers` | [`app/api/chat/route.ts`](file:///d:/homelab-dashboard/homelab-dashboard/app/api/chat/route.ts) | `sessionId` matching `dashboard-<uuid>` regex; `requestId` matching `turn-<uuid>` regex. |
| `SseCompletionChunk` | [`app/api/chat/route.ts`](file:///d:/homelab-dashboard/homelab-dashboard/app/api/chat/route.ts) | Standard OpenAI-compatible chunk format with `choices[0].delta` and terminal `data: [DONE]\n\n`. |

---

## 4. Invariant Rules for Hermes Chat
- The client browser never receives `HERMES_API_KEY`; all authentication to the local Hermes daemon is executed server-side.
- Conversation history is held strictly in browser `sessionStorage` (tab lifetime); message turns are never persisted to a central database.
- Every chat turn must forward `Idempotency-Key: turn-<uuid>` upstream so network retries never trigger duplicate execution in Hermes.
- Server requests to Hermes must time out after 5 minutes (`UPSTREAM_TIMEOUT_MS = 300_000`) and cancel gracefully if the client disconnects.
