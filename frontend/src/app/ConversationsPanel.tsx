import { useEffect, useRef, useState } from "react";
import { CheckCheck, MessageSquare, Phone, Send, X } from "lucide-react";
import api from "../lib/api";
import { realtimeSocket } from "../lib/socket";
import { useInterfaceLanguage } from "./InterfaceLanguage";

type TechnicianSummary = { id: number; name: string; avatar?: string };
type Conversation = {
  id: number;
  counterpart_id: number;
  counterpart_name: string;
  counterpart_phone?: string | null;
  counterpart_avatar?: string;
  counterpart_role: "client" | "technician";
  last_message?: string;
  unread_count?: number;
};
type DirectMessage = {
  id: number;
  conversation_id: number;
  sender_id: number;
  sender_name?: string;
  body: string;
  created_at: string;
  read_at?: string | null;
  mine?: boolean;
};

function ProfileAvatar({ value, name, size = "small" }: { value?: string; name: string; size?: "small" | "large" }) {
  const classes = size === "large" ? "w-10 h-10" : "w-8 h-8";
  if (value?.startsWith("data:image/")) return <img src={value} alt={`Photo de ${name}`} className={`${classes} rounded-full object-cover shrink-0`}/>;
  const initials = value || name.split(" ").map((part)=>part[0]).join("").slice(0,2).toUpperCase();
  return <div className={`${classes} rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold shrink-0`}>{initials}</div>;
}

export default function ConversationsPanel({ initialTechnician, onClose, onContacted }:
  { initialTechnician?: TechnicianSummary | null; onClose?: () => void; onContacted?: (id: number) => void }) {
  const { language } = useInterfaceLanguage();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const selectedPhone = String(selected?.counterpart_phone || "").trim();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const { data } = await api.get("/conversations");
        let list = data as Conversation[];
        if (initialTechnician) {
          const existing = list.find((conversation) => Number(conversation.counterpart_id) === initialTechnician.id);
          if (existing) setSelected(existing);
          else {
            const created = (await api.post("/conversations", { technicianId: initialTechnician.id })).data as Conversation;
            list = [created, ...list];
            setSelected(created);
          }
          onContacted?.(initialTechnician.id);
        } else if (list.length) setSelected(list[0]);
        if (!cancelled) setConversations(list);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load().catch(console.error);
    return () => { cancelled = true; };
  }, [initialTechnician?.id, onContacted]);

  useEffect(() => {
    if (!selected) { setMessages([]); return; }
    let cancelled = false;
    setError("");
    setConversations((items) => items.map((item) => item.id === selected.id ? { ...item, unread_count: 0 } : item));
    api.get(`/conversations/${selected.id}/messages`)
      .then(({ data }) => { if (!cancelled) setMessages(data.map((message: DirectMessage)=>({...message,mine:String(message.sender_id)!==String(selected.counterpart_id)}))); })
      .catch(() => { if (!cancelled) setError("Impossible de charger cette conversation."); });
    return () => { cancelled = true; };
  }, [selected?.id, selected?.counterpart_id]);

  useEffect(() => {
    const socket = realtimeSocket();
    if (!socket) return;
    const receive = (message: DirectMessage) => {
      setConversations((items) => items.map((item) => item.id === Number(message.conversation_id)
        ? { ...item, last_message: message.body, unread_count: String(message.sender_id)!==String(item.counterpart_id) || selected?.id === item.id ? 0 : (item.unread_count || 0) + 1 }
        : item));
      if (selected?.id === Number(message.conversation_id)) {
        const normalizedMessage = { ...message, mine:String(message.sender_id)!==String(selected.counterpart_id) };
        setMessages((items) => items.some((item) => item.id === message.id) ? items : [...items, normalizedMessage]);
      }
    };
    socket.on("message:new", receive);
    return () => { socket.off("message:new", receive); };
  }, [selected?.id, selected?.counterpart_id]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  async function sendMessage() {
    const body = input.trim();
    if (!selected || !body) return;
    setInput("");
    try {
      const { data } = await api.post(`/conversations/${selected.id}/messages`, { body });
      setMessages((items) => items.some((item) => item.id === data.id) ? items : [...items, { ...data, mine:true }]);
    } catch (error) {
      console.error(error);
      setInput(body);
      setError("Message non envoyé. Vérifiez votre connexion puis réessayez.");
    }
  }

  const content = (
    <div className="bg-white w-full h-full flex overflow-hidden rounded-2xl border border-gray-100 shadow-xl">
      <aside className="w-64 border-r border-gray-100 flex flex-col">
        <div className="p-4 border-b border-gray-100 font-bold flex items-center gap-2"><MessageSquare className="w-4 h-4"/>Messages</div>
        <div className="flex-1 overflow-y-auto">
          {loading && <div className="p-4 text-sm text-gray-500">Chargement…</div>}
          {!loading && conversations.length === 0 && <div className="p-4 text-sm text-gray-500">Aucune conversation.</div>}
          {conversations.map((conversation) => (
            <button key={conversation.id} onClick={() => setSelected(conversation)} className={`w-full text-left p-4 border-b border-gray-50 ${selected?.id === conversation.id ? "bg-blue-50" : "hover:bg-gray-50"}`}>
              <div className="flex items-center gap-2"><ProfileAvatar value={conversation.counterpart_avatar} name={conversation.counterpart_name}/><div className="min-w-0 flex-1"><div className="flex justify-between gap-2"><strong className="text-sm truncate">{conversation.counterpart_name}</strong>{!!conversation.unread_count&&<span className="rounded-full bg-blue-600 text-white text-[10px] min-w-5 h-5 flex items-center justify-center">{conversation.unread_count}</span>}</div><div className="text-xs text-gray-500 truncate mt-1">{conversation.last_message || "Nouvelle conversation"}</div></div></div>
            </button>
          ))}
        </div>
      </aside>
      <section className="flex-1 flex flex-col min-w-0">
        {selected ? <>
          <header className="h-16 px-4 border-b border-blue-700 bg-primary text-white flex items-center justify-between gap-3">
            <div className="flex items-center gap-3"><ProfileAvatar value={selected.counterpart_avatar} name={selected.counterpart_name} size="large"/><div><div className="font-semibold">{selected.counterpart_name}</div><div className="text-xs text-blue-100 capitalize">Messagerie sécurisée · {selected.counterpart_role}</div></div></div>
            <div className="flex items-center gap-2">
              {selectedPhone&&<a href={`tel:${selectedPhone}`} className="h-9 px-3 rounded-lg bg-white/15 text-white flex items-center gap-2 text-sm font-semibold hover:bg-white/25"><Phone className="w-4 h-4"/>{selectedPhone}</a>}
              {onClose&&<button onClick={onClose} className="w-9 h-9 rounded-lg hover:bg-gray-100 flex items-center justify-center"><X className="w-4 h-4"/></button>}
            </div>
          </header>
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-blue-50/40" style={{backgroundImage:"radial-gradient(rgba(37,99,235,.07) 1px, transparent 1px)",backgroundSize:"18px 18px"}}>
            {messages.map((message) => {
              const mine = message.mine ?? String(message.sender_id) !== String(selected.counterpart_id);
              return (
                <div key={message.id} className={`flex w-full ${mine ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[75%] px-3 py-2 rounded-xl text-sm shadow-sm ${mine ? "bg-blue-100 text-slate-900 rounded-br-sm ml-auto" : "bg-white text-slate-900 border border-gray-100 rounded-bl-sm mr-auto"}`}>
                    <div data-language-neutral="true" className="whitespace-pre-wrap break-words">{message.body}</div>
                    <div className="text-[10px] mt-1 text-right flex items-center justify-end gap-1 text-gray-500">{new Date(message.created_at).toLocaleTimeString(language==="fr"?"fr-FR":"en-GB", { hour:"2-digit", minute:"2-digit" })}{mine&&<CheckCheck className={`w-3.5 h-3.5 ${message.read_at?"text-blue-600":"text-gray-400"}`}/>}</div>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef}/>
          </div>
          <div className="p-3 border-t border-gray-100 flex flex-wrap gap-2">
            {error&&<div className="w-full rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}
            <input value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); sendMessage(); } }} maxLength={2000} placeholder="Écrivez votre message…" className="flex-1 h-10 px-3 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:border-blue-400"/>
            <button onClick={sendMessage} disabled={!input.trim()} className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center disabled:opacity-40 hover:bg-primary/90"><Send className="w-4 h-4"/></button>
          </div>
        </> : <div className="flex-1 flex items-center justify-center text-sm text-gray-500">Sélectionnez une conversation.</div>}
      </section>
    </div>
  );

  return onClose
    ? <div className="fixed inset-0 z-[2000] bg-black/45 p-4 md:p-10 flex items-center justify-center" onClick={onClose}><div className="w-full max-w-5xl h-[75vh]" onClick={(event) => event.stopPropagation()}>{content}</div></div>
    : <div className="h-[calc(100vh-112px)] p-4 md:p-6">{content}</div>;
}
