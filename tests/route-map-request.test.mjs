import test from "node:test";
import assert from "node:assert/strict";

import { coordinatesForCurrentRoute, initialPinMapView, routeInputsMatch } from "../lib/route-map-request.mjs";
import * as routeMapRequest from "../lib/route-map-request.mjs";

test("uses confirmed coordinates only for the route inputs they belong to", () => {
  const coordinates = { origin: { lat: 10.321, lon: 123.941 } };
  const pending = { origin: "Old start", destination: "Same destination", coordinates };

  assert.deepEqual(coordinatesForCurrentRoute(pending, "Old start", "Same destination"), coordinates);
  assert.equal(coordinatesForCurrentRoute(pending, "New start", "Same destination"), null);
  assert.equal(coordinatesForCurrentRoute(pending, "Old start", "New destination"), null);
  assert.equal(coordinatesForCurrentRoute(null, "Old start", "Same destination"), null);
});

test("recognizes current-location origin labels without matching ordinary place names", () => {
  const isCurrentLocationOriginLabel = routeMapRequest.isCurrentLocationOriginLabel;
  assert.equal(typeof isCurrentLocationOriginLabel, "function");

  for (const label of ["Current location", "my current location", "Your location", "here", "where I am"]) {
    assert.equal(isCurrentLocationOriginLabel(label), true, label);
  }
  for (const label of ["Seattle, WA", "Current Location Park", "", null]) {
    assert.equal(isCurrentLocationOriginLabel(label), false, String(label));
  }
});

test("matches pin UI and confirmed state only to the exact route input pair", () => {
  const pinSession = { origin: "Old start", destination: "Old destination" };

  assert.equal(routeInputsMatch(pinSession, "Old start", "Old destination"), true);
  assert.equal(routeInputsMatch(pinSession, "New start", "Old destination"), false);
  assert.equal(routeInputsMatch(pinSession, "Old start", "New destination"), false);
  assert.equal(routeInputsMatch(null, "Old start", "Old destination"), false);
});

test("does not display a route result from a previous travel mode", () => {
  const session = { origin: "Start", destination: "End", mode: "driving" };

  assert.equal(routeInputsMatch(session, "Start", "End", "driving"), true);
  assert.equal(routeInputsMatch(session, "Start", "End", "walking"), false);
});

test("initializes the pin map at an existing draft coordinate", () => {
  assert.deepEqual(
    initialPinMapView(
      { lat: 10.335, lon: 123.94, zoom: 12 },
      { lat: 10.321, lon: 123.941 },
    ),
    { lat: 10.321, lon: 123.941, zoom: 12 },
  );
});

test("ignores invalid draft coordinates when choosing the initial pin map view", () => {
  const center = { lat: 10.335, lon: 123.94, zoom: 12 };

  assert.deepEqual(initialPinMapView(center, { lat: Number.NaN, lon: 123.941 }), center);
  assert.deepEqual(initialPinMapView(center, { lat: 91, lon: 123.941 }), center);
  assert.deepEqual(initialPinMapView(center, { lat: 10.321, lon: -181 }), center);
  assert.deepEqual(initialPinMapView(null, { lat: 91, lon: 0 }), { lat: 20, lon: 0, zoom: 2 });
});

test("rejects async route responses after input, mode, or request revision changes", () => {
  const captured = { origin: "Start A", destination: "End B", mode: "driving", revision: 4 };
  const matches = routeMapRequest.routeRequestContextMatches;

  assert.equal(typeof matches, "function");
  assert.equal(matches(captured, captured), true);
  assert.equal(matches(captured, { ...captured, origin: "Start C" }), false);
  assert.equal(matches(captured, { ...captured, destination: "End D" }), false);
  assert.equal(matches(captured, { ...captured, mode: "cycling" }), false);
  assert.equal(matches(captured, { ...captured, revision: 5 }), false);
});

test("only allows map pin placement while an endpoint is active", () => {
  const canPlacePin = routeMapRequest.canPlacePinFromMap;

  assert.equal(typeof canPlacePin, "function");
  assert.equal(canPlacePin(null), false);
  assert.equal(canPlacePin("origin"), true);
  assert.equal(canPlacePin("destination"), true);
});

test("only returns validated endpoint coordinates for map markers", () => {
  const markerPoint = routeMapRequest.endpointMarkerPoint;
  const resolved = { lat: 10.32, lon: 123.94 };
  const confirmed = { lat: 10.321, lon: 123.941 };

  assert.equal(typeof markerPoint, "function");
  assert.deepEqual(markerPoint({ lat: 91, lon: 123.941 }, resolved), {
    coordinates: resolved,
    confirmed: false,
  });
  assert.deepEqual(markerPoint(confirmed, { lat: 10.32, lon: -181 }), {
    coordinates: confirmed,
    confirmed: true,
  });
  assert.equal(markerPoint({ lat: Number.NaN, lon: 0 }, { lat: 0, lon: Infinity }), null);
});

test("does not reuse saved route, pin, or coordinate state after A to B to A inputs", () => {
  const matchesSession = routeMapRequest.routeSessionMatches;
  assert.equal(typeof matchesSession, "function");

  const initialContext = { origin: "Start A", destination: "End B", mode: "driving", revision: 4, generation: 0 };
  const routeSession = { ...initialContext, route: { distanceMeters: 1000 } };
  const pinSession = { origin: initialContext.origin, destination: initialContext.destination, generation: 0, details: {} };
  const coordinates = { origin: { lat: 10.321, lon: 123.941 } };
  const confirmedCoordinates = { ...pinSession, coordinates };
  const requestCoordinates = { ...pinSession, coordinates };
  const generationAtB = routeMapRequest.advanceRouteRequestGeneration(initialContext, {
    origin: "Start C",
    destination: "End B",
  });
  const generationAtA = routeMapRequest.advanceRouteRequestGeneration(
    { origin: "Start C", destination: "End B", generation: generationAtB },
    { origin: "Start A", destination: "End B" },
  );
  const currentContext = { ...initialContext, generation: generationAtA, revision: 5 };

  assert.equal(matchesSession(routeSession, currentContext, { matchMode: true, matchRevision: true }), false);
  assert.equal(matchesSession(pinSession, currentContext), false);
  assert.equal(routeMapRequest.coordinatesForCurrentRoute(confirmedCoordinates, "Start A", "End B", generationAtA), null);
  assert.equal(routeMapRequest.coordinatesForCurrentRoute(requestCoordinates, "Start A", "End B", generationAtA), null);
  assert.deepEqual(routeMapRequest.coordinatesForCurrentRoute(requestCoordinates, "Start A", "End B", 0), coordinates);
});

test("rejects a late response after the same route inputs return from A to B to A", () => {
  const firstA = {
    origin: "Start A",
    destination: "End B",
    mode: "driving",
    revision: 0,
    generation: 1,
  };
  const latestA = { ...firstA, generation: 3 };

  assert.equal(routeMapRequest.routeRequestContextMatches(firstA, latestA), false);
});

test("advances route request generation across committed A to B to A input changes", () => {
  const advanceGeneration = routeMapRequest.advanceRouteRequestGeneration;
  assert.equal(typeof advanceGeneration, "function");

  let current = { origin: "Start A", destination: "End B", generation: 0 };
  const generationAtB = advanceGeneration(current, { origin: "Start C", destination: "End B" });
  current = { origin: "Start C", destination: "End B", generation: generationAtB };
  const generationAtA = advanceGeneration(current, { origin: "Start A", destination: "End B" });
  const generationWithoutInputChange = advanceGeneration(
    { origin: "Start A", destination: "End B", generation: generationAtA },
    { origin: "Start A", destination: "End B" },
  );

  assert.equal(generationAtB, 1);
  assert.equal(generationAtA, 2);
  assert.equal(generationWithoutInputChange, 2);
});

test("builds a render context with a fresh generation for changed route inputs", () => {
  const current = {
    origin: "Start A",
    destination: "End B",
    mode: "driving",
    revision: 4,
    generation: 7,
  };
  const savedRoute = { ...current, route: { distanceMeters: 1_000 } };
  const contextAtB = routeMapRequest.routeContextForInputs(
    current,
    { origin: "Start C", destination: "End B" },
    "driving",
    4,
  );
  const contextAtA = routeMapRequest.routeContextForInputs(
    contextAtB,
    { origin: "Start A", destination: "End B" },
    "driving",
    4,
  );

  assert.equal(contextAtA.generation, 9);
  assert.equal(routeMapRequest.routeSessionMatches(savedRoute, contextAtA, {
    matchMode: true,
    matchRevision: true,
  }), false);
});
