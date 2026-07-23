export const mapConfig = {
  tileUrl: import.meta.env.VITE_MAP_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  tileAttribution: import.meta.env.VITE_MAP_TILE_ATTRIBUTION
    || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  directionsProvider: (import.meta.env.VITE_DIRECTIONS_PROVIDER || "google").toLowerCase(),
  directionsBaseUrl: import.meta.env.VITE_DIRECTIONS_BASE_URL || "https://www.google.com/maps/dir/",
};
