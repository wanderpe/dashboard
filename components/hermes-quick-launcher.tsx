"use client";

import Link from "next/link";
import {
  ArrowRight,
  MessageSquareText,
  Sparkles,
  Terminal,
} from "lucide-react";

const quickPrompts = [
  { label: "Container Status", prompt: "Show me the status of running containers in Portainer." },
  { label: "Storage Health", prompt: "Inspect mounted storage capacity and usage warnings." },
  { label: "Debian Uptime", prompt: "Summarize server uptime and recent load averages." },
];

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
              Hermes AI Agent
            </span>
            <span className="rounded-md border border-cyan-500/20 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-medium text-cyan-300">
              Ready
            </span>
          </div>
          <h2
            id="hermes-launcher-heading"
            className="mt-3 text-xl font-semibold tracking-tight text-white sm:text-2xl"
          >
            Intelligent Home Lab Assistant
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">
            Conversational diagnostic interface powered by the local Hermes agent. Query system state,
            inspect Docker logs, and execute routine administrative workflows.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            {quickPrompts.map((item) => (
              <Link
                key={item.label}
                href={`/chat?q=${encodeURIComponent(item.prompt)}`}
                className="tactile-button inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-zinc-300 transition-all hover:border-white/20 hover:bg-white/[0.07] hover:text-white"
              >
                <Terminal className="size-3 text-zinc-400" aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            ))}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row lg:flex-col gap-3 shrink-0">
          <Link
            href="/chat"
            className="tactile-button focus-ring-glow inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-5 text-sm font-semibold text-white shadow-lg shadow-cyan-500/20 hover:from-cyan-400 hover:to-blue-500"
          >
            <MessageSquareText className="size-4" aria-hidden="true" />
            <span>Open Hermes Assistant</span>
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}
