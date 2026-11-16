import { CircleAlert, LoaderCircle, Wrench } from "lucide-react";

import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceDescription,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "@/components/ui/trace";
import type { ToolProgressStep } from "@/lib/tool-progress.mjs";

type ChainOfThoughtTraceProps = {
  steps: readonly ToolProgressStep[];
  streaming: boolean;
};

function toolName(tool: string) {
  return tool.replace(/[_-]+/g, " ").trim() || "tool";
}

function stepTitle(step: ToolProgressStep, streaming: boolean) {
  const tool = toolName(step.tool);
  if (step.status === "error") return `Failed: ${tool}`;
  if (step.status === "completed") return step.label || `Used ${tool}`;
  if (streaming) return step.label || `Using ${tool}`;
  return `Stopped: ${step.label || tool}`;
}

export function ChainOfThoughtTrace({
  steps,
  streaming,
}: ChainOfThoughtTraceProps) {
  if (steps.length === 0) return null;

  const runningCount = steps.filter((step) => step.status === "running").length;
  const errorCount = steps.filter((step) => step.status === "error").length;
  const isRunning = streaming && runningCount > 0;
  const summary = isRunning
    ? `Working through ${steps.length} ${steps.length === 1 ? "step" : "steps"}`
    : runningCount > 0
      ? `Stopped after ${steps.length - runningCount} of ${steps.length} steps`
      : errorCount > 0
        ? `Completed ${steps.length - errorCount} of ${steps.length} steps`
        : `Worked through ${steps.length} ${steps.length === 1 ? "step" : "steps"}`;

  return (
    <Trace
      aria-label="User-visible agent steps"
      aria-live={streaming ? "polite" : undefined}
      className="mb-3 text-xs"
    >
      <TraceCollapsible defaultOpen={isRunning}>
        <TraceCollapsibleTrigger>
          <TraceLine
            status={isRunning ? "running" : errorCount > 0 ? "error" : undefined}
            className="!text-[#a6322c]"
          >
            <TraceIcon>
              {isRunning ? (
                <LoaderCircle className="animate-spin" />
              ) : errorCount > 0 ? (
                <CircleAlert />
              ) : (
                <Wrench />
              )}
            </TraceIcon>
            <TraceTitle>{summary}</TraceTitle>
          </TraceLine>
        </TraceCollapsibleTrigger>
        <TraceCollapsibleContent keepMounted>
          <Trace className="gap-2">
            {steps.map((step, index) => (
              <TraceLine
                key={`${step.callId ?? step.tool}-${index}`}
                status={
                  step.status === "error"
                    ? "error"
                    : step.status === "running"
                      ? streaming
                        ? "running"
                        : "pending"
                      : undefined
                }
                className="items-start text-xs"
              >
                <TraceIcon>
                  {step.status === "running" && streaming ? (
                    <LoaderCircle className="animate-spin" />
                  ) : step.status === "error" ? (
                    <CircleAlert />
                  ) : (
                    <Wrench />
                  )}
                </TraceIcon>
                <TraceTitle className="!overflow-visible !text-clip !whitespace-normal break-words text-[#52656d]">
                  {stepTitle(step, streaming)}
                </TraceTitle>
                {step.label && step.label !== step.tool ? (
                  <TraceDescription className="max-w-64 truncate">
                    {toolName(step.tool)}
                  </TraceDescription>
                ) : null}
              </TraceLine>
            ))}
          </Trace>
        </TraceCollapsibleContent>
      </TraceCollapsible>
    </Trace>
  );
}
