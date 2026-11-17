import test from "node:test";
import assert from "node:assert/strict";

const protocol = await import("../lib/cartman-widget-protocol.mjs").catch((error) => {
  if (error?.code === "ERR_MODULE_NOT_FOUND") return {};
  throw error;
});

test("parses a valid route-map widget while preserving surrounding reply text", () => {
  assert.equal(typeof protocol.parseCartmanWidgetContent, "function");

  const content = [
    "Fine, here's the route you asked for.",
    "```cartman-widget",
    JSON.stringify({
      type: "route-map",
      origin: "Seattle, WA",
      destination: "Portland, OR",
      mode: "driving",
    }),
    "```",
    "I expect credit for this, obviously.",
  ].join("\n");

  assert.deepEqual(protocol.parseCartmanWidgetContent(content), [
    { type: "text", text: "Fine, here's the route you asked for.\n" },
    {
      type: "widget",
      widget: {
        type: "route-map",
        origin: "Seattle, WA",
        destination: "Portland, OR",
        mode: "driving",
      },
    },
    { type: "text", text: "\nI expect credit for this, obviously." },
  ]);
});

test("prompt explains when and how to emit the safe route-map block", () => {
  assert.equal(typeof protocol.buildCartmanWidgetPrompt, "function");
  const prompt = protocol.buildCartmanWidgetPrompt();
  assert.match(prompt, /cartman-widget/);
  assert.match(prompt, /route-map/);
  assert.match(prompt, /```cartman-widget/);
  assert.match(prompt, /\"type\":\"route-map\",\"origin\":\"\.\.\.\",\"destination\":\"\.\.\.\",\"mode\":\"driving\"/);
  assert.match(prompt, /origin.*destination/i);
  assert.match(prompt, /driving.*walking.*cycling/i);
  assert.match(prompt, /never invent|do not invent/i);
  assert.match(prompt, /HTML|JavaScript/i);
});

test("rejects unsupported or extra fields instead of treating them as widgets", () => {
  const unsafe = [
    "```cartman-widget",
    JSON.stringify({
      type: "route-map",
      origin: "Seattle",
      destination: "Portland",
      mode: "driving",
      html: "<script>alert(1)</script>",
    }),
    "```",
  ].join("\n");
  assert.deepEqual(protocol.parseCartmanWidgetContent(unsafe), [{ type: "text", text: unsafe }]);
});

test("keeps incomplete widget JSON hidden while the assistant is streaming", () => {
  const partial = "Route incoming.\n```cartman-widget\n{\"type\":\"route-map\",\"origin\":\"Seattle\"";
  assert.deepEqual(protocol.parseCartmanWidgetContent(partial, { streaming: true }), [
    { type: "text", text: "Route incoming.\n" },
  ]);
});
