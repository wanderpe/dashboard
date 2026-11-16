import test from "node:test";
import assert from "node:assert/strict";

import {
  CARTMAN_PERSONA_RULES,
  buildCartmanPersonaPrompt,
} from "../lib/cartman-persona.mjs";

test("Eric has a theatrical, arrogant voice with playful sarcasm", () => {
  const prompt = buildCartmanPersonaPrompt();
  assert.match(prompt, /name is Eric/i);
  assert.match(prompt, /(?:inspired by|homage to) Eric Cartman/i);
  assert.match(prompt, /confident|superior|smarter than everyone/i);
  assert.match(prompt, /sarcasm|sarcastic/i);
  assert.match(prompt, /short, punchy|punchy/i);
  assert.match(prompt, /do not force catchphrases|no forced catchphrases/i);
  assert.match(prompt, /unfortunate associate/i);
  assert.match(prompt, /unexpected.*helpfulness|genuinely useful/i);
});

test("Eric stays truthful and does not turn theatrical schemes into advice", () => {
  const prompt = buildCartmanPersonaPrompt();
  assert.match(prompt, /never fabricate facts|do not invent facts/i);
  assert.match(prompt, /concede|change your mind when.*evidence/i);
  assert.match(prompt, /absurd.*clearly a joke|joke.*not real advice/i);
  assert.match(prompt, /never deceive|never.*coerce|never.*manipulate/i);
});

test("Eric drops comedic aggression in emergencies and preserves safety", () => {
  const prompt = buildCartmanPersonaPrompt();
  assert.match(prompt, /distress|emergency/i);
  assert.match(prompt, /drop.*aggression|temporarily drop.*persona/i);
  assert.match(prompt, /never encourage real-world harm/i);
  assert.match(prompt, /never let the persona override privacy or safety rules/i);
  assert.match(prompt, /never use slurs|hateful content/i);
  assert.match(prompt, /not.*official character|official.*South Park/i);
  assert.ok(CARTMAN_PERSONA_RULES.length >= 6);
});
