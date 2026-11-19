/**
 * @typedef {"origin" | "destination"} RouteEndpoint
 * @typedef {{lat: number, lon: number}} Coordinates
 * @typedef {{origin: string, destination: string, coordinates: Partial<Record<RouteEndpoint, Coordinates>>} | null | undefined} PendingRouteCoordinates
 *
 * Check whether a saved route session matches the current input pair.
 * @param {{origin: string, destination: string, mode?: string} | null | undefined} session
 * @param {string} origin
 * @param {string} destination
 * @param {string} [mode]
 * @param {number} [generation]
 * @returns {boolean}
 */
export function routeInputsMatch(session, origin, destination, mode, generation) {
  return Boolean(
    session && session.origin === origin && session.destination === destination &&
    (mode === undefined || session.mode === mode) &&
    (generation === undefined || session.generation === generation)
  );
}

/**
 * Match saved route or pin state to the current input generation.
 * @param {{origin: string, destination: string, generation?: number, mode?: string, revision?: number} | null | undefined} session
 * @param {{origin: string, destination: string, generation?: number, mode?: string, revision?: number} | null | undefined} current
 * @param {{matchMode?: boolean, matchRevision?: boolean}} [options]
 * @returns {boolean}
 */
export function routeSessionMatches(session, current, { matchMode = false, matchRevision = false } = {}) {
  return Boolean(
    session && current &&
    routeInputsMatch(
      session,
      current.origin,
      current.destination,
      matchMode ? current.mode : undefined,
      current.generation,
    ) &&
    (!matchRevision || session.revision === current.revision)
  );
}

/**
 * Verify that an async response still belongs to the current route request.
 * @param {{origin: string, destination: string, mode: string, revision: number, generation?: number} | null | undefined} captured
 * @param {{origin: string, destination: string, mode: string, revision: number, generation?: number} | null | undefined} current
 * @returns {boolean}
 */
export function routeRequestContextMatches(captured, current) {
  return Boolean(
    captured && current &&
    captured.origin === current.origin &&
    captured.destination === current.destination &&
    captured.mode === current.mode &&
    captured.revision === current.revision &&
    captured.generation === current.generation
  );
}

/**
 * Advance the async request generation when a committed route input pair changes.
 * @param {{origin: string, destination: string, generation?: number} | null | undefined} current
 * @param {{origin: string, destination: string}} nextInputs
 * @returns {number}
 */
export function advanceRouteRequestGeneration(current, nextInputs) {
  const generation = current?.generation ?? 0;
  const inputsChanged = !current || current.origin !== nextInputs.origin || current.destination !== nextInputs.destination;
  return generation + (inputsChanged ? 1 : 0);
}

/**
 * Build the route context for the current render before effects update the ref.
 * @template {string} Mode
 * @param {{origin: string, destination: string, mode: Mode, revision: number, generation?: number} | null | undefined} current
 * @param {{origin: string, destination: string}} nextInputs
 * @param {Mode} mode
 * @param {number} revision
 * @returns {{origin: string, destination: string, mode: Mode, revision: number, generation: number}}
 */
export function routeContextForInputs(current, nextInputs, mode, revision) {
  return {
    ...current,
    ...nextInputs,
    mode,
    revision,
    generation: advanceRouteRequestGeneration(current, nextInputs),
  };
}

/**
 * Return true only if a map click can target a missing route endpoint.
 * @param {RouteEndpoint | null | undefined} activeEndpoint
 * @returns {boolean}
 */
export function canPlacePinFromMap(activeEndpoint) {
  return activeEndpoint === "origin" || activeEndpoint === "destination";
}

/**
 * Validate a latitude/longitude pair before it reaches the map renderer.
 * @param {unknown} point
 * @returns {point is Coordinates}
 */
export function isValidCoordinates(point) {
  if (!point || typeof point !== "object" || Array.isArray(point)) return false;
  const coordinates = /** @type {Record<string, unknown>} */ (point);
  return (
    typeof coordinates.lat === "number" && Number.isFinite(coordinates.lat) && coordinates.lat >= -90 && coordinates.lat <= 90 &&
    typeof coordinates.lon === "number" && Number.isFinite(coordinates.lon) && coordinates.lon >= -180 && coordinates.lon <= 180
  );
}

/**
 * Identify only plain-text placeholders that mean the browser's current location.
 * @param {unknown} value
 * @returns {boolean}
 */
export function isCurrentLocationOriginLabel(value) {
  if (typeof value !== "string") return false;
  const normalized = value.replace(/\s+/g, " ").trim().toLowerCase();
  return new Set([
    "current location",
    "my current location",
    "your current location",
    "my location",
    "your location",
    "here",
    "where i am",
    "where i'm",
  ]).has(normalized);
}

/**
 * Select validated endpoint coordinates for map markers, preferring a valid confirmed pin.
 * @param {unknown} confirmed
 * @param {unknown} resolved
 * @returns {{coordinates: Coordinates, confirmed: boolean} | null}
 */
export function endpointMarkerPoint(confirmed, resolved) {
  if (isValidCoordinates(confirmed)) return { coordinates: confirmed, confirmed: true };
  if (isValidCoordinates(resolved)) return { coordinates: resolved, confirmed: false };
  return null;
}

/**
 * Return user-confirmed pins only for the route inputs they were confirmed for.
 * @param {PendingRouteCoordinates} pending
 * @param {string} origin
 * @param {string} destination
 * @param {number} [generation]
 * @returns {Partial<Record<RouteEndpoint, Coordinates>> | null}
 */
export function coordinatesForCurrentRoute(pending, origin, destination, generation) {
  if (!routeInputsMatch(pending, origin, destination, undefined, generation)) return null;
  return pending.coordinates;
}

/**
 * Choose a map's first view, preferring a draft pin that predates map setup.
 * @param {{lat: number, lon: number, zoom: number} | null | undefined} center
 * @param {Coordinates | null | undefined} draftCoordinate
 * @returns {Coordinates & {zoom: number}}
 */
export function initialPinMapView(center, draftCoordinate) {
  if (isValidCoordinates(draftCoordinate)) {
    return { lat: draftCoordinate.lat, lon: draftCoordinate.lon, zoom: center?.zoom ?? 13 };
  }
  if (
    isValidCoordinates(center) && typeof center.zoom === "number" && Number.isFinite(center.zoom) &&
    center.zoom >= 2 && center.zoom <= 19
  ) {
    return { lat: center.lat, lon: center.lon, zoom: center.zoom };
  }
  return { lat: 20, lon: 0, zoom: 2 };
}
