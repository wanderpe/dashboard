import { Ban, Circle, CircleCheck, CircleDot, ListChecks } from "lucide-react";

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
import type { TodoSnapshot, TodoTask } from "@/lib/tool-progress.mjs";

type TaskPlanTraceProps = {
  snapshot: TodoSnapshot | null;
  streaming: boolean;
};

function taskIcon(status: TodoTask["status"]) {
  switch (status) {
    case "completed":
      return <CircleCheck />;
    case "in_progress":
      return <CircleDot />;
    case "cancelled":
      return <Ban />;
    default:
      return <Circle />;
  }
}

function lineStatus(status: TodoTask["status"], streaming: boolean) {
  if (status === "in_progress" && streaming) return "running" as const;
  if (status === "pending") return "pending" as const;
  return undefined;
}

export function TaskPlanTrace({ snapshot, streaming }: TaskPlanTraceProps) {
  if (!snapshot?.todos.length) return null;

  const completed = snapshot.todos.filter(
    (todo) => todo.status === "completed",
  ).length;
  const inProgress = snapshot.todos.filter(
    (todo) => todo.status === "in_progress",
  ).length;
  const pending = snapshot.todos.filter(
    (todo) => todo.status === "pending",
  ).length;
  const cancelled = snapshot.todos.filter(
    (todo) => todo.status === "cancelled",
  ).length;
  const detail = [
    inProgress ? `${inProgress} active` : "",
    pending ? `${pending} to do` : "",
    cancelled ? `${cancelled} cancelled` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Trace aria-label="Task plan">
      <TraceCollapsible defaultOpen>
        <TraceCollapsibleTrigger>
          <TraceLine className="!text-[#a6322c]">
            <TraceIcon>
              <ListChecks />
            </TraceIcon>
            <TraceTitle>
              Plan · {completed} of {snapshot.todos.length} done
            </TraceTitle>
            <TraceDescription>{detail || "Complete"}</TraceDescription>
          </TraceLine>
        </TraceCollapsibleTrigger>
        <TraceCollapsibleContent keepMounted>
          <Trace className="gap-2" role="list" aria-label="Plan steps">
            {snapshot.todos.map((todo) => (
              <TraceLine
                key={todo.id}
                role="listitem"
                aria-label={`${todo.status.replace("_", " ")}: ${todo.content}`}
                status={lineStatus(todo.status, streaming)}
                className={`items-start text-xs ${todo.parent ? "ml-4" : ""}`}
              >
                <TraceIcon>{taskIcon(todo.status)}</TraceIcon>
                <TraceTitle className="!min-w-0 !overflow-visible !text-clip !whitespace-normal break-words text-[#52656d]">
                  {todo.content}
                </TraceTitle>
              </TraceLine>
            ))}
          </Trace>
        </TraceCollapsibleContent>
      </TraceCollapsible>
    </Trace>
  );
}
