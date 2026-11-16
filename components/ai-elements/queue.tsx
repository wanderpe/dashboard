import { Ban, Circle, CircleCheck, CircleDot, ListTodo } from "lucide-react";

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

type TaskQueueTraceProps = {
  snapshot: TodoSnapshot | null;
  streaming: boolean;
};

type QueueSection = {
  title: string;
  todos: TodoTask[];
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

export function TaskQueueTrace({ snapshot, streaming }: TaskQueueTraceProps) {
  if (!snapshot?.todos.length) return null;

  const sections: QueueSection[] = [
    {
      title: "To do",
      todos: snapshot.todos.filter(
        (todo) => todo.status === "pending" || todo.status === "in_progress",
      ),
    },
    {
      title: "Completed",
      todos: snapshot.todos.filter((todo) => todo.status === "completed"),
    },
    {
      title: "Cancelled",
      todos: snapshot.todos.filter((todo) => todo.status === "cancelled"),
    },
  ];
  const todoCount = sections[0].todos.length;
  const completedCount = sections[1].todos.length;
  const cancelledCount = sections[2].todos.length;

  return (
    <Trace aria-label="Task queue" className="gap-2">
      <TraceLine className="!text-[#a6322c]">
        <TraceIcon>
          <ListTodo />
        </TraceIcon>
        <TraceTitle>Queue</TraceTitle>
        <TraceDescription>
          {todoCount} to do · {completedCount} completed
          {cancelledCount ? ` · ${cancelledCount} cancelled` : ""}
        </TraceDescription>
      </TraceLine>
      {sections
        .filter((section) => section.todos.length > 0)
        .map((section) => (
          <TraceCollapsible
            key={section.title}
            defaultOpen={section.title === "To do"}
          >
            <TraceCollapsibleTrigger>
              <TraceLine className="text-xs font-medium text-foreground">
                <TraceIcon>
                  {section.title === "To do" ? (
                    <CircleDot />
                  ) : section.title === "Completed" ? (
                    <CircleCheck />
                  ) : (
                    <Ban />
                  )}
                </TraceIcon>
                <TraceTitle>{section.title}</TraceTitle>
                <TraceDescription>{section.todos.length}</TraceDescription>
              </TraceLine>
            </TraceCollapsibleTrigger>
            <TraceCollapsibleContent keepMounted>
              <Trace
                className="gap-2"
                role="list"
                aria-label={`${section.title} tasks`}
              >
                {section.todos.map((todo) => (
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
        ))}
    </Trace>
  );
}
