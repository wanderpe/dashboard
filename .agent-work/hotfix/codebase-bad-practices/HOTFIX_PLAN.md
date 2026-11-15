# Hotfix Implementation Plan: Refactor Codebase Bad Practices

**Task ID:** `hotfix/codebase-bad-practices`  
**Execution Node:** `node_hotfix_implementer`

---

## 1. Targeted Files to Modify

| File | Change Scope | Invariant Maintained |
| :--- | :--- | :--- |
| `app/layout.tsx` | Fix untyped `LayoutProps` parameter to `Readonly<{ children: React.ReactNode }>` | Next.js 16 App Router root layout typing |
| `lib/utils.ts` | Export clean `cn` and client-safe `generateUUID` | Unified utility contract across all UI components |
| `components/ui/card.tsx` | Change import from `"cn"` to `@/lib/utils` | Follows `components.json` alias rules |
| `components/ui/badge.tsx` | Change import from `"cn"` to `@/lib/utils` | Follows `components.json` alias rules |
| `components/ui/button.tsx` | Change import from `"cn"` to `@/lib/utils` | Follows `components.json` alias rules |
| `lib/dashboard-auth.ts` | Refactor `safeEqual` to SHA-256 constant-time hash comparison | Mitigates token length leakage timing attacks |
| `app/api/chat/route.ts` | Replace custom 23-line UUID function with `node:crypto.randomUUID()` | Eliminates `Math.random` in server security paths |
| `components/hermes-chat.tsx` | Use browser `crypto.randomUUID()` with secure fallback | Zero code duplication |
| `app/api/telemetry/route.ts` | Fallback to `os.totalmem()` / `os.freemem()` if `/proc/meminfo` missing | Non-Linux dev compatibility without breaking Linux accuracy |
| `components/system-telemetry.tsx` | Use `cn()` for conditional class strings | Modern shadcn/Tailwind style conventions |

---

## 2. Step-by-Step Execution Order

1. Update `lib/utils.ts` with standardized `cn` and clean helper.
2. Update `components/ui/card.tsx`, `components/ui/badge.tsx`, and `components/ui/button.tsx` imports.
3. Update `app/layout.tsx` type declaration.
4. Update `lib/dashboard-auth.ts` constant-time comparison.
5. Update `app/api/chat/route.ts` and `components/hermes-chat.tsx` UUID generation.
6. Update `app/api/telemetry/route.ts` memory fallback.
7. Update `components/system-telemetry.tsx` class concatenation.
8. Validate diff with `git diff`.
