import test from "node:test";
import assert from "node:assert/strict";

import {
  CHAT_SUGGESTIONS,
  getChatSuggestionHref,
  getChatSuggestionPrompt,
} from "../lib/chat-suggestions.mjs";

test("chat suggestions have distinct labels and useful prompt text", () => {
  assert.ok(CHAT_SUGGESTIONS.length >= 3);
  assert.equal(new Set(CHAT_SUGGESTIONS.map((suggestion) => suggestion.id)).size, CHAT_SUGGESTIONS.length);
  assert.equal(new Set(CHAT_SUGGESTIONS.map((suggestion) => suggestion.label)).size, CHAT_SUGGESTIONS.length);
  for (const suggestion of CHAT_SUGGESTIONS) {
    assert.ok(suggestion.label.trim());
    assert.ok(suggestion.prompt.trim());
    assert.doesNotMatch(suggestion.prompt, /inspect my server|run a command|check my containers|home[- ]?lab|home server/i);
  }
});

test("selecting a known suggestion returns its prompt and unknown IDs do nothing", () => {
  const first = CHAT_SUGGESTIONS[0];
  assert.equal(getChatSuggestionPrompt(first.id), first.prompt);
  assert.equal(getChatSuggestionPrompt("not-a-suggestion"), null);
});

test("quick-start links prefill the selected prompt without sending it", () => {
  const first = CHAT_SUGGESTIONS[0];
  assert.equal(
    getChatSuggestionHref(first.id),
    `/chat?q=${encodeURIComponent(first.prompt)}`,
  );
  assert.equal(getChatSuggestionHref("not-a-suggestion"), null);
});
