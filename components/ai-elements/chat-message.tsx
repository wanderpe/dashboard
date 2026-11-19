import { Check, Copy, LoaderCircle, UserRound } from "lucide-react";
import { useState } from "react";

import { CartmanAvatar } from "@/components/cartman-avatar";
import { ChainOfThoughtTrace } from "@/components/ai-elements/chain-of-thought";
import { InlineCitation } from "@/components/ai-elements/inline-citation";
import { Sources } from "@/components/ai-elements/sources";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import {
  Message,
  MessageAvatar,
  MessageContent,
  MessageHeader,
} from "@/components/ui/message";
import { getUniqueCitationSources, parseInlineCitations } from "@/lib/inline-citations.mjs";
import { parseCartmanWidgetContent } from "@/lib/cartman-widget-protocol.mjs";
import { CartmanRouteMapWidget } from "@/components/ai-elements/route-map-widget";
import { CartmanNearbyMapWidget } from "@/components/ai-elements/nearby-map-widget";
import type { LocationContextChangeHandler } from "@/lib/location-context-types";
import type { ToolProgressStep } from "@/lib/tool-progress.mjs";
import { cn } from "@/lib/utils";

type ChatRole = "user" | "assistant";

export type ChatDisplayMessage = {
  id: string;
  role: ChatRole;
  content: string;
};

type AIChatMessageProps = {
  message: ChatDisplayMessage;
  userName: string;
  routeOriginCoordinates?: { lat: number; lon: number } | null;
  toolSteps?: readonly ToolProgressStep[];
  streaming?: boolean;
  onLocationContextChange?: LocationContextChangeHandler;
};

export function AIChatMessage({
  message,
  userName,
  routeOriginCoordinates = null,
  toolSteps = [],
  streaming = false,
  onLocationContextChange,
}: AIChatMessageProps) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const isUser = message.role === "user";
  const assistantParts = isUser
    ? []
    : parseCartmanWidgetContent(message.content, { streaming });
  const assistantSegments = assistantParts.flatMap((part) =>
    part.type === "text" ? parseInlineCitations(part.text) : [],
  );
  const visibleAssistantText = assistantParts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
  const hasInteractiveWidget = assistantParts.some((part) => part.type === "widget");
  const sources = getUniqueCitationSources(assistantSegments);
  const content = isUser
    ? message.content
    : assistantParts.map((part, partIndex) => {
        if (part.type === "widget") {
          return part.widget.type === "route-map" ? (
            <CartmanRouteMapWidget
              key={`widget-${partIndex}`}
              widget={part.widget}
              messageId={message.id}
              routeOriginCoordinates={routeOriginCoordinates}
              onLocationContextChange={onLocationContextChange}
            />
          ) : (
            <CartmanNearbyMapWidget
              key={`widget-${partIndex}`}
              widget={part.widget}
              messageId={message.id}
              routeOriginCoordinates={routeOriginCoordinates}
              onLocationContextChange={onLocationContextChange}
            />
          );
        }
        return parseInlineCitations(part.text).map((segment, segmentIndex) =>
          segment.type === "citation" ? (
            <InlineCitation
              key={`citation-${partIndex}-${segmentIndex}`}
              label={segment.label}
              title={segment.title}
              url={segment.url}
            />
          ) : (
            <span key={`text-${partIndex}-${segmentIndex}`}>{segment.text}</span>
          ),
        );
      });

  return (
    <Message align={isUser ? "end" : "start"} className="items-start gap-3">
      <MessageAvatar
        aria-hidden="true"
        className={cn(
          "mt-1 size-9 min-w-9 overflow-hidden rounded-full border bg-white",
          isUser ? "border-[#d2dfe3] text-[#53666f]" : "border-[#c4d4d9] bg-[#dce8eb]",
        )}
      >
        {isUser ? (
          <UserRound className="size-4" />
        ) : (
          <CartmanAvatar className="size-full object-contain" />
        )}
      </MessageAvatar>

      <MessageContent className="w-full max-w-2xl gap-1.5">
        <MessageHeader
          className={cn(
            "px-0 text-xs font-medium text-[#718087]",
            isUser ? "justify-end text-right" : "justify-start",
          )}
        >
          {isUser ? userName : "Eric · AI assistant"}
        </MessageHeader>

        <Bubble
          align={isUser ? "end" : "start"}
          variant="ghost"
          className={cn(
            "max-w-[min(100%,42rem)]",
            !isUser && hasInteractiveWidget && "w-full",
          )}
        >
          <BubbleContent
            className={cn(
              "!block !max-w-full !border !px-4 !py-3 text-base leading-7 !shadow-none",
              !isUser && hasInteractiveWidget ? "!w-full" : null,
              isUser
                ? "!rounded-2xl !rounded-tr-sm !border-[#263d4a] !bg-[#203642] !text-white"
                : "!rounded-xl !border-[#d7e1e4] !bg-white !px-5 !py-4 !text-[#223640] !shadow-sm",
            )}
          >
            {!isUser ? (
              <ChainOfThoughtTrace steps={toolSteps} streaming={streaming} />
            ) : null}
            {message.content && (isUser || assistantParts.length > 0) ? (
              <>
                <div className="whitespace-pre-wrap break-words">{content}</div>
                {!isUser && sources.length > 0 ? (
                  <Sources sources={sources} />
                ) : null}
              </>
            ) : (
              <div
                className="flex items-center gap-2 text-xs text-[#a6322c]"
                role="status"
              >
                <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                Eric is preparing a response…
              </div>
            )}
          </BubbleContent>
        </Bubble>
        {!isUser && visibleAssistantText.trim() && !streaming ? (
          <button
            type="button"
            className="inline-flex min-h-11 cursor-pointer items-center gap-2 self-start rounded-md px-3 text-xs font-medium text-[#62747b] transition-colors hover:bg-[#e4ecef] hover:text-[#20313a] focus-visible:outline-2 focus-visible:outline-[#ad342d] focus-visible:outline-offset-1"
            aria-label={copyState === "copied" ? "Answer copied" : copyState === "error" ? "Copy failed; try again" : "Copy answer"}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(visibleAssistantText);
                setCopyState("copied");
              } catch {
                setCopyState("error");
              }
            }}
          >
            {copyState === "copied" ? (
              <Check className="size-3.5" aria-hidden="true" />
            ) : (
              <Copy className="size-3.5" aria-hidden="true" />
            )}
            {copyState === "copied" ? "Copied" : copyState === "error" ? "Copy failed" : "Copy answer"}
          </button>
        ) : null}
      </MessageContent>
    </Message>
  );
}
