# Release Notes: Codebase Bad Practices Hotfix

**Task ID:** `hotfix/codebase-bad-practices`  
**Release Manager:** `homelab-dashboard-release-manager`  
**Timestamp:** 2026-11-15T06:21:00+08:00

---

## 1. User Approval

Explicit user approval received at Gate 5 to complete hotfix and proceed:
> *"run @.agents/workflows/hotfix-workflow.md next iwant the UI/UX upgrade like use the best ui skills and i want the dashboar to fell premuim and not ai slop and smooth"*

---

## 2. Documentation Updated

- Updated `.agent-work/hotfix/codebase-bad-practices/` state and reports.
- Synchronized domain invariants in `.agents/memory/conventions.md`:
  - Enforced constant-time comparisons via SHA-256 pre-hashing before `timingSafeEqual()`.
  - Enforced built-in `node:crypto.randomUUID()` in server routes and standard `crypto.randomUUID()` in client components.
  - Enforced shadcn `@/lib/utils` aliasing across all UI components.

---

## 3. MEMORY.md Updated

Recorded hotfix execution in [MEMORY.md](file:///d:/homelab-dashboard/homelab-dashboard/.agents/MEMORY.md):
- **Task ID:** `hotfix/codebase-bad-practices`
- **Scope:** 9 files refactored (`app/layout.tsx`, `components/ui/{card,badge,button}.tsx`, `lib/dashboard-auth.ts`, `app/api/chat/route.ts`, `components/hermes-chat.tsx`, `app/api/telemetry/route.ts`, `components/system-telemetry.tsx`).
- **Prevention Note:** CI gate running `npm run lint` and `npm run build` will catch untyped props and unhandled imports.

---

## 4. Commit

- **Commit Hash:** `4c831f8`
- **Commit Message:** `fix(core): refactor codebase bad practices and security smells`
- **Diff Stat:** 9 files changed, 60 insertions(+), 71 deletions(-)
