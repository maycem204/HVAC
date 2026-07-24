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
import { useSpeechRecognition } from "../features/chatbot/useSpeechRecognition";
import type {
  AppUser, Appointment, BlockedSlot, ChatMsg, ClientTab, Lead, Notification,
  PriceDecision, PriceItem, Role, SuggestedSlot, Technician, TechTab,
  UserLocation, View,
} from "./domain";
import { mapAppointment, mapBlockedSlot, mapLead, mapNotification, mapTechnician } from "./mappers";
import { useInterfaceLanguage } from "./InterfaceLanguage";
import i18n from "../i18n";


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

export function translateBusinessValue(value: unknown): string {
  const source = String(value ?? "").trim();
  if (!source) return source;

  const translations: Record<string, string> = {
    "Climatisation": "business.airConditioning",
    "Réparation": "business.repair",
    "Chauffage": "business.heating",
    "Réfrigération": "business.refrigeration",
    "Pompe à chaleur": "business.heatPump",
    "Installation": "business.installation",
    "Maintenance": "business.maintenance",
    "Élevée": "business.high",
    "Élevé": "business.high",
    "Moyenne": "business.medium",
    "Moyen": "business.medium",
    "Faible": "business.low",
    "Tunisie": "business.tunisia",
    "Standard": "business.standard",
    "Urgent": "business.urgent",
    "Haute saison hiver (chauffage)": "business.highWinterHeatingSeason",
    "Diagnostic Climatisation": "business.airConditioningDiagnostic",
  };

  const key = translations[source];
  return key ? i18n.t(key) : source;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function Avatar({ initials, color, size = "md" }: { initials: string; color: string; size?: "sm" | "md" | "lg" }) {
  const sz = size === "sm" ? "w-8 h-8 text-xs" : size === "lg" ? "w-12 h-12 text-base" : "w-10 h-10 text-sm";
  if (String(initials || "").startsWith("data:image/")) return <img src={initials} alt={i18n.t("interface.profile.photo")} className={`${sz} rounded-full object-cover shrink-0 border border-white/40`}/>;
  return <div className={`${sz} ${color} rounded-full flex items-center justify-center text-white font-bold shrink-0`}>{initials}</div>;
}

export function resizeProfileImage(file: File): Promise<string> {
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
    reader.onerror = () => reject(new Error(i18n.t("interface.unable.to.read.the.selected.file")));
    reader.onload = () => {
      if (typeof reader.result !== "string") return reject(new Error(i18n.t("interface.unable.to.read.the.selected.file")));
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export function Badge({ children, color = "blue" }: { children: React.ReactNode; color?: "blue"|"green"|"amber"|"red"|"gray"|"purple" }) {
  const s: Record<string,string> = { blue:"bg-blue-50 text-blue-700 border-blue-100", green:"bg-emerald-50 text-emerald-700 border-emerald-100", amber:"bg-amber-50 text-amber-700 border-amber-100", red:"bg-red-50 text-red-700 border-red-100", gray:"bg-gray-50 text-gray-600 border-gray-100", purple:"bg-purple-50 text-purple-700 border-purple-100" };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${s[color]}`}>{children}</span>;
}

export function ConfidenceBar({ value }: { value: number }) {
  const color = value >= 75 ? "bg-emerald-500" : value >= 45 ? "bg-amber-500" : "bg-red-400";
  const label = i18n.t(value >= 75 ? "confidence.high" : value >= 45 ? "confidence.medium" : "confidence.low");
  const tc = value >= 75 ? "text-emerald-600" : value >= 45 ? "text-amber-600" : "text-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className={`h-full ${color} rounded-full`} style={{ width:`${value}%` }}/></div>
      <span className={`text-xs font-medium ${tc} w-12`}>{label}</span>
    </div>
  );
}

export function detectFaultType(messages: ChatMsg[]): string {
  const text = messages.map((m) => m.text).join(" ").toLowerCase();
  if (text.match(/clim|climatiseur|ac |froid|refroidit|split/)) return "Climatisation";
  if (text.match(/chauff|chaudière/)) return "Chauffage";
  if (text.match(/ventil/)) return "Ventilation";
  if (text.match(/install/)) return "Installation";
  return "Climatisation";
}

export function normalizeSpecialization(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function technicianMatchesFault(technician: Technician, faultType: string): boolean {
  const expected = (FAULT_SPECIALIZATION_MAP[faultType] ?? [faultType]).map(normalizeSpecialization);
  return technician.specializations.some((specialization) => {
    const normalized = normalizeSpecialization(specialization);
    return expected.some((candidate) => normalized === candidate || normalized.includes(candidate) || candidate.includes(normalized));
  });
}

// ─── Mappers backend (snake_case) → frontend (camelCase) ─────────────────────
// Adapte ces mappers si le format réel renvoyé par ton API diffère.

// ─── Notification Panel ───────────────────────────────────────────────────────

export function NotificationPanel({ notifications, onSelect, onReadAll, onClose }:
  { notifications: Notification[]; onSelect: (notification: Notification) => void; onReadAll: () => void; onClose: () => void }) {
  const { language, text:t } = useInterfaceLanguage();
  const unreadNotifications = notifications.filter((notification)=>!notification.read);
  const notificationText=(value:string)=>language==="fr"?value:value
    .replace(/Rendez-vous annulé/gi,t("notifications.appointmentCancelled"))
    .replace(/Rendez-vous confirmé/gi,t("notifications.appointmentConfirmed"))
    .replace(/Le client a annulé le rendez-vous du/gi,t("notifications.customerCancelledOn"))
    .replace(/Nouveau lead/gi,t("notifications.newLead"))
    .replace(/Nouvel avis client/gi,t("notifications.newCustomerReview"));
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
          <div><div className="font-semibold text-sm text-foreground">{i18n.t("interface.notifications")}</div><div className="text-xs text-muted-foreground">{t("interface.unread.notifications",{count:unreadNotifications.length})}</div></div>
          <div className="flex items-center gap-2"><button onClick={onReadAll} className="text-xs text-primary hover:underline">{t("interface.mark.all.as.read")}</button><button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4"/></button></div>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {unreadNotifications.length === 0 ? <div className="py-12 text-center text-sm text-muted-foreground">{t("interface.no.new.notifications")}</div>
          : unreadNotifications.map((n) => {
            const ni = icons[n.type];
            return (
              <button key={n.id} onClick={()=>onSelect(n)} className={`w-full text-left px-4 py-3.5 border-b border-gray-50 hover:bg-gray-50 flex items-start gap-3 ${!n.read?"bg-blue-50/30":""}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${ni?.cls}`}>{ni?.el}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2"><div className={`text-sm text-foreground ${!n.read?"font-semibold":""}`}>{notificationText(n.title)}</div>{!n.read&&<span className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1"/>}</div>
                  <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{notificationText(n.message)}</div>
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

export function ProfileModal({ user, role, onClose, onSave }:
  { user: AppUser; role: Role; onClose: () => void; onSave: (u: AppUser) => void }) {
  const [form, setForm] = useState({ ...user });
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [techSpec, setTechSpec] = useState<string[]>([]);
  const [customSpec, setCustomSpec] = useState("");
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
  function addCustomSpec() {
    const specialization = customSpec.trim().replace(/\s+/g, " ");
    if (!specialization) return;
    setTechSpec((current)=>current.some((item)=>item.toLocaleLowerCase()===specialization.toLocaleLowerCase())?current:[...current,specialization]);
    setCustomSpec("");
  }

  async function selectPhoto(file?: File) {
    if (!file) return;
    setPhotoError("");
    try { const avatar = await resizeProfileImage(file); setForm((previous) => ({ ...previous, avatar })); }
    catch (error: any) { setPhotoError(error.message || "Photo invalide."); }
  }

  async function save() {
    if (!String(form.city || "").trim()) {
      setPhotoError("La ville ou la localisation du profil est obligatoire.");
      return;
    }
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

  function field(key: keyof AppUser, label: string, type="text", ph="", required=false) {
    return <div><label className="block text-xs font-medium mb-1.5">{label}{required?" *":""}</label><input type={type} required={required} minLength={required?2:undefined} maxLength={required?120:undefined} placeholder={ph} value={form[key] as string} onChange={(e)=>setForm((p)=>({...p,[key]:e.target.value}))} className={`w-full h-10 px-3 rounded-lg border border-gray-200 text-sm bg-gray-50 focus:outline-none ${isClient?"focus:border-blue-400":"focus:border-emerald-400"} transition-all`}/></div>;
  }
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-xl overflow-hidden" onClick={(e)=>e.stopPropagation()}>
        <div className={`h-1.5 ${isClient?"bg-blue-500":"bg-emerald-500"}`}/>
        <div className="p-6 max-h-[85vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-6"><h3 className="text-lg font-bold text-foreground" style={{ fontFamily:"Onest,sans-serif" }}>{i18n.t("interface.my.profile")}</h3><button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5"/></button></div>
          <div className="flex items-center gap-4 mb-6 p-4 bg-gray-50 rounded-xl">
            <Avatar initials={form.avatar || form.name.split(" ").map((n)=>n[0]).join("").slice(0,2).toUpperCase() || "?"} color={isClient?"bg-blue-500":"bg-emerald-500"} size="lg"/>
            <div><div className="font-semibold text-foreground">{form.name||i18n.t("profile.yourName")}</div><Badge color={isClient?"blue":"green"}>{i18n.t(isClient?"profile.client":"profile.technician")}</Badge></div>
          </div>
          {!isClient&&<div className="mb-5"><label className="block text-xs font-medium mb-1.5">{i18n.t("interface.profile.photo")}</label><label className="h-10 px-3 rounded-lg border border-gray-200 bg-gray-50 text-sm inline-flex items-center gap-2 cursor-pointer hover:bg-gray-100"><Upload className="w-4 h-4"/>{i18n.t("interface.choose.a.photo")}<input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event)=>selectPhoto(event.target.files?.[0])}/></label>{photoError&&<div className="text-xs text-red-600 mt-1">{photoError}</div>}</div>}
          <div className="space-y-4">
            <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{i18n.t("interface.personal.information")}</div>
            <div className="grid grid-cols-2 gap-3">{field("name",i18n.t("interface.full.name"),"text",i18n.t("profile.yourName"))}{field("email","Email","email",i18n.t("common.emailPlaceholder"))}{field("phone",i18n.t("interface.phone"),"tel","+213 6 xx xx xx")}{field("city",i18n.t("interface.city.or.location"),"text",i18n.t("profile.cityExample"),true)}</div>
            {field("address",i18n.t("interface.address"),"text",i18n.t("profile.addressPlaceholder"))}
            {!isClient && (
              <div className="pt-2 space-y-4">
                <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{i18n.t("interface.specializations")}</div>
                <div className="flex flex-wrap gap-2">{ALL_SPECIALIZATIONS.map((s)=><button key={s} onClick={()=>toggleSpec(s)} className={`px-3 py-1.5 rounded-full text-xs border transition-all ${techSpec.includes(s)?"bg-emerald-500 text-white border-emerald-500":"bg-gray-50 text-muted-foreground border-gray-200 hover:border-emerald-300"}`}>{techSpec.includes(s)&&<Check className="w-3 h-3 inline mr-1"/>}{s}</button>)}</div>
                {techSpec.some((specialization)=>!ALL_SPECIALIZATIONS.includes(specialization))&&<div className="flex flex-wrap gap-2">{techSpec.filter((specialization)=>!ALL_SPECIALIZATIONS.includes(specialization)).map((specialization)=><button type="button" key={specialization} onClick={()=>toggleSpec(specialization)} className="px-3 py-1.5 rounded-full text-xs border border-emerald-500 bg-emerald-500 text-white"><Check className="w-3 h-3 inline mr-1"/>{specialization}<X className="w-3 h-3 inline ml-1"/></button>)}</div>}
                <div><label className="block text-xs font-medium mb-1.5">{i18n.t("interface.add.a.custom.specialization")}</label><div className="flex gap-2"><input value={customSpec} maxLength={80} onChange={(event)=>setCustomSpec(event.target.value)} onKeyDown={(event)=>{if(event.key==="Enter"){event.preventDefault();addCustomSpec();}}} placeholder={i18n.t("profile.specializationExample")} className="flex-1 h-10 px-3 rounded-lg border border-gray-200 text-sm bg-gray-50 focus:outline-none focus:border-emerald-400"/><button type="button" onClick={addCustomSpec} disabled={!customSpec.trim()} className="h-10 px-3 rounded-lg bg-emerald-500 text-white text-xs font-semibold disabled:opacity-40"><Plus className="w-4 h-4"/></button></div><p className="mt-1 text-[11px] text-muted-foreground">{i18n.t("interface.this.specialization.will.be.used.to.match.relevant.requests")}</p></div>
                <div><div className="flex items-center justify-between mb-2"><div className="text-xs font-medium">{i18n.t("interface.service.radius")}</div><span className="text-sm font-bold text-emerald-600">{radius} km</span></div><input type="range" min={2} max={50} value={radius} onChange={(e)=>setRadius(Number(e.target.value))} className="w-full accent-emerald-500"/></div>
              </div>
            )}
          </div>
          <div className="mt-6">{saved?<div className="flex items-center justify-center gap-2 h-11 text-emerald-600 font-medium text-sm"><CheckCircle2 className="w-5 h-5"/>{i18n.t("interface.profile.saved")}</div>:<button onClick={save} disabled={saving} className={`w-full h-11 rounded-xl text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 ${isClient?"bg-blue-600 hover:bg-blue-700":"bg-emerald-500 hover:bg-emerald-600"}`}><Save className="w-4 h-4"/>{i18n.t(saving?"profile.saving":"interface.save")}</button>}</div>
        </div>
      </div>
    </div>
  );
}

// ─── Location Modal ───────────────────────────────────────────────────────────
// Géolocalisation réelle : on géocode via l'API (proxy vers un service de
// géocodage) au lieu de renvoyer des coordonnées codées en dur.
