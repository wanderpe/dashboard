"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type CopyState = "idle" | "copied" | "error";

async function copyText(value: string) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textArea = document.createElement("textarea");
  textArea.value = value;
  textArea.setAttribute("readonly", "");
  textArea.style.position = "fixed";
  textArea.style.inset = "0 auto auto 0";
  textArea.style.opacity = "0";
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.setSelectionRange(0, value.length);

  const copied = document.execCommand("copy");
  document.body.removeChild(textArea);

  if (!copied) {
    throw new Error("Copy command failed");
  }
}

export function CopyShareButton({ value }: { value: string }) {
  const [copyState, setCopyState] = useState<CopyState>("idle");

  useEffect(() => {
    if (copyState === "idle") {
      return;
    }

    const timeout = window.setTimeout(() => setCopyState("idle"), 2400);
    return () => window.clearTimeout(timeout);
  }, [copyState]);

  async function handleCopy() {
    try {
      await copyText(value);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  }

  const isCopied = copyState === "copied";

  return (
    <div className="relative">
      <Button
        type="button"
        variant="outline"
        size="lg"
        className={cn(
          "tactile-button focus-ring-glow min-h-10 w-full justify-between rounded-xl px-4 text-xs font-medium transition-all duration-200",
          isCopied
            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300 shadow-[0_0_16px_rgba(16,185,129,0.15)]"
            : "border-white/10 bg-white/[0.04] text-zinc-200 hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
        )}
        onClick={handleCopy}
      >
        <span className="flex items-center gap-2">
          {isCopied ? "Share Path Copied!" : "Copy Share Path"}
        </span>
        <span
          className={cn(
            "flex size-5 items-center justify-center rounded-md transition-colors",
            isCopied ? "text-emerald-400" : "text-zinc-400"
          )}
        >
          {isCopied ? (
            <Check className="size-3.5 transition-transform duration-200 scale-110" aria-hidden="true" />
          ) : (
            <Copy className="size-3.5" aria-hidden="true" />
          )}
        </span>
      </Button>
      <span className="sr-only" aria-live="polite">
        {isCopied
          ? "Windows share path copied to clipboard."
          : copyState === "error"
            ? "Failed to copy Windows share path."
            : ""}
      </span>
    </div>
  );
}
