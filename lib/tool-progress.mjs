function cleanText(value, maxLength = 240) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function normalizeToolProgress(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const tool = cleanText(payload.tool, 80) || cleanText(payload.tool_name, 80);
  if (tool.startsWith("_")) return null;

  const label = cleanText(payload.label);
  if (!tool && !label) return null;

  const rawCallId = cleanText(payload.toolCallId, 160) || cleanText(payload.tool_call_id, 160);
  const status =
    payload.status === "completed"
      ? "completed"
      : payload.status === "failed" || payload.status === "error"
        ? "error"
        : "running";

  return {
    callId: rawCallId || null,
    tool: tool || "tool",
    label,
    status,
  };
}

export function upsertToolProgress(previous, incoming) {
  const next = previous.slice();
  let index = -1;

  for (let i = next.length - 1; i >= 0; i -= 1) {
    const step = next[i];
    if (
      (incoming.callId && step.callId === incoming.callId) ||
      (!incoming.callId &&
        step.status === "running" &&
        step.tool === incoming.tool &&
        (incoming.status === "running"
          ? step.label === incoming.label
          : true))
    ) {
      index = i;
      break;
    }
  }

  if (index === -1) {
    next.push(incoming);
  } else {
    next[index] = {
      ...next[index],
      ...incoming,
      callId: incoming.callId || next[index].callId,
      label: incoming.label || next[index].label,
    };
  }

  return next;
}

export function upsertToolProgressForMessage(previous, messageId, incoming) {
  const next = new Map(previous);
  next.set(
    messageId,
    upsertToolProgress(next.get(messageId) ?? [], incoming),
  );
  return next;
}

const TODO_STATUSES = new Set([
  "pending",
  "in_progress",
  "completed",
  "cancelled",
]);
const MAX_TODO_ITEMS = 256;
const MAX_TODO_ID_LENGTH = 160;
const MAX_TODO_CONTENT_LENGTH = 4000;

export function normalizeTodoSnapshot(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const { revision, todos: rawTodos } = payload;
  if (
    !Number.isSafeInteger(revision) ||
    revision < 0 ||
    !Array.isArray(rawTodos) ||
    rawTodos.length > MAX_TODO_ITEMS
  ) {
    return null;
  }

  const seenIds = new Set();
  const todos = [];
  for (const rawTodo of rawTodos) {
    if (!rawTodo || typeof rawTodo !== "object" || Array.isArray(rawTodo)) {
      return null;
    }

    const id = typeof rawTodo.id === "string" ? rawTodo.id.trim() : "";
    const content =
      typeof rawTodo.content === "string" ? rawTodo.content.trim() : "";
    const status = rawTodo.status;
    if (
      !id ||
      id.length > MAX_TODO_ID_LENGTH ||
      !content ||
      content.length > MAX_TODO_CONTENT_LENGTH ||
      !TODO_STATUSES.has(status) ||
      seenIds.has(id)
    ) {
      return null;
    }
    seenIds.add(id);

    const todo = { id, content, status };
    if (rawTodo.parent !== undefined && rawTodo.parent !== null) {
      if (typeof rawTodo.parent !== "string") return null;
      const parent = rawTodo.parent.trim();
      if (parent) {
        if (parent.length > MAX_TODO_ID_LENGTH || parent === id) return null;
        todo.parent = parent;
      }
    }
    todos.push(todo);
  }

  return { revision, todos };
}

export function upsertTodoSnapshot(previous, incoming) {
  if (!previous || incoming.revision > previous.revision) return incoming;
  return previous;
}
