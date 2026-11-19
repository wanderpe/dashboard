import { MAP_NEARBY_CATEGORY_IDS } from "./map-nearby-categories.mjs";

const ROUTE_MAP_MODES = new Set(["driving", "walking", "cycling"]);
const NEARBY_MAP_CATEGORIES = new Set(MAP_NEARBY_CATEGORY_IDS);
const DEFAULT_NEARBY_RADIUS_METERS = 500;
const MIN_NEARBY_RADIUS_METERS = 500;
const MAX_NEARBY_RADIUS_METERS = 5_000;
const ROUTE_WIDGET_PATTERN = /```cartman-widget[ \t]*\r?\n([\s\S]*?)\r?\n```/g;

function normalizePlace(value) {
  if (typeof value !== "string") return null;
  const place = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return place.length > 0 && place.length <= 160 ? place : null;
}

function parseRouteMapWidget(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value;
  if (Object.keys(record).some((key) => !["type", "origin", "destination", "mode"].includes(key))) {
    return null;
  }
  if (record.type !== "route-map") return null;

  const origin = normalizePlace(record.origin);
  const destination = normalizePlace(record.destination);
  const mode = record.mode === undefined ? "driving" : record.mode;
  if (!origin || !destination || !ROUTE_MAP_MODES.has(mode)) return null;

  return { type: "route-map", origin, destination, mode };
}

function parseNearbyMapWidget(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value;
  if (Object.keys(record).some((key) => !["type", "center", "categories", "radiusMeters", "routeOrigin", "routeMode"].includes(key))) {
    return null;
  }
  if (record.type !== "nearby-map") return null;

  const center = normalizePlace(record.center);
  const categories = record.categories;
  const radiusMeters = record.radiusMeters === undefined
    ? DEFAULT_NEARBY_RADIUS_METERS
    : record.radiusMeters;
  const routeOrigin = record.routeOrigin === undefined ? null : normalizePlace(record.routeOrigin);
  const routeMode = record.routeMode === undefined ? "driving" : record.routeMode;
  if (
    !center ||
    !Array.isArray(categories) ||
    categories.length < 1 ||
    categories.length > 5 ||
    categories.some((category) => typeof category !== "string" || !NEARBY_MAP_CATEGORIES.has(category)) ||
    new Set(categories).size !== categories.length ||
    !Number.isInteger(radiusMeters) ||
    radiusMeters < MIN_NEARBY_RADIUS_METERS ||
    radiusMeters > MAX_NEARBY_RADIUS_METERS ||
    (record.routeOrigin !== undefined && (!routeOrigin || !ROUTE_MAP_MODES.has(routeMode))) ||
    (record.routeOrigin === undefined && record.routeMode !== undefined)
  ) {
    return null;
  }

  return {
    type: "nearby-map",
    center,
    categories,
    radiusMeters,
    ...(routeOrigin ? { routeOrigin, routeMode } : {}),
  };
}

function parseCartmanWidget(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (value.type === "route-map") return parseRouteMapWidget(value);
  if (value.type === "nearby-map") return parseNearbyMapWidget(value);
  return null;
}

/**
 * Split assistant output into plain text and strictly validated widgets.
 * Only one map widget is accepted per assistant message; unknown or invalid
 * blocks remain ordinary text and can never create executable markup.
 *
 * @param {string} content
 * @param {{ streaming?: boolean }} [options]
 * @returns {Array<{type: "text", text: string} | {type: "widget", widget: {type: "route-map", origin: string, destination: string, mode: "driving" | "walking" | "cycling"} | {type: "nearby-map", center: string, categories: string[], radiusMeters: number, routeOrigin?: string, routeMode?: "driving" | "walking" | "cycling"}}>}
 */
export function parseCartmanWidgetContent(content, { streaming = false } = {}) {
  if (typeof content !== "string" || content.length === 0) return [];

  const segments = [];
  let cursor = 0;
  let widgetCount = 0;

  for (const match of content.matchAll(ROUTE_WIDGET_PATTERN)) {
    const index = match.index ?? 0;
    const fullMatch = match[0];
    let payload;
    try {
      payload = JSON.parse(match[1]);
    } catch {
      continue;
    }

    const widget = parseCartmanWidget(payload);
    if (!widget || widgetCount > 0) continue;

    if (index > cursor) segments.push({ type: "text", text: content.slice(cursor, index) });
    segments.push({ type: "widget", widget });
    cursor = index + fullMatch.length;
    widgetCount += 1;
  }

  if (cursor < content.length) {
    const partialStart = content.lastIndexOf("```cartman-widget");
    const hasIncompleteBlock = partialStart >= cursor && !content.slice(partialStart).includes("\n```");
    if (streaming && hasIncompleteBlock) {
      if (partialStart > cursor) segments.push({ type: "text", text: content.slice(cursor, partialStart) });
      return segments;
    }
    segments.push({ type: "text", text: content.slice(cursor) });
  }

  return segments;
}

export function buildCartmanWidgetPrompt({ useCurrentLocationAsRouteOrigin = false } = {}) {
  return [
    "Interactive chat maps are supported only through the allowlisted cartman-widget format.",
    "Emit a route-map widget when the user asks for directions or a route; emit a nearby-map widget when the user asks to find or display places near a named place or area.",
    useCurrentLocationAsRouteOrigin === true
      ? "A route needs an origin and a destination; when the user has not named another start, use the current-location origin below. Ask for any missing destination and never invent a place or claim a verified route before the map service returns it."
      : "A route needs both an origin and a destination; ask for any missing endpoint and never invent a place or claim a verified route before the map service returns it.",
    ...(useCurrentLocationAsRouteOrigin === true
      ? ["The user has explicitly opted in to browser location for route planning. Unless the user explicitly names a different origin, use the exact origin label \"Current location\". Preserve any explicitly stated origin. This opted-in location default takes precedence over previous route-origin context unless the user explicitly names a different origin in the current request. Coordinates are not available to you; never ask for, infer, output, or claim to know coordinates."]
      : []),
    "For nearby searches, use the user's stated center and one or more of these categories: gym, store, grocery, restaurant, cafe, pharmacy, hotel, gas_station, park, bank, school, hospital. Use radiusMeters 500 unless the user asks for a different radius; never invent coordinates or nearby businesses.",
    useCurrentLocationAsRouteOrigin === true
      ? "For a route comparison, use nearby-map with routeOrigin set to \"Current location\" unless the user explicitly names a different origin, and routeMode set to driving, walking, or cycling. For a follow-up asking for all routes after a nearby search, reuse the previous nearby search center for discovery but use \"Current location\" as the route origin unless the user supplied a different origin. If the search center is ambiguous, ask which place to search around rather than guessing."
      : "For a route comparison, use nearby-map with routeOrigin set only to an explicit user-provided origin or a previous structured location context, and routeMode set to driving, walking, or cycling. For a follow-up asking for all routes after a nearby search, reuse the previous nearby search center as the origin unless the user supplied a different one. If the search center is ambiguous, ask which place to search around rather than guessing.",
    "When the user asks for all routes or the nearest destination, the map service compares every discovered candidate, ranks successful routes by road distance, and reports candidates whose routes failed; do not omit a candidate or claim a nearest-by-road result from straight-line distance.",
    "Do not confuse road distance, straight-line distance, or estimated travel time; each displayed metric is calculated by the map service and must be labeled precisely.",
    "Only call a location user-confirmed (USER_CONFIRMED) after an actual user action is recorded by the application. Never infer or invent a confirmation state from assistant text or a search result.",
    useCurrentLocationAsRouteOrigin === true
      ? "For follow-ups, reuse the previous structured map context for search center, categories, and discovered candidates. Use the current-location origin for routes unless the user explicitly names a different origin in the current request. Do not repeat discovery unless the user changes the search."
      : "For follow-ups, reuse the previous structured location context, including search center, categories, origin, travel mode, and discovered candidates. Do not repeat discovery unless the user changes the search. A changed origin, destination, or travel mode invalidates prior route calculations.",
    "When appropriate, include at most one widget. For a route, replace the example places with the user's endpoints and use driving, walking, or cycling:",
    "```cartman-widget",
    '{"type":"route-map","origin":"...","destination":"...","mode":"driving"}',
    "```",
    "For nearby places, use this form and include the requested categories:",
    "```cartman-widget",
    '{"type":"nearby-map","center":"...","categories":["gym","store"],"radiusMeters":500,"routeOrigin":"...","routeMode":"driving"}',
    "```",
    "Use the user's place names as written unless they clarify them. Keep your normal Cartman-voiced explanation outside the block.",
    "Never emit HTML, JavaScript, iframes, arbitrary code, coordinates you guessed, or other widget types; the client renders only strictly validated map data.",
  ].join("\n");
}
