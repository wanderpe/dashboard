"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";

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

    const timeout = window.setTimeout(() => setCopyState("idle"), 2200);
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

  const label =
    copyState === "copied"
      ? "Path copied"
      : copyState === "error"
        ? "Try copy again"
        : "Copy share path";

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="hud-action min-h-11 w-full justify-between rounded-sm border-cyan-200/40 bg-cyan-300! px-4 text-[#03111c]! hover:border-cyan-100 hover:bg-cyan-200! focus-visible:border-cyan-100 focus-visible:ring-cyan-200/70"
        onClick={handleCopy}
      >
        {label}
        {copyState === "copied" ? (
          <Check aria-hidden="true" data-icon="inline-end" />
        ) : (
          <Copy aria-hidden="true" data-icon="inline-end" />
        )}
      </Button>
      <span className="sr-only" aria-live="polite">
        {copyState === "copied"
          ? "Windows share path copied to the clipboard."
          : copyState === "error"
            ? "The Windows share path could not be copied."
            : ""}
      </span>
    </>
  );
}
