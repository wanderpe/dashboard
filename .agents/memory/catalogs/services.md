---
id: catalog.services
tag: [TAG:SERVICES]
title: Active Core Services & Utility Catalog
updated: 2026-11-15T05:40:00+08:00
---

# Active Core Services & Utility Catalog `[TAG:SERVICES]`

> **Reuse Invariant**: Before implementing new handlers, network checks, or auth helpers, check this catalog. Reusing existing modules preserves security invariants and avoids duplicate code.

---

## 1. Authentication & Session Services

| Class / Module | File Path | Function / Method | Reuse Rule |
| :--- | :--- | :--- | :--- |
| `dashboard-auth` | [`lib/dashboard-auth.ts`](file:///d:/homelab-dashboard/homelab-dashboard/lib/dashboard-auth.ts) | `verifyOwnerToken(candidate: string): boolean` | **REUSE** for constant-time owner token validation. |
| `dashboard-auth` | [`lib/dashboard-auth.ts`](file:///d:/homelab-dashboard/homelab-dashboard/lib/dashboard-auth.ts) | `verifySession(request: NextRequest): Promise<SessionState>` | **REUSE** to guard private API routes and check session validity. |
| `dashboard-auth` | [`lib/dashboard-auth.ts`](file:///d:/homelab-dashboard/homelab-dashboard/lib/dashboard-auth.ts) | `registerOwnerSession(userId?, userEmail?): Promise<SessionTokenRecord>` | **REUSE** when exchanging valid credentials for a bearer session. |
| `dashboard-auth` | [`lib/dashboard-auth.ts`](file:///d:/homelab-dashboard/homelab-dashboard/lib/dashboard-auth.ts) | `getSessionToken(): Promise<string \| null>` | **REUSE** to read the active cookie in Server Components/Route Handlers. |
| `dashboard-auth` | [`lib/dashboard-auth.ts`](file:///d:/homelab-dashboard/homelab-dashboard/lib/dashboard-auth.ts) | `setSessionToken(token, request): NextResponse` | **REUSE** to attach HttpOnly SameSite=Strict session cookies. |
| `dashboard-auth` | [`lib/dashboard-auth.ts`](file:///d:/homelab-dashboard/homelab-dashboard/lib/dashboard-auth.ts) | `removeSessionToken(request): NextResponse` | **REUSE** to expire and clear session cookies on logout. |
| `dashboard-auth` | [`lib/dashboard-auth.ts`](file:///d:/homelab-dashboard/homelab-dashboard/lib/dashboard-auth.ts) | `isSecureRequest(request: NextRequest): boolean` | **REUSE** to detect HTTPS / `x-forwarded-proto`. |

---

## 2. Telemetry & Host Monitoring Services

| Class / Module | File Path | Function / Method | Reuse Rule |
| :--- | :--- | :--- | :--- |
| `telemetry-route` | [`app/api/telemetry/route.ts`](file:///d:/homelab-dashboard/homelab-dashboard/app/api/telemetry/route.ts) | `GET(): Promise<Response>` | **REUSE** for fetching consolidated host telemetry & service reachability. |
| `telemetry-route` | [`app/api/telemetry/route.ts`](file:///d:/homelab-dashboard/homelab-dashboard/app/api/telemetry/route.ts) | `readMemory(): Promise<Reading<MemoryValue>>` | **REUSE** for `/proc/meminfo` reading. |
| `telemetry-route` | [`app/api/telemetry/route.ts`](file:///d:/homelab-dashboard/homelab-dashboard/app/api/telemetry/route.ts) | `readFilesystem(path: string): Promise<FilesystemValue>` | **REUSE** for disk block calculations using `node:fs/promises.statfs`. |
| `telemetry-route` | [`app/api/telemetry/route.ts`](file:///d:/homelab-dashboard/homelab-dashboard/app/api/telemetry/route.ts) | `isExactMountPoint(path: string): Promise<boolean>` | **REUSE** for `/proc/self/mountinfo` mount detection. |
| `telemetry-route` | [`app/api/telemetry/route.ts`](file:///d:/homelab-dashboard/homelab-dashboard/app/api/telemetry/route.ts) | `checkEndpoint(endpoint): Promise<EndpointCheck>` | **REUSE** for TCP socket latency and reachability probes. |

---

## 3. Hermes LLM Chat & SSE Services

| Class / Module | File Path | Function / Method | Reuse Rule |
| :--- | :--- | :--- | :--- |
| `chat-route` | [`app/api/chat/route.ts`](file:///d:/homelab-dashboard/homelab-dashboard/app/api/chat/route.ts) | `POST(request: NextRequest): Promise<Response>` | **REUSE** for owner-authenticated SSE upstream streaming to Hermes. |
| `chat-route` | [`app/api/chat/route.ts`](file:///d:/homelab-dashboard/homelab-dashboard/app/api/chat/route.ts) | `parseMessages(value: unknown): ClientMessage[] \| null` | **REUSE** for validating message structure, count, and size bounds. |
| `chat-route` | [`app/api/chat/route.ts`](file:///d:/homelab-dashboard/homelab-dashboard/app/api/chat/route.ts) | `createMockStream(): ReadableStream<Uint8Array>` | **REUSE** for offline / mock SSE chat testing. |
| `chat-route` | [`app/api/chat/route.ts`](file:///d:/homelab-dashboard/homelab-dashboard/app/api/chat/route.ts) | `createSseFrame(data: unknown): string` | **REUSE** for formatting SSE chunk protocol (`data: {...}\n\n`). |

---

## 4. UI & Utility Helpers

| Class / Module | File Path | Function / Method | Reuse Rule |
| :--- | :--- | :--- | :--- |
| `utils` | [`lib/utils.ts`](file:///d:/homelab-dashboard/homelab-dashboard/lib/utils.ts) | `cn(...inputs: ClassValue[]): string` | **REUSE** for all conditional Tailwind CSS className concatenation. |
| `system-telemetry` | [`components/system-telemetry.tsx`](file:///d:/homelab-dashboard/homelab-dashboard/components/system-telemetry.tsx) | `formatBytes(bytes: number): string` | **REUSE** for human-readable GiB / MiB formatting. |
| `system-telemetry` | [`components/system-telemetry.tsx`](file:///d:/homelab-dashboard/homelab-dashboard/components/system-telemetry.tsx) | `formatUptime(seconds: number): string` | **REUSE** for `Xd Yh Zm` duration display. |
