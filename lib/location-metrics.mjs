function isCoordinate(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function isPoint(value) {
  return value && typeof value === "object" && !Array.isArray(value) &&
    isCoordinate(value.lat) && value.lat >= -90 && value.lat <= 90 &&
    isCoordinate(value.lon) && value.lon >= -180 && value.lon <= 180;
}

export function straightLineDistanceMeters(origin, destination) {
  if (!isPoint(origin) || !isPoint(destination)) return null;
  const radians = (degrees) => (degrees * Math.PI) / 180;
  const latitudeDelta = radians(destination.lat - origin.lat);
  const longitudeDelta = radians(destination.lon - origin.lon);
  const value =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(origin.lat)) * Math.cos(radians(destination.lat)) * Math.sin(longitudeDelta / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}
