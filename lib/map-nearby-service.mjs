import { MAP_NEARBY_CATEGORIES } from "./map-nearby-categories.mjs";
import { resolveMapPlace } from "./map-route-service.mjs";
import { isCurrentLocationOriginLabel } from "./route-map-request.mjs";
import { straightLineDistanceMeters as calculateStraightLineDistanceMeters } from "./location-metrics.mjs";

const DEFAULT_RADIUS_METERS = 500;
const MIN_RADIUS_METERS = 500;
const MAX_RADIUS_METERS = 5_000;
const MAX_CATEGORIES = 5;
const MAX_RESULTS = 40;
const PHOTON_RESULT_LIMIT = 50;
const CACHE_TTL_MS = 5 * 60_000;
const MAX_CACHE_ENTRIES = 150;
const PHOTON_REVERSE_URL = "https://photon.komoot.io/reverse";
const PHOTON_TIMEOUT_MS = 12_000;
// Serialize access to the public Photon demo service at a conservative 1 req/s.
const PHOTON_INTERVAL_MS = 1_000;
const MAP_USER_AGENT =
  process.env.MAPS_USER_AGENT?.trim() || "CartmanAI/1.0 (https://homeserver.tailc6938f.ts.net)";
const nearbyCache = new Map();
const photonCache = new Map();
let photonQueue = Promise.resolve();
let lastPhotonRequestAt = 0;

function normalizePlace(value) {
  if (typeof value !== "string") return null;
  const place = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return place.length > 0 && place.length <= 160 ? place : null;
}

function isCoordinate(lat, lon) {
  return Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

export function parseMapNearbyRequest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value;
  if (Object.keys(record).some((key) => !["center", "categories", "radiusMeters", "confirmedCoordinates"].includes(key))) return null;

  const center = normalizePlace(record.center);
  const categories = record.categories;
  const radiusMeters = record.radiusMeters === undefined ? DEFAULT_RADIUS_METERS : record.radiusMeters;
  if (
    !center ||
    !Array.isArray(categories) ||
    categories.length < 1 ||
    categories.length > MAX_CATEGORIES ||
    categories.some((category) => typeof category !== "string" || !Object.hasOwn(MAP_NEARBY_CATEGORIES, category)) ||
    new Set(categories).size !== categories.length ||
    !Number.isInteger(radiusMeters) ||
    radiusMeters < MIN_RADIUS_METERS ||
    radiusMeters > MAX_RADIUS_METERS
  ) {
    return null;
  }

  const currentLocationCenter = isCurrentLocationOriginLabel(center);
  let confirmedCoordinates;
  if (currentLocationCenter) {
    const rawCoordinates = record.confirmedCoordinates;
    if (!rawCoordinates || typeof rawCoordinates !== "object" || Array.isArray(rawCoordinates)) return null;
    const coordinates = /** @type {Record<string, unknown>} */ (rawCoordinates);
    if (Object.keys(coordinates).length !== 1 || !Object.hasOwn(coordinates, "center")) return null;
    const point = coordinates.center;
    if (!point || typeof point !== "object" || Array.isArray(point)) return null;
    const values = /** @type {Record<string, unknown>} */ (point);
    if (
      Object.keys(values).length !== 2 ||
      !Object.hasOwn(values, "lat") ||
      !Object.hasOwn(values, "lon") ||
      !isCoordinate(values.lat, values.lon)
    ) return null;
    confirmedCoordinates = { center: { lat: values.lat, lon: values.lon } };
  } else if (record.confirmedCoordinates !== undefined) {
    return null;
  }

  return {
    center,
    categories: [...categories],
    radiusMeters,
    ...(confirmedCoordinates ? { confirmedCoordinates } : {}),
  };
}

export class MapNearbyError extends Error {
  constructor(code, message, status) {
    super(message);
    this.name = "MapNearbyError";
    this.code = code;
    this.status = status;
  }
}

function categoryMatches(category, properties) {
  const definition = MAP_NEARBY_CATEGORIES[category];
  if (properties.osm_key !== definition.photonKey) return false;
  return !definition.photonValues || definition.photonValues.includes(properties.osm_value);
}

function addressForProperties(properties) {
  return [properties.housenumber, properties.street, properties.district, properties.city]
    .filter((part) => typeof part === "string" && part.trim())
    .join(", ")
    .slice(0, 240) || null;
}

function normalizeFeatures(features, center, categories, radiusMeters) {
  if (!Array.isArray(features)) return [];
  const byId = new Map();
  for (const feature of features) {
    const coordinates = feature?.geometry?.coordinates;
    const properties = feature?.properties;
    if (!Array.isArray(coordinates) || !properties || typeof properties !== "object" || Array.isArray(properties)) continue;
    const lon = coordinates[0];
    const lat = coordinates[1];
    if (!isCoordinate(lat, lon)) continue;
    const name = typeof properties.name === "string" ? properties.name.trim().slice(0, 120) : "";
    if (!name) continue;

    const point = { lat, lon };
    const straightLineDistance = calculateStraightLineDistanceMeters(center, point);
    if (straightLineDistance === null || straightLineDistance > radiusMeters) continue;
    const matchedCategories = categories.filter((category) => categoryMatches(category, properties));
    if (matchedCategories.length === 0) continue;

    const rawId = properties.osm_id ?? feature.id;
    const osmType = typeof properties.osm_type === "string" ? properties.osm_type : "OSM";
    const id = rawId === undefined || rawId === null
      ? `${osmType}/${lat.toFixed(6)},${lon.toFixed(6)}/${name}`
      : `${osmType}/${rawId}`;
    const existing = byId.get(id);
    if (existing) {
      existing.categories = [...new Set([...existing.categories, ...matchedCategories])];
      continue;
    }
    byId.set(id, {
      id,
      name,
      lat,
      lon,
      source: "photon",
      resolutionState: "RESOLVED",
      userConfirmed: false,
      categories: matchedCategories,
      straightLineDistanceMeters: Math.round(straightLineDistance),
      address: addressForProperties(properties),
    });
  }

  return [...byId.values()]
    .sort((left, right) => left.straightLineDistanceMeters - right.straightLineDistanceMeters || left.name.localeCompare(right.name))
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

async function withPhotonSlot(task, intervalMs) {
  const previous = photonQueue;
  let release;
  photonQueue = new Promise((resolve) => {
    release = resolve;
  });
  await previous;

  try {
    const waitMs = Math.max(0, lastPhotonRequestAt + intervalMs - Date.now());
    if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
    lastPhotonRequestAt = Date.now();
    return await task();
  } finally {
    release();
  }
}

async function requestPhoton(center, radiusMeters, photonTag, fetchImpl, endpoint, intervalMs) {
  const url = new URL(endpoint);
  url.searchParams.set("lat", String(center.lat));
  url.searchParams.set("lon", String(center.lon));
  url.searchParams.set("radius", String(radiusMeters / 1_000));
  url.searchParams.set("limit", String(PHOTON_RESULT_LIMIT));
  url.searchParams.set("osm_tag", photonTag);

  let response;
  try {
    response = await withPhotonSlot(
      () => fetchImpl(url.toString(), {
        headers: { Accept: "application/json", "User-Agent": MAP_USER_AGENT },
        signal: AbortSignal.timeout(PHOTON_TIMEOUT_MS),
      }),
      intervalMs,
    );
  } catch {
    throw new MapNearbyError("provider_unavailable", "Nearby places are unavailable right now. Try again shortly.", 502);
  }
  if (!response.ok) {
    throw new MapNearbyError("provider_unavailable", "Nearby places are unavailable right now. Try again shortly.", 502);
  }

  try {
    const data = await response.json();
    if (data && Array.isArray(data.features)) return data.features;
  } catch {
    // Convert provider response failures to a safe, stable API error.
  }
  throw new MapNearbyError("provider_unavailable", "Nearby places are unavailable right now. Try again shortly.", 502);
}

export async function fetchMapNearbyPlaces(value, options = {}) {
  const request = parseMapNearbyRequest(value);
  if (!request) throw new MapNearbyError("invalid_request", "The nearby-place search was not valid.", 400);

  const currentLocationCenter = isCurrentLocationOriginLabel(request.center);
  const confirmedCenter = request.confirmedCoordinates?.center;
  const useCache = options.cache !== false && !currentLocationCenter;
  const cacheKey = `${request.center}|${request.categories.join(",")}|${request.radiusMeters}`;
  if (useCache) {
    const cached = cacheRead(nearbyCache, cacheKey);
    if (cached) return cached;
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const place = confirmedCenter
    ? {
        label: `User-confirmed pin for ${request.center}`.slice(0, 240),
        lat: confirmedCenter.lat,
        lon: confirmedCenter.lon,
        source: "map_pin",
        resolutionState: "USER_CONFIRMED",
        userConfirmed: true,
      }
    : await resolveMapPlace(request.center, {
        fetchImpl,
        cache: useCache,
        nominatimIntervalMs: options.nominatimIntervalMs,
      });
  const center = { ...place };
  const endpoint = options.photonEndpoint ?? PHOTON_REVERSE_URL;
  const photonIntervalMs = Math.max(0, options.photonIntervalMs ?? PHOTON_INTERVAL_MS);
  const features = [];
  for (const category of request.categories) {
    const photonTag = MAP_NEARBY_CATEGORIES[category].photonTag;
    const photonCacheKey = `${center.lat},${center.lon}|${photonTag}|${request.radiusMeters}`;
    let categoryFeatures = useCache ? cacheRead(photonCache, photonCacheKey) : null;
    if (!categoryFeatures) {
      categoryFeatures = await requestPhoton(center, request.radiusMeters, photonTag, fetchImpl, endpoint, photonIntervalMs);
      if (useCache) cacheWrite(photonCache, photonCacheKey, categoryFeatures);
    }
    features.push(...categoryFeatures);
  }

  const allPlaces = normalizeFeatures(features, center, request.categories, request.radiusMeters);
  const result = {
    center,
    radiusMeters: request.radiusMeters,
    categories: request.categories,
    places: allPlaces.slice(0, MAX_RESULTS),
    truncated: allPlaces.length > MAX_RESULTS,
  };
  if (useCache) cacheWrite(nearbyCache, cacheKey, result);
  return result;
}
