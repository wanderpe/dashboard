"use client";

import Link from "next/link";
import { ArrowRight, MessageSquareText, Sparkles } from "lucide-react";

export function HermesQuickLauncher() {
  return (
    <section
      aria-labelledby="hermes-launcher-heading"
      className="glass-panel relative overflow-hidden rounded-2xl p-6 sm:p-7"
    >
      <div className="absolute top-0 right-0 -mt-12 -mr-12 size-48 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none" />
      <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-xl">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-400">
              <Sparkles className="size-3.5" aria-hidden="true" />
            </span>
            <span className="font-mono text-xs font-medium tracking-wider text-cyan-400 uppercase">
              Hermes AI Assistant
            </span>
            <span className="rounded-md border border-cyan-500/20 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-medium text-cyan-200">
              No infrastructure access
            </span>
          </div>
          <h2
            id="hermes-launcher-heading"
            className="mt-3 text-xl font-semibold tracking-tight text-white sm:text-2xl"
          >
            Ask Hermes a question
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">
            Chat with the isolated assistant. It cannot inspect or manage this server, its files, or other accounts.
          </p>
        </div>
        <Link
          href="/chat"
          className="tactile-button focus-ring-glow inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-5 text-sm font-semibold text-white shadow-lg shadow-cyan-500/20 hover:from-cyan-400 hover:to-blue-500"
        >
          <MessageSquareText className="size-4" aria-hidden="true" />
          <span>Open Hermes Assistant</span>
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
