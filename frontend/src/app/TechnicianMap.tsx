import { useEffect, useMemo } from "react";
import L, { LatLngBounds } from "leaflet";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";

type Coordinates = { lat: number; lng: number; city: string };

type MapTechnician = {
  id: number;
  name: string;
  avatar: string;
  available: boolean;
  distanceKm: number | null;
  lat: number;
  lng: number;
  specialty: string;
};

function validPoint(point: { lat: number; lng: number }) {
  return Number.isFinite(point.lat) && Number.isFinite(point.lng)
    && Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180
    && !(point.lat === 0 && point.lng === 0);
}

function MapViewport({ points, selected }: { points: Array<[number, number]>; selected?: MapTechnician }) {
  const map = useMap();

  useEffect(() => {
    if (points.length === 1) map.setView(points[0], 13);
    if (points.length > 1) map.fitBounds(new LatLngBounds(points), { padding: [45, 45], maxZoom: 14 });
  }, [map, points]);

  useEffect(() => {
    if (selected && validPoint(selected)) map.flyTo([selected.lat, selected.lng], Math.max(map.getZoom(), 14));
  }, [map, selected]);

  return null;
}

function technicianIcon(technician: MapTechnician, selected: boolean) {
  const background = technician.available ? "#10b981" : "#64748b";
  return L.divIcon({
    className: "quoteai-map-marker",
    html: `<div style="width:${selected ? 44 : 38}px;height:${selected ? 44 : 38}px;border-radius:9999px;background:${background};border:3px solid white;box-shadow:0 4px 14px rgba(15,23,42,.35);display:flex;align-items:center;justify-content:center;color:white;font-size:12px;font-weight:800">${technician.avatar}</div>`,
    iconSize: [selected ? 44 : 38, selected ? 44 : 38],
    iconAnchor: [selected ? 22 : 19, selected ? 22 : 19],
    popupAnchor: [0, -24],
  });
}

const userIcon = L.divIcon({
  className: "quoteai-map-marker",
  html: '<div style="width:24px;height:24px;border-radius:9999px;background:#2563eb;border:4px solid white;box-shadow:0 0 0 8px rgba(37,99,235,.18),0 4px 12px rgba(15,23,42,.3)"></div>',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
  popupAnchor: [0, -16],
});

export default function TechnicianMap({ technicians, location, selectedId, onSelect, onContact }:
  { technicians: MapTechnician[]; location: Coordinates | null; selectedId: number | null; onSelect: (id: number) => void; onContact: (id: number) => void }) {
  const visibleTechnicians = technicians.filter(validPoint);
  const points = useMemo<Array<[number, number]>>(() => {
    const result = visibleTechnicians.map((technician) => [technician.lat, technician.lng] as [number, number]);
    if (location && validPoint(location)) result.unshift([location.lat, location.lng]);
    return result;
  }, [visibleTechnicians, location]);
  const selected = visibleTechnicians.find((technician) => technician.id === selectedId);
  const fallbackCenter: [number, number] = location && validPoint(location)
    ? [location.lat, location.lng]
    : points[0] ?? [36.8065, 10.1815];

  return (
    <MapContainer center={fallbackCenter} zoom={12} className="h-full w-full" scrollWheelZoom>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url={import.meta.env.VITE_MAP_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png"}
      />
      <MapViewport points={points} selected={selected} />
      {location && validPoint(location) && (
        <Marker position={[location.lat, location.lng]} icon={userIcon}>
          <Popup><strong>Votre position</strong><br />{location.city}</Popup>
        </Marker>
      )}
      {visibleTechnicians.map((technician) => (
        <Marker
          key={technician.id}
          position={[technician.lat, technician.lng]}
          icon={technicianIcon(technician, technician.id === selectedId)}
          eventHandlers={{ click: () => onSelect(technician.id) }}
        >
          <Popup>
            <div className="min-w-44">
              <strong>{technician.name}</strong>
              <div>{technician.specialty || "Technicien HVAC"}</div>
              <div>{technician.distanceKm == null ? "Distance indisponible" : `${technician.distanceKm.toFixed(1)} km`}</div>
              <button type="button" onClick={() => onContact(technician.id)} className="mt-2 rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white">
                Contacter
              </button>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
