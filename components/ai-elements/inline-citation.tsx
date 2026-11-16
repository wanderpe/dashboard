"use client";

import { ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";

type InlineCitationProps = {
  label: string;
  title: string | null;
  url: string;
};

function getHostname(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return url.hostname.replace(/^www\./i, "");
  } catch {
    return null;
  }
}

export function InlineCitation({ label, title, url }: InlineCitationProps) {
  const hostname = getHostname(url);
  if (!hostname) {
    return label ? <span>{label}</span> : null;
  }

  const visibleLabel = label && label.toLowerCase() !== hostname.toLowerCase();
  const sourceTitle = title?.trim() || label.trim() || hostname;

  return (
    <>
      {visibleLabel ? <span>{label}</span> : null}
      <HoverCard>
        <HoverCardTrigger
          render={
            <Button
              type="button"
              variant="secondary"
              size="xs"
              className="mx-1 inline-flex h-5 max-w-44 items-center rounded-md border border-[#d2dde0] bg-[#e8eff1] px-2 align-baseline text-[10px] leading-none text-[#334b55] hover:bg-[#dce8eb]"
            />
          }
        >
          <span className="truncate">{hostname}</span>
        </HoverCardTrigger>
        <HoverCardContent
          side="top"
          align="start"
          className="w-72 border border-[#d2dde0] bg-white text-[#20313a] shadow-md"
        >
          <div className="min-w-0">
            <p className="truncate font-medium">{sourceTitle}</p>
            <p className="mt-1 break-all text-xs text-[#6b7a81]">{hostname}</p>
          </div>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex w-fit items-center gap-1.5 text-xs text-[#a6322c] underline-offset-4 hover:underline"
          >
            <ExternalLink className="size-3.5" aria-hidden="true" />
            Open source
            <span className="sr-only"> in a new tab</span>
          </a>
        </HoverCardContent>
      </HoverCard>
    </>
  );
}
