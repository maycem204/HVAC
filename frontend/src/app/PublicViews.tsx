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
import { Avatar } from "./SharedUi";
import i18n from "../i18n";

export function LocationModal({ role, user, onDone }: { role: Role; user: AppUser; onDone: (loc: UserLocation | null) => void }) {
  const [state, setState] = useState<"ask"|"loading"|"done"|"denied">("ask");
  const [city, setCity] = useState(user.city || "");
  const [geoError, setGeoError] = useState("");
  const isClient = role === "client";

  async function useProfileLocation() {
    const query = [user.address, user.city].filter(Boolean).join(", ");
    if (!query) return onDone(null);
    try {
      const { data } = await api.get("/geocode/forward", { params: { city: query } });
      onDone({ lat:Number(data.lat), lng:Number(data.lng), city:user.city || data.city, district:user.address || data.district || user.city, source:"profile" });
    } catch { onDone({ lat:Number(user.lat||0), lng:Number(user.lng||0), city:user.city, district:user.address || user.city, source:"profile" }); }
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
          source: "gps",
        };

        try {
          const { data } = await api.get("/geocode/reverse", { params: { lat: latitude, lng: longitude } });
          loc = {
            lat: latitude,
            lng: longitude,
            city: data.city || loc.city,
            district: data.district || data.city || loc.district,
            source: "gps",
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
      onDone({ lat: data.lat, lng: data.lng, city: data.city ?? city, district: data.district ?? city, source:"profile" });
    } catch {
      // Si le géocodage échoue, on avance quand même avec la ville saisie
      onDone({ lat: 0, lng: 0, city, district: city, source:"profile" });
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
            <button onClick={requestGeo} className={`w-full h-11 rounded-xl text-white text-sm font-semibold flex items-center justify-center gap-2 ${isClient?"bg-blue-600 hover:bg-blue-700":"bg-emerald-600 hover:bg-emerald-700"}`}><Navigation className="w-4 h-4"/>{i18n.t("interface.use.my.gps.location")}</button>
            <div className="relative"><div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-100"/></div><div className="relative flex justify-center"><span className="px-3 bg-white text-xs text-muted-foreground">{i18n.t("interface.or.enter.your.city")}</span></div></div>
            <div className="flex gap-2"><input placeholder={i18n.t("interface.city.example")} value={city} onChange={(e)=>setCity(e.target.value)} onKeyDown={(e)=>e.key==="Enter"&&manualSubmit()} className="flex-1 h-10 px-3 rounded-lg border border-gray-200 text-sm bg-gray-50 focus:outline-none focus:border-blue-400"/><button onClick={manualSubmit} disabled={!city.trim()} className="h-10 px-4 rounded-lg bg-gray-800 text-white text-sm disabled:opacity-40">OK</button></div>
            <button onClick={useProfileLocation} className="w-full text-center text-xs text-muted-foreground py-1 hover:text-foreground">{i18n.t("interface.continue.with.my.address.and.city")}</button>
          </div>
        )}
        {state==="loading" && <div className="flex flex-col items-center py-6 gap-3"><div className="w-10 h-10 rounded-full border-2 border-blue-500 border-t-transparent animate-spin"/><div className="text-sm text-muted-foreground">{i18n.t("interface.locating")}</div></div>}
        {state==="done" && <div className="flex flex-col items-center py-6 gap-3"><CheckCircle2 className="w-10 h-10 text-emerald-500"/><div className="text-sm font-medium">{i18n.t("interface.location.found")}</div></div>}
        {state==="denied" && (
          <div className="space-y-3">
            <div className="flex items-start gap-2 p-3 bg-amber-50 rounded-lg border border-amber-100 text-xs text-amber-700"><AlertCircle className="w-4 h-4 shrink-0 mt-0.5"/>{geoError || "Accès GPS refusé. Saisissez votre ville manuellement."}</div>
            <div className="flex gap-2"><input placeholder={i18n.t("interface.your.city")} value={city} onChange={(e)=>setCity(e.target.value)} className="flex-1 h-10 px-3 rounded-lg border border-gray-200 text-sm bg-gray-50 focus:outline-none focus:border-blue-400"/><button onClick={manualSubmit} disabled={!city.trim()} className="h-10 px-4 rounded-lg bg-gray-800 text-white text-sm disabled:opacity-40">OK</button></div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Landing ──────────────────────────────────────────────────────────────────

export function Landing({ onSelect }: { onSelect: (role: Role) => void }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex flex-col">
      <nav className="px-8 py-5 flex items-center justify-between">
        <div className="flex items-center gap-2.5"><div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center shadow-sm"><Zap className="w-4 h-4 text-white"/></div><span className="font-bold text-lg text-foreground" style={{ fontFamily:"Onest,sans-serif" }}>QuoteAI</span></div>
        <div className="flex gap-2"><button onClick={()=>onSelect("client")} className="h-9 px-4 text-sm text-muted-foreground hover:text-foreground">{i18n.t("interface.client.login")}</button><button onClick={()=>onSelect("technician")} className="h-9 px-4 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 font-medium">{i18n.t("interface.technician.space")}</button></div>
      </nav>
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-16 text-center">
        <div className="inline-flex items-center gap-2 mb-6 px-3 py-1.5 rounded-full bg-blue-100 text-blue-700 text-xs font-medium"><span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"/>{i18n.t("interface.instant.ai.powered.hvac.quotes")}</div>
        <h1 className="text-5xl md:text-6xl font-black text-foreground mb-6 leading-tight max-w-3xl" style={{ fontFamily:"Onest,sans-serif" }}>{i18n.t("interface.your.hvac.quote")}<br/><span className="text-primary">{i18n.t("interface.in.seconds")}</span></h1>
        <p className="text-lg text-muted-foreground max-w-xl mb-14">{i18n.t("interface.describe.your.issue.get.a.price.estimate.and.find.a.qualified.technician")}</p>
        <div className="grid md:grid-cols-2 gap-5 max-w-2xl w-full">
          {[{r:"client" as Role,t:"Je suis un client",d:"Obtenez un devis, trouvez un technicien et réservez.",Icon:User,c:"blue"},{r:"technician" as Role,t:"Je suis technicien",d:"Gérez vos leads, tarifs et agenda.",Icon:Wrench,c:"emerald"}].map(({r,t,d,Icon,c})=>(
            <button key={r} onClick={()=>onSelect(r)} className="group bg-white rounded-2xl p-8 border border-gray-100 shadow-sm hover:shadow-lg transition-all text-left">
              <div className={`w-12 h-12 rounded-xl bg-${c}-50 flex items-center justify-center mb-5 group-hover:bg-${c}-100 transition-colors`}><Icon className={`w-6 h-6 text-${c}-600`}/></div>
              <div className="text-lg font-bold text-foreground mb-1" style={{ fontFamily:"Onest,sans-serif" }}>{t}</div>
              <div className="text-sm text-muted-foreground mb-4">{d}</div>
              <div className={`flex items-center gap-1.5 text-sm text-${c}-600 font-medium`}>{i18n.t("interface.access")} <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform"/></div>
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

export function AuthForm({ role, onBack, onLogin }: { role: Role; onBack: () => void; onLogin: (u: AppUser) => void }) {
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


      onLogin(data.user);
    } catch (err: any) {
      setError(err.response?.data?.error ?? "Une erreur est survenue. Vérifiez vos identifiants.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50/40 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6"><ChevronRight className="w-4 h-4 rotate-180"/>{i18n.t("interface.back")}</button>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <div className="flex items-center gap-3 mb-8">
            <div className={`w-10 h-10 rounded-xl ${isClient?"bg-blue-50":"bg-emerald-50"} flex items-center justify-center`}>{isClient?<User className={`w-5 h-5 ${cl}`}/>:<Wrench className={`w-5 h-5 ${cl}`}/>}</div>
            <div><div className="font-bold text-foreground text-sm">{isClient?"Espace client":"Espace technicien"}</div><div className="text-xs text-muted-foreground">{mode==="login"?"Connexion":"Créer un compte"}</div></div>
          </div>
          {error && <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-100 text-xs text-red-600 flex items-center gap-2"><AlertCircle className="w-4 h-4 shrink-0"/>{error}</div>}
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode==="register"&&<div><label className="block text-xs font-medium mb-1.5">{i18n.t("interface.full.name")}</label><input required value={form.name} onChange={(e)=>setForm((p)=>({...p,name:e.target.value}))} className={`w-full h-11 px-4 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none ${focus}`}/></div>}
            {mode==="register"&&<div className={`p-3 rounded-xl border-2 ${isClient?"border-blue-200 bg-blue-50/50":"border-emerald-200 bg-emerald-50/50"}`}><label className="block text-xs font-semibold mb-1.5">{isClient?"Ville ou localisation *":"Ville ou localisation du local professionnel *"}</label><input required minLength={2} maxLength={120} autoComplete="address-level2" placeholder="Ex : Houmt Souk, Djerba, Zarzis, Alger…" value={form.city} onChange={(e)=>setForm((p)=>({...p,city:e.target.value}))} className={`w-full h-11 px-4 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none ${focus}`}/><p className={`mt-1.5 text-[11px] ${isClient?"text-blue-800":"text-emerald-800"}`}>{i18n.t("interface.required.this.location.is.used.by.default.when.gps.is.off")}</p></div>}
            <div><label className="block text-xs font-medium mb-1.5">Email</label><input type="email" required placeholder="votre@email.com" value={form.email} onChange={(e)=>setForm((p)=>({...p,email:e.target.value}))} className={`w-full h-11 px-4 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none ${focus}`}/></div>
            <div><label className="block text-xs font-medium mb-1.5">{i18n.t("interface.password")}</label><div className="relative"><input type={showPass?"text":"password"} required minLength={mode==="register"?8:1} maxLength={72} autoComplete={mode==="register"?"new-password":"current-password"} placeholder={i18n.t("interface.8.characters.minimum")} value={form.password} onChange={(e)=>setForm((p)=>({...p,password:e.target.value}))} className={`w-full h-11 px-4 pr-10 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none ${focus}`}/><button type="button" onClick={()=>setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">{showPass?<EyeOff className="w-4 h-4"/>:<Eye className="w-4 h-4"/>}</button></div>{mode==="register"&&<p className="mt-1.5 text-[11px] text-muted-foreground">{i18n.t("interface.avoid.your.name.email.and.common.passwords")}</p>}</div>
            <button type="submit" disabled={loading} className={`w-full h-11 rounded-xl ${bg} text-white text-sm font-semibold mt-2 disabled:opacity-50`}>{loading?"Chargement…":mode==="login"?"Se connecter":"Créer mon compte"}</button>
          </form>
          <div className="mt-5 text-center text-sm text-muted-foreground">{mode==="login"?<>Pas encore de compte ?{" "}<button onClick={()=>setMode("register")} className={`${cl} font-medium hover:underline`}>{i18n.t("interface.sign.up")}</button></>:<>Déjà un compte ?{" "}<button onClick={()=>setMode("login")} className={`${cl} font-medium hover:underline`}>{i18n.t("interface.sign.in")}</button></>}</div>
        </div>
      </div>
    </div>
  );
}

// ─── Client Dashboard ─────────────────────────────────────────────────────────
