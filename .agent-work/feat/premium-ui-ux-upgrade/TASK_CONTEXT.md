# Task Context: Premium UI/UX Overhaul & Tactile Polish

**TASK_ID:** `feat/premium-ui-ux-upgrade`  
**Author:** `homelab-dashboard-task-context-builder`  
**Timestamp:** 2026-11-15T06:23:00+08:00  

---

## 1. Feature Scope & Business Goal

### Business Goal
Transform Harvy's Home Lab Dashboard from a generic, cliché sci-fi "AI slop" interface into an ultra-premium, tactile, and cohesive command center worthy of tools like Linear, Raycast, and Apple macOS. The interface must provide high-density, real-time observability over homelab infrastructure with smooth transitions, deliberate typography, and refined micro-interactions.

### Out-of-Scope (Collateral Prevention)
- No modifications to backend API endpoints (`/api/telemetry`, `/api/chat`, `/api/auth/*`).
- No changes to authentication session cookies or encryption protocols.
- No removal of underlying telemetry data or services (Cockpit, Portainer, Samba).

---

## 2. Actors & Permissions

- **Primary Actor:** Harvy (Home Lab Owner & Administrator).
- **Access Level:** Local network / Tailscale authenticated operator.
- **Permissions:** Unrestricted command center monitoring, service redirection, and Hermes Agent conversational access.

---

## 3. Core Requirements

1. **Eliminate "AI Slop" & Clichés**:
   - Remove fake rotating SVG radar (`DecorativeRadar`).
   - Remove decorative `//` prefix clutter across headings, labels, and badges.
   - Replace harsh, uniform cyan borders and grids with an obsidian/slate dark theme featuring subtle layered borders (`border-white/[0.08]`), ambient radial lighting, and glassmorphic elevation.
2. **Card & Layout Elevation (Swiss Modernism 2.0 / Modern Bento)**:
   - Redesign service cards (`Cockpit`, `Portainer`, `Windows Storage`) with contextual health status pills (linking real-time reachability latency directly onto the card header).
   - Provide tactile, responsive buttons with spring physics (`active:scale-[0.98] transition-transform duration-150`).
   - Upgrade the Windows Storage share path widget with an interactive, copyable pill with instant visual feedback and tooltip state.
3. **Telemetry & Gauge Visualization**:
   - Modernize system telemetry meters (CPU load, memory usage, storage capacity, service ping latencies).
   - Implement visual progress indicators for memory and disk usage (percentages and byte bars) rather than flat text blocks.
   - Add live animated status pulse indicators (emerald ping for reachable services, amber for degraded).
4. **Hermes Chat Presentation**:
   - Separate the full-viewport chat experience (dedicated `/chat` route) from the command center dashboard (`/`).
   - On the homepage (`/`), provide an elegant, compact "Hermes Assistant" command bar or quick action dock that lets Harvy launch common operations or jump directly into the conversation.
   - Refine the `/chat` page with high-grade typography, message grouping, and smooth input controls.
5. **Fluid Micro-Interactions (Emil Kowalski Philosophy)**:
   - Tactile button press feedback (`active:scale-[0.98]`).
   - Hardware-accelerated CSS transitions with precise cubic-bezier curves (`transition: transform 150ms cubic-bezier(0.16, 1, 0.3, 1), opacity 150ms ease`).
   - Accessible, high-contrast focus rings for keyboard navigation.

---

## 4. Constraints

- **Stack Invariants:** Next.js 16.4.6 App Router, React 19, Tailwind CSS 4, shadcn/Base UI.
- **Performance:** 60fps interaction smoothness, zero unnecessary React re-renders.
- **Accessibility:** WCAG AA contrast compliance, semantic landmarks, preserved skip links, screen-reader announcements for copy actions.
