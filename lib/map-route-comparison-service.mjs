import { fetchMapNearbyPlaces, parseMapNearbyRequest } from "./map-nearby-service.mjs";
import {
  fetchMapRouteBetweenResolvedPlaces,
  MapRouteError,
  resolveMapPlace,
} from "./map-route-service.mjs";
import { straightLineDistanceMeters } from "./location-metrics.mjs";

const ROUTE_MODES = new Set(["driving", "walking", "cycling"]);
const MAX_ROUTE_CONCURRENCY = 4;
const MAX_CANDIDATES = 40;

function normalizePlace(value) {
  if (typeof value !== "string") return null;
  const place = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return place.length > 0 && place.length <= 160 ? place : null;
}

export function parseMapRouteComparisonRequest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value;
  if (Object.keys(record).some((key) => !["origin", "center", "categories", "radiusMeters", "mode"].includes(key))) return null;
  const origin = normalizePlace(record.origin);
  const nearbyRequest = parseMapNearbyRequest({
    center: record.center,
    categories: record.categories,
    ...(record.radiusMeters === undefined ? {} : { radiusMeters: record.radiusMeters }),
  });
  const mode = record.mode === undefined ? "driving" : record.mode;
  if (!origin || !nearbyRequest || typeof mode !== "string" || !ROUTE_MODES.has(mode)) return null;
  return { origin, ...nearbyRequest, mode };
}

function withConcurrency(items, concurrency, task) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await task(items[index]);
    }
  });
  return Promise.all(workers).then(() => results);
}

function failureFor(error) {
  if (error instanceof MapRouteError) {
    return { code: error.code, message: error.message };
  }
  return {
    code: "map_provider_unavailable",
    message: "The route provider could not calculate this candidate.",
  };
}

/**
 * Search nearby candidates, resolve the route origin once, and route every returned candidate
 * using its exact Photon coordinates. Failed routes remain in the result with an explicit reason.
 * @param {unknown} value
 * @param {{fetchImpl?: typeof fetch, cache?: boolean, nominatimIntervalMs?: number, photonIntervalMs?: number, photonEndpoint?: string}} [options]
 */
export async function fetchMapRouteComparison(value, options = {}) {
  const request = parseMapRouteComparisonRequest(value);
  if (!request) {
    throw new MapRouteError("invalid_request", "The route-comparison request was not valid.", 400);
  }

  const nearby = await fetchMapNearbyPlaces({
    center: request.center,
    categories: request.categories,
    radiusMeters: request.radiusMeters,
  }, options);
  const origin = await resolveMapPlace(request.origin, {
    fetchImpl: options.fetchImpl,
    cache: options.cache !== false,
    nominatimIntervalMs: options.nominatimIntervalMs,
  });
  const candidates = nearby.places.slice(0, MAX_CANDIDATES);
  const routed = await withConcurrency(candidates, MAX_ROUTE_CONCURRENCY, async (candidate) => {
    const destination = {
      label: candidate.name,
      lat: candidate.lat,
      lon: candidate.lon,
      source: "photon",
      resolutionState: "RESOLVED",
      userConfirmed: false,
    };
    const straightLine = straightLineDistanceMeters(origin, destination);
    try {
      const route = await fetchMapRouteBetweenResolvedPlaces(origin, destination, request.mode, options);
      return {
        id: candidate.id,
        name: candidate.name,
        address: candidate.address,
        categories: candidate.categories,
        lat: candidate.lat,
        lon: candidate.lon,
        straightLineDistanceMeters: route.straightLineDistanceMeters,
        roadDistanceMeters: route.roadDistanceMeters,
        estimatedTravelTimeSeconds: route.estimatedTravelTimeSeconds,
        geometry: route.geometry,
        resolutionState: "ROUTE_VALIDATED",
        routeState: "ROUTE_VALIDATED",
        failureReason: null,
      };
    } catch (error) {
      const failure = failureFor(error);
      return {
        id: candidate.id,
        name: candidate.name,
        address: candidate.address,
        categories: candidate.categories,
        lat: candidate.lat,
        lon: candidate.lon,
        straightLineDistanceMeters: straightLine === null ? null : Math.round(straightLine),
        roadDistanceMeters: null,
        estimatedTravelTimeSeconds: null,
        geometry: null,
        resolutionState: "RESOLVED",
        routeState: "FAILED",
        failureReason: failure.message,
        failureCode: failure.code,
      };
    }
  });

  const routes = routed.sort((left, right) => {
    if (left.routeState !== right.routeState) return left.routeState === "ROUTE_VALIDATED" ? -1 : 1;
    if (left.routeState === "ROUTE_VALIDATED" && right.routeState === "ROUTE_VALIDATED") {
      return left.roadDistanceMeters - right.roadDistanceMeters || left.name.localeCompare(right.name);
    }
    return (left.straightLineDistanceMeters ?? Number.POSITIVE_INFINITY) -
      (right.straightLineDistanceMeters ?? Number.POSITIVE_INFINITY) || left.name.localeCompare(right.name);
  }).map((route, index) => ({
    ...route,
    rank: route.routeState === "ROUTE_VALIDATED" ? index + 1 : null,
  }));

  return {
    origin,
    center: nearby.center,
    categories: nearby.categories,
    radiusMeters: nearby.radiusMeters,
    mode: request.mode,
    candidateCount: nearby.places.length,
    truncated: nearby.truncated === true,
    routes,
  };
}
