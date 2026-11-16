import { ArrowUpRight, Link2 } from "lucide-react";

import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "@/components/ui/trace";
import type { InlineCitationSourceSegment } from "@/lib/inline-citations.mjs";

type SourcesProps = {
  sources: readonly InlineCitationSourceSegment[];
};

function sourceName(source: InlineCitationSourceSegment) {
  const title = source.title?.trim() || source.label.trim();
  if (title) return title;

  try {
    return new URL(source.url).hostname.replace(/^www\./i, "");
  } catch {
    return source.url;
  }
}

export function Sources({ sources }: SourcesProps) {
  if (sources.length === 0) return null;

  const count = sources.length;
  const label = `Used ${count} ${count === 1 ? "source" : "sources"}`;

  return (
    <Trace className="mt-3 text-xs" aria-label="Sources used">
      <TraceCollapsible>
        <TraceCollapsibleTrigger>
          <TraceLine className="!text-[#6b7a81] hover:!text-[#a6322c]">
            <TraceIcon>
              <Link2 aria-hidden="true" />
            </TraceIcon>
            <TraceTitle>{label}</TraceTitle>
          </TraceLine>
        </TraceCollapsibleTrigger>
        <TraceCollapsibleContent>
          <Trace className="gap-2">
            {sources.map((source) => (
              <a
                key={source.url}
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="w-fit max-w-full"
              >
                <TraceLine className="text-xs">
                  <TraceTitle>{sourceName(source)}</TraceTitle>
                  <TraceIcon>
                    <ArrowUpRight aria-hidden="true" />
                  </TraceIcon>
                </TraceLine>
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            ))}
          </Trace>
        </TraceCollapsibleContent>
      </TraceCollapsible>
    </Trace>
  );
}
