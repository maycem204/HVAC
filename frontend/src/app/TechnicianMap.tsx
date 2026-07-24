import { useEffect, useMemo } from "react";
import L, { LatLngBounds } from "leaflet";
import { MapContainer, Marker, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { LeafletTileProvider } from "../providers/maps/LeafletTileProvider";
import { useInterfaceLanguage } from "./InterfaceLanguage";

type Coordinates = { lat: number; lng: number; city: string };

type MapTechnician = {
  id: number;
  name: string;
  avatar: string;
  available: boolean;
  distanceKm: number | null;
  lat: number;
  lng: number;
  liveLocationActive: boolean;
  specialty: string;
  rating: number;
  reviews: number;
  canRate: boolean;
};

function validPoint(point: { lat: number; lng: number }) {
  return Number.isFinite(point.lat) && Number.isFinite(point.lng)
    && Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180
    && !(point.lat === 0 && point.lng === 0);
}

function MapViewport({ points, selected }: { points: Array<[number, number]>; selected?: MapTechnician }) {
  const map = useMap();

  useEffect(() => {
    const container = map.getContainer();
    const refreshSize = () => map.invalidateSize({ animate: false });
    const observer = new ResizeObserver(refreshSize);
    observer.observe(container);
    const frame = window.requestAnimationFrame(refreshSize);
    const timer = window.setTimeout(refreshSize, 250);
    window.addEventListener("orientationchange", refreshSize);

    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      window.removeEventListener("orientationchange", refreshSize);
    };
  }, [map]);

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
  const hasPhoto = technician.avatar?.startsWith("data:image/");
  const content = hasPhoto
    ? `<img src="${technician.avatar}" alt="" style="width:100%;height:100%;border-radius:9999px;object-fit:cover"/>`
    : technician.avatar;
  return L.divIcon({
    className: "quoteai-map-marker",
    html: `<div style="width:${selected ? 44 : 38}px;height:${selected ? 44 : 38}px;border-radius:9999px;background:${background};border:3px solid white;box-shadow:0 4px 14px rgba(15,23,42,.35);display:flex;align-items:center;justify-content:center;color:white;font-size:12px;font-weight:800;overflow:hidden">${content}</div>`,
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

export default function TechnicianMap({ technicians, location, selectedId, onSelect, onContact, onRate }:
  { technicians: MapTechnician[]; location: Coordinates | null; selectedId: number | null; onSelect: (id: number) => void; onContact: (id: number) => void; onRate: (id: number) => void }) {
  const { language, text:t } = useInterfaceLanguage();
  const specialtyLabel=(value:string)=>language==="fr"?value:value
    .replace(/Climatisation/g,t("specialties.airConditioning"))
    .replace(/Réparation/g,t("specialties.repair"))
    .replace(/Chauffage/g,t("specialties.heating"))
    .replace(/Réfrigération/g,t("specialties.refrigeration"))
    .replace(/Pompe à chaleur/g,t("specialties.heatPump"))
    .replace(/Entretien/g,t("specialties.maintenance"));
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
      <LeafletTileProvider/>
      <MapViewport points={points} selected={selected} />
      {location && validPoint(location) && (
        <Marker position={[location.lat, location.lng]} icon={userIcon}>
          <Popup><strong>{t("interface.your.location")}</strong><br />{location.city}</Popup>
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
              {technician.avatar?.startsWith("data:image/")&&<img src={technician.avatar} alt={`Photo de ${technician.name}`} className="mb-2 h-14 w-14 rounded-full object-cover"/>}
              <strong>{technician.name}</strong>
              <div>{specialtyLabel(technician.specialty || t("interface.hvac.technician"))}</div>
              <div style={{color:technician.liveLocationActive?"#059669":"#64748b",fontSize:"12px"}}>{technician.liveLocationActive?t("interface.live.location"):t("interface.profile.location")}</div>
              <div style={{color:technician.reviews>0?"#d97706":"#64748b"}}>{technician.reviews>0?`★ ${technician.rating}/5 · ${t("interface.reviews",{count:technician.reviews})}`:t("interface.no.reviews")}</div>
              <div>{technician.distanceKm == null ? t("interface.distance.unavailable") : `${technician.distanceKm.toFixed(1)} km`}</div>
              <button type="button" onClick={() => onContact(technician.id)} className="mt-2 rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white">
                {t("interface.contact")}
              </button>
              {technician.canRate&&<button type="button" onClick={() => onRate(technician.id)} className="ml-1 mt-2 rounded border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700">{t("interface.rate")}</button>}
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
