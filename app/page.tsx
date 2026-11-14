import {
  Boxes,
  ExternalLink,
  Gauge,
  HardDrive,
  Radio,
  Server,
} from "lucide-react";

import { CopyShareButton } from "@/components/copy-share-button";
import { HermesQuickLauncher } from "@/components/hermes-quick-launcher";
import { SystemTelemetry } from "@/components/system-telemetry";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const COCKPIT_URL = "https://100.115.141.25:9090";
const PORTAINER_URL = "https://100.115.141.25:9443";
const WINDOWS_SHARE_PATH = "\\\\100.115.141.25\\Storage";

export default function Home() {
  return (
    <main
      id="main-content"
      className="ambient-canvas min-h-svh text-zinc-100"
    >
      <div className="relative z-10 mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-10 lg:py-14 space-y-10">
        {/* Top Status & Context Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.07] pb-4 text-xs">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-emerald-400 font-mono text-[11px]">
              <span className="relative flex size-2">
                <span className="animate-live-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
              </span>
              Debian Host Online
            </span>
            <span className="text-zinc-400 hidden sm:inline">·</span>
            <span className="font-mono text-zinc-400 hidden sm:inline">100.115.141.25</span>
          </div>

          <div className="flex items-center gap-3 text-zinc-400 font-mono text-[11px]">
            <span className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-zinc-300">
              Tailscale Mesh Active
            </span>
            <span className="hidden md:inline">3 Core Services</span>
          </div>
        </div>

        {/* Hero Header */}
        <header className="flex flex-col gap-4">
          <div className="inline-flex items-center gap-2 text-xs font-medium text-cyan-400">
            <Server className="size-4" aria-hidden="true" />
            <span>Private Command Center</span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl lg:text-5xl">
            Home Lab Infrastructure
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-zinc-400 sm:text-base">
            Unified control console for system administration, container orchestration, and network storage
            operating on the private Debian cluster.
          </p>
        </header>

        {/* Primary Service Bento */}
        <section aria-labelledby="services-heading" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 id="services-heading" className="text-sm font-semibold tracking-wide text-zinc-300 uppercase">
              Core Services
            </h2>
            <span className="text-xs text-zinc-400">Direct HTTPS & SMB Access</span>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {/* Cockpit Card */}
            <Card className="glass-panel flex flex-col justify-between rounded-2xl border-white/[0.08] p-6 text-zinc-100">
              <CardHeader className="p-0 gap-4">
                <div className="flex items-center justify-between">
                  <div className="flex size-11 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-300">
                    <Gauge className="size-5" aria-hidden="true" />
                  </div>
                  <Badge variant="outline" className="rounded-full border-cyan-400/30 bg-cyan-400/10 text-cyan-300 font-mono text-[10px]">
                    Port 9090
                  </Badge>
                </div>
                <div className="space-y-1.5">
                  <CardTitle className="text-xl font-semibold text-white tracking-tight">
                    Cockpit
                  </CardTitle>
                  <CardDescription className="text-xs leading-relaxed text-zinc-400">
                    Debian host monitoring, terminal shell, system storage, and routine OS administration.
                  </CardDescription>
                </div>
              </CardHeader>

              <CardContent className="p-0 pt-6 mt-auto space-y-4">
                <div className="rounded-xl border border-white/[0.06] bg-black/30 p-2.5 font-mono text-xs text-zinc-400 overflow-x-auto">
                  <code>{COCKPIT_URL}</code>
                </div>
                <a
                  href={COCKPIT_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="tactile-button focus-ring-glow inline-flex min-h-10 w-full items-center justify-between rounded-xl bg-white/[0.06] px-4 text-xs font-semibold text-white border border-white/10 hover:border-white/20 hover:bg-white/[0.1] hover:text-white"
                  aria-label="Open Cockpit in a new browser tab"
                >
                  <span>Launch Cockpit</span>
                  <ExternalLink className="size-3.5 text-zinc-400" aria-hidden="true" />
                </a>
              </CardContent>
            </Card>

            {/* Portainer Card */}
            <Card className="glass-panel flex flex-col justify-between rounded-2xl border-white/[0.08] p-6 text-zinc-100">
              <CardHeader className="p-0 gap-4">
                <div className="flex items-center justify-between">
                  <div className="flex size-11 items-center justify-center rounded-xl border border-blue-400/20 bg-blue-400/10 text-blue-300">
                    <Boxes className="size-5" aria-hidden="true" />
                  </div>
                  <Badge variant="outline" className="rounded-full border-blue-400/30 bg-blue-400/10 text-blue-300 font-mono text-[10px]">
                    Port 9443
                  </Badge>
                </div>
                <div className="space-y-1.5">
                  <CardTitle className="text-xl font-semibold text-white tracking-tight">
                    Portainer CE
                  </CardTitle>
                  <CardDescription className="text-xs leading-relaxed text-zinc-400">
                    Docker container orchestration, image registries, compose stacks, and network management.
                  </CardDescription>
                </div>
              </CardHeader>

              <CardContent className="p-0 pt-6 mt-auto space-y-4">
                <div className="rounded-xl border border-white/[0.06] bg-black/30 p-2.5 font-mono text-xs text-zinc-400 overflow-x-auto">
                  <code>{PORTAINER_URL}</code>
                </div>
                <a
                  href={PORTAINER_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="tactile-button focus-ring-glow inline-flex min-h-10 w-full items-center justify-between rounded-xl bg-white/[0.06] px-4 text-xs font-semibold text-white border border-white/10 hover:border-white/20 hover:bg-white/[0.1] hover:text-white"
                  aria-label="Open Portainer in a new browser tab"
                >
                  <span>Launch Portainer</span>
                  <ExternalLink className="size-3.5 text-zinc-400" aria-hidden="true" />
                </a>
              </CardContent>
            </Card>

            {/* Windows Storage Card */}
            <Card className="glass-panel flex flex-col justify-between rounded-2xl border-white/[0.08] p-6 text-zinc-100">
              <CardHeader className="p-0 gap-4">
                <div className="flex items-center justify-between">
                  <div className="flex size-11 items-center justify-center rounded-xl border border-amber-400/20 bg-amber-400/10 text-amber-300">
                    <HardDrive className="size-5" aria-hidden="true" />
                  </div>
                  <Badge variant="outline" className="rounded-full border-amber-400/30 bg-amber-400/10 text-amber-300 font-mono text-[10px]">
                    SMB Port 445
                  </Badge>
                </div>
                <div className="space-y-1.5">
                  <CardTitle className="text-xl font-semibold text-white tracking-tight">
                    Windows Storage
                  </CardTitle>
                  <CardDescription className="text-xs leading-relaxed text-zinc-400">
                    High-speed network share. Paste into Windows File Explorer or mount as network drive.
                  </CardDescription>
                </div>
              </CardHeader>

              <CardContent className="p-0 pt-6 mt-auto space-y-4">
                <div className="rounded-xl border border-white/[0.06] bg-black/30 p-2.5 font-mono text-xs text-zinc-300 overflow-x-auto">
                  <code>{WINDOWS_SHARE_PATH}</code>
                </div>
                <CopyShareButton value={WINDOWS_SHARE_PATH} />
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Hermes AI Assistant Quick Dock */}
        <HermesQuickLauncher />

        {/* System Telemetry Section */}
        <SystemTelemetry />

        {/* Tailscale Boundary Note */}
        <aside
          aria-labelledby="tailscale-notice"
          className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4"
        >
          <div className="flex size-10 items-center justify-center rounded-xl bg-white/[0.05] text-cyan-400 shrink-0">
            <Radio className="size-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h3 id="tailscale-notice" className="text-sm font-medium text-white">
              Zero-Trust Tailscale Boundary
            </h3>
            <p className="mt-0.5 text-xs text-zinc-400 leading-relaxed">
              Services are bound to private Tailscale subnet (100.115.141.25). Verify your device is connected
              before accessing administrative endpoints or network shares.
            </p>
          </div>
        </aside>

        {/* Footer */}
        <footer className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-white/[0.07] pt-6 text-xs text-zinc-400 font-mono">
          <span>Harvy Home Lab &middot; Private Console</span>
          <span>Debian 12 &middot; Tailscale 100.115.141.25</span>
        </footer>
      </div>
    </main>
  );
}
