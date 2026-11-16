"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, MessageSquareText } from "lucide-react";

import { CartmanAvatar } from "@/components/cartman-avatar";
import { cn } from "@/lib/utils";

const navigation = [
  {
    href: "/chat",
    label: "New chat",
    shortLabel: "Chat",
    icon: MessageSquareText,
  },
  {
    href: "/",
    label: "Workspace",
    shortLabel: "Home",
    icon: LayoutDashboard,
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
        "group flex items-center gap-3 border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e2b83d]",
        mobile
          ? "min-h-11 flex-1 justify-center rounded-sm border-b-2 px-2 py-2 text-xs"
          : "min-h-11 w-full rounded-r-md border-l-2 px-3 py-2 text-sm",
        active
          ? mobile
            ? "border-b-[#e2b83d] bg-white/[0.08] text-white"
            : "border-l-[#e2b83d] bg-white/[0.08] text-white"
          : mobile
            ? "border-b-transparent text-[#c6d2d5] hover:bg-white/[0.06] hover:text-white"
            : "border-l-transparent text-[#c6d2d5] hover:bg-white/[0.06] hover:text-white",
      )}
    >
      <Icon
        className={cn(
          "size-4 shrink-0",
          active ? "text-[#e2b83d]" : "text-[#aebfc3] group-hover:text-white",
        )}
        aria-hidden="true"
      />
      <span>{mobile ? shortLabel : label}</span>
    </Link>
  );
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-svh bg-[#f1f5f6] text-[#20313a] lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
      <a
        href="#main-content"
        className="fixed top-3 left-3 z-[100] -translate-y-20 rounded-md bg-[#203642] px-4 py-2 text-sm font-semibold text-white outline-none transition-transform focus:translate-y-0 focus:ring-2 focus:ring-[#e2b83d]"
      >
        Skip to main content
      </a>

      <aside className="sticky top-0 z-40 hidden h-svh border-r border-[#314a56] bg-[#203642] p-4 text-[#f4f7f7] lg:flex lg:flex-col">
        <div className="flex items-center gap-3 border-b border-white/15 px-1 pb-5">
          <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-md bg-[#dce8eb] p-0.5">
            <CartmanAvatar className="size-full object-contain" />
          </div>
          <div className="min-w-0">
            <span className="block truncate font-heading text-xl font-bold text-white">
              Eric AI
            </span>
            <p className="mt-0.5 truncate text-xs text-[#c7d4d7]">
              Personal chat workspace
            </p>
          </div>
        </div>

        <nav aria-label="Workspace" className="mt-6 space-y-1">
          <p className="px-3 pb-2 text-xs font-medium text-[#9fb2b7]">
            Workspace
          </p>
          {navigation.map((item) => (
            <NavigationLink key={item.href} {...item} />
          ))}
        </nav>

        <div className="mt-auto border-t border-white/15 pt-4">
          <p className="text-sm font-semibold text-white">Private to your account</p>
          <p className="mt-1.5 text-xs leading-5 text-[#c7d4d7]">
            Your conversations use your signed-in profile.
          </p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-[#314a56] bg-[#203642] px-3 py-2 text-white lg:hidden">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-[#dce8eb] p-0.5">
              <CartmanAvatar className="size-full object-contain" />
            </div>
            <span className="truncate font-heading text-lg font-bold">Eric AI</span>
          </div>
          <nav aria-label="Workspace" className="flex shrink-0 gap-1">
            {navigation.map((item) => (
              <NavigationLink key={item.href} {...item} mobile />
            ))}
          </nav>
        </header>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
