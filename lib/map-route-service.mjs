import { straightLineDistanceMeters } from "./location-metrics.mjs";

const MAP_ROUTE_MODES = new Set(["driving", "walking", "cycling"]);
const OSRM_PROFILES = Object.freeze({ driving: "driving", walking: "foot", cycling: "bike" });
const NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search";
const NOMINATIM_CANDIDATE_LIMIT = 5;
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
 * @returns {{origin: string, destination: string, mode: "driving" | "walking" | "cycling", confirmedCoordinates?: Partial<Record<"origin" | "destination", {lat: number, lon: number}>>} | null}
 */
export function parseMapRouteRequest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = /** @type {Record<string, unknown>} */ (value);
  if (Object.keys(record).some((key) => !["origin", "destination", "mode", "confirmedCoordinates"].includes(key))) return null;

  const origin = normalizePlace(record.origin);
  const destination = normalizePlace(record.destination);
  const mode = record.mode === undefined ? "driving" : record.mode;
  if (!origin || !destination || typeof mode !== "string" || !MAP_ROUTE_MODES.has(mode)) return null;

  const request = { origin, destination, mode };
  if (record.confirmedCoordinates !== undefined) {
    const rawCoordinates = record.confirmedCoordinates;
    if (!rawCoordinates || typeof rawCoordinates !== "object" || Array.isArray(rawCoordinates)) return null;
    const coordinateEntries = Object.entries(/** @type {Record<string, unknown>} */ (rawCoordinates));
    if (coordinateEntries.length === 0 || coordinateEntries.some(([key]) => !["origin", "destination"].includes(key))) return null;

    const confirmedCoordinates = {};
    for (const [endpoint, value] of coordinateEntries) {
      if (!value || typeof value !== "object" || Array.isArray(value)) return null;
      const point = /** @type {Record<string, unknown>} */ (value);
      if (Object.keys(point).length !== 2 || !Object.hasOwn(point, "lat") || !Object.hasOwn(point, "lon")) return null;
      if (!isCoordinate(point.lat, point.lon)) return null;
      confirmedCoordinates[endpoint] = { lat: point.lat, lon: point.lon };
    }
    request.confirmedCoordinates = confirmedCoordinates;
  }

  return request;
}

export class MapRouteError extends Error {
  /** @param {string} code @param {string} message @param {number} status @param {unknown} [details] */
  constructor(code, message, status, details) {
    super(message);
    this.name = "MapRouteError";
    this.code = code;
    this.status = status;
    this.details = details;
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

function parseNominatimCoordinate(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;
  const normalized = value.trim();
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(normalized)) return null;
  const coordinate = Number(normalized);
  return Number.isFinite(coordinate) ? coordinate : null;
}

function isCoordinate(lat, lon) {
  return Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

const STREET_SUFFIX_PATTERN = /.+\s+\b(?:street|st|road|rd|avenue|ave|boulevard|blvd|drive|dr|lane|ln|highway|hwy|way|court|ct)\b\.?(?:\s+\d+[a-z]?)?\s*$/i;
const LOCALITY_PATTERN = /\b(?:city\s+district|city|municipality|town|province|region|county|village|barangay|district|state|country|borough|hamlet|suburb|neighbourhood|neighborhood|quarter|locality)\b/i;
const LOCALITY_DESCRIPTOR_PATTERN = /\b(city\s+district|city|municipality|town|province|region|county|village|barangay|district|state|country|borough|hamlet|suburb|neighbourhood|neighborhood|quarter|locality)\b/i;
const STREET_SUFFIXES = new Map([
  ["st", "street"], ["rd", "road"], ["ave", "avenue"], ["blvd", "boulevard"],
  ["dr", "drive"], ["ln", "lane"], ["hwy", "highway"], ["ct", "court"],
]);
const NAMED_PLACE_KINDS = [
  { query: /\b(?:clinic|clinica)\b/i, result: /\b(?:clinic|clinica)\b/i, generic: ["clinic", "clinica"] },
  { query: /\bhospital\b/i, result: /\bhospital\b/i, generic: ["hospital"] },
  { query: /\bhotel\b/i, result: /\bhotel\b/i, generic: ["hotel"] },
  { query: /\brestaurant\b/i, result: /\brestaurant\b/i, generic: ["restaurant"] },
  { query: /\bschool\b/i, result: /\bschool\b/i, generic: ["school"] },
  {
    query: /\b(?:city|town|municipal)\s+hall\b/i,
    result: /\btownhall\b/i,
    generic: ["city", "town", "municipal", "municipality", "hall", "presidencia"],
  },
  { query: /\b(university|college)\b/i, result: /\b(?:university|college)\b/i, generic: ["university", "college"] },
  { query: /\bairport\b/i, result: /\b(?:airport|aerodrome)\b/i, generic: ["airport"] },
  { query: /\b(?:gym|fitness)\b/i, result: /\b(?:fitness[_ ](?:centre|center)|gym)\b/i, generic: ["gym", "fitness"] },
  { query: /\b(?:shopping\s+)?mall\b/i, result: /\bmall\b/i, generic: ["shopping", "mall"] },
  { query: /\bbusiness\s+park\b/i, result: /\bbusiness\s+park\b/i, generic: ["business", "park"] },
  { query: /\bit\s+center\b/i, result: /\bit\s+center\b/i, generic: ["it", "center"] },
  { query: /\bmedical\s+center\b/i, result: /\bmedical\s+center\b/i, generic: ["medical", "center"] },
  // Nominatim indexes shopping centers as malls; original-name and locality checks still apply.
  {
    query: /\b(?:shopping\s+)?(?:center|centre)\b/i,
    result: /\bmall\b/i,
    generic: ["shopping", "center", "centre", "mall"],
    searchTerm: "mall",
  },
];

function matchTokens(value) {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function sameTokenSequence(left, right) {
  return left.length === right.length && left.every((token, index) => token === right[index]);
}

function requestedStreet(query) {
  for (const segment of query.split(/[;,]/).map((part) => part.trim())) {
    if (!STREET_SUFFIX_PATTERN.test(segment)) continue;
    return segment
      .replace(/^\d+[a-z]?\s+/i, "")
      .replace(/\s+\d+[a-z]?\s*$/i, "")
      .trim();
  }
  return null;
}

function requestedIdentityIsStreet(query) {
  const street = requestedStreet(query);
  if (!street) return false;
  const identity = query.split(",")[0]?.trim() ?? "";
  const canonicalStreetTokens = (value) =>
    matchTokens(value).map((token) => STREET_SUFFIXES.get(token) ?? token);
  return sameTokenSequence(canonicalStreetTokens(identity), canonicalStreetTokens(street));
}

function requestedNamedPlaceKind(query) {
  if (requestedIdentityIsStreet(query)) return null;
  const identity = query.split(",")[0]?.trim() ?? "";
  return NAMED_PLACE_KINDS.find(({ query: pattern }) => pattern.test(identity)) ?? null;
}

function geocoderSearchQuery(query) {
  const searchTerm = requestedNamedPlaceKind(query)?.searchTerm;
  if (!searchTerm) return query;
  const segments = query.split(",").map((segment) => segment.trim());
  segments[0] = `${segments[0]} ${searchTerm}`;
  return segments.join(", ");
}

function semanticGeocodingQuery(query) {
  const segments = query.split(",").map((segment) => segment.trim());
  const identity = segments[0] ?? "";
  const onAddress = identity.match(/^(.+?)\s+on\s+(.+)$/i);
  if (onAddress && STREET_SUFFIX_PATTERN.test(onAddress[2])) {
    segments.splice(0, 1, onAddress[1].trim(), onAddress[2].trim());
  }
  return segments.filter(Boolean).join(", ");
}

function normalizeStreetSegment(segment) {
  if (!STREET_SUFFIX_PATTERN.test(segment)) return segment;
  return segment
    .replace(/\bA\s*\.?\s*S\s*\.?\b/gi, "AS")
    .replace(/\bSt\.?\s*$/i, "Street")
    .replace(/\bRd\.?\s*$/i, "Road")
    .replace(/\bAve\.?\s*$/i, "Avenue")
    .replace(/\bBlvd\.?\s*$/i, "Boulevard")
    .replace(/\bDr\.?\s*$/i, "Drive")
    .replace(/\bLn\.?\s*$/i, "Lane")
    .replace(/\bHwy\.?\s*$/i, "Highway")
    .replace(/\bCt\.?\s*$/i, "Court");
}

function geocodingQueryCandidates(query) {
  const semanticQuery = semanticGeocodingQuery(query);
  const segments = semanticQuery.split(",").map((segment) => segment.trim()).filter(Boolean);
  const identity = segments[0] ?? semanticQuery;
  const street = requestedStreet(semanticQuery);
  const locality = requestedLocalities(semanticQuery).at(-1)?.name;
  const normalized = segments
    .map((segment) => normalizeStreetSegment(segment))
    .join(", ");
  const alternatives = [
    query,
    semanticQuery,
    normalized,
    locality ? `${identity}, ${locality}` : identity,
    street ? `${street}${locality ? `, ${locality}` : ""}` : null,
  ];
  return [...new Set(alternatives.filter(Boolean))].slice(0, 5);
}

function explicitHouseNumber(query) {
  const segments = query.split(/[;,]/).map((part) => part.trim());
  for (const [index, segment] of segments.entries()) {
    if (!STREET_SUFFIX_PATTERN.test(segment)) continue;
    const beforeStreet = segment.match(/^\s*(\d+[a-z]?)\s+/i);
    if (beforeStreet) return beforeStreet[1];
    const afterStreet = segment.match(/\b(?:street|st|road|rd|avenue|ave|boulevard|blvd|drive|dr|lane|ln|highway|hwy|way|court|ct)\b\.?\s+(\d+[a-z]?)\b/i);
    if (afterStreet) return afterStreet[1];
    const adjacentHouseNumber = [segments[index - 1], segments[index + 1]]
      .find((adjacent) => adjacent && /^\d+[a-z]?$/i.test(adjacent));
    if (adjacentHouseNumber) return adjacentHouseNumber;
  }
  return null;
}

function streetMatchesQuery(query, result) {
  const expectedStreet = requestedStreet(query);
  const expectedHouseNumber = explicitHouseNumber(query);
  const address = result?.address ?? {};
  const resultTypes = [result?.type, result?.class, result?.addresstype]
    .filter((value) => typeof value === "string")
    .flatMap((value) => matchTokens(value));
  const isHouseResult = resultTypes.includes("house") ||
    (typeof address.house_number === "string" && address.house_number.trim().length > 0);
  const isNamedPlaceQuery = Boolean(requestedNamedPlaceKind(query));
  if (!expectedHouseNumber && !isNamedPlaceQuery && isHouseResult) return false;
  if (!expectedStreet) return !expectedHouseNumber;

  if (expectedHouseNumber) {
    const actualHouseNumber = address.house_number;
    if (String(actualHouseNumber ?? "").trim().toLowerCase() !== expectedHouseNumber.toLowerCase()) return false;
  }

  const expectedTokens = matchTokens(expectedStreet).map((token) => STREET_SUFFIXES.get(token) ?? token);
  const structuredStreet = [address.road, address.residential, address.pedestrian, address.footway]
    .find((value) => typeof value === "string" && value.trim());
  const actualStreets = typeof structuredStreet === "string"
    ? [structuredStreet]
    : (typeof result?.display_name === "string" ? result.display_name.split(",") : []);
  return actualStreets.some((street) => {
    const actualTokens = matchTokens(street).map((token) => STREET_SUFFIXES.get(token) ?? token);
    return expectedTokens.length > 0 && expectedTokens.length === actualTokens.length &&
      expectedTokens.every((token, index) => token === actualTokens[index]);
  });
}

function localityDescriptorField(value) {
  const descriptor = value.match(LOCALITY_DESCRIPTOR_PATTERN)?.[1];
  return descriptor ? descriptor.toLowerCase().replace(/\s+/g, "_") : null;
}

function requestedLocalities(query) {
  const segments = query.split(",").map((part) => part.trim()).filter(Boolean);
  const hasNamedPoiIdentity = Boolean(requestedNamedPlaceKind(query));
  const explicitLocalities = segments.filter((part, index) =>
    !(index === 0 && hasNamedPoiIdentity) && LOCALITY_PATTERN.test(part)
  );
  let lastStreetIndex = -1;
  let lastLocalityIndex = -1;
  for (const [index, part] of segments.entries()) {
    if (STREET_SUFFIX_PATTERN.test(part)) lastStreetIndex = index;
    if (LOCALITY_PATTERN.test(part)) lastLocalityIndex = index;
  }
  const contextStart = Math.max(1, lastStreetIndex + 1, lastLocalityIndex + 1);
  const leadingAddressLocalities = lastStreetIndex > 0
    ? segments.slice(0, lastStreetIndex).filter((part, index) =>
      !(index === 0 && hasNamedPoiIdentity) &&
      !/^\d+[a-z]?$/i.test(part) &&
      !STREET_SUFFIX_PATTERN.test(part)
    )
    : [];
  const addressLocalities = lastStreetIndex >= 0 && lastLocalityIndex > lastStreetIndex
    ? segments.slice(lastStreetIndex + 1, lastLocalityIndex).filter((part) => !/^\d+[a-z]?$/i.test(part))
    : [];
  const qualifiers = [...explicitLocalities, ...leadingAddressLocalities, ...addressLocalities, ...segments.slice(contextStart)];
  return [...new Map(qualifiers.map((name) => {
    const normalized = matchTokens(name).join(" ");
    const field = localityDescriptorField(name);
    return [`${field ?? ""}:${normalized}`, { name, field }];
  })).values()];
}

const LOCALITY_ADDRESS_FIELDS = [
  "city", "town", "village", "municipality", "county", "state", "province", "region", "country",
  "city_district", "district", "borough", "suburb", "hamlet", "barangay", "neighbourhood", "neighborhood",
  "quarter", "locality",
];
const LOCALITY_DESCRIPTOR_TOKENS = new Set([
  "city", "municipality", "town", "province", "region", "county", "village", "barangay", "district", "state",
  "country", "borough", "hamlet", "suburb", "neighbourhood", "neighborhood", "quarter", "locality",
]);
const LOCALITY_DESCRIPTOR_FIELD_ALIASES = Object.freeze({
  city: ["city", "municipality", "town", "village"],
  municipality: ["municipality", "city", "town"],
  town: ["town", "city", "municipality"],
  province: ["province"],
  region: ["region"],
  county: ["county"],
  village: ["village", "hamlet"],
  barangay: ["barangay", "suburb", "city_district", "district", "neighbourhood", "neighborhood", "quarter", "locality"],
  district: ["district", "city_district"],
  city_district: ["city_district", "district"],
  state: ["state"],
  country: ["country"],
  borough: ["borough", "city_district", "district"],
  hamlet: ["hamlet", "village"],
  suburb: ["suburb", "neighbourhood", "neighborhood", "quarter"],
  neighbourhood: ["neighbourhood", "neighborhood", "quarter", "suburb"],
  neighborhood: ["neighborhood", "neighbourhood", "quarter", "suburb"],
  quarter: ["quarter", "neighbourhood", "neighborhood", "suburb"],
  locality: ["locality", "neighbourhood", "neighborhood", "suburb"],
});
const US_STATE_ABBREVIATIONS = new Map(Object.entries({
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado",
  CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho",
  IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
  ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada",
  NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon",
  PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota",
  TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia",
  WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", DC: "District of Columbia",
}));
const LOCALITY_RESULT_TYPES = new Set([
  "administrative", "borough", "city", "county", "country", "district", "hamlet",
  "municipality", "neighbourhood", "neighborhood", "province", "region", "state",
  "suburb", "town", "village",
]);

function localitiesMatchQuery(query, result) {
  const expectedLocalities = requestedLocalities(query);
  if (expectedLocalities.length === 0) return true;

  const address = result?.address ?? {};
  return expectedLocalities.every(({ name, field }) => {
    const expectedTokens = matchTokens(name).filter((token) => !LOCALITY_DESCRIPTOR_TOKENS.has(token));
    const stateName = US_STATE_ABBREVIATIONS.get(name.trim().toUpperCase());
    const candidateFields = field
      ? (LOCALITY_DESCRIPTOR_FIELD_ALIASES[field] ?? [field])
      : LOCALITY_ADDRESS_FIELDS;
    const alternatives = [
      { tokens: expectedTokens, fields: candidateFields },
      ...(stateName ? [{
        tokens: matchTokens(stateName).filter((token) => !LOCALITY_DESCRIPTOR_TOKENS.has(token)),
        fields: ["state"],
      }] : []),
    ];
    return alternatives.some(({ tokens, fields }) => tokens.length > 0 &&
      fields.some((candidateField) => {
        const actual = address[candidateField];
        if (typeof actual !== "string") return false;
        const actualTokens = matchTokens(actual).filter((token) => !LOCALITY_DESCRIPTOR_TOKENS.has(token));
        return sameTokenSequence(actualTokens, tokens);
      }));
  });
}

function placeIdentityMatchesQuery(query, result, genericWords = []) {
  const identity = query.split(",")[0] ?? "";
  const generic = new Set([...genericWords, "the", "of", "at", "and"]);
  const identityTokens = matchTokens(identity).filter((token) => !generic.has(token));
  if (identityTokens.length === 0) return false;

  const compareCandidateName = (name) => {
    const candidateTokens = matchTokens(name).filter((token) => !generic.has(token));
    return candidateTokens.length === identityTokens.length &&
      candidateTokens.every((token, index) => token === identityTokens[index]);
  };
  if (typeof result?.name === "string" && result.name.trim()) {
    return compareCandidateName(result.name);
  }
  const displayIdentity = typeof result?.display_name === "string"
    ? result.display_name.split(",")[0]
    : "";
  return displayIdentity.length > 0 && compareCandidateName(displayIdentity);
}

function localityResultMatchesQuery(query, result) {
  const resultTypes = [result?.type, result?.class, result?.addresstype]
    .filter((value) => typeof value === "string")
    .flatMap((value) => matchTokens(value));
  return resultTypes.some((type) => LOCALITY_RESULT_TYPES.has(type)) &&
    placeIdentityMatchesQuery(query, result, [...LOCALITY_DESCRIPTOR_TOKENS]);
}

function queryMatchesLocalityAddressValue(query, result) {
  const queryTokens = matchTokens(query);
  if (queryTokens.length !== 1) return false;
  const address = result?.address ?? {};
  return LOCALITY_ADDRESS_FIELDS.some((field) => {
    const value = address[field];
    if (typeof value !== "string") return false;
    const addressTokens = matchTokens(value).filter((token) => !LOCALITY_DESCRIPTOR_TOKENS.has(token));
    return sameTokenSequence(addressTokens, queryTokens);
  });
}

function isRoadGeocoderResult(result) {
  const resultTypes = [result?.type, result?.class, result?.addresstype]
    .filter((value) => typeof value === "string")
    .flatMap((value) => matchTokens(value));
  const roadTypes = new Set([
    "residential", "service", "primary", "secondary", "tertiary", "unclassified", "pedestrian",
    "footway", "path", "cycleway", "track", "motorway", "trunk", "construction", "steps",
  ]);
  return resultTypes.includes("road") || resultTypes.includes("highway") || resultTypes.some((type) => roadTypes.has(type));
}

function isPreciseGeocoderMatch(query, result) {
  if (!streetMatchesQuery(query, result) || !localitiesMatchQuery(query, result)) return false;
  if (queryMatchesLocalityAddressValue(query, result) && !localityResultMatchesQuery(query, result)) return false;
  if (!requestedStreet(query) && isRoadGeocoderResult(result)) return false;

  const hasStreet = Boolean(requestedStreet(query));
  const hasHouseNumber = Boolean(explicitHouseNumber(query));
  const hasRequestedLocality = requestedLocalities(query).length > 0;
  const expectedKind = requestedNamedPlaceKind(query);
  const identityMatches = placeIdentityMatchesQuery(query, result);
  if (hasStreet && !hasHouseNumber && !expectedKind && !isRoadGeocoderResult(result) &&
    (!identityMatches || requestedIdentityIsStreet(query))) return false;
  if (expectedKind) {
    const resultClassification = [result?.type, result?.class, result?.addresstype]
      .filter((value) => typeof value === "string")
      .join(" ");
    if (!expectedKind.result.test(resultClassification) || !placeIdentityMatchesQuery(query, result, expectedKind.generic)) return false;
  } else if (!hasStreet && !hasHouseNumber && hasRequestedLocality) {
    if (!localityResultMatchesQuery(query, result)) return false;
  } else if (!hasStreet && !hasHouseNumber && !hasRequestedLocality) {
    if (!placeIdentityMatchesQuery(query, result)) return false;
  }
  return true;
}

async function geocodePlace(query, fetchImpl, intervalMs, useCache) {
  const cacheKey = query;
  if (useCache) {
    const cached = cacheRead(geocodeCache, cacheKey);
    if (cached) return cached;
  }
  const semanticQuery = semanticGeocodingQuery(query);
  const preciseMatches = new Map();
  let candidateSetMayBeTruncated = false;

  for (const [index, searchQuery] of geocodingQueryCandidates(query).entries()) {
    const url = new URL(NOMINATIM_SEARCH_URL);
    url.searchParams.set("q", geocoderSearchQuery(searchQuery));
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", String(NOMINATIM_CANDIDATE_LIMIT));
    url.searchParams.set("addressdetails", "1");
    const results = await withNominatimSlot(() => requestJson(url, fetchImpl), intervalMs);
    const candidates = Array.isArray(results) ? results : [];
    if (candidates.length >= NOMINATIM_CANDIDATE_LIMIT) candidateSetMayBeTruncated = true;
    for (const result of candidates) {
      const lat = parseNominatimCoordinate(result?.lat);
      const lon = parseNominatimCoordinate(result?.lon);
      if (lat === null || lon === null || !isCoordinate(lat, lon) || !isPreciseGeocoderMatch(semanticQuery, result)) continue;
      const key = `${lat.toFixed(7)},${lon.toFixed(7)}`;
      if (!preciseMatches.has(key)) {
        preciseMatches.set(key, {
          label: typeof result.display_name === "string" ? result.display_name.slice(0, 240) : query,
          lat,
          lon,
          source: "nominatim",
          resolutionState: "RESOLVED",
          userConfirmed: false,
        });
      }
    }
    if (index === 0 && preciseMatches.size === 1 && !candidateSetMayBeTruncated) break;
  }

  const matches = [...preciseMatches.values()];
  if (matches.length === 1 && !candidateSetMayBeTruncated) {
    if (useCache) cacheWrite(geocodeCache, cacheKey, matches[0]);
    return matches[0];
  }
  if (matches.length > 1 || candidateSetMayBeTruncated) {
    throw new MapRouteError(
      "place_ambiguous",
      "Found multiple possible matches. Choose the intended place or provide a more specific address.",
      422,
      { candidates: matches.slice(0, NOMINATIM_CANDIDATE_LIMIT), truncated: candidateSetMayBeTruncated },
    );
  }
  throw new MapRouteError("place_not_found", "Could not find one of those places after trying normalized place and address searches. Confirm its location on the map or provide a more specific address.", 422);
}

export async function resolveMapPlace(value, options = {}) {
  const query = normalizePlace(value);
  if (!query) throw new MapRouteError("invalid_request", "The place query was not valid.", 400);
  return geocodePlace(
    query,
    options.fetchImpl ?? fetch,
    Math.max(0, options.nominatimIntervalMs ?? NOMINATIM_INTERVAL_MS),
    options.cache !== false,
  );
}

function findLocalityQuery(places) {
  for (const place of places) {
    const locality = place
      .split(",")
      .map((part) => part.trim())
      .reverse()
      .find((part) => /\b(?:city|municipality|town|province|region)\b/i.test(part));
    if (locality) return locality;
  }
  return null;
}

function viewFromPlace(place, zoom) {
  return { label: place.label, lat: place.lat, lon: place.lon, zoom };
}

async function resolveMapCenter(request, resolvedEndpoints, fetchImpl, intervalMs, useCache) {
  const knownEndpoint = resolvedEndpoints.origin ?? resolvedEndpoints.destination;
  if (knownEndpoint) return viewFromPlace(knownEndpoint, 13);

  const localityQuery = findLocalityQuery([request.origin, request.destination]);
  if (!localityQuery) return null;
  try {
    const locality = await geocodePlace(localityQuery, fetchImpl, intervalMs, useCache);
    return viewFromPlace(locality, 12);
  } catch {
    // The center is only a starting viewport. A failed locality lookup must not
    // block the user from placing both endpoints manually on the map.
    return null;
  }
}

async function resolveRoutePoint(endpoint, query, request, fetchImpl, intervalMs, useCache) {
  const confirmedPoint = request.confirmedCoordinates?.[endpoint];
  if (confirmedPoint) {
    return {
      label: `User-confirmed pin for ${query}`.slice(0, 240),
      lat: confirmedPoint.lat,
      lon: confirmedPoint.lon,
      source: "map_pin",
      resolutionState: "USER_CONFIRMED",
      userConfirmed: true,
    };
  }
  return geocodePlace(query, fetchImpl, intervalMs, useCache);
}

function validMetric(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function normalizeGeometry(geometry) {
  if (geometry?.type !== "LineString" || !Array.isArray(geometry.coordinates)) return null;
  const points = geometry.coordinates
    .filter((point) => Array.isArray(point) && point.length >= 2 && isCoordinate(point[1], point[0]))
    .map((point) => [point[1], point[0]]);
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
        roadDistanceMeters: Math.round(step.distance),
      });
    }
  }
  return steps;
}

/**
 * Route between locations already resolved by a provider or explicitly confirmed by the user.
 * @param {unknown} originValue
 * @param {unknown} destinationValue
 * @param {unknown} modeValue
 * @param {{fetchImpl?: typeof fetch, cache?: boolean}} [options]
 */
export async function fetchMapRouteBetweenResolvedPlaces(originValue, destinationValue, modeValue = "driving", options = {}) {
  const validPoint = (place) => place && typeof place === "object" &&
    typeof place.label === "string" && place.label.trim().length > 0 && place.label.length <= 240 &&
    isCoordinate(place.lat, place.lon) && ["nominatim", "photon", "map_pin"].includes(place.source);
  if (!validPoint(originValue) || !validPoint(destinationValue) ||
      typeof modeValue !== "string" || !MAP_ROUTE_MODES.has(modeValue)) {
    throw new MapRouteError("invalid_coordinates", "A resolved origin, destination, and supported travel mode are required before routing.", 400);
  }

  const origin = originValue;
  const destination = destinationValue;
  const mode = modeValue;
  const routeKey = [origin, destination].map((place) =>
    `${encodeURIComponent(place.label)}:${place.lat},${place.lon}`
  ).join("|") + `|${mode}`;
  const useCache = options.cache !== false;
  if (useCache) {
    const cached = cacheRead(routeCache, `resolved:${routeKey}`);
    if (cached) return cached;
  }

  const profile = OSRM_PROFILES[mode];
  const url = new URL(`${profile}/${origin.lon},${origin.lat};${destination.lon},${destination.lat}`, OSRM_ROUTE_URL);
  url.searchParams.set("overview", "full");
  url.searchParams.set("geometries", "geojson");
  url.searchParams.set("steps", "true");
  const response = await requestJson(url, options.fetchImpl ?? fetch);
  const route = response?.code === "Ok" && Array.isArray(response.routes) ? response.routes[0] : null;
  if (!route || !validMetric(route.distance) || !validMetric(route.duration)) {
    throw new MapRouteError("route_unavailable", "No route was found for those places and travel mode.", 422);
  }
  const geometry = normalizeGeometry(route.geometry);
  if (!geometry) {
    throw new MapRouteError("route_unavailable", "No route was found for those places and travel mode.", 422);
  }

  const result = {
    origin: { ...origin, resolutionState: "ROUTE_VALIDATED" },
    destination: { ...destination, resolutionState: "ROUTE_VALIDATED" },
    mode,
    straightLineDistanceMeters: Math.round(straightLineDistanceMeters(origin, destination)),
    roadDistanceMeters: Math.round(route.distance),
    estimatedTravelTimeSeconds: Math.round(route.duration),
    resolutionState: "ROUTE_VALIDATED",
    geometry,
    steps: normalizeSteps(route.legs),
  };
  if (useCache) cacheWrite(routeCache, `resolved:${routeKey}`, result);
  return result;
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
  const routePointKey = (endpoint, query) => {
    const confirmedPoint = request.confirmedCoordinates?.[endpoint];
    return confirmedPoint
      ? `pin:${confirmedPoint.lat},${confirmedPoint.lon}:${encodeURIComponent(query)}`
      : `place:${encodeURIComponent(query)}`;
  };
  const routeKey = `${routePointKey("origin", request.origin)}|${routePointKey("destination", request.destination)}|${request.mode}`;
  if (useCache) {
    const cached = cacheRead(routeCache, routeKey);
    if (cached) return cached;
  }

  const resolvedEndpoints = {};
  const unresolvedEndpoints = [];
  const candidateMatches = {};
  const candidateMatchesMayBeTruncated = {};
  for (const endpoint of ["origin", "destination"]) {
    try {
      resolvedEndpoints[endpoint] = await resolveRoutePoint(
        endpoint,
        request[endpoint],
        request,
        fetchImpl,
        intervalMs,
        useCache,
      );
    } catch (error) {
      if (error instanceof MapRouteError && ["place_not_found", "place_ambiguous"].includes(error.code)) {
        unresolvedEndpoints.push(endpoint);
        if (error.code === "place_ambiguous" && Array.isArray(error.details?.candidates)) {
          candidateMatches[endpoint] = error.details.candidates;
          candidateMatchesMayBeTruncated[endpoint] = Boolean(error.details.truncated);
        }
        continue;
      }
      throw error;
    }
  }

  if (unresolvedEndpoints.length > 0) {
    const ambiguousEndpoints = Object.keys(candidateMatches);
    const unresolvedLabels = unresolvedEndpoints.map((endpoint) => endpoint === "origin" ? "start point" : "destination");
    const message = ambiguousEndpoints.length > 0
      ? `OpenStreetMap found multiple possible matches for the ${ambiguousEndpoints.map((endpoint) => endpoint === "origin" ? "start point" : "destination").join(" and ")}. Choose a match or confirm the missing point${unresolvedEndpoints.length === 1 ? "" : "s"} on the map to continue.`
      : `OpenStreetMap couldn't locate the ${unresolvedLabels.join(" and ")} after normalized search attempts. Confirm the missing point${unresolvedEndpoints.length === 1 ? "" : "s"} on the map to continue.`;
    const mapCenter = await resolveMapCenter(request, resolvedEndpoints, fetchImpl, intervalMs, useCache);
    const resolutionStates = Object.fromEntries(["origin", "destination"].map((endpoint) => [
      endpoint,
      resolvedEndpoints[endpoint]?.resolutionState ?? "FAILED",
    ]));
    throw new MapRouteError(ambiguousEndpoints.length > 0 ? "place_ambiguous" : "place_not_found", message, 422, {
      unresolvedEndpoints,
      resolvedEndpoints,
      mapCenter,
      candidateMatches,
      candidateMatchesMayBeTruncated,
      resolutionStates,
    });
  }

  const { origin, destination } = resolvedEndpoints;
  const result = await fetchMapRouteBetweenResolvedPlaces(origin, destination, request.mode, {
    fetchImpl,
    cache: useCache,
  });
  if (useCache) cacheWrite(routeCache, routeKey, result);
  return result;
}
