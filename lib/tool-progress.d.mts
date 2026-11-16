export type ToolProgressStatus = "running" | "completed" | "error";

export type ToolProgressStep = {
  callId: string | null;
  tool: string;
  label: string;
  status: ToolProgressStatus;
};

export function normalizeToolProgress(payload: unknown): ToolProgressStep | null;
export function upsertToolProgress(
  previous: readonly ToolProgressStep[],
  incoming: ToolProgressStep,
): ToolProgressStep[];
export function upsertToolProgressForMessage(
  previous: ReadonlyMap<string, readonly ToolProgressStep[]>,
  messageId: string,
  incoming: ToolProgressStep,
): Map<string, ToolProgressStep[]>;

export type TodoTaskStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "cancelled";

export type TodoTask = {
  id: string;
  content: string;
  status: TodoTaskStatus;
  parent?: string;
};

export type TodoSnapshot = {
  revision: number;
  todos: TodoTask[];
};

export function normalizeTodoSnapshot(payload: unknown): TodoSnapshot | null;
export function upsertTodoSnapshot(
  previous: TodoSnapshot | null,
  incoming: TodoSnapshot,
): TodoSnapshot;
