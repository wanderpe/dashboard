# Implementation Plan: Premium UI/UX Overhaul & Tactile Engineering

**TASK_ID:** `feat/premium-ui-ux-upgrade`  
**Execution Node:** `node_2_implementation_planner`  
**Timestamp:** 2026-11-15T06:25:00+08:00

---

## 1. Implementation Summary

This plan details the step-by-step execution to upgrade Harvy's Home Lab Dashboard into an ultra-premium command center. It eliminates cliché sci-fi HUD elements (fake spinning radar, double slashes, garish cyan borders) and implements a modern obsidian/slate aesthetic with smooth Emil Kowalski micro-interactions, responsive bento service cards, visual telemetry progress meters, and a clean separation between the home overview and Hermes chat.

---

## 2. Files to Create

| File | Purpose |
| :--- | :--- |
| `components/hermes-quick-launcher.tsx` | Elegant home-page AI assistant command dock with quick action chips and direct jump to `/chat` |

---

## 3. Files to Modify

| File | Scope of Changes | Invariant Maintained |
| :--- | :--- | :--- |
| `app/globals.css` | Replace `.hud-shell` and radar CSS with obsidian gradient, glass surfaces, and tactile spring transitions | Tailwind v4 `@theme inline` structure |
| `components/dashboard-shell.tsx` | Clean up sidebar navigation, remove `//` clutter, add live host connectivity badge | Semantic HTML5 aside/nav landmarks and skip-link |
| `app/page.tsx` | Remove `DecorativeRadar`, replace service cards with modern Bento grid, embed reachability pills, replace inline chat with quick launcher | Semantic headings, external link attributes |
| `components/copy-share-button.tsx` | Tactile spring button with smooth checkmark morph and feedback tooltip | Backward compatible clipboard copy with fallback |
| `components/system-telemetry.tsx` | Visual progress bars for RAM & Disks, clean load average badges, animated emerald ping pulses | Exact same `TelemetryResponse` data contract |
| `components/hermes-chat.tsx` | Polish dedicated chat page with glassmorphic bubbles, streamlined unlock screen, and responsive header | SSE streaming protocol and session management |

---

## 4. Implementation Order

1. **Step 1:** Update `app/globals.css` with clean obsidian tokens, surface elevations, and tactile transition classes.
2. **Step 2:** Refactor `components/dashboard-shell.tsx` with modern sidebar branding and host status indicator.
3. **Step 3:** Refactor `components/copy-share-button.tsx` with tactile button feel (`active:scale-[0.98]`).
4. **Step 4:** Implement `components/hermes-quick-launcher.tsx` as the home-page assistant widget.
5. **Step 5:** Redesign `app/page.tsx` with sleek Bento service cards, integrated health status, and clean layout hierarchy.
6. **Step 6:** Overhaul `components/system-telemetry.tsx` with visual capacity meters, load gauges, and animated status dots.
7. **Step 7:** Polish `components/hermes-chat.tsx` for the dedicated `/chat` route.
8. **Step 8:** Run `npm run lint` and `npm run build` to verify compilation, type safety, and zero regressions.
