import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { User, Wrench, MapPin, Zap, ChevronRight, ArrowRight } from 'lucide-react'
import api from '../lib/api'

export default function HomePage({ setUser, setUserRole }) {
  const navigate = useNavigate()
  const [selectedRole, setSelectedRole] = useState(null)
  const [isLogin, setIsLogin] = useState(true)
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    password: '',
    region: ''
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showMap, setShowMap] = useState(false)

  const handleDirectAccess = (role) => {
    const demoUser = {
      id: 0,
      full_name: role === 'client' ? 'Client démo' : 'Technicien démo',
      email: role === 'client' ? 'demo.client@local' : 'demo.technician@local',
      role,
      region: 'Ariana',
      demo: true,
    }

    setUser(demoUser)
    setUserRole(role)
    navigate(role === 'client' ? '/client' : '/technician')
  }

  const getErrorMessage = (payload) => {
    if (!payload) return 'Erreur inconnue'
    if (typeof payload === 'string') return payload
    if (Array.isArray(payload)) {
      return payload
        .map((entry) => {
          if (!entry) return ''
          if (typeof entry === 'string') return entry
          if (entry.msg) return entry.msg
          if (entry.message) return entry.message
          return JSON.stringify(entry)
        })
        .filter(Boolean)
        .join(', ')
    }
    if (typeof payload === 'object') {
      return payload.detail || payload.message || payload.error || JSON.stringify(payload)
    }
    return String(payload)
  }

  const handleRegionSelect = (city) => {
    setFormData({ ...formData, region: city })
    setShowMap(false)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const endpoint = isLogin ? '/login' : '/register'
      const payload = {
        email: formData.email.trim(),
        password: formData.password,
        role: selectedRole,
        ...(isLogin
          ? {}
          : {
              name: formData.fullName.trim(),
              city: formData.region.trim(),
            }),
      }

      const { data } = await api.post(endpoint, payload)
      console.log('Response data:', data)

      localStorage.setItem('token', data.token)
      
      // Extract user data from response
      const userData = data.user || {
        id: data.id,
        full_name: data.full_name || data.name || formData.fullName,
        name: data.name || data.full_name || formData.fullName,
        email: data.email || formData.email,
        role: data.role || selectedRole,
        region: data.region || data.city || formData.region,
        city: data.city || data.region || formData.region
      }
      
      setUser(userData)
      setUserRole(userData.role || selectedRole)
      
      if ((userData.role || selectedRole) === 'client') {
        navigate('/client')
      } else {
        navigate('/technician')
      }
    } catch (err) {
      console.error('Error:', err)
      setError(getErrorMessage(err.response?.data ?? err.message ?? err))
    } finally {
      setLoading(false)
    }
  }

  if (!selectedRole) {
    return (
      <div className="page-enter min-h-screen relative overflow-hidden bg-gradient-to-br from-slate-50 via-white to-cyan-50/60 flex flex-col">
        <div className="particles">
          {[...Array(14)].map((_, index) => (
            <div
              key={index}
              className="particle"
              style={{
                left: `${6 + Math.random() * 88}%`,
                top: `${10 + Math.random() * 80}%`,
                animationDelay: `${Math.random() * 6}s`,
                animationDuration: `${10 + Math.random() * 8}s`,
              }}
            />
          ))}
        </div>

        <nav className="relative z-10 px-4 md:px-8 py-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-500 flex items-center justify-center shadow-lg glow-cyan">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="block font-extrabold text-lg md:text-xl text-slate-900 tracking-tight">QuoteAI</span>
              <span className="block text-xs text-slate-500 -mt-0.5">Devis HVAC instantané</span>
            </div>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => handleDirectAccess('client')}
              className="h-10 px-4 text-sm font-semibold text-slate-700 surface rounded-full hover:text-slate-900 btn-animated"
            >
              Accès client
            </button>
            <button 
              onClick={() => handleDirectAccess('technician')}
              className="h-10 px-4 text-sm font-semibold text-white rounded-full bg-gradient-to-r from-cyan-600 to-blue-600 shadow-lg btn-animated"
            >
              Accès technicien
            </button>
          </div>
        </nav>

        <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 md:px-6 py-12 text-center">
          <div className="inline-flex items-center gap-2 mb-6 px-4 py-2 rounded-full surface text-xs font-semibold text-cyan-700 shadow-sm border border-white/80">
            <span className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse" />
            Devis HVAC instantané par intelligence artificielle
          </div>

          <h1 className="text-5xl md:text-7xl font-black text-slate-950 mb-6 leading-[0.95] max-w-4xl tracking-tight">
            Votre devis HVAC
            <span className="block text-transparent bg-clip-text bg-gradient-to-r from-cyan-600 via-blue-600 to-emerald-500">
              en quelques secondes.
            </span>
          </h1>

          <p className="text-lg md:text-xl text-slate-600 max-w-2xl mb-12 leading-relaxed">
            Décrivez votre problème, obtenez une estimation de prix et trouvez un technicien qualifié près de chez vous.
          </p>

          <div className="grid md:grid-cols-2 gap-5 max-w-4xl w-full">
            <button
              onClick={() => handleDirectAccess('client')}
              className="group text-left surface rounded-[1.75rem] p-8 border border-white/80 shadow-xl btn-animated interactive-card"
            >
              <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center mb-5 group-hover:bg-blue-100 transition-colors floating">
                <User className="w-6 h-6 text-blue-600" />
              </div>
              <div className="text-2xl font-extrabold text-slate-950 mb-1 tracking-tight">Je suis un client</div>
              <div className="text-sm text-slate-600 mb-5 leading-relaxed">Obtenez un devis, trouvez un technicien et réservez en un seul geste.</div>
              <div className="flex items-center gap-1.5 text-sm text-blue-600 font-semibold">
                Accéder <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </button>
            <button
              onClick={() => handleDirectAccess('technician')}
              className="group text-left surface rounded-[1.75rem] p-8 border border-white/80 shadow-xl btn-animated interactive-card"
            >
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center mb-5 group-hover:bg-emerald-100 transition-colors floating">
                <Wrench className="w-6 h-6 text-emerald-600" />
              </div>
              <div className="text-2xl font-extrabold text-slate-950 mb-1 tracking-tight">Je suis technicien</div>
              <div className="text-sm text-slate-600 mb-5 leading-relaxed">Gérez vos leads, tarifs et agenda dans un espace clair.</div>
              <div className="flex items-center gap-1.5 text-sm text-emerald-600 font-semibold">
                Accéder <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </button>
          </div>
        </div>
      </div>
    )
  }

  const isClient = selectedRole === 'client'
  const colorClass = isClient ? 'blue' : 'emerald'

  return (
    <div className="page-enter min-h-screen relative overflow-hidden bg-gradient-to-br from-slate-50 via-white to-cyan-50/60 flex items-center justify-center p-4">
      <div className="particles">
        {[...Array(10)].map((_, index) => (
          <div
            key={index}
            className="particle"
            style={{
              left: `${8 + Math.random() * 84}%`,
              top: `${10 + Math.random() * 78}%`,
              animationDelay: `${Math.random() * 5}s`,
              animationDuration: `${10 + Math.random() * 8}s`,
            }}
          />
        ))}
      </div>

      <div className="relative z-10 w-full max-w-lg">
        <button 
          onClick={() => setSelectedRole(null)}
          className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 mb-6"
        >
          <ChevronRight className="w-4 h-4 rotate-180" />
          Retour
        </button>
        <div className="glass-card rounded-[1.75rem] p-8 md:p-10 border border-white/80 shadow-xl">
          <div className="flex items-center gap-3 mb-8">
            <div className={`w-10 h-10 rounded-2xl ${isClient ? 'bg-blue-50' : 'bg-emerald-50'} flex items-center justify-center floating`}>
              {isClient ? (
                <User className="w-5 h-5 text-blue-600" />
              ) : (
                <Wrench className="w-5 h-5 text-emerald-600" />
              )}
            </div>
            <div>
              <div className="font-extrabold text-slate-950 text-sm tracking-tight">
                {isClient ? 'Espace client' : 'Espace technicien'}
              </div>
              <div className="text-xs text-slate-600">
                {isLogin ? 'Connexion sécurisée' : 'Créer un compte'}
              </div>
            </div>
          </div>

          <div className="mb-5 flex rounded-full bg-slate-100 p-1 border border-slate-200">
            <button
              type="button"
              onClick={() => setIsLogin(true)}
              className={`flex-1 h-10 rounded-full text-sm font-semibold transition-all ${isLogin ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500'}`}
            >
              Connexion
            </button>
            <button
              type="button"
              onClick={() => setIsLogin(false)}
              className={`flex-1 h-10 rounded-full text-sm font-semibold transition-all ${!isLogin ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500'}`}
            >
              Inscription
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div>
                <label className="block text-xs font-medium mb-1.5 text-slate-700">Nom complet</label>
                <input
                  type="text"
                  placeholder="Votre nom"
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  required
                  className="w-full h-11 px-4 rounded-2xl border border-slate-200 bg-white/80 text-sm focus:outline-none focus:border-blue-400 transition-all"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium mb-1.5 text-slate-700">Email</label>
              <input
                type="email"
                placeholder="votre@email.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
                  className="w-full h-11 px-4 rounded-2xl border border-slate-200 bg-white/80 text-sm focus:outline-none focus:border-blue-400 transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1.5 text-slate-700">Mot de passe</label>
              <input
                type="password"
                placeholder="••••••••"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required
                minLength={6}
                  className="w-full h-11 px-4 rounded-2xl border border-slate-200 bg-white/80 text-sm focus:outline-none focus:border-blue-400 transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1.5 text-slate-700">Région</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Tunis, Sfax, Paris..."
                  value={formData.region}
                  onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                  required
                  className="flex-1 h-11 px-4 rounded-2xl border border-slate-200 bg-white/80 text-sm focus:outline-none focus:border-blue-400 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowMap(!showMap)}
                  className="h-11 px-4 rounded-2xl bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-all btn-animated"
                >
                  <MapPin className="w-5 h-5 text-slate-600" />
                </button>
              </div>

              {showMap && (
                <div className="mt-3 p-4 surface rounded-2xl border border-white/80 shadow-sm">
                  <p className="text-sm text-slate-700 mb-3 font-semibold">Sélectionnez votre région:</p>
                  <div className="grid grid-cols-2 gap-2">
                    {['Tunis', 'Sfax', 'Sousse', 'Bizerte', 'Gabès', 'Ariana', 'Monastir', 'Nabeul'].map((city) => (
                      <button
                        key={city}
                        type="button"
                        onClick={() => handleRegionSelect(city)}
                        className="p-3 bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-300 rounded-2xl text-sm text-slate-700 transition-all btn-animated"
                      >
                        {city}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {error && (
              <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-2xl p-3">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className={`w-full h-11 rounded-2xl ${isClient ? 'bg-gradient-to-r from-cyan-600 to-blue-600' : 'bg-gradient-to-r from-emerald-600 to-cyan-600'} text-white text-sm font-semibold transition-all btn-animated shadow-lg`}
            >
              {loading ? 'Chargement...' : (isLogin ? 'Se connecter' : "Créer mon compte")}
            </button>

            <div className="mt-5 text-center text-sm text-slate-600">
              {isLogin ? (
                <>
                  Pas encore de compte ?{' '}
                  <button
                    type="button"
                    onClick={() => setIsLogin(false)}
                    className={`font-semibold text-${colorClass}-600 hover:underline`}
                  >
                    S'inscrire
                  </button>
                </>
              ) : (
                <>
                  Déjà un compte ?{' '}
                  <button
                    type="button"
                    onClick={() => setIsLogin(true)}
                    className={`font-semibold text-${colorClass}-600 hover:underline`}
                  >
                    Se connecter
                  </button>
                </>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
