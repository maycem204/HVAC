import { mapConfig } from "../config/maps";
import { googleDirectionsUrl, type DirectionsPoint } from "../providers/maps/google-directions-provider";

export function createDirectionsUrl(destination: DirectionsPoint, origin?: DirectionsPoint) {
  if (mapConfig.directionsProvider === "google") {
    return googleDirectionsUrl(mapConfig.directionsBaseUrl, destination, origin);
  }
  throw new Error(`Unsupported directions provider: ${mapConfig.directionsProvider}`);
}
