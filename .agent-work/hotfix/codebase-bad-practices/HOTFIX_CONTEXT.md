# Hotfix Context: Refactor Codebase Bad Practices

**Task ID:** `hotfix/codebase-bad-practices`  
**Created:** 2026-11-15T06:10:00+08:00  
**Scope:** SMALL / MEDIUM Refactor  
**Target Branch:** `master`

---

## 1. Defect & Code Smell Summary

A comprehensive architectural and static audit of the codebase revealed 7 distinct bad practices, security vulnerabilities, and code smells:

1. **`app/layout.tsx` (Missing Type Declaration):**
   - Uses `RootLayout({ children }: LayoutProps<"/">)` where `LayoutProps` is not imported, causing potential TypeScript compiler errors.
2. **`components/ui/` (Anti-pattern Direct Imports):**
   - `components/ui/card.tsx`, `badge.tsx`, and `button.tsx` import `{ cn }` directly from the external package `"cn"` rather than the project-configured alias `@/lib/utils` defined in `components.json`.
3. **`lib/dashboard-auth.ts` (Timing Attack & Length Leakage):**
   - `safeEqual()` compares `leftBuffer.length === rightBuffer.length` prior to calling `timingSafeEqual()`, leaking token length via timing discrepancies.
4. **`app/api/chat/route.ts` & `components/hermes-chat.tsx` (Insecure Math.random & Duplication):**
   - 23-line hand-rolled UUID generator with `Math.random() * 256` fallback duplicated across both server route handler and client UI component, instead of using cryptographic `node:crypto.randomUUID()`.
5. **`app/api/telemetry/route.ts` (Brittle Linux-only Procfs Coupling):**
   - Hardcoded `/proc/meminfo` reads throw unhandled ENOENT on non-Linux dev hosts (Windows/Docker) instead of gracefully falling back to standard Node `os.totalmem()` / `os.freemem()`.
6. **`components/system-telemetry.tsx` (Re-render Cascade & Manual Strings):**
   - 1000ms interval forces full telemetry component re-renders every second; uses raw string templates rather than `cn()`.
7. **`lib/utils.ts` (Incomplete Type Exports):**
   - Bare re-export of `"cn"` lacking standard `ClassValue` type safety.

---

## 2. Invariant Rules to Preserve
- Single-owner authentication invariants (`harvy_dashboard_owner` cookie).
- 15-second polling interval and 1200ms TCP socket timeouts for Cockpit, Portainer, Samba.
- SSE streaming protocol and `Idempotency-Key` forwarding to Hermes agent.
- HUD cyberpunk design aesthetic, radar array, and color palette.
