"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  MessageSquareText,
  Radio,
  Server,
} from "lucide-react";

import { cn } from "@/lib/utils";

const navigation = [
  {
    href: "/",
    label: "Command Center",
    shortLabel: "Dashboard",
    icon: LayoutDashboard,
  },
  {
    href: "/chat",
    label: "Hermes Assistant",
    shortLabel: "Hermes Chat",
    icon: MessageSquareText,
  },
];

function NavigationLink({
  href,
  label,
  shortLabel,
  icon: Icon,
  mobile = false,
}: (typeof navigation)[number] & { mobile?: boolean }) {
  const pathname = usePathname();
  const active = href === "/" ? pathname === href : pathname.startsWith(href);

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex items-center gap-3 text-sm font-medium transition-all duration-150 outline-none tactile-button focus-ring-glow",
        mobile
          ? "min-h-10 flex-1 justify-center rounded-lg px-3 py-2 text-xs"
          : "min-h-10 w-full rounded-lg px-3 py-2 text-sm",
        active
          ? "bg-white/[0.08] text-white shadow-sm ring-1 ring-white/15"
          : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200",
      )}
    >
      <Icon
        className={cn(
          "size-4 shrink-0 transition-colors duration-150",
          active ? "text-cyan-400" : "text-zinc-400 group-hover:text-zinc-200",
        )}
        aria-hidden="true"
      />
      <span>{mobile ? shortLabel : label}</span>
      {active && !mobile ? (
        <span
          className="absolute right-2.5 size-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(56,189,248,0.8)]"
          aria-hidden="true"
        />
      ) : null}
    </Link>
  );
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="dark min-h-svh ambient-canvas text-zinc-100 lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
      <a
        href="#main-content"
        className="fixed top-3 left-3 z-[100] -translate-y-20 rounded-lg border border-cyan-400/40 bg-zinc-900 px-4 py-2 text-sm font-semibold text-cyan-200 outline-none transition-transform focus:translate-y-0 focus:ring-2 focus:ring-cyan-400"
      >
        Skip to main content
      </a>

      <aside className="sticky top-0 z-40 hidden h-svh border-r border-white/[0.07] bg-[#07090e]/90 p-5 backdrop-blur-xl lg:flex lg:flex-col">
        <div className="border-b border-white/[0.07] pb-5">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-cyan-400 shadow-inner">
              <Server className="size-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold tracking-tight text-white">
                  Harvy&apos;s Lab
                </span>
                <span className="relative flex size-2" title="Tailscale Network Active">
                  <span className="animate-live-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
                </span>
              </div>
              <p className="text-xs text-zinc-400 truncate">Private Infrastructure</p>
            </div>
          </div>
        </div>

        <nav aria-label="Dashboard" className="mt-6 space-y-1.5">
          <p className="px-3 pb-1 font-mono text-[10px] font-medium tracking-wider text-zinc-400 uppercase">
            Menu
          </p>
          {navigation.map((item) => (
            <NavigationLink key={item.href} {...item} />
          ))}
        </nav>

        <div className="mt-auto border-t border-white/[0.07] pt-5">
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5">
            <div className="flex items-center gap-2 text-xs font-medium text-zinc-300">
              <Radio className="size-3.5 text-cyan-400 shrink-0" aria-hidden="true" />
              <span>Tailscale Secured</span>
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-400">
              Connected via wireguard mesh. Direct zero-trust routing.
            </p>
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex flex-col">
        <header className="sticky top-0 z-40 border-b border-white/[0.07] bg-[#07090e]/80 p-3 backdrop-blur-xl lg:hidden">
          <nav aria-label="Dashboard" className="flex gap-2">
            {navigation.map((item) => (
              <NavigationLink key={item.href} {...item} mobile />
            ))}
          </nav>
        </header>
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}
