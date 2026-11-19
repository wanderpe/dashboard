/**
 * Convert a latitude/longitude object to a MapLibre [longitude, latitude] tuple.
 * @param {{ lat: number, lon: number }} point
 * @returns {[number, number]}
 */
export function latLonPointToMapLibre({ lat, lon }) {
  return [lon, lat];
}

/**
 * Convert [latitude, longitude] route points to MapLibre order.
 * @param {Array<[number, number]>} points
 * @returns {Array<[number, number]>}
 */
export function latLonRouteToMapLibre(points) {
  return points.map(([lat, lon]) => [lon, lat]);
}
