---
id: memory.conventions
tag: [TAG:CONVENTIONS]
title: System Architecture & Coding Conventions
updated: 2026-11-15T05:40:00+08:00
---

# System Architecture & Coding Conventions `[TAG:CONVENTIONS]`

**Project:** Harvy's Home Lab Dashboard (TypeScript / Next.js 16 App Router & React 19)

---

## 1. Core Architectural Invariants

1. **Identity & Session Strategy:**
   - Client and session IDs use UUIDv4 (`crypto.randomUUID()`) prefixed by scope: `dashboard-<uuid>` for sessions, `turn-<uuid>` for chat requests.
   - Bearer session tokens issued by external `sessions-api` backend.

2. **Precision & Numeric Metrics:**
   - Telemetry byte quantities (`availableBytes`, `totalBytes`) and uptime seconds are strict non-negative integers.
   - Socket latency values are rounded integer milliseconds (`latencyMs >= 1`).
   - Load averages use floating point (`oneMinute`, `fiveMinutes`, `fifteenMinutes`).

3. **Transaction, Idempotency & Concurrency:**
   - Upstream chat requests to Hermes enforce `Idempotency-Key` and `X-Hermes-Session-Id` headers to prevent duplicate execution on replay.
   - Host metrics read atomically from Debian `/proc/` and `node:fs/promises` (`statfs`).
   - Upstream LLM fetch includes a 5-minute timeout via `AbortSignal.timeout(300_000)` and client abort forwarding.

4. **Authentication & Security Posture:**
   - Single-owner access control model; private routes require owner authentication.
   - All token comparisons use constant-time `crypto.timingSafeEqual`.
   - Session tokens stored in `httpOnly`, `sameSite: "strict"`, `secure: isSecureRequest()`, `maxAge: 7 days` cookies (`harvy_dashboard_owner`).
   - Loopback binding (127.0.0.1) and Tailscale private overlay network boundary. Never expose raw API keys or secrets in client components.

5. **Layering & Structural Invariants:**
   - Server-only code explicitly marked with `import "server-only"`.
   - API endpoints in `app/api/*/route.ts` handle input parsing, size guards (max 40 messages, 16k chars/msg, 80k total), and upstream proxying.
   - UI components reside in `components/` using shadcn/ui base-nova conventions, Tailwind CSS 4, and Lucide icons.
   - State & domain types isolated in `lib/`.

6. **Testing & Verification Standards:**
   - Verification command: `npm run lint && npm run build`
   - Zero lint warnings/errors under ESLint 9.
   - Clean TypeScript typecheck on every commit.
   - Mock streaming verification (`HERMES_CHAT_MOCK=true`) for CI/offline validation.
