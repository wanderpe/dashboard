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
      const isSeattle = url.searchParams.get("q") === "Seattle, WA, United States";
      return {
        ok: true,
        status: 200,
        json: async () => [
          isSeattle
            ? {
                lat: "47.6062",
                lon: "-122.3321",
                name: "Seattle",
                display_name: "Seattle, Washington, United States",
                type: "city",
                class: "place",
                addresstype: "city",
                address: { city: "Seattle", state: "Washington", country: "United States" },
              }
            : {
                lat: "45.5152",
                lon: "-122.6784",
                name: "Portland",
                display_name: "Portland, Oregon, United States",
                type: "city",
                class: "place",
                addresstype: "city",
                address: { city: "Portland", state: "Oregon", country: "United States" },
              },
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
    { origin: "Seattle, WA, United States", destination: "Portland, OR", mode: "cycling" },
    { fetchImpl, cache: false, nominatimIntervalMs: 0 },
  );

  assert.equal(result.mode, "cycling");
  assert.equal(result.origin.label, "Seattle, Washington, United States");
  assert.equal(result.destination.label, "Portland, Oregon, United States");
  assert.equal(result.roadDistanceMeters, 280_000);
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

test("labels routing metrics as road distance and estimated travel time", async () => {
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({
      code: "Ok",
      routes: [{
        distance: 4_500,
        duration: 600,
        geometry: { type: "LineString", coordinates: [[123.922, 10.323], [123.93, 10.33]] },
        legs: [],
      }],
    }),
  });
  const result = await mapRoute.fetchMapRoute({
    origin: "Start",
    destination: "Gym",
    mode: "driving",
    confirmedCoordinates: {
      origin: { lat: 10.323, lon: 123.922 },
      destination: { lat: 10.33, lon: 123.93 },
    },
  }, { fetchImpl, cache: false });

  assert.equal(result.roadDistanceMeters, 4_500);
  assert.equal(result.estimatedTravelTimeSeconds, 600);
  assert.equal(Object.hasOwn(result, "distanceMeters"), false);
  assert.equal(Object.hasOwn(result, "durationSeconds"), false);
});

test("retries a normalized business and street search after the original geocode misses", async () => {
  const query = "Anytime Fitness Oakridge on A.S. Fortuna St., Mandaue City";
  const requestedQueries = [];
  const fetchImpl = async (input) => {
    const url = new URL(input);
    requestedQueries.push(url.searchParams.get("q"));
    const normalizedBusinessAndCity = "Anytime Fitness Oakridge, Mandaue City";
    return {
      ok: true,
      json: async () => url.searchParams.get("q") === normalizedBusinessAndCity
        ? [{
            lat: "10.32",
            lon: "123.94",
            name: "Anytime Fitness Oakridge",
            display_name: "Anytime Fitness Oakridge, A.S. Fortuna Street, Mandaue City, Philippines",
            type: "fitness_centre",
            class: "leisure",
            addresstype: "leisure",
            address: { road: "A.S. Fortuna Street", city: "Mandaue City", country: "Philippines" },
          }]
        : [],
    };
  };

  const place = await mapRoute.resolveMapPlace(query, { fetchImpl, cache: false, nominatimIntervalMs: 0 });

  assert.equal(requestedQueries[0], query);
  assert.ok(requestedQueries.includes("Anytime Fitness Oakridge, Mandaue City"));
  assert.equal(place.label, "Anytime Fitness Oakridge, A.S. Fortuna Street, Mandaue City, Philippines");
  assert.equal(place.source, "nominatim");
  assert.equal(place.resolutionState, "RESOLVED");
});

test("routes from both Benedicto College and the normalized Anytime Fitness Oakridge match", async () => {
  const originQuery = "Benedicto College, Mandaue City";
  const destinationQuery = "Anytime Fitness Oakridge on A.S. Fortuna St., Mandaue City";
  const normalizedDestination = "Anytime Fitness Oakridge, Mandaue City";
  const requestedQueries = [];
  let routeUrl = null;
  const fetchImpl = async (input) => {
    const url = new URL(input);
    if (url.hostname === "nominatim.openstreetmap.org") {
      const query = url.searchParams.get("q");
      requestedQueries.push(query);
      if (query === originQuery) {
        return { ok: true, json: async () => [{
          lat: "10.339",
          lon: "123.936",
          name: "Benedicto College",
          display_name: "Benedicto College, Mandaue City, Cebu, Philippines",
          type: "college",
          class: "amenity",
          addresstype: "college",
          address: { city: "Mandaue City", province: "Cebu", country: "Philippines" },
        }] };
      }
      if (query === normalizedDestination) {
        return { ok: true, json: async () => [{
          lat: "10.329",
          lon: "123.914",
          name: "Anytime Fitness Oakridge",
          display_name: "Anytime Fitness Oakridge, A.S. Fortuna Street, Mandaue City, Cebu, Philippines",
          type: "fitness_centre",
          class: "leisure",
          addresstype: "leisure",
          address: { road: "A.S. Fortuna Street", city: "Mandaue City", province: "Cebu", country: "Philippines" },
        }] };
      }
      return { ok: true, json: async () => [] };
    }
    routeUrl = url;
    return { ok: true, json: async () => ({
      code: "Ok",
      routes: [{
        distance: 2_800,
        duration: 420,
        geometry: { type: "LineString", coordinates: [[123.936, 10.339], [123.914, 10.329]] },
        legs: [],
      }],
    }) };
  };

  const route = await mapRoute.fetchMapRoute({
    origin: originQuery,
    destination: destinationQuery,
    mode: "driving",
  }, { fetchImpl, cache: false, nominatimIntervalMs: 0 });

  assert.equal(route.origin.label, "Benedicto College, Mandaue City, Cebu, Philippines");
  assert.equal(route.destination.label, "Anytime Fitness Oakridge, A.S. Fortuna Street, Mandaue City, Cebu, Philippines");
  assert.ok(requestedQueries.includes(originQuery));
  assert.ok(requestedQueries.includes(destinationQuery));
  assert.ok(requestedQueries.includes(normalizedDestination));
  assert.match(routeUrl.pathname, /123\.936,10\.339;123\.914,10\.329/);
  assert.equal(route.roadDistanceMeters, 2_800);
  assert.equal(route.resolutionState, "ROUTE_VALIDATED");
});

test("returns explicit candidate matches instead of selecting an ambiguous business", async () => {
  const query = "Anytime Fitness Oakridge, Mandaue City";
  const fetchImpl = async () => ({
    ok: true,
    json: async () => [
      {
        lat: "10.32",
        lon: "123.94",
        name: "Anytime Fitness Oakridge",
        display_name: "Anytime Fitness Oakridge, Mandaue City, Philippines",
        type: "fitness_centre",
        class: "leisure",
        addresstype: "leisure",
        address: { city: "Mandaue City", country: "Philippines" },
      },
      {
        lat: "10.33",
        lon: "123.95",
        name: "Anytime Fitness Oakridge",
        display_name: "Anytime Fitness Oakridge, another site, Mandaue City, Philippines",
        type: "fitness_centre",
        class: "leisure",
        addresstype: "leisure",
        address: { city: "Mandaue City", country: "Philippines" },
      },
    ],
  });

  await assert.rejects(
    mapRoute.resolveMapPlace(query, { fetchImpl, cache: false, nominatimIntervalMs: 0 }),
    (error) => {
      assert.equal(error.code, "place_ambiguous");
      assert.equal(error.details.candidates.length, 2);
      assert.deepEqual(error.details.candidates.map(({ lat, lon }) => [lat, lon]), [[10.32, 123.94], [10.33, 123.95]]);
      return true;
    },
  );
});

test("preserves resolved route endpoints and exposes ambiguous endpoint candidates", async () => {
  let routingRequested = false;
  const fetchImpl = async (input) => {
    const url = new URL(input);
    if (url.hostname !== "nominatim.openstreetmap.org") {
      routingRequested = true;
      throw new Error("OSRM must not receive an ambiguous endpoint");
    }
    const query = url.searchParams.get("q");
    if (query === "Mandaue City") {
      return {
        ok: true,
        json: async () => [{
          lat: "10.335",
          lon: "123.94",
          name: "Mandaue City",
          display_name: "Mandaue City, Cebu, Philippines",
          type: "city",
          addresstype: "city",
          address: { city: "Mandaue City", country: "Philippines" },
        }],
      };
    }
    return {
      ok: true,
      json: async () => [
        { lat: "10.32", lon: "123.94", name: "Anytime Fitness Oakridge", display_name: "Anytime Fitness Oakridge, Site A, Mandaue City", type: "fitness_centre", class: "leisure", addresstype: "leisure", address: { city: "Mandaue City" } },
        { lat: "10.33", lon: "123.95", name: "Anytime Fitness Oakridge", display_name: "Anytime Fitness Oakridge, Site B, Mandaue City", type: "fitness_centre", class: "leisure", addresstype: "leisure", address: { city: "Mandaue City" } },
      ],
    };
  };

  await assert.rejects(
    mapRoute.fetchMapRoute({ origin: "Mandaue City", destination: "Anytime Fitness Oakridge, Mandaue City" }, {
      fetchImpl,
      cache: false,
      nominatimIntervalMs: 0,
    }),
    (error) => {
      assert.equal(error.code, "place_ambiguous");
      assert.deepEqual(error.details.unresolvedEndpoints, ["destination"]);
      assert.equal(error.details.resolvedEndpoints.origin.label, "Mandaue City, Cebu, Philippines");
      assert.equal(error.details.candidateMatches.destination.length, 2);
      return true;
    },
  );
  assert.equal(routingRequested, false);
});

test("keeps malformed OSRM coordinates out of geometry and requires two valid points", async () => {
  let routeCoordinates = [
    [null, ""],
    [123.94, 10.32],
    ["", null],
    [123.95, 10.33],
  ];
  const fetchImpl = async (input) => {
    const url = new URL(input);
    if (url.hostname === "nominatim.openstreetmap.org") {
      const query = url.searchParams.get("q");
      return {
        ok: true,
        json: async () => [{ lat: "10.32", lon: "123.94", name: query, display_name: query }],
      };
    }
    return {
      ok: true,
      json: async () => ({
        code: "Ok",
        routes: [{
          distance: 1_000,
          duration: 180,
          geometry: { type: "LineString", coordinates: routeCoordinates },
          legs: [],
        }],
      }),
    };
  };
  const request = { origin: "Geometry start", destination: "Geometry end" };
  const options = { fetchImpl, cache: false, nominatimIntervalMs: 0 };

  const route = await mapRoute.fetchMapRoute(request, options);
  assert.deepEqual(route.geometry, [[10.32, 123.94], [10.33, 123.95]]);
  assert.equal(route.geometry.some(([lat, lon]) => lat === 0 && lon === 0), false);

  routeCoordinates = [[null, ""], [123.94, 10.32], ["", null]];
  await assert.rejects(
    mapRoute.fetchMapRoute(request, options),
    (error) => error.code === "route_unavailable",
  );
});

test("accepts only bounded, explicit confirmed coordinates for route endpoints", () => {
  assert.deepEqual(
    mapRoute.parseMapRouteRequest({
      origin: "Unmapped origin",
      destination: "Mapped destination",
      mode: "walking",
      confirmedCoordinates: { origin: { lat: 10.32, lon: 123.94 } },
    }),
    {
      origin: "Unmapped origin",
      destination: "Mapped destination",
      mode: "walking",
      confirmedCoordinates: { origin: { lat: 10.32, lon: 123.94 } },
    },
  );
  assert.equal(
    mapRoute.parseMapRouteRequest({
      origin: "A",
      destination: "B",
      confirmedCoordinates: { origin: { lat: 91, lon: 0 } },
    }),
    null,
  );
  assert.equal(
    mapRoute.parseMapRouteRequest({
      origin: "A",
      destination: "B",
      confirmedCoordinates: { origin: { lat: -91, lon: 0 } },
    }),
    null,
  );
  assert.equal(
    mapRoute.parseMapRouteRequest({
      origin: "A",
      destination: "B",
      confirmedCoordinates: { origin: { lat: 1, lon: 2, label: "untrusted" } },
    }),
    null,
  );
  assert.equal(
    mapRoute.parseMapRouteRequest({
      origin: "A",
      destination: "B",
      confirmedCoordinates: { destination: { lat: 0, lon: 181 } },
    }),
    null,
  );
  assert.equal(
    mapRoute.parseMapRouteRequest({
      origin: "A",
      destination: "B",
      confirmedCoordinates: { destination: { lat: 0, lon: -181 } },
    }),
    null,
  );
  assert.deepEqual(
    mapRoute.parseMapRouteRequest({
      origin: "A",
      destination: "B",
      confirmedCoordinates: {
        origin: { lat: -90, lon: 180 },
        destination: { lat: 90, lon: -180 },
      },
    }).confirmedCoordinates,
    {
      origin: { lat: -90, lon: 180 },
      destination: { lat: 90, lon: -180 },
    },
  );
});

test("routes from a confirmed map pin without geocoding that endpoint", async () => {
  const requestedQueries = [];
  let routeUrl;
  const fetchImpl = async (input) => {
    const url = new URL(input);
    if (url.hostname === "nominatim.openstreetmap.org") {
      requestedQueries.push(url.searchParams.get("q"));
      return {
        ok: true,
        json: async () => [
          {
            lat: "10.42",
            lon: "123.88",
            display_name: "Mandaue City, Cebu, Philippines",
            name: "Mandaue City",
            type: "city",
            addresstype: "city",
            address: { city: "Mandaue" },
          },
        ],
      };
    }
    routeUrl = url;
    return {
      ok: true,
      json: async () => ({
        code: "Ok",
        routes: [{
          distance: 1_500,
          duration: 300,
          geometry: { type: "LineString", coordinates: [[123.94, 10.32], [123.88, 10.42]] },
          legs: [],
        }],
      }),
    };
  };

  const result = await mapRoute.fetchMapRoute({
    origin: "Sacris Road 293, Bakilid, Mandaue City",
    destination: "Mandaue City",
    mode: "driving",
    confirmedCoordinates: { origin: { lat: 10.32, lon: 123.94 } },
  }, { fetchImpl, cache: false, nominatimIntervalMs: 0 });

  assert.deepEqual(requestedQueries, ["Mandaue City"]);
  assert.match(routeUrl.pathname, /123\.94,10\.32;123\.88,10\.42/);
  assert.equal(result.origin.source, "map_pin");
  assert.match(result.origin.label, /User-confirmed pin/);
  assert.equal(result.destination.source, "nominatim");
});

test("returns unresolved endpoints and a locality-only map center instead of routing to a guess", async () => {
  const requestedQueries = [];
  let routingRequested = false;
  const fetchImpl = async (input) => {
    const url = new URL(input);
    if (url.hostname === "nominatim.openstreetmap.org") {
      const query = url.searchParams.get("q");
      requestedQueries.push(query);
      return {
        ok: true,
        json: async () => query === "Mandaue City"
          ? [{
              lat: "10.335",
              lon: "123.94",
              display_name: "Mandaue City, Cebu, Philippines",
              type: "city",
              addresstype: "city",
              address: { city: "Mandaue" },
            }]
          : [],
      };
    }
    routingRequested = true;
    throw new Error("OSRM must not be called for unresolved endpoints");
  };

  await assert.rejects(
    mapRoute.fetchMapRoute({
      origin: "Sacris Road 293, Bakilid, Mandaue City",
      destination: "Clinica Prime Oakridge, A.S. Fortuna St., Mandaue City",
    }, { fetchImpl, cache: false, nominatimIntervalMs: 0 }),
    (error) => {
      assert.equal(error.code, "place_not_found");
      assert.deepEqual(error.details.unresolvedEndpoints, ["origin", "destination"]);
      assert.deepEqual(error.details.resolvedEndpoints, {});
      assert.deepEqual(error.details.mapCenter, {
        label: "Mandaue City, Cebu, Philippines",
        lat: 10.335,
        lon: 123.94,
        zoom: 12,
      });
      return true;
    },
  );

  assert.deepEqual(requestedQueries, [
    "Sacris Road 293, Bakilid, Mandaue City",
    "Sacris Road 293, Bakilid",
    "Sacris Road, Bakilid",
    "Clinica Prime Oakridge, A.S. Fortuna St., Mandaue City",
    "Clinica Prime Oakridge, AS. Fortuna Street, Mandaue City",
    "Clinica Prime Oakridge, Mandaue City",
    "A.S. Fortuna St., Mandaue City",
    "Mandaue City",
  ]);
  assert.equal(routingRequested, false);
});

test("does not treat a road segment as a match for an address with a house number", async () => {
  let routingRequested = false;
  const originQuery = "Sacris Road 293, Bakilid, Mandaue City";
  const fetchImpl = async (input) => {
    const url = new URL(input);
    if (url.hostname === "nominatim.openstreetmap.org") {
      return {
        ok: true,
        json: async () => url.searchParams.get("q") === originQuery
          ? [{
              lat: "10.338",
              lon: "123.933",
              display_name: "Sacris Road, Bakilid, Mandaue City, Philippines",
              type: "road",
              addresstype: "road",
              address: { road: "Sacris Road", city: "Mandaue City", country: "Philippines" },
            }]
          : [{
              lat: "10.335",
              lon: "123.94",
              display_name: "Mandaue City, Cebu, Philippines",
              type: "city",
              address: { city: "Mandaue" },
            }],
      };
    }
    routingRequested = true;
    throw new Error("OSRM must not receive an unconfirmed road substitute");
  };

  await assert.rejects(
    mapRoute.fetchMapRoute({ origin: originQuery, destination: "Mandaue City" }, {
      fetchImpl,
      cache: false,
      nominatimIntervalMs: 0,
    }),
    (error) => {
      assert.equal(error.code, "place_not_found");
      assert.deepEqual(error.details.unresolvedEndpoints, ["origin"]);
      assert.equal(error.details.resolvedEndpoints.destination.label, "Mandaue City, Cebu, Philippines");
      assert.deepEqual(error.details.mapCenter, {
        label: "Mandaue City, Cebu, Philippines",
        lat: 10.335,
        lon: 123.94,
        zoom: 13,
      });
      return true;
    },
  );
  assert.equal(routingRequested, false);
});

test("does not treat a road result as a match for a named clinic", async () => {
  let routingRequested = false;
  const destinationQuery = "Clinica Prime Oakridge, A.S. Fortuna St., Mandaue City";
  const fetchImpl = async (input) => {
    const url = new URL(input);
    if (url.hostname === "nominatim.openstreetmap.org") {
      return {
        ok: true,
        json: async () => url.searchParams.get("q") === "Mandaue City"
          ? [{
              lat: "10.335",
              lon: "123.94",
              display_name: "Mandaue City, Cebu, Philippines",
              type: "city",
              address: { city: "Mandaue" },
            }]
          : [{
              lat: "10.34",
              lon: "123.93",
              display_name: "A.S. Fortuna Street, Mandaue City, Philippines",
              type: "road",
              addresstype: "road",
              address: { road: "A.S. Fortuna Street", city: "Mandaue City", country: "Philippines" },
            }],
      };
    }
    routingRequested = true;
    throw new Error("OSRM must not receive a road substitute for a clinic");
  };

  await assert.rejects(
    mapRoute.fetchMapRoute({ origin: "Mandaue City", destination: destinationQuery }, {
      fetchImpl,
      cache: false,
      nominatimIntervalMs: 0,
    }),
    (error) => {
      assert.equal(error.code, "place_not_found");
      assert.deepEqual(error.details.unresolvedEndpoints, ["destination"]);
      assert.equal(error.details.resolvedEndpoints.origin.label, "Mandaue City, Cebu, Philippines");
      return true;
    },
  );
  assert.equal(routingRequested, false);
});

test("does not reuse a cached pin route label for different place text", async () => {
  let routingRequests = 0;
  const fetchImpl = async () => {
    routingRequests += 1;
    return {
      ok: true,
      json: async () => ({
        code: "Ok",
        routes: [{
          distance: 1_000,
          duration: 180,
          geometry: { type: "LineString", coordinates: [[123.941, 10.321], [123.942, 10.322]] },
          legs: [],
        }],
      }),
    };
  };
  const confirmedCoordinates = {
    origin: { lat: 10.321, lon: 123.941 },
    destination: { lat: 10.322, lon: 123.942 },
  };

  const first = await mapRoute.fetchMapRoute({
    origin: "First pin label",
    destination: "First destination label",
    mode: "driving",
    confirmedCoordinates,
  }, { fetchImpl });
  const second = await mapRoute.fetchMapRoute({
    origin: "Second pin label",
    destination: "Second destination label",
    mode: "driving",
    confirmedCoordinates,
  }, { fetchImpl });
  const third = await mapRoute.fetchMapRoute({
    origin: "Second pin label",
    destination: "Third destination label",
    mode: "driving",
    confirmedCoordinates,
  }, { fetchImpl });

  assert.equal(routingRequests, 3);
  assert.match(first.origin.label, /First pin label/);
  assert.match(second.origin.label, /Second pin label/);
  assert.match(first.destination.label, /First destination label/);
  assert.match(second.destination.label, /Second destination label/);
  assert.match(third.destination.label, /Third destination label/);
});

async function assertPlaceQueryUnresolved({ query, result, endpoint = "origin" }) {
  let routingRequested = false;
  const fetchImpl = async (input) => {
    const url = new URL(input);
    if (url.hostname === "nominatim.openstreetmap.org") {
      return {
        ok: true,
        status: 200,
        json: async () => url.searchParams.get("q") === query
          ? [result]
          : [{
              lat: "10.335",
              lon: "123.94",
              display_name: "Mandaue City, Cebu, Philippines",
              type: "city",
              address: { city: "Mandaue" },
            }],
      };
    }
    routingRequested = true;
    throw new Error("OSRM must not receive an unconfirmed geocoder result");
  };
  const request = endpoint === "origin"
    ? { origin: query, destination: "Mandaue City" }
    : { origin: "Mandaue City", destination: query };

  await assert.rejects(
    mapRoute.fetchMapRoute(request, { fetchImpl, cache: false, nominatimIntervalMs: 0 }),
    (error) => {
      assert.equal(error.code, "place_not_found");
      assert.deepEqual(error.details.unresolvedEndpoints, [endpoint]);
      return true;
    },
  );
  assert.equal(routingRequested, false);
}

async function assertPlaceQueryResolved({ query, result }) {
  let routingRequested = false;
  const fetchImpl = async (input) => {
    const url = new URL(input);
    if (url.hostname === "nominatim.openstreetmap.org") {
      const isTarget = url.searchParams.get("q") === query;
      return {
        ok: true,
        status: 200,
        json: async () => [isTarget ? result : {
          lat: "10.335",
          lon: "123.94",
          name: "Mandaue",
          display_name: "Mandaue City, Cebu, Philippines",
          type: "city",
          class: "place",
          addresstype: "city",
          address: { city: "Mandaue", country: "Philippines" },
        }],
      };
    }
    routingRequested = true;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        code: "Ok",
        routes: [{
          distance: 1_000,
          duration: 180,
          geometry: { type: "LineString", coordinates: [[123.94, 10.32], [123.95, 10.33]] },
          legs: [],
        }],
      }),
    };
  };

  const route = await mapRoute.fetchMapRoute(
    { origin: query, destination: "Mandaue City" },
    { fetchImpl, cache: false, nominatimIntervalMs: 0 },
  );
  assert.equal(routingRequested, true);
  assert.equal(route.origin.label, result.display_name);
  assert.equal(route.origin.source, "nominatim");
}

test("does not accept the same house number on a different street", async () => {
  await assertPlaceQueryUnresolved({
    query: "293 Sacris Road, Mandaue City",
    result: {
      lat: "10.34",
      lon: "123.93",
      display_name: "293 A.S. Fortuna Road, Mandaue City, Cebu, Philippines",
      address: {
        house_number: "293",
        road: "A.S. Fortuna Road",
        city: "Mandaue City",
        country: "Philippines",
      },
    },
  });
});

test("does not accept a different clinic with the same generic category", async () => {
  await assertPlaceQueryUnresolved({
    query: "Clinica Prime Oakridge, A.S. Fortuna St., Mandaue City",
    endpoint: "destination",
    result: {
      lat: "10.34",
      lon: "123.93",
      name: "Another Clinic",
      display_name: "Another Clinic, A.S. Fortuna Street, Mandaue City, Cebu, Philippines",
      type: "clinic",
      class: "amenity",
      addresstype: "amenity",
      address: { road: "A.S. Fortuna Street", city: "Mandaue City", country: "Philippines" },
    },
  });
});

test("does not accept a matching house and street in the wrong locality", async () => {
  await assertPlaceQueryUnresolved({
    query: "293 Sacris Road, Mandaue City",
    result: {
      lat: "10.34",
      lon: "123.93",
      display_name: "293 Sacris Road, Lapu-Lapu City, Cebu, Philippines",
      address: {
        house_number: "293",
        road: "Sacris Road",
        city: "Lapu-Lapu City",
        country: "Philippines",
      },
    },
  });
});

test("does not treat a road name as the requested clinic identity", async () => {
  await assertPlaceQueryUnresolved({
    query: "Central Clinic, Central Road, Mandaue City",
    endpoint: "destination",
    result: {
      lat: "10.34",
      lon: "123.93",
      name: "Another Clinic",
      display_name: "Another Clinic, Central Road, Mandaue City, Cebu, Philippines",
      type: "clinic",
      class: "amenity",
      addresstype: "amenity",
      address: { road: "Central Road", city: "Mandaue City", country: "Philippines" },
    },
  });
});

test("keeps fallback geocoder labels scoped to exact unpinned query text", async () => {
  const firstOrigin = "Fallback Label Cache Start";
  const caseVariantOrigin = "fallback label cache start";
  const destination = "Fallback Label Cache Destination";
  const fetchImpl = async (input) => {
    const url = new URL(input);
    if (url.hostname === "nominatim.openstreetmap.org") {
      return {
        ok: true,
        json: async () => [{ lat: "10.321", lon: "123.941", name: url.searchParams.get("q") }],
      };
    }
    return {
      ok: true,
      json: async () => ({
        code: "Ok",
        routes: [{
          distance: 1_000,
          duration: 180,
          geometry: { type: "LineString", coordinates: [[123.941, 10.321], [123.942, 10.322]] },
          legs: [],
        }],
      }),
    };
  };

  const first = await mapRoute.fetchMapRoute({ origin: firstOrigin, destination }, { fetchImpl, nominatimIntervalMs: 0 });
  const second = await mapRoute.fetchMapRoute({ origin: caseVariantOrigin, destination }, { fetchImpl, nominatimIntervalMs: 0 });

  assert.equal(first.origin.label, firstOrigin);
  assert.equal(second.origin.label, caseVariantOrigin);
});

test("rejects a free-form POI result that does not match the requested place identity", async () => {
  await assertPlaceQueryUnresolved({
    query: "Oakridge Waterfront Plaza",
    result: {
      lat: "10.34",
      lon: "123.93",
      name: "Mandaue Waterfront Plaza",
      display_name: "Mandaue Waterfront Plaza, Cebu, Philippines",
      type: "attraction",
      class: "tourism",
      addresstype: "attraction",
    },
  });
});

test("rejects a POI when its structured name conflicts with display-name text", async () => {
  await assertPlaceQueryUnresolved({
    query: "Clinica Prime Oakridge",
    result: {
      lat: "10.34",
      lon: "123.93",
      name: "Another Clinic",
      display_name: "Clinica Prime Oakridge, A.S. Fortuna Street, Mandaue City, Philippines",
      type: "clinic",
      class: "amenity",
      addresstype: "clinic",
      address: { city: "Mandaue City", country: "Philippines" },
    },
  });
});

test("requires locality evidence from locality address fields rather than road or display text", async () => {
  await assertPlaceQueryUnresolved({
    query: "Sacris Road, Mandaue City",
    result: {
      lat: "10.34",
      lon: "123.93",
      display_name: "Sacris Road, Mandaue City, Cebu, Philippines",
      address: {
        road: "Sacris Road, Mandaue City",
        country: "Philippines",
      },
    },
  });
});

test("requires an exact house number in a separate query segment", async () => {
  await assertPlaceQueryUnresolved({
    query: "Sacris Road, 293, Mandaue City",
    result: {
      lat: "10.34",
      lon: "123.93",
      display_name: "Sacris Road, Mandaue City, Cebu, Philippines",
      address: {
        road: "Sacris Road",
        city: "Mandaue City",
        country: "Philippines",
      },
    },
  });
});

test("does not route to a house when the query specifies only a street", async () => {
  await assertPlaceQueryUnresolved({
    query: "Sacris Road, Mandaue City",
    result: {
      lat: "10.34",
      lon: "123.93",
      name: "12 Sacris Road",
      display_name: "12 Sacris Road, Sacris Road, Mandaue City, Cebu, Philippines",
      type: "house",
      class: "place",
      addresstype: "house",
      address: {
        house_number: "12",
        road: "Sacris Road",
        city: "Mandaue City",
        country: "Philippines",
      },
    },
  });
});

test("does not resolve a street-only query to a cafe listed along the matching road", async () => {
  await assertPlaceQueryUnresolved({
    query: "Sacris Road, Mandaue City",
    result: {
      lat: "10.34",
      lon: "123.93",
      name: "Coffee Corner",
      display_name: "Coffee Corner, Sacris Road, Mandaue City, Cebu, Philippines",
      type: "restaurant",
      class: "amenity",
      addresstype: "restaurant",
      address: { road: "Sacris Road", city: "Mandaue City", country: "Philippines" },
    },
  });
});

test("does not resolve a street-only query to a POI named after the street", async () => {
  await assertPlaceQueryUnresolved({
    query: "Sacris Road, Mandaue City",
    result: {
      lat: "10.34",
      lon: "123.93",
      name: "Sacris Road",
      display_name: "Sacris Road, Mandaue City, Cebu, Philippines",
      type: "restaurant",
      class: "amenity",
      addresstype: "restaurant",
      address: { road: "Sacris Road", city: "Mandaue City", country: "Philippines" },
    },
  });
});

test("resolves a uniquely typed shopping center with explicit locality qualifiers", async () => {
  const query = "Ayala Center Cebu, Cebu City, Cebu";
  const searchQuery = "Ayala Center Cebu mall, Cebu City, Cebu";
  const requestedSearches = [];
  let routingRequested = false;
  const fetchImpl = async (input) => {
    const url = new URL(input);
    if (url.hostname === "nominatim.openstreetmap.org") {
      const requestedQuery = url.searchParams.get("q");
      requestedSearches.push({
        query: requestedQuery,
        addressdetails: url.searchParams.get("addressdetails"),
        limit: url.searchParams.get("limit"),
      });
      return {
        ok: true,
        status: 200,
        json: async () => requestedQuery === query || requestedQuery === searchQuery
          ? [{
              lat: "10.3181160",
              lon: "123.9048331",
              name: "Ayala Center Cebu",
              display_name: "Ayala Center Cebu, Luz, Cebu City, Central Visayas, Philippines",
              type: "mall",
              class: "shop",
              addresstype: "shop",
              address: {
                shop: "Ayala Center Cebu",
                suburb: "Luz",
                city: "Cebu City",
                region: "Central Visayas",
                country: "Philippines",
              },
            }]
          : [],
      };
    }
    routingRequested = true;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        code: "Ok",
        routes: [{
          distance: 1_000,
          duration: 180,
          geometry: { type: "LineString", coordinates: [[123.94, 10.32], [123.9048331, 10.318116]] },
          legs: [],
        }],
      }),
    };
  };

  const route = await mapRoute.fetchMapRoute({
    origin: "Known origin",
    destination: query,
    mode: "driving",
    confirmedCoordinates: { origin: { lat: 10.32, lon: 123.94 } },
  }, { fetchImpl, cache: false, nominatimIntervalMs: 0 });

  assert.deepEqual(requestedSearches, [{ query: searchQuery, addressdetails: "1", limit: "5" }]);
  assert.deepEqual([route.destination.lat, route.destination.lon], [10.318116, 123.9048331]);
  assert.equal(route.destination.label, "Ayala Center Cebu, Luz, Cebu City, Central Visayas, Philippines");
  assert.equal(route.destination.source, "nominatim");
  assert.equal(routingRequested, true);
});

test("keeps ambiguous same-name mall candidates unresolved after center classification", async () => {
  const query = "Ayala Center Cebu, Cebu City, Cebu";
  const searchQuery = "Ayala Center Cebu mall, Cebu City, Cebu";
  const requestedQueries = [];
  let routingRequested = false;
  const makeCandidate = (lat, lon) => ({
    lat,
    lon,
    name: "Ayala Center Cebu",
    display_name: "Ayala Center Cebu, Cebu City, Cebu, Philippines",
    type: "mall",
    addresstype: "shop",
    address: { shop: "Ayala Center Cebu", city: "Cebu City", country: "Philippines" },
  });
  const fetchImpl = async (input) => {
    const url = new URL(input);
    if (url.hostname === "nominatim.openstreetmap.org") {
      const requestedQuery = url.searchParams.get("q");
      requestedQueries.push(requestedQuery);
      return {
        ok: true,
        status: 200,
        json: async () => requestedQuery === searchQuery
          ? [makeCandidate("10.3181160", "123.9048331"), makeCandidate("10.3190000", "123.9060000")]
          : [],
      };
    }
    routingRequested = true;
    throw new Error("OSRM must not receive ambiguous mall candidates");
  };

  await assert.rejects(
    mapRoute.fetchMapRoute({
      origin: "Known origin",
      destination: query,
      confirmedCoordinates: { origin: { lat: 10.32, lon: 123.94 } },
    }, { fetchImpl, cache: false, nominatimIntervalMs: 0 }),
    (error) => {
      assert.equal(error.code, "place_ambiguous");
      assert.deepEqual(error.details.unresolvedEndpoints, ["destination"]);
      assert.equal(error.details.candidateMatches.destination.length, 2);
      return true;
    },
  );
  assert.deepEqual(requestedQueries, [searchQuery, "Ayala Center Cebu mall, Cebu"]);
  assert.equal(routingRequested, false);
});

test("does not route a center request to a same-name parking feature", async () => {
  const query = "Ayala Center Cebu, Cebu City, Cebu";
  const searchQuery = "Ayala Center Cebu mall, Cebu City, Cebu";
  const requestedQueries = [];
  let routingRequested = false;
  const fetchImpl = async (input) => {
    const url = new URL(input);
    if (url.hostname === "nominatim.openstreetmap.org") {
      const requestedQuery = url.searchParams.get("q");
      requestedQueries.push(requestedQuery);
      return {
        ok: true,
        status: 200,
        json: async () => requestedQuery === searchQuery
          ? [{
              lat: "10.3170738",
              lon: "123.9057435",
              name: "Ayala Center Cebu",
              display_name: "Ayala Center Cebu, Cebu City, Cebu, Philippines",
              type: "parking",
              addresstype: "amenity",
              address: { amenity: "Ayala Center Cebu", city: "Cebu City", country: "Philippines" },
            }]
          : [],
      };
    }
    routingRequested = true;
    throw new Error("OSRM must not receive a parking feature as the shopping center");
  };

  await assert.rejects(
    mapRoute.fetchMapRoute({
      origin: "Known origin",
      destination: query,
      confirmedCoordinates: { origin: { lat: 10.32, lon: 123.94 } },
    }, { fetchImpl, cache: false, nominatimIntervalMs: 0 }),
    (error) => {
      assert.equal(error.code, "place_not_found");
      assert.deepEqual(error.details.unresolvedEndpoints, ["destination"]);
      return true;
    },
  );
  assert.deepEqual(requestedQueries, [searchQuery, "Ayala Center Cebu mall, Cebu"]);
  assert.equal(routingRequested, false);
});

test("resolves a city hall returned under its local name and proceeds to routing", async () => {
  const requestedQueries = [];
  let routingRequested = false;
  const fetchImpl = async (input) => {
    const url = new URL(input);
    if (url.hostname === "nominatim.openstreetmap.org") {
      const query = url.searchParams.get("q");
      requestedQueries.push(query);
      const result = query === "Mandaue City Hall"
        ? {
            lat: "10.3274247",
            lon: "123.9433220",
            name: "Mandaue Presidencia",
            display_name: "Mandaue Presidencia, P. Burgos Street, Centro, Mandaue, Central Visayas, Philippines",
            type: "townhall",
            class: "amenity",
            addresstype: "amenity",
            address: {
              amenity: "Mandaue Presidencia",
              road: "P. Burgos Street",
              suburb: "Centro",
              city: "Mandaue",
              region: "Central Visayas",
              country: "Philippines",
            },
          }
        : query === "Ayala Center Cebu mall"
          ? {
              lat: "10.3181160",
              lon: "123.9048331",
              name: "Ayala Center Cebu",
              display_name: "Ayala Center Cebu, Cardinal Rosales Avenue, Cebu City, Philippines",
              type: "mall",
              class: "shop",
              addresstype: "shop",
              address: { shop: "Ayala Center Cebu", road: "Cardinal Rosales Avenue", city: "Cebu City", country: "Philippines" },
            }
          : null;
      return { ok: true, status: 200, json: async () => result ? [result] : [] };
    }
    routingRequested = true;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        code: "Ok",
        routes: [{
          distance: 20_000,
          duration: 2_400,
          geometry: { type: "LineString", coordinates: [[123.943322, 10.3274247], [123.9048331, 10.318116]] },
          legs: [],
        }],
      }),
    };
  };

  const route = await mapRoute.fetchMapRoute(
    { origin: "Mandaue City Hall", destination: "Ayala Center Cebu", mode: "driving" },
    { fetchImpl, cache: false, nominatimIntervalMs: 0 },
  );

  assert.deepEqual(requestedQueries, ["Mandaue City Hall", "Ayala Center Cebu mall"]);
  assert.equal(route.origin.label, "Mandaue Presidencia, P. Burgos Street, Centro, Mandaue, Central Visayas, Philippines");
  assert.deepEqual([route.origin.lat, route.origin.lon], [10.3274247, 123.943322]);
  assert.deepEqual([route.destination.lat, route.destination.lon], [10.318116, 123.9048331]);
  assert.equal(route.roadDistanceMeters, 20_000);
  assert.equal(routingRequested, true);
});

test("does not treat locality words in a named hospital as requested localities", async () => {
  await assertPlaceQueryResolved({
    query: "Mandaue City Hospital, A.S. Fortuna Road, Mandaue City",
    result: {
      lat: "10.34",
      lon: "123.93",
      name: "Mandaue City Hospital",
      display_name: "Mandaue City Hospital, A.S. Fortuna Road, Mandaue City, Cebu, Philippines",
      type: "hospital",
      class: "amenity",
      addresstype: "hospital",
      address: { road: "A.S. Fortuna Road", city: "Mandaue City", country: "Philippines" },
    },
  });
});

test("still resolves the exact road result for a street-only query", async () => {
  await assertPlaceQueryResolved({
    query: "Sacris Road, Mandaue City",
    result: {
      lat: "10.34",
      lon: "123.93",
      name: "Sacris Road",
      display_name: "Sacris Road, Mandaue City, Cebu, Philippines",
      type: "residential",
      class: "highway",
      addresstype: "road",
      address: { road: "Sacris Road", city: "Mandaue City", country: "Philippines" },
    },
  });
});

test("still resolves a correctly named POI when its street and locality match", async () => {
  await assertPlaceQueryResolved({
    query: "Clinica Prime Oakridge, A.S. Fortuna St., Mandaue City",
    result: {
      lat: "10.34",
      lon: "123.93",
      name: "Clinica Prime Oakridge",
      display_name: "Clinica Prime Oakridge, A.S. Fortuna Street, Mandaue City, Cebu, Philippines",
      type: "clinic",
      class: "amenity",
      addresstype: "clinic",
      address: { road: "A.S. Fortuna Street", city: "Mandaue City", country: "Philippines" },
    },
  });
});

test("requires a locality query to resolve to the locality rather than a POI inside it", async () => {
  let routingRequested = false;
  const fetchImpl = async (input) => {
    const url = new URL(input);
    if (url.hostname === "nominatim.openstreetmap.org") {
      if (url.searchParams.get("q") === "Mandaue City") {
        return {
          ok: true,
          json: async () => [{
            lat: "10.321",
            lon: "123.941",
            name: "Unrelated Clinic",
            display_name: "Unrelated Clinic, Mandaue City, Cebu, Philippines",
            type: "clinic",
            class: "amenity",
            addresstype: "amenity",
            address: { city: "Mandaue", country: "Philippines" },
          }],
        };
      }
      return {
        ok: true,
        json: async () => [{
          lat: "10.335",
          lon: "123.94",
          name: "Sacris Road",
          display_name: "Sacris Road, Mandaue City, Cebu, Philippines",
          type: "residential",
          class: "highway",
          addresstype: "road",
          address: { road: "Sacris Road", city: "Mandaue" },
        }],
      };
    }
    routingRequested = true;
    throw new Error("OSRM must not receive an unrelated locality result");
  };

  await assert.rejects(
    mapRoute.fetchMapRoute({ origin: "Mandaue City", destination: "Sacris Road" }, {
      fetchImpl,
      cache: false,
      nominatimIntervalMs: 0,
    }),
    (error) => {
      assert.equal(error.code, "place_not_found");
      assert.deepEqual(error.details.unresolvedEndpoints, ["origin"]);
      return true;
    },
  );
  assert.equal(routingRequested, false);
});

test("resolves an airport road as a street when Nominatim returns the exact road", async () => {
  await assertPlaceQueryResolved({
    query: "Airport Road, Mandaue City",
    result: {
      lat: "10.34",
      lon: "123.93",
      name: "Airport Road",
      display_name: "Airport Road, Mandaue City, Cebu, Philippines",
      type: "residential",
      class: "highway",
      addresstype: "road",
      address: { road: "Airport Road", city: "Mandaue", country: "Philippines" },
    },
  });
});

test("does not resolve a street-only airport road query to an airport POI with the same name", async () => {
  await assertPlaceQueryUnresolved({
    query: "Airport Road, Mandaue City",
    result: {
      lat: "10.34",
      lon: "123.93",
      name: "Airport Road",
      display_name: "Airport Road, Mandaue City, Cebu, Philippines",
      type: "aerodrome",
      class: "aeroway",
      addresstype: "aerodrome",
      address: { road: "Airport Road", city: "Mandaue", country: "Philippines" },
    },
  });
});

test("does not confuse University of Cebu with a different university containing Cebu", async () => {
  await assertPlaceQueryUnresolved({
    query: "University of Cebu",
    result: {
      lat: "10.34",
      lon: "123.93",
      name: "Cebu Normal University",
      display_name: "Cebu Normal University, Cebu City, Philippines",
      type: "university",
      class: "amenity",
      addresstype: "university",
      address: { city: "Cebu City", country: "Philippines" },
    },
  });
});

test("matches explicit region qualifiers even without a locality descriptor", async () => {
  await assertPlaceQueryUnresolved({
    query: "Springfield City, Oregon",
    result: {
      lat: "44.05",
      lon: "-122.98",
      name: "Springfield",
      display_name: "Springfield, Washington, United States",
      type: "city",
      class: "place",
      addresstype: "city",
      address: { city: "Springfield", state: "Washington", country: "United States" },
    },
  });
});

test("matches a state qualifier only against state address fields", async () => {
  await assertPlaceQueryUnresolved({
    query: "Springfield, Washington State",
    result: {
      lat: "44.05",
      lon: "-122.98",
      name: "Springfield",
      display_name: "Springfield, Oregon, United States",
      type: "city",
      class: "place",
      addresstype: "city",
      address: {
        city: "Springfield",
        state: "Oregon",
        city_district: "Washington",
        country: "United States",
      },
    },
  });
});

test("does not match a short locality qualifier inside a longer state name", async () => {
  await assertPlaceQueryUnresolved({
    query: "Springfield, York",
    result: {
      lat: "42.10",
      lon: "-72.59",
      name: "Springfield",
      display_name: "Springfield, Massachusetts, United States",
      type: "city",
      class: "place",
      addresstype: "city",
      address: { city: "Springfield", state: "New York", country: "United States" },
    },
  });
});

test("does not route when multiple distinct geocoder candidates match a locality query", async () => {
  const query = "Springfield City";
  const matches = [
    {
      lat: "44.0462",
      lon: "-123.0220",
      name: "Springfield",
      display_name: "Springfield, Oregon, United States",
      type: "city",
      class: "place",
      addresstype: "city",
      address: { city: "Springfield", state: "Oregon", country: "United States" },
    },
    {
      lat: "42.1015",
      lon: "-72.5898",
      name: "Springfield",
      display_name: "Springfield, Massachusetts, United States",
      type: "city",
      class: "place",
      addresstype: "city",
      address: { city: "Springfield", state: "Massachusetts", country: "United States" },
    },
  ];
  let candidateLimit = null;
  let routingRequested = false;
  const fetchImpl = async (input) => {
    const url = new URL(input);
    if (url.hostname === "nominatim.openstreetmap.org") {
      candidateLimit = url.searchParams.get("limit");
      return {
        ok: true,
        json: async () => url.searchParams.get("q") === query
          ? matches
          : [{
              lat: "10.335",
              lon: "123.94",
              name: "Mandaue",
              display_name: "Mandaue City, Cebu, Philippines",
              type: "city",
              class: "place",
              addresstype: "city",
              address: { city: "Mandaue", country: "Philippines" },
            }],
      };
    }
    routingRequested = true;
    throw new Error("OSRM must not receive an ambiguous locality candidate");
  };

  await assert.rejects(
    mapRoute.fetchMapRoute({ origin: query, destination: "Mandaue City" }, {
      fetchImpl,
      cache: false,
      nominatimIntervalMs: 0,
    }),
    (error) => {
      assert.equal(error.code, "place_ambiguous");
      assert.deepEqual(error.details.unresolvedEndpoints, ["origin"]);
      assert.equal(error.details.candidateMatches.origin.length, 2);
      return true;
    },
  );
  assert.equal(candidateLimit, "5");
  assert.equal(routingRequested, false);
});

test("accepts a correctly typed and named airport result", async () => {
  await assertPlaceQueryResolved({
    query: "Mactan-Cebu International Airport, Lapu-Lapu City",
    result: {
      lat: "10.307",
      lon: "123.979",
      name: "Mactan-Cebu International Airport",
      display_name: "Mactan-Cebu International Airport, Lapu-Lapu City, Cebu, Philippines",
      type: "aerodrome",
      class: "aeroway",
      addresstype: "aerodrome",
      address: { city: "Lapu-Lapu City", province: "Cebu", country: "Philippines" },
    },
  });
});

test("accepts a correctly typed and named university result", async () => {
  await assertPlaceQueryResolved({
    query: "University of Cebu Main Campus, Cebu City",
    result: {
      lat: "10.326",
      lon: "123.905",
      name: "University of Cebu Main Campus",
      display_name: "University of Cebu Main Campus, Cebu City, Cebu, Philippines",
      type: "university",
      class: "amenity",
      addresstype: "university",
      address: { city: "Cebu City", province: "Cebu", country: "Philippines" },
    },
  });
});

test("requires every address locality, including the barangay before the city", async () => {
  await assertPlaceQueryUnresolved({
    query: "293 Sacris Road, Bakilid, Mandaue City",
    result: {
      lat: "10.34",
      lon: "123.93",
      name: "293 Sacris Road",
      display_name: "293 Sacris Road, Cabancalan, Mandaue City, Cebu, Philippines",
      type: "house",
      class: "place",
      addresstype: "house",
      address: {
        house_number: "293",
        road: "Sacris Road",
        barangay: "Cabancalan",
        city: "Mandaue City",
        country: "Philippines",
      },
    },
  });
});

test("requires an unmarked locality before the street to match the house address", async () => {
  await assertPlaceQueryUnresolved({
    query: "Bakilid, 293 Sacris Road, Mandaue City",
    result: {
      lat: "10.34",
      lon: "123.93",
      name: "293 Sacris Road",
      display_name: "293 Sacris Road, Cabancalan, Mandaue City, Cebu, Philippines",
      type: "house",
      class: "place",
      addresstype: "house",
      address: {
        house_number: "293",
        road: "Sacris Road",
        barangay: "Cabancalan",
        city: "Mandaue City",
        country: "Philippines",
      },
    },
  });
});

test("does not let display-name text override a conflicting structured street", async () => {
  await assertPlaceQueryUnresolved({
    query: "293 Sacris Road, Mandaue City",
    result: {
      lat: "10.34",
      lon: "123.93",
      name: "293 A.S. Fortuna Road",
      display_name: "293 A.S. Fortuna Road, Sacris Road, Mandaue City, Cebu, Philippines",
      type: "house",
      class: "place",
      addresstype: "house",
      address: {
        house_number: "293",
        road: "A.S. Fortuna Road",
        city: "Mandaue City",
        country: "Philippines",
      },
    },
  });
});

test("matches the DC abbreviation against District of Columbia", async () => {
  await assertPlaceQueryResolved({
    query: "Washington, DC",
    result: {
      lat: "38.9072",
      lon: "-77.0369",
      name: "Washington",
      display_name: "Washington, District of Columbia, United States",
      type: "city",
      class: "place",
      addresstype: "city",
      address: { city: "Washington", state: "District of Columbia", country: "United States" },
    },
  });
});

test("requires locality feature evidence when a bare query is also a city address value", async () => {
  let routingRequested = false;
  const fetchImpl = async (input) => {
    const url = new URL(input);
    if (url.hostname === "nominatim.openstreetmap.org") {
      if (url.searchParams.get("q") === "Mandaue") {
        return {
          ok: true,
          json: async () => [{
            lat: "10.321",
            lon: "123.941",
            name: "Mandaue",
            display_name: "Mandaue, Mandaue City, Cebu, Philippines",
            type: "clinic",
            class: "amenity",
            addresstype: "clinic",
            address: { city: "Mandaue", country: "Philippines" },
          }],
        };
      }
      return {
        ok: true,
        json: async () => [{
          lat: "10.335",
          lon: "123.94",
          name: "Mandaue City",
          display_name: "Mandaue City, Cebu, Philippines",
          type: "city",
          class: "place",
          addresstype: "city",
          address: { city: "Mandaue", country: "Philippines" },
        }],
      };
    }
    routingRequested = true;
    throw new Error("OSRM must not receive a same-named POI for a bare locality query");
  };

  await assert.rejects(
    mapRoute.fetchMapRoute({ origin: "Mandaue", destination: "Mandaue City" }, {
      fetchImpl,
      cache: false,
      nominatimIntervalMs: 0,
    }),
    (error) => {
      assert.equal(error.code, "place_not_found");
      assert.deepEqual(error.details.unresolvedEndpoints, ["origin"]);
      return true;
    },
  );
  assert.equal(routingRequested, false);
});

test("rejects a free-form named place that exactly matches a residential road result", async () => {
  await assertPlaceQueryUnresolved({
    query: "Harbor Point",
    result: {
      lat: "10.34",
      lon: "123.93",
      name: "Harbor Point",
      display_name: "Harbor Point, Mandaue City, Cebu, Philippines",
      type: "residential",
      class: "highway",
      addresstype: "road",
      address: { road: "Harbor Point", city: "Mandaue", country: "Philippines" },
    },
  });
});

test("does not treat the St in St Paul, Minnesota as a street suffix", async () => {
  await assertPlaceQueryUnresolved({
    query: "St Paul, Minnesota",
    result: {
      lat: "44.95",
      lon: "-93.09",
      name: "St Paul",
      display_name: "St Paul, Minnesota, United States",
      type: "clinic",
      class: "amenity",
      addresstype: "clinic",
      address: { city: "St Paul", state: "Minnesota", country: "United States" },
    },
  });
});

test("resolves a fitness-center result when its venue label contains 'mall'", async () => {
  await assertPlaceQueryResolved({
    query: "Anytime Fitness SM J Mall",
    result: {
      lat: "10.329",
      lon: "123.923",
      name: "Anytime Fitness SM J Mall",
      display_name: "Anytime Fitness SM J Mall, Mandaue City, Cebu, Philippines",
      type: "fitness_centre",
      class: "leisure",
      addresstype: "leisure",
      address: { city: "Mandaue City", province: "Cebu", country: "Philippines" },
    },
  });
});

test("rejects empty, null, and malformed Nominatim coordinates before routing", async () => {
  const malformedCoordinates = [
    ["", null],
    [" ", "123.94"],
    ["not-a-coordinate", "123.94"],
    ["10.335", null],
  ];

  for (const [lat, lon] of malformedCoordinates) {
    let routingRequested = false;
    const fetchImpl = async (input) => {
      const url = new URL(input);
      if (url.hostname === "nominatim.openstreetmap.org") {
        const isMandaue = url.searchParams.get("q") === "Mandaue City";
        return {
          ok: true,
          json: async () => [isMandaue
            ? {
                lat,
                lon,
                name: "Mandaue City",
                display_name: "Mandaue City, Cebu, Philippines",
                type: "city",
                class: "place",
                addresstype: "city",
                address: { city: "Mandaue", country: "Philippines" },
              }
            : {
                lat: "10.3157",
                lon: "123.8854",
                name: "Cebu City",
                display_name: "Cebu City, Cebu, Philippines",
                type: "city",
                class: "place",
                addresstype: "city",
                address: { city: "Cebu City", country: "Philippines" },
              }],
        };
      }
      routingRequested = true;
      return {
        ok: true,
        json: async () => ({
          code: "Ok",
          routes: [{
            distance: 1_000,
            duration: 180,
            geometry: { type: "LineString", coordinates: [[123.94, 10.335], [123.8854, 10.3157]] },
            legs: [],
          }],
        }),
      };
    };

    await assert.rejects(
      mapRoute.fetchMapRoute({ origin: "Mandaue City", destination: "Cebu City" }, {
        fetchImpl,
        cache: false,
        nominatimIntervalMs: 0,
      }),
      (error) => {
        assert.equal(error.code, "place_not_found");
        assert.deepEqual(error.details.unresolvedEndpoints, ["origin"]);
        return true;
      },
    );
    assert.equal(routingRequested, false);
  }
});
