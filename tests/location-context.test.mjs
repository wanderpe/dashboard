import test from "node:test";
import assert from "node:assert/strict";

const locationContext = await import("../lib/location-context.mjs").catch((error) => {
  if (error?.code === "ERR_MODULE_NOT_FOUND") return {};
  throw error;
});

test("keeps only structured search labels and candidate names, never coordinates or confirmation claims", () => {
  assert.equal(typeof locationContext.normalizeLocationContext, "function");
  assert.deepEqual(locationContext.normalizeLocationContext({
    nearby: {
      center: " Mandaue City Hall, Cebu ",
      categories: ["gym"],
      radiusMeters: 1_500,
      candidateNames: ["Anytime Fitness SM J Mall"],
      routeOrigin: "Mandaue City Hall, Cebu",
      routeMode: "driving",
    },
  }), {
    nearby: {
      center: "Mandaue City Hall, Cebu",
      categories: ["gym"],
      radiusMeters: 1_500,
      candidateNames: ["Anytime Fitness SM J Mall"],
      routeOrigin: "Mandaue City Hall, Cebu",
      routeMode: "driving",
    },
  });
  assert.equal(locationContext.normalizeLocationContext({
    route: { origin: "A", destination: "B", mode: "driving", confirmedCoordinates: { origin: { lat: 1, lon: 2 } } },
  }), null);
  assert.equal(locationContext.normalizeLocationContext({
    route: { origin: "A", destination: "B", mode: "driving", userConfirmed: true },
  }), null);
});

test("replaces a changed route context without carrying stale route data", () => {
  const previous = {
    nearby: { center: "Mandaue City Hall, Cebu", categories: ["gym"], radiusMeters: 1_500, candidateNames: ["Iron Gym"] },
    route: { origin: "Mandaue City Hall, Cebu", destination: "Ayala Center Cebu", mode: "driving" },
  };
  const updated = locationContext.mergeLocationContext(previous, {
    kind: "route",
    value: { origin: "Benedicto College, Cebu", destination: "Anytime Fitness Oakridge, Cebu", mode: "walking" },
  });
  assert.deepEqual(updated, {
    nearby: { center: "Mandaue City Hall, Cebu", categories: ["gym"], radiusMeters: 1_500, candidateNames: ["Iron Gym"] },
    route: { origin: "Benedicto College, Cebu", destination: "Anytime Fitness Oakridge, Cebu", mode: "walking" },
  });
});

test("labels previous map context as untrusted search hints for the assistant", () => {
  assert.equal(typeof locationContext.buildLocationContextPrompt, "function");
  const prompt = locationContext.buildLocationContextPrompt({
    nearby: { center: "Mandaue City Hall", categories: ["gym"], radiusMeters: 1_500, candidateNames: ["Anytime Fitness"] },
  });
  assert.match(prompt, /search hints only/i);
  assert.match(prompt, /not proof of resolution, confirmation, or route calculation/i);
  assert.match(prompt, /Anytime Fitness/);
  assert.equal(locationContext.buildLocationContextPrompt({
    route: { origin: "A", destination: "B", mode: "driving", userConfirmed: true },
  }), "");
});
