export type DirectionsPoint = { lat: number; lng: number } | string;

function pointValue(point: DirectionsPoint) {
  return typeof point === "string" ? point : `${point.lat},${point.lng}`;
}

export function googleDirectionsUrl(baseUrl: string, destination: DirectionsPoint, origin?: DirectionsPoint) {
  const separator = baseUrl.includes("?") ? "&" : "?";
  const originQuery = origin ? `&origin=${encodeURIComponent(pointValue(origin))}` : "";
  return `${baseUrl}${separator}api=1${originQuery}&destination=${encodeURIComponent(pointValue(destination))}&travelmode=driving&dir_action=navigate`;
}
