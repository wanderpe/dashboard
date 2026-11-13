"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  MessageSquareText,
  Network,
  ShieldCheck,
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
    label: "Hermes Chat",
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
        "group flex items-center gap-3 border text-sm font-medium transition-colors outline-none focus-visible:border-cyan-100 focus-visible:ring-2 focus-visible:ring-cyan-200/70",
        mobile
          ? "min-h-11 flex-1 justify-center rounded-sm px-3"
          : "min-h-11 w-full rounded-sm px-3",
        active
          ? "border-cyan-200/45 bg-cyan-300/12 text-cyan-50"
          : "border-transparent text-slate-300/70 hover:border-cyan-200/20 hover:bg-cyan-300/[0.06] hover:text-cyan-50",
      )}
    >
      <Icon
        className={cn(
          "size-4 shrink-0",
          active ? "text-cyan-200" : "text-cyan-100/45 group-hover:text-cyan-200",
        )}
        aria-hidden="true"
      />
      <span>{mobile ? shortLabel : label}</span>
    </Link>
  );
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="dark min-h-svh bg-[#020914] text-[#e8fbff] lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
      <a
        href="#main-content"
        className="fixed top-3 left-3 z-[100] -translate-y-20 rounded-sm border border-cyan-100 bg-cyan-200 px-4 py-2 text-sm font-semibold text-[#03111c] outline-none transition-transform focus:translate-y-0 focus:ring-2 focus:ring-white"
      >
        Skip to main content
      </a>

      <aside className="sticky top-0 z-40 hidden h-svh border-r border-cyan-100/10 bg-[#03101b]/95 p-5 lg:flex lg:flex-col">
        <div className="border-b border-cyan-100/10 pb-5">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center border border-cyan-200/25 bg-cyan-300/[0.06] text-cyan-200">
              <ShieldCheck className="size-4" aria-hidden="true" />
            </div>
            <div>
              <p className="font-mono text-[9px] tracking-[0.22em] text-cyan-100/45 uppercase">
                Harvy // Private
              </p>
              <p className="mt-1 text-sm font-medium text-[#f2fdff]">
                Lab Interface
              </p>
            </div>
          </div>
        </div>

        <nav aria-label="Dashboard" className="mt-6 space-y-2">
          <p className="mb-3 px-3 font-mono text-[9px] tracking-[0.22em] text-cyan-100/35 uppercase">
            Navigation // 02
          </p>
          {navigation.map((item) => (
            <NavigationLink key={item.href} {...item} />
          ))}
        </nav>

        <div className="mt-auto border-t border-cyan-100/10 pt-5">
          <div className="flex items-start gap-3 text-slate-300/60">
            <Network className="mt-0.5 size-4 shrink-0 text-cyan-100/45" aria-hidden="true" />
            <div>
              <p className="font-mono text-[9px] tracking-[0.18em] text-cyan-100/40 uppercase">
                Network boundary
              </p>
              <p className="mt-1 text-xs leading-5">Tailscale access required</p>
            </div>
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-40 border-b border-cyan-100/10 bg-[#03101b]/95 p-2 backdrop-blur lg:hidden">
          <nav aria-label="Dashboard" className="flex gap-2">
            {navigation.map((item) => (
              <NavigationLink key={item.href} {...item} mobile />
            ))}
          </nav>
        </header>
        {children}
      </div>
    </div>
  );
}
