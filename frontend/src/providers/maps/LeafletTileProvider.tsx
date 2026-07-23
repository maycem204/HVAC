import { TileLayer } from "react-leaflet";
import { mapConfig } from "../../config/maps";

export function LeafletTileProvider() {
  return <TileLayer attribution={mapConfig.tileAttribution} url={mapConfig.tileUrl}/>;
}
