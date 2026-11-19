import test from "node:test";
import assert from "node:assert/strict";

const nearbyPlaces = await import("../lib/map-nearby-service.mjs").catch((error) => {
  if (error?.code === "ERR_MODULE_NOT_FOUND") return {};
  throw error;
});

test("validates and normalizes nearby-place searches", () => {
  assert.equal(typeof nearbyPlaces.parseMapNearbyRequest, "function");
  assert.deepEqual(
    nearbyPlaces.parseMapNearbyRequest({
      center: "  Mandaue\nCity Hall, Cebu ",
      categories: ["gym", "grocery"],
      radiusMeters: 1800,
    }),
    { center: "Mandaue City Hall, Cebu", categories: ["gym", "grocery"], radiusMeters: 1800 },
  );
  assert.deepEqual(
    nearbyPlaces.parseMapNearbyRequest({ center: "Mandaue City", categories: ["gym"] }),
    { center: "Mandaue City", categories: ["gym"], radiusMeters: 500 },
  );
  assert.equal(nearbyPlaces.parseMapNearbyRequest({ center: "", categories: ["gym"] }), null);
  assert.equal(nearbyPlaces.parseMapNearbyRequest({ center: "Mandaue", categories: ["unknown"] }), null);
  assert.equal(nearbyPlaces.parseMapNearbyRequest({ center: "Mandaue", categories: ["gym", "gym"] }), null);
  assert.equal(nearbyPlaces.parseMapNearbyRequest({ center: "Mandaue", categories: ["gym"], radiusMeters: 5001 }), null);
  assert.equal(nearbyPlaces.parseMapNearbyRequest({ center: "Mandaue", categories: ["gym"], html: "<script>" }), null);
});

test("requires confirmed coordinates for a current-location nearby center only", () => {
  const point = { lat: 10.321, lon: 123.941 };
  const request = {
    center: "Current location",
    categories: ["store"],
    confirmedCoordinates: { center: point },
  };
  assert.equal(nearbyPlaces.parseMapNearbyRequest({ center: "Current location", categories: ["store"] }), null);
  assert.deepEqual(nearbyPlaces.parseMapNearbyRequest(request), {
    center: "Current location",
    categories: ["store"],
    radiusMeters: 500,
    confirmedCoordinates: { center: point },
  });
  assert.equal(nearbyPlaces.parseMapNearbyRequest({ ...request, center: "Mandaue City Hall, Cebu" }), null);
  assert.equal(nearbyPlaces.parseMapNearbyRequest({
    ...request,
    confirmedCoordinates: { center: { lat: 91, lon: point.lon } },
  }), null);
  assert.equal(nearbyPlaces.parseMapNearbyRequest({
    ...request,
    confirmedCoordinates: { center: { ...point, accuracyMeters: 10 } },
  }), null);
  assert.equal(nearbyPlaces.parseMapNearbyRequest({
    ...request,
    confirmedCoordinates: { origin: point },
  }), null);
});

test("geocodes the named center and returns named nearby OSM places once", async () => {
  assert.equal(typeof nearbyPlaces.fetchMapNearbyPlaces, "function");
  const requests = [];
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(String(input));
    requests.push({ url, init });
    if (url.hostname === "nominatim.openstreetmap.org") {
      return {
        ok: true,
        json: async () => [{
          lat: "10.323",
          lon: "123.922",
          name: "Mandaue City Hall",
          display_name: "Mandaue City Hall, Mandaue, Cebu, Philippines",
          type: "townhall",
          class: "amenity",
          addresstype: "amenity",
          address: { city: "Mandaue", province: "Cebu" },
        }],
      };
    }
    if (url.hostname === "photon.test") {
      const tag = url.searchParams.get("osm_tag");
      const features = tag === "leisure:fitness_centre"
        ? [
            {
              type: "Feature",
              properties: { name: "Iron Gym", osm_key: "leisure", osm_value: "fitness_centre", osm_type: "N", osm_id: 101, street: "Market Road" },
              geometry: { type: "Point", coordinates: [123.921, 10.324] },
            },
            {
              type: "Feature",
              properties: { name: "Unnamed Gym", osm_key: "leisure", osm_value: "fitness_centre", osm_type: "N", osm_id: 303 },
              geometry: { type: "Point", coordinates: [123.326, 10.326] },
            },
          ]
        : [
            {
              type: "Feature",
              properties: { name: "Town Market", osm_key: "shop", osm_value: "supermarket", osm_type: "W", osm_id: 202, street: "Market Road" },
              geometry: { type: "Point", coordinates: [123.923, 10.325] },
            },
          ];
      return { ok: true, json: async () => ({ type: "FeatureCollection", features }) };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };

  const result = await nearbyPlaces.fetchMapNearbyPlaces(
    { center: "Mandaue City Hall, Cebu", categories: ["gym", "grocery"], radiusMeters: 1500 },
    { fetchImpl, cache: false, nominatimIntervalMs: 0, photonIntervalMs: 0, photonEndpoint: "https://photon.test/reverse" },
  );

  assert.deepEqual(result.center, {
    label: "Mandaue City Hall, Mandaue, Cebu, Philippines",
    lat: 10.323,
    lon: 123.922,
    source: "nominatim",
    resolutionState: "RESOLVED",
    userConfirmed: false,
  });
  assert.ok(result.places.every((place) => place.source === "photon" && place.resolutionState === "RESOLVED" && place.userConfirmed === false));
  assert.deepEqual(result.places.map(({ id, name, categories }) => ({ id, name, categories })), [
    { id: "N/101", name: "Iron Gym", categories: ["gym"] },
    { id: "W/202", name: "Town Market", categories: ["grocery"] },
  ]);
  assert.ok(result.places.every((place) => place.straightLineDistanceMeters > 0 && place.straightLineDistanceMeters < 1500));
  assert.equal(requests.filter(({ url }) => url.hostname === "nominatim.openstreetmap.org").length, 1);
  const photonRequests = requests.filter(({ url }) => url.hostname === "photon.test");
  assert.equal(photonRequests.length, 2);
  const photonTags = photonRequests.map(({ url }) => url.searchParams.get("osm_tag"));
  assert.deepEqual(photonTags, ["leisure:fitness_centre", "shop"]);
  for (const { url } of photonRequests) {
    assert.equal(url.searchParams.get("lat"), "10.323");
    assert.equal(url.searchParams.get("lon"), "123.922");
    assert.equal(url.searchParams.get("radius"), "1.5");
    assert.equal(url.searchParams.get("limit"), "50");
  }
});

test("uses confirmed current-location coordinates directly and bypasses nearby caches", async () => {
  const point = { lat: 10.321, lon: 123.941 };
  const requests = [];
  const fetchImpl = async (input) => {
    const url = new URL(String(input));
    requests.push(url);
    if (url.hostname === "nominatim.openstreetmap.org") {
      return { ok: true, json: async () => [] };
    }
    if (url.hostname === "photon.test") {
      return { ok: true, json: async () => ({ features: [{
        type: "Feature",
        properties: { name: "Nearby Market", osm_key: "shop", osm_value: "supermarket", osm_type: "N", osm_id: 8201 },
        geometry: { type: "Point", coordinates: [point.lon + 0.0001, point.lat + 0.0001] },
      }] }) };
    }
    throw new Error("Unexpected provider request");
  };
  const request = {
    center: "Current location",
    categories: ["store"],
    radiusMeters: 500,
    confirmedCoordinates: { center: point },
  };
  const options = { fetchImpl, cache: true, nominatimIntervalMs: 0, photonIntervalMs: 0, photonEndpoint: "https://photon.test/reverse" };

  const first = await nearbyPlaces.fetchMapNearbyPlaces(request, options);
  const second = await nearbyPlaces.fetchMapNearbyPlaces(request, options);

  const expectedCenter = {
    label: "User-confirmed pin for Current location",
    ...point,
    source: "map_pin",
    resolutionState: "USER_CONFIRMED",
    userConfirmed: true,
  };
  assert.deepEqual(first.center, expectedCenter);
  assert.deepEqual(second.center, expectedCenter);
  assert.equal(first.places[0].name, "Nearby Market");
  assert.equal(requests.filter((url) => url.hostname === "nominatim.openstreetmap.org").length, 0);
  const photonRequests = requests.filter((url) => url.hostname === "photon.test");
  assert.equal(photonRequests.length, 2);
  for (const url of photonRequests) {
    assert.equal(url.searchParams.get("lat"), String(point.lat));
    assert.equal(url.searchParams.get("lon"), String(point.lon));
  }
});

test("preserves the requested category order when a nearby search is cached", async () => {
  const fetchImpl = async (input) => {
    const url = new URL(String(input));
    if (url.hostname === "nominatim.openstreetmap.org") {
      return { ok: true, json: async () => [{
        lat: "10.323",
        lon: "123.922",
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
        {
          type: "Feature",
          properties: { name: "Cache Gym", osm_key: "leisure", osm_value: "fitness_centre", osm_type: "N", osm_id: 9101 },
          geometry: { type: "Point", coordinates: [123.922, 10.324] },
        },
        {
          type: "Feature",
          properties: { name: "Cache Store", osm_key: "shop", osm_value: "supermarket", osm_type: "N", osm_id: 9102 },
          geometry: { type: "Point", coordinates: [123.922, 10.325] },
        },
      ] }) };
    }
    throw new Error("Unexpected provider request");
  };
  const options = { fetchImpl, nominatimIntervalMs: 0, photonIntervalMs: 0, photonEndpoint: "https://photon.test/reverse" };
  const first = await nearbyPlaces.fetchMapNearbyPlaces(
    { center: "Mandaue City Hall, Cebu", categories: ["gym", "store"], radiusMeters: 1_500 },
    options,
  );
  const second = await nearbyPlaces.fetchMapNearbyPlaces(
    { center: "Mandaue City Hall, Cebu", categories: ["store", "gym"], radiusMeters: 1_500 },
    options,
  );

  assert.deepEqual(first.categories, ["gym", "store"]);
  assert.deepEqual(second.categories, ["store", "gym"]);
});

test("returns nearby distance as an explicitly straight-line metric", async () => {
  const center = { lat: 10.323, lon: 123.922 };
  const destination = {
    lat: center.lat + (1_250 / 6_371_000) * 180 / Math.PI,
    lon: center.lon,
  };
  const fetchImpl = async (input) => {
    const url = new URL(String(input));
    if (url.hostname === "nominatim.openstreetmap.org") {
      return { ok: true, json: async () => [{
        lat: String(center.lat),
        lon: String(center.lon),
        name: "Mandaue City Hall",
        display_name: "Mandaue City Hall, Mandaue, Cebu, Philippines",
        type: "townhall",
        class: "amenity",
        addresstype: "amenity",
        address: { city: "Mandaue", province: "Cebu", country: "Philippines" },
      }] };
    }
    if (url.hostname === "photon.test") {
      return { ok: true, json: async () => ({ features: [{
        type: "Feature",
        properties: { name: "Anytime Fitness SM J Mall", osm_key: "leisure", osm_value: "fitness_centre", osm_type: "N", osm_id: 101 },
        geometry: { type: "Point", coordinates: [destination.lon, destination.lat] },
      }] }) };
    }
    throw new Error("Unexpected provider request");
  };

  const result = await nearbyPlaces.fetchMapNearbyPlaces(
    { center: "Mandaue City Hall, Cebu", categories: ["gym"], radiusMeters: 1_500 },
    { fetchImpl, cache: false, nominatimIntervalMs: 0, photonIntervalMs: 0, photonEndpoint: "https://photon.test/reverse" },
  );

  assert.equal(result.places[0].straightLineDistanceMeters, 1_250);
  assert.equal(Object.hasOwn(result.places[0], "distanceMeters"), false);
});

test("reports when more nearby places were discovered than the response limit", async () => {
  const center = { lat: 10.323, lon: 123.922 };
  const features = Array.from({ length: 41 }, (_, index) => ({
    type: "Feature",
    properties: { name: `Gym ${index + 1}`, osm_key: "leisure", osm_value: "fitness_centre", osm_type: "N", osm_id: index + 1 },
    geometry: { type: "Point", coordinates: [center.lon, center.lat + index * 0.00001] },
  }));
  const fetchImpl = async (input) => {
    const url = new URL(String(input));
    if (url.hostname === "nominatim.openstreetmap.org") {
      return { ok: true, json: async () => [{
        lat: String(center.lat), lon: String(center.lon), name: "Mandaue City Hall",
        display_name: "Mandaue City Hall, Mandaue, Cebu, Philippines", type: "townhall", class: "amenity",
        addresstype: "amenity", address: { city: "Mandaue", province: "Cebu", country: "Philippines" },
      }] };
    }
    if (url.hostname === "photon.test") return { ok: true, json: async () => ({ features }) };
    throw new Error("Unexpected provider request");
  };

  const result = await nearbyPlaces.fetchMapNearbyPlaces(
    { center: "Mandaue City Hall, Cebu", categories: ["gym"], radiusMeters: 1_500 },
    { fetchImpl, cache: false, nominatimIntervalMs: 0, photonIntervalMs: 0, photonEndpoint: "https://photon.test/reverse" },
  );

  assert.equal(result.places.length, 40);
  assert.equal(result.truncated, true);
});

test("spaces requests to the public Photon service by one second", async () => {
  assert.equal(typeof nearbyPlaces.fetchMapNearbyPlaces, "function");
  const photonRequestTimes = [];
  const fetchImpl = async (input) => {
    const url = new URL(String(input));
    if (url.hostname === "nominatim.openstreetmap.org") {
      return {
        ok: true,
        json: async () => [{
          lat: "10.323",
          lon: "123.922",
          name: "Mandaue City Hall",
          display_name: "Mandaue City Hall, Mandaue, Cebu, Philippines",
          type: "townhall",
          class: "amenity",
          addresstype: "amenity",
          address: { city: "Mandaue", province: "Cebu" },
        }],
      };
    }
    if (url.hostname === "photon.test") {
      photonRequestTimes.push(Date.now());
      return { ok: true, json: async () => ({ features: [] }) };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };

  await nearbyPlaces.fetchMapNearbyPlaces(
    { center: "Mandaue City Hall, Cebu", categories: ["gym", "grocery"], radiusMeters: 500 },
    { fetchImpl, cache: false, nominatimIntervalMs: 0, photonEndpoint: "https://photon.test/reverse" },
  );

  assert.equal(photonRequestTimes.length, 2);
  assert.ok(photonRequestTimes[1] - photonRequestTimes[0] >= 900);
});
