const MAP_ROUTE_MODES = new Set(["driving", "walking", "cycling"]);
const OSRM_PROFILES = Object.freeze({ driving: "driving", walking: "foot", cycling: "bike" });
const NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search";
const OSRM_ROUTE_URL = "https://router.project-osrm.org/route/v1/";
const NOMINATIM_INTERVAL_MS = 1_000;
const CACHE_TTL_MS = 5 * 60 * 1_000;
const MAX_CACHE_ENTRIES = 120;
const MAX_ROUTE_POINTS = 1_500;
const MAX_DIRECTIONS_STEPS = 60;
const MAP_USER_AGENT =
  process.env.MAPS_USER_AGENT?.trim() || "CartmanAI/1.0 (https://homeserver.tailc6938f.ts.net)";

const geocodeCache = new Map();
const routeCache = new Map();
let nominatimQueue = Promise.resolve();
let lastNominatimRequestAt = 0;

function normalizePlace(value) {
  if (typeof value !== "string") return null;
  const place = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return place.length > 0 && place.length <= 160 ? place : null;
}

/**
 * @param {unknown} value
 * @returns {{origin: string, destination: string, mode: "driving" | "walking" | "cycling"} | null}
 */
export function parseMapRouteRequest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = /** @type {Record<string, unknown>} */ (value);
  if (Object.keys(record).some((key) => !["origin", "destination", "mode"].includes(key))) return null;

  const origin = normalizePlace(record.origin);
  const destination = normalizePlace(record.destination);
  const mode = record.mode === undefined ? "driving" : record.mode;
  if (!origin || !destination || typeof mode !== "string" || !MAP_ROUTE_MODES.has(mode)) return null;

  return { origin, destination, mode };
}

export class MapRouteError extends Error {
  /** @param {string} code @param {string} message @param {number} status */
  constructor(code, message, status) {
    super(message);
    this.name = "MapRouteError";
    this.code = code;
    this.status = status;
  }
}

function cacheRead(cache, key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

function cacheWrite(cache, key, value) {
  if (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value);
  cache.delete(key);
  cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value });
}

async function withNominatimSlot(task, intervalMs) {
  const previous = nominatimQueue;
  let release;
  nominatimQueue = new Promise((resolve) => {
    release = resolve;
  });
  await previous;

  try {
    const waitMs = Math.max(0, lastNominatimRequestAt + intervalMs - Date.now());
    if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
    lastNominatimRequestAt = Date.now();
    return await task();
  } finally {
    release();
  }
}

async function requestJson(url, fetchImpl) {
  let response;
  try {
    response = await fetchImpl(url.toString(), {
      headers: {
        Accept: "application/json",
        "User-Agent": MAP_USER_AGENT,
      },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new MapRouteError("map_provider_unavailable", "Map routing is unavailable right now.", 502);
  }

  if (!response.ok) {
    throw new MapRouteError("map_provider_unavailable", "Map routing is unavailable right now.", 502);
  }
  try {
    return await response.json();
  } catch {
    throw new MapRouteError("map_provider_unavailable", "Map routing is unavailable right now.", 502);
  }
}

function isCoordinate(lat, lon) {
  return Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

async function geocodePlace(query, fetchImpl, intervalMs, useCache) {
  const cacheKey = query.toLocaleLowerCase();
  if (useCache) {
    const cached = cacheRead(geocodeCache, cacheKey);
    if (cached) return cached;
  }

  const url = new URL(NOMINATIM_SEARCH_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  const results = await withNominatimSlot(() => requestJson(url, fetchImpl), intervalMs);
  const result = Array.isArray(results) ? results[0] : null;
  const lat = Number(result?.lat);
  const lon = Number(result?.lon);
  if (!result || !isCoordinate(lat, lon)) {
    throw new MapRouteError("place_not_found", "Could not find one of those places. Try a more specific city or address.", 422);
  }

  const place = {
    label: typeof result.display_name === "string" ? result.display_name.slice(0, 240) : query,
    lat,
    lon,
  };
  if (useCache) cacheWrite(geocodeCache, cacheKey, place);
  return place;
}

function validMetric(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function normalizeGeometry(geometry) {
  if (geometry?.type !== "LineString" || !Array.isArray(geometry.coordinates)) return null;
  const points = geometry.coordinates
    .filter((point) => Array.isArray(point) && point.length >= 2 && isCoordinate(Number(point[1]), Number(point[0])))
    .map((point) => [Number(point[1]), Number(point[0])]);
  if (points.length < 2) return null;
  if (points.length <= MAX_ROUTE_POINTS) return points;

  const stride = Math.ceil((points.length - 1) / (MAX_ROUTE_POINTS - 1));
  const sampled = points.filter((_, index) => index % stride === 0);
  if (sampled.at(-1)?.[0] !== points.at(-1)?.[0] || sampled.at(-1)?.[1] !== points.at(-1)?.[1]) {
    sampled.push(points.at(-1));
  }
  return sampled;
}

function buildInstruction(step) {
  const maneuver = step?.maneuver ?? {};
  const type = typeof maneuver.type === "string" ? maneuver.type : "";
  const modifier = typeof maneuver.modifier === "string" ? maneuver.modifier : "";
  const name = typeof step?.name === "string" ? step.name.trim().slice(0, 120) : "";

  if (type === "depart") return name ? `Start on ${name}` : "Start the route";
  if (type === "arrive") return "Arrive at your destination";
  if (type === "turn") return `Turn ${modifier || "ahead"}${name ? ` onto ${name}` : ""}`;
  if (type === "merge") return `Merge ${modifier}${name ? ` onto ${name}` : ""}`.trim();
  if (type === "fork") return `Take the ${modifier || "next"} fork${name ? ` onto ${name}` : ""}`;
  if (type === "roundabout" || type === "rotary") return name ? `Continue through ${name}` : "Continue through the roundabout";
  if (name) return `Continue on ${name}`;
  return "Continue along the route";
}

function normalizeSteps(legs) {
  if (!Array.isArray(legs)) return [];
  const steps = [];
  for (const leg of legs) {
    if (!Array.isArray(leg?.steps)) continue;
    for (const step of leg.steps) {
      if (steps.length >= MAX_DIRECTIONS_STEPS) return steps;
      if (!validMetric(step?.distance)) continue;
      steps.push({
        instruction: buildInstruction(step),
        distanceMeters: Math.round(step.distance),
      });
    }
  }
  return steps;
}

/**
 * Resolve place names and fetch a road route from the public OSM/Nominatim and OSRM services.
 * @param {unknown} value
 * @param {{fetchImpl?: typeof fetch, cache?: boolean, nominatimIntervalMs?: number}} [options]
 */
export async function fetchMapRoute(value, options = {}) {
  const request = parseMapRouteRequest(value);
  if (!request) throw new MapRouteError("invalid_request", "The route request was not valid.", 400);

  const fetchImpl = options.fetchImpl ?? fetch;
  const useCache = options.cache !== false;
  const intervalMs = Math.max(0, options.nominatimIntervalMs ?? NOMINATIM_INTERVAL_MS);
  const routeKey = `${request.origin.toLocaleLowerCase()}|${request.destination.toLocaleLowerCase()}|${request.mode}`;
  if (useCache) {
    const cached = cacheRead(routeCache, routeKey);
    if (cached) return cached;
  }

  const origin = await geocodePlace(request.origin, fetchImpl, intervalMs, useCache);
  const destination = await geocodePlace(request.destination, fetchImpl, intervalMs, useCache);
  const profile = OSRM_PROFILES[request.mode];
  const url = new URL(`${profile}/${origin.lon},${origin.lat};${destination.lon},${destination.lat}`, OSRM_ROUTE_URL);
  url.searchParams.set("overview", "full");
  url.searchParams.set("geometries", "geojson");
  url.searchParams.set("steps", "true");

  const response = await requestJson(url, fetchImpl);
  const route = response?.code === "Ok" && Array.isArray(response.routes) ? response.routes[0] : null;
  if (!route || !validMetric(route.distance) || !validMetric(route.duration)) {
    throw new MapRouteError("route_unavailable", "No route was found for those places and travel mode.", 422);
  }
  const geometry = normalizeGeometry(route.geometry);
  if (!geometry) {
    throw new MapRouteError("route_unavailable", "No route was found for those places and travel mode.", 422);
  }

  const result = {
    origin,
    destination,
    mode: request.mode,
    distanceMeters: Math.round(route.distance),
    durationSeconds: Math.round(route.duration),
    geometry,
    steps: normalizeSteps(route.legs),
  };
  if (useCache) cacheWrite(routeCache, routeKey, result);
  return result;
}
