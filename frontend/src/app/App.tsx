import { useState, useRef, useEffect, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import {
  MessageSquare, Calendar, MapPin, Star, Send, ChevronRight, LogOut, Zap,
  User, Wrench, Phone, Clock, CheckCircle2, Bell, TrendingUp, DollarSign,
  Users, Plus, X, Check, ArrowRight, Eye, EyeOff, Search, Upload,
  Edit2, ChevronLeft, AlertCircle, MessageCircle, Mic, MicOff, Navigation,
  Settings, BanIcon, Tag, Shield, Filter, ThumbsUp, ThumbsDown, RefreshCw,
  ChevronDown, Pencil, Save, Info,
} from "lucide-react";
import api from "../lib/api";
import TechnicianMap from "./TechnicianMap";
import ConversationsPanel from "./ConversationsPanel";
import { disconnectRealtime, realtimeSocket } from "../lib/socket";
import { clearAuthSession, getAuthToken, storeAuthSession } from "../lib/auth-storage";
import { useSpeechRecognition } from "../features/chatbot/useSpeechRecognition";
import type {
  AppUser, Appointment, BlockedSlot, ChatMsg, ClientTab, Lead, Notification,
  PriceDecision, PriceItem, Role, SuggestedSlot, Technician, TechTab,
  UserLocation, View,
} from "./domain";
import { mapAppointment, mapBlockedSlot, mapLead, mapNotification, mapTechnician } from "./mappers";

// ─── Types ────────────────────────────────────────────────────────────────────

// ─── Config statique (pas des données métier — restent en dur) ───────────────

const ALL_SPECIALIZATIONS = [
  "Climatisation", "Réparation", "Remplacement", "Installation",
  "Chauffage", "Ventilation", "Multi-split", "Maintenance préventive",
  "Réfrigération", "Pompe à chaleur",
];

const FAULT_SPECIALIZATION_MAP: Record<string, string[]> = {
  "Climatisation": ["Climatisation", "Réparation", "Réfrigération", "Multi-split", "Remplacement"],
  "Chauffage": ["Chauffage", "Pompe à chaleur", "Maintenance préventive"],
  "Ventilation": ["Ventilation", "Installation"],
  "Installation": ["Installation", "Multi-split"],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Avatar({ initials, color, size = "md" }: { initials: string; color: string; size?: "sm" | "md" | "lg" }) {
  const sz = size === "sm" ? "w-8 h-8 text-xs" : size === "lg" ? "w-12 h-12 text-base" : "w-10 h-10 text-sm";
  if (String(initials || "").startsWith("data:image/")) return <img src={initials} alt="Photo de profil" className={`${sz} rounded-full object-cover shrink-0 border border-white/40`}/>;
  return <div className={`${sz} ${color} rounded-full flex items-center justify-center text-white font-bold shrink-0`}>{initials}</div>;
}

function resizeProfileImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) return reject(new Error("Choisissez une image de moins de 5 Mo."));
    const image = new Image();
    const reader = new FileReader();
    image.onload = () => {
      const size = 256;
      const canvas = document.createElement("canvas");
      canvas.width = size; canvas.height = size;
      const context = canvas.getContext("2d");
      if (!context) return reject(new Error("Votre navigateur ne permet pas de redimensionner cette image."));
      const scale = Math.max(size / image.width, size / image.height);
      const width = image.width * scale; const height = image.height * scale;
      context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    image.onerror = () => reject(new Error("Format non reconnu. Utilisez une image JPEG, PNG ou WebP."));
    reader.onerror = () => reject(new Error("Impossible de lire le fichier sélectionné."));
    reader.onload = () => {
      if (typeof reader.result !== "string") return reject(new Error("Impossible de lire le fichier sélectionné."));
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function Badge({ children, color = "blue" }: { children: React.ReactNode; color?: "blue"|"green"|"amber"|"red"|"gray"|"purple" }) {
  const s: Record<string,string> = { blue:"bg-blue-50 text-blue-700 border-blue-100", green:"bg-emerald-50 text-emerald-700 border-emerald-100", amber:"bg-amber-50 text-amber-700 border-amber-100", red:"bg-red-50 text-red-700 border-red-100", gray:"bg-gray-50 text-gray-600 border-gray-100", purple:"bg-purple-50 text-purple-700 border-purple-100" };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${s[color]}`}>{children}</span>;
}

function ConfidenceBar({ value }: { value: number }) {
  const color = value >= 75 ? "bg-emerald-500" : value >= 45 ? "bg-amber-500" : "bg-red-400";
  const label = value >= 75 ? "Élevée" : value >= 45 ? "Moyenne" : "Faible";
  const tc = value >= 75 ? "text-emerald-600" : value >= 45 ? "text-amber-600" : "text-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className={`h-full ${color} rounded-full`} style={{ width:`${value}%` }}/></div>
      <span className={`text-xs font-medium ${tc} w-12`}>{label}</span>
    </div>
  );
}

function detectFaultType(messages: ChatMsg[]): string {
  const text = messages.map((m) => m.text).join(" ").toLowerCase();
  if (text.match(/clim|climatiseur|ac |froid|refroidit|split/)) return "Climatisation";
  if (text.match(/chauff|chaudière/)) return "Chauffage";
  if (text.match(/ventil/)) return "Ventilation";
  if (text.match(/install/)) return "Installation";
  return "Climatisation";
}

function normalizeSpecialization(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function technicianMatchesFault(technician: Technician, faultType: string): boolean {
  const expected = (FAULT_SPECIALIZATION_MAP[faultType] ?? [faultType]).map(normalizeSpecialization);
  return technician.specializations.some((specialization) => {
    const normalized = normalizeSpecialization(specialization);
    return expected.some((candidate) => normalized === candidate || normalized.includes(candidate) || candidate.includes(normalized));
  });
}

// ─── Mappers backend (snake_case) → frontend (camelCase) ─────────────────────
// Adapte ces mappers si le format réel renvoyé par ton API diffère.

// ─── Notification Panel ───────────────────────────────────────────────────────

function NotificationPanel({ notifications, onSelect, onReadAll, onClose }:
  { notifications: Notification[]; onSelect: (notification: Notification) => void; onReadAll: () => void; onClose: () => void }) {
  const unreadNotifications = notifications.filter((notification)=>!notification.read);
  const icons: Record<string, { el: React.ReactNode; cls: string }> = {
    lead: { el:<Tag className="w-3.5 h-3.5"/>, cls:"bg-blue-100 text-blue-600" },
    rdv: { el:<Calendar className="w-3.5 h-3.5"/>, cls:"bg-emerald-100 text-emerald-600" },
    price: { el:<DollarSign className="w-3.5 h-3.5"/>, cls:"bg-amber-100 text-amber-600" },
    rating: { el:<Star className="w-3.5 h-3.5"/>, cls:"bg-purple-100 text-purple-600" },
    system: { el:<Info className="w-3.5 h-3.5"/>, cls:"bg-gray-100 text-gray-600" },
    reassign: { el:<RefreshCw className="w-3.5 h-3.5"/>, cls:"bg-orange-100 text-orange-600" },
    message: { el:<MessageCircle className="w-3.5 h-3.5"/>, cls:"bg-cyan-100 text-cyan-700" },
  };
  return (
    <div className="fixed inset-0 z-50" onClick={onClose}>
      <div className="absolute top-14 right-4 w-96 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden" onClick={(e)=>e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div><div className="font-semibold text-sm text-foreground">Notifications</div><div className="text-xs text-muted-foreground">{unreadNotifications.length} non lues</div></div>
          <div className="flex items-center gap-2"><button onClick={onReadAll} className="text-xs text-primary hover:underline">Tout marquer lu</button><button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4"/></button></div>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {unreadNotifications.length === 0 ? <div className="py-12 text-center text-sm text-muted-foreground">Aucune nouvelle notification</div>
          : unreadNotifications.map((n) => {
            const ni = icons[n.type];
            return (
              <button key={n.id} onClick={()=>onSelect(n)} className={`w-full text-left px-4 py-3.5 border-b border-gray-50 hover:bg-gray-50 flex items-start gap-3 ${!n.read?"bg-blue-50/30":""}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${ni?.cls}`}>{ni?.el}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2"><div className={`text-sm text-foreground ${!n.read?"font-semibold":""}`}>{n.title}</div>{!n.read&&<span className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1"/>}</div>
                  <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{n.message}</div>
                  <div className="text-xs text-muted-foreground/60 mt-1">{n.time}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Profile Modal ────────────────────────────────────────────────────────────

function ProfileModal({ user, role, onClose, onSave }:
  { user: AppUser; role: Role; onClose: () => void; onSave: (u: AppUser) => void }) {
  const [form, setForm] = useState({ ...user });
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [techSpec, setTechSpec] = useState<string[]>([]);
  const [radius, setRadius] = useState(10);
  const [photoError, setPhotoError] = useState("");
  const isClient = role === "client";

  // Charge le profil technicien réel (spécialisations + rayon) depuis l'API
  useEffect(() => {
    if (isClient) return;
    api.get(`/technicians/${user.id}`).then((res) => {
      setTechSpec(res.data.specializations ?? []);
      setRadius(res.data.radius_km ?? 10);
    }).catch(() => {});
  }, [isClient, user.id]);

  function toggleSpec(s: string) { setTechSpec((p)=>p.includes(s)?p.filter((x)=>x!==s):[...p,s]); }

  async function selectPhoto(file?: File) {
    if (!file) return;
    setPhotoError("");
    try { const avatar = await resizeProfileImage(file); setForm((previous) => ({ ...previous, avatar })); }
    catch (error: any) { setPhotoError(error.message || "Photo invalide."); }
  }

  async function save() {
    setSaving(true);
    setPhotoError("");
    try {
      const { data } = await api.patch(`/users/${user.id}`, form);
      if (!isClient) {
        await api.patch(`/technicians/${user.id}`, { specializations: techSpec, radius_km: radius });
      }
      onSave(data);
      setSaved(true);
      setTimeout(() => { setSaved(false); onClose(); }, 1000);
    } catch (err:any) {
      console.error(err);
      setPhotoError(err.response?.data?.error || "Impossible d’enregistrer le profil.");
    } finally {
      setSaving(false);
    }
  }

  function field(key: keyof AppUser, label: string, type="text", ph="") {
    return <div><label className="block text-xs font-medium mb-1.5">{label}</label><input type={type} placeholder={ph} value={form[key] as string} onChange={(e)=>setForm((p)=>({...p,[key]:e.target.value}))} className={`w-full h-10 px-3 rounded-lg border border-gray-200 text-sm bg-gray-50 focus:outline-none ${isClient?"focus:border-blue-400":"focus:border-emerald-400"} transition-all`}/></div>;
  }
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-xl overflow-hidden" onClick={(e)=>e.stopPropagation()}>
        <div className={`h-1.5 ${isClient?"bg-blue-500":"bg-emerald-500"}`}/>
        <div className="p-6 max-h-[85vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-6"><h3 className="text-lg font-bold text-foreground" style={{ fontFamily:"Onest,sans-serif" }}>Mon profil</h3><button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5"/></button></div>
          <div className="flex items-center gap-4 mb-6 p-4 bg-gray-50 rounded-xl">
            <Avatar initials={form.avatar || form.name.split(" ").map((n)=>n[0]).join("").slice(0,2).toUpperCase() || "?"} color={isClient?"bg-blue-500":"bg-emerald-500"} size="lg"/>
            <div><div className="font-semibold text-foreground">{form.name||"Votre nom"}</div><Badge color={isClient?"blue":"green"}>{isClient?"Client":"Technicien"}</Badge></div>
          </div>
          {!isClient&&<div className="mb-5"><label className="block text-xs font-medium mb-1.5">Photo de profil</label><label className="h-10 px-3 rounded-lg border border-gray-200 bg-gray-50 text-sm inline-flex items-center gap-2 cursor-pointer hover:bg-gray-100"><Upload className="w-4 h-4"/>Choisir une photo<input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event)=>selectPhoto(event.target.files?.[0])}/></label>{photoError&&<div className="text-xs text-red-600 mt-1">{photoError}</div>}</div>}
          <div className="space-y-4">
            <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Informations personnelles</div>
            <div className="grid grid-cols-2 gap-3">{field("name","Nom complet","text","Votre nom")}{field("email","Email","email","votre@email.com")}{field("phone","Téléphone","tel","+213 6 xx xx xx")}{field("city","Ville","text","Alger")}</div>
            {field("address","Adresse","text","Numéro, rue, quartier…")}
            {!isClient && (
              <div className="pt-2 space-y-4">
                <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Spécialisations</div>
                <div className="flex flex-wrap gap-2">{ALL_SPECIALIZATIONS.map((s)=><button key={s} onClick={()=>toggleSpec(s)} className={`px-3 py-1.5 rounded-full text-xs border transition-all ${techSpec.includes(s)?"bg-emerald-500 text-white border-emerald-500":"bg-gray-50 text-muted-foreground border-gray-200 hover:border-emerald-300"}`}>{techSpec.includes(s)&&<Check className="w-3 h-3 inline mr-1"/>}{s}</button>)}</div>
                <div><div className="flex items-center justify-between mb-2"><div className="text-xs font-medium">Rayon d'intervention</div><span className="text-sm font-bold text-emerald-600">{radius} km</span></div><input type="range" min={2} max={50} value={radius} onChange={(e)=>setRadius(Number(e.target.value))} className="w-full accent-emerald-500"/></div>
              </div>
            )}
          </div>
          <div className="mt-6">{saved?<div className="flex items-center justify-center gap-2 h-11 text-emerald-600 font-medium text-sm"><CheckCircle2 className="w-5 h-5"/>Profil enregistré !</div>:<button onClick={save} disabled={saving} className={`w-full h-11 rounded-xl text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 ${isClient?"bg-blue-600 hover:bg-blue-700":"bg-emerald-500 hover:bg-emerald-600"}`}><Save className="w-4 h-4"/>{saving?"Enregistrement…":"Enregistrer"}</button>}</div>
        </div>
      </div>
    </div>
  );
}

// ─── Location Modal ───────────────────────────────────────────────────────────
// Géolocalisation réelle : on géocode via l'API (proxy vers un service de
// géocodage) au lieu de renvoyer des coordonnées codées en dur.

function LocationModal({ role, user, onDone }: { role: Role; user: AppUser; onDone: (loc: UserLocation | null) => void }) {
  const [state, setState] = useState<"ask"|"loading"|"done"|"denied">("ask");
  const [city, setCity] = useState(user.city || "");
  const [geoError, setGeoError] = useState("");
  const isClient = role === "client";

  async function useProfileLocation() {
    const query = [user.address, user.city].filter(Boolean).join(", ");
    if (!query) return onDone(null);
    try {
      const { data } = await api.get("/geocode/forward", { params: { city: query } });
      onDone({ lat:Number(data.lat), lng:Number(data.lng), city:user.city || data.city, district:user.address || data.district || user.city });
    } catch { onDone({ lat:Number(user.lat||0), lng:Number(user.lng||0), city:user.city, district:user.address || user.city }); }
  }

  function requestGeo() {
    if (!("geolocation" in navigator)) {
      setGeoError("GPS indisponible sur ce navigateur. Saisissez votre ville manuellement.");
      setState("denied");
      useProfileLocation();
      return;
    }

    setState("loading");
    setGeoError("");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        let loc: UserLocation = {
          lat: latitude,
          lng: longitude,
          city: "Position GPS",
          district: "Position actuelle",
        };

        try {
          const { data } = await api.get("/geocode/reverse", { params: { lat: latitude, lng: longitude } });
          loc = {
            lat: latitude,
            lng: longitude,
            city: data.city || loc.city,
            district: data.district || data.city || loc.district,
          };
        } catch {
          loc = {
            ...loc,
            city: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
          };
        }

        setState("done");
        setTimeout(() => onDone(loc), 800);
      },
      (error) => {
        const messages: Record<number, string> = {
          [error.PERMISSION_DENIED]: "Autorisez la localisation dans le navigateur puis reessayez.",
          [error.POSITION_UNAVAILABLE]: "Position GPS indisponible. Saisissez votre ville manuellement.",
          [error.TIMEOUT]: "La localisation a pris trop de temps. Reessayez ou saisissez votre ville.",
        };
        setGeoError(messages[error.code] || "GPS indisponible. Saisissez votre ville manuellement.");
        setState("denied");
        useProfileLocation();
      },
      { enableHighAccuracy: true, maximumAge: 60000, timeout: 15000 }
    );
  }

  async function manualSubmit() {
    if (!city.trim()) return;
    try {
      const { data } = await api.get("/geocode/forward", { params: { city } });
      onDone({ lat: data.lat, lng: data.lng, city: data.city ?? city, district: data.district ?? city });
    } catch {
      // Si le géocodage échoue, on avance quand même avec la ville saisie
      onDone({ lat: 0, lng: 0, city, district: city });
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50/40 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-6 ${isClient?"bg-blue-50":"bg-emerald-50"}`}><Navigation className={`w-6 h-6 ${isClient?"text-blue-600":"text-emerald-600"}`}/></div>
        <h2 className="text-xl font-bold text-foreground mb-2" style={{ fontFamily:"Onest,sans-serif" }}>{isClient?"Trouvez les techniciens près de vous":"Définissez votre zone d'intervention"}</h2>
        <p className="text-sm text-muted-foreground mb-6">{isClient?"Votre position nous permet d'afficher les techniciens disponibles les plus proches, spécialisés selon votre type de panne.":"Votre zone permet aux clients de vous trouver en priorité selon leur panne et votre spécialisation."}</p>
        {state==="ask" && (
          <div className="space-y-3">
            <button onClick={requestGeo} className={`w-full h-11 rounded-xl text-white text-sm font-semibold flex items-center justify-center gap-2 ${isClient?"bg-blue-600 hover:bg-blue-700":"bg-emerald-600 hover:bg-emerald-700"}`}><Navigation className="w-4 h-4"/>Utiliser ma position GPS</button>
            <div className="relative"><div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-100"/></div><div className="relative flex justify-center"><span className="px-3 bg-white text-xs text-muted-foreground">ou saisissez votre ville</span></div></div>
            <div className="flex gap-2"><input placeholder="Ex: Alger, Oran…" value={city} onChange={(e)=>setCity(e.target.value)} onKeyDown={(e)=>e.key==="Enter"&&manualSubmit()} className="flex-1 h-10 px-3 rounded-lg border border-gray-200 text-sm bg-gray-50 focus:outline-none focus:border-blue-400"/><button onClick={manualSubmit} disabled={!city.trim()} className="h-10 px-4 rounded-lg bg-gray-800 text-white text-sm disabled:opacity-40">OK</button></div>
            <button onClick={useProfileLocation} className="w-full text-center text-xs text-muted-foreground py-1 hover:text-foreground">Continuer avec mon adresse et ma ville</button>
          </div>
        )}
        {state==="loading" && <div className="flex flex-col items-center py-6 gap-3"><div className="w-10 h-10 rounded-full border-2 border-blue-500 border-t-transparent animate-spin"/><div className="text-sm text-muted-foreground">Localisation en cours…</div></div>}
        {state==="done" && <div className="flex flex-col items-center py-6 gap-3"><CheckCircle2 className="w-10 h-10 text-emerald-500"/><div className="text-sm font-medium">Position obtenue</div></div>}
        {state==="denied" && (
          <div className="space-y-3">
            <div className="flex items-start gap-2 p-3 bg-amber-50 rounded-lg border border-amber-100 text-xs text-amber-700"><AlertCircle className="w-4 h-4 shrink-0 mt-0.5"/>{geoError || "Accès GPS refusé. Saisissez votre ville manuellement."}</div>
            <div className="flex gap-2"><input placeholder="Votre ville…" value={city} onChange={(e)=>setCity(e.target.value)} className="flex-1 h-10 px-3 rounded-lg border border-gray-200 text-sm bg-gray-50 focus:outline-none focus:border-blue-400"/><button onClick={manualSubmit} disabled={!city.trim()} className="h-10 px-4 rounded-lg bg-gray-800 text-white text-sm disabled:opacity-40">OK</button></div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Landing ──────────────────────────────────────────────────────────────────

function Landing({ onSelect }: { onSelect: (role: Role) => void }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex flex-col">
      <nav className="px-8 py-5 flex items-center justify-between">
        <div className="flex items-center gap-2.5"><div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center shadow-sm"><Zap className="w-4 h-4 text-white"/></div><span className="font-bold text-lg text-foreground" style={{ fontFamily:"Onest,sans-serif" }}>QuoteAI</span></div>
        <div className="flex gap-2"><button onClick={()=>onSelect("client")} className="h-9 px-4 text-sm text-muted-foreground hover:text-foreground">Connexion client</button><button onClick={()=>onSelect("technician")} className="h-9 px-4 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 font-medium">Espace technicien</button></div>
      </nav>
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-16 text-center">
        <div className="inline-flex items-center gap-2 mb-6 px-3 py-1.5 rounded-full bg-blue-100 text-blue-700 text-xs font-medium"><span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"/>Devis HVAC instantané par intelligence artificielle</div>
        <h1 className="text-5xl md:text-6xl font-black text-foreground mb-6 leading-tight max-w-3xl" style={{ fontFamily:"Onest,sans-serif" }}>Votre devis HVAC<br/><span className="text-primary">en quelques secondes.</span></h1>
        <p className="text-lg text-muted-foreground max-w-xl mb-14">Décrivez votre problème, obtenez une estimation de prix et trouvez un technicien qualifié près de chez vous — sans attente, sans appel.</p>
        <div className="grid md:grid-cols-2 gap-5 max-w-2xl w-full">
          {[{r:"client" as Role,t:"Je suis un client",d:"Obtenez un devis, trouvez un technicien et réservez.",Icon:User,c:"blue"},{r:"technician" as Role,t:"Je suis technicien",d:"Gérez vos leads, tarifs et agenda.",Icon:Wrench,c:"emerald"}].map(({r,t,d,Icon,c})=>(
            <button key={r} onClick={()=>onSelect(r)} className="group bg-white rounded-2xl p-8 border border-gray-100 shadow-sm hover:shadow-lg transition-all text-left">
              <div className={`w-12 h-12 rounded-xl bg-${c}-50 flex items-center justify-center mb-5 group-hover:bg-${c}-100 transition-colors`}><Icon className={`w-6 h-6 text-${c}-600`}/></div>
              <div className="text-lg font-bold text-foreground mb-1" style={{ fontFamily:"Onest,sans-serif" }}>{t}</div>
              <div className="text-sm text-muted-foreground mb-4">{d}</div>
              <div className={`flex items-center gap-1.5 text-sm text-${c}-600 font-medium`}>Accéder <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform"/></div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Auth Form ────────────────────────────────────────────────────────────────
// Plus de "Continuer avec Google" simulé : soit tu branches une vraie stratégie
// OAuth côté backend (Passport Google, callback -> JWT), soit tu retires ce
// bouton pour ne pas promettre une fonctionnalité qui n'existe pas encore.

function AuthForm({ role, onBack, onLogin }: { role: Role; onBack: () => void; onLogin: (u: AppUser, token: string) => void }) {
  const [mode, setMode] = useState<"login"|"register">("login");
  const [showPass, setShowPass] = useState(false);
  const [form, setForm] = useState({ name:"", email:"", password:"", city:"" });
  const [error, setError] = useState<string|null>(null);
  const [loading, setLoading] = useState(false);
  const isClient = role === "client";
  const cl = isClient?"text-blue-600":"text-emerald-600";
  const bg = isClient?"bg-blue-600 hover:bg-blue-700":"bg-emerald-600 hover:bg-emerald-700";
  const focus = isClient?"focus:border-blue-400":"focus:border-emerald-400";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const url = mode === "login" ? "/login" : "/register";
      const payload = mode === "login"
        ? { email: form.email, password: form.password, role }
        : { name: form.name, email: form.email, password: form.password, role, city: form.city };
      const { data } = await api.post(url, payload);


      storeAuthSession(data.token, data.user);

      onLogin(data.user, data.token);
    } catch (err: any) {
      setError(err.response?.data?.error ?? "Une erreur est survenue. Vérifiez vos identifiants.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50/40 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6"><ChevronRight className="w-4 h-4 rotate-180"/>Retour</button>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <div className="flex items-center gap-3 mb-8">
            <div className={`w-10 h-10 rounded-xl ${isClient?"bg-blue-50":"bg-emerald-50"} flex items-center justify-center`}>{isClient?<User className={`w-5 h-5 ${cl}`}/>:<Wrench className={`w-5 h-5 ${cl}`}/>}</div>
            <div><div className="font-bold text-foreground text-sm">{isClient?"Espace client":"Espace technicien"}</div><div className="text-xs text-muted-foreground">{mode==="login"?"Connexion":"Créer un compte"}</div></div>
          </div>
          {error && <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-100 text-xs text-red-600 flex items-center gap-2"><AlertCircle className="w-4 h-4 shrink-0"/>{error}</div>}
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode==="register"&&<div><label className="block text-xs font-medium mb-1.5">Nom complet</label><input required value={form.name} onChange={(e)=>setForm((p)=>({...p,name:e.target.value}))} className={`w-full h-11 px-4 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none ${focus}`}/></div>}
            {mode==="register"&&<div className={!isClient?"p-3 rounded-xl border-2 border-emerald-200 bg-emerald-50/50":""}><label className="block text-xs font-semibold mb-1.5">{isClient?"Ville":"Ville ou localisation du local professionnel *"}</label><input required={!isClient} minLength={2} maxLength={120} autoComplete="address-level2" placeholder="Ex : Houmt Souk, Djerba, Zarzis, Alger…" value={form.city} onChange={(e)=>setForm((p)=>({...p,city:e.target.value}))} className={`w-full h-11 px-4 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none ${focus}`}/>{!isClient&&<p className="mt-1.5 text-[11px] text-emerald-800">Champ obligatoire — indiquez la ville où vous travaillez ou l’emplacement de votre local.</p>}</div>}
            <div><label className="block text-xs font-medium mb-1.5">Email</label><input type="email" required placeholder="votre@email.com" value={form.email} onChange={(e)=>setForm((p)=>({...p,email:e.target.value}))} className={`w-full h-11 px-4 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none ${focus}`}/></div>
            <div><label className="block text-xs font-medium mb-1.5">Mot de passe</label><div className="relative"><input type={showPass?"text":"password"} required minLength={mode==="register"?8:1} maxLength={72} autoComplete={mode==="register"?"new-password":"current-password"} placeholder="8 caractères minimum" value={form.password} onChange={(e)=>setForm((p)=>({...p,password:e.target.value}))} className={`w-full h-11 px-4 pr-10 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none ${focus}`}/><button type="button" onClick={()=>setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">{showPass?<EyeOff className="w-4 h-4"/>:<Eye className="w-4 h-4"/>}</button></div>{mode==="register"&&<p className="mt-1.5 text-[11px] text-muted-foreground">Évitez votre nom, votre e-mail et les mots de passe courants.</p>}</div>
            <button type="submit" disabled={loading} className={`w-full h-11 rounded-xl ${bg} text-white text-sm font-semibold mt-2 disabled:opacity-50`}>{loading?"Chargement…":mode==="login"?"Se connecter":"Créer mon compte"}</button>
          </form>
          <div className="mt-5 text-center text-sm text-muted-foreground">{mode==="login"?<>Pas encore de compte ?{" "}<button onClick={()=>setMode("register")} className={`${cl} font-medium hover:underline`}>S'inscrire</button></>:<>Déjà un compte ?{" "}<button onClick={()=>setMode("login")} className={`${cl} font-medium hover:underline`}>Se connecter</button></>}</div>
        </div>
      </div>
    </div>
  );
}

// ─── Client Dashboard ─────────────────────────────────────────────────────────

function ClientDashboard({ user, location, technicians, onLogout, onUpdateUser }:
  { user: AppUser; location: UserLocation | null; technicians: Technician[]; onLogout: () => void; onUpdateUser: (u: AppUser) => void }) {
  const [tab, setTab] = useState<ClientTab>("chat");
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [contactedTechs, setContactedTechs] = useState<number[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [contactTechId, setContactTechId] = useState<number|null>(null);
  const unread = notifications.filter((n)=>!n.read).length;
  const tabs = [{ id:"chat" as ClientTab,label:"Devis IA",icon:MessageSquare },{ id:"rdv" as ClientTab,label:"Rendez-vous",icon:Calendar },{ id:"map" as ClientTab,label:"Techniciens",icon:MapPin },{ id:"messages" as ClientTab,label:"Messages",icon:MessageCircle }];

  useEffect(() => {
    api.get("/notifications").then((res) => setNotifications(res.data.map(mapNotification))).catch(console.error);
    api.get("/appointments").then((res) => {
      setAppointments(res.data.map(mapAppointment));
      setContactedTechs(res.data.map((a: any) => a.technician_id));
    }).catch(console.error);
  }, []);

  useEffect(() => {
    const socket = realtimeSocket();
    if (!socket) return;
    const refreshNotifications = () => api.get("/notifications").then((res) => setNotifications(res.data.map(mapNotification))).catch(console.error);
    const refreshAppointments = () => api.get("/appointments").then((res) => setAppointments(res.data.map(mapAppointment))).catch(console.error);
    socket.on("message:new", refreshNotifications);
    socket.on("notification:new", refreshNotifications);
    socket.on("appointment:updated", refreshAppointments);
    return () => {
      socket.off("message:new", refreshNotifications);
      socket.off("notification:new", refreshNotifications);
      socket.off("appointment:updated", refreshAppointments);
    };
  }, []);

  function markRead(id: number) {
    setNotifications((ns) => ns.map((n) => (n.id === id ? { ...n, read: true } : n)));
    api.patch(`/notifications/${id}/read`).catch(console.error);
  }
  function markAllRead() {
    setNotifications((ns) => ns.map((n) => ({ ...n, read: true })));
    api.patch("/notifications/read-all").catch(console.error);
  }

  function openNotification(notification: Notification) {
    markRead(notification.id);
    const target: ClientTab = notification.type === "message" ? "messages" : notification.type === "rdv" || notification.type === "price" || notification.type === "rating" ? "rdv" : "chat";
    setTab(target); setNotifOpen(false);
  }
  const contactTechnician = useCallback((id: number) => setContactTechId(id), []);
  const markContacted = useCallback((id: number) => setContactedTechs((items) => items.includes(id) ? items : [...items, id]), []);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="bg-white border-b border-border px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3"><div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center"><Zap className="w-3.5 h-3.5 text-white"/></div><span className="font-bold text-foreground" style={{ fontFamily:"Onest,sans-serif" }}>QuoteAI</span></div>
        <div className="flex items-center gap-3">
          {location&&<div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground bg-gray-50 px-2.5 py-1 rounded-full border border-gray-200"><Navigation className="w-3 h-3 text-blue-500"/>{location.city}</div>}
          <div className="relative"><button onClick={()=>setNotifOpen(!notifOpen)} className="relative w-9 h-9 rounded-xl hover:bg-gray-100 flex items-center justify-center text-muted-foreground hover:text-foreground"><Bell className="w-5 h-5"/>{unread>0&&<span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">{unread}</span>}</button></div>
          <button onClick={()=>setProfileOpen(true)} className="flex items-center gap-2 hover:bg-gray-50 rounded-xl px-2 py-1 transition-colors"><Avatar initials={user.avatar || user.name.slice(0,2).toUpperCase()} color="bg-blue-500" size="sm"/><span className="text-sm font-medium hidden sm:block">{user.name}</span></button>
          <button onClick={onLogout} className="text-muted-foreground hover:text-foreground"><LogOut className="w-4 h-4"/></button>
        </div>
      </header>
      <div className="bg-white border-b border-border px-6">
        <div className="flex gap-1">{tabs.map((t)=><button key={t.id} onClick={()=>setTab(t.id)} className={`flex items-center gap-2 px-4 py-3.5 text-sm font-medium border-b-2 transition-all ${tab===t.id?"border-primary text-primary":"border-transparent text-muted-foreground hover:text-foreground"}`}><t.icon className="w-4 h-4"/>{t.label}</button>)}</div>
      </div>
      <div className="flex-1 overflow-hidden">
        {tab==="chat"&&<ClientChat technicians={technicians} location={location} onContact={contactTechnician} onAppointmentCreated={(appointment)=>setAppointments((items)=>items.some((item)=>item.id===appointment.id)?items:[...items,appointment])}/>}
        {tab==="rdv"&&(
          <ClientRdv technicians={technicians} appointments={appointments} setAppointments={setAppointments}/>
        )}
        {tab==="map"&&<ClientMap technicians={technicians} location={location} contactedTechs={contactedTechs} onContact={contactTechnician}/>}
        {tab==="messages"&&<ConversationsPanel onContacted={markContacted}/>}
      </div>
      {notifOpen&&<NotificationPanel notifications={notifications} onSelect={openNotification} onReadAll={markAllRead} onClose={()=>setNotifOpen(false)}/>}
      {profileOpen&&(
        <ProfileModal user={user} role="client" onClose={()=>setProfileOpen(false)} onSave={(u)=>{ onUpdateUser(u); setProfileOpen(false); }}/>
      )}
      {contactTechId!=null&&(
        <ConversationsPanel initialTechnician={technicians.find((technician)=>technician.id===contactTechId) ?? null} onContacted={markContacted} onClose={()=>setContactTechId(null)}/>
      )}
    </div>
  );
}

// ─── Client Chat ──────────────────────────────────────────────────────────────
// Chaque message part au backend. Le fournisseur LLM actif mène la clarification et le moteur
// déterministe produit le devis dès que les informations sont suffisantes.

type ScheduleRequest = { date: string | null; period: "morning" | "afternoon" | "evening" | "any" };

function localIsoDate(offsetDays: number) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
}

function schedulingIntent(text: string): ScheduleRequest | null {
  const normalized = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const date = /\baujourd[’']?hui\b/.test(normalized) ? localIsoDate(0)
    : /\bdemain\b/.test(normalized) ? localIsoDate(1) : null;
  const period = /apres[ -]?midi/.test(normalized) ? "afternoon"
    : /\bmatin(?:ee)?\b/.test(normalized) ? "morning"
      : /\bsoir(?:ee)?\b/.test(normalized) ? "evening" : "any";
  return date || period !== "any" ? { date, period } : null;
}

function readableDistance(distanceKm: number | null) {
  if (distanceKm == null) return "distance indisponible";
  return distanceKm < 1 ? `${Math.max(1, Math.round(distanceKm * 1000))} m` : `${distanceKm.toFixed(1)} km`;
}

function ClientChat({ technicians, location, onContact, onAppointmentCreated }: { technicians: Technician[]; location: UserLocation | null; onContact: (id: number) => void; onAppointmentCreated: (appointment: Appointment) => void }) {
  const [messages, setMessages] = useState<ChatMsg[]>([{ role:"bot", text:"Bonjour ! Décrivez votre problème HVAC ou utilisez le micro." }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [quote, setQuote] = useState<{ price:number; low:number; high:number; conf:number; currency:string; subtotal:number; minimumAdjustment:number; extraction:any; lines:any[]; matches:any[] }|null>(null);
  const [priceDecision, setPriceDecision] = useState<PriceDecision>(null);
  const [showSlots, setShowSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<SuggestedSlot|null>(null);
  const [proposedSlots, setProposedSlots] = useState<SuggestedSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState("");
  const [booked, setBooked] = useState(false);
  const [customDate, setCustomDate] = useState("");
  const [scheduleRequest, setScheduleRequest] = useState<ScheduleRequest>({ date:null, period:"any" });
  const bottomRef = useRef<HTMLDivElement>(null);
  const { isListening, supported, toggle:toggleMic } = useSpeechRecognition((text)=>setInput((p)=>p+(p?" ":"")+text));
  const faultType = detectFaultType(messages);
  const availableTechs = technicians.filter((technician)=>technician.available);
  const specialists = availableTechs.filter((technician)=>technicianMatchesFault(technician, faultType));
  // Ne jamais afficher une liste vide si des professionnels HVAC sont disponibles : les
  // spécialistes exacts restent prioritaires, puis les généralistes peuvent diagnostiquer.
  const matchingTechs = specialists.length > 0 ? specialists : availableTechs;
  const urgency = /urgent|urgence|fumée|fumee|odeur de brûlé|odeur de brule|fuite|étincelle|etincelle/i.test(messages.map((message)=>message.text).join(" ")) ? "critical" : /rapidement|aujourd'hui|vite|en panne complète/i.test(messages.map((message)=>message.text).join(" ")) ? "urgent" : "normal";
  async function loadSuggestedSlots() {
    setSlotsLoading(true); setSelectedSlot(null); setSlotsError("");
    try {
      const { data } = await api.get("/availability/suggestions", { params: { specialty: faultType, urgency, date: scheduleRequest.date || undefined, period: scheduleRequest.period } });
      setProposedSlots((data.slots || []).map((slot: any) => ({ date: slot.date, time: String(slot.time).slice(0,5), techId: Number(slot.technician_id), distanceKm: slot.distance_km == null ? null : Number(slot.distance_km), label: new Date(`${slot.date}T12:00:00`).toLocaleDateString("fr-FR", { weekday:"long", day:"numeric", month:"short" }) })));
    } catch (err) { console.error(err); setProposedSlots([]); setSlotsError("Impossible de consulter les agendas pour le moment. Réessayez dans quelques instants."); }
    finally { setSlotsLoading(false); }
  }
  useEffect(()=>{ bottomRef.current?.scrollIntoView({behavior:"smooth"}); },[messages,quote,showSlots,priceDecision]);

  async function send(text: string) {
    if (loading||!text.trim()) return;
    const nextMessages = [...messages, { role:"user" as const, text }];
    const directSchedule = schedulingIntent(text);
    if (directSchedule) setScheduleRequest(directSchedule);
    setMessages(nextMessages); setInput(""); setLoading(true); setQuote(null); setPriceDecision(null);
    try {
      const { data } = await api.post("/api/pricing/quote", {
        text,
        history: nextMessages.slice(0, -1),
        location: location ? { city: location.city, lat: location.lat, lng: location.lng } : undefined,
      });
      const llmSchedule = data.extraction?.schedule_request;
      if (llmSchedule && (/^\d{4}-\d{2}-\d{2}$/.test(String(llmSchedule.date || "")) || ["morning","afternoon","evening"].includes(llmSchedule.period))) {
        setScheduleRequest({ date: /^\d{4}-\d{2}-\d{2}$/.test(String(llmSchedule.date || "")) ? llmSchedule.date : directSchedule?.date || null, period: ["morning","afternoon","evening"].includes(llmSchedule.period) ? llmSchedule.period : directSchedule?.period || "any" });
      }
      if (data.status === "quote") {
        setQuote({ price: data.calculation.total, low: data.calculation.range.min, high: data.calculation.range.max, conf: Math.round(data.confidence * 100), currency: data.calculation.currency, subtotal: data.calculation.subtotal ?? data.calculation.total, minimumAdjustment: data.calculation.service_minimum_adjustment ?? 0, extraction: data.extraction || {}, lines: data.calculation.lines || [], matches: data.matches || [] });
      }
      const reply = data.question || data.message;
      setMessages((m)=>[...m,{role:"bot",text:reply || "Pouvez-vous préciser votre problème HVAC ?"}]);
    } catch (err: any) {
      console.error(err);
      const serverMessage = err?.response?.data?.error;
      const status = Number(err?.response?.status || 0);
      const reply = status > 0 && status < 500 && serverMessage
        ? serverMessage
        : "Désolé, le service de devis est momentanément indisponible.";
      setMessages((m)=>[...m,{role:"bot",text:reply}]);
    } finally {
      setLoading(false);
    }
  }

  function handlePriceDecision(d: PriceDecision) {
    setPriceDecision(d);
    if (d==="accept") { setMessages((m)=>[...m,{role:"user",text:"J'accepte ce prix."},{role:"bot",text:`Je consulte maintenant les agendas des spécialistes en ${faultType}.`}]); setShowSlots(true); loadSuggestedSlots(); }
    else if (d==="decline") setMessages((m)=>[...m,{role:"user",text:"Je décline ce prix."},{role:"bot",text:"Pas de problème. Souhaitez-vous une évaluation gratuite sur site ? Un technicien pourra vous donner un devis précis."}]);
  }

  async function confirmSlot() {
    if (!selectedSlot) return;
    const tech = technicians.find((t)=>t.id===selectedSlot.techId); if(!tech) return;
    try {
      const { data } = await api.post("/appointments", {
        technicianId: tech.id,
        date: selectedSlot.date,
        time: selectedSlot.time,
        service: `Diagnostic ${faultType}`,
        faultType,
        estimatedPrice: quote?.price ?? 0,
        currency: quote?.currency || "EUR",
      });
      onAppointmentCreated(mapAppointment(data));
      setBooked(true); setShowSlots(false);
      setMessages((m)=>[...m,{role:"bot",text:`Demande envoyée ! ${selectedSlot.label} à ${selectedSlot.time} avec ${tech.name} (spécialiste ${faultType}). Le rendez-vous apparaîtra comme confirmé dès que le technicien l’acceptera.`}]);
    } catch (err) {
      console.error(err);
      setMessages((m)=>[...m,{role:"bot",text:"Impossible de confirmer le rendez-vous, réessayez."}]);
    }
  }

  const suggestions = ["Ma clim Daikin split ne refroidit plus","Climatiseur LG en panne","Chaudière Carrier n'allume plus"];
  return (
    <div className="flex flex-col max-w-2xl mx-auto w-full p-4 md:p-6" style={{ height:"calc(100vh - 112px)" }}>
      <div className="flex-1 overflow-y-auto space-y-4 pb-4">
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0"><Zap className="w-4 h-4 text-white"/></div>
          <div className="text-sm text-blue-800"><strong>Devis gratuit et instantané.</strong> Décrivez votre panne ou utilisez le micro.</div>
        </div>
        {messages.map((m,i)=>(
          <div key={i} className={`flex gap-3 ${m.role==="user"?"justify-end":"justify-start"}`}>
            {m.role==="bot"&&<div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0 mt-0.5"><Zap className="w-3.5 h-3.5 text-white"/></div>}
            <div dir={/[\u0600-\u06ff]/.test(m.text)?"rtl":"ltr"} className={`max-w-[78%] text-sm px-4 py-3 rounded-2xl leading-relaxed shadow-sm ${m.role==="user"?"bg-primary text-white rounded-br-sm":"bg-white text-foreground rounded-bl-sm border border-gray-100"}`}>{m.text}</div>
          </div>
        ))}
        {loading&&<div className="flex gap-3"><div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0"><Zap className="w-3.5 h-3.5 text-white"/></div><div className="bg-white border border-gray-100 rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1.5 items-center shadow-sm">{[0,150,300].map((d)=><span key={d} className="w-2 h-2 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay:`${d}ms` }}/>)}</div></div>}
        {quote&&(
          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-4 text-white">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs font-medium opacity-80 mb-1">ESTIMATION — {faultType.toUpperCase()}</div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-black" style={{ fontFamily:"Onest,sans-serif" }}>{quote.price.toLocaleString("fr-FR")} {quote.currency}</span>
                    <span className="text-sm opacity-75">{quote.low.toLocaleString("fr-FR")}–{quote.high.toLocaleString("fr-FR")} {quote.currency}</span>
                  </div>
                </div>
                <div className="text-right text-xs opacity-80">
                  <div>Confiance</div><div className="text-lg font-bold opacity-100">{quote.conf}%</div>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <div className="flex-1 h-1 bg-white/20 rounded-full">
                  <div className="h-1 bg-white rounded-full" style={{ width:`${quote.conf}%` }}/>
                </div>
              </div>
              {quote.minimumAdjustment > 0 && <div className="mt-2 text-xs opacity-80">Minimum local de déplacement et d’intervention inclus.</div>}
            </div>
            <details open className="border-t border-gray-100 bg-slate-50/70">
              <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-800">Vérifier l’analyse et le calcul</summary>
              <div className="px-4 pb-4 space-y-3 text-xs text-slate-700">
                <div className="grid grid-cols-2 gap-2">
                  <div><span className="text-slate-500">Pays :</span> {quote.extraction.country || "Non déterminé"}</div>
                  <div><span className="text-slate-500">Urgence :</span> {quote.extraction.urgency || "Non déterminée"}</div>
                  <div><span className="text-slate-500">Complexité :</span> {quote.extraction.complexity || "Non déterminée"}</div>
                  <div><span className="text-slate-500">Saison :</span> {quote.extraction.season || "Non déterminée"}</div>
                  <div><span className="text-slate-500">Marque :</span> {quote.extraction.brand || "Non indiquée"}</div>
                  <div><span className="text-slate-500">Âge :</span> {quote.extraction.equipment_age_years != null ? `${quote.extraction.equipment_age_years} an(s)` : quote.extraction.equipment_age_band || "Non indiqué"}</div>
                </div>
                {(quote.extraction.faults || []).map((fault:any,index:number)=>{
                  const line=quote.lines[index]; const match=quote.matches[index];
                  return <div key={index} className="rounded-lg border border-slate-200 bg-white p-3 space-y-1">
                    <div><span className="font-semibold">Demande comprise :</span> {fault.description || "—"}</div>
                    <div><span className="font-semibold">Équipement :</span> {fault.equipment_type || "—"}</div>
                    <div><span className="font-semibold">Intervention tarifaire :</span> {line?.intervention || "—"} {line?.fault_code&&<span className="font-mono text-blue-700">({line.fault_code})</span>}</div>
                    <div><span className="font-semibold">Complexité de cette panne :</span> {fault.complexity || quote.extraction.complexity || "—"}{fault.complexity_reason?` — ${fault.complexity_reason}`:""}</div>
                    {match&&<div><span className="font-semibold">Correspondance catalogue :</span> {Math.round(Number(match.confidence||0)*100)} % · {match.retrieval==="vector"?"embeddings":"recherche textuelle"}</div>}
                    {line?.components&&<div><span className="font-semibold">Détail :</span> pièces {line.components.parts} + main-d’œuvre {line.components.labour} + marge {line.components.fixed_margin} + équipement {line.components.equipment} = {line.total} {quote.currency}</div>}
                  </div>;
                })}
                <p className="text-slate-500">Si la demande comprise ou l’intervention tarifaire ne correspond pas à votre besoin, refusez le devis et reformulez avant de réserver.</p>
              </div>
            </details>
            {!priceDecision&&(
              <div className="px-4 pb-4 border-t border-gray-100 pt-4">
                <div className="text-sm font-medium text-foreground mb-3">Que souhaitez-vous faire ?</div>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={()=>handlePriceDecision("accept")} className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 text-emerald-700"><ThumbsUp className="w-5 h-5"/><span className="text-xs font-semibold">Accepter</span></button>
                  <button onClick={()=>handlePriceDecision("decline")} className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-red-50 border border-red-200 hover:bg-red-100 text-red-600"><ThumbsDown className="w-5 h-5"/><span className="text-xs font-semibold">Décliner</span></button>
                </div>
              </div>
            )}
          </div>
        )}
        {showSlots&&!booked&&(
          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-100"><div className="text-sm font-semibold">Spécialistes {faultType} disponibles</div><div className="text-xs text-muted-foreground mt-0.5">{slotsLoading?"Consultation des agendas…":`${new Set(proposedSlots.map((slot)=>slot.techId)).size} technicien(s) avec un créneau compatible`}</div></div>
            <div className="p-3 space-y-2">
              {slotsLoading&&<div className="p-4 text-sm text-muted-foreground text-center"><RefreshCw className="w-4 h-4 animate-spin inline mr-2"/>Recherche intelligente dans les agendas…</div>}
              {!slotsLoading&&slotsError&&<div className="p-4 text-sm text-red-600 bg-red-50 rounded-xl text-center">{slotsError}<button onClick={loadSuggestedSlots} className="block mx-auto mt-2 text-xs font-semibold underline">Réessayer</button></div>}
              {!slotsLoading&&!slotsError&&proposedSlots.length===0&&<div className="p-4 text-sm text-muted-foreground text-center">Aucun agenda libre parmi les spécialistes compatibles. Vous pouvez leur envoyer un message.</div>}
              {proposedSlots.map((slot,i)=>{
                const tech = technicians.find((t)=>t.id===slot.techId); if(!tech) return null;
                const isSel = selectedSlot?.date===slot.date&&selectedSlot?.time===slot.time&&selectedSlot?.techId===slot.techId;
                return (
                  <button key={i} onClick={()=>setSelectedSlot(slot)} className={`w-full text-left p-3 rounded-xl border transition-all ${isSel?"border-primary bg-blue-50":"border-gray-200 hover:border-gray-300 bg-gray-50/50"}`}>
                    <div className="flex items-center gap-3">
                      <Avatar initials={tech.avatar} color={tech.color} size="sm"/>
                      <div className="flex-1"><div className="text-sm font-semibold">{slot.label} — {slot.time}</div><div className="text-xs text-muted-foreground">{tech.name} · {readableDistance(slot.distanceKm)} · {tech.response}</div><div className="mt-1 flex items-center gap-1 text-xs"><Star className={`w-3.5 h-3.5 ${tech.reviews>0?"text-amber-400 fill-amber-400":"text-gray-300"}`}/><span>{tech.reviews>0?`${tech.rating}/5 (${tech.reviews} avis client${tech.reviews>1?"s":""})`:"Pas encore évalué"}</span></div></div>
                      {isSel&&<Check className="w-4 h-4 text-primary shrink-0"/>}
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="p-4 border-t border-gray-100 space-y-3">
              <div className="flex gap-2">
                <button onClick={confirmSlot} disabled={!selectedSlot} className="flex-1 h-10 rounded-xl bg-primary text-white text-sm font-semibold disabled:opacity-40">Confirmer</button>
                <button onClick={()=>{ setShowSlots(false); setMessages((m)=>[...m,{role:"user",text:"Non merci."},{role:"bot",text:"Pas de problème. Vous pouvez réserver depuis l'onglet Rendez-vous."}]); }} className="h-10 px-4 rounded-xl border border-gray-200 text-sm text-muted-foreground">Non merci</button>
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef}/>
      </div>
      {messages.length<=1&&<div className="flex flex-wrap gap-2 mb-3">{suggestions.map((s)=><button key={s} onClick={()=>send(s)} className="text-xs px-3 py-1.5 rounded-full bg-white border border-gray-200 text-muted-foreground hover:border-primary/40 hover:text-primary shadow-sm">{s}</button>)}</div>}
      <div className={`bg-white rounded-2xl border shadow-sm flex items-center gap-2 px-3 py-2 transition-all ${isListening?"border-red-400 ring-2 ring-red-100":"border-gray-100"}`}>
        {supported&&<button onClick={toggleMic} className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${isListening?"bg-red-500 text-white animate-pulse":"bg-gray-100 text-muted-foreground hover:bg-gray-200"}`}>{isListening?<MicOff className="w-4 h-4"/>:<Mic className="w-4 h-4"/>}</button>}
        <input value={input} onChange={(e)=>setInput(e.target.value)} onKeyDown={(e)=>e.key==="Enter"&&send(input)} placeholder={isListening?"Écoute en cours…":"Décrivez votre problème HVAC…"} className="flex-1 text-sm placeholder:text-muted-foreground bg-transparent outline-none"/>
        <button onClick={()=>send(input)} disabled={!input.trim()||loading} className="w-9 h-9 rounded-xl bg-primary text-white flex items-center justify-center hover:bg-primary/90 disabled:opacity-40 shrink-0"><Send className="w-4 h-4"/></button>
      </div>
    </div>
  );
}

// ─── Client RDV ───────────────────────────────────────────────────────────────

function ClientRdv({ technicians, appointments, setAppointments }:
  { technicians: Technician[]; appointments: Appointment[]; setAppointments: React.Dispatch<React.SetStateAction<Appointment[]>> }) {
  const [selectedAppt, setSelectedAppt] = useState<Appointment|null>(null);
  const [feedbackAppt, setFeedbackAppt] = useState<number|null>(null);
  const [feedback, setFeedback] = useState({ rating:0, comment:"" });
  const [cancelAppt, setCancelAppt] = useState<Appointment|null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState("");
  const history = appointments.filter((a)=>a.status==="completed"||a.status==="cancelled");
  const upcoming = appointments.filter((a)=>a.status==="confirmed"||a.status==="pending");

  async function cancelAppointment() {
    if (!cancelAppt || cancelling) return;
    setCancelling(true); setCancelError("");
    try {
      const { data } = await api.patch(`/appointments/${cancelAppt.id}`, { status:"cancelled" });
      setAppointments((apps)=>apps.map((appointment)=>appointment.id===cancelAppt.id?mapAppointment(data):appointment));
      setCancelAppt(null);
    } catch (error:any) {
      setCancelError(error.response?.data?.error || "Impossible d’annuler ce rendez-vous.");
    } finally { setCancelling(false); }
  }

  async function confirmPrice(id: number) {
    setAppointments((apps)=>apps.map((a)=>a.id===id?{...a,clientConfirmedPrice:true}:a));
    try { await api.patch(`/appointments/${id}`, { client_confirmed_price: true }); } catch (err) { console.error(err); }
  }

  async function submitFeedback(id: number) {
    try {
      const { data } = await api.post(`/appointments/${id}/feedback`, { rating: feedback.rating, feedback: feedback.comment });
      setAppointments((apps)=>apps.map((a)=>a.id===id?mapAppointment(data):a));
    } catch (err) { console.error(err); }
    setFeedbackAppt(null); setFeedback({rating:0,comment:""});
  }

  const canRate = (appt: Appointment) => appt.status==="completed";
  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 max-w-4xl mx-auto w-full">
      <h2 className="text-xl font-bold text-foreground mb-1" style={{ fontFamily:"Onest,sans-serif" }}>Mes rendez-vous</h2>
      <p className="text-sm text-muted-foreground mb-6">Historique et rendez-vous à venir</p>
      {upcoming.length>0&&(
        <div className="mb-8">
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">À venir</h3>
          <div className="space-y-3">{upcoming.map((appt)=>{
            const tech = technicians.find((t)=>t.id===appt.technicianId);
            const showFb = feedbackAppt===appt.id;
            const ratable = canRate(appt);
            return (
              <div key={appt.id} className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
                <div className="flex items-start gap-4">{tech&&<Avatar initials={tech.avatar} color={tech.color}/>}<div className="flex-1">
                  <div className="flex items-start justify-between"><div><div className="font-semibold text-foreground">{appt.technicianName}</div><div className="text-sm text-muted-foreground">{appt.service}</div></div><Badge color={appt.status==="confirmed"?"green":"amber"}>{appt.status==="confirmed"?"Confirmé":"En attente"}</Badge></div>
                  <div className="flex flex-wrap gap-4 mt-3 text-sm text-muted-foreground"><div className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5"/>{appt.date}</div><div className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5"/>{appt.time}</div><div className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5"/>{appt.address}</div></div>
                  <div className="mt-3 pt-3 border-t border-gray-100 text-sm"><span className="text-muted-foreground">Prix estimé : </span><span className="font-bold">{appt.estimatedPrice} {appt.currency}</span></div>
                  <button onClick={()=>{setCancelError("");setCancelAppt(appt);}} className="mt-3 h-9 px-4 rounded-lg border border-red-200 bg-red-50 text-red-700 text-xs font-semibold hover:bg-red-100">Annuler ce rendez-vous</button>
                  {ratable&&!appt.rating&&!showFb&&<button onClick={()=>setFeedbackAppt(appt.id)} className="mt-2 text-xs text-primary hover:underline flex items-center gap-1"><Star className="w-3.5 h-3.5"/>Évaluer</button>}
                  {showFb&&(
                    <div className="mt-3 space-y-2 pt-3 border-t border-gray-100">
                      <div className="flex gap-1">{[1,2,3,4,5].map((s)=><button key={s} onClick={()=>setFeedback((f)=>({...f,rating:s}))}><Star className={`w-5 h-5 ${s<=feedback.rating?"text-amber-400 fill-amber-400":"text-gray-300"}`}/></button>)}</div>
                      <textarea value={feedback.comment} onChange={(e)=>setFeedback((f)=>({...f,comment:e.target.value}))} placeholder="Votre expérience…" className="w-full h-16 px-3 py-2 rounded-lg border border-gray-200 text-sm bg-gray-50 resize-none focus:outline-none focus:border-blue-400"/>
                      <div className="flex gap-2"><button onClick={()=>submitFeedback(appt.id)} disabled={!feedback.rating} className="flex-1 h-8 rounded-lg bg-primary text-white text-xs font-semibold disabled:opacity-40">Publier</button><button onClick={()=>setFeedbackAppt(null)} className="h-8 px-3 rounded-lg border border-gray-200 text-xs text-muted-foreground">Annuler</button></div>
                    </div>
                  )}
                </div></div>
              </div>
            );
          })}</div>
        </div>
      )}
      <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Historique</h3>
      <div className="space-y-3">{history.map((appt)=>{
        const tech = technicians.find((t)=>t.id===appt.technicianId);
        const isExp = selectedAppt?.id===appt.id;
        const showFb = feedbackAppt===appt.id;
        return (
          <div key={appt.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <button onClick={()=>setSelectedAppt(isExp?null:appt)} className="w-full p-5 text-left hover:bg-gray-50">
              <div className="flex items-start gap-4">{tech&&<Avatar initials={tech.avatar} color={tech.color}/>}<div className="flex-1">
                <div className="flex items-start justify-between"><div><div className="font-semibold">{appt.technicianName}</div><div className="text-sm text-muted-foreground">{appt.service}</div></div><Badge color={appt.status==="cancelled"?"red":"blue"}>{appt.status==="cancelled"?"Annulé":"Terminé"}</Badge></div>
                <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground"><div className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5"/>{appt.date}</div>{appt.rating&&<div className="flex items-center gap-1"><Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400"/><span className="text-foreground font-medium">{appt.rating}/5</span></div>}</div>
              </div><ChevronRight className={`w-5 h-5 text-muted-foreground transition-transform ${isExp?"rotate-90":""}`}/></div>
            </button>
            {isExp&&(
              <div className="px-5 pb-5 space-y-4 border-t border-gray-100 pt-4">
                <div className="bg-gray-50 rounded-xl p-4">
                  <div className="grid grid-cols-2 gap-4 text-sm mb-3"><div><div className="text-xs text-muted-foreground mb-1">Prix estimé</div><div className="font-medium">{appt.estimatedPrice} {appt.currency}</div></div><div><div className="text-xs text-muted-foreground mb-1">Prix réel</div><div className="text-lg font-bold">{appt.actualPrice??"—"} {appt.currency}</div></div></div>
                  {appt.actualPrice&&!appt.clientConfirmedPrice&&<div className="pt-3 border-t border-gray-200"><div className="flex items-center gap-2 text-xs text-amber-600 mb-2"><AlertCircle className="w-3.5 h-3.5"/>Confirmez-vous avoir payé ce montant ?</div><button onClick={()=>confirmPrice(appt.id)} className="w-full h-8 rounded-lg bg-primary text-white text-xs font-semibold">Oui, j'ai payé {appt.actualPrice} {appt.currency}</button></div>}
                  {appt.clientConfirmedPrice&&<div className="pt-3 border-t border-gray-200 flex items-center gap-2 text-xs text-emerald-600"><CheckCircle2 className="w-3.5 h-3.5"/>Prix confirmé</div>}
                </div>
                {appt.caseDescription&&<div><div className="text-xs font-medium text-muted-foreground mb-2">Description</div><div className="text-sm bg-blue-50 border border-blue-100 rounded-lg p-3">{appt.caseDescription}</div></div>}
                {canRate(appt)&&(appt.feedback&&!showFb?(
                  <div><div className="text-xs font-medium text-muted-foreground mb-2">Votre avis</div><div className="flex gap-1 mb-1">{[1,2,3,4,5].map((s)=><Star key={s} className={`w-4 h-4 ${s<=appt.rating!?"text-amber-400 fill-amber-400":"text-gray-300"}`}/>)}</div><div className="text-sm">{appt.feedback}</div><button onClick={()=>{setFeedback({rating:appt.rating||0,comment:appt.feedback||""});setFeedbackAppt(appt.id);}} className="mt-2 text-xs text-primary hover:underline">Modifier votre évaluation</button></div>
                ):!showFb?(
                  <button onClick={()=>setFeedbackAppt(appt.id)} className="w-full h-9 rounded-lg border border-gray-200 text-sm hover:bg-gray-50 flex items-center justify-center gap-2"><MessageCircle className="w-4 h-4"/>Laisser un avis</button>
                ):(
                  <div className="space-y-3">
                    <div className="flex gap-1">{[1,2,3,4,5].map((s)=><button key={s} onClick={()=>setFeedback((f)=>({...f,rating:s}))}><Star className={`w-6 h-6 ${s<=feedback.rating?"text-amber-400 fill-amber-400":"text-gray-300"}`}/></button>)}</div>
                    <textarea value={feedback.comment} onChange={(e)=>setFeedback((f)=>({...f,comment:e.target.value}))} placeholder="Votre expérience…" className="w-full h-20 px-3 py-2 rounded-lg border border-gray-200 text-sm bg-gray-50 resize-none focus:outline-none focus:border-blue-400"/>
                    <div className="flex gap-2"><button onClick={()=>submitFeedback(appt.id)} disabled={!feedback.rating} className="flex-1 h-9 rounded-lg bg-primary text-white text-sm font-semibold disabled:opacity-40">Publier</button><button onClick={()=>setFeedbackAppt(null)} className="h-9 px-4 rounded-lg border border-gray-200 text-sm text-muted-foreground">Annuler</button></div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}</div>
      {cancelAppt&&<div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onMouseDown={(event)=>{if(event.target===event.currentTarget&&!cancelling)setCancelAppt(null);}}>
        <div role="dialog" aria-modal="true" aria-labelledby="cancel-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
          <div className="w-11 h-11 rounded-full bg-red-50 text-red-600 flex items-center justify-center mb-4"><AlertCircle className="w-5 h-5"/></div>
          <h3 id="cancel-title" className="text-lg font-bold">Confirmer l’annulation</h3>
          <p className="mt-2 text-sm text-muted-foreground">Voulez-vous vraiment annuler le rendez-vous avec <strong className="text-foreground">{cancelAppt.technicianName}</strong>, prévu le {cancelAppt.date} à {cancelAppt.time} ?</p>
          <p className="mt-2 text-xs text-red-600">Le technicien sera immédiatement informé.</p>
          {cancelError&&<div className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-700">{cancelError}</div>}
          <div className="mt-6 flex gap-2"><button onClick={()=>setCancelAppt(null)} disabled={cancelling} className="flex-1 h-10 rounded-xl border border-gray-200 text-sm font-semibold disabled:opacity-50">Garder le rendez-vous</button><button onClick={cancelAppointment} disabled={cancelling} className="flex-1 h-10 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50">{cancelling?"Annulation…":"Oui, annuler"}</button></div>
        </div>
      </div>}
    </div>
  );
}

// ─── Client Map ───────────────────────────────────────────────────────────────

function ClientMap({ technicians, location, contactedTechs, onContact }:
  { technicians: Technician[]; location: UserLocation|null; contactedTechs: number[]; onContact: (id:number)=>void }) {
  const [selected, setSelected] = useState<number|null>(null);
  const [search, setSearch] = useState("");
  const [filterSpec, setFilterSpec] = useState<string|null>(null);
  const [showAvailOnly, setShowAvailOnly] = useState(false);
  const [ratingTech, setRatingTech] = useState<number|null>(null);
  const [ratings, setRatings] = useState<Record<number,{rating:number;comment:string}>>({});
  const [ratingStats, setRatingStats] = useState<Record<number,{rating:number;reviews:number}>>({});
  const [ratingDraft, setRatingDraft] = useState({rating:0,comment:""});
  const [publicRatings, setPublicRatings] = useState<Record<number,Array<{rating:number;comment:string;client_name:string;updated_at:string}>>>({});
  const filtered = technicians.filter((t)=>(!showAvailOnly||t.available)&&(!filterSpec||t.specializations.includes(filterSpec))&&(!search||t.name.toLowerCase().includes(search.toLowerCase())||t.specializations.some((s)=>s.toLowerCase().includes(search.toLowerCase())))).sort((a,b)=>(a.distanceKm??Infinity)-(b.distanceKm??Infinity));

  async function submitRating(techId: number) {
    try {
      const { data } = await api.post(`/technicians/${techId}/ratings`, ratingDraft);
      setRatings((r)=>({...r,[techId]:ratingDraft}));
      setRatingStats((stats)=>({...stats,[techId]:{rating:Number(data.rating||0),reviews:Number(data.reviews_count||0)}}));
      const reviews = await api.get(`/technicians/${techId}/ratings`);
      setPublicRatings((current)=>({...current,[techId]:reviews.data}));
    } catch (err) { console.error(err); }
    setRatingTech(null); setRatingDraft({rating:0,comment:""});
  }

  async function selectTechnician(id: number) {
    const next = selected===id ? null : id; setSelected(next);
    if (next && !publicRatings[id]) {
      try { const {data}=await api.get(`/technicians/${id}/ratings`); setPublicRatings((current)=>({...current,[id]:data})); } catch (err) { console.error(err); }
    }
  }

  return (
    <div className="h-full flex flex-col md:flex-row overflow-hidden">
      <div className="w-full md:w-80 border-b md:border-b-0 md:border-r border-border bg-white flex flex-col">
        <div className="p-3 border-b border-border space-y-2">
          <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"/><input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Nom ou spécialisation…" className="w-full h-9 pl-9 pr-3 rounded-lg border border-gray-200 text-sm bg-gray-50 focus:outline-none focus:border-blue-400"/></div>
          <div className="flex gap-1.5 flex-wrap">
            <button onClick={()=>setShowAvailOnly(!showAvailOnly)} className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${showAvailOnly?"bg-emerald-500 text-white border-emerald-500":"border-gray-200 text-muted-foreground"}`}><span className={`w-1.5 h-1.5 rounded-full ${showAvailOnly?"bg-white":"bg-emerald-400"}`}/>Disponibles</button>
            {["Climatisation","Chauffage","Installation","Réparation"].map((spec)=><button key={spec} onClick={()=>setFilterSpec(filterSpec===spec?null:spec)} className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${filterSpec===spec?"bg-primary text-white border-primary":"border-gray-200 text-muted-foreground"}`}>{spec}</button>)}
          </div>
          {location&&<div className="flex items-center gap-1.5 text-xs text-blue-600 bg-blue-50 rounded-lg px-3 py-1.5"><Navigation className="w-3 h-3"/>{filtered.length} technicien(s) · depuis <strong>{location.city}</strong></div>}
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.map((t)=>{
            const isContacted = contactedTechs.includes(t.id);
            const ratingAllowed = t.canRate || isContacted;
            const existing = ratings[t.id];
            const personalRating = existing?.rating ?? t.myRating;
            const isRating = ratingTech===t.id;
            const aggregateRating = ratingStats[t.id]?.rating ?? t.rating;
            const aggregateReviews = ratingStats[t.id]?.reviews ?? t.reviews;
            return (
              <div key={t.id} className={`border-b border-gray-50 transition-colors ${selected===t.id?"bg-blue-50":"hover:bg-gray-50"}`}>
                <button onClick={()=>selectTechnician(t.id)} className="w-full text-left p-4">
                  <div className="flex items-start gap-3">
                    <div className="relative"><Avatar initials={t.avatar} color={t.color}/>{t.available&&<span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-white"/>}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between"><span className="font-semibold text-sm">{t.name}</span><span className="text-xs font-medium text-blue-600">{t.distanceKm == null ? "Distance indisponible" : `${t.distanceKm.toFixed(1)} km`}</span></div>
                      <div className="flex flex-wrap gap-1 mt-1">{t.specializations.slice(0,2).map((s)=><span key={s} className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px]">{s}</span>)}</div>
                      <div className="flex items-center gap-2 mt-1.5"><div className="flex items-center gap-0.5"><Star className={`w-3 h-3 ${aggregateReviews>0?"text-amber-400 fill-amber-400":"text-gray-300"}`}/><span className="text-xs font-medium">{aggregateReviews>0?aggregateRating:"—"}</span><span className="text-xs text-muted-foreground">({aggregateReviews} avis client{aggregateReviews>1?"s":""})</span></div><Badge color={t.available?"green":"gray"}>{t.available?"Disponible":"Indisponible"}</Badge>{isContacted&&<Badge color="blue">Contacté</Badge>}</div>
                    </div>
                  </div>
                </button>
                {selected===t.id&&(
                  <div className="px-4 pb-4 space-y-2">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Clock className="w-3.5 h-3.5"/>Répond en {t.response}</div>
                    <div className="text-xs font-medium text-primary">{t.price}</div>
                    <div className="flex flex-wrap gap-1">{t.tags.map((tag)=><span key={tag} className="px-2 py-0.5 rounded-full bg-gray-100 text-xs text-gray-600">{tag}</span>)}</div>
                    {aggregateReviews>0&&<div className="rounded-lg border border-gray-100 bg-white p-2 space-y-2"><div className="text-[11px] font-semibold text-muted-foreground">Avis clients récents</div>{(publicRatings[t.id]||[]).slice(0,3).map((review,index)=><div key={index} className="border-t border-gray-50 pt-2"><div className="flex items-center justify-between"><span className="text-xs font-medium">{review.client_name}</span><span className="text-xs text-amber-500">{"★".repeat(review.rating)}</span></div>{review.comment&&<p className="text-xs text-muted-foreground mt-0.5">{review.comment}</p>}</div>)}</div>}
                    <button onClick={()=>onContact(t.id)} className="w-full h-8 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary/90">Ouvrir la discussion</button>
                    {ratingAllowed&&!isRating&&<button onClick={()=>{setRatingTech(t.id);setRatingDraft({rating:personalRating||0,comment:existing?.comment??t.myRatingComment??""});}} className="w-full h-8 rounded-lg border border-gray-200 text-xs hover:bg-gray-50 flex items-center justify-center gap-1.5"><Star className="w-3.5 h-3.5 text-amber-400"/>{personalRating?`Votre note : ${personalRating}/5 — modifier`:"Évaluer ce technicien"}</button>}
                    {!ratingAllowed&&<div className="text-[11px] text-muted-foreground text-center">Contactez ce technicien pour pouvoir l’évaluer.</div>}
                    {isRating&&ratingAllowed&&(
                      <div className="space-y-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <div className="flex gap-1">{[1,2,3,4,5].map((s)=><button key={s} onClick={()=>setRatingDraft((r)=>({...r,rating:s}))}><Star className={`w-5 h-5 ${s<=ratingDraft.rating?"text-amber-400 fill-amber-400":"text-gray-300"}`}/></button>)}</div>
                        <textarea value={ratingDraft.comment} onChange={(e)=>setRatingDraft((r)=>({...r,comment:e.target.value}))} placeholder="Votre expérience…" className="w-full h-14 px-2 py-1.5 rounded-lg border border-gray-200 text-xs bg-white resize-none"/>
                        <div className="flex gap-1.5"><button onClick={()=>submitRating(t.id)} disabled={!ratingDraft.rating} className="flex-1 h-7 rounded-lg bg-primary text-white text-xs font-semibold disabled:opacity-40">Publier</button><button onClick={()=>setRatingTech(null)} className="h-7 px-2 rounded-lg border border-gray-200 text-xs text-muted-foreground">✕</button></div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex-1 min-h-[420px] relative overflow-hidden">
        <TechnicianMap technicians={filtered.map((technician)=>({...technician,canRate:technician.canRate||contactedTechs.includes(technician.id)}))} location={location} selectedId={selected} onSelect={selectTechnician} onContact={onContact} onRate={(id)=>{const technician=technicians.find((item)=>item.id===id);setSelected(id);setRatingTech(id);setRatingDraft({rating:technician?.myRating||0,comment:technician?.myRatingComment||""});}}/>
        <div className="absolute z-[1000] bottom-4 right-4 bg-white/95 backdrop-blur rounded-xl p-3 shadow-sm border border-gray-100 text-xs space-y-1.5 pointer-events-none">
          <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-emerald-400 border border-white shadow-sm"/><span className="text-muted-foreground">Disponible</span></div>
          <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-blue-400 border border-white shadow-sm"/><span className="text-muted-foreground">Contacté</span></div>
          <div className="font-medium text-foreground pt-1 border-t border-gray-100">{technicians.filter((t)=>t.available).length} disponibles</div>
        </div>
      </div>
    </div>
  );
}

// ─── Tech Dashboard ───────────────────────────────────────────────────────────

function TechDashboard({ user, location, onLogout, onUpdateUser }:
  { user: AppUser; location: UserLocation|null; onLogout: ()=>void; onUpdateUser: (u: AppUser)=>void }) {
  const [tab, setTab] = useState<TechTab>("leads");
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [stats, setStats] = useState({ jobsThisMonth: 0, revenue: 0, avgRating: 0 });
  const unread = notifications.filter((n)=>!n.read).length;
  const tabs = [{ id:"leads" as TechTab,label:"Leads",icon:Users },{ id:"messages" as TechTab,label:"Messages",icon:MessageCircle },{ id:"tarifs" as TechTab,label:"Tarification",icon:DollarSign },{ id:"agenda" as TechTab,label:"Agenda",icon:Calendar }];

  useEffect(() => {
    api.get("/notifications").then((res) => setNotifications(res.data.map(mapNotification))).catch(console.error);
    api.get("/technicians/me/stats").then((res) => setStats(res.data)).catch(console.error);
  }, []);

  useEffect(() => {
    const socket = realtimeSocket();
    if (!socket) return;
    const refresh = () => api.get("/notifications").then((res) => setNotifications(res.data.map(mapNotification))).catch(console.error);
    socket.on("message:new", refresh);
    socket.on("notification:new", refresh);
    socket.on("appointment:new", refresh);
    socket.on("lead:new", refresh);
    return () => { socket.off("message:new", refresh); socket.off("notification:new", refresh); socket.off("appointment:new", refresh); socket.off("lead:new", refresh); };
  }, []);

  function markRead(id: number) {
    setNotifications((ns) => ns.map((n) => (n.id === id ? { ...n, read: true } : n)));
    api.patch(`/notifications/${id}/read`).catch(console.error);
  }
  function markAllRead() {
    setNotifications((ns) => ns.map((n) => ({ ...n, read: true })));
    api.patch("/notifications/read-all").catch(console.error);
  }

  function openTechNotification(notification: Notification) {
    markRead(notification.id);
    const target: TechTab = notification.type === "message" ? "messages" : notification.type === "lead" || notification.type === "reassign" ? "leads" : notification.type === "rdv" || notification.type === "price" ? "agenda" : "leads";
    setTab(target); setNotifOpen(false);
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="bg-white border-b border-border px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3"><div className="w-7 h-7 rounded-lg bg-emerald-600 flex items-center justify-center"><Wrench className="w-3.5 h-3.5 text-white"/></div><span className="font-bold text-foreground" style={{ fontFamily:"Onest,sans-serif" }}>QuoteAI Pro</span><Badge color="green">Technicien</Badge></div>
        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-5 mr-2 text-center"><div><div className="text-xs text-muted-foreground">Ce mois</div><div className="text-sm font-bold">{stats.jobsThisMonth} jobs</div></div><div><div className="text-xs text-muted-foreground">Revenus</div><div className="text-sm font-bold text-emerald-600">{stats.revenue} €</div></div><div><div className="text-xs text-muted-foreground">Note moy.</div><div className="text-sm font-bold text-amber-500">{stats.avgRating} ★</div></div></div>
          {location&&<div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground bg-gray-50 px-2.5 py-1 rounded-full border border-gray-200"><Navigation className="w-3 h-3 text-emerald-500"/>{location.city}</div>}
          <div className="relative"><button onClick={()=>setNotifOpen(!notifOpen)} className="relative w-9 h-9 rounded-xl hover:bg-gray-100 flex items-center justify-center text-muted-foreground hover:text-foreground"><Bell className="w-5 h-5"/>{unread>0&&<span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">{unread}</span>}</button></div>
          <button onClick={()=>setProfileOpen(true)} className="flex items-center gap-2 hover:bg-gray-50 rounded-xl px-2 py-1 transition-colors"><Avatar initials={user.avatar || user.name.slice(0,2).toUpperCase()} color="bg-emerald-500" size="sm"/><span className="text-sm font-medium hidden sm:block">{user.name}</span></button>
          <button onClick={onLogout} className="text-muted-foreground hover:text-foreground"><LogOut className="w-4 h-4"/></button>
        </div>
      </header>
      <div className="bg-white border-b border-border px-6">
        <div className="flex gap-1">{tabs.map((t)=><button key={t.id} onClick={()=>setTab(t.id)} className={`flex items-center gap-2 px-4 py-3.5 text-sm font-medium border-b-2 transition-all ${tab===t.id?"border-emerald-500 text-emerald-700":"border-transparent text-muted-foreground hover:text-foreground"}`}><t.icon className="w-4 h-4"/>{t.label}</button>)}</div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {tab==="leads"&&<TechLeads/>}
        {tab==="messages"&&<ConversationsPanel/>}
        {tab==="tarifs"&&<TechTarifs city={user.city}/>}
        {tab==="agenda"&&<TechAgenda/>}
      </div>
      {notifOpen&&<NotificationPanel notifications={notifications} onSelect={openTechNotification} onReadAll={markAllRead} onClose={()=>setNotifOpen(false)}/>}
      {profileOpen&&<ProfileModal user={user} role="technician" onClose={()=>setProfileOpen(false)} onSave={(u)=>{ onUpdateUser(u); setProfileOpen(false); }}/>}
    </div>
  );
}

// ─── Tech Leads ───────────────────────────────────────────────────────────────

function TechLeads() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [filter, setFilter] = useState<"all"|"new"|"accepted"|"done">("all");
  const [reassigning, setReassigning] = useState<number|null>(null);
  const [reassigned, setReassigned] = useState<Record<number,string>>({});
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<number|null>(null);

  const refreshLeads = useCallback(() => {
    api.get("/leads").then((res) => setLeads(res.data.map(mapLead))).catch(console.error).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refreshLeads();
    const socket = realtimeSocket();
    if (!socket) return;
    socket.on("lead:new", refreshLeads);
    socket.on("appointment:new", refreshLeads);
    return () => { socket.off("lead:new", refreshLeads); socket.off("appointment:new", refreshLeads); };
  }, [refreshLeads]);

  const filtered = leads.filter((lead)=>(filter==="all"||lead.status===filter) && [lead.client,lead.problem,lead.city,lead.faultType].join(" ").toLowerCase().includes(query.toLowerCase()));

  async function accept(id: number) {
    try {
      const { data } = await api.patch(`/leads/${id}`, { status: "accepted" });
      setLeads((ls)=>ls.map((l)=>l.id===id?mapLead(data):l));
    } catch (err) { console.error(err); }
  }

  async function decline(id: number) {
    setReassigning(id);
    try {
      const { data } = await api.post(`/leads/${id}/decline`);
      setLeads((ls)=>ls.map((l)=>l.id===id?{...l,status:"done"}:l));
      setReassigned((r)=>({...r,[id]: data.reassignedTo ?? "un autre technicien"}));
    } catch (err) {
      console.error(err);
    } finally {
      setReassigning(null);
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div><h2 className="text-xl font-bold" style={{ fontFamily:"Onest,sans-serif" }}>Leads entrants</h2><p className="text-sm text-muted-foreground">Si vous déclinez, le moteur IA cherche automatiquement un autre technicien.</p></div>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">{(["all","new","accepted","done"] as const).map((f)=><button key={f} onClick={()=>setFilter(f)} className={`px-3 h-7 rounded-md text-xs font-medium ${filter===f?"bg-white shadow-sm text-foreground":"text-muted-foreground"}`}>{f==="all"?"Tous":f==="new"?"Nouveaux":f==="accepted"?"Acceptés":"Terminés"}</button>)}</div>
      </div>
      <div className="relative mb-4"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"/><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Rechercher un client, une panne ou une ville…" className="w-full h-10 pl-10 pr-3 rounded-xl border border-gray-200 bg-white text-sm outline-none focus:border-blue-400"/></div>
      {loading && <div className="text-sm text-muted-foreground">Chargement des leads…</div>}
      <div className="space-y-3">{filtered.map((lead)=>(
        <div key={lead.id} className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-sm font-bold shrink-0">{lead.client[0]}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2"><div><div className="font-semibold text-sm">{lead.client}</div><div className="flex items-center gap-2 mt-0.5"><span className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3"/>{lead.city}</span><span className="px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded text-[10px] font-medium">{lead.faultType}</span></div></div><div className="text-right"><div className="text-lg font-black" style={{ fontFamily:"Onest,sans-serif" }}>{lead.price} €</div><div className="text-xs text-muted-foreground">{lead.time}</div></div></div>
              <div className="mt-2 text-sm">{lead.problem}</div>
              {lead.requestedDate&&<div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground"><span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5"/>{String(lead.requestedDate).slice(0,10)} à {String(lead.requestedTime||"").slice(0,5)}</span>{lead.address&&<span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5"/>{lead.address}</span>}</div>}
              <div className="mt-2"><div className="text-xs text-muted-foreground mb-1">Confiance IA</div><ConfidenceBar value={lead.confidence}/></div>
              <button onClick={()=>setExpanded(expanded===lead.id?null:lead.id)} className="mt-3 text-xs text-blue-600 hover:underline flex items-center gap-1">{expanded===lead.id?"Masquer les détails":"Voir toutes les informations"}<ChevronDown className={`w-3.5 h-3.5 transition-transform ${expanded===lead.id?"rotate-180":""}`}/></button>
              {expanded===lead.id&&<div className="mt-3 grid sm:grid-cols-2 gap-2 rounded-xl bg-slate-50 border border-slate-100 p-3 text-xs"><div><span className="text-muted-foreground">Demande :</span> {lead.problem}</div><div><span className="text-muted-foreground">Catégorie :</span> {lead.faultType}</div><div><span className="text-muted-foreground">Créneau :</span> {lead.requestedDate?`${String(lead.requestedDate).slice(0,10)} ${String(lead.requestedTime||"").slice(0,5)}`:"À définir"}</div><div><span className="text-muted-foreground">Adresse :</span> {lead.address||lead.city||"Non renseignée"}</div><div><span className="text-muted-foreground">Estimation :</span> {lead.price} €</div><div><span className="text-muted-foreground">Statut :</span> {lead.status}</div></div>}
              {reassigning===lead.id?<div className="mt-3 flex items-center gap-2 text-sm text-blue-600"><RefreshCw className="w-4 h-4 animate-spin"/>Moteur IA recherche un autre technicien…</div>
              :reassigned[lead.id]?<div className="mt-3 flex items-center gap-2 text-xs text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2"><CheckCircle2 className="w-4 h-4 shrink-0"/>Lead réassigné à <strong>{reassigned[lead.id]}</strong> — client notifié.</div>
              :(
                <div className="flex items-center gap-2 mt-3">
                  {lead.status==="new"&&<><button onClick={()=>accept(lead.id)} className="h-8 px-4 rounded-lg bg-emerald-500 text-white text-xs font-semibold hover:bg-emerald-600 flex items-center gap-1.5"><Check className="w-3.5 h-3.5"/>Accepter</button><button onClick={()=>decline(lead.id)} className="h-8 px-4 rounded-lg border border-red-200 text-xs text-red-500 hover:bg-red-50 flex items-center gap-1.5"><X className="w-3.5 h-3.5"/>Décliner</button></>}
                  {lead.status==="accepted"&&<Badge color="green">Accepté</Badge>}
                  {lead.status==="done"&&<Badge color="gray">Clôturé</Badge>}
                  <Badge color={lead.status==="new"?"amber":"gray"}>{lead.status==="new"?"Nouveau":lead.status==="accepted"?"En cours":"Clôturé"}</Badge>
                </div>
              )}
            </div>
          </div>
        </div>
      ))}</div>
    </div>
  );
}

// ─── Tech Tarifs ──────────────────────────────────────────────────────────────

function TechTarifs({ city }: { city: string }) {
  const [tarifs, setTarifs] = useState<PriceItem[]>([]);
  const [editing, setEditing] = useState<number|null>(null);
  const [editVal, setEditVal] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [newTarif, setNewTarif] = useState({service:"",unit:"",price:"",category:"Base"});
  const [uploadStatus, setUploadStatus] = useState<"idle"|"processing"|"success"|"error">("idle");
  const [uploadError, setUploadError] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [showTariffDetails, setShowTariffDetails] = useState(false);
  const [profileCurrency, setProfileCurrency] = useState("…");
  const categories = Array.from(new Set(["Base","Réparation","Maintenance","Installation","Urgence",...tarifs.map((tarif)=>tarif.category).filter(Boolean)]));

  useEffect(() => {
    api.get("/tarifs").then((res) => setTarifs(res.data)).catch(console.error);
    api.get("/tarifs/context").then((res)=>setProfileCurrency(res.data.currency)).catch(()=>setProfileCurrency(`Ville à préciser (${city||"profil"})`));
  }, [city]);

  const onDrop = useCallback(async (accepted: File[])=>{
    const file = accepted[0]; if(!file) return;
    setUploadStatus("processing"); setUploadError("");
    try {
      const form = new FormData(); form.append("file", file);
      const { data } = await api.post("/tarifs/import-file", form, { headers:{"Content-Type":"multipart/form-data"} });
      setTarifs(data.items);
      setUploadStatus("success");
      setShowTariffDetails(false);
    } catch (error: any) {
      setUploadError(error?.response?.data?.error || "Impossible d’extraire cette grille tarifaire.");
      setUploadStatus("error");
    }
  },[]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    onDropRejected:(rejections)=>{ setUploadStatus("error"); setUploadError(rejections[0]?.errors[0]?.code==="file-too-large"?"Le fichier dépasse 5 Mo.":"Format accepté : CSV, Excel .xlsx/.xlsm ou PDF texte."); },
    accept:{"text/csv":[".csv"],"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":[".xlsx",".xlsm"],"application/pdf":[".pdf"]}, multiple:false, maxSize:5*1024*1024
  });

  async function saveEdit(item: PriceItem) {
    const v = parseFloat(editVal);
    if (isNaN(v) || !item.id) { setEditing(null); return; }
    try {
      const { data } = await api.patch(`/tarifs/${item.id}`, { price: v });
      setTarifs((ts) => ts.map((t) => (t.id === item.id ? data : t)));
    } catch (err) { console.error(err); }
    setEditing(null);
  }

  async function addTarif() {
    if (!newTarif.service || !newTarif.price) return;
    try {
      const { data } = await api.post("/tarifs", { ...newTarif, price: parseFloat(newTarif.price) || 0 });
      setTarifs((ts) => [...ts, data]);
      setNewTarif({ service:"", unit:"", price:"", category:"Base" });
      setShowAdd(false);
    } catch (err) { console.error(err); }
  }

  const grouped = categories.reduce<Record<string,PriceItem[]>>((acc,cat)=>{acc[cat]=tarifs.filter((t)=>t.category===cat);return acc;},{});
  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6"><div><h2 className="text-xl font-bold" style={{ fontFamily:"Onest,sans-serif" }}>Ma grille tarifaire</h2><p className="text-sm text-muted-foreground">Devise déterminée par votre ville : <strong>{profileCurrency}</strong>.</p></div><div className="flex flex-wrap justify-end gap-2"><button onClick={()=>setShowImport(!showImport)} className="flex items-center gap-2 h-9 px-4 rounded-lg border border-gray-200 bg-white text-sm font-semibold hover:bg-gray-50"><Upload className="w-4 h-4"/>Importer un fichier</button><button onClick={()=>setShowTariffDetails((visible)=>!visible)} className="flex items-center gap-2 h-9 px-4 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 text-sm font-semibold hover:bg-emerald-100">{showTariffDetails?"Masquer les informations":"Modifier les informations"}</button></div></div>
      {showImport&&<div className="mb-6">
        <div {...getRootProps()} className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${isDragActive?"border-emerald-400 bg-emerald-50":uploadStatus==="success"?"border-emerald-300 bg-emerald-50":uploadStatus==="error"?"border-red-300 bg-red-50":"border-gray-200 hover:border-emerald-300 bg-gray-50"}`}>
          <input {...getInputProps()}/>
          {uploadStatus==="idle"&&<><Upload className="w-8 h-8 mx-auto mb-3 text-muted-foreground"/><div className="text-sm font-medium mb-1">{isDragActive?"Déposez ici":"Importez votre grille tarifaire"}</div><div className="text-xs text-muted-foreground">CSV, Excel .xlsx/.xlsm ou PDF texte — 5 Mo maximum</div></>}
          {uploadStatus==="processing"&&<div className="flex flex-col items-center gap-3"><div className="w-8 h-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin"/><div className="text-sm text-muted-foreground">Extraction en cours…</div></div>}
          {uploadStatus==="success"&&<><CheckCircle2 className="w-8 h-8 mx-auto mb-3 text-emerald-500"/><div className="text-sm font-medium text-emerald-700 mb-1">Grille importée en {profileCurrency}</div><button onClick={(e)=>{e.stopPropagation();setUploadStatus("idle");}} className="text-xs text-emerald-600 hover:underline">Importer un autre fichier</button></>}
          {uploadStatus==="error"&&<><AlertCircle className="w-8 h-8 mx-auto mb-3 text-red-400"/><div className="text-sm font-medium text-red-600 mb-1">Extraction impossible</div><div className="text-xs text-red-500 mb-2">{uploadError}</div><button onClick={(e)=>{e.stopPropagation();setUploadStatus("idle");setUploadError("");}} className="text-xs text-primary hover:underline">Réessayer</button></>}
        </div>
      </div>}
      {showTariffDetails&&<div className="mb-4 flex justify-end"><button onClick={()=>setShowAdd(!showAdd)} className="flex items-center gap-2 h-9 px-4 rounded-lg bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600"><Plus className="w-4 h-4"/>Ajouter un tarif</button></div>}
      {showTariffDetails&&showAdd&&(
        <div className="bg-white rounded-xl border border-emerald-200 p-5 mb-5 shadow-sm">
          <div className="text-sm font-semibold mb-4">Nouveau service</div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="col-span-2"><label className="block text-xs text-muted-foreground mb-1">Intitulé</label><input placeholder="Ex : Nettoyage filtre" value={newTarif.service} onChange={(e)=>setNewTarif((p)=>({...p,service:e.target.value}))} className="w-full h-9 px-3 rounded-lg border border-gray-200 text-sm bg-gray-50 focus:outline-none focus:border-emerald-400"/></div>
            <div><label className="block text-xs text-muted-foreground mb-1">Unité</label><input placeholder="/ appareil" value={newTarif.unit} onChange={(e)=>setNewTarif((p)=>({...p,unit:e.target.value}))} className="w-full h-9 px-3 rounded-lg border border-gray-200 text-sm bg-gray-50 focus:outline-none focus:border-emerald-400"/></div>
            <div><label className="block text-xs text-muted-foreground mb-1">Prix ({profileCurrency})</label><input type="number" placeholder="0" value={newTarif.price} onChange={(e)=>setNewTarif((p)=>({...p,price:e.target.value}))} className="w-full h-9 px-3 rounded-lg border border-gray-200 text-sm bg-gray-50 focus:outline-none focus:border-emerald-400"/></div>
            <div className="col-span-2"><label className="block text-xs text-muted-foreground mb-1">Catégorie</label><select value={newTarif.category} onChange={(e)=>setNewTarif((p)=>({...p,category:e.target.value}))} className="w-full h-9 px-3 rounded-lg border border-gray-200 text-sm bg-gray-50 focus:outline-none focus:border-emerald-400">{categories.map((c)=><option key={c}>{c}</option>)}</select></div>
          </div>
          <div className="flex gap-2"><button onClick={addTarif} className="h-8 px-4 rounded-lg bg-emerald-500 text-white text-xs font-semibold hover:bg-emerald-600">Ajouter</button><button onClick={()=>setShowAdd(false)} className="h-8 px-4 rounded-lg border border-gray-200 text-xs text-muted-foreground">Annuler</button></div>
        </div>
      )}
      {showTariffDetails&&<div className="space-y-5">{categories.map((cat)=>{ const items=grouped[cat]; if(!items?.length) return null; return (
        <div key={cat}><div className="flex items-center gap-2 mb-2"><span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{cat}</span><div className="flex-1 h-px bg-gray-100"/></div>
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">{items.map((t,i)=>(
          <div key={t.id ?? i} className={`flex items-center px-4 py-3.5 ${i<items.length-1?"border-b border-gray-50":""} hover:bg-gray-50 group`}>
            <div className="flex-1"><div className="text-sm font-medium">{t.service}</div><div className="text-xs text-muted-foreground">{t.unit}</div></div>
            {editing===t.id?<div className="flex items-center gap-2"><input type="number" value={editVal} onChange={(e)=>setEditVal(e.target.value)} onKeyDown={(e)=>e.key==="Enter"&&saveEdit(t)} autoFocus className="w-24 h-8 px-2 rounded-lg border border-emerald-300 text-sm text-right focus:outline-none"/><span className="text-sm text-muted-foreground">{t.currency||profileCurrency}</span><button onClick={()=>saveEdit(t)} className="w-7 h-7 rounded-lg bg-emerald-500 text-white flex items-center justify-center"><Check className="w-3.5 h-3.5"/></button><button onClick={()=>setEditing(null)} className="w-7 h-7 rounded-lg border border-gray-200 flex items-center justify-center text-muted-foreground"><X className="w-3.5 h-3.5"/></button></div>
            :<div className="flex items-center gap-3"><span className="text-base font-bold" style={{ fontFamily:"Onest,sans-serif" }}>{t.price} {t.currency||profileCurrency}</span><button onClick={()=>{setEditing(t.id!);setEditVal(String(t.price));}} className="opacity-0 group-hover:opacity-100 text-xs text-primary hover:underline transition-opacity">Modifier</button></div>}
          </div>
        ))}
        </div></div>
      );})}
      </div>}
      <div className="mt-6 p-4 bg-emerald-50 border border-emerald-100 rounded-xl text-sm text-emerald-800"><strong>Synchronisation automatique.</strong> Vos tarifs alimentent le moteur IA pour les estimations clients.</div>
    </div>
  );
}

// ─── Tech Agenda ──────────────────────────────────────────────────────────────

const DAY_NAMES = ["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"];
const WEEK_DAYS_FR = ["Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi","Dimanche"];

function TechAgenda() {
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDay, setSelectedDay] = useState(today.getDate());
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [blockedSlots, setBlockedSlots] = useState<BlockedSlot[]>([]);
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [showPriceModal, setShowPriceModal] = useState(false);
  const [selectedAppt, setSelectedAppt] = useState<Appointment|null>(null);
  const [actualPrice, setActualPrice] = useState("");
  const [caseDesc, setCaseDesc] = useState("");
  const [priceSaved, setPriceSaved] = useState(false);

  const refreshAppointments = useCallback(() => {
    api.get("/appointments").then((res) => setAppointments(res.data.map(mapAppointment))).catch(console.error);
  }, []);

  useEffect(() => {
    refreshAppointments();
    api.get("/blocked-slots").then((res) => setBlockedSlots(res.data.map(mapBlockedSlot))).catch(console.error);
    const socket = realtimeSocket();
    if (!socket) return;
    socket.on("appointment:new", refreshAppointments);
    socket.on("appointment:updated", refreshAppointments);
    return () => { socket.off("appointment:new", refreshAppointments); socket.off("appointment:updated", refreshAppointments); };
  }, [refreshAppointments]);

  const year = currentMonth.getFullYear(); const month = currentMonth.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const calDays: (number|null)[] = [];
  const monthStartOffset = (new Date(year, month, 1).getDay() + 6) % 7;
  for (let i = 0; i < monthStartOffset; i++) calDays.push(null);
  for(let d=1;d<=daysInMonth;d++) calDays.push(d);

  function changeMonth(delta: number) {
    const next = new Date(year, month + delta, 1);
    setCurrentMonth(next);
    const maxDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
    setSelectedDay((day) => Math.min(day, maxDay));
  }

  function dateStr(day: number) { return `${year}-${String(month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`; }
  function apptForDay(day: number) { return appointments.filter((a)=>String(a.date).slice(0,10)===dateStr(day)); }
  function blocksForDay(day: number) {
    const dow=(new Date(year,month,day).getDay()+6)%7;
    return blockedSlots.filter((b)=>(
      b.type==="weekly"&&b.weekDays?.includes(dow)
    ) || (
      b.type==="specific"&&String(b.date).slice(0,10)===dateStr(day)
    ) || b.type==="daily");
  }
  function isFullyBlockedDay(day: number) {
    return blocksForDay(day).some((block)=>block.startTime?.slice(0,5)==="00:00" && ["23:59","00:00"].includes(block.endTime?.slice(0,5)));
  }
  function dayColor(day: number) {
    if(isFullyBlockedDay(day)) return "bg-gray-100 border-gray-300 text-gray-400";
    if(blocksForDay(day).length) return "bg-amber-50 border-amber-300 text-amber-800 hover:border-amber-400";
    const apts=apptForDay(day);
    if(!apts.length) return "bg-white border-gray-200 text-foreground hover:border-blue-300";
    if(apts.every((a)=>a.status==="completed")) return "bg-emerald-100 border-emerald-400 text-emerald-800";
    if(apts.some((a)=>a.status==="confirmed"||a.status==="pending")) return "bg-blue-100 border-blue-400 text-blue-800";
    return "bg-white border-gray-200 text-foreground";
  }

  async function savePrice() {
    if(!selectedAppt||!actualPrice) return;
    try {
      const { data } = await api.patch(`/appointments/${selectedAppt.id}`, {
        status: "completed",
        actual_price: parseFloat(actualPrice),
        case_description: caseDesc,
      });
      setAppointments((apps)=>apps.map((a)=>a.id===selectedAppt.id?mapAppointment(data):a));
      setPriceSaved(true);
      setTimeout(()=>{setShowPriceModal(false);setActualPrice("");setCaseDesc("");setPriceSaved(false);},1200);
    } catch (err) { console.error(err); }
  }

  async function addBlockedSlot(b: Omit<BlockedSlot,"id">) {
    try {
      const { data } = await api.post("/blocked-slots", b);
      setBlockedSlots((s)=>[...s, mapBlockedSlot(data)]);
    } catch (err) { console.error(err); }
    setShowBlockModal(false);
  }

  async function removeBlockedSlot(id: number) {
    setBlockedSlots((s)=>s.filter((x)=>x.id!==id));
    try { await api.delete(`/blocked-slots/${id}`); } catch (err) { console.error(err); }
  }

  function callClient(appt: Appointment) {
    if (!appt.clientPhone) {
      alert("Aucun numéro de téléphone enregistré pour ce client.");
      return;
    }
    window.location.href = `tel:${appt.clientPhone}`;
  }

  function openDirections(appt: Appointment) {
    const hasCoordinates = Number.isFinite(appt.clientLat) && Number.isFinite(appt.clientLng)
      && (Number(appt.clientLat) !== 0 || Number(appt.clientLng) !== 0);
    const locationText = [appt.address || appt.clientProfileAddress, appt.clientCity].filter(Boolean).join(", ");
    const destination = hasCoordinates ? `${appt.clientLat},${appt.clientLng}` : locationText;
    if (!destination.trim()) {
      alert("Le client n’a enregistré ni coordonnées GPS, ni adresse, ni ville.");
      return;
    }
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=driving`, "_blank", "noopener,noreferrer");
  }

  const dayApts = apptForDay(selectedDay);
  const ss: Record<string,{dot:string;badge:string;label:string}> = { confirmed:{dot:"bg-blue-500",badge:"bg-blue-50 text-blue-700 border-blue-100",label:"Confirmé"}, pending:{dot:"bg-amber-500",badge:"bg-amber-50 text-amber-700 border-amber-100",label:"En attente"}, completed:{dot:"bg-emerald-500",badge:"bg-emerald-50 text-emerald-700 border-emerald-100",label:"Terminé"}, cancelled:{dot:"bg-red-400",badge:"bg-red-50 text-red-700 border-red-100",label:"Annulé"} };
  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="grid md:grid-cols-[380px_1fr] gap-6">
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-4"><h3 className="font-bold capitalize" style={{ fontFamily:"Onest,sans-serif" }}>{currentMonth.toLocaleDateString("fr-FR",{month:"long",year:"numeric"})}</h3><div className="flex gap-1"><button onClick={()=>changeMonth(-1)} className="w-7 h-7 rounded-lg border border-gray-200 flex items-center justify-center text-muted-foreground hover:bg-gray-50"><ChevronLeft className="w-4 h-4"/></button><button onClick={()=>changeMonth(1)} className="w-7 h-7 rounded-lg border border-gray-200 flex items-center justify-center text-muted-foreground hover:bg-gray-50"><ChevronRight className="w-4 h-4"/></button></div></div>
            <div className="grid grid-cols-7 gap-1 mb-1">{DAY_NAMES.map((d,i)=><div key={i} className="text-center text-xs font-medium text-muted-foreground py-1">{d}</div>)}</div>
            <div className="grid grid-cols-7 gap-1">{calDays.map((day,i)=>{
              if(!day) return <div key={i}/>;
              const isSel=day===selectedDay; const isToday=day===today.getDate()&&month===today.getMonth()&&year===today.getFullYear();
              return <button key={i} onClick={()=>setSelectedDay(day)} className={`aspect-square rounded-lg border text-xs font-medium transition-all relative ${dayColor(day)} ${isSel?"ring-2 ring-primary ring-offset-1":""} ${isToday?"font-black":""}`}>{day}{apptForDay(day).length>0&&<span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-current opacity-70"/>}</button>;
            })}</div>
            <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">{[["bg-emerald-100 border-emerald-400","Terminé"],["bg-blue-100 border-blue-400","Prévu"],["bg-gray-100 border-gray-300","Indisponible"]].map(([cls,l])=><div key={l} className="flex items-center gap-2 text-xs"><div className={`w-4 h-4 rounded border ${cls}`}/><span className="text-muted-foreground">{l}</span></div>)}</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3"><div className="text-sm font-semibold">Indisponibilités</div><button onClick={()=>setShowBlockModal(true)} className="flex items-center gap-1.5 h-7 px-3 rounded-lg bg-gray-100 text-xs hover:bg-gray-200"><Plus className="w-3 h-3"/>Ajouter</button></div>
            <div className="space-y-2">
              {blockedSlots.map((b)=><div key={b.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-gray-50 border border-gray-100"><BanIcon className="w-4 h-4 text-gray-400 shrink-0"/><div className="flex-1 min-w-0"><div className="text-xs font-medium truncate">{b.label}</div><div className="text-xs text-muted-foreground">{b.type==="daily"?`Tous les jours ${b.startTime}–${b.endTime}`:b.type==="weekly"?`${b.weekDays?.map((d)=>WEEK_DAYS_FR[d]).join(", ")}`:b.date}</div></div><button onClick={()=>removeBlockedSlot(b.id)} className="text-muted-foreground hover:text-red-500"><X className="w-3.5 h-3.5"/></button></div>)}
              {blockedSlots.length===0&&<div className="text-xs text-muted-foreground text-center py-2">Aucune indisponibilité</div>}
            </div>
          </div>
        </div>
        <div>
          <div className="mb-4"><h2 className="text-xl font-bold" style={{ fontFamily:"Onest,sans-serif" }}>{new Date(year,month,selectedDay).toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</h2><p className="text-sm text-muted-foreground">{dayApts.length} rendez-vous · {blocksForDay(selectedDay).length} indisponibilité(s)</p></div>
          {blocksForDay(selectedDay).length>0&&<div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 flex items-start gap-3 text-sm text-amber-800"><BanIcon className="w-5 h-5 shrink-0"/><div><strong>Créneaux bloqués :</strong> {blocksForDay(selectedDay).map((block)=>`${block.startTime.slice(0,5)}–${block.endTime.slice(0,5)}`).join(", ")}. Le reste de la journée demeure disponible.</div></div>}
          {dayApts.length===0?<div className="bg-white rounded-xl border border-gray-100 p-12 text-center shadow-sm"><Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-40"/><div className="text-sm text-muted-foreground">Aucun rendez-vous ce jour</div></div>:(
            <div className="space-y-3">{dayApts.map((appt)=>{ const s=ss[appt.status]; return (
              <div key={appt.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex gap-4">
                <div className="text-center w-16 shrink-0"><div className="text-sm font-bold" style={{ fontFamily:"Onest,sans-serif" }}>{appt.time}</div><div className="text-xs text-muted-foreground">{appt.duration}</div><div className={`w-2.5 h-2.5 rounded-full mx-auto mt-2 ${s.dot}`}/></div>
                <div className="w-px bg-gray-100 self-stretch"/>
                <div className="flex-1">
                  <div className="flex items-start justify-between"><div><div className="font-semibold text-sm">{appt.service}</div><div className="text-sm mt-0.5">{appt.client}</div></div><span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${s.badge}`}>{s.label}</span></div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-2"><MapPin className="w-3 h-3"/>{appt.address || appt.clientProfileAddress || appt.clientCity || "Localisation non renseignée"}</div>
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <div className="text-sm mb-2"><span className="text-muted-foreground">Estimé : </span><span className="font-bold">{appt.estimatedPrice} €</span></div>
                    {appt.status==="completed"&&appt.actualPrice?<div><div className="text-sm mb-1"><span className="text-muted-foreground">Réel : </span><span className="font-bold text-emerald-600">{appt.actualPrice} €</span></div>{appt.caseDescription&&<div className="text-xs text-muted-foreground bg-gray-50 p-2 rounded-lg mt-1">{appt.caseDescription}</div>}</div>
                    :appt.status==="confirmed"?<button onClick={()=>{setSelectedAppt(appt);setShowPriceModal(true);}} className="text-xs text-emerald-600 hover:underline flex items-center gap-1"><Edit2 className="w-3 h-3"/>Saisir le prix réel après intervention</button>:null}
                  </div>
                  <div className="flex gap-2 mt-3"><button onClick={()=>callClient(appt)} className="h-7 px-3 rounded-lg bg-gray-100 text-xs hover:bg-gray-200 flex items-center gap-1.5"><Phone className="w-3 h-3"/>Appeler</button><button onClick={()=>openDirections(appt)} className="h-7 px-3 rounded-lg bg-gray-100 text-xs hover:bg-gray-200 flex items-center gap-1.5"><MapPin className="w-3 h-3"/>Itinéraire</button></div>
                </div>
              </div>
            );})}
            </div>
          )}
        </div>
      </div>
      {showBlockModal&&<BlockSlotModal onClose={()=>setShowBlockModal(false)} onSave={addBlockedSlot}/>}
      {showPriceModal&&selectedAppt&&(
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl">
            <h3 className="text-lg font-bold mb-4" style={{ fontFamily:"Onest,sans-serif" }}>Finaliser l'intervention</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 bg-gray-50 rounded-xl p-3 text-sm"><div><div className="text-xs text-muted-foreground">Client</div><div className="font-medium">{selectedAppt.client}</div></div><div><div className="text-xs text-muted-foreground">Prix estimé</div><div className="font-medium">{selectedAppt.estimatedPrice} €</div></div></div>
              <div><label className="block text-xs font-medium mb-2">Prix réel facturé <span className="text-red-500">*</span></label><input type="number" placeholder="0" value={actualPrice} onChange={(e)=>setActualPrice(e.target.value)} className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm bg-gray-50 focus:outline-none focus:border-emerald-400"/></div>
              <div><label className="block text-xs font-medium mb-2">Description du cas <span className="text-muted-foreground font-normal">(enrichit la base IA)</span></label><textarea placeholder="Ex : Compresseur HS remplacé, recharge R32…" value={caseDesc} onChange={(e)=>setCaseDesc(e.target.value)} className="w-full h-24 px-3 py-2 rounded-lg border border-gray-200 text-sm bg-gray-50 focus:outline-none focus:border-emerald-400 resize-none"/><div className="text-xs text-muted-foreground mt-1 flex items-center gap-1"><TrendingUp className="w-3 h-3"/>Améliore les futures estimations IA</div></div>
              {priceSaved?<div className="flex items-center justify-center gap-2 h-10 text-emerald-600 font-medium text-sm"><CheckCircle2 className="w-5 h-5"/>Enregistré !</div>:<div className="flex gap-2"><button onClick={savePrice} disabled={!actualPrice} className="flex-1 h-10 rounded-lg bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600 disabled:opacity-40">Enregistrer</button><button onClick={()=>setShowPriceModal(false)} className="h-10 px-4 rounded-lg border border-gray-200 text-sm text-muted-foreground">Annuler</button></div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Block Slot Modal ─────────────────────────────────────────────────────────

function BlockSlotModal({ onClose, onSave }: { onClose: ()=>void; onSave: (b: Omit<BlockedSlot,"id">)=>void }) {
  const [type, setType] = useState<"specific"|"daily"|"weekly">("daily");
  const [date, setDate] = useState(""); const [weekDays, setWeekDays] = useState<number[]>([]);
  const [startTime, setStartTime] = useState("20:00"); const [endTime, setEndTime] = useState("08:00"); const [label, setLabel] = useState("");
  const quick = [{label:"Nuit (20h–8h)",type:"daily" as const,startTime:"20:00",endTime:"08:00"},{label:"Week-end",type:"weekly" as const,weekDays:[5,6],startTime:"00:00",endTime:"23:59"},{label:"Vendredi PM",type:"weekly" as const,weekDays:[4],startTime:"12:00",endTime:"18:00"}];
  function toggleDay(d: number){setWeekDays((p)=>p.includes(d)?p.filter((x)=>x!==d):[...p,d]);}
  function submit(){onSave({type,date:type==="specific"?date:undefined,weekDays:type==="weekly"?weekDays:undefined,startTime,endTime,label:label||(type==="daily"?`Nuit ${startTime}–${endTime}`:type==="weekly"?"Indisponible":date)} as Omit<BlockedSlot,"id">);}
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl" onClick={(e)=>e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5"><h3 className="text-lg font-bold" style={{ fontFamily:"Onest,sans-serif" }}>Bloquer un créneau</h3><button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5"/></button></div>
        <div className="mb-4"><div className="text-xs font-medium text-muted-foreground mb-2">Raccourcis rapides</div><div className="flex flex-wrap gap-2">{quick.map((q)=><button key={q.label} onClick={()=>{setType(q.type);if((q as any).weekDays)setWeekDays((q as any).weekDays);setStartTime(q.startTime);setEndTime(q.endTime);setLabel(q.label);}} className="px-3 py-1.5 rounded-full border border-gray-200 text-xs hover:border-blue-400 hover:bg-blue-50">{q.label}</button>)}</div></div>
        <div className="space-y-4">
          <div><label className="block text-xs font-medium mb-2">Type</label><div className="grid grid-cols-3 gap-2">{([["specific","Date précise"],["daily","Tous les jours"],["weekly","Jours semaine"]] as const).map(([v,l])=><button key={v} onClick={()=>setType(v)} className={`py-2 px-3 rounded-lg border text-xs font-medium ${type===v?"border-blue-400 bg-blue-50 text-blue-700":"border-gray-200 text-muted-foreground"}`}>{l}</button>)}</div></div>
          {type==="specific"&&<div><label className="block text-xs font-medium mb-1.5">Date</label><input type="date" value={date} onChange={(e)=>setDate(e.target.value)} className="w-full h-9 px-3 rounded-lg border border-gray-200 text-sm bg-gray-50 focus:outline-none focus:border-blue-400"/></div>}
          {type==="weekly"&&<div><label className="block text-xs font-medium mb-2">Jours</label><div className="flex gap-1">{WEEK_DAYS_FR.map((d,i)=><button key={i} onClick={()=>toggleDay(i)} className={`flex-1 py-1.5 rounded-lg border text-xs font-medium ${weekDays.includes(i)?"border-blue-400 bg-blue-50 text-blue-700":"border-gray-200 text-muted-foreground"}`}>{d.slice(0,3)}</button>)}</div></div>}
          <div className="grid grid-cols-2 gap-3"><div><label className="block text-xs font-medium mb-1.5">Début</label><input type="time" value={startTime} onChange={(e)=>setStartTime(e.target.value)} className="w-full h-9 px-3 rounded-lg border border-gray-200 text-sm bg-gray-50 focus:outline-none focus:border-blue-400"/></div><div><label className="block text-xs font-medium mb-1.5">Fin</label><input type="time" value={endTime} onChange={(e)=>setEndTime(e.target.value)} className="w-full h-9 px-3 rounded-lg border border-gray-200 text-sm bg-gray-50 focus:outline-none focus:border-blue-400"/></div></div>
          <div><label className="block text-xs font-medium mb-1.5">Motif (optionnel)</label><input placeholder="Formation, travail personnel…" value={label} onChange={(e)=>setLabel(e.target.value)} className="w-full h-9 px-3 rounded-lg border border-gray-200 text-sm bg-gray-50 focus:outline-none focus:border-blue-400"/></div>
          <div className="flex gap-2"><button onClick={submit} className="flex-1 h-10 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90">Bloquer ce créneau</button><button onClick={onClose} className="h-10 px-4 rounded-xl border border-gray-200 text-sm text-muted-foreground">Annuler</button></div>
        </div>
      </div>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [view, setView] = useState<View>("home");
  const [role, setRole] = useState<Role>("client");
  const [user, setUser] = useState<AppUser|null>(null);
  const [location, setLocation] = useState<UserLocation|null>(null);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [booting, setBooting] = useState(true);

  // Auto-login dans la session propre à cet onglet.
  useEffect(() => {
    const token = getAuthToken();
    if (!token) { setBooting(false); return; }
    api.get("/me")
      .then((res) => {
        const currentUser = res.data.user ?? res.data;
        setUser(currentUser);
        setRole(currentUser.role);
        const lat = Number(currentUser.lat);
        const lng = Number(currentUser.lng);
        if (Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)) {
          setLocation({ lat, lng, city: currentUser.city || "Position du profil", district: currentUser.city || "" });
        } else if (currentUser.city || currentUser.address) {
          const query = [currentUser.address, currentUser.city].filter(Boolean).join(", ");
          api.get("/geocode/forward", { params:{ city:query } }).then(({data})=>setLocation({ lat:Number(data.lat), lng:Number(data.lng), city:currentUser.city||data.city, district:currentUser.address||data.district||currentUser.city })).catch(()=>{});
        }
        setView(currentUser.role === "client" ? "client" : "tech");
      })
      .catch(() => clearAuthSession())
      .finally(() => setBooting(false));
  }, []);

  // Les techniciens sont utilisés par le client (recherche/chat) — chargés une fois connecté
  useEffect(() => {
    if (view !== "client" && view !== "tech") return;
    api.get("/technicians", {
      params: location ? { lat: location.lat, lng: location.lng } : undefined,
    }).then((res) => setTechnicians(res.data.map(mapTechnician))).catch(console.error);
  }, [view, location]);

  function selectRole(r: Role){setRole(r);setView("auth");}
  function handleLogin(u: AppUser){setUser(u);setView("location");}
  async function handleLocation(loc: UserLocation | null){
    setLocation(loc);
    if (loc && user) {
      try {
        const { data } = await api.patch(`/users/${user.id}`, {
          lat: loc.lat,
          lng: loc.lng,
        });
        setUser(data);
      } catch (err) {
        console.error(err);
      }
    }
    setView(role==="client"?"client":"tech");
  }
  function logout(){ disconnectRealtime(); clearAuthSession(); setUser(null);setLocation(null);setView("home"); }
  function updateUser(u: AppUser){setUser(u);}

  if (booting) {
    return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin"/></div>;
  }

  return (
    <div className="bg-background min-h-screen" style={{ fontFamily:"Onest,sans-serif" }}>
      <style>{`* { scrollbar-width:none; -ms-overflow-style:none; } *::-webkit-scrollbar { display:none; }`}</style>
      {view==="home"&&<Landing onSelect={selectRole}/>}
      {view==="auth"&&<AuthForm role={role} onBack={()=>setView("home")} onLogin={handleLogin}/>}
      {view==="location"&&user&&<LocationModal role={role} user={user} onDone={handleLocation}/>}
      {view==="client"&&user&&<ClientDashboard user={user} location={location} technicians={technicians} onLogout={logout} onUpdateUser={updateUser}/>}
      {view==="tech"&&user&&<TechDashboard user={user} location={location} onLogout={logout} onUpdateUser={updateUser}/>}
    </div>
  );
}
