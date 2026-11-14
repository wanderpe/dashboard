# Codebase Inventory & Memory Router

**Last Updated:** 2026-11-15T05:40:00+08:00  
**Project:** Harvy's Home Lab Dashboard (TypeScript / Next.js 16 & React 19)  
**Memory Architecture:** Clustered High-Signal Modular Memory (v2.0)

> [!TIP]
> Memory is modularized under [`.agents/memory/`](file:///d:/homelab-dashboard/homelab-dashboard/.agents/memory/INDEX.md). Agents must load **only** the designated domain chunk.

---

## 1. Domain Memory Router

| Knowledge Domain | Grep Anchor | Target Chunk File | Scope Summary |
| :--- | :--- | :--- | :--- |
| **System Invariants** | `[TAG:CONVENTIONS]` | [`.agents/memory/conventions.md`](file:///d:/homelab-dashboard/homelab-dashboard/.agents/memory/conventions.md) | Next.js 16 conventions, auth, timingSafeEqual, styling, testing |
| **Homelab Telemetry** | `[TAG:TELEMETRY]` | [`.agents/memory/domains/homelab-services-monitoring.md`](file:///d:/homelab-dashboard/homelab-dashboard/.agents/memory/domains/homelab-services-monitoring.md) | Host OS metrics, statfs, /proc, Cockpit/Portainer/Samba reachability |
| **Hermes Chat SSE** | `[TAG:HERMES_CHAT]` | [`.agents/memory/domains/hermes-chat-streaming.md`](file:///d:/homelab-dashboard/homelab-dashboard/.agents/memory/domains/hermes-chat-streaming.md) | Hermes proxy, SSE streams, session continuity, mock fallback |
| **Owner Authentication** | `[TAG:AUTH]` | [`.agents/memory/domains/auth-session-management.md`](file:///d:/homelab-dashboard/homelab-dashboard/.agents/memory/domains/auth-session-management.md) | Owner token, sessions-api integration, timingSafeEqual, cookies |
| **Active Service Catalog** | `[TAG:SERVICES]` | [`.agents/memory/catalogs/services.md`](file:///d:/homelab-dashboard/homelab-dashboard/.agents/memory/catalogs/services.md) | Verified active services and helper registry |
| **Database Schema & Types** | `[TAG:SCHEMA]` | [`.agents/memory/catalogs/models-schema.md`](file:///d:/homelab-dashboard/homelab-dashboard/.agents/memory/catalogs/models-schema.md) | Clustered data contracts, telemetry schema, chat turn types |
| **Master Index** | `[TAG:INDEX]` | [`.agents/memory/INDEX.md`](file:///d:/homelab-dashboard/homelab-dashboard/.agents/memory/INDEX.md) | Complete index and tag lookup directory |

---

## 2. Recent Change History Index

> Detailed change logs and historical records are archived in [MEMORY_ARCHIVE.md](file:///d:/homelab-dashboard/homelab-dashboard/.agents/MEMORY_ARCHIVE.md).

| Timestamp | Type | TASK_ID | Description | Artifacts |
| :--- | :--- | :--- | :--- | :--- |
| 2026-11-15 | BOOTSTRAP | `init/agent-os` | Master Agent bootstrap of Agent OS v2.0 | [`.agents/`](file:///d:/homelab-dashboard/homelab-dashboard/.agents/) |
| 2026-11-15 | HOTFIX | `hotfix/codebase-bad-practices` | Refactored bad practices, timingSafeEqual security leak, UUID duplication, and non-Linux fallbacks | [RELEASE_NOTES.md](file:///d:/homelab-dashboard/homelab-dashboard/.agent-work/hotfix/codebase-bad-practices/RELEASE_NOTES.md) |
| 2026-11-15 | FEATURE | `feat/premium-ui-ux-upgrade` | Overhauled dashboard to obsidian tactile command center, visual gauges, and Emil Kowalski physics | [RELEASE_NOTES.md](file:///d:/homelab-dashboard/homelab-dashboard/.agent-work/feat/premium-ui-ux-upgrade/RELEASE_NOTES.md) |
