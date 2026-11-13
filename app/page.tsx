import {
  Boxes,
  ExternalLink,
  Gauge,
  HardDrive,
  Network,
} from "lucide-react";
import { CopyShareButton } from "@/components/copy-share-button";
import { SystemTelemetry } from "@/components/system-telemetry";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HermesChat } from "@/components/hermes-chat";

const COCKPIT_URL = "https://100.115.141.25:9090";
const PORTAINER_URL = "https://100.115.141.25:9443";
const WINDOWS_SHARE_PATH = "\\\\100.115.141.25\\Storage";




const panelClassName =
  "hud-panel h-full min-h-[22rem] rounded-sm border border-cyan-200/15 bg-[#061523]/95 py-0 text-[#e8fbff] ring-0 shadow-[0_24px_80px_rgba(0,0,0,0.22)]";
const actionClassName = buttonVariants({
  variant: "outline",
  size: "lg",
  className:
    "hud-action min-h-11 w-full justify-between rounded-sm border-cyan-200/40 bg-cyan-300! px-4 text-[#03111c]! hover:border-cyan-100 hover:bg-cyan-200! focus-visible:border-cyan-100 focus-visible:ring-cyan-200/70",
});

function DecorativeRadar() {
  return (
    <div className="hud-radar" aria-hidden="true">
      <div className="hud-radar__display">
        <svg viewBox="0 0 220 220" className="size-full" fill="none">
          <circle cx="110" cy="110" r="82" />
          <circle cx="110" cy="110" r="55" />
          <circle cx="110" cy="110" r="28" />
          <path d="M110 18V202M18 110H202" />
          <path d="M45 45L175 175M175 45L45 175" opacity="0.35" />
          <path d="M110 12V24M110 196V208M12 110H24M196 110H208" />
        </svg>
        <span className="hud-radar__sweep" />
        <span className="hud-radar__center" />
      </div>
      <div className="hud-radar__label">
        <span>RADAR ARRAY</span>
        <span>VISUAL // 01</span>
      </div>
    </div>
  );
}

function PanelLabel({ children }: { children: React.ReactNode }) {
  return (
    <Badge
      variant="outline"
      className="rounded-sm border-cyan-200/15 bg-cyan-300/[0.04] px-2 font-mono text-[10px] font-medium tracking-[0.18em] text-cyan-100/70 uppercase"
    >
      {children}
    </Badge>
  );
}

export default function Home() {
  return (
    <main
      id="main-content"
      className="hud-shell dark min-h-svh overflow-hidden text-[#e8fbff]"
    >
      <div className="relative z-10 mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-10 lg:px-10 lg:py-14">
        <div className="mb-5 flex items-center justify-between gap-4 border-b border-cyan-100/10 pb-3 font-mono text-[10px] tracking-[0.24em] text-cyan-100/45 uppercase">
          <span>Harvy // Private Systems Interface</span>
          <span className="hidden sm:block">03 Services // 01 Telemetry</span>
        </div>

        <header className="grid gap-8 border-b border-cyan-100/10 pb-10 md:grid-cols-[minmax(0,1fr)_17rem] md:items-center md:gap-12 lg:pb-12">
          <div className="min-w-0">
            <div className="mb-5 flex items-center gap-3 font-mono text-[10px] tracking-[0.24em] text-cyan-200/65 uppercase">
              <span className="h-px w-8 bg-cyan-300/70" aria-hidden="true" />
              Local Network Console
            </div>
            <h1 className="max-w-4xl text-4xl font-medium tracking-[-0.045em] text-[#f2fdff] text-balance sm:text-5xl lg:text-6xl">
              Hello, Harvy!
            </h1>
            <p className="mt-3 text-lg font-medium tracking-[0.04em] text-cyan-200 sm:text-xl">
              Home Lab Command Center
            </p>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-slate-300/75 sm:text-base">
              Direct access to administration, container management, and shared
              storage across the private lab network.
            </p>
          </div>

          <div className="hidden md:block">
            <DecorativeRadar />
          </div>
        </header>

        <section className="pt-9 sm:pt-11" aria-labelledby="controls-heading">
          <div className="mb-5 flex items-end justify-between gap-4 sm:mb-6">
            <div>
              <p className="font-mono text-[10px] tracking-[0.24em] text-cyan-200/55 uppercase">
                Primary controls
              </p>
              <h2
                id="controls-heading"
                className="mt-2 text-xl font-medium tracking-tight text-[#f2fdff]"
              >
                Service access
              </h2>
            </div>
            <span className="hidden h-px w-32 bg-cyan-200/20 sm:block" aria-hidden="true" />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card className={panelClassName}>
              <CardHeader className="gap-6 border-b border-cyan-100/10 p-5 sm:p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex size-10 items-center justify-center border border-cyan-200/20 bg-cyan-300/[0.05] text-cyan-200">
                    <Gauge className="size-5" aria-hidden="true" />
                  </div>
                  <PanelLabel>SYS // 01</PanelLabel>
                </div>
                <div className="space-y-2">
                  <CardTitle className="text-2xl font-medium tracking-[-0.025em] text-[#f2fdff]">
                    <h3>Cockpit</h3>
                  </CardTitle>
                  <CardDescription className="leading-6 text-slate-300/70">
                    Debian monitoring and routine server administration.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-5 p-5 sm:p-6">
                <div>
                  <p className="font-mono text-[10px] tracking-[0.2em] text-cyan-100/40 uppercase">
                    Endpoint
                  </p>
                  <code className="mt-2 block max-w-full overflow-x-auto whitespace-nowrap font-mono text-xs text-cyan-100/65">
                    {COCKPIT_URL}
                  </code>
                </div>
                <a
                  href={COCKPIT_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${actionClassName} mt-auto`}
                  aria-label="Open Cockpit in a new tab"
                >
                  Open Cockpit
                  <ExternalLink aria-hidden="true" data-icon="inline-end" />
                </a>
              </CardContent>
            </Card>

            <Card className={panelClassName}>
              <CardHeader className="gap-6 border-b border-cyan-100/10 p-5 sm:p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex size-10 items-center justify-center border border-cyan-200/20 bg-cyan-300/[0.05] text-cyan-200">
                    <Boxes className="size-5" aria-hidden="true" />
                  </div>
                  <PanelLabel>CTR // 02</PanelLabel>
                </div>
                <div className="space-y-2">
                  <CardTitle className="text-2xl font-medium tracking-[-0.025em] text-[#f2fdff]">
                    <h3>Portainer</h3>
                  </CardTitle>
                  <CardDescription className="leading-6 text-slate-300/70">
                    Docker containers, images, networks, and volumes.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-5 p-5 sm:p-6">
                <div>
                  <p className="font-mono text-[10px] tracking-[0.2em] text-cyan-100/40 uppercase">
                    Endpoint
                  </p>
                  <code className="mt-2 block max-w-full overflow-x-auto whitespace-nowrap font-mono text-xs text-cyan-100/65">
                    {PORTAINER_URL}
                  </code>
                </div>
                <a
                  href={PORTAINER_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${actionClassName} mt-auto`}
                  aria-label="Open Portainer in a new tab"
                >
                  Open Portainer
                  <ExternalLink aria-hidden="true" data-icon="inline-end" />
                </a>
              </CardContent>
            </Card>

            <Card className={panelClassName}>
              <CardHeader className="gap-6 border-b border-cyan-100/10 p-5 sm:p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex size-10 items-center justify-center border border-cyan-200/20 bg-cyan-300/[0.05] text-cyan-200">
                    <HardDrive className="size-5" aria-hidden="true" />
                  </div>
                  <PanelLabel>STR // 03</PanelLabel>
                </div>
                <div className="space-y-2">
                  <CardTitle className="text-2xl font-medium tracking-[-0.025em] text-[#f2fdff]">
                    <h3>Windows Storage</h3>
                  </CardTitle>
                  <CardDescription className="leading-6 text-slate-300/70">
                    Paste the share path into the File Explorer address bar.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-5 p-5 sm:p-6">
                <div className="min-w-0">
                  <p className="font-mono text-[10px] tracking-[0.2em] text-cyan-100/40 uppercase">
                    Share path
                  </p>
                  <code className="mt-2 block max-w-full overflow-x-auto whitespace-nowrap border-y border-cyan-100/10 bg-cyan-300/[0.025] px-3 py-3 font-mono text-sm text-cyan-50">
                    {WINDOWS_SHARE_PATH}
                  </code>
                </div>
                <div className="mt-auto">
                  <CopyShareButton value={WINDOWS_SHARE_PATH} />
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <HermesChat />

        <SystemTelemetry />

        <aside
          aria-labelledby="tailscale-heading"
          className="mt-6 grid gap-4 border border-cyan-200/15 bg-[#04111d]/90 p-4 sm:grid-cols-[auto_1fr] sm:items-center sm:p-5"
        >
          <div className="flex size-10 items-center justify-center border border-cyan-200/20 bg-cyan-300/[0.05] text-cyan-200">
            <Network className="size-5" aria-hidden="true" />
          </div>
          <div>
            <p className="font-mono text-[10px] tracking-[0.2em] text-cyan-100/45 uppercase">
              Access requirement // Tailscale
            </p>
            <h2
              id="tailscale-heading"
              className="mt-1 text-sm font-medium text-[#f2fdff]"
            >
              Connect this device to Tailscale first
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-300/70">
              Tailscale access is required before opening the services or the
              Windows share.
            </p>
          </div>
        </aside>

        <footer className="mt-6 flex flex-col gap-2 border-t border-cyan-100/10 pt-4 font-mono text-[10px] tracking-[0.18em] text-cyan-100/35 uppercase sm:flex-row sm:items-center sm:justify-between">
          <span>Interface scope // Local dashboard</span>
          <span>Telemetry source // Debian host</span>
        </footer>
      </div>
    </main>
  );
}