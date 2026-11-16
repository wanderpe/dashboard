import test from "node:test";
import assert from "node:assert/strict";

import { getUniqueCitationSources, parseInlineCitations } from "../lib/inline-citations.mjs";

test("parses Markdown sources as inline citations with labels and titles", () => {
  assert.deepEqual(
    parseInlineCitations(
      'Read [the deployment guide](https://docs.example.com/deploy "Deployment guide") for details.',
    ),
    [
      { type: "text", text: "Read " },
      {
        type: "citation",
        label: "the deployment guide",
        title: "Deployment guide",
        url: "https://docs.example.com/deploy",
      },
      { type: "text", text: " for details." },
    ],
  );
});

test("turns bare HTTP URLs into citations without swallowing punctuation", () => {
  assert.deepEqual(parseInlineCitations("See https://example.com/source."), [
    { type: "text", text: "See " },
    { type: "citation", label: "", title: null, url: "https://example.com/source" },
    { type: "text", text: "." },
  ]);
});

test("does not interpret links inside inline or fenced code", () => {
  const value = "`[code](https://example.com)`\n```\nhttps://example.org\n```";
  assert.deepEqual(parseInlineCitations(value), [{ type: "text", text: value }]);
});

test("leaves non-HTTP links and malformed destinations as plain text", () => {
  const value = "[unsafe](javascript:alert(1)) and [broken](https://)";
  assert.deepEqual(parseInlineCitations(value), [{ type: "text", text: value }]);
});

test("deduplicates source links by URL and keeps their first label", () => {
  const segments = parseInlineCitations(
    "See [the guide](https://docs.example.com/start), then [another label](https://docs.example.com/start), and https://news.example.com/story.",
  );
  assert.deepEqual(getUniqueCitationSources(segments), [
    {
      type: "citation",
      label: "the guide",
      title: null,
      url: "https://docs.example.com/start",
    },
    {
      type: "citation",
      label: "",
      title: null,
      url: "https://news.example.com/story",
    },
  ]);
});
