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
  UserLocation, View,
} from "./domain";
import { mapAppointment, mapBlockedSlot, mapLead, mapNotification, mapTechnician } from "./mappers";
import { Avatar, Badge, ConfidenceBar, detectFaultType, NotificationPanel, ProfileModal, technicianMatchesFault } from "./SharedUi";

export function ClientDashboard({ user, location, technicians, onLogout, onUpdateUser, locationTracking, locating, locationError, onToggleLocation, onClearLocationError }:
  { user: AppUser; location: UserLocation | null; technicians: Technician[]; onLogout: () => void; onUpdateUser: (u: AppUser) => void; locationTracking:boolean; locating:boolean; locationError:string; onToggleLocation:()=>void; onClearLocationError:()=>void }) {
  const navigate = useNavigate();
  const { tab: tabParam } = useParams();
  const validTabs: ClientTab[] = ["chat", "rdv", "map", "messages"];
  const tab: ClientTab = validTabs.includes(tabParam as ClientTab) ? tabParam as ClientTab : "chat";
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [contactedTechs, setContactedTechs] = useState<number[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [contactTechId, setContactTechId] = useState<number|null>(null);
  const unread = notifications.filter((n)=>!n.read).length;
  const tabs = [{ id:"chat" as ClientTab,label:"Devis IA",icon:MessageSquare },{ id:"rdv" as ClientTab,label:"Rendez-vous",icon:Calendar },{ id:"map" as ClientTab,label:"Techniciens",icon:MapPin },{ id:"messages" as ClientTab,label:"Messages",icon:MessageCircle }];

  useEffect(() => {
    if (tabParam !== tab) navigate(`/client/${tab}`, { replace:true });
  }, [navigate, tab, tabParam]);

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
    navigate(`/client/${target}`); setNotifOpen(false);
  }
  const contactTechnician = useCallback((id: number) => setContactTechId(id), []);
  const markContacted = useCallback((id: number) => setContactedTechs((items) => items.includes(id) ? items : [...items, id]), []);

  return (
    <div className="h-screen h-[100dvh] min-h-0 overflow-hidden bg-background flex flex-col">
      <header className="relative z-10 bg-white border-b border-border px-3 sm:px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3"><div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center"><Zap className="w-3.5 h-3.5 text-white"/></div><span className="font-bold text-foreground" style={{ fontFamily:"Onest,sans-serif" }}>QuoteAI</span></div>
        <div className="relative z-10 flex items-center gap-2 sm:gap-3">
          {(location?.city||user.city)&&<div title={locationTracking?"Position actuelle":"Localisation du profil"} className="flex max-w-28 sm:max-w-none items-center gap-1.5 text-xs text-muted-foreground bg-gray-50 px-2.5 py-1 rounded-full border border-gray-200"><Navigation className={`w-3 h-3 shrink-0 ${locationTracking?"text-blue-600":"text-gray-400"}`}/><span className="truncate">{location?.city||user.city}</span></div>}
          <button type="button" onClick={()=>onToggleLocation()} aria-pressed={locationTracking} className={`relative z-10 shrink-0 cursor-pointer touch-manipulation flex min-h-9 items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-colors ${locationTracking?"border-red-300 bg-red-50 text-red-700 hover:bg-red-100":"border-gray-200 bg-gray-50 text-muted-foreground hover:border-blue-300 hover:bg-blue-50"}`} title={locationTracking?"Désactiver ma position":"Activer ma position en direct"}><Navigation className={`pointer-events-none w-3 h-3 ${locationTracking?"text-red-600":"text-gray-400"} ${locating?"animate-pulse":""}`}/><span className="pointer-events-none">{locationTracking?<><span className="hidden sm:inline">Désactiver ma position</span><span className="sm:hidden">Désactiver</span></>:<><span className="hidden sm:inline">Activer ma position</span><span className="sm:hidden">Activer</span></>}</span></button>
          <div className="relative"><button onClick={()=>setNotifOpen(!notifOpen)} className="relative w-9 h-9 rounded-xl hover:bg-gray-100 flex items-center justify-center text-muted-foreground hover:text-foreground"><Bell className="w-5 h-5"/>{unread>0&&<span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">{unread}</span>}</button></div>
          <button onClick={()=>setProfileOpen(true)} className="flex items-center gap-2 hover:bg-gray-50 rounded-xl px-2 py-1 transition-colors"><Avatar initials={user.avatar || user.name.slice(0,2).toUpperCase()} color="bg-blue-500" size="sm"/><span className="text-sm font-medium hidden sm:block">{user.name}</span></button>
          <button onClick={onLogout} className="text-muted-foreground hover:text-foreground"><LogOut className="w-4 h-4"/></button>
        </div>
      </header>
      <div className="bg-white border-b border-border px-6">
        <div className="flex gap-1">{tabs.map((t)=><button key={t.id} onClick={()=>navigate(`/client/${t.id}`)} className={`flex items-center gap-2 px-4 py-3.5 text-sm font-medium border-b-2 transition-all ${tab===t.id?"border-primary text-primary":"border-transparent text-muted-foreground hover:text-foreground"}`}><t.icon className="w-4 h-4"/>{t.label}</button>)}</div>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
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
      {locationError&&<div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 shadow-lg"><button onClick={onClearLocationError} className="float-right ml-3"><X className="w-4 h-4"/></button>{locationError}</div>}
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
        confidence: quote?.conf ?? 0,
        caseDescription: messages.filter((message)=>message.role==="user" && !/j'accepte ce prix/i.test(message.text)).map((message)=>message.text).join("\n"),
        diagnosticDetails: quote?.extraction || null,
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
  const [blockedTechs, setBlockedTechs] = useState<Set<number>>(()=>new Set(technicians.filter((technician)=>technician.isBlocked).map((technician)=>technician.id)));
  const [publicRatings, setPublicRatings] = useState<Record<number,Array<{rating:number;comment:string;client_name:string;updated_at:string}>>>({});
  const filtered = technicians.filter((t)=>(!showAvailOnly||t.available)&&(!filterSpec||t.specializations.includes(filterSpec))&&(!search||t.name.toLowerCase().includes(search.toLowerCase())||t.specializations.some((s)=>s.toLowerCase().includes(search.toLowerCase())))).sort((a,b)=>(a.distanceKm??Infinity)-(b.distanceKm??Infinity));

  useEffect(()=>setBlockedTechs(new Set(technicians.filter((technician)=>technician.isBlocked).map((technician)=>technician.id))),[technicians]);

  async function toggleBlock(technician: Technician) {
    const blocked = blockedTechs.has(technician.id);
    if (!blocked && !window.confirm(`Bloquer ${technician.name} ? Ce technicien ne vous sera plus proposé automatiquement.`)) return;
    try {
      if (blocked) await api.delete(`/technicians/${technician.id}/block`);
      else await api.post(`/technicians/${technician.id}/block`);
      setBlockedTechs((current)=>{const next=new Set(current);if(blocked)next.delete(technician.id);else next.add(technician.id);return next;});
    } catch (error) { console.error(error); }
  }

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
    <div className="h-full min-h-0 flex flex-col md:flex-row overflow-hidden">
      <div className="relative z-[1100] h-[45%] min-h-0 w-full shrink-0 md:h-full md:w-80 border-b md:border-b-0 md:border-r border-border bg-white flex flex-col shadow-sm md:shadow-none">
        <div className="p-3 border-b border-border space-y-2">
          <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"/><input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Nom ou spécialisation…" className="w-full h-9 pl-9 pr-3 rounded-lg border border-gray-200 text-sm bg-gray-50 focus:outline-none focus:border-blue-400"/></div>
          <div className="flex gap-1.5 flex-wrap">
            <button onClick={()=>setShowAvailOnly(!showAvailOnly)} className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${showAvailOnly?"bg-emerald-500 text-white border-emerald-500":"border-gray-200 text-muted-foreground"}`}><span className={`w-1.5 h-1.5 rounded-full ${showAvailOnly?"bg-white":"bg-emerald-400"}`}/>Disponibles</button>
            {["Climatisation","Chauffage","Installation","Réparation"].map((spec)=><button key={spec} onClick={()=>setFilterSpec(filterSpec===spec?null:spec)} className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${filterSpec===spec?"bg-primary text-white border-primary":"border-gray-200 text-muted-foreground"}`}>{spec}</button>)}
          </div>
          {location&&<div className="flex items-center gap-1.5 text-xs text-blue-600 bg-blue-50 rounded-lg px-3 py-1.5"><Navigation className="w-3 h-3"/>{filtered.length} technicien(s) · depuis <strong>{location.city}</strong></div>}
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          {filtered.map((t)=>{
            const isContacted = contactedTechs.includes(t.id);
            const ratingAllowed = t.canRate || isContacted;
            const existing = ratings[t.id];
            const personalRating = existing?.rating ?? t.myRating;
            const isRating = ratingTech===t.id;
            const aggregateRating = ratingStats[t.id]?.rating ?? t.rating;
            const aggregateReviews = ratingStats[t.id]?.reviews ?? t.reviews;
            const isBlocked = blockedTechs.has(t.id);
            return (
              <div key={t.id} className={`border-b border-gray-50 transition-colors ${selected===t.id?"bg-blue-50":"hover:bg-gray-50"}`}>
                <button onClick={()=>selectTechnician(t.id)} className="w-full text-left p-4">
                  <div className="flex items-start gap-3">
                    <div className="relative"><Avatar initials={t.avatar} color={t.color}/>{t.available&&<span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-white"/>}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between"><span className="font-semibold text-sm">{t.name}</span><span className="text-xs font-medium text-blue-600">{t.distanceKm == null ? "Distance indisponible" : `${t.distanceKm.toFixed(1)} km`}</span></div>
                      <div className="flex flex-wrap gap-1 mt-1">{t.specializations.slice(0,2).map((s)=><span key={s} className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px]">{s}</span>)}</div>
                      <div className="flex items-center gap-2 mt-1.5"><div className="flex items-center gap-0.5"><Star className={`w-3 h-3 ${aggregateReviews>0?"text-amber-400 fill-amber-400":"text-gray-300"}`}/><span className="text-xs font-medium">{aggregateReviews>0?aggregateRating:"—"}</span><span className="text-xs text-muted-foreground">({aggregateReviews} avis client{aggregateReviews>1?"s":""})</span></div><Badge color={isBlocked?"red":t.available?"green":"gray"}>{isBlocked?"Bloqué":t.available?"Disponible":"Indisponible"}</Badge>{isContacted&&<Badge color="blue">Contacté</Badge>}</div>
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
                    <button onClick={()=>toggleBlock(t)} className={`w-full h-8 rounded-lg border text-xs flex items-center justify-center gap-1.5 ${isBlocked?"border-emerald-200 text-emerald-700 hover:bg-emerald-50":"border-red-200 text-red-600 hover:bg-red-50"}`}><BanIcon className="w-3.5 h-3.5"/>{isBlocked?"Débloquer ce technicien":"Bloquer ce technicien"}</button>
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

      <div className="z-0 flex-1 min-h-0 relative overflow-hidden isolate">
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
