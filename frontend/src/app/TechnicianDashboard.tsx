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
import { createDirectionsUrl } from "../services/map-service";
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
import { useInterfaceLanguage } from "./InterfaceLanguage";
import i18n from "../i18n";

export function TechDashboard({ user, location, onLogout, onUpdateUser, locationTracking, locating, locationError, onToggleLocation, onClearLocationError }:
  { user: AppUser; location: UserLocation|null; onLogout: ()=>void; onUpdateUser: (u: AppUser)=>void; locationTracking:boolean; locating:boolean; locationError:string; onToggleLocation:()=>void; onClearLocationError:()=>void }) {
  const navigate = useNavigate();
  const { tab: tabParam } = useParams();
  const validTabs: TechTab[] = ["leads", "messages", "tarifs", "agenda"];
  const tab: TechTab = validTabs.includes(tabParam as TechTab) ? tabParam as TechTab : "leads";
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [ratingsOpen, setRatingsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [stats, setStats] = useState({ jobsThisMonth: 0, revenue: 0, avgRating: 0 });
  const unread = notifications.filter((n)=>!n.read).length;
  const tabs = [{ id:"leads" as TechTab,label:i18n.t("interface.incoming.leads"),icon:Users },{ id:"messages" as TechTab,label:i18n.t("interface.messages"),icon:MessageCircle },{ id:"tarifs" as TechTab,label:i18n.t("interface.pricing"),icon:DollarSign },{ id:"agenda" as TechTab,label:i18n.t("interface.schedule"),icon:Calendar }];

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

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="bg-white border-b border-border px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3"><div className="w-7 h-7 rounded-lg bg-emerald-600 flex items-center justify-center"><Wrench className="w-3.5 h-3.5 text-white"/></div><span className="font-bold text-foreground" style={{ fontFamily:"Onest,sans-serif" }}>QuoteAI Pro</span><Badge color="green">{i18n.t("profile.technician")}</Badge></div>
        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-5 mr-2 text-center"><div><div className="text-xs text-muted-foreground">{i18n.t("interface.this.month")}</div><div className="text-sm font-bold">{i18n.t("technician.jobs",{count:stats.jobsThisMonth})}</div></div><div><div className="text-xs text-muted-foreground">{i18n.t("interface.revenue")}</div><div className="text-sm font-bold text-emerald-600">{stats.revenue} €</div></div><button onClick={()=>setRatingsOpen(true)} className="rounded-lg px-2 py-1 hover:bg-amber-50" title={i18n.t("interface.view.rating.details")}><div className="text-xs text-muted-foreground">{i18n.t("interface.average.rating")}</div><div className="text-sm font-bold text-amber-500">{stats.avgRating} ★</div></button></div>
          {!locationTracking&&(location?.city||user.city)&&<div title={i18n.t("interface.profile.location")} className="hidden sm:flex max-w-36 items-center gap-1.5 text-xs text-muted-foreground bg-gray-50 px-2.5 py-1 rounded-full border border-gray-200"><Navigation className="w-3 h-3 shrink-0 text-gray-400"/><span className="truncate">{location?.city||user.city}</span></div>}
          <button type="button" onClick={()=>onToggleLocation()} aria-pressed={locationTracking} className={`relative z-10 shrink-0 cursor-pointer touch-manipulation flex min-h-9 items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-colors ${locationTracking?"border-red-300 bg-red-50 text-red-700 hover:bg-red-100":"border-gray-200 bg-gray-50 text-muted-foreground hover:border-emerald-300 hover:bg-emerald-50"}`} title={i18n.t(locationTracking?"interface.disable.my.location":"location.enableLiveLocation")}><Navigation className={`pointer-events-none w-3 h-3 ${locationTracking?"text-red-600":"text-gray-400"} ${locating?"animate-pulse":""}`}/><span className="pointer-events-none">{locationTracking?<><span className="hidden sm:inline">{i18n.t("interface.disable.my.location")}</span><span className="sm:hidden">{i18n.t("interface.disable")}</span></>:i18n.t("interface.enable.my.location")}</span></button>
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
      {locationError&&<div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 shadow-lg"><button onClick={onClearLocationError} className="float-right ml-3"><X className="w-4 h-4"/></button>{locationError}</div>}
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
      .catch(() => setError(i18n.t("interface.unable.to.load.your.ratings.right.now")))
      .finally(() => setLoading(false));
  }, [technicianId]);

  const average = ratings.length ? ratings.reduce((sum, item)=>sum+item.rating,0)/ratings.length : 0;
  const distribution = [5,4,3,2,1].map((score)=>({ score, count:ratings.filter((item)=>item.rating===score).length }));

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onMouseDown={(event)=>{if(event.target===event.currentTarget)onClose();}}>
    <div role="dialog" aria-modal="true" aria-labelledby="ratings-title" className="w-full max-w-3xl max-h-[85vh] overflow-y-auto rounded-2xl bg-slate-50 p-4 md:p-6 shadow-2xl">
      <div className="mb-6 flex items-start justify-between gap-3"><div><h2 id="ratings-title" className="text-xl font-bold" style={{ fontFamily:"Onest,sans-serif" }}>{i18n.t("interface.customer.ratings")}</h2><p className="text-sm text-muted-foreground">{i18n.t("interface.ratings.and.comments.left.by.your.customers")}</p></div><button onClick={onClose} className="w-9 h-9 rounded-xl bg-white border border-gray-200 flex items-center justify-center hover:bg-gray-50"><X className="w-4 h-4"/></button></div>
      {loading?<div className="py-16 text-center text-sm text-muted-foreground">{i18n.t("interface.loading.ratings")}</div>
      :error?<div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      :ratings.length===0?<div className="rounded-2xl border border-gray-100 bg-white p-10 text-center"><Star className="w-10 h-10 mx-auto text-gray-300 mb-3"/><div className="font-semibold">{i18n.t("interface.no.ratings.yet")}</div><div className="text-sm text-muted-foreground mt-1">{i18n.t("interface.reviews.will.appear.here.after.customers.rate.completed.jobs")}</div></div>
      :<>
        <div className="grid md:grid-cols-[220px_1fr] gap-4 mb-6">
          <div className="rounded-2xl border border-gray-100 bg-white p-5 text-center"><div className="text-4xl font-black text-amber-500">{average.toFixed(1)}</div><div className="flex justify-center gap-1 my-2">{[1,2,3,4,5].map((score)=><Star key={score} className={`w-4 h-4 ${score<=Math.round(average)?"fill-amber-400 text-amber-400":"text-gray-200"}`}/>)}</div><div className="text-xs text-muted-foreground">{i18n.t("interface.customer.reviews",{count:ratings.length})}</div></div>
          <div className="rounded-2xl border border-gray-100 bg-white p-5 space-y-2">{distribution.map(({score,count})=><div key={score} className="flex items-center gap-3 text-xs"><span className="w-8 font-medium">{score} ★</span><div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden"><div className="h-full rounded-full bg-amber-400" style={{width:`${ratings.length?count/ratings.length*100:0}%`}}/></div><span className="w-6 text-right text-muted-foreground">{count}</span></div>)}</div>
        </div>
        <div className="space-y-3">{ratings.map((item,index)=><article key={`${item.client_name}-${item.updated_at}-${index}`} className="rounded-2xl border border-gray-100 bg-white p-4"><div className="flex items-start justify-between gap-3"><div><div className="font-semibold text-sm">{item.client_name}</div><div className="flex gap-0.5 mt-1">{[1,2,3,4,5].map((score)=><Star key={score} className={`w-4 h-4 ${score<=item.rating?"fill-amber-400 text-amber-400":"text-gray-200"}`}/>)}</div></div><time className="text-xs text-muted-foreground">{new Date(item.updated_at).toLocaleDateString(i18n.resolvedLanguage==="en"?"en-GB":"fr-FR")}</time></div>{item.comment?<p className="mt-3 text-sm leading-relaxed text-slate-700">{item.comment}</p>:<p className="mt-3 text-xs italic text-muted-foreground">{i18n.t("interface.no.written.comment")}</p>}</article>)}</div>
      </>}
    </div>
    </div>
  );
}

// ─── Tech Leads ───────────────────────────────────────────────────────────────

function LeadDetails({ lead }: { lead: Lead }) {
  const details = lead.diagnosticDetails;
  const faults = details?.faults || [];
  const statusLabel = i18n.t(lead.status === "new" ? "interface.new" : lead.status === "accepted" ? "interface.accepted" : "interface.closed.2");
  const age = details?.equipment_age_years != null ? `${details.equipment_age_years} an(s)` : details?.equipment_age_band;
  return (
    <div className="mt-3 rounded-xl bg-slate-50 border border-slate-100 p-4 text-xs space-y-4">
      <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2">
        <div><span className="text-muted-foreground">{i18n.t("interface.request")} :</span> {lead.problem}</div>
        <div><span className="text-muted-foreground">{i18n.t("interface.category")} :</span> {lead.faultType}</div>
        <div><span className="text-muted-foreground">{i18n.t("interface.time.slot")} :</span> {lead.requestedDate?`${String(lead.requestedDate).slice(0,10)} ${i18n.t("interface.at")} ${String(lead.requestedTime||"").slice(0,5)}`:i18n.t("interface.to.be.defined")}</div>
        <div><span className="text-muted-foreground">{i18n.t("interface.address")} :</span> {lead.address||lead.city||i18n.t("interface.not.provided")}</div>
        <div><span className="text-muted-foreground">{i18n.t("interface.estimate")} :</span> <strong>{lead.price.toLocaleString(i18n.resolvedLanguage==="en"?"en-GB":"fr-FR")} {lead.currency}</strong></div>
        <div><span className="text-muted-foreground">{i18n.t("interface.status")} :</span> {statusLabel}</div>
      </div>
      {lead.caseDescription&&<div className="rounded-lg border border-blue-100 bg-white p-3"><div className="font-semibold text-slate-700 mb-1">{i18n.t("interface.description.provided.by.the.customer")}</div><p className="whitespace-pre-line leading-relaxed text-slate-600">{lead.caseDescription}</p></div>}
      {details&&<div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
        <div><span className="text-muted-foreground">{i18n.t("interface.urgency")} :</span> {details.urgency||i18n.t("interface.not.specified")}</div>
        <div><span className="text-muted-foreground">{i18n.t("interface.complexity")} :</span> {details.complexity||i18n.t("interface.not.specified")}</div>
        <div><span className="text-muted-foreground">{i18n.t("interface.brand")} :</span> {details.brand||i18n.t("interface.not.provided")}</div>
        <div><span className="text-muted-foreground">{i18n.t("interface.equipment.age")} :</span> {age||i18n.t("interface.not.provided")}</div>
        <div><span className="text-muted-foreground">{i18n.t("interface.country")} :</span> {details.country||i18n.t("interface.not.specified")}</div>
        <div><span className="text-muted-foreground">{i18n.t("interface.seasonal.context")} :</span> {details.season||i18n.t("interface.not.specified")}</div>
      </div>}
      {faults.length>0&&<div className="space-y-2"><div className="font-semibold text-slate-700">{i18n.t("interface.analyzed.issue.details")}</div>{faults.map((fault,index)=><div key={index} className="rounded-lg border border-slate-200 bg-white p-3 grid sm:grid-cols-2 gap-2">
        <div className="sm:col-span-2"><span className="text-muted-foreground">{i18n.t("interface.symptom.issue")} :</span> <strong>{fault.description||i18n.t("interface.not.specified")}</strong></div>
        <div><span className="text-muted-foreground">{i18n.t("interface.equipment")} :</span> {fault.equipment_type||i18n.t("interface.not.specified")}</div>
        <div><span className="text-muted-foreground">{i18n.t("interface.scheduled.service")} :</span> {fault.intervention_type||i18n.t("interface.needs.diagnosis")}</div>
        <div><span className="text-muted-foreground">{i18n.t("interface.complexity")} :</span> {fault.complexity||details?.complexity||i18n.t("interface.not.specified")}</div>
        <div><span className="text-muted-foreground">{i18n.t("interface.reference")} :</span> {fault.code_hint||i18n.t("interface.unassigned")}</div>
        {fault.complexity_reason&&<div className="sm:col-span-2"><span className="text-muted-foreground">{i18n.t("interface.reasoning")} :</span> {fault.complexity_reason}</div>}
      </div>)}</div>}
      {!lead.caseDescription&&!details&&<div className="text-muted-foreground italic">{i18n.t("interface.diagnostic.details.are.unavailable.for.this.older.request")}</div>}
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
      setReassignmentErrors((current)=>({...current,[id]:err?.response?.data?.error || i18n.t("interface.unable.to.reassign.this.request.right.now")}));
    } finally {
      setReassigning(null);
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div><h2 className="text-xl font-bold" style={{ fontFamily:"Onest,sans-serif" }}>{i18n.t("interface.incoming.leads")}</h2><p className="text-sm text-muted-foreground">{i18n.t("interface.if.you.decline.the.ai.engine.automatically.searches.for.another.technici")}</p></div>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">{(["all","new","accepted","done"] as const).map((f)=><button key={f} onClick={()=>setFilter(f)} className={`px-3 h-7 rounded-md text-xs font-medium ${filter===f?"bg-white shadow-sm text-foreground":"text-muted-foreground"}`}>{i18n.t(`leads.filters.${f}`)}</button>)}</div>
      </div>
      <div className="relative mb-4"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"/><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder={i18n.t("interface.search.for.a.customer.issue.or.city")} className="w-full h-10 pl-10 pr-3 rounded-xl border border-gray-200 bg-white text-sm outline-none focus:border-blue-400"/></div>
      {loading && <div className="text-sm text-muted-foreground">{i18n.t("interface.loading.leads")}</div>}
      <div className="space-y-3">{filtered.map((lead)=>(
        <div key={lead.id} className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-sm font-bold shrink-0">{lead.client[0]}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2"><div><div className="font-semibold text-sm">{lead.client}</div><div className="flex items-center gap-2 mt-0.5"><span className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3"/>{lead.city}</span><span className="px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded text-[10px] font-medium">{lead.faultType}</span></div></div><div className="text-right"><div className="text-lg font-black" style={{ fontFamily:"Onest,sans-serif" }}>{lead.price.toLocaleString(i18n.resolvedLanguage==="en"?"en-GB":"fr-FR")} {lead.currency}</div><div className="text-xs text-muted-foreground">{lead.time}</div></div></div>
              <div className="mt-2 text-sm">{lead.problem}</div>
              {lead.requestedDate&&<div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground"><span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5"/>{String(lead.requestedDate).slice(0,10)} {i18n.t("interface.at")} {String(lead.requestedTime||"").slice(0,5)}</span>{lead.address&&<span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5"/>{lead.address}</span>}</div>}
              <div className="mt-2"><div className="text-xs text-muted-foreground mb-1">{i18n.t("interface.ai.confidence")}</div><ConfidenceBar value={lead.confidence}/></div>
              <button onClick={()=>setExpanded(expanded===lead.id?null:lead.id)} className="mt-3 text-xs text-blue-600 hover:underline flex items-center gap-1">{i18n.t(expanded===lead.id?"interface.hide.details":"leads.viewAllInformation")}<ChevronDown className={`w-3.5 h-3.5 transition-transform ${expanded===lead.id?"rotate-180":""}`}/></button>
              {expanded===lead.id&&<LeadDetails lead={lead}/>}
              {reassigning===lead.id?<div className="mt-3 flex items-center gap-2 text-sm text-blue-600"><RefreshCw className="w-4 h-4 animate-spin"/>{i18n.t("interface.ai.engine.is.searching.for.another.technician")}</div>
              :reassigned[lead.id]?<div className="mt-3 flex items-center gap-2 text-xs text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2"><CheckCircle2 className="w-4 h-4 shrink-0"/>{i18n.t("interface.lead.reassigned.to")} <strong>{reassigned[lead.id]}</strong> {i18n.t("interface.same.slot.notified")}</div>
              :reassignmentErrors[lead.id]?<div className="mt-3 flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2"><AlertCircle className="w-4 h-4 shrink-0"/>{reassignmentErrors[lead.id]}</div>
              :reassignmentFailed.has(lead.id)?<div className="mt-3 flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2"><AlertCircle className="w-4 h-4 shrink-0"/>{i18n.t("interface.no.compatible.technician.is.available.for.this.time.slot.the.customer.ha")}</div>
              :(
                <div className="flex items-center gap-2 mt-3">
                  {lead.status==="new"&&<><button onClick={()=>accept(lead.id)} className="h-8 px-4 rounded-lg bg-emerald-500 text-white text-xs font-semibold hover:bg-emerald-600 flex items-center gap-1.5"><Check className="w-3.5 h-3.5"/>{i18n.t("interface.accept")}</button><button onClick={()=>decline(lead.id)} className="h-8 px-4 rounded-lg border border-red-200 text-xs text-red-500 hover:bg-red-50 flex items-center gap-1.5"><X className="w-3.5 h-3.5"/>{i18n.t("interface.decline")}</button></>}
                  {lead.status==="accepted"&&<Badge color="green">{i18n.t("interface.accepted")}</Badge>}
                  {lead.status==="done"&&<Badge color="gray">{i18n.t("interface.closed.2")}</Badge>}
                  <Badge color={lead.status==="new"?"amber":"gray"}>{i18n.t(lead.status==="new"?"interface.new":lead.status==="accepted"?"leads.inProgress":"interface.closed.2")}</Badge>
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
  const { text:t } = useInterfaceLanguage();
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
    api.get("/tarifs/context").then((res)=>setProfileCurrency(res.data.currency)).catch(()=>setProfileCurrency(i18n.t("pricing.cityRequired",{city:city||i18n.t("profile.profile")})));
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
    onDropRejected:(rejections)=>{ setUploadStatus("error"); setUploadError(i18n.t(rejections[0]?.errors[0]?.code==="file-too-large"?"interface.file.exceeds.5.mb":"interface.accepted.formats.csv.excel.xlsx.xlsm.or.text.pdf")); },
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
      <div className="flex items-center justify-between mb-6"><div><h2 className="text-xl font-bold" style={{ fontFamily:"Onest,sans-serif" }}>{t("interface.my.pricing.list")}</h2><p className="text-sm text-muted-foreground">{t("interface.currency.determined.by.your.city")} : <strong>{profileCurrency}</strong>.</p></div><div className="flex flex-wrap justify-end gap-2"><button onClick={()=>setShowImport(!showImport)} className="flex items-center gap-2 h-9 px-4 rounded-lg border border-gray-200 bg-white text-sm font-semibold hover:bg-gray-50"><Upload className="w-4 h-4"/>{t("interface.import.a.file")}</button><button onClick={()=>setShowTariffDetails((visible)=>!visible)} className="flex items-center gap-2 h-9 px-4 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 text-sm font-semibold hover:bg-emerald-100">{showTariffDetails?t("interface.hide.information"):t("interface.edit.information")}</button></div></div>
      {showImport&&<div className="mb-6">
        <div {...getRootProps()} className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${isDragActive?"border-emerald-400 bg-emerald-50":uploadStatus==="success"?"border-emerald-300 bg-emerald-50":uploadStatus==="error"?"border-red-300 bg-red-50":"border-gray-200 hover:border-emerald-300 bg-gray-50"}`}>
          <input {...getInputProps()}/>
          {uploadStatus==="idle"&&<><Upload className="w-8 h-8 mx-auto mb-3 text-muted-foreground"/><div className="text-sm font-medium mb-1">{isDragActive?t("interface.drop.here"):t("interface.import.your.pricing.list")}</div><div className="text-xs text-muted-foreground">{t("interface.csv.excel.xlsx.xlsm.or.text.pdf.5.mb.maximum")}</div></>}
          {uploadStatus==="processing"&&<div className="flex flex-col items-center gap-3"><div className="w-8 h-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin"/><div className="text-sm text-muted-foreground">{i18n.t("interface.extracting")}</div></div>}
          {uploadStatus==="success"&&<><CheckCircle2 className="w-8 h-8 mx-auto mb-3 text-emerald-500"/><div className="text-sm font-medium text-emerald-700 mb-1">{i18n.t("pricing.listImported",{currency:profileCurrency})}</div><button onClick={(e)=>{e.stopPropagation();setUploadStatus("idle");}} className="text-xs text-emerald-600 hover:underline">{i18n.t("interface.import.another.file")}</button></>}
          {uploadStatus==="error"&&<><AlertCircle className="w-8 h-8 mx-auto mb-3 text-red-400"/><div className="text-sm font-medium text-red-600 mb-1">{i18n.t("interface.extraction.failed")}</div><div className="text-xs text-red-500 mb-2">{uploadError}</div><button onClick={(e)=>{e.stopPropagation();setUploadStatus("idle");setUploadError("");}} className="text-xs text-primary hover:underline">{i18n.t("interface.try.again")}</button></>}
        </div>
      </div>}
      {showTariffDetails&&<div className="mb-4 flex justify-end"><button onClick={()=>setShowAdd(!showAdd)} className="flex items-center gap-2 h-9 px-4 rounded-lg bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600"><Plus className="w-4 h-4"/>{i18n.t("interface.add.a.price")}</button></div>}
      {showTariffDetails&&showAdd&&(
        <div className="bg-white rounded-xl border border-emerald-200 p-5 mb-5 shadow-sm">
          <div className="text-sm font-semibold mb-4">{i18n.t("interface.new.service")}</div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="col-span-2"><label className="block text-xs text-muted-foreground mb-1">{i18n.t("interface.name")}</label><input placeholder={i18n.t("pricing.serviceExample")} value={newTarif.service} onChange={(e)=>setNewTarif((p)=>({...p,service:e.target.value}))} className="w-full h-9 px-3 rounded-lg border border-gray-200 text-sm bg-gray-50 focus:outline-none focus:border-emerald-400"/></div>
            <div><label className="block text-xs text-muted-foreground mb-1">{i18n.t("interface.unit")}</label><input placeholder={i18n.t("pricing.unitExample")} value={newTarif.unit} onChange={(e)=>setNewTarif((p)=>({...p,unit:e.target.value}))} className="w-full h-9 px-3 rounded-lg border border-gray-200 text-sm bg-gray-50 focus:outline-none focus:border-emerald-400"/></div>
            <div><label className="block text-xs text-muted-foreground mb-1">{i18n.t("pricing.priceWithCurrency",{currency:profileCurrency})}</label><input type="number" placeholder="0" value={newTarif.price} onChange={(e)=>setNewTarif((p)=>({...p,price:e.target.value}))} className="w-full h-9 px-3 rounded-lg border border-gray-200 text-sm bg-gray-50 focus:outline-none focus:border-emerald-400"/></div>
            <div className="col-span-2"><label className="block text-xs text-muted-foreground mb-1">{i18n.t("interface.category")}</label><select value={newTarif.category} onChange={(e)=>setNewTarif((p)=>({...p,category:e.target.value}))} className="w-full h-9 px-3 rounded-lg border border-gray-200 text-sm bg-gray-50 focus:outline-none focus:border-emerald-400">{categories.map((c)=><option key={c}>{c}</option>)}</select></div>
          </div>
          <div className="flex gap-2"><button onClick={addTarif} className="h-8 px-4 rounded-lg bg-emerald-500 text-white text-xs font-semibold hover:bg-emerald-600">{i18n.t("interface.add")}</button><button onClick={()=>setShowAdd(false)} className="h-8 px-4 rounded-lg border border-gray-200 text-xs text-muted-foreground">{i18n.t("interface.cancel")}</button></div>
        </div>
      )}
      {showTariffDetails&&<div className="space-y-5">{categories.map((cat)=>{ const items=grouped[cat]; if(!items?.length) return null; return (
        <div key={cat}><div className="flex items-center gap-2 mb-2"><span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{cat}</span><div className="flex-1 h-px bg-gray-100"/></div>
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">{items.map((t,i)=>(
          <div key={t.id ?? i} className={`flex items-center px-4 py-3.5 ${i<items.length-1?"border-b border-gray-50":""} hover:bg-gray-50 group`}>
            <div className="flex-1"><div className="text-sm font-medium">{t.service}</div><div className="text-xs text-muted-foreground">{t.unit}</div></div>
            {editing===t.id?<div className="flex items-center gap-2"><input type="number" value={editVal} onChange={(e)=>setEditVal(e.target.value)} onKeyDown={(e)=>e.key==="Enter"&&saveEdit(t)} autoFocus className="w-24 h-8 px-2 rounded-lg border border-emerald-300 text-sm text-right focus:outline-none"/><span className="text-sm text-muted-foreground">{t.currency||profileCurrency}</span><button onClick={()=>saveEdit(t)} className="w-7 h-7 rounded-lg bg-emerald-500 text-white flex items-center justify-center"><Check className="w-3.5 h-3.5"/></button><button onClick={()=>setEditing(null)} className="w-7 h-7 rounded-lg border border-gray-200 flex items-center justify-center text-muted-foreground"><X className="w-3.5 h-3.5"/></button></div>
            :<div className="flex items-center gap-3"><span className="text-base font-bold" style={{ fontFamily:"Onest,sans-serif" }}>{t.price} {t.currency||profileCurrency}</span><button onClick={()=>{setEditing(t.id!);setEditVal(String(t.price));}} className="opacity-0 group-hover:opacity-100 text-xs text-primary hover:underline transition-opacity">{i18n.t("interface.edit")}</button></div>}
          </div>
        ))}
        </div></div>
      );})}
      </div>}
      <div className="mt-6 p-4 bg-emerald-50 border border-emerald-100 rounded-xl text-sm text-emerald-800"><strong>{i18n.t("interface.automatic.synchronization")}</strong> {i18n.t("interface.your.prices.feed.the.ai.engine.used.for.customer.estimates")}</div>
    </div>
  );
}

// ─── Tech Agenda ──────────────────────────────────────────────────────────────

const DAY_NAMES = ["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"];
const WEEK_DAYS_FR = ["Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi","Dimanche"];
const DEFAULT_WORKING_HOURS: WorkingHour[] = WEEK_DAYS_FR.map((_,weekDay)=>({weekDay,enabled:weekDay<6,startTime:weekDay===5?"09:00":"08:00",endTime:weekDay===5?"14:00":"18:00"}));
const mapWorkingHour = (row: any): WorkingHour => ({weekDay:Number(row.week_day??row.weekDay),enabled:Boolean(row.enabled),startTime:String(row.start_time??row.startTime).slice(0,5),endTime:String(row.end_time??row.endTime).slice(0,5)});

function TechAgenda({ technicianLocation }: { technicianLocation:UserLocation|null }) {
  const { language, text:t } = useInterfaceLanguage();
  const locale=language==="fr"?"fr-FR":"en-GB";
  const dayNames=language==="fr"?DAY_NAMES:["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  const weekDayNames=language==="fr"?WEEK_DAYS_FR:["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
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
      alert(i18n.t("schedule.noPhone"));
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
    const origin=hasOrigin?{lat:techLat,lng:techLng}:undefined;
    return createDirectionsUrl(destination,origin);
  }

  const dayApts = apptForDay(selectedDay);
  const ss: Record<string,{dot:string;badge:string;label:string}> = { confirmed:{dot:"bg-blue-500",badge:"bg-blue-50 text-blue-700 border-blue-100",label:i18n.t("interface.confirmed")}, pending:{dot:"bg-amber-500",badge:"bg-amber-50 text-amber-700 border-amber-100",label:i18n.t("appointment.pending")}, completed:{dot:"bg-emerald-500",badge:"bg-emerald-50 text-emerald-700 border-emerald-100",label:i18n.t("interface.completed")}, cancelled:{dot:"bg-red-400",badge:"bg-red-50 text-red-700 border-red-100",label:i18n.t("interface.cancelled")} };
  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="grid md:grid-cols-[380px_1fr] gap-6">
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3"><div><div className="text-sm font-semibold">{t("interface.regular.working.hours")}</div><div className="text-xs text-muted-foreground mt-0.5">{t("interface.your.recurring.work.week")}</div></div><button onClick={()=>setShowHoursModal(true)} className="flex items-center gap-1.5 h-7 px-3 rounded-lg bg-emerald-50 text-emerald-700 text-xs hover:bg-emerald-100"><Clock className="w-3 h-3"/>{t("interface.edit")}</button></div>
            <div className="space-y-1.5">{workingHours.map((item)=><div key={item.weekDay} className="flex items-center justify-between text-xs"><span className="text-slate-600">{weekDayNames[item.weekDay]}</span>{item.enabled?<span className="font-medium text-emerald-700">{item.startTime}–{item.endTime}</span>:<span className="text-muted-foreground">{t("interface.closed")}</span>}</div>)}</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-4"><h3 className="font-bold capitalize" style={{ fontFamily:"Onest,sans-serif" }}>{currentMonth.toLocaleDateString(locale,{month:"long",year:"numeric"})}</h3><div className="flex gap-1"><button onClick={()=>changeMonth(-1)} className="w-7 h-7 rounded-lg border border-gray-200 flex items-center justify-center text-muted-foreground hover:bg-gray-50"><ChevronLeft className="w-4 h-4"/></button><button onClick={()=>changeMonth(1)} className="w-7 h-7 rounded-lg border border-gray-200 flex items-center justify-center text-muted-foreground hover:bg-gray-50"><ChevronRight className="w-4 h-4"/></button></div></div>
            <div className="grid grid-cols-7 gap-1 mb-1">{dayNames.map((d,i)=><div key={i} className="text-center text-xs font-medium text-muted-foreground py-1">{d}</div>)}</div>
            <div className="grid grid-cols-7 gap-1">{calDays.map((day,i)=>{
              if(!day) return <div key={i}/>;
              const isSel=day===selectedDay; const isToday=day===today.getDate()&&month===today.getMonth()&&year===today.getFullYear();
              return <button key={i} onClick={()=>setSelectedDay(day)} className={`aspect-square rounded-lg border text-xs font-medium transition-all relative ${dayColor(day)} ${isSel?"ring-2 ring-primary ring-offset-1":""} ${isToday?"font-black":""}`}>{day}{apptForDay(day).length>0&&<span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-current opacity-70"/>}</button>;
            })}</div>
            <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">{[["bg-emerald-100 border-emerald-400",t("interface.completed.2")],["bg-blue-100 border-blue-400",t("interface.scheduled")],["bg-gray-100 border-gray-300",t("interface.unavailable")]].map(([cls,l])=><div key={l} className="flex items-center gap-2 text-xs"><div className={`w-4 h-4 rounded border ${cls}`}/><span className="text-muted-foreground">{l}</span></div>)}</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3"><div><div className="text-sm font-semibold">{t("interface.exceptions.and.absences")}</div><div className="text-xs text-muted-foreground mt-0.5">{t("interface.leave.training.or.one.time.absence")}</div></div><button onClick={()=>setShowBlockModal(true)} className="flex items-center gap-1.5 h-7 px-3 rounded-lg bg-gray-100 text-xs hover:bg-gray-200"><Plus className="w-3 h-3"/>{t("interface.add")}</button></div>
            <div className="space-y-2">
              {blockedSlots.map((b)=><div key={b.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-gray-50 border border-gray-100"><BanIcon className="w-4 h-4 text-gray-400 shrink-0"/><div className="flex-1 min-w-0"><div className="text-xs font-medium truncate">{b.label}</div><div className="text-xs text-muted-foreground">{b.type==="daily"?`${t("interface.every.day")} ${b.startTime}–${b.endTime}`:b.type==="weekly"?`${b.weekDays?.map((d)=>weekDayNames[d]).join(", ")}`:b.date}</div></div><button onClick={()=>removeBlockedSlot(b.id)} className="text-muted-foreground hover:text-red-500"><X className="w-3.5 h-3.5"/></button></div>)}
              {blockedSlots.length===0&&<div className="text-xs text-muted-foreground text-center py-2">{t("interface.no.unavailability")}</div>}
            </div>
          </div>
        </div>
        <div>
          <div className="mb-4"><h2 className="text-xl font-bold" style={{ fontFamily:"Onest,sans-serif" }}>{new Date(year,month,selectedDay).toLocaleDateString(locale,{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</h2><p className="text-sm text-muted-foreground">{dayApts.length} {t("interface.appointments")} · {hoursForDay(selectedDay)?.enabled?`${t("interface.available").toLowerCase()} ${hoursForDay(selectedDay)?.startTime}–${hoursForDay(selectedDay)?.endTime}`:t("interface.non.working.day")}</p></div>
          {blocksForDay(selectedDay).length>0&&<div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 flex items-start gap-3 text-sm text-amber-800"><BanIcon className="w-5 h-5 shrink-0"/><div><strong>{t("interface.blocked.slots")} :</strong> {blocksForDay(selectedDay).map((block)=>`${block.startTime.slice(0,5)}–${block.endTime.slice(0,5)}`).join(", ")}. {t("interface.rest.of.day.available")}</div></div>}
          {dayApts.length===0?<div className="bg-white rounded-xl border border-gray-100 p-12 text-center shadow-sm"><Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-40"/><div className="text-sm text-muted-foreground">{t("interface.no.appointments.on.this.day")}</div></div>:(
            <div className="space-y-3">{dayApts.map((appt)=>{ const s=ss[appt.status]; const mapsUrl=directionsUrl(appt); return (
              <div key={appt.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex gap-4">
                <div className="text-center w-16 shrink-0"><div className="text-sm font-bold" style={{ fontFamily:"Onest,sans-serif" }}>{appt.time}</div><div className="text-xs text-muted-foreground">{appt.duration}</div><div className={`w-2.5 h-2.5 rounded-full mx-auto mt-2 ${s.dot}`}/></div>
                <div className="w-px bg-gray-100 self-stretch"/>
                <div className="flex-1">
                  <div className="flex items-start justify-between"><div><div className="font-semibold text-sm">{appt.service}</div><div className="text-sm mt-0.5">{appt.client}</div></div><span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${s.badge}`}>{s.label}</span></div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-2"><MapPin className="w-3 h-3"/>{appt.address || appt.clientProfileAddress || appt.clientCity || i18n.t("interface.location.not.provided")}</div>
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <div className="text-sm mb-2"><span className="text-muted-foreground">{i18n.t("interface.estimated.price")} : </span><span className="font-bold">{appt.estimatedPrice} {appt.currency}</span></div>
                    {appt.status==="completed"&&appt.actualPrice?<div><div className="text-sm mb-1"><span className="text-muted-foreground">{i18n.t("interface.actual.price")} : </span><span className="font-bold text-emerald-600">{appt.actualPrice} {appt.currency}</span></div>{appt.caseDescription&&<div className="text-xs text-muted-foreground bg-gray-50 p-2 rounded-lg mt-1">{appt.caseDescription}</div>}</div>
                    :appt.status==="confirmed"?<button onClick={()=>{setSelectedAppt(appt);setShowPriceModal(true);}} className="text-xs text-emerald-600 hover:underline flex items-center gap-1"><Edit2 className="w-3 h-3"/>{i18n.t("interface.enter.actual.price.after.service")}</button>:null}
                  </div>
                  <div className="flex gap-2 mt-3"><button onClick={()=>callClient(appt)} className="h-7 px-3 rounded-lg bg-gray-100 text-xs hover:bg-gray-200 flex items-center gap-1.5"><Phone className="w-3 h-3"/>{i18n.t("interface.call")}</button>{mapsUrl?<a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="h-7 px-3 rounded-lg bg-gray-100 text-xs hover:bg-gray-200 flex items-center gap-1.5"><MapPin className="w-3 h-3"/>{i18n.t("interface.directions")}</a>:<button onClick={()=>alert(i18n.t("interface.the.customer.has.not.provided.gps.coordinates.an.address.or.a.city"))} className="h-7 px-3 rounded-lg bg-gray-100 text-xs text-muted-foreground flex items-center gap-1.5"><MapPin className="w-3 h-3"/>{i18n.t("interface.address.unavailable")}</button>}</div>
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
            <h3 className="text-lg font-bold mb-4" style={{ fontFamily:"Onest,sans-serif" }}>{i18n.t("interface.complete.the.job")}</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 bg-gray-50 rounded-xl p-3 text-sm"><div><div className="text-xs text-muted-foreground">{i18n.t("profile.client")}</div><div className="font-medium">{selectedAppt.client}</div></div><div><div className="text-xs text-muted-foreground">{i18n.t("interface.estimated.price")}</div><div className="font-medium">{selectedAppt.estimatedPrice} {selectedAppt.currency}</div></div></div>
              <div><label className="block text-xs font-medium mb-2">{i18n.t("interface.actual.amount.charged")} <span className="text-red-500">*</span></label><input type="number" placeholder="0" value={actualPrice} onChange={(e)=>setActualPrice(e.target.value)} className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm bg-gray-50 focus:outline-none focus:border-emerald-400"/></div>
              <div><label className="block text-xs font-medium mb-2">{i18n.t("interface.case.description")} <span className="text-muted-foreground font-normal">{i18n.t("pricing.enrichesAiDatabase")}</span></label><textarea placeholder={i18n.t("pricing.caseDescriptionExample")} value={caseDesc} onChange={(e)=>setCaseDesc(e.target.value)} className="w-full h-24 px-3 py-2 rounded-lg border border-gray-200 text-sm bg-gray-50 focus:outline-none focus:border-emerald-400 resize-none"/><div className="text-xs text-muted-foreground mt-1 flex items-center gap-1"><TrendingUp className="w-3 h-3"/>{i18n.t("interface.improves.future.ai.estimates")}</div></div>
              {priceSaved?<div className="flex items-center justify-center gap-2 h-10 text-emerald-600 font-medium text-sm"><CheckCircle2 className="w-5 h-5"/>{i18n.t("interface.saved")}</div>:<div className="flex gap-2"><button onClick={savePrice} disabled={!actualPrice} className="flex-1 h-10 rounded-lg bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600 disabled:opacity-40">{i18n.t("interface.save")}</button><button onClick={()=>setShowPriceModal(false)} className="h-10 px-4 rounded-lg border border-gray-200 text-sm text-muted-foreground">{i18n.t("interface.cancel")}</button></div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Working Hours Modal ──────────────────────────────────────────────────────

function WorkingHoursModal({ initialHours, onClose, onSave }: { initialHours:WorkingHour[]; onClose:()=>void; onSave:(hours:WorkingHour[])=>Promise<void> }) {
  const modalDayNames=i18n.resolvedLanguage==="en"?["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"]:WEEK_DAYS_FR;
  const [hours,setHours]=useState<WorkingHour[]>(()=>DEFAULT_WORKING_HOURS.map((fallback)=>initialHours.find((item)=>item.weekDay===fallback.weekDay)||fallback));
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  function update(weekDay:number, values:Partial<WorkingHour>){setHours((items)=>items.map((item)=>item.weekDay===weekDay?{...item,...values}:item));}
  async function submit(){
    if(hours.some((item)=>item.enabled&&item.startTime>=item.endTime)){setError(i18n.t("interface.the.end.time.must.be.after.the.start.time"));return;}
    setSaving(true);setError("");
    try { await onSave(hours); } catch (err:any) { setError(err?.response?.data?.error||i18n.t("interface.unable.to.save.working.hours")); setSaving(false); }
  }
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl" onClick={(event)=>event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-5"><div><h3 className="text-lg font-bold" style={{fontFamily:"Onest,sans-serif"}}>{i18n.t("interface.regular.working.hours")}</h3><p className="text-xs text-muted-foreground mt-1">{i18n.t("interface.customers.can.only.book.within.these.hours.a.service.visit.currently.las")}</p></div><button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5"/></button></div>
        <div className="space-y-2">{hours.map((item)=><div key={item.weekDay} className={`grid grid-cols-[110px_1fr] sm:grid-cols-[120px_1fr] gap-3 items-center rounded-xl border p-3 ${item.enabled?"border-emerald-100 bg-emerald-50/40":"border-gray-100 bg-gray-50"}`}>
          <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={item.enabled} onChange={(event)=>update(item.weekDay,{enabled:event.target.checked})} className="accent-emerald-600"/>{modalDayNames[item.weekDay]}</label>
          {item.enabled?<div className="flex items-center gap-2"><input aria-label={`${i18n.t("interface.start")} ${modalDayNames[item.weekDay]}`} type="time" value={item.startTime} onChange={(event)=>update(item.weekDay,{startTime:event.target.value})} className="min-w-0 w-full h-9 px-2 rounded-lg border border-gray-200 bg-white text-sm"/><span className="text-muted-foreground">{i18n.t("interface.at")}</span><input aria-label={`${i18n.t("interface.end")} ${modalDayNames[item.weekDay]}`} type="time" value={item.endTime} onChange={(event)=>update(item.weekDay,{endTime:event.target.value})} className="min-w-0 w-full h-9 px-2 rounded-lg border border-gray-200 bg-white text-sm"/></div>:<div className="text-xs text-muted-foreground">{i18n.t("interface.non.working.day")}</div>}
        </div>)}</div>
        {error&&<div className="mt-3 rounded-lg bg-red-50 border border-red-100 p-2.5 text-xs text-red-600">{error}</div>}
        <div className="flex gap-2 mt-5"><button onClick={submit} disabled={saving} className="flex-1 h-10 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50">{i18n.t(saving?"profile.saving":"interface.save.working.hours")}</button><button onClick={onClose} className="h-10 px-4 rounded-xl border border-gray-200 text-sm text-muted-foreground">{i18n.t("interface.cancel")}</button></div>
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
  function submit(){onSave({type,date:type==="specific"?date:undefined,weekDays:type==="weekly"?weekDays:undefined,startTime,endTime,label:label||(type==="daily"?i18n.t("schedule.night",{start:startTime,end:endTime}):type==="weekly"?i18n.t("interface.unavailable"):date)} as Omit<BlockedSlot,"id">);}
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl" onClick={(e)=>e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5"><h3 className="text-lg font-bold" style={{ fontFamily:"Onest,sans-serif" }}>{i18n.t("interface.block.a.time.slot")}</h3><button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5"/></button></div>
        <div className="space-y-4">
          <div><label className="block text-xs font-medium mb-2">{i18n.t("interface.type")}</label><div className="grid grid-cols-3 gap-2">{(["specific","daily","weekly"] as const).map((v)=><button key={v} onClick={()=>setType(v)} className={`py-2 px-3 rounded-lg border text-xs font-medium ${type===v?"border-blue-400 bg-blue-50 text-blue-700":"border-gray-200 text-muted-foreground"}`}>{i18n.t(`schedule.blockType.${v}`)}</button>)}</div></div>
          {type==="specific"&&<div><label className="block text-xs font-medium mb-1.5">{i18n.t("interface.date")}</label><input type="date" value={date} onChange={(e)=>setDate(e.target.value)} className="w-full h-9 px-3 rounded-lg border border-gray-200 text-sm bg-gray-50 focus:outline-none focus:border-blue-400"/></div>}
          {type==="weekly"&&<div><label className="block text-xs font-medium mb-2">{i18n.t("interface.days")}</label><div className="flex gap-1">{WEEK_DAYS_FR.map((d,i)=><button key={i} onClick={()=>toggleDay(i)} className={`flex-1 py-1.5 rounded-lg border text-xs font-medium ${weekDays.includes(i)?"border-blue-400 bg-blue-50 text-blue-700":"border-gray-200 text-muted-foreground"}`}>{d.slice(0,3)}</button>)}</div></div>}
          <div className="grid grid-cols-2 gap-3"><div><label className="block text-xs font-medium mb-1.5">{i18n.t("interface.start")}</label><input type="time" value={startTime} onChange={(e)=>setStartTime(e.target.value)} className="w-full h-9 px-3 rounded-lg border border-gray-200 text-sm bg-gray-50 focus:outline-none focus:border-blue-400"/></div><div><label className="block text-xs font-medium mb-1.5">{i18n.t("interface.end")}</label><input type="time" value={endTime} onChange={(e)=>setEndTime(e.target.value)} className="w-full h-9 px-3 rounded-lg border border-gray-200 text-sm bg-gray-50 focus:outline-none focus:border-blue-400"/></div></div>
          <div><label className="block text-xs font-medium mb-1.5">{i18n.t("interface.reason.optional")}</label><input placeholder={i18n.t("schedule.reasonExample")} value={label} onChange={(e)=>setLabel(e.target.value)} className="w-full h-9 px-3 rounded-lg border border-gray-200 text-sm bg-gray-50 focus:outline-none focus:border-blue-400"/></div>
          <div className="flex gap-2"><button onClick={submit} className="flex-1 h-10 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90">{i18n.t("interface.block.this.time.slot")}</button><button onClick={onClose} className="h-10 px-4 rounded-xl border border-gray-200 text-sm text-muted-foreground">{i18n.t("interface.cancel")}</button></div>
        </div>
      </div>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────
