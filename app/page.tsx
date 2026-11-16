import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { ArrowUpRight, ShieldCheck } from "lucide-react";

import { auth } from "@/auth";
import { CartmanAvatar } from "@/components/cartman-avatar";
import { CHAT_SUGGESTIONS, getChatSuggestionHref } from "@/lib/chat-suggestions.mjs";

export const instant = false;

export default function Home() {
  return (
    <Suspense
      fallback={
        <main
          id="main-content"
          className="ambient-canvas flex min-h-svh items-center justify-center px-4 text-sm text-[#52636b]"
        >
          Loading workspace…
        </main>
      }
    >
      <WorkspaceHome />
    </Suspense>
  );
}

async function WorkspaceHome() {
  await connection();
  const session = await auth();
  const displayName = session?.user?.name?.trim() || null;
  const initials = displayName
    ? displayName
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0])
        .join("")
        .toUpperCase()
    : "G";

  return (
    <main id="main-content" className="ambient-canvas min-h-svh text-[#20313a]">
      <div className="mx-auto w-full max-w-[1440px] px-5 py-5 sm:px-8 lg:px-10">
        <header className="flex min-h-14 items-center justify-between gap-4 border-b border-[#d2dde0] pb-4">
          <p className="font-heading text-xl font-bold text-[#213642] sm:text-2xl">
            Workspace
          </p>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-xs text-[#6c7b82]">Signed in as</p>
              <p className="max-w-44 truncate text-sm font-semibold text-[#243640]">
                {displayName ?? "Guest"}
              </p>
            </div>
            <span
              className="flex size-10 items-center justify-center rounded-full bg-[#dce7ea] text-xs font-bold text-[#36515d]"
              aria-hidden="true"
            >
              {initials}
            </span>
          </div>
        </header>

        <section className="grid items-start gap-12 pt-9 sm:pt-12 lg:grid-cols-[minmax(0,1fr)_minmax(17rem,0.42fr)] lg:gap-16 lg:pt-14">
          <div className="min-w-0 max-w-4xl">
            <p className="text-sm font-semibold text-[#a6322c]">Eric AI</p>
            <h1 className="mt-3 max-w-3xl font-heading text-5xl font-bold leading-[0.98] tracking-tight text-[#1d3039] text-balance sm:text-6xl">
              What do you need help with?
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-[#53656d]">
              Ask a question, paste an error, or start with one of the prompts below.
            </p>

            <form action="/chat" method="get" className="mt-8 max-w-3xl">
              <label
                htmlFor="workspace-question"
                className="block text-sm font-semibold text-[#283b44]"
              >
                Start a conversation
              </label>
              <div className="mt-2 flex min-h-14 items-stretch gap-2 rounded-lg border border-[#bac9ce] bg-white p-1.5 shadow-[0_2px_8px_rgba(29,48,57,0.04)] focus-within:border-[#ae342d] focus-within:ring-2 focus-within:ring-[#ae342d]/20">
                <input
                  id="workspace-question"
                  name="q"
                  type="text"
                  autoComplete="off"
                  required
                  placeholder="Ask or paste an error…"
                  className="min-w-0 flex-1 rounded-md bg-transparent px-3 text-base text-[#20313a] outline-none placeholder:text-[#829097]"
                />
                <button
                  type="submit"
                  className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md bg-[#ad342d] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#922a24] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ad342d]"
                >
                  Open chat
                  <ArrowUpRight className="size-4" aria-hidden="true" />
                </button>
              </div>
              <p className="mt-2 text-xs text-[#6c7b82]">
                Your question is pre-filled. It won’t be sent until you choose Send.
              </p>
            </form>

            <section className="mt-11 max-w-3xl" aria-labelledby="starter-heading">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2
                  id="starter-heading"
                  className="font-heading text-2xl font-bold text-[#213642]"
                >
                  Try a starting point
                </h2>
                <Link
                  href="/chat"
                  className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-[#a6322c] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ad342d]"
                >
                  Open chat
                  <ArrowUpRight className="size-4" aria-hidden="true" />
                </Link>
              </div>
              <div className="mt-3 divide-y divide-[#d5dfe2] border-y border-[#d5dfe2]">
                {CHAT_SUGGESTIONS.map((suggestion) => (
                  <Link
                    key={suggestion.id}
                    href={getChatSuggestionHref(suggestion.id) ?? "/chat"}
                    className="group flex min-h-[4.5rem] items-center gap-4 px-2 py-3 outline-none transition-colors hover:bg-[#e8eff1] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#ad342d] sm:px-3"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-[#263943] group-hover:text-[#9f3029]">
                        {suggestion.label}
                      </span>
                      <span className="mt-1 block text-sm leading-5 text-[#63727a]">
                        {suggestion.prompt}
                      </span>
                    </span>
                    <ArrowUpRight
                      className="size-4 shrink-0 text-[#73838a] group-hover:text-[#a6322c]"
                      aria-hidden="true"
                    />
                  </Link>
                ))}
              </div>
            </section>
          </div>

          <aside className="mx-auto w-full max-w-sm lg:pt-2">
            <div className="flex h-[19rem] items-end justify-center overflow-hidden rounded-lg bg-[#dce8eb] px-4 pt-5 sm:h-[22rem]">
              <CartmanAvatar className="h-full max-h-[21rem] w-full object-contain object-bottom" />
            </div>
            <div className="mt-4 flex items-baseline justify-between gap-3 border-b border-[#d2dde0] pb-3">
              <div>
                <h2 className="font-heading text-2xl font-bold text-[#213642]">Eric</h2>
                <p className="text-sm text-[#697980]">AI assistant</p>
              </div>
            </div>
            <div className="pt-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#344e59]">
                <ShieldCheck className="size-4 text-[#a6322c]" aria-hidden="true" />
                A note on privacy
              </div>
              <p className="mt-2 text-sm leading-6 text-[#566870]">
                Eric only knows what you share here; it can’t access your files or other accounts.
              </p>
              <p className="mt-3 text-xs leading-5 text-[#6c7b82]">
                When web search helps, your query may go to an external provider. Don’t paste secrets.
              </p>
              <p className="mt-5 text-[11px] leading-4 text-[#7b898e]">
                Not affiliated with or endorsed by South Park, Comedy Central, or Paramount.
              </p>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
