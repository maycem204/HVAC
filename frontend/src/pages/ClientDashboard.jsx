import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bell,
  Calendar,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  LogOut,
  MapPin,
  MessageSquare,
  Mic,
  MicOff,
  Navigation,
  Pencil,
  RefreshCw,
  Search,
  Send,
  Star,
  ThumbsDown,
  ThumbsUp,
  User,
  Wrench,
  X,
  Zap,
} from 'lucide-react'

const SPECIALISTES = [
  { id: 1, name: 'Ahmed Benali', specialty: 'Climatisation & Réfrigération', distanceKm: 0.8, rating: 4.9, response: '< 30 min', available: true, avatar: 'AB', color: 'bg-blue-500', tags: ['Daikin', 'Mitsubishi', 'Samsung'], specializations: ['Climatisation', 'Réparation', 'Réfrigération'], price: 'À partir de 45 €' },
  { id: 2, name: 'Karim Meziane', specialty: 'CVC — Chauffage & Ventilation', distanceKm: 1.4, rating: 4.7, response: '< 1h', available: true, avatar: 'KM', color: 'bg-emerald-500', tags: ['LG', 'Carrier', 'Trane'], specializations: ['Chauffage', 'Ventilation', 'Installation'], price: 'À partir de 50 €' },
  { id: 3, name: 'Youssef Tlemcani', specialty: 'Climatisation split & multi-split', distanceKm: 2.1, rating: 4.6, response: '< 2h', available: false, avatar: 'YT', color: 'bg-purple-500', tags: ['Hitachi', 'Fujitsu', 'LG'], specializations: ['Climatisation', 'Multi-split', 'Remplacement'], price: 'À partir de 40 €' },
  { id: 4, name: 'Sofiane Hadjadj', specialty: 'Installation & Maintenance HVAC', distanceKm: 3.5, rating: 4.8, response: '< 45 min', available: true, avatar: 'SH', color: 'bg-orange-500', tags: ['Daikin', 'York', 'Carrier'], specializations: ['Installation', 'Maintenance préventive', 'Pompe à chaleur'], price: 'À partir de 55 €' },
]

const NOTIFICATIONS_BASE = [
  { id: 1, type: 'rdv', title: 'Rendez-vous confirmé', message: 'Ahmed Benali confirme votre RDV du 26 juin à 14h00.', time: 'Il y a 5 min', read: false },
  { id: 2, type: 'price', title: 'Prix saisi — Confirmation requise', message: 'Ahmed Benali a saisi 195 € pour l’intervention du 24 juin. Confirmez-vous ?', time: 'Il y a 2h', read: false },
  { id: 3, type: 'system', title: 'Nouveau technicien disponible', message: 'Sofiane Hadjadj (4.8★) est maintenant disponible dans votre zone.', time: 'Il y a 3h', read: true },
  { id: 4, type: 'reassign', title: 'Technicien de remplacement trouvé', message: 'Suite au déclin, Karim Meziane prend en charge votre demande.', time: 'Il y a 5h', read: true },
]

const APPOINTMENTS = [
  { id: 1, client: 'Nadia K.', technicianId: 1, technicianName: 'Ahmed Benali', date: '2026-06-24', time: '09:00', service: 'Diagnostic clim Daikin', address: '12 rue Didouche Mourad, Alger', status: 'completed', estimatedPrice: 185, actualPrice: 195, rating: 5, feedback: 'Excellent service, très professionnel !', caseDescription: 'Panne du compresseur — remplacé — garantie 1 an' },
  { id: 2, client: 'Samia R.', technicianId: 2, technicianName: 'Karim Meziane', date: '2026-06-25', time: '11:30', service: 'Réparation réfrigérant', address: '45 cité Garidi, Kouba', status: 'completed', estimatedPrice: 145, actualPrice: 160, caseDescription: 'Fuite sur conduite extérieure — soudure + recharge R32' },
  { id: 3, client: 'Amine L.', technicianId: 1, technicianName: 'Ahmed Benali', date: '2026-06-26', time: '14:00', service: 'Installation split 12000 BTU', address: '8 bd Zighoud Youcef, Alger', status: 'confirmed', estimatedPrice: 520 },
]

const DEMO_FLOW = [
  { trigger: ['clim', 'climatiseur', 'froid', 'split'], response: 'Je comprends. Quelle est la marque et l’âge approximatif de votre appareil ?' },
  { trigger: ['daikin', 'mitsubishi', 'samsung', 'lg', 'carrier'], response: 'Merci. L’appareil est-il facilement accessible ? Est-ce urgent ?' },
  { trigger: ['urgent', 'urgent.', 'oui', 'yes', 'accessible'], quote: true },
]

function initialsFromName(name) {
  return String(name || 'U')
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

function Avatar({ initials, color }) {
  return <div className={`w-8 h-8 rounded-full ${color} flex items-center justify-center text-white text-xs font-bold shrink-0`}>{initials}</div>
}

function Badge({ tone = 'gray', children }) {
  const tones = {
    gray: 'bg-gray-100 text-gray-600 border-gray-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-100',
    green: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
    red: 'bg-red-50 text-red-700 border-red-100',
    purple: 'bg-purple-50 text-purple-700 border-purple-100',
  }
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${tones[tone]}`}>{children}</span>
}

function CardShell({ children, className = '' }) {
  return <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm ${className}`}>{children}</div>
}

function NotificationPanel({ notifications, onRead, onReadAll, onClose }) {
  const icons = {
    lead: { cls: 'bg-blue-100 text-blue-600', icon: <MessageSquare className="w-3.5 h-3.5" /> },
    rdv: { cls: 'bg-emerald-100 text-emerald-600', icon: <Calendar className="w-3.5 h-3.5" /> },
    price: { cls: 'bg-amber-100 text-amber-600', icon: <Clock className="w-3.5 h-3.5" /> },
    system: { cls: 'bg-gray-100 text-gray-600', icon: <RefreshCw className="w-3.5 h-3.5" /> },
    reassign: { cls: 'bg-orange-100 text-orange-600', icon: <RefreshCw className="w-3.5 h-3.5" /> },
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/20" onClick={onClose}>
      <div className="absolute top-14 right-4 w-96 max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div>
            <div className="font-semibold text-sm text-slate-950">Notifications</div>
            <div className="text-xs text-gray-500">{notifications.filter((n) => !n.read).length} non lues</div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onReadAll} className="text-xs text-blue-600 hover:underline">Tout marquer lu</button>
            <button onClick={onClose} className="text-gray-500 hover:text-slate-950"><X className="w-4 h-4" /></button>
          </div>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {notifications.map((notification) => {
            const currentIcon = icons[notification.type] || icons.system
            return (
              <button key={notification.id} onClick={() => onRead(notification.id)} className={`w-full text-left px-4 py-3.5 border-b border-gray-50 hover:bg-gray-50 flex items-start gap-3 ${notification.read ? '' : 'bg-blue-50/30'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${currentIcon.cls}`}>{currentIcon.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className={`text-sm text-slate-950 ${notification.read ? '' : 'font-semibold'}`}>{notification.title}</div>
                    {!notification.read && <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0 mt-1" />}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5 leading-relaxed">{notification.message}</div>
                  <div className="text-xs text-gray-400 mt-1">{notification.time}</div>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function ProfileModal({ user, onClose, onSave }) {
  const [form, setForm] = useState({
    full_name: user?.full_name || user?.name || 'Client démo',
    email: user?.email || '',
    region: user?.region || 'Alger',
  })

  function save() {
    onSave({ ...user, ...form })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="h-1.5 bg-blue-600" />
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-slate-950">Mon profil</h3>
            <button onClick={onClose} className="text-gray-500 hover:text-slate-950"><X className="w-5 h-5" /></button>
          </div>
          <div className="flex items-center gap-4 mb-6 p-4 bg-gray-50 rounded-xl">
            <div className="w-14 h-14 rounded-full bg-blue-500 flex items-center justify-center text-white text-xl font-bold">{initialsFromName(form.full_name)}</div>
            <div>
              <div className="font-semibold text-slate-950">{form.full_name}</div>
              <Badge tone="blue">Client</Badge>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider col-span-2">Informations personnelles</label>
            <div className="col-span-2"><input value={form.full_name} onChange={(e) => setForm((prev) => ({ ...prev, full_name: e.target.value }))} className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm bg-gray-50 focus:outline-none focus:border-blue-400" placeholder="Nom complet" /></div>
            <div className="col-span-2"><input value={form.email} onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))} className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm bg-gray-50 focus:outline-none focus:border-blue-400" placeholder="Email" /></div>
            <div className="col-span-2"><input value={form.region} onChange={(e) => setForm((prev) => ({ ...prev, region: e.target.value }))} className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm bg-gray-50 focus:outline-none focus:border-blue-400" placeholder="Région" /></div>
          </div>
          <div className="mt-6 flex gap-2">
            <button onClick={save} className="flex-1 h-11 rounded-xl bg-blue-600 text-white text-sm font-semibold">Enregistrer</button>
            <button onClick={onClose} className="h-11 px-4 rounded-xl border border-gray-200 text-sm text-gray-600">Annuler</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ClientChat({ onContact }) {
  const [messages, setMessages] = useState([{ role: 'bot', text: 'Bonjour ! Décrivez votre problème HVAC ou utilisez le micro.' }])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState(0)
  const [quote, setQuote] = useState(null)
  const [priceDecision, setPriceDecision] = useState(null)
  const [counterPrice, setCounterPrice] = useState('')
  const [counterSent, setCounterSent] = useState(false)
  const [showSlots, setShowSlots] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState(null)
  const [booked, setBooked] = useState(false)
  const [customDate, setCustomDate] = useState('')
  const [isListening, setIsListening] = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, quote, showSlots, priceDecision])

  const faultType = messages.map((m) => m.text).join(' ').toLowerCase().match(/chauff|chaudi/)
    ? 'Chauffage'
    : messages.map((m) => m.text).join(' ').toLowerCase().match(/ventil/)
      ? 'Ventilation'
      : 'Climatisation'

  const relatedTechs = SPECIALISTES.filter((tech) => tech.available && tech.specializations.some((item) => item.toLowerCase().includes(faultType.toLowerCase().slice(0, 5))))
  const proposedSlots = [
    { date: 'Aujourd’hui', time: '16:30', techId: relatedTechs[0]?.id ?? 1 },
    { date: 'Demain matin', time: '09:00', techId: relatedTechs[0]?.id ?? 1 },
    { date: 'Demain après-midi', time: '14:00', techId: relatedTechs[1]?.id ?? 2 },
    { date: 'Jeudi 27 juin', time: '10:30', techId: relatedTechs[0]?.id ?? 1 },
  ]

  function send(text) {
    if (loading || !text.trim()) return

    setMessages((prev) => [...prev, { role: 'user', text }])
    setInput('')
    setLoading(true)

    setTimeout(() => {
      const current = DEMO_FLOW[step] || {}
      if (current.quote) {
        setMessages((prev) => [...prev, { role: 'bot', text: 'Paramètres extraits — calcul du devis en cours…' }])
        setTimeout(() => {
          setQuote({ price: 187, low: 160, high: 215, conf: 82 })
          setLoading(false)
        }, 850)
      } else {
        setMessages((prev) => [...prev, { role: 'bot', text: current.response || 'L’appareil est-il facilement accessible ? (oui/non)' }])
        setLoading(false)
      }
      setStep((currentStep) => Math.min(currentStep + 1, DEMO_FLOW.length - 1))
    }, 600)
  }

  function handlePriceDecision(decision) {
    setPriceDecision(decision)
    if (decision === 'accept') {
      setMessages((prev) => [...prev, { role: 'user', text: 'J’accepte ce prix.' }])
      setTimeout(() => {
        setMessages((prev) => [...prev, { role: 'bot', text: `Parfait ! Voici les spécialistes en ${faultType} disponibles près de vous.` }])
        setShowSlots(true)
      }, 350)
    }
    if (decision === 'decline') {
      setMessages((prev) => [...prev, { role: 'user', text: 'Je décline ce prix.' }, { role: 'bot', text: 'Pas de problème. Souhaitez-vous une évaluation gratuite sur site ? Un technicien pourra vous donner un devis précis.' }])
    }
  }

  function sendCounter() {
    if (!counterPrice) return
    setCounterSent(true)
    setMessages((prev) => [...prev, { role: 'user', text: `Je propose ${counterPrice} €.` }, { role: 'bot', text: `Votre proposition de ${counterPrice} € est transmise aux techniciens disponibles. Nous vous recontactons sous 30 minutes.` }])
    setPriceDecision(null)
  }

  function confirmSlot() {
    if (!selectedSlot) return
    const tech = SPECIALISTES.find((item) => item.id === selectedSlot.techId)
    onContact(tech?.id ?? 1)
    setBooked(true)
    setShowSlots(false)
    setMessages((prev) => [...prev, { role: 'bot', text: `Rendez-vous confirmé ! ${selectedSlot.date} à ${selectedSlot.time} avec ${tech?.name || 'un spécialiste'} (spécialiste ${faultType}). Confirmation SMS envoyée.` }])
  }

  const suggestions = ['Ma clim Daikin split ne refroidit plus', 'Climatiseur LG en panne', 'Chaudière Carrier n’allume plus']

  return (
    <div className="flex flex-col max-w-2xl mx-auto w-full p-4 md:p-6" style={{ height: 'calc(100vh - 112px)' }}>
      <div className="flex-1 overflow-y-auto space-y-4 pb-4">
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center shrink-0"><Zap className="w-4 h-4 text-white" /></div>
          <div className="text-sm text-blue-800"><strong>Devis gratuit et instantané.</strong> Décrivez votre panne ou utilisez le micro.</div>
        </div>

        {messages.map((message, index) => (
          <div key={index} className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {message.role === 'bot' && <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center shrink-0 mt-0.5"><Zap className="w-3.5 h-3.5 text-white" /></div>}
            <div className={`max-w-[78%] text-sm px-4 py-3 rounded-2xl leading-relaxed shadow-sm ${message.role === 'user' ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-white text-slate-950 rounded-bl-sm border border-gray-100'}`}>{message.text}</div>
          </div>
        ))}

        {loading && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center shrink-0"><Zap className="w-3.5 h-3.5 text-white" /></div>
            <div className="bg-white border border-gray-100 rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1.5 items-center shadow-sm">
              {[0, 150, 300].map((delay) => <span key={delay} className="w-2 h-2 rounded-full bg-blue-500/40 animate-bounce" style={{ animationDelay: `${delay}ms` }} />)}
            </div>
          </div>
        )}

        {quote && (
          <CardShell className="overflow-hidden">
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-4 text-white">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs font-medium opacity-80 mb-1">ESTIMATION — {faultType.toUpperCase()}</div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-black">{quote.price} €</span>
                    <span className="text-sm opacity-75">{quote.low}–{quote.high} €</span>
                  </div>
                </div>
                <div className="text-right text-xs opacity-80">
                  <div>Confiance</div>
                  <div className="text-lg font-bold opacity-100">{quote.conf}%</div>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <div className="flex-1 h-1 bg-white/20 rounded-full"><div className="h-1 bg-white rounded-full" style={{ width: `${quote.conf}%` }} /></div>
              </div>
            </div>
            <div className="p-4 grid grid-cols-2 gap-3 text-sm">
              {[
                { k: 'Type', v: 'AC ne refroidit plus' },
                { k: 'Marque', v: 'Daikin split' },
                { k: 'Âge', v: '4 ans' },
                { k: 'Durée estimée', v: '1h30–2h' },
              ].map(({ k, v }) => (
                <div key={k}><div className="text-xs text-gray-500">{k}</div><div className="font-medium text-slate-950">{v}</div></div>
              ))}
            </div>
            {!priceDecision && !counterSent && (
              <div className="px-4 pb-4 border-t border-gray-100 pt-4">
                <div className="text-sm font-medium text-slate-950 mb-3">Que souhaitez-vous faire ?</div>
                <div className="grid grid-cols-3 gap-2">
                  <button onClick={() => handlePriceDecision('accept')} className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 text-emerald-700"><ThumbsUp className="w-5 h-5" /><span className="text-xs font-semibold">Accepter</span></button>
                  <button onClick={() => handlePriceDecision('negotiate')} className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-amber-50 border border-amber-200 hover:bg-amber-100 text-amber-700"><Pencil className="w-5 h-5" /><span className="text-xs font-semibold">Négocier</span></button>
                  <button onClick={() => handlePriceDecision('decline')} className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-red-50 border border-red-200 hover:bg-red-100 text-red-600"><ThumbsDown className="w-5 h-5" /><span className="text-xs font-semibold">Décliner</span></button>
                </div>
              </div>
            )}
            {priceDecision === 'negotiate' && !counterSent && (
              <div className="px-4 pb-4 border-t border-gray-100 pt-4">
                <div className="text-sm font-medium mb-2 text-slate-950">Votre budget maximum</div>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input type="number" placeholder={String(quote.price - 20)} value={counterPrice} onChange={(e) => setCounterPrice(e.target.value)} className="w-full h-10 px-3 pr-6 rounded-lg border border-gray-200 text-sm bg-gray-50 focus:outline-none focus:border-blue-400" />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">€</span>
                  </div>
                  <button onClick={sendCounter} disabled={!counterPrice} className="h-10 px-4 rounded-lg bg-blue-600 text-white text-sm font-semibold disabled:opacity-40">Envoyer</button>
                  <button onClick={() => setPriceDecision(null)} className="h-10 px-3 rounded-lg border border-gray-200 text-sm text-gray-600">✕</button>
                </div>
                <div className="text-xs text-gray-500 mt-1.5">Votre proposition sera envoyée aux techniciens disponibles.</div>
              </div>
            )}
          </CardShell>
        )}

        {showSlots && !booked && (
          <CardShell className="overflow-hidden">
            <div className="p-4 border-b border-gray-100">
              <div className="text-sm font-semibold text-slate-950">Spécialistes {faultType} disponibles</div>
              <div className="text-xs text-gray-500 mt-0.5">{relatedTechs.length} technicien(s) correspond(ent) à votre panne</div>
            </div>
            <div className="p-3 space-y-2">
              {proposedSlots.map((slot, index) => {
                const tech = SPECIALISTES.find((item) => item.id === slot.techId)
                const isSelected = selectedSlot?.date === slot.date && selectedSlot?.time === slot.time
                if (!tech) return null
                return (
                  <button key={index} onClick={() => setSelectedSlot(slot)} className={`w-full text-left p-3 rounded-xl border transition-all ${isSelected ? 'border-blue-600 bg-blue-50' : 'border-gray-200 hover:border-gray-300 bg-gray-50/50'}`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-full ${tech.color} flex items-center justify-center text-white text-xs font-bold shrink-0`}>{tech.avatar}</div>
                      <div className="flex-1">
                        <div className="text-sm font-semibold text-slate-950">{slot.date} — {slot.time}</div>
                        <div className="text-xs text-gray-500">{tech.name} · {tech.distanceKm} km · {tech.response}</div>
                        <div className="flex gap-1 mt-0.5">{tech.specializations.slice(0, 2).map((specialization) => <span key={specialization} className="px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded text-[10px] font-medium">{specialization}</span>)}</div>
                      </div>
                      {isSelected && <Check className="w-4 h-4 text-blue-600 shrink-0" />}
                    </div>
                  </button>
                )
              })}
            </div>
            <div className="p-4 border-t border-gray-100 space-y-3">
              <div className="text-xs font-medium text-gray-500">Ou proposez une autre date :</div>
              <div className="flex gap-2">
                <input type="text" placeholder="Ex : Vendredi 28 juin à 10h" value={customDate} onChange={(e) => setCustomDate(e.target.value)} className="flex-1 h-9 px-3 rounded-lg border border-gray-200 text-sm bg-gray-50 focus:outline-none focus:border-blue-400" />
                <button onClick={() => { if (customDate) { setShowSlots(false); setMessages((prev) => [...prev, { role: 'user', text: `Je préfère le ${customDate}` }, { role: 'bot', text: `Bien, je vérifie pour le ${customDate} et vous confirme très vite.` }]) } }} disabled={!customDate} className="h-9 px-3 rounded-lg bg-slate-700 text-white text-xs font-medium disabled:opacity-40">Proposer</button>
              </div>
              <div className="flex gap-2">
                <button onClick={confirmSlot} disabled={!selectedSlot} className="flex-1 h-10 rounded-xl bg-blue-600 text-white text-sm font-semibold disabled:opacity-40">Confirmer</button>
                <button onClick={() => { setShowSlots(false); setMessages((prev) => [...prev, { role: 'user', text: 'Non merci.' }, { role: 'bot', text: 'Pas de problème. Vous pouvez réserver depuis l’onglet Rendez-vous.' }]) }} className="h-10 px-4 rounded-xl border border-gray-200 text-sm text-gray-600">Non merci</button>
              </div>
            </div>
          </CardShell>
        )}

        <div ref={bottomRef} />
      </div>

      {messages.length <= 1 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {suggestions.map((suggestion) => <button key={suggestion} onClick={() => send(suggestion)} className="text-xs px-3 py-1.5 rounded-full bg-white border border-gray-200 text-gray-500 hover:border-blue-400 hover:text-blue-600 shadow-sm">{suggestion}</button>)}
        </div>
      )}

      <div className={`bg-white rounded-2xl border shadow-sm flex items-center gap-2 px-3 py-2 transition-all ${isListening ? 'border-red-400 ring-2 ring-red-100' : 'border-gray-100'}`}>
        <button type="button" onClick={() => setIsListening((prev) => !prev)} className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${isListening ? 'bg-red-500 text-white animate-pulse' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
          {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
        </button>
        <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send(input)} placeholder={isListening ? 'Écoute en cours…' : 'Décrivez votre problème HVAC…'} className="flex-1 text-sm placeholder:text-gray-400 bg-transparent outline-none" />
        <button onClick={() => send(input)} disabled={!input.trim() || loading} className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 disabled:opacity-40 shrink-0"><Send className="w-4 h-4" /></button>
      </div>
    </div>
  )
}

function ClientRdv({ contactedTechs }) {
  const [appointments, setAppointments] = useState(APPOINTMENTS)
  const [selectedAppt, setSelectedAppt] = useState(null)
  const [feedbackAppt, setFeedbackAppt] = useState(null)
  const [feedback, setFeedback] = useState({ rating: 0, comment: '' })

  const completed = appointments.filter((appointment) => appointment.status === 'completed')
  const upcoming = appointments.filter((appointment) => appointment.status === 'confirmed' || appointment.status === 'pending')

  function confirmPrice(id) {
    setAppointments((prev) => prev.map((appointment) => (appointment.id === id ? { ...appointment, clientConfirmedPrice: true } : appointment)))
  }

  function submitFeedback(id) {
    setAppointments((prev) => prev.map((appointment) => (appointment.id === id ? { ...appointment, rating: feedback.rating, feedback: feedback.comment } : appointment)))
    setFeedbackAppt(null)
    setFeedback({ rating: 0, comment: '' })
  }

  const canRate = (appointment) => appointment.status === 'completed' || contactedTechs.includes(appointment.technicianId)

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 max-w-4xl mx-auto w-full">
      <h2 className="text-xl font-bold text-slate-950 mb-1">Mes rendez-vous</h2>
      <p className="text-sm text-gray-500 mb-6">Historique et rendez-vous à venir</p>

      {upcoming.length > 0 && (
        <div className="mb-8">
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">À venir</h3>
          <div className="space-y-3">
            {upcoming.map((appointment) => {
              const tech = SPECIALISTES.find((item) => item.id === appointment.technicianId)
              const isFeedbackVisible = feedbackAppt === appointment.id
              return (
                <CardShell key={appointment.id} className="p-5">
                  <div className="flex items-start gap-4">
                    <Avatar initials={tech?.avatar || 'TX'} color={tech?.color || 'bg-blue-500'} />
                    <div className="flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-semibold text-slate-950">{appointment.technicianName}</div>
                          <div className="text-sm text-gray-500">{appointment.service}</div>
                        </div>
                        <Badge tone={appointment.status === 'confirmed' ? 'green' : 'amber'}>{appointment.status === 'confirmed' ? 'Confirmé' : 'En attente'}</Badge>
                      </div>
                      <div className="flex flex-wrap gap-4 mt-3 text-sm text-gray-500">
                        <div className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" />{appointment.date}</div>
                        <div className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" />{appointment.time}</div>
                        <div className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" />{appointment.address}</div>
                      </div>
                      <div className="mt-3 pt-3 border-t border-gray-100 text-sm"><span className="text-gray-500">Prix estimé : </span><span className="font-bold text-slate-950">{appointment.estimatedPrice} €</span></div>
                      {canRate(appointment) && !appointment.rating && !isFeedbackVisible && <button onClick={() => setFeedbackAppt(appointment.id)} className="mt-2 text-xs text-blue-600 hover:underline flex items-center gap-1"><Star className="w-3.5 h-3.5" />Évaluer (vous avez contacté ce technicien)</button>}
                      {isFeedbackVisible && (
                        <div className="mt-3 space-y-2 pt-3 border-t border-gray-100">
                          <div className="flex gap-1">{[1, 2, 3, 4, 5].map((score) => <button key={score} onClick={() => setFeedback((prev) => ({ ...prev, rating: score }))}><Star className={`w-5 h-5 ${score <= feedback.rating ? 'text-amber-400 fill-amber-400' : 'text-gray-300'}`} /></button>)}</div>
                          <textarea value={feedback.comment} onChange={(e) => setFeedback((prev) => ({ ...prev, comment: e.target.value }))} placeholder="Votre expérience…" className="w-full h-16 px-3 py-2 rounded-lg border border-gray-200 text-sm bg-gray-50 resize-none focus:outline-none focus:border-blue-400" />
                          <div className="flex gap-2"><button onClick={() => submitFeedback(appointment.id)} disabled={!feedback.rating} className="flex-1 h-8 rounded-lg bg-blue-600 text-white text-xs font-semibold disabled:opacity-40">Publier</button><button onClick={() => setFeedbackAppt(null)} className="h-8 px-3 rounded-lg border border-gray-200 text-xs text-gray-500">Annuler</button></div>
                        </div>
                      )}
                    </div>
                  </div>
                </CardShell>
              )
            })}
          </div>
        </div>
      )}

      <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Historique</h3>
      <div className="space-y-3">
        {completed.map((appointment) => {
          const tech = SPECIALISTES.find((item) => item.id === appointment.technicianId)
          const isExpanded = selectedAppt?.id === appointment.id
          return (
            <div key={appointment.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <button onClick={() => setSelectedAppt(isExpanded ? null : appointment)} className="w-full p-5 text-left hover:bg-gray-50">
                <div className="flex items-start gap-4">
                  <Avatar initials={tech?.avatar || 'TX'} color={tech?.color || 'bg-blue-500'} />
                  <div className="flex-1">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-semibold text-slate-950">{appointment.technicianName}</div>
                        <div className="text-sm text-gray-500">{appointment.service}</div>
                      </div>
                      <Badge tone="blue">Terminé</Badge>
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                      <div className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" />{appointment.date}</div>
                      {appointment.rating && <div className="flex items-center gap-1"><Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" /><span className="text-slate-950 font-medium">{appointment.rating}/5</span></div>}
                    </div>
                  </div>
                  <ChevronRight className={`w-5 h-5 text-gray-500 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                </div>
              </button>
              {isExpanded && (
                <div className="px-5 pb-5 space-y-4 border-t border-gray-100 pt-4">
                  <div className="bg-gray-50 rounded-xl p-4">
                    <div className="grid grid-cols-2 gap-4 text-sm mb-3">
                      <div><div className="text-xs text-gray-500 mb-1">Prix estimé</div><div className="font-medium text-slate-950">{appointment.estimatedPrice} €</div></div>
                      <div><div className="text-xs text-gray-500 mb-1">Prix réel</div><div className="text-lg font-bold text-slate-950">{appointment.actualPrice ?? '—'} €</div></div>
                    </div>
                    {appointment.actualPrice && !appointment.clientConfirmedPrice && <div className="pt-3 border-t border-gray-200"><div className="flex items-center gap-2 text-xs text-amber-600 mb-2"><AlertCircle className="w-3.5 h-3.5" />Confirmez-vous avoir payé ce montant ?</div><button onClick={() => confirmPrice(appointment.id)} className="w-full h-8 rounded-lg bg-blue-600 text-white text-xs font-semibold">Oui, j’ai payé {appointment.actualPrice} €</button></div>}
                    {appointment.clientConfirmedPrice && <div className="pt-3 border-t border-gray-200 flex items-center gap-2 text-xs text-emerald-600"><CheckCircle2 className="w-3.5 h-3.5" />Prix confirmé</div>}
                  </div>
                  {appointment.caseDescription && <div><div className="text-xs font-medium text-gray-500 mb-2">Description</div><div className="text-sm bg-blue-50 border border-blue-100 rounded-lg p-3">{appointment.caseDescription}</div></div>}
                  {canRate(appointment) && (appointment.feedback ? (
                    <div><div className="text-xs font-medium text-gray-500 mb-2">Votre avis</div><div className="flex gap-1 mb-1">{[1, 2, 3, 4, 5].map((score) => <Star key={score} className={`w-4 h-4 ${score <= appointment.rating ? 'text-amber-400 fill-amber-400' : 'text-gray-300'}`} />)}</div><div className="text-sm text-slate-950">{appointment.feedback}</div></div>
                  ) : (
                    <button onClick={() => setFeedbackAppt(appointment.id)} className="w-full h-9 rounded-lg border border-gray-200 text-sm hover:bg-gray-50 flex items-center justify-center gap-2"><MessageSquare className="w-4 h-4" />Laisser un avis</button>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ClientMap({ contactedTechs, onContact }) {
  const [selected, setSelected] = useState(null)
  const [search, setSearch] = useState('')
  const filtered = SPECIALISTES.filter((tech) => !search || tech.name.toLowerCase().includes(search.toLowerCase()) || tech.specializations.some((spec) => spec.toLowerCase().includes(search.toLowerCase()))).sort((a, b) => a.distanceKm - b.distanceKm)

  return (
    <div className="h-full flex flex-col md:flex-row overflow-hidden">
      <div className="w-full md:w-80 border-b md:border-b-0 md:border-r border-gray-200 bg-white flex flex-col">
        <div className="p-3 border-b border-gray-200 space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nom ou spécialisation…" className="w-full h-9 pl-9 pr-3 rounded-lg border border-gray-200 text-sm bg-gray-50 focus:outline-none focus:border-blue-400" />
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {['Climatisation', 'Chauffage', 'Installation', 'Réparation'].map((label) => <span key={label} className="px-2.5 py-1 rounded-full text-xs font-medium border border-gray-200 text-gray-500 bg-gray-50">{label}</span>)}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-blue-600 bg-blue-50 rounded-lg px-3 py-1.5"><Navigation className="w-3 h-3" />{filtered.length} technicien(s) disponible(s)</div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.map((tech) => {
            const isContacted = contactedTechs.includes(tech.id)
            return (
              <div key={tech.id} className={`border-b border-gray-50 transition-colors ${selected === tech.id ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                <button onClick={() => setSelected(selected === tech.id ? null : tech.id)} className="w-full text-left p-4">
                  <div className="flex items-start gap-3">
                    <div className="relative"><Avatar initials={tech.avatar} color={tech.color} />{tech.available && <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-white" />}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between"><span className="font-semibold text-sm text-slate-950">{tech.name}</span><span className="text-xs font-medium text-blue-600">{tech.distanceKm} km</span></div>
                      <div className="flex flex-wrap gap-1 mt-1">{tech.specializations.slice(0, 2).map((spec) => <span key={spec} className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px]">{spec}</span>)}</div>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap"><div className="flex items-center gap-0.5"><Star className="w-3 h-3 text-amber-400 fill-amber-400" /><span className="text-xs font-medium">{tech.rating}</span></div><Badge tone={tech.available ? 'green' : 'gray'}>{tech.available ? 'Disponible' : 'Indisponible'}</Badge>{isContacted && <Badge tone="blue">Contacté</Badge>}</div>
                    </div>
                  </div>
                </button>
                {selected === tech.id && (
                  <div className="px-4 pb-4 space-y-2">
                    <div className="flex items-center gap-1.5 text-xs text-gray-500"><Clock className="w-3.5 h-3.5" />Répond en {tech.response}</div>
                    <div className="text-xs font-medium text-blue-600">{tech.price}</div>
                    <div className="flex flex-wrap gap-1">{tech.tags.map((tag) => <span key={tag} className="px-2 py-0.5 rounded-full bg-gray-100 text-xs text-gray-600">{tag}</span>)}</div>
                    <button onClick={() => onContact(tech.id)} className="w-full h-8 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700">Contacter ce technicien</button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="flex-1 bg-gradient-to-br from-slate-100 to-blue-50 relative overflow-hidden min-h-[420px]">
        <div className="absolute inset-0" style={{ backgroundImage: 'repeating-linear-gradient(0deg,rgba(0,0,0,0.025) 0,rgba(0,0,0,0.025) 1px,transparent 1px,transparent 50px),repeating-linear-gradient(90deg,rgba(0,0,0,0.025) 0,rgba(0,0,0,0.025) 1px,transparent 1px,transparent 50px)' }} />
        <div className="absolute inset-0 opacity-15">
          <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 100">
            <line x1="28" y1="0" x2="28" y2="100" stroke="#64748b" strokeWidth="0.8" />
            <line x1="62" y1="0" x2="62" y2="100" stroke="#64748b" strokeWidth="0.5" />
            <line x1="0" y1="38" x2="100" y2="38" stroke="#64748b" strokeWidth="0.8" />
            <line x1="0" y1="68" x2="100" y2="68" stroke="#64748b" strokeWidth="0.4" />
          </svg>
        </div>

        <div className="absolute top-[38%] left-[28%]">
          <div className="relative -translate-x-1/2 -translate-y-1/2">
            <div className="w-7 h-7 rounded-full bg-blue-600 border-2 border-white shadow-lg flex items-center justify-center"><div className="w-2.5 h-2.5 rounded-full bg-white" /></div>
            <div className="absolute inset-0 rounded-full bg-blue-400 animate-ping opacity-20" />
          </div>
          <div className="absolute top-4 left-4 text-xs font-semibold bg-blue-600 text-white px-2 py-0.5 rounded-full shadow whitespace-nowrap">{initialsFromName('Vous')}</div>
        </div>

        {SPECIALISTES.map((tech) => (
          <button key={tech.id} onClick={() => setSelected(selected === tech.id ? null : tech.id)} className="absolute transform -translate-x-1/2 -translate-y-full hover:scale-110 transition-all" style={{ top: `${tech.id * 16 + 20}%`, left: `${tech.id * 14 + 18}%` }}>
            <div className="flex flex-col items-center">
              <div className={`w-10 h-10 rounded-full ${tech.color} border-2 ${selected === tech.id ? 'border-blue-600 scale-110' : 'border-white'} shadow-md flex items-center justify-center text-white text-xs font-bold relative transition-all`}>{tech.avatar}{!tech.available && <div className="absolute inset-0 rounded-full bg-black/30 flex items-center justify-center"><X className="w-4 h-4 text-white" /></div>}</div>
              <div className={`w-2.5 h-2.5 ${tech.color} rotate-45 -mt-1.5 shadow`} />
            </div>
            {tech.available && <div className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-400 border-2 border-white shadow" />}
            {contactedTechs.includes(tech.id) && <div className="absolute -top-1 -left-1 w-3.5 h-3.5 rounded-full bg-blue-400 border-2 border-white shadow" />}
          </button>
        ))}

        <div className="absolute bottom-4 right-4 bg-white/95 backdrop-blur rounded-xl p-3 shadow-sm border border-gray-100 text-xs space-y-1.5">
          <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-emerald-400 border border-white shadow-sm" /><span className="text-gray-500">Disponible</span></div>
          <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-blue-400 border border-white shadow-sm" /><span className="text-gray-500">Contacté</span></div>
          <div className="font-medium text-slate-950 pt-1 border-t border-gray-100">{SPECIALISTES.filter((tech) => tech.available).length} disponibles</div>
        </div>
      </div>
    </div>
  )
}

export default function ClientDashboard({ user, setUser, onLogout }) {
  const navigate = useNavigate()
  const [tab, setTab] = useState('chat')
  const [notifOpen, setNotifOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [notifications, setNotifications] = useState(NOTIFICATIONS_BASE)
  const [contactedTechs, setContactedTechs] = useState([1])

  const unread = notifications.filter((notification) => !notification.read).length
  const displayName = user?.full_name || user?.name || 'Client'
  const region = user?.region || 'Tunisie'
  const avatar = user?.avatar || initialsFromName(displayName)

  function handleLogout() {
    if (onLogout) {
      onLogout()
      return
    }

    setUser(null)
    localStorage.removeItem('token')
    navigate('/')
  }

  return (
    <div className="min-h-screen bg-background flex flex-col" style={{ fontFamily: 'Onest, sans-serif' }}>
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center"><Zap className="w-3.5 h-3.5 text-white" /></div>
          <span className="font-bold text-slate-950">QuoteAI</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-gray-500 bg-gray-50 px-2.5 py-1 rounded-full border border-gray-200"><Navigation className="w-3 h-3 text-blue-500" />{region}</div>
          <div className="relative">
            <button onClick={() => setNotifOpen((prev) => !prev)} className="relative w-9 h-9 rounded-xl hover:bg-gray-100 flex items-center justify-center text-gray-500 hover:text-slate-950">
              <Bell className="w-5 h-5" />
              {unread > 0 && <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">{unread}</span>}
            </button>
          </div>
          <button onClick={() => setProfileOpen(true)} className="flex items-center gap-2 hover:bg-gray-50 rounded-xl px-2 py-1 transition-colors">
            <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold">{avatar}</div>
            <span className="text-sm font-medium hidden sm:block">{displayName}</span>
          </button>
          <button onClick={handleLogout} className="text-gray-500 hover:text-slate-950"><LogOut className="w-4 h-4" /></button>
        </div>
      </header>

      <div className="bg-white border-b border-gray-200 px-6">
        <div className="flex gap-1 overflow-x-auto">
          {[
            { id: 'chat', label: 'Devis IA', icon: MessageSquare },
            { id: 'rdv', label: 'Rendez-vous', icon: Calendar },
            { id: 'map', label: 'Techniciens', icon: MapPin },
          ].map((entry) => {
            const Icon = entry.icon
            const active = tab === entry.id
            return (
              <button key={entry.id} onClick={() => setTab(entry.id)} className={`flex items-center gap-2 px-4 py-3.5 text-sm font-medium border-b-2 transition-all ${active ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-slate-950'}`}>
                <Icon className="w-4 h-4" />
                {entry.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {tab === 'chat' && <ClientChat onContact={(id) => setContactedTechs((prev) => (prev.includes(id) ? prev : [...prev, id]))} />}
        {tab === 'rdv' && <ClientRdv contactedTechs={contactedTechs} />}
        {tab === 'map' && <ClientMap contactedTechs={contactedTechs} onContact={(id) => setContactedTechs((prev) => (prev.includes(id) ? prev : [...prev, id]))} />}
      </div>

      {notifOpen && <NotificationPanel notifications={notifications} onRead={(id) => setNotifications((prev) => prev.map((notification) => (notification.id === id ? { ...notification, read: true } : notification)))} onReadAll={() => setNotifications((prev) => prev.map((notification) => ({ ...notification, read: true })))} onClose={() => setNotifOpen(false)} />}
      {profileOpen && <ProfileModal user={user} onClose={() => setProfileOpen(false)} onSave={(nextUser) => { setUser(nextUser); setProfileOpen(false) }} />}
    </div>
  )
}