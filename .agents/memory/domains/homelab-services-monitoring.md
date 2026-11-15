---
id: domain.homelab-services-monitoring
tag: [TAG:TELEMETRY]
domain: Homelab Services Monitoring & Host Telemetry
updated: 2026-11-15T05:40:00+08:00
relevant_services:
  - app/api/telemetry/route.ts
  - components/system-telemetry.tsx
relevant_models:
  - lib/telemetry-types.ts
---

# Domain: Homelab Services Monitoring & Host Telemetry `[TAG:TELEMETRY]`

## 1. Domain Overview
Provides real-time host telemetry and infrastructure reachability monitoring for Harvy's private home lab on Debian Linux. The dashboard polls `/api/telemetry` every 15 seconds, rendering HUD-style status cards for load average, memory utilization, disk mounts, and core container/admin services.

---

## 2. Core Service Architecture

| Service / Class | File Path | Responsibility & Rules |
| :--- | :--- | :--- |
| `telemetry-route` | [`app/api/telemetry/route.ts`](file:///d:/homelab-dashboard/homelab-dashboard/app/api/telemetry/route.ts) | **Aggregator**: Gathers OS load averages, `/proc/meminfo`, `/proc/self/mountinfo`, filesystem stats via `statfs`, and conducts TCP probes with 1.2s timeout. |
| `system-telemetry` | [`components/system-telemetry.tsx`](file:///d:/homelab-dashboard/homelab-dashboard/components/system-telemetry.tsx) | **UI Display**: Client component with 15s polling, error boundaries, formatting helpers (`formatBytes`, `formatUptime`), and visual reachability badges. |

---

## 3. Key Models & Schema

| Model / Entity | File Path | Key Attributes & Invariants |
| :--- | :--- | :--- |
| `TelemetryResponse` | [`lib/telemetry-types.ts`](file:///d:/homelab-dashboard/homelab-dashboard/lib/telemetry-types.ts) | Root envelope containing `generatedAt`, `source: "Debian"`, `refreshIntervalSeconds: 15`, `system`, and `reachability`. |
| `EndpointCheck` | [`lib/telemetry-types.ts`](file:///d:/homelab-dashboard/homelab-dashboard/lib/telemetry-types.ts) | Tracks Cockpit (9090), Portainer (9443), and Samba (445) at `100.115.141.25` with `latencyMs` or normalized error message. |
| `StorageReading` | [`lib/telemetry-types.ts`](file:///d:/homelab-dashboard/homelab-dashboard/lib/telemetry-types.ts) | Distinguishes between mounted `/srv/storage`, `"not-mounted"`, and `"unavailable"`. |

---

## 4. Invariant Rules for Telemetry
- All metric readers must handle missing files or unmounted volumes gracefully using the `Reading<T>` discriminated union without throwing unhandled exceptions.
- Socket reachability checks must enforce strict `CHECK_TIMEOUT_MS = 1200` to prevent delayed HTTP responses.
- Responses must return `Cache-Control: no-store, max-age=0` to ensure real-time telemetry freshness.
