# Global Agent Guardrails & Invariants

> Universal invariants across all agent turns within **Harvy's Home Lab Dashboard**.

1. **Human Authority**: Never declare a feature complete, commit, push, or open a PR without explicit user confirmation.
2. **Mandatory Gating**: Respect Gate 0 (Scope), Gate 1 (Architecture), and Gate 6 (Final Verdict).
3. **Surgical Diffs**: Make minimal changes satisfying acceptance criteria. Never reformat untouched files or add unrequested dependencies.
4. **Zero Duplicate Logic**: Inspect [`.agents/memory/INDEX.md`](file:///d:/homelab-dashboard/homelab-dashboard/.agents/memory/INDEX.md) and [`catalogs/services.md`](file:///d:/homelab-dashboard/homelab-dashboard/.agents/memory/catalogs/services.md) before writing new helpers or utilities.
5. **Architectural Invariants**: Strictly adhere to [`.agents/memory/conventions.md`](file:///d:/homelab-dashboard/homelab-dashboard/.agents/memory/conventions.md):
   - Identity: UUIDv4 (`dashboard-<uuid>`, `turn-<uuid>`)
   - Security: Constant-time `crypto.timingSafeEqual`, HttpOnly SameSite=Strict cookies, private loopback/Tailscale boundary
   - Telemetry: Non-negative integer bytes/seconds, 1200ms TCP socket timeout
   - Streaming: Idempotent SSE turns (`Idempotency-Key`), 5-minute timeout, graceful client abort
6. **Context Budget**: Load only designated domain chunks under `.agents/memory/domains/` per [`.agents/CONTEXT_POLICY.md`](file:///d:/homelab-dashboard/homelab-dashboard/.agents/CONTEXT_POLICY.md).
