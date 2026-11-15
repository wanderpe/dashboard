---
id: domain.auth-session-management
tag: [TAG:AUTH]
domain: Owner Authentication & Session Management
updated: 2026-11-15T05:40:00+08:00
relevant_services:
  - lib/dashboard-auth.ts
  - app/api/auth/login/route.ts
  - app/api/auth/logout/route.ts
  - app/api/auth/session/route.ts
relevant_models:
  - lib/dashboard-auth.ts
---

# Domain: Owner Authentication & Session Management `[TAG:AUTH]`

## 1. Domain Overview
Secures private home lab controls and LLM access behind a single-owner credential model. An owner enters `DASHBOARD_OWNER_TOKEN` (min 24 chars), which is exchanged against an external `sessions-api` daemon for a bearer session stored in an HttpOnly, SameSite=Strict browser cookie (`harvy_dashboard_owner`).

---

## 2. Core Service Architecture

| Service / Class | File Path | Responsibility & Rules |
| :--- | :--- | :--- |
| `dashboard-auth` | [`lib/dashboard-auth.ts`](file:///d:/homelab-dashboard/homelab-dashboard/lib/dashboard-auth.ts) | **Security Core**: Constant-time token verification (`crypto.timingSafeEqual`), HMAC session verification, handshake with `SESSION_API_URL`, cookie attachment/clearing. |
| `auth-routes` | [`app/api/auth/*/route.ts`](file:///d:/homelab-dashboard/homelab-dashboard/app/api/auth/login/route.ts) | **Endpoints**: `/api/auth/login` (exchanges token for cookie), `/api/auth/logout` (expires cookie), `/api/auth/session` (checks auth state & chat mode). |

---

## 3. Key Models & Schema

| Model / Entity | File Path | Key Attributes & Invariants |
| :--- | :--- | :--- |
| `SessionTokenRecord` | [`lib/dashboard-auth.ts`](file:///d:/homelab-dashboard/homelab-dashboard/lib/dashboard-auth.ts) | `{ token: string, id: string, expiresAt: string }` issued by `sessions-api` (7-day TTL). |
| `SessionState` | [`lib/dashboard-auth.ts`](file:///d:/homelab-dashboard/homelab-dashboard/lib/dashboard-auth.ts) | `{ authenticated: boolean, configured: boolean, chatMode: "live" \| "mock" \| "unconfigured" }`. |
| `OwnerToken` | [`lib/dashboard-auth.ts`](file:///d:/homelab-dashboard/homelab-dashboard/lib/dashboard-auth.ts) | Environment variable `DASHBOARD_OWNER_TOKEN` with minimum 24-character length threshold. |

---

## 4. Invariant Rules for Authentication
- All candidate token comparisons must use `crypto.timingSafeEqual` over fixed-length buffers to prevent timing side-channel attacks.
- Session cookies (`harvy_dashboard_owner`) must always be configured with `httpOnly: true`, `sameSite: "strict"`, `path: "/"`, and `secure: isSecureRequest(request)`.
- The raw owner token is never stored in browser memory, query params, or client storage.
- Non-browser API clients may supply bearer tokens via the `X-Session-Token` request header.
