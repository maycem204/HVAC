import { useEffect, useRef, useState } from "react";
import { MessageSquare, Phone, Send, X } from "lucide-react";
import api from "../lib/api";
import { realtimeSocket } from "../lib/socket";

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
};

export default function ConversationsPanel({ currentUserId, initialTechnician, onClose, onContacted }:
  { currentUserId: number; initialTechnician?: TechnicianSummary | null; onClose?: () => void; onContacted?: (id: number) => void }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

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
    api.get(`/conversations/${selected.id}/messages`)
      .then(({ data }) => setMessages(data))
      .catch(console.error);
  }, [selected?.id]);

  useEffect(() => {
    const socket = realtimeSocket();
    if (!socket) return;
    const receive = (message: DirectMessage) => {
      setConversations((items) => items.map((item) => item.id === Number(message.conversation_id)
        ? { ...item, last_message: message.body, unread_count: selected?.id === item.id ? 0 : (item.unread_count || 0) + 1 }
        : item));
      if (selected?.id === Number(message.conversation_id)) {
        setMessages((items) => items.some((item) => item.id === message.id) ? items : [...items, message]);
      }
    };
    socket.on("message:new", receive);
    return () => { socket.off("message:new", receive); };
  }, [selected?.id]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  async function sendMessage() {
    const body = input.trim();
    if (!selected || !body) return;
    setInput("");
    try {
      const { data } = await api.post(`/conversations/${selected.id}/messages`, { body });
      setMessages((items) => items.some((item) => item.id === data.id) ? items : [...items, data]);
    } catch (error) {
      console.error(error);
      setInput(body);
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
              <div className="flex justify-between gap-2"><strong className="text-sm truncate">{conversation.counterpart_name}</strong>{!!conversation.unread_count&&<span className="rounded-full bg-blue-600 text-white text-[10px] min-w-5 h-5 flex items-center justify-center">{conversation.unread_count}</span>}</div>
              <div className="text-xs text-gray-500 truncate mt-1">{conversation.last_message || "Nouvelle conversation"}</div>
            </button>
          ))}
        </div>
      </aside>
      <section className="flex-1 flex flex-col min-w-0">
        {selected ? <>
          <header className="h-16 px-4 border-b border-gray-100 flex items-center justify-between gap-3">
            <div><div className="font-semibold">{selected.counterpart_name}</div><div className="text-xs text-gray-500 capitalize">{selected.counterpart_role}</div></div>
            <div className="flex items-center gap-2">
              {selected.counterpart_phone
                ? <a href={`tel:${selected.counterpart_phone}`} className="h-9 px-3 rounded-lg bg-emerald-50 text-emerald-700 flex items-center gap-2 text-sm font-semibold"><Phone className="w-4 h-4"/>{selected.counterpart_phone}</a>
                : <span className="text-xs text-gray-400">Téléphone non renseigné</span>}
              {onClose&&<button onClick={onClose} className="w-9 h-9 rounded-lg hover:bg-gray-100 flex items-center justify-center"><X className="w-4 h-4"/></button>}
            </div>
          </header>
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
            {messages.map((message) => {
              const mine = Number(message.sender_id) === Number(currentUserId);
              return (
                <div key={message.id} className={`flex w-full ${mine ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm shadow-sm ${mine ? "bg-blue-600 text-white rounded-br-sm ml-auto" : "bg-white border border-gray-100 rounded-bl-sm mr-auto"}`}>
                    <div className="whitespace-pre-wrap break-words">{message.body}</div>
                    <div className={`text-[10px] mt-1 text-right ${mine ? "text-blue-100" : "text-gray-400"}`}>{new Date(message.created_at).toLocaleTimeString("fr-FR", { hour:"2-digit", minute:"2-digit" })}</div>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef}/>
          </div>
          <div className="p-3 border-t border-gray-100 flex gap-2">
            <input value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); sendMessage(); } }} maxLength={2000} placeholder="Écrivez votre message…" className="flex-1 h-10 px-3 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:border-blue-400"/>
            <button onClick={sendMessage} disabled={!input.trim()} className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center disabled:opacity-40"><Send className="w-4 h-4"/></button>
          </div>
        </> : <div className="flex-1 flex items-center justify-center text-sm text-gray-500">Sélectionnez une conversation.</div>}
      </section>
    </div>
  );

  return onClose
    ? <div className="fixed inset-0 z-[2000] bg-black/45 p-4 md:p-10 flex items-center justify-center" onClick={onClose}><div className="w-full max-w-5xl h-[75vh]" onClick={(event) => event.stopPropagation()}>{content}</div></div>
    : <div className="h-[calc(100vh-112px)] p-4 md:p-6">{content}</div>;
}
