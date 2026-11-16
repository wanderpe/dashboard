import test from "node:test";
import assert from "node:assert/strict";

import * as toolProgress from "../lib/tool-progress.mjs";

const { normalizeToolProgress, upsertToolProgress } = toolProgress;

test("normalizes only the public fields of a tool-progress event", () => {
  assert.deepEqual(
    normalizeToolProgress({
      tool: "web_search",
      label: "Searching for the current docs",
      toolCallId: "call-1",
      status: "running",
      args: { query: "private input" },
      delta: "private reasoning",
    }),
    {
      callId: "call-1",
      tool: "web_search",
      label: "Searching for the current docs",
      status: "running",
    },
  );
});

test("filters internal reasoning events instead of rendering their text", () => {
  assert.equal(
    normalizeToolProgress({
      tool_name: "_thinking",
      delta: "private reasoning text",
      status: "running",
    }),
    null,
  );
});

test("updates a running tool step when its correlated completion arrives", () => {
  const running = normalizeToolProgress({
    tool: "web_search",
    label: "Searching for documentation",
    toolCallId: "call-2",
    status: "running",
  });
  const completed = normalizeToolProgress({
    tool: "web_search",
    toolCallId: "call-2",
    status: "completed",
  });

  assert.deepEqual(upsertToolProgress([running], completed), [
    { ...running, status: "completed" },
  ]);
});

test("retains tool activity by assistant message after the turn completes", () => {
  assert.equal(typeof toolProgress.upsertToolProgressForMessage, "function");
  const running = normalizeToolProgress({
    tool: "web_search",
    label: "Searching for documentation",
    toolCallId: "call-3",
    status: "running",
  });
  const completed = normalizeToolProgress({
    tool: "web_search",
    toolCallId: "call-3",
    status: "completed",
  });
  const unrelated = normalizeToolProgress({
    tool: "read_file",
    toolCallId: "call-4",
    status: "completed",
  });

  const first = toolProgress.upsertToolProgressForMessage(
    new Map(),
    "assistant-1",
    running,
  );
  const second = toolProgress.upsertToolProgressForMessage(
    first,
    "assistant-1",
    completed,
  );
  const third = toolProgress.upsertToolProgressForMessage(
    second,
    "assistant-2",
    unrelated,
  );

  assert.deepEqual(first.get("assistant-1"), [running]);
  assert.deepEqual(second.get("assistant-1"), [{ ...running, status: "completed" }]);
  assert.deepEqual(third.get("assistant-1"), [{ ...running, status: "completed" }]);
  assert.deepEqual(third.get("assistant-2"), [unrelated]);
});

test("maps explicit failed tool events to an error state", () => {
  assert.deepEqual(
    normalizeToolProgress({ tool: "web_search", status: "failed" }),
    {
      callId: null,
      tool: "web_search",
      label: "",
      status: "error",
    },
  );
});

test("normalizes a structured todo snapshot and strips unrelated fields", () => {
  assert.equal(typeof toolProgress.normalizeTodoSnapshot, "function");
  assert.deepEqual(
    toolProgress.normalizeTodoSnapshot({
      revision: 3,
      todos: [
        {
          id: "step-1",
          content: "Inspect the route",
          status: "in_progress",
          parent: "phase-1",
          reasoning: "private thought",
        },
      ],
      summary: { total: 1 },
      args: { private: "input" },
    }),
    {
      revision: 3,
      todos: [
        {
          id: "step-1",
          content: "Inspect the route",
          status: "in_progress",
          parent: "phase-1",
        },
      ],
    },
  );
});

test("rejects malformed todo snapshots instead of rendering partial state", () => {
  assert.equal(
    toolProgress.normalizeTodoSnapshot({ revision: -1, todos: [] }),
    null,
  );
  assert.equal(
    toolProgress.normalizeTodoSnapshot({
      revision: 1,
      todos: [{ id: "step-1", content: "Do work", status: "unknown" }],
    }),
    null,
  );
});

test("ignores stale todo revisions", () => {
  const previous = {
    revision: 4,
    todos: [{ id: "step-1", content: "Current", status: "completed" }],
  };
  const stale = { revision: 3, todos: [] };
  assert.equal(typeof toolProgress.upsertTodoSnapshot, "function");
  assert.equal(toolProgress.upsertTodoSnapshot(previous, stale), previous);
});
