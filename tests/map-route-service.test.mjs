import test from "node:test";
import assert from "node:assert/strict";

const mapRoute = await import("../lib/map-route-service.mjs").catch((error) => {
  if (error?.code === "ERR_MODULE_NOT_FOUND") return {};
  throw error;
});

test("validates and normalizes the map API request independently of the model output", () => {
  assert.equal(typeof mapRoute.parseMapRouteRequest, "function");
  assert.deepEqual(
    mapRoute.parseMapRouteRequest({
      origin: "  Seattle\n, WA ",
      destination: " Portland, OR ",
      mode: "cycling",
    }),
    { origin: "Seattle , WA", destination: "Portland, OR", mode: "cycling" },
  );
  assert.equal(mapRoute.parseMapRouteRequest({ origin: "A", destination: "B", mode: "flying" }), null);
  assert.equal(mapRoute.parseMapRouteRequest({ origin: " ", destination: "B" }), null);
  assert.equal(mapRoute.parseMapRouteRequest({ origin: "x".repeat(161), destination: "B" }), null);
});

test("fetches geocoding and routing data, then normalizes it for Leaflet", async () => {
  assert.equal(typeof mapRoute.fetchMapRoute, "function");
  const requestedUrls = [];
  const fetchImpl = async (input) => {
    const url = new URL(input);
    requestedUrls.push(url);
    if (url.hostname === "nominatim.openstreetmap.org") {
      const isSeattle = url.searchParams.get("q") === "Seattle, WA";
      return {
        ok: true,
        status: 200,
        json: async () => [
          isSeattle
            ? { lat: "47.6062", lon: "-122.3321", display_name: "Seattle, Washington, United States" }
            : { lat: "45.5152", lon: "-122.6784", display_name: "Portland, Oregon, United States" },
        ],
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        code: "Ok",
        routes: [
          {
            distance: 280_000,
            duration: 10_000,
            geometry: {
              type: "LineString",
              coordinates: [
                [-122.3321, 47.6062],
                [-122.45, 46.5],
                [-122.6784, 45.5152],
              ],
            },
            legs: [
              {
                steps: [
                  {
                    name: "I-5",
                    distance: 280_000,
                    duration: 10_000,
                    maneuver: { type: "depart", modifier: "north" },
                  },
                ],
              },
            ],
          },
        ],
      }),
    };
  };

  const result = await mapRoute.fetchMapRoute(
    { origin: "Seattle, WA", destination: "Portland, OR", mode: "cycling" },
    { fetchImpl, cache: false, nominatimIntervalMs: 0 },
  );

  assert.equal(result.mode, "cycling");
  assert.equal(result.origin.label, "Seattle, Washington, United States");
  assert.equal(result.destination.label, "Portland, Oregon, United States");
  assert.equal(result.distanceMeters, 280_000);
  assert.deepEqual(result.geometry, [
    [47.6062, -122.3321],
    [46.5, -122.45],
    [45.5152, -122.6784],
  ]);
  assert.equal(result.steps[0].instruction, "Start on I-5");
  const routeRequest = requestedUrls.find((url) => url.hostname === "router.project-osrm.org");
  assert.match(routeRequest.pathname, /\/route\/v1\/bike\//);
  assert.equal(requestedUrls.filter((url) => url.hostname === "nominatim.openstreetmap.org").length, 2);
});
