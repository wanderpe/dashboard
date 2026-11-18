import test from "node:test";
import assert from "node:assert/strict";

const comparison = await import("../lib/map-route-comparison-service.mjs").catch((error) => {
  if (error?.code === "ERR_MODULE_NOT_FOUND") return {};
  throw error;
});

test("validates a bounded route-comparison request", () => {
  assert.equal(typeof comparison.parseMapRouteComparisonRequest, "function");
  assert.deepEqual(comparison.parseMapRouteComparisonRequest({
    origin: " Mandaue City Hall, Cebu ",
    center: "Mandaue City Hall, Cebu",
    categories: ["gym"],
    radiusMeters: 1_500,
    mode: "driving",
  }), {
    origin: "Mandaue City Hall, Cebu",
    center: "Mandaue City Hall, Cebu",
    categories: ["gym"],
    radiusMeters: 1_500,
    mode: "driving",
  });
  assert.equal(comparison.parseMapRouteComparisonRequest({
    origin: "A", center: "B", categories: ["gym"], destinations: ["invented"],
  }), null);
  assert.equal(comparison.parseMapRouteComparisonRequest({
    origin: "A", center: "B", categories: ["gym"], mode: "flying",
  }), null);
});

test("ranks every discovered candidate by OSRM road distance using provider coordinates", async () => {
  assert.equal(typeof comparison.fetchMapRouteComparison, "function");
  const origin = { lat: 10.323, lon: 123.922 };
  const candidateA = { lat: 10.324, lon: 123.923 };
  const candidateB = { lat: 10.325, lon: 123.924 };
  const routeRequests = [];
  const fetchImpl = async (input) => {
    const url = new URL(String(input));
    if (url.hostname === "nominatim.openstreetmap.org") {
      return { ok: true, json: async () => [{
        lat: String(origin.lat),
        lon: String(origin.lon),
        name: "Mandaue City Hall",
        display_name: "Mandaue City Hall, Mandaue, Cebu, Philippines",
        type: "townhall",
        class: "amenity",
        addresstype: "amenity",
        address: { city: "Mandaue", province: "Cebu", country: "Philippines" },
      }] };
    }
    if (url.hostname === "photon.test") {
      return { ok: true, json: async () => ({ features: [
        { type: "Feature", id: "N/101", properties: { name: "Closest Gym", osm_key: "leisure", osm_value: "fitness_centre", osm_type: "N", osm_id: 101 }, geometry: { type: "Point", coordinates: [candidateA.lon, candidateA.lat] } },
        { type: "Feature", id: "N/202", properties: { name: "Nearest Road Gym", osm_key: "leisure", osm_value: "fitness_centre", osm_type: "N", osm_id: 202 }, geometry: { type: "Point", coordinates: [candidateB.lon, candidateB.lat] } },
      ] }) };
    }
    if (url.hostname === "router.project-osrm.org") {
      routeRequests.push(url);
      const coordinatePair = url.pathname.split("/").at(-1).split(";");
      const [originLon, originLat] = coordinatePair[0].split(",").map(Number);
      const [destinationLon, destinationLat] = coordinatePair[1].split(",").map(Number);
      const isCandidateA = Math.abs(destinationLon - candidateA.lon) < 1e-9;
      return { ok: true, json: async () => ({ code: "Ok", routes: [{
        distance: isCandidateA ? 4_500 : 2_000,
        duration: isCandidateA ? 900 : 500,
        geometry: { type: "LineString", coordinates: [[originLon, originLat], [destinationLon, destinationLat]] },
        legs: [],
      }] }) };
    }
    throw new Error(`Unexpected provider ${url.hostname}`);
  };

  const result = await comparison.fetchMapRouteComparison({
    origin: "Mandaue City Hall, Cebu",
    center: "Mandaue City Hall, Cebu",
    categories: ["gym"],
    radiusMeters: 1_500,
    mode: "driving",
  }, {
    fetchImpl,
    cache: false,
    nominatimIntervalMs: 0,
    photonIntervalMs: 0,
    photonEndpoint: "https://photon.test/reverse",
  });

  assert.equal(result.routes.length, 2);
  assert.deepEqual(result.routes.map((route) => route.id), ["N/202", "N/101"]);
  assert.deepEqual(result.routes.map((route) => route.roadDistanceMeters), [2_000, 4_500]);
  assert.deepEqual(result.routes.map((route) => route.estimatedTravelTimeSeconds), [500, 900]);
  assert.ok(result.routes.every((route) => route.straightLineDistanceMeters > 0));
  assert.ok(result.routes.every((route) => route.resolutionState === "ROUTE_VALIDATED"));
  assert.equal(routeRequests.length, 2);
  assert.ok(routeRequests.every((url) => url.pathname.includes("123.922,10.323;")));
  assert.ok(routeRequests.some((url) => url.pathname.endsWith("123.923,10.324")));
  assert.ok(routeRequests.some((url) => url.pathname.endsWith("123.924,10.325")));
});

test("retains a discovered destination when OSRM cannot route it", async () => {
  assert.equal(typeof comparison.fetchMapRouteComparison, "function");
  const origin = { lat: 10.323, lon: 123.922 };
  const fetchImpl = async (input) => {
    const url = new URL(String(input));
    if (url.hostname === "nominatim.openstreetmap.org") {
      return { ok: true, json: async () => [{
        lat: String(origin.lat), lon: String(origin.lon), name: "Mandaue City Hall",
        display_name: "Mandaue City Hall, Mandaue, Cebu, Philippines", type: "townhall", class: "amenity",
        addresstype: "amenity", address: { city: "Mandaue", province: "Cebu", country: "Philippines" },
      }] };
    }
    if (url.hostname === "photon.test") {
      return { ok: true, json: async () => ({ features: [{
        type: "Feature", properties: { name: "Unroutable Gym", osm_key: "leisure", osm_value: "fitness_centre", osm_type: "N", osm_id: 303 },
        geometry: { type: "Point", coordinates: [123.93, 10.33] },
      }] }) };
    }
    return { ok: true, json: async () => ({ code: "NoRoute", routes: [] }) };
  };
  const result = await comparison.fetchMapRouteComparison({
    origin: "Mandaue City Hall, Cebu", center: "Mandaue City Hall, Cebu", categories: ["gym"], radiusMeters: 1_500,
  }, { fetchImpl, cache: false, nominatimIntervalMs: 0, photonIntervalMs: 0, photonEndpoint: "https://photon.test/reverse" });

  assert.equal(result.routes.length, 1);
  assert.equal(result.routes[0].name, "Unroutable Gym");
  assert.equal(result.routes[0].resolutionState, "RESOLVED");
  assert.equal(result.routes[0].routeState, "FAILED");
  assert.equal(result.routes[0].roadDistanceMeters, null);
  assert.match(result.routes[0].failureReason, /route/i);
});
