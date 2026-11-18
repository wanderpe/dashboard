import test from "node:test";
import assert from "node:assert/strict";
import { readLimitedJsonBody } from "../lib/map-route-request-body.mjs";

const encoder = new TextEncoder();

function streamOf(bytes) {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

test("reads valid UTF-8 JSON within the byte limit", async () => {
  const source = JSON.stringify({ origin: "Mandaue 🗺️", destination: "Cebu" });
  const bytes = encoder.encode(source);
  const parsed = await readLimitedJsonBody(streamOf(bytes), bytes.byteLength);
  assert.deepEqual(parsed, JSON.parse(source));
});

test("rejects and cancels a streamed body that exceeds the byte limit", async () => {
  let cancelled = false;
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode("x".repeat(2_049)));
    },
    cancel() {
      cancelled = true;
    },
  });

  await assert.rejects(
    readLimitedJsonBody(stream, 2_048),
    (error) => error.code === "request_too_large",
  );
  assert.equal(cancelled, true);
});
