---
id: catalog.models_schema
tag: [TAG:SCHEMA]
title: Clustered Data Models & Schema Contracts Catalog
updated: 2026-11-15T05:40:00+08:00
---

# Clustered Data Models & Schema Contracts Catalog `[TAG:SCHEMA]`

> **Identity Strategy**: Session identifiers and request IDs use **UUIDv4** prefixed by entity type (`dashboard-<uuid>`, `turn-<uuid>`). Bearer sessions use alphanumeric token hashes.

---

## 1. Host Telemetry & System State

| Model / Type | Source File | Key Properties | Relationships / Scope |
| :--- | :--- | :--- | :--- |
| `TelemetryResponse` | [`lib/telemetry-types.ts`](file:///d:/homelab-dashboard/homelab-dashboard/lib/telemetry-types.ts) | `generatedAt`, `source: "Debian"`, `refreshIntervalSeconds: 15`, `staleAfterSeconds: 45`, `system`, `reachability` | Consolidated host telemetry payload polled every 15s. |
| `Reading<T>` | [`lib/telemetry-types.ts`](file:///d:/homelab-dashboard/homelab-dashboard/lib/telemetry-types.ts) | `{ state: "available", value: T } \| { state: "unavailable", message: string }` | Discriminated union for resilient metric readings. |
| `FilesystemValue` | [`lib/telemetry-types.ts`](file:///d:/homelab-dashboard/homelab-dashboard/lib/telemetry-types.ts) | `path: string`, `availableBytes: number`, `totalBytes: number` | Disk capacity stats derived from `statfs`. |
| `StorageReading` | [`lib/telemetry-types.ts`](file:///d:/homelab-dashboard/homelab-dashboard/lib/telemetry-types.ts) | `state: "available" \| "not-mounted" \| "unavailable"`, `value?`, `path: "/srv/storage"` | Dedicated mount check for persistent storage share. |

---

## 2. Monitored Services & Endpoint Checks

| Model / Type | Source File | Key Properties | Relationships / Scope |
| :--- | :--- | :--- | :--- |
| `EndpointCheck` | [`lib/telemetry-types.ts`](file:///d:/homelab-dashboard/homelab-dashboard/lib/telemetry-types.ts) | `id: "cockpit" \| "portainer" \| "samba"`, `label`, `host`, `port`, `state: "reachable" \| "unreachable"`, `latencyMs`, `message`, `checkedAt` | Monitored lab endpoints verified via TCP handshake. |

---

## 3. Identity, Auth & Session Records

| Model / Type | Source File | Key Properties | Relationships / Scope |
| :--- | :--- | :--- | :--- |
| `SessionTokenRecord` | [`lib/dashboard-auth.ts`](file:///d:/homelab-dashboard/homelab-dashboard/lib/dashboard-auth.ts) | `token: string`, `id: string`, `expiresAt: string` | External bearer session issued by `sessions-api`. |
| `SessionState` | [`lib/dashboard-auth.ts`](file:///d:/homelab-dashboard/homelab-dashboard/lib/dashboard-auth.ts) | `authenticated: boolean`, `configured: boolean`, `chatMode: "live" \| "mock" \| "unconfigured"` | Session verification contract returned to UI components. |
| `OwnerToken` | [`lib/dashboard-auth.ts`](file:///d:/homelab-dashboard/homelab-dashboard/lib/dashboard-auth.ts) | `DASHBOARD_OWNER_TOKEN: string` (min 24 characters) | Server-side private secret verified in constant time. |

---

## 4. Hermes LLM Chat Contracts

| Model / Type | Source File | Key Properties | Relationships / Scope |
| :--- | :--- | :--- | :--- |
| `ClientMessage` | [`app/api/chat/route.ts`](file:///d:/homelab-dashboard/homelab-dashboard/app/api/chat/route.ts) | `role: "user" \| "assistant"`, `content: string` (max 16k chars) | Validated turn payload (max 40 turns, 80k chars total). |
| `ChatRequestBody` | [`app/api/chat/route.ts`](file:///d:/homelab-dashboard/homelab-dashboard/app/api/chat/route.ts) | `messages: ClientMessage[]`, `requestId: turn-<uuid>`, `sessionId: dashboard-<uuid>` | Inbound JSON body for `/api/chat`. |
| `ChatMessage` | [`components/hermes-chat.tsx`](file:///d:/homelab-dashboard/homelab-dashboard/components/hermes-chat.tsx) | `id: string`, `role: "user" \| "assistant"`, `content: string` | Client UI state stored ephemerally in `sessionStorage`. |

---

## Compressed Taxonomy & Enums

- **Enums & State Literals:** `ChatMode` (`"live" | "mock" | "unconfigured"`), `ReadingState` (`"available" | "unavailable"`), `EndpointState` (`"reachable" | "unreachable"`), `EndpointId` (`"cockpit" | "portainer" | "samba"`), `ChatRole` (`"user" | "assistant"`).
- *All IDs and tokens use standard string primitives with explicit length and format guards.*
