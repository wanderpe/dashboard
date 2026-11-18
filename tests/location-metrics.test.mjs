import test from "node:test";
import assert from "node:assert/strict";

const metrics = await import("../lib/location-metrics.mjs").catch((error) => {
  if (error?.code === "ERR_MODULE_NOT_FOUND") return {};
  throw error;
});

test("calculates a symmetric straight-line distance and rejects invalid coordinates", () => {
  assert.equal(typeof metrics.straightLineDistanceMeters, "function");
  const origin = { lat: 10.323, lon: 123.922 };
  const destination = { lat: origin.lat + (1_250 / 6_371_000) * 180 / Math.PI, lon: origin.lon };
  assert.equal(Math.round(metrics.straightLineDistanceMeters(origin, destination)), 1_250);
  assert.equal(metrics.straightLineDistanceMeters(origin, destination), metrics.straightLineDistanceMeters(destination, origin));
  assert.equal(metrics.straightLineDistanceMeters(origin, { lat: 91, lon: 0 }), null);
});
