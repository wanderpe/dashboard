import assert from "node:assert/strict";
import test from "node:test";

import { buildWebSearchPolicy } from "../lib/web-search-policy.mjs";

test("automatic routing searches when outside information materially helps", () => {
  const policy = buildWebSearchPolicy();

  assert.match(policy, /internal routing decision/i);
  assert.match(policy, /materially improve/i);
  assert.match(policy, /current|time-sensitive|changes over time/i);
  assert.match(policy, /research|verification|sources/i);
  assert.match(policy, /web_search/);
  assert.match(policy, /web_extract/);
});

test("automatic routing answers directly when web lookup adds little", () => {
  const policy = buildWebSearchPolicy();

  assert.match(policy, /greetings|small talk/i);
  assert.match(policy, /creative/i);
  assert.match(policy, /math|calculations/i);
  assert.match(policy, /stable|common knowledge/i);
  assert.match(policy, /conversation alone/i);
  assert.match(policy, /answer directly/i);
});

test("automatic search preserves privacy and exact-source citation rules", () => {
  const policy = buildWebSearchPolicy();

  assert.match(policy, /private identity/i);
  assert.match(policy, /account data/i);
  assert.match(policy, /credentials/i);
  assert.match(policy, /private infrastructure/i);
  assert.match(policy, /untrusted/i);
  assert.match(policy, /exact URLs? returned/i);
  assert.match(policy, /do not invent/i);
  assert.match(policy, /web_extract/);
  assert.doesNotMatch(policy, /forceWebSearch|Search web toggle/i);
});
