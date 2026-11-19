import { fetchMapNearbyPlaces, parseMapNearbyRequest } from "./map-nearby-service.mjs";
import {
  fetchMapRouteBetweenResolvedPlaces,
  MapRouteError,
  resolveMapPlace,
} from "./map-route-service.mjs";
import { straightLineDistanceMeters } from "./location-metrics.mjs";
import { isCurrentLocationOriginLabel } from "./route-map-request.mjs";

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
  if (Object.keys(record).some((key) => !["origin", "center", "categories", "radiusMeters", "mode", "confirmedCoordinates"].includes(key))) return null;
  const origin = normalizePlace(record.origin);
  const center = normalizePlace(record.center);
  const mode = record.mode === undefined ? "driving" : record.mode;
  if (!origin || !center || typeof mode !== "string" || !ROUTE_MODES.has(mode)) return null;

  const currentLocationOrigin = isCurrentLocationOriginLabel(origin);
  const currentLocationCenter = isCurrentLocationOriginLabel(center);
  let confirmedCoordinates;
  if (currentLocationOrigin || currentLocationCenter) {
    const rawCoordinates = record.confirmedCoordinates;
    if (!rawCoordinates || typeof rawCoordinates !== "object" || Array.isArray(rawCoordinates)) return null;
    const coordinates = /** @type {Record<string, unknown>} */ (rawCoordinates);
    const entries = Object.entries(coordinates);
    if (
      entries.length === 0 ||
      entries.some(([key]) => !["origin", "center"].includes(key)) ||
      (currentLocationOrigin && !Object.hasOwn(coordinates, "origin")) ||
      (!currentLocationOrigin && Object.hasOwn(coordinates, "origin")) ||
      (currentLocationCenter && !Object.hasOwn(coordinates, "center")) ||
      (!currentLocationCenter && Object.hasOwn(coordinates, "center"))
    ) return null;

    confirmedCoordinates = {};
    for (const [endpoint, rawPoint] of entries) {
      if (!rawPoint || typeof rawPoint !== "object" || Array.isArray(rawPoint)) return null;
      const point = /** @type {Record<string, unknown>} */ (rawPoint);
      if (
        Object.keys(point).length !== 2 ||
        !Object.hasOwn(point, "lat") ||
        !Object.hasOwn(point, "lon") ||
        typeof point.lat !== "number" || !Number.isFinite(point.lat) || point.lat < -90 || point.lat > 90 ||
        typeof point.lon !== "number" || !Number.isFinite(point.lon) || point.lon < -180 || point.lon > 180
      ) return null;
      confirmedCoordinates[endpoint] = { lat: point.lat, lon: point.lon };
    }
  } else if (record.confirmedCoordinates !== undefined) {
    return null;
  }

  const nearbyRequest = parseMapNearbyRequest({
    center,
    categories: record.categories,
    ...(record.radiusMeters === undefined ? {} : { radiusMeters: record.radiusMeters }),
    ...(confirmedCoordinates?.center ? { confirmedCoordinates: { center: confirmedCoordinates.center } } : {}),
  });
  if (!nearbyRequest) return null;
  return {
    origin,
    ...nearbyRequest,
    mode,
    ...(confirmedCoordinates ? { confirmedCoordinates } : {}),
  };
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

  const confirmedCenter = request.confirmedCoordinates?.center;
  const nearby = await fetchMapNearbyPlaces({
    center: request.center,
    categories: request.categories,
    radiusMeters: request.radiusMeters,
    ...(confirmedCenter ? { confirmedCoordinates: { center: confirmedCenter } } : {}),
  }, options);
  const confirmedOrigin = request.confirmedCoordinates?.origin;
  const origin = confirmedOrigin
    ? {
        label: `User-confirmed pin for ${request.origin}`.slice(0, 240),
        lat: confirmedOrigin.lat,
        lon: confirmedOrigin.lon,
        source: "map_pin",
        resolutionState: "USER_CONFIRMED",
        userConfirmed: true,
      }
    : await resolveMapPlace(request.origin, {
        fetchImpl: options.fetchImpl,
        cache: options.cache !== false,
        nominatimIntervalMs: options.nominatimIntervalMs,
      });
  const routeOptions = confirmedOrigin || confirmedCenter ? { ...options, cache: false } : options;
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
      const route = await fetchMapRouteBetweenResolvedPlaces(origin, destination, request.mode, routeOptions);
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
