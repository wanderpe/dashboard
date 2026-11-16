import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  getMessengerTextEvents,
  messengerSessionId,
  verifyMessengerSignature,
} from "../lib/messenger-core.mjs";

test("accepts only a valid SHA-256 Meta webhook signature", async () => {
  const body = Buffer.from('{"object":"page"}');
  const secret = "test-app-secret";
  const signature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  assert.equal(verifyMessengerSignature(body, signature, secret), true);
  assert.equal(verifyMessengerSignature(body, "sha256=00", secret), false);
  assert.equal(verifyMessengerSignature(body, signature, "wrong-secret"), false);
  assert.equal(verifyMessengerSignature(body, signature, ""), false);
});

test("extracts only text messages addressed to the configured Page", () => {
  const payload = {
    object: "page",
    entry: [{ id: "page-1", messaging: [
      { sender: { id: "person-1" }, recipient: { id: "page-1" }, message: { mid: "m1", text: "  Hi  " } },
      { sender: { id: "page-1" }, recipient: { id: "person-1" }, message: { mid: "m2", text: "echo", is_echo: true } },
      { sender: { id: "person-2" }, recipient: { id: "page-1" }, message: { mid: "m3", attachments: [] } },
      { sender: { id: "person-3" }, recipient: { id: "page-1" }, message: { text: "no message id" } },
    ] }, { id: "other-page", messaging: [
      { sender: { id: "person-4" }, recipient: { id: "other-page" }, message: { mid: "m4", text: "wrong page" } },
    ] }],
  };
  assert.deepEqual(getMessengerTextEvents(payload, "page-1"), [
    { senderId: "person-1", pageId: "page-1", messageId: "m1", text: "Hi" },
  ]);
});

test("uses a stable opaque Hermes session id per Page sender pair", () => {
  const first = messengerSessionId("page-1", "person-1");
  assert.equal(first, messengerSessionId("page-1", "person-1"));
  assert.notEqual(first, messengerSessionId("page-2", "person-1"));
  assert.notEqual(first, messengerSessionId("page-1", "person-2"));
  assert.match(first, /^messenger-[a-f0-9]{40}$/);
});
