import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
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
  UserLocation, View, WorkingHour,
} from "./domain";
import { mapAppointment, mapBlockedSlot, mapLead, mapNotification, mapTechnician } from "./mappers";
import { Avatar, Badge, ConfidenceBar, NotificationPanel, ProfileModal } from "./SharedUi";

export function TechDashboard({ user, location, onLogout, onUpdateUser, onLocationUpdate }:
  { user: AppUser; location: UserLocation|null; onLogout: ()=>void; onUpdateUser: (u: AppUser)=>void; onLocationUpdate: (loc:UserLocation,u:AppUser)=>void }) {
  const navigate = useNavigate();
  const { tab: tabParam } = useParams();
  const validTabs: TechTab[] = ["leads", "messages", "tarifs", "agenda"];
  const tab: TechTab = validTabs.includes(tabParam as TechTab) ? tabParam as TechTab : "leads";
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [ratingsOpen, setRatingsOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationTracking, setLocationTracking] = useState(false);
  const [locationError, setLocationError] = useState("");
  const locationWatchRef = useRef<number|null>(null);
  const lastLocationSyncRef = useRef(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [stats, setStats] = useState({ jobsThisMonth: 0, revenue: 0, avgRating: 0 });
  const unread = notifications.filter((n)=>!n.read).length;
  const tabs = [{ id:"leads" as TechTab,label:"Leads",icon:Users },{ id:"messages" as TechTab,label:"Messages",icon:MessageCircle },{ id:"tarifs" as TechTab,label:"Tarification",icon:DollarSign },{ id:"agenda" as TechTab,label:"Agenda",icon:Calendar }];

  useEffect(() => {
    if (tabParam !== tab) navigate(`/technicien/${tab}`, { replace:true });
  }, [navigate, tab, tabParam]);

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
    if (notification.type === "rating") { setRatingsOpen(true); setNotifOpen(false); return; }
    const target: TechTab = notification.type === "message" ? "messages" : notification.type === "lead" || notification.type === "reassign" ? "leads" : notification.type === "rdv" || notification.type === "price" ? "agenda" : "leads";
    navigate(`/technicien/${target}`); setNotifOpen(false);
  }

  useEffect(() => () => {
    if (locationWatchRef.current != null && "geolocation" in navigator) navigator.geolocation.clearWatch(locationWatchRef.current);
  }, []);

  function stopLiveLocation() {
    if (locationWatchRef.current != null && "geolocation" in navigator) navigator.geolocation.clearWatch(locationWatchRef.current);
    locationWatchRef.current=null;
    setLocationTracking(false);
    setLocating(false);
  }

  function startLiveLocation() {
    if (!("geolocation" in navigator)) { setLocationError("La géolocalisation n’est pas disponible sur ce navigateur."); return; }
    lastLocationSyncRef.current=0;
    setLocating(true); setLocationError("");
    const watchId=navigator.geolocation.watchPosition(async ({coords})=>{
      const { latitude, longitude } = coords;
      const now=Date.now();
      if(now-lastLocationSyncRef.current<15000) return;
      lastLocationSyncRef.current=now;
      const loc: UserLocation={lat:latitude,lng:longitude,city:location?.city||"Position GPS",district:"Position en direct"};
      if(locationWatchRef.current==null)return;
      onLocationUpdate(loc,{...user,lat:latitude,lng:longitude});
      setLocating(false);setLocationError("");
      try {
        const {data:updatedUser}=await api.patch(`/users/${user.id}`,{lat:latitude,lng:longitude});
        if(locationWatchRef.current==null)return;
        onLocationUpdate(loc,updatedUser);
      } catch { setLocationError("La position est active, mais sa synchronisation a temporairement échoué."); }
    },(error)=>{
      setLocating(false);
      if(error.code===error.PERMISSION_DENIED){setLocationError("La localisation est bloquée. Autorisez-la dans les réglages du navigateur, puis réessayez.");stopLiveLocation();return;}
      setLocationError(error.code===error.TIMEOUT?"La recherche GPS prend du temps. Le suivi reste actif et continue de chercher votre position.":"Position GPS momentanément indisponible. Le suivi reste actif.");
    },{enableHighAccuracy:true,maximumAge:30000,timeout:30000});
    locationWatchRef.current=watchId;
    setLocationTracking(true);
  }

  function toggleLiveLocation(){if(locationTracking||locationWatchRef.current!=null)stopLiveLocation();else startLiveLocation();}

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="bg-white border-b border-border px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3"><div className="w-7 h-7 rounded-lg bg-emerald-600 flex items-center justify-center"><Wrench className="w-3.5 h-3.5 text-white"/></div><span className="font-bold text-foreground" style={{ fontFamily:"Onest,sans-serif" }}>QuoteAI Pro</span><Badge color="green">Technicien</Badge></div>
        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-5 mr-2 text-center"><div><div className="text-xs text-muted-foreground">Ce mois</div><div className="text-sm font-bold">{stats.jobsThisMonth} jobs</div></div><div><div className="text-xs text-muted-foreground">Revenus</div><div className="text-sm font-bold text-emerald-600">{stats.revenue} €</div></div><button onClick={()=>setRatingsOpen(true)} className="rounded-lg px-2 py-1 hover:bg-amber-50" title="Voir le détail des évaluations"><div className="text-xs text-muted-foreground">Note moy.</div><div className="text-sm font-bold text-amber-500">{stats.avgRating} ★</div></button></div>
          <button onClick={toggleLiveLocation} aria-pressed={locationTracking} className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-colors ${locationTracking?"border-red-300 bg-red-50 text-red-700 hover:bg-red-100":"border-gray-200 bg-gray-50 text-muted-foreground hover:border-emerald-300 hover:bg-emerald-50"}`} title={locationTracking?"Désactiver ma position":"Activer ma position en direct"}><Navigation className={`w-3 h-3 ${locationTracking?"text-red-600":"text-gray-400"} ${locating?"animate-pulse":""}`}/><span>{locationTracking?<><span className="hidden sm:inline">Désactiver ma position</span><span className="sm:hidden">Désactiver</span></>:"Activer ma position"}</span></button>
          <div className="relative"><button onClick={()=>setNotifOpen(!notifOpen)} className="relative w-9 h-9 rounded-xl hover:bg-gray-100 flex items-center justify-center text-muted-foreground hover:text-foreground"><Bell className="w-5 h-5"/>{unread>0&&<span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">{unread}</span>}</button></div>
          <button onClick={()=>setProfileOpen(true)} className="flex items-center gap-2 hover:bg-gray-50 rounded-xl px-2 py-1 transition-colors"><Avatar initials={user.avatar || user.name.slice(0,2).toUpperCase()} color="bg-emerald-500" size="sm"/><span className="text-sm font-medium hidden sm:block">{user.name}</span></button>
          <button onClick={onLogout} className="text-muted-foreground hover:text-foreground"><LogOut className="w-4 h-4"/></button>
        </div>
      </header>
      <div className="bg-white border-b border-border px-6">
        <div className="flex gap-1">{tabs.map((t)=><button key={t.id} onClick={()=>navigate(`/technicien/${t.id}`)} className={`flex items-center gap-2 px-4 py-3.5 text-sm font-medium border-b-2 transition-all ${tab===t.id?"border-emerald-500 text-emerald-700":"border-transparent text-muted-foreground hover:text-foreground"}`}><t.icon className="w-4 h-4"/>{t.label}</button>)}</div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {tab==="leads"&&<TechLeads/>}
        {tab==="messages"&&<ConversationsPanel/>}
        {tab==="tarifs"&&<TechTarifs city={user.city}/>}
        {tab==="agenda"&&<TechAgenda technicianLocation={location}/>}
      </div>
      {notifOpen&&<NotificationPanel notifications={notifications} onSelect={openTechNotification} onReadAll={markAllRead} onClose={()=>setNotifOpen(false)}/>}
      {profileOpen&&<ProfileModal user={user} role="technician" onClose={()=>setProfileOpen(false)} onSave={(u)=>{ onUpdateUser(u); setProfileOpen(false); }}/>}
      {ratingsOpen&&<TechRatings technicianId={user.id} onClose={()=>setRatingsOpen(false)}/>}
      {locationError&&<div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 shadow-lg"><button onClick={()=>setLocationError("")} className="float-right ml-3"><X className="w-4 h-4"/></button>{locationError}</div>}
    </div>
  );
}

type TechnicianRating = { rating: number; comment: string | null; client_name: string; updated_at: string };

function TechRatings({ technicianId, onClose }: { technicianId: number; onClose:()=>void }) {
  const [ratings, setRatings] = useState<TechnicianRating[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true); setError("");
    api.get(`/technicians/${technicianId}/ratings`)
      .then(({ data }) => setRatings(data.map((row: any) => ({ ...row, rating:Number(row.rating) }))))
      .catch(() => setError("Impossible de charger vos évaluations pour le moment."))
      .finally(() => setLoading(false));
  }, [technicianId]);

  const average = ratings.length ? ratings.reduce((sum, item)=>sum+item.rating,0)/ratings.length : 0;
  const distribution = [5,4,3,2,1].map((score)=>({ score, count:ratings.filter((item)=>item.rating===score).length }));

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onMouseDown={(event)=>{if(event.target===event.currentTarget)onClose();}}>
    <div role="dialog" aria-modal="true" aria-labelledby="ratings-title" className="w-full max-w-3xl max-h-[85vh] overflow-y-auto rounded-2xl bg-slate-50 p-4 md:p-6 shadow-2xl">
      <div className="mb-6 flex items-start justify-between gap-3"><div><h2 id="ratings-title" className="text-xl font-bold" style={{ fontFamily:"Onest,sans-serif" }}>Évaluations clients</h2><p className="text-sm text-muted-foreground">Notes et commentaires laissés par vos clients.</p></div><button onClick={onClose} className="w-9 h-9 rounded-xl bg-white border border-gray-200 flex items-center justify-center hover:bg-gray-50"><X className="w-4 h-4"/></button></div>
      {loading?<div className="py-16 text-center text-sm text-muted-foreground">Chargement des évaluations…</div>
      :error?<div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      :ratings.length===0?<div className="rounded-2xl border border-gray-100 bg-white p-10 text-center"><Star className="w-10 h-10 mx-auto text-gray-300 mb-3"/><div className="font-semibold">Aucune évaluation pour le moment</div><div className="text-sm text-muted-foreground mt-1">Les avis apparaîtront ici après les interventions évaluées par vos clients.</div></div>
      :<>
        <div className="grid md:grid-cols-[220px_1fr] gap-4 mb-6">
          <div className="rounded-2xl border border-gray-100 bg-white p-5 text-center"><div className="text-4xl font-black text-amber-500">{average.toFixed(1)}</div><div className="flex justify-center gap-1 my-2">{[1,2,3,4,5].map((score)=><Star key={score} className={`w-4 h-4 ${score<=Math.round(average)?"fill-amber-400 text-amber-400":"text-gray-200"}`}/>)}</div><div className="text-xs text-muted-foreground">{ratings.length} avis client{ratings.length>1?"s":""}</div></div>
          <div className="rounded-2xl border border-gray-100 bg-white p-5 space-y-2">{distribution.map(({score,count})=><div key={score} className="flex items-center gap-3 text-xs"><span className="w-8 font-medium">{score} ★</span><div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden"><div className="h-full rounded-full bg-amber-400" style={{width:`${ratings.length?count/ratings.length*100:0}%`}}/></div><span className="w-6 text-right text-muted-foreground">{count}</span></div>)}</div>
        </div>
        <div className="space-y-3">{ratings.map((item,index)=><article key={`${item.client_name}-${item.updated_at}-${index}`} className="rounded-2xl border border-gray-100 bg-white p-4"><div className="flex items-start justify-between gap-3"><div><div className="font-semibold text-sm">{item.client_name}</div><div className="flex gap-0.5 mt-1">{[1,2,3,4,5].map((score)=><Star key={score} className={`w-4 h-4 ${score<=item.rating?"fill-amber-400 text-amber-400":"text-gray-200"}`}/>)}</div></div><time className="text-xs text-muted-foreground">{new Date(item.updated_at).toLocaleDateString("fr-FR")}</time></div>{item.comment?<p className="mt-3 text-sm leading-relaxed text-slate-700">{item.comment}</p>:<p className="mt-3 text-xs italic text-muted-foreground">Aucun commentaire écrit.</p>}</article>)}</div>
      </>}
    </div>
    </div>
  );
}

// ─── Tech Leads ───────────────────────────────────────────────────────────────

function LeadDetails({ lead }: { lead: Lead }) {
  const details = lead.diagnosticDetails;
  const faults = details?.faults || [];
  const statusLabel = lead.status === "new" ? "Nouveau" : lead.status === "accepted" ? "Accepté" : "Clôturé";
  const age = details?.equipment_age_years != null ? `${details.equipment_age_years} an(s)` : details?.equipment_age_band;
  return (
    <div className="mt-3 rounded-xl bg-slate-50 border border-slate-100 p-4 text-xs space-y-4">
      <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2">
        <div><span className="text-muted-foreground">Demande :</span> {lead.problem}</div>
        <div><span className="text-muted-foreground">Catégorie :</span> {lead.faultType}</div>
        <div><span className="text-muted-foreground">Créneau :</span> {lead.requestedDate?`${String(lead.requestedDate).slice(0,10)} à ${String(lead.requestedTime||"").slice(0,5)}`:"À définir"}</div>
        <div><span className="text-muted-foreground">Adresse :</span> {lead.address||lead.city||"Non renseignée"}</div>
        <div><span className="text-muted-foreground">Estimation :</span> <strong>{lead.price.toLocaleString("fr-FR")} {lead.currency}</strong></div>
        <div><span className="text-muted-foreground">Statut :</span> {statusLabel}</div>
      </div>
      {lead.caseDescription&&<div className="rounded-lg border border-blue-100 bg-white p-3"><div className="font-semibold text-slate-700 mb-1">Description donnée par le client</div><p className="whitespace-pre-line leading-relaxed text-slate-600">{lead.caseDescription}</p></div>}
      {details&&<div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
        <div><span className="text-muted-foreground">Urgence :</span> {details.urgency||"Non précisée"}</div>
        <div><span className="text-muted-foreground">Complexité :</span> {details.complexity||"Non précisée"}</div>
        <div><span className="text-muted-foreground">Marque :</span> {details.brand||"Non indiquée"}</div>
        <div><span className="text-muted-foreground">Âge équipement :</span> {age||"Non indiqué"}</div>
        <div><span className="text-muted-foreground">Pays :</span> {details.country||"Non précisé"}</div>
        <div><span className="text-muted-foreground">Contexte saisonnier :</span> {details.season||"Non précisé"}</div>
      </div>}
      {faults.length>0&&<div className="space-y-2"><div className="font-semibold text-slate-700">Détail de la panne analysée</div>{faults.map((fault,index)=><div key={index} className="rounded-lg border border-slate-200 bg-white p-3 grid sm:grid-cols-2 gap-2">
        <div className="sm:col-span-2"><span className="text-muted-foreground">Symptôme / panne :</span> <strong>{fault.description||"Non précisé"}</strong></div>
        <div><span className="text-muted-foreground">Équipement :</span> {fault.equipment_type||"Non précisé"}</div>
        <div><span className="text-muted-foreground">Intervention prévue :</span> {fault.intervention_type||"À diagnostiquer"}</div>
        <div><span className="text-muted-foreground">Complexité :</span> {fault.complexity||details?.complexity||"Non précisée"}</div>
        <div><span className="text-muted-foreground">Référence :</span> {fault.code_hint||"Non attribuée"}</div>
        {fault.complexity_reason&&<div className="sm:col-span-2"><span className="text-muted-foreground">Justification :</span> {fault.complexity_reason}</div>}
      </div>)}</div>}
      {!lead.caseDescription&&!details&&<div className="text-muted-foreground italic">Les détails de diagnostic ne sont pas disponibles pour cette ancienne demande.</div>}
    </div>
  );
}

function TechLeads() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [filter, setFilter] = useState<"all"|"new"|"accepted"|"done">("all");
  const [reassigning, setReassigning] = useState<number|null>(null);
  const [reassigned, setReassigned] = useState<Record<number,string>>({});
  const [reassignmentFailed, setReassignmentFailed] = useState<Set<number>>(new Set());
  const [reassignmentErrors, setReassignmentErrors] = useState<Record<number,string>>({});
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
      await api.patch(`/leads/${id}`, { status: "accepted" });
      refreshLeads();
    } catch (err) { console.error(err); }
  }

  async function decline(id: number) {
    setReassigning(id);
    setReassignmentErrors((current)=>{ const next={...current}; delete next[id]; return next; });
    try {
      const { data } = await api.post(`/leads/${id}/decline`);
      setLeads((ls)=>ls.map((l)=>l.id===id?{...l,status:"done"}:l));
      if (data.reassignedTo) setReassigned((r)=>({...r,[id]:data.reassignedTo}));
      else setReassignmentFailed((current)=>new Set(current).add(id));
    } catch (err: any) {
      console.error(err);
      setReassignmentErrors((current)=>({...current,[id]:err?.response?.data?.error || "Impossible de réaffecter cette demande pour le moment."}));
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
              <div className="flex items-start justify-between gap-2"><div><div className="font-semibold text-sm">{lead.client}</div><div className="flex items-center gap-2 mt-0.5"><span className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3"/>{lead.city}</span><span className="px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded text-[10px] font-medium">{lead.faultType}</span></div></div><div className="text-right"><div className="text-lg font-black" style={{ fontFamily:"Onest,sans-serif" }}>{lead.price.toLocaleString("fr-FR")} {lead.currency}</div><div className="text-xs text-muted-foreground">{lead.time}</div></div></div>
              <div className="mt-2 text-sm">{lead.problem}</div>
              {lead.requestedDate&&<div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground"><span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5"/>{String(lead.requestedDate).slice(0,10)} à {String(lead.requestedTime||"").slice(0,5)}</span>{lead.address&&<span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5"/>{lead.address}</span>}</div>}
              <div className="mt-2"><div className="text-xs text-muted-foreground mb-1">Confiance IA</div><ConfidenceBar value={lead.confidence}/></div>
              <button onClick={()=>setExpanded(expanded===lead.id?null:lead.id)} className="mt-3 text-xs text-blue-600 hover:underline flex items-center gap-1">{expanded===lead.id?"Masquer les détails":"Voir toutes les informations"}<ChevronDown className={`w-3.5 h-3.5 transition-transform ${expanded===lead.id?"rotate-180":""}`}/></button>
              {expanded===lead.id&&<LeadDetails lead={lead}/>}
              {reassigning===lead.id?<div className="mt-3 flex items-center gap-2 text-sm text-blue-600"><RefreshCw className="w-4 h-4 animate-spin"/>Moteur IA recherche un autre technicien…</div>
              :reassigned[lead.id]?<div className="mt-3 flex items-center gap-2 text-xs text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2"><CheckCircle2 className="w-4 h-4 shrink-0"/>Lead réassigné à <strong>{reassigned[lead.id]}</strong> sur le même créneau — client et nouveau technicien notifiés.</div>
              :reassignmentErrors[lead.id]?<div className="mt-3 flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2"><AlertCircle className="w-4 h-4 shrink-0"/>{reassignmentErrors[lead.id]}</div>
              :reassignmentFailed.has(lead.id)?<div className="mt-3 flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2"><AlertCircle className="w-4 h-4 shrink-0"/>Aucun technicien compatible n’est disponible sur ce créneau — client notifié.</div>
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
const DEFAULT_WORKING_HOURS: WorkingHour[] = WEEK_DAYS_FR.map((_,weekDay)=>({weekDay,enabled:weekDay<6,startTime:weekDay===5?"09:00":"08:00",endTime:weekDay===5?"14:00":"18:00"}));
const mapWorkingHour = (row: any): WorkingHour => ({weekDay:Number(row.week_day??row.weekDay),enabled:Boolean(row.enabled),startTime:String(row.start_time??row.startTime).slice(0,5),endTime:String(row.end_time??row.endTime).slice(0,5)});

function TechAgenda({ technicianLocation }: { technicianLocation:UserLocation|null }) {
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDay, setSelectedDay] = useState(today.getDate());
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [blockedSlots, setBlockedSlots] = useState<BlockedSlot[]>([]);
  const [workingHours, setWorkingHours] = useState<WorkingHour[]>(DEFAULT_WORKING_HOURS);
  const [showHoursModal, setShowHoursModal] = useState(false);
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
    api.get("/working-hours").then((res)=>setWorkingHours(res.data.map(mapWorkingHour))).catch(console.error);
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
  function hoursForDay(day: number) {
    const dow=(new Date(year,month,day).getDay()+6)%7;
    return workingHours.find((item)=>item.weekDay===dow);
  }
  function dayColor(day: number) {
    if(hoursForDay(day)?.enabled===false) return "bg-gray-100 border-gray-300 text-gray-400";
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

  async function saveWorkingHours(hours: WorkingHour[]) {
    const { data } = await api.put("/working-hours", { hours });
    setWorkingHours(data.map(mapWorkingHour));
    setShowHoursModal(false);
  }

  function callClient(appt: Appointment) {
    if (!appt.clientPhone) {
      alert("Aucun numéro de téléphone enregistré pour ce client.");
      return;
    }
    window.location.href = `tel:${appt.clientPhone}`;
  }

  function directionsUrl(appt: Appointment) {
    const latitude = Number(appt.clientLat);
    const longitude = Number(appt.clientLng);
    const hasCoordinates = Number.isFinite(latitude) && Number.isFinite(longitude)
      && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180
      && (latitude !== 0 || longitude !== 0);
    const locationText = [appt.address || appt.clientProfileAddress, appt.clientCity].filter(Boolean).join(", ");
    const destination = hasCoordinates ? `${latitude},${longitude}` : locationText.trim();
    if(!destination) return null;
    const techLat=Number(technicianLocation?.lat); const techLng=Number(technicianLocation?.lng);
    const hasOrigin=Number.isFinite(techLat)&&Number.isFinite(techLng)&&Math.abs(techLat)<=90&&Math.abs(techLng)<=180&&(techLat!==0||techLng!==0);
    const origin=hasOrigin?`&origin=${encodeURIComponent(`${techLat},${techLng}`)}`:"";
    return `https://www.google.com/maps/dir/?api=1${origin}&destination=${encodeURIComponent(destination)}&travelmode=driving&dir_action=navigate`;
  }

  const dayApts = apptForDay(selectedDay);
  const ss: Record<string,{dot:string;badge:string;label:string}> = { confirmed:{dot:"bg-blue-500",badge:"bg-blue-50 text-blue-700 border-blue-100",label:"Confirmé"}, pending:{dot:"bg-amber-500",badge:"bg-amber-50 text-amber-700 border-amber-100",label:"En attente"}, completed:{dot:"bg-emerald-500",badge:"bg-emerald-50 text-emerald-700 border-emerald-100",label:"Terminé"}, cancelled:{dot:"bg-red-400",badge:"bg-red-50 text-red-700 border-red-100",label:"Annulé"} };
  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="grid md:grid-cols-[380px_1fr] gap-6">
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3"><div><div className="text-sm font-semibold">Horaires habituels</div><div className="text-xs text-muted-foreground mt-0.5">Votre semaine de travail récurrente</div></div><button onClick={()=>setShowHoursModal(true)} className="flex items-center gap-1.5 h-7 px-3 rounded-lg bg-emerald-50 text-emerald-700 text-xs hover:bg-emerald-100"><Clock className="w-3 h-3"/>Modifier</button></div>
            <div className="space-y-1.5">{workingHours.map((item)=><div key={item.weekDay} className="flex items-center justify-between text-xs"><span className="text-slate-600">{WEEK_DAYS_FR[item.weekDay]}</span>{item.enabled?<span className="font-medium text-emerald-700">{item.startTime}–{item.endTime}</span>:<span className="text-muted-foreground">Fermé</span>}</div>)}</div>
          </div>
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
            <div className="flex items-center justify-between mb-3"><div><div className="text-sm font-semibold">Exceptions et absences</div><div className="text-xs text-muted-foreground mt-0.5">Congés, formation ou absence ponctuelle</div></div><button onClick={()=>setShowBlockModal(true)} className="flex items-center gap-1.5 h-7 px-3 rounded-lg bg-gray-100 text-xs hover:bg-gray-200"><Plus className="w-3 h-3"/>Ajouter</button></div>
            <div className="space-y-2">
              {blockedSlots.map((b)=><div key={b.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-gray-50 border border-gray-100"><BanIcon className="w-4 h-4 text-gray-400 shrink-0"/><div className="flex-1 min-w-0"><div className="text-xs font-medium truncate">{b.label}</div><div className="text-xs text-muted-foreground">{b.type==="daily"?`Tous les jours ${b.startTime}–${b.endTime}`:b.type==="weekly"?`${b.weekDays?.map((d)=>WEEK_DAYS_FR[d]).join(", ")}`:b.date}</div></div><button onClick={()=>removeBlockedSlot(b.id)} className="text-muted-foreground hover:text-red-500"><X className="w-3.5 h-3.5"/></button></div>)}
              {blockedSlots.length===0&&<div className="text-xs text-muted-foreground text-center py-2">Aucune indisponibilité</div>}
            </div>
          </div>
        </div>
        <div>
          <div className="mb-4"><h2 className="text-xl font-bold" style={{ fontFamily:"Onest,sans-serif" }}>{new Date(year,month,selectedDay).toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</h2><p className="text-sm text-muted-foreground">{dayApts.length} rendez-vous · {hoursForDay(selectedDay)?.enabled?`disponible ${hoursForDay(selectedDay)?.startTime}–${hoursForDay(selectedDay)?.endTime}`:"journée non travaillée"}</p></div>
          {blocksForDay(selectedDay).length>0&&<div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 flex items-start gap-3 text-sm text-amber-800"><BanIcon className="w-5 h-5 shrink-0"/><div><strong>Créneaux bloqués :</strong> {blocksForDay(selectedDay).map((block)=>`${block.startTime.slice(0,5)}–${block.endTime.slice(0,5)}`).join(", ")}. Le reste de la journée demeure disponible.</div></div>}
          {dayApts.length===0?<div className="bg-white rounded-xl border border-gray-100 p-12 text-center shadow-sm"><Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-40"/><div className="text-sm text-muted-foreground">Aucun rendez-vous ce jour</div></div>:(
            <div className="space-y-3">{dayApts.map((appt)=>{ const s=ss[appt.status]; const mapsUrl=directionsUrl(appt); return (
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
                  <div className="flex gap-2 mt-3"><button onClick={()=>callClient(appt)} className="h-7 px-3 rounded-lg bg-gray-100 text-xs hover:bg-gray-200 flex items-center gap-1.5"><Phone className="w-3 h-3"/>Appeler</button>{mapsUrl?<a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="h-7 px-3 rounded-lg bg-gray-100 text-xs hover:bg-gray-200 flex items-center gap-1.5"><MapPin className="w-3 h-3"/>Itinéraire</a>:<button onClick={()=>alert("Le client n’a enregistré ni coordonnées GPS, ni adresse, ni ville.")} className="h-7 px-3 rounded-lg bg-gray-100 text-xs text-muted-foreground flex items-center gap-1.5"><MapPin className="w-3 h-3"/>Adresse indisponible</button>}</div>
                </div>
              </div>
            );})}
            </div>
          )}
        </div>
      </div>
      {showBlockModal&&<BlockSlotModal onClose={()=>setShowBlockModal(false)} onSave={addBlockedSlot}/>}
      {showHoursModal&&<WorkingHoursModal initialHours={workingHours} onClose={()=>setShowHoursModal(false)} onSave={saveWorkingHours}/>}
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

// ─── Working Hours Modal ──────────────────────────────────────────────────────

function WorkingHoursModal({ initialHours, onClose, onSave }: { initialHours:WorkingHour[]; onClose:()=>void; onSave:(hours:WorkingHour[])=>Promise<void> }) {
  const [hours,setHours]=useState<WorkingHour[]>(()=>DEFAULT_WORKING_HOURS.map((fallback)=>initialHours.find((item)=>item.weekDay===fallback.weekDay)||fallback));
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  function update(weekDay:number, values:Partial<WorkingHour>){setHours((items)=>items.map((item)=>item.weekDay===weekDay?{...item,...values}:item));}
  async function submit(){
    if(hours.some((item)=>item.enabled&&item.startTime>=item.endTime)){setError("L’heure de fin doit être après l’heure de début.");return;}
    setSaving(true);setError("");
    try { await onSave(hours); } catch (err:any) { setError(err?.response?.data?.error||"Impossible d’enregistrer les horaires."); setSaving(false); }
  }
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl" onClick={(event)=>event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-5"><div><h3 className="text-lg font-bold" style={{fontFamily:"Onest,sans-serif"}}>Horaires habituels</h3><p className="text-xs text-muted-foreground mt-1">Les clients ne pourront réserver que dans ces plages. Une intervention dure actuellement 2 heures.</p></div><button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5"/></button></div>
        <div className="space-y-2">{hours.map((item)=><div key={item.weekDay} className={`grid grid-cols-[110px_1fr] sm:grid-cols-[120px_1fr] gap-3 items-center rounded-xl border p-3 ${item.enabled?"border-emerald-100 bg-emerald-50/40":"border-gray-100 bg-gray-50"}`}>
          <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={item.enabled} onChange={(event)=>update(item.weekDay,{enabled:event.target.checked})} className="accent-emerald-600"/>{WEEK_DAYS_FR[item.weekDay]}</label>
          {item.enabled?<div className="flex items-center gap-2"><input aria-label={`Début ${WEEK_DAYS_FR[item.weekDay]}`} type="time" value={item.startTime} onChange={(event)=>update(item.weekDay,{startTime:event.target.value})} className="min-w-0 w-full h-9 px-2 rounded-lg border border-gray-200 bg-white text-sm"/><span className="text-muted-foreground">à</span><input aria-label={`Fin ${WEEK_DAYS_FR[item.weekDay]}`} type="time" value={item.endTime} onChange={(event)=>update(item.weekDay,{endTime:event.target.value})} className="min-w-0 w-full h-9 px-2 rounded-lg border border-gray-200 bg-white text-sm"/></div>:<div className="text-xs text-muted-foreground">Journée non travaillée</div>}
        </div>)}</div>
        {error&&<div className="mt-3 rounded-lg bg-red-50 border border-red-100 p-2.5 text-xs text-red-600">{error}</div>}
        <div className="flex gap-2 mt-5"><button onClick={submit} disabled={saving} className="flex-1 h-10 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50">{saving?"Enregistrement…":"Enregistrer les horaires"}</button><button onClick={onClose} className="h-10 px-4 rounded-xl border border-gray-200 text-sm text-muted-foreground">Annuler</button></div>
      </div>
    </div>
  );
}

// ─── Block Slot Modal ─────────────────────────────────────────────────────────

function BlockSlotModal({ onClose, onSave }: { onClose: ()=>void; onSave: (b: Omit<BlockedSlot,"id">)=>void }) {
  const [type, setType] = useState<"specific"|"daily"|"weekly">("specific");
  const [date, setDate] = useState(""); const [weekDays, setWeekDays] = useState<number[]>([]);
  const [startTime, setStartTime] = useState("08:00"); const [endTime, setEndTime] = useState("18:00"); const [label, setLabel] = useState("");
  function toggleDay(d: number){setWeekDays((p)=>p.includes(d)?p.filter((x)=>x!==d):[...p,d]);}
  function submit(){onSave({type,date:type==="specific"?date:undefined,weekDays:type==="weekly"?weekDays:undefined,startTime,endTime,label:label||(type==="daily"?`Nuit ${startTime}–${endTime}`:type==="weekly"?"Indisponible":date)} as Omit<BlockedSlot,"id">);}
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl" onClick={(e)=>e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5"><h3 className="text-lg font-bold" style={{ fontFamily:"Onest,sans-serif" }}>Bloquer un créneau</h3><button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5"/></button></div>
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
