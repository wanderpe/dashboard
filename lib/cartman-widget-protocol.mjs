const ROUTE_MAP_MODES = new Set(["driving", "walking", "cycling"]);
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

/**
 * Split assistant output into plain text and strictly validated widgets.
 * Only one route map is accepted per assistant message; unknown or invalid
 * blocks remain ordinary text and can never create executable markup.
 *
 * @param {string} content
 * @param {{ streaming?: boolean }} [options]
 * @returns {Array<{type: "text", text: string} | {type: "widget", widget: {type: "route-map", origin: string, destination: string, mode: "driving" | "walking" | "cycling"}}>}
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

    const widget = parseRouteMapWidget(payload);
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

export function buildCartmanWidgetPrompt() {
  return [
    "Interactive chat widgets are supported only through the allowlisted cartman-widget format.",
    "Emit a route-map widget only when the user directly asks for a route or map, or when a map is plainly useful to the task.",
    "A route needs both an origin and a destination; ask for any missing endpoint and never invent a place or claim a verified route before the map service returns it.",
    "When appropriate, include at most one widget. Replace the example places with the user's endpoints and use driving, walking, or cycling:",
    "```cartman-widget",
    '{"type":"route-map","origin":"...","destination":"...","mode":"driving"}',
    "```",
    "Use the user's place names as written unless they clarify them. Keep your normal Cartman-voiced explanation outside the block.",
    "Never emit HTML, JavaScript, iframes, arbitrary code, or other widget types; the client renders only validated route-map data.",
  ].join("\n");
}
