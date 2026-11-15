---
id: memory.index
title: Agent Memory Master Router
updated: 2026-11-15T06:05:00+08:00
version: 2.1.0
---

# Agent Memory Master Router

> Load only the designated file for your active task. Never read the entire memory tree.

## 1. Domain & Catalog Routing

| Knowledge Area | Grep Tag | File Link | Scope & Purpose | When to Load |
| :--- | :--- | :--- | :--- | :--- |
| **System Invariants** | `[TAG:CONVENTIONS]` | [`conventions.md`](file:///d:/homelab-dashboard/homelab-dashboard/.agents/memory/conventions.md) | Next.js 16 App Router, owner auth, crypto invariants, styling, testing | Read on every feature |
| **Homelab Telemetry** | `[TAG:TELEMETRY]` | [`domains/homelab-services-monitoring.md`](file:///d:/homelab-dashboard/homelab-dashboard/.agents/memory/domains/homelab-services-monitoring.md) | Host OS metrics, statfs, /proc, Cockpit/Portainer/Samba reachability | Telemetry & probe changes |
| **Hermes Chat SSE** | `[TAG:HERMES_CHAT]` | [`domains/hermes-chat-streaming.md`](file:///d:/homelab-dashboard/homelab-dashboard/.agents/memory/domains/hermes-chat-streaming.md) | Hermes proxy, SSE streams, session continuity, mock fallback | Chat route & UI streaming |
| **Owner Authentication** | `[TAG:AUTH]` | [`domains/auth-session-management.md`](file:///d:/homelab-dashboard/homelab-dashboard/.agents/memory/domains/auth-session-management.md) | Owner token, sessions-api integration, timingSafeEqual, cookies | Auth & session changes |
| **Service Catalog** | `[TAG:SERVICES]` | [`catalogs/services.md`](file:///d:/homelab-dashboard/homelab-dashboard/.agents/memory/catalogs/services.md) | Verified active services, route handlers, and utility helpers | Reuse before writing code |
| **Data Models & Schema** | `[TAG:SCHEMA]` | [`catalogs/models-schema.md`](file:///d:/homelab-dashboard/homelab-dashboard/.agents/memory/catalogs/models-schema.md) | TypeScript contracts, telemetry schema, chat turn types, enums | Data structures & APIs |
| **Historical Archive** | `[TAG:ARCHIVE]` | [`MEMORY_ARCHIVE.md`](file:///d:/homelab-dashboard/homelab-dashboard/.agents/MEMORY_ARCHIVE.md) | Durable change history and completed task logs | Cold storage |

## 2. Fast Keyword Grep Index

- `[TAG:CONVENTIONS]` -> Architectural invariants, security, Next.js rules
- `[TAG:TELEMETRY]` -> Debian OS metrics, reachability probes, HUD panels
- `[TAG:HERMES_CHAT]` -> Hermes agent SSE upstream, session tracking, mock mode
- `[TAG:AUTH]` -> Owner token HMAC, bearer sessions, HttpOnly cookies
- `[TAG:SERVICES]` -> Active classes, route handlers, utility functions
- `[TAG:SCHEMA]` -> Telemetry types, chat contracts, session models

## 3. Active Skills Registry

- `[TAG:SKILL:TAILWIND_V4]` -> `tailwind-v4-shadcn`: Tailwind v4 `@theme inline` & OKLCH color rules
- `[TAG:SKILL:21ST]` -> `21st-registry`: Curated 21st.dev components & animated widgets
- `[TAG:SKILL:MOTION]` -> `emil-design-eng`: Physics spring curves, smooth micro-interactions
- `[TAG:SKILL:WIG]` -> `web-design-guidelines`: Vercel layout, contrast, and spacing guidelines
- `[TAG:SKILL:IMPECCABLE]` -> `impeccable`: Design polish, `@colorize`, `@distill`, visual hierarchy
- `[TAG:SKILL:NEXT_PATTERNS]` -> `nextjs-app-router-patterns`: App Router boundaries, RSC, and streaming
- `[TAG:SKILL:SECURITY]` -> `security-and-hardening`: Web security, timing attack defense, cookie hardening
- `[TAG:SKILL:FIND_BUGS]` -> `find-bugs`: Sentry error & resource leak detection
- `[TAG:SKILL:SHADCN]` -> `shadcn`: Base-nova style, Lucide icons, HUD theme
- `[TAG:SKILL:UI_UX]` -> `ui-ux-pro-max`: 50 UI styles, 192 palettes, HUD dark sci-fi design
- `[TAG:SKILL:VERIFY]` -> `verification-before-completion`: Evidence before assertions always
- `[TAG:SKILL:DEBUG]` -> `systematic-debugging`: Systematic root-cause hypothesis
- `[TAG:SKILL:SUBAGENT]` -> `subagent-driven-development`: Task packet decomposition
- `[TAG:SKILL:OPTIMIZER]` -> `agentic-workflow-optimizer`: Multi-agent state orchestration
- `[TAG:SKILL:QA]` -> `qa-engineer`: QA & testing standards
