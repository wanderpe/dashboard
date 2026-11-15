# Hotfix Report: Codebase Bad Practices Refactoring

**Task ID:** `hotfix/codebase-bad-practices`  
**Execution Node:** `node_hotfix_implementer`  
**Status:** Completed  
**Timestamp:** 2026-11-15T06:16:00+08:00

---

## 1. Summary of Changes

A surgical refactoring was executed across 9 target files in the codebase to eliminate bad practices, enhance timing-attack resilience, ensure cross-platform runtime reliability, and standardize shadcn/Tailwind conventions:

1. **`app/layout.tsx`**:
   - Replaced undefined `LayoutProps<"/">` parameter with standard typed `Readonly<{ children: React.ReactNode }>`.
2. **`components/ui/card.tsx`, `components/ui/badge.tsx`, `components/ui/button.tsx`**:
   - Switched direct package import `from "cn"` to project alias `from "@/lib/utils"` per `components.json` architectural standard.
3. **`lib/dashboard-auth.ts`**:
   - Refactored `safeEqual` from raw buffer comparison (which leaked candidate length via early length mismatch return) to constant-time SHA-256 digest comparison using `timingSafeEqual`.
   - Fixed unused `request` parameter in `removeSessionToken(_request?: NextRequest)`.
4. **`app/api/chat/route.ts`**:
   - Removed 23 lines of legacy browser/IE11 `generateUUID` function containing insecure `Math.random` fallback. Replaced with `node:crypto.randomUUID()`.
5. **`components/hermes-chat.tsx`**:
   - Cleaned up duplicate 23-line UUID fallback logic to modern standard `crypto.randomUUID()` with secure typed fallback, eliminating `msCrypto` legacy IE code.
6. **`app/api/telemetry/route.ts`**:
   - Added graceful fallback to `node:os` (`totalmem()`, `freemem()`) when `/proc/meminfo` is missing (Windows / non-Linux host dev environments).
   - Wrapped `isExactMountPoint` in `try/catch` to prevent unhandled ENOENT errors on non-proc hosts.
7. **`components/system-telemetry.tsx`**:
   - Replaced raw template string class concatenations in `Metric` and `ReachabilityCheck` with standard `cn()` utility calls.

---

## 2. Modified Files

| File | Type | Changes |
| :--- | :--- | :--- |
| `app/layout.tsx` | Layout | Typed Next.js 16 root layout props |
| `components/ui/card.tsx` | UI Component | Standardized `@/lib/utils` import |
| `components/ui/badge.tsx` | UI Component | Standardized `@/lib/utils` import |
| `components/ui/button.tsx` | UI Component | Standardized `@/lib/utils` import |
| `lib/dashboard-auth.ts` | Security Utility | Timing-safe SHA-256 comparison |
| `app/api/chat/route.ts` | API Route | Built-in `randomUUID` |
| `components/hermes-chat.tsx` | UI Component | Streamlined secure UUID |
| `app/api/telemetry/route.ts` | API Route | Non-Linux memory & mount fallback |
| `components/system-telemetry.tsx` | UI Component | Clean `cn()` class merging |

---

## 3. Smoke Test Verification

- `npm run lint`: **0 errors** (97 warnings in external skill library scripts).
- `npm run build`: **Exit code 0**. Turbopack, TypeScript 5, and all 8 routes compiled and statically optimized in 10.3s.
