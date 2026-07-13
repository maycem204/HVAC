import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, ChevronLeft, ChevronRight, Clock, DollarSign, FileText, LogOut, MapPin, Plus, RefreshCw, TrendingUp, Upload, Users, Wrench, X, Calendar, Bell, AlertCircle, CheckCircle2, Edit2, Phone, BanIcon, Search, Star, Navigation } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import api from '../lib/api'

const INITIAL_LEADS = [
  { id: 1, client: 'Nadia K.', problem: 'Climatiseur Daikin split ne refroidit plus', price: 185, confidence: 82, time: 'Il y a 12 min', status: 'new', city: 'Alger Centre', faultType: 'Climatisation' },
  { id: 2, client: 'Mourad B.', problem: 'Chaudière LG — ne s’allume plus', price: 210, confidence: 67, time: 'Il y a 34 min', status: 'new', city: 'Hydra', faultType: 'Chauffage' },
  { id: 3, client: 'Samia R.', problem: 'Fuite réfrigérant — split Mitsubishi 3 ans', price: 145, confidence: 78, time: 'Il y a 1h', status: 'accepted', city: 'Bab Ezzouar', faultType: 'Climatisation' },
  { id: 4, client: 'Omar T.', problem: 'Installation clim — appartement 90m²', price: 520, confidence: 71, time: 'Il y a 2h', status: 'done', city: 'El Biar', faultType: 'Installation' },
]

const INITIAL_TARIFS = [
  { service: 'Diagnostic + déplacement', unit: 'Forfait', price: 45, category: 'Base' },
  { service: 'Réparation réfrigérant (R32)', unit: '/ kg', price: 35, category: 'Réparation' },
  { service: 'Nettoyage clim split', unit: '/ unité', price: 60, category: 'Maintenance' },
  { service: 'Installation split 9000 BTU', unit: 'Pose incluse', price: 150, category: 'Installation' },
  { service: 'Installation split 12000 BTU', unit: 'Pose incluse', price: 180, category: 'Installation' },
  { service: 'Révision annuelle', unit: '/ appareil', price: 80, category: 'Maintenance' },
  { service: 'Urgence week-end (+50%)', unit: 'Supplément', price: 22, category: 'Urgence' },
]

const INITIAL_APPOINTMENTS = [
  { id: 1, client: 'Nadia K.', date: '2026-06-24', time: '09:00', service: 'Diagnostic clim Daikin', region: 'Alger', issue: 'Panne du compresseur', status: 'confirmed' },
  { id: 2, client: 'Samia R.', date: '2026-06-25', time: '11:30', service: 'Réparation réfrigérant', region: 'Kouba', issue: 'Fuite sur conduite extérieure', status: 'confirmed' },
]

const DAY_NAMES = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

function initialsFromName(name) {
  return String(name || 'T')
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

function Badge({ tone = 'gray', children }) {
  const tones = {
    gray: 'bg-gray-100 text-gray-600 border-gray-200',
    green: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    blue: 'bg-blue-50 text-blue-700 border-blue-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
    red: 'bg-red-50 text-red-700 border-red-100',
  }

  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${tones[tone]}`}>{children}</span>
}

function ConfidenceBar({ value }) {
  const tone = value >= 75 ? 'bg-emerald-500' : value >= 45 ? 'bg-amber-500' : 'bg-red-500'
  const label = value >= 75 ? 'Élevée' : value >= 45 ? 'Moyenne' : 'Faible'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className={`h-full ${tone} rounded-full`} style={{ width: `${value}%` }} /></div>
      <span className="text-xs font-medium text-gray-500 w-12">{label}</span>
    </div>
  )
}

function SidebarCard({ title, icon: Icon, children, description }) {
  return (
    <Card className="shadow-sm border-gray-100">
      <CardHeader>
        <CardTitle className="text-slate-950 text-xl flex items-center gap-2"><div className="w-8 h-8 rounded-lg bg-cyan-50 flex items-center justify-center"><Icon className="w-4 h-4 text-cyan-600" /></div>{title}</CardTitle>
        {description && <CardDescription className="text-gray-500">{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

export default function TechnicianDashboard({ user, setUser, onLogout }) {
  const navigate = useNavigate()
  const [tab, setTab] = useState('leads')
  const [notifications, setNotifications] = useState([])
  const [appointments, setAppointments] = useState(INITIAL_APPOINTMENTS)
  const [leads, setLeads] = useState(INITIAL_LEADS)
  const [tarifs, setTarifs] = useState(INITIAL_TARIFS)
  const [editing, setEditing] = useState(null)
  const [editVal, setEditVal] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [newTarif, setNewTarif] = useState({ service: '', unit: '', price: '', category: 'Base' })
  const [uploadedFile, setUploadedFile] = useState(null)
  const [uploadStatus, setUploadStatus] = useState('idle')
  const [selectedDay, setSelectedDay] = useState(26)
  const [showPriceModal, setShowPriceModal] = useState(false)
  const [selectedAppt, setSelectedAppt] = useState(null)
  const [actualPrice, setActualPrice] = useState('')
  const [caseDesc, setCaseDesc] = useState('')
  const [priceSaved, setPriceSaved] = useState(false)
  const [showBlockModal, setShowBlockModal] = useState(false)
  const [blockedSlots, setBlockedSlots] = useState([
    { id: 1, type: 'daily', startTime: '20:00', endTime: '08:00', label: 'Nuit — non disponible' },
    { id: 2, type: 'weekly', weekDays: [5, 6], startTime: '00:00', endTime: '23:59', label: 'Week-end' },
  ])

  useEffect(() => {
    const fetchTarifs = async () => {
      try {
        const { data } = await api.get('/tarifs')
        if (Array.isArray(data) && data.length > 0) {
          setTarifs(data.map((item) => ({
            id: item.id,
            service: item.service,
            unit: item.unit || '',
            price: Number(item.price),
            category: item.category || 'Base',
          })))
        }
      } catch {
        // fallback data stays visible while the technician has no saved tariffs
      }
    }

    fetchTarifs()
  }, [])

  const unread = notifications.filter((notification) => !notification.read).length
  const displayName = user?.full_name || user?.name || 'Technicien'
  const region = user?.region || 'Alger'
  const avatar = user?.avatar || initialsFromName(displayName)
  const categories = ['Base', 'Réparation', 'Maintenance', 'Installation', 'Urgence']
  const grouped = useMemo(() => categories.reduce((acc, category) => {
    acc[category] = tarifs.filter((item) => item.category === category)
    return acc
  }, {}), [tarifs])

  function handleLogout() {
    if (onLogout) {
      onLogout()
      return
    }

    setUser(null)
    localStorage.removeItem('token')
    navigate('/')
  }

  function saveEdit(index) {
    const nextPrice = parseFloat(editVal)
    if (!Number.isNaN(nextPrice)) {
      setTarifs((prev) => prev.map((item, idx) => (idx === index ? { ...item, price: nextPrice } : item)))
    }
    setEditing(null)
  }

  function addTarif() {
    if (!newTarif.service || !newTarif.price) return
    setTarifs((prev) => [...prev, { ...newTarif, price: parseFloat(newTarif.price) || 0 }])
    setNewTarif({ service: '', unit: '', price: '', category: 'Base' })
    setShowAdd(false)
  }

  function savePrice() {
    if (!selectedAppt || !actualPrice) return
    setAppointments((prev) => prev.map((appointment) => (appointment.id === selectedAppt.id ? { ...appointment, status: 'completed', actualPrice: parseFloat(actualPrice), caseDescription: caseDesc } : appointment)))
    setPriceSaved(true)
    setTimeout(() => {
      setShowPriceModal(false)
      setActualPrice('')
      setCaseDesc('')
      setPriceSaved(false)
    }, 1200)
  }

  function declineLead(id) {
    setLeads((prev) => prev.map((lead) => (lead.id === id ? { ...lead, status: 'done' } : lead)))
  }

  const dayApts = appointments.filter((appointment) => appointment.date === `2026-06-${String(selectedDay).padStart(2, '0')}`)

  const startOfWeek = (selectedDay - 1) % 7
  const isBlockedDay = blockedSlots.some((slot) => slot.type === 'weekly' && slot.weekDays?.includes(startOfWeek))

  return (
    <div className="min-h-screen bg-background flex flex-col" style={{ fontFamily: 'Onest, sans-serif' }}>
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-emerald-600 flex items-center justify-center"><Wrench className="w-3.5 h-3.5 text-white" /></div>
          <span className="font-bold text-slate-950">QuoteAI Pro</span>
          <Badge tone="green">Technicien</Badge>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-5 mr-2 text-center">
            <div><div className="text-xs text-gray-500">Ce mois</div><div className="text-sm font-bold text-slate-950">12 jobs</div></div>
            <div><div className="text-xs text-gray-500">Revenus</div><div className="text-sm font-bold text-emerald-600">4 280 €</div></div>
            <div><div className="text-xs text-gray-500">Note moy.</div><div className="text-sm font-bold text-amber-500">4.9 ★</div></div>
          </div>
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-gray-500 bg-gray-50 px-2.5 py-1 rounded-full border border-gray-200"><Navigation className="w-3 h-3 text-emerald-500" />{region}</div>
          <div className="relative"><button onClick={() => setNotifications([])} className="relative w-9 h-9 rounded-xl hover:bg-gray-100 flex items-center justify-center text-gray-500 hover:text-slate-950"><Bell className="w-5 h-5" />{unread > 0 && <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">{unread}</span>}</button></div>
          <button className="flex items-center gap-2 hover:bg-gray-50 rounded-xl px-2 py-1 transition-colors"><div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-white text-xs font-bold">{avatar}</div><span className="text-sm font-medium hidden sm:block text-slate-950">{displayName}</span></button>
          <button onClick={handleLogout} className="text-gray-500 hover:text-slate-950"><LogOut className="w-4 h-4" /></button>
        </div>
      </header>

      <div className="bg-white border-b border-gray-200 px-6">
        <div className="flex gap-1 overflow-x-auto">
          {[
            { id: 'leads', label: 'Leads', icon: Users, badge: 2 },
            { id: 'tarifs', label: 'Tarification', icon: DollarSign },
            { id: 'agenda', label: 'Agenda', icon: Calendar },
          ].map((entry) => {
            const Icon = entry.icon
            const active = tab === entry.id
            return (
              <button key={entry.id} onClick={() => setTab(entry.id)} className={`flex items-center gap-2 px-4 py-3.5 text-sm font-medium border-b-2 transition-all ${active ? 'border-emerald-500 text-emerald-700' : 'border-transparent text-gray-500 hover:text-slate-950'}`}>
                <Icon className="w-4 h-4" />
                {entry.label}
                {entry.badge ? <span className="w-4 h-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">{entry.badge}</span> : null}
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="grid lg:grid-cols-3 gap-6 max-w-7xl mx-auto">
          <div className="space-y-6">
            <SidebarCard title="Mon Profil" icon={MapPin}>
              <div className="flex items-center gap-3 text-gray-600">
                <div className="w-10 h-10 rounded-lg bg-cyan-50 flex items-center justify-center"><MapPin className="w-5 h-5 text-cyan-600" /></div>
                <span className="font-medium text-slate-950">{region}</span>
              </div>
              <div className="text-sm text-gray-500 mt-4">{user?.email}</div>
            </SidebarCard>

            <SidebarCard title="Tarifs PDF" icon={FileText} description="Uploadez votre grille tarifaire (optionnel)">
              <div className="space-y-4">
                <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center hover:border-cyan-400 transition-colors bg-gray-50/60">
                  <div className="w-12 h-12 rounded-full bg-cyan-50 flex items-center justify-center mx-auto mb-3"><Upload className="w-6 h-6 text-cyan-600" /></div>
                  <p className="text-sm text-gray-600 mb-2">{uploadedFile ? uploadedFile.name : 'Glissez votre PDF ici'}</p>
                  <Input type="file" accept=".pdf" onChange={(e) => setUploadedFile(e.target.files?.[0] || null)} className="hidden" id="pdf-upload" />
                  <label htmlFor="pdf-upload" className="cursor-pointer text-sm text-cyan-700 hover:text-cyan-600 font-medium">Parcourir les fichiers</label>
                </div>
                <Button type="button" disabled={!uploadedFile} className="w-full btn-animated bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-semibold rounded-full px-6 py-3 shadow-lg">Uploader le PDF</Button>
              </div>
            </SidebarCard>

            <SidebarCard title="Mes Tarifs" icon={DollarSign}>
              <div className="space-y-3">
                {tarifs.length === 0 ? <div className="text-center py-6 text-gray-500"><p className="text-sm">Aucun tarif configuré</p></div> : tarifs.map((item, index) => (
                  <div key={`${item.service}-${index}`} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <span className="text-gray-600 text-sm">{item.service}</span>
                    <span className="text-slate-950 font-semibold">{item.price} €</span>
                  </div>
                ))}
              </div>
            </SidebarCard>
          </div>

          <div className="lg:col-span-2">
            {tab === 'leads' && (
              <Card className="shadow-sm border-gray-100">
                <CardHeader>
                  <CardTitle className="text-slate-950 text-xl flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 flex items-center justify-center"><Users className="w-5 h-5 text-white" /></div>Leads entrants</CardTitle>
                  <CardDescription className="text-gray-500">Si vous déclinez, le moteur IA cherche automatiquement un autre technicien.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {leads.map((lead) => (
                      <div key={lead.id} className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
                        <div className="flex items-start gap-4">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-sm font-bold shrink-0">{lead.client[0]}</div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="font-semibold text-sm text-slate-950">{lead.client}</div>
                                <div className="flex items-center gap-2 mt-0.5 flex-wrap"><span className="text-xs text-gray-500 flex items-center gap-1"><MapPin className="w-3 h-3" />{lead.city}</span><span className="px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded text-[10px] font-medium">{lead.faultType}</span></div>
                              </div>
                              <div className="text-right"><div className="text-lg font-black text-slate-950">{lead.price} €</div><div className="text-xs text-gray-500">{lead.time}</div></div>
                            </div>
                            <div className="mt-2 text-sm text-slate-950">{lead.problem}</div>
                            <div className="mt-2"><div className="text-xs text-gray-500 mb-1">Confiance IA</div><ConfidenceBar value={lead.confidence} /></div>
                            <div className="flex items-center gap-2 mt-3 flex-wrap">
                              {lead.status === 'new' && <><button onClick={() => setLeads((prev) => prev.map((item) => (item.id === lead.id ? { ...item, status: 'accepted' } : item)))} className="h-8 px-4 rounded-lg bg-emerald-500 text-white text-xs font-semibold hover:bg-emerald-600 flex items-center gap-1.5"><Check className="w-3.5 h-3.5" />Accepter</button><button onClick={() => declineLead(lead.id)} className="h-8 px-4 rounded-lg border border-red-200 text-xs text-red-500 hover:bg-red-50 flex items-center gap-1.5"><X className="w-3.5 h-3.5" />Décliner</button></>}
                              {lead.status === 'accepted' && <Badge tone="green">Accepté</Badge>}
                              {lead.status === 'done' && <Badge tone="gray">Clôturé</Badge>}
                              <Badge tone={lead.status === 'new' ? 'amber' : 'gray'}>{lead.status === 'new' ? 'Nouveau' : lead.status === 'accepted' ? 'En cours' : 'Clôturé'}</Badge>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {tab === 'tarifs' && (
              <Card className="shadow-sm border-gray-100">
                <CardHeader>
                  <CardTitle className="text-slate-950 text-xl flex items-center gap-2"><div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center"><DollarSign className="w-4 h-4 text-emerald-600" /></div>Ma grille tarifaire</CardTitle>
                  <CardDescription className="text-gray-500">Importez vos tarifs depuis un fichier ou gérez-les manuellement.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="mb-6 flex items-center justify-between gap-3 flex-wrap">
                    <button onClick={() => setShowAdd((prev) => !prev)} className="flex items-center gap-2 h-9 px-4 rounded-lg bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600"><Plus className="w-4 h-4" />Ajouter</button>
                  </div>
                  {showAdd && (
                    <div className="bg-white rounded-xl border border-emerald-200 p-5 mb-5 shadow-sm">
                      <div className="text-sm font-semibold mb-4 text-slate-950">Nouveau service</div>
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        <div className="col-span-2"><label className="block text-xs text-gray-500 mb-1">Intitulé</label><input placeholder="Ex : Nettoyage filtre" value={newTarif.service} onChange={(e) => setNewTarif((prev) => ({ ...prev, service: e.target.value }))} className="w-full h-9 px-3 rounded-lg border border-gray-200 text-sm bg-gray-50 focus:outline-none focus:border-emerald-400" /></div>
                        <div><label className="block text-xs text-gray-500 mb-1">Unité</label><input placeholder="/ appareil" value={newTarif.unit} onChange={(e) => setNewTarif((prev) => ({ ...prev, unit: e.target.value }))} className="w-full h-9 px-3 rounded-lg border border-gray-200 text-sm bg-gray-50 focus:outline-none focus:border-emerald-400" /></div>
                        <div><label className="block text-xs text-gray-500 mb-1">Prix (€)</label><input type="number" placeholder="0" value={newTarif.price} onChange={(e) => setNewTarif((prev) => ({ ...prev, price: e.target.value }))} className="w-full h-9 px-3 rounded-lg border border-gray-200 text-sm bg-gray-50 focus:outline-none focus:border-emerald-400" /></div>
                        <div className="col-span-2"><label className="block text-xs text-gray-500 mb-1">Catégorie</label><select value={newTarif.category} onChange={(e) => setNewTarif((prev) => ({ ...prev, category: e.target.value }))} className="w-full h-9 px-3 rounded-lg border border-gray-200 text-sm bg-gray-50 focus:outline-none focus:border-emerald-400">{categories.map((category) => <option key={category}>{category}</option>)}</select></div>
                      </div>
                      <div className="flex gap-2"><button onClick={addTarif} className="h-8 px-4 rounded-lg bg-emerald-500 text-white text-xs font-semibold hover:bg-emerald-600">Ajouter</button><button onClick={() => setShowAdd(false)} className="h-8 px-4 rounded-lg border border-gray-200 text-xs text-gray-500">Annuler</button></div>
                    </div>
                  )}

                  <div className="space-y-5">
                    {categories.map((category) => {
                      const items = grouped[category]
                      if (!items?.length) return null
                      return (
                        <div key={category}>
                          <div className="flex items-center gap-2 mb-2"><span className="text-xs font-bold text-gray-500 uppercase tracking-wider">{category}</span><div className="flex-1 h-px bg-gray-100" /></div>
                          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
                            {items.map((item, index) => {
                              const itemIndex = tarifs.indexOf(item)
                              return (
                                <div key={`${item.service}-${index}`} className={`flex items-center px-4 py-3.5 ${index < items.length - 1 ? 'border-b border-gray-50' : ''} hover:bg-gray-50 group`}>
                                  <div className="flex-1"><div className="text-sm font-medium text-slate-950">{item.service}</div><div className="text-xs text-gray-500">{item.unit}</div></div>
                                  {editing === itemIndex ? <div className="flex items-center gap-2"><input type="number" value={editVal} onChange={(e) => setEditVal(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveEdit(itemIndex)} autoFocus className="w-24 h-8 px-2 rounded-lg border border-emerald-300 text-sm text-right focus:outline-none" /><span className="text-sm text-gray-500">€</span><button onClick={() => saveEdit(itemIndex)} className="w-7 h-7 rounded-lg bg-emerald-500 text-white flex items-center justify-center"><Check className="w-3.5 h-3.5" /></button><button onClick={() => setEditing(null)} className="w-7 h-7 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500"><X className="w-3.5 h-3.5" /></button></div> : <div className="flex items-center gap-3"><span className="text-base font-bold text-slate-950">{item.price} €</span><button onClick={() => { setEditing(itemIndex); setEditVal(String(item.price)) }} className="opacity-0 group-hover:opacity-100 text-xs text-blue-600 hover:underline transition-opacity">Modifier</button></div>}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <div className="mt-6 p-4 bg-emerald-50 border border-emerald-100 rounded-xl text-sm text-emerald-800"><strong>Synchronisation automatique.</strong> Vos tarifs alimentent le moteur IA pour les estimations clients.</div>
                </CardContent>
              </Card>
            )}

            {tab === 'agenda' && (
              <Card className="shadow-sm border-gray-100">
                <CardHeader>
                  <CardTitle className="text-slate-950 text-xl flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 flex items-center justify-center"><Calendar className="w-5 h-5 text-white" /></div>Mes Rendez-vous</CardTitle>
                  <CardDescription className="text-gray-500">Les rendez-vous confirmés par les clients</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid md:grid-cols-[380px_1fr] gap-6">
                    <div className="space-y-4">
                      <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                        <div className="flex items-center justify-between mb-4"><h3 className="font-bold text-slate-950">Juin 2026</h3><div className="flex gap-1"><button className="w-7 h-7 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500"><ChevronLeft className="w-4 h-4" /></button><button className="w-7 h-7 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500"><ChevronRight className="w-4 h-4" /></button></div></div>
                        <div className="grid grid-cols-7 gap-1 mb-1">{DAY_NAMES.map((day) => <div key={day} className="text-center text-xs font-medium text-gray-500 py-1">{day}</div>)}</div>
                        <div className="grid grid-cols-7 gap-1">{Array.from({ length: 30 }, (_, index) => index + 1).map((day) => {
                          const hasAppointment = appointments.some((appointment) => appointment.date === `2026-06-${String(day).padStart(2, '0')}`)
                          const selected = selectedDay === day
                          const today = day === 26
                          const blocked = blockedSlots.some((slot) => slot.type === 'weekly' && slot.weekDays?.includes((day - 1) % 7))
                          return <button key={day} onClick={() => !blocked && setSelectedDay(day)} className={`aspect-square rounded-lg border text-xs font-medium transition-all relative ${blocked ? 'bg-gray-100 border-gray-300 text-gray-400' : hasAppointment ? 'bg-blue-100 border-blue-400 text-blue-800' : 'bg-white border-gray-200 text-slate-950 hover:border-blue-300'} ${selected ? 'ring-2 ring-blue-600 ring-offset-1' : ''} ${today ? 'font-black' : ''}`}>{day}{hasAppointment && !blocked && <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-current opacity-70" />}</button>
                        })}</div>
                        <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">
                          <div className="flex items-center gap-2 text-xs"><div className="w-4 h-4 rounded border bg-emerald-100 border-emerald-400" /><span className="text-gray-500">Terminé</span></div>
                          <div className="flex items-center gap-2 text-xs"><div className="w-4 h-4 rounded border bg-blue-100 border-blue-400" /><span className="text-gray-500">Prévu</span></div>
                          <div className="flex items-center gap-2 text-xs"><div className="w-4 h-4 rounded border bg-gray-100 border-gray-300" /><span className="text-gray-500">Indisponible</span></div>
                        </div>
                      </div>

                      <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                        <div className="flex items-center justify-between mb-3"><div className="text-sm font-semibold text-slate-950">Indisponibilités</div><button onClick={() => setShowBlockModal(true)} className="flex items-center gap-1.5 h-7 px-3 rounded-lg bg-gray-100 text-xs hover:bg-gray-200"><Plus className="w-3 h-3" />Ajouter</button></div>
                        <div className="space-y-2">
                          {blockedSlots.map((slot) => <div key={slot.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-gray-50 border border-gray-100"><BanIcon className="w-4 h-4 text-gray-400 shrink-0" /><div className="flex-1 min-w-0"><div className="text-xs font-medium truncate text-slate-950">{slot.label}</div><div className="text-xs text-gray-500">{slot.type === 'daily' ? `Tous les jours ${slot.startTime}–${slot.endTime}` : slot.type === 'weekly' ? `Week-end` : slot.date}</div></div><button onClick={() => setBlockedSlots((prev) => prev.filter((item) => item.id !== slot.id))} className="text-gray-500 hover:text-red-500"><X className="w-3.5 h-3.5" /></button></div>)}
                        </div>
                      </div>
                    </div>

                    <div>
                      <div className="mb-4"><h2 className="text-xl font-bold text-slate-950">{new Date(2026, 5, selectedDay).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</h2><p className="text-sm text-gray-500">{dayApts.length} rendez-vous{isBlockedDay && ' · Jour indisponible'}</p></div>
                      {isBlockedDay && <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-4 flex items-center gap-3 text-sm text-gray-600"><BanIcon className="w-5 h-5 text-gray-400 shrink-0" />Ce jour est marqué comme indisponible — aucun lead reçu.</div>}
                      {dayApts.length === 0 && !isBlockedDay ? <div className="bg-white rounded-xl border border-gray-100 p-12 text-center shadow-sm"><Calendar className="w-12 h-12 text-gray-400 mx-auto mb-3 opacity-40" /><div className="text-sm text-gray-500">Aucun rendez-vous ce jour</div></div> : <div className="space-y-3">{dayApts.map((appointment) => {
                        const statusTone = appointment.status === 'confirmed' ? 'blue' : 'green'
                        return (
                          <div key={appointment.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex gap-4">
                            <div className="text-center w-16 shrink-0">
                              <div className="text-sm font-bold text-slate-950">{appointment.time}</div>
                              <div className="text-xs text-gray-500">{appointment.duration || '2h'}</div>
                              <div className={`w-2.5 h-2.5 rounded-full mx-auto mt-2 ${statusTone === 'blue' ? 'bg-blue-500' : 'bg-emerald-500'}`} />
                            </div>
                            <div className="w-px bg-gray-100 self-stretch" />
                            <div className="flex-1">
                              <div className="flex items-start justify-between"><div><div className="font-semibold text-sm text-slate-950">{appointment.service}</div><div className="text-sm mt-0.5 text-gray-500">{appointment.client}</div></div><Badge tone={statusTone === 'blue' ? 'blue' : 'green'}>{statusTone === 'blue' ? 'Confirmé' : 'Terminé'}</Badge></div>
                              <div className="flex items-center gap-1.5 text-xs text-gray-500 mt-2"><MapPin className="w-3 h-3" />{appointment.region}</div>
                              <div className="mt-3 pt-3 border-t border-gray-100">
                                <div className="text-sm mb-2"><span className="text-gray-500">Estimé : </span><span className="font-bold text-slate-950">{appointment.estimatedPrice} €</span></div>
                                <button onClick={() => { setSelectedAppt(appointment); setShowPriceModal(true) }} className="text-xs text-emerald-600 hover:underline flex items-center gap-1"><Edit2 className="w-3 h-3" />Saisir le prix réel après intervention</button>
                              </div>
                              <div className="flex gap-2 mt-3"><button className="h-7 px-3 rounded-lg bg-gray-100 text-xs hover:bg-gray-200 flex items-center gap-1.5"><Phone className="w-3 h-3" />Appeler</button><button className="h-7 px-3 rounded-lg bg-gray-100 text-xs hover:bg-gray-200 flex items-center gap-1.5"><MapPin className="w-3 h-3" />Itinéraire</button></div>
                            </div>
                          </div>
                        )
                      })}</div>}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      {showPriceModal && selectedAppt && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl">
            <h3 className="text-lg font-bold mb-4 text-slate-950">Finaliser l’intervention</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 bg-gray-50 rounded-xl p-3 text-sm"><div><div className="text-xs text-gray-500">Client</div><div className="font-medium text-slate-950">{selectedAppt.client}</div></div><div><div className="text-xs text-gray-500">Prix estimé</div><div className="font-medium text-slate-950">{selectedAppt.estimatedPrice} €</div></div></div>
              <div><label className="block text-xs font-medium mb-2">Prix réel facturé <span className="text-red-500">*</span></label><input type="number" placeholder="0" value={actualPrice} onChange={(e) => setActualPrice(e.target.value)} className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm bg-gray-50 focus:outline-none focus:border-emerald-400" /></div>
              <div><label className="block text-xs font-medium mb-2">Description du cas <span className="text-gray-500 font-normal">(enrichit la base IA)</span></label><textarea placeholder="Ex : Compresseur HS remplacé, recharge R32…" value={caseDesc} onChange={(e) => setCaseDesc(e.target.value)} className="w-full h-24 px-3 py-2 rounded-lg border border-gray-200 text-sm bg-gray-50 focus:outline-none focus:border-emerald-400 resize-none" /><div className="text-xs text-gray-500 mt-1 flex items-center gap-1"><TrendingUp className="w-3 h-3" />Améliore les futures estimations IA</div></div>
              {priceSaved ? <div className="flex items-center justify-center gap-2 h-10 text-emerald-600 font-medium text-sm"><CheckCircle2 className="w-5 h-5" />Enregistré !</div> : <div className="flex gap-2"><button onClick={savePrice} disabled={!actualPrice} className="flex-1 h-10 rounded-lg bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600 disabled:opacity-40">Enregistrer</button><button onClick={() => setShowPriceModal(false)} className="h-10 px-4 rounded-lg border border-gray-200 text-sm text-gray-500">Annuler</button></div>}
            </div>
          </div>
        </div>
      )}

      {showBlockModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl">
            <div className="flex items-center justify-between mb-5"><h3 className="text-lg font-bold text-slate-950">Bloquer un créneau</h3><button onClick={() => setShowBlockModal(false)} className="text-gray-500 hover:text-slate-950"><X className="w-5 h-5" /></button></div>
            <div className="space-y-4 text-sm text-gray-600">
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">Le calendrier du prototype peut être ajouté ici si tu veux le rendu complet.</div>
              <button onClick={() => setShowBlockModal(false)} className="w-full h-10 rounded-xl bg-emerald-500 text-white text-sm font-semibold">Fermer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
