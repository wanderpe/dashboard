import assert from "node:assert/strict";
import test from "node:test";

import {
  latLonPointToMapLibre,
  latLonRouteToMapLibre,
} from "../lib/map-coordinate-adapter.mjs";

test("converts a latitude/longitude point to MapLibre longitude-latitude order", () => {
  assert.deepEqual(latLonPointToMapLibre({ lat: 40.7128, lon: -74.006 }), [-74.006, 40.7128]);
});

test("converts route geometry without mutating the API coordinates", () => {
  const latLonGeometry = [
    [37.7749, -122.4194],
    [37.775, -122.418],
  ];

  assert.deepEqual(latLonRouteToMapLibre(latLonGeometry), [
    [-122.4194, 37.7749],
    [-122.418, 37.775],
  ]);
  assert.deepEqual(latLonGeometry, [
    [37.7749, -122.4194],
    [37.775, -122.418],
  ]);
});
