import { useEffect, useRef, useState } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import api from "../lib/api";
import { disconnectRealtime } from "../lib/socket";
import type { AppUser, Role, Technician, UserLocation } from "./domain";
import { mapTechnician } from "./mappers";
import { AuthForm, Landing, LocationModal } from "./PublicViews";
import { ClientDashboard } from "./ClientDashboard";
import { TechDashboard } from "./TechnicianDashboard";

export default function App() {
  const [user, setUser] = useState<AppUser|null>(null);
  const [location, setLocation] = useState<UserLocation|null>(null);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [booting, setBooting] = useState(true);
  const [locationTracking, setLocationTracking] = useState(false);
  const [locationLocating, setLocationLocating] = useState(false);
  const [locationError, setLocationError] = useState("");
  const locationWatchRef = useRef<number|null>(null);
  const lastLocationSyncRef = useRef(0);
  const navigate = useNavigate();

  const dashboardPath = (currentUser: AppUser) => currentUser.role === "client" ? "/client/chat" : "/technicien/leads";

  // Auto-login dans la session propre à cet onglet.
  useEffect(() => {
    sessionStorage.removeItem("token");
    sessionStorage.removeItem("user");
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    api.get("/me")
      .then((res) => {
        const currentUser = res.data.user ?? res.data;
        setUser(currentUser);
        const lat = Number(currentUser.lat);
        const lng = Number(currentUser.lng);
        if (Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)) {
          setLocation({ lat, lng, city: currentUser.city || "Position du profil", district: currentUser.city || "" });
        } else if (currentUser.city || currentUser.address) {
          const query = [currentUser.address, currentUser.city].filter(Boolean).join(", ");
          api.get("/geocode/forward", { params:{ city:query } }).then(({data})=>setLocation({ lat:Number(data.lat), lng:Number(data.lng), city:currentUser.city||data.city, district:currentUser.address||data.district||currentUser.city })).catch(()=>{});
        }
      })
      .catch(() => {})
      .finally(() => setBooting(false));
  }, []);

  // Les techniciens sont utilisés par le client (recherche/chat) — chargés une fois connecté
  useEffect(() => {
    if (!user || user.role !== "client") return;
    api.get("/technicians", {
      params: location ? { lat: location.lat, lng: location.lng } : undefined,
    }).then((res) => setTechnicians(res.data.map(mapTechnician))).catch(console.error);
  }, [user?.id, user?.role, location]);

  function selectRole(r: Role){navigate(`/connexion/${r === "client" ? "client" : "technicien"}`);}
  function handleLogin(u: AppUser){setUser(u);navigate("/localisation", { replace:true });}
  async function handleLocation(loc: UserLocation | null){
    setLocation(loc);
    if (loc && user) {
      try {
        const { data } = await api.patch(`/users/${user.id}`, {
          lat: loc.lat,
          lng: loc.lng,
        });
        setUser(data);
      } catch (err) {
        console.error(err);
      }
    }
    if (user) navigate(dashboardPath(user), { replace:true });
  }
  async function logout(){
    stopLiveLocation();
    disconnectRealtime();
    try { await api.post("/logout"); } catch (error) { console.error(error); }
    setUser(null);setLocation(null);navigate("/", { replace:true });
  }
  function updateUser(u: AppUser){setUser(u);}

  function stopLiveLocation(){
    if(locationWatchRef.current!=null&&"geolocation" in navigator)navigator.geolocation.clearWatch(locationWatchRef.current);
    sessionStorage.removeItem("live_location_enabled");
    locationWatchRef.current=null;setLocationTracking(false);setLocationLocating(false);
  }
  function startLiveLocation(){
    if(!user||user.role!=="technician")return;
    if(!("geolocation" in navigator)){setLocationError("La géolocalisation n’est pas disponible sur ce navigateur.");return;}
    lastLocationSyncRef.current=0;setLocationLocating(true);setLocationError("");
    const watchId=navigator.geolocation.watchPosition(async({coords})=>{
      const {latitude,longitude}=coords;const now=Date.now();
      if(now-lastLocationSyncRef.current<15000||locationWatchRef.current==null)return;
      lastLocationSyncRef.current=now;
      const loc:UserLocation={lat:latitude,lng:longitude,city:location?.city||user.city||"Position GPS",district:"Position en direct"};
      setLocation(loc);setUser((current)=>current?{...current,lat:latitude,lng:longitude}:current);setLocationLocating(false);setLocationError("");
      try{const {data}=await api.patch(`/users/${user.id}`,{lat:latitude,lng:longitude});if(locationWatchRef.current!=null)setUser(data);}
      catch{setLocationError("La position est active, mais sa synchronisation a temporairement échoué.");}
    },(error)=>{
      setLocationLocating(false);
      if(error.code===error.PERMISSION_DENIED){setLocationError("La localisation est bloquée. Autorisez-la dans les réglages du navigateur, puis réessayez.");stopLiveLocation();return;}
      setLocationError(error.code===error.TIMEOUT?"La recherche GPS prend du temps. Le suivi reste actif.":"Position GPS momentanément indisponible. Le suivi reste actif.");
    },{enableHighAccuracy:true,maximumAge:30000,timeout:30000});
    locationWatchRef.current=watchId;sessionStorage.setItem("live_location_enabled","true");setLocationTracking(true);
  }
  function toggleLiveLocation(){if(locationTracking||locationWatchRef.current!=null)stopLiveLocation();else startLiveLocation();}

  useEffect(()=>()=>{if(locationWatchRef.current!=null&&"geolocation" in navigator)navigator.geolocation.clearWatch(locationWatchRef.current);},[]);
  useEffect(()=>{
    if(user?.role==="technician"&&sessionStorage.getItem("live_location_enabled")==="true"&&locationWatchRef.current==null)startLiveLocation();
  },[user?.id,user?.role]);

  if (booting) {
    return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin"/></div>;
  }

  const clientRoute = !user ? <Navigate to="/connexion/client" replace/>
    : user.role !== "client" ? <Navigate to={dashboardPath(user)} replace/>
      : <ClientDashboard user={user} location={location} technicians={technicians} onLogout={logout} onUpdateUser={updateUser}/>;
  const technicianRoute = !user ? <Navigate to="/connexion/technicien" replace/>
    : user.role !== "technician" ? <Navigate to={dashboardPath(user)} replace/>
      : <TechDashboard user={user} location={location} onLogout={logout} onUpdateUser={updateUser} locationTracking={locationTracking} locating={locationLocating} locationError={locationError} onToggleLocation={toggleLiveLocation} onClearLocationError={()=>setLocationError("")}/>;

  return (
    <div className="bg-background min-h-screen" style={{ fontFamily:"Onest,sans-serif" }}>
      <style>{`* { scrollbar-width:none; -ms-overflow-style:none; } *::-webkit-scrollbar { display:none; }`}</style>
      <Routes>
        <Route path="/" element={user ? <Navigate to={dashboardPath(user)} replace/> : <Landing onSelect={selectRole}/>}/>
        <Route path="/connexion/client" element={user ? <Navigate to={dashboardPath(user)} replace/> : <AuthForm role="client" onBack={()=>navigate("/")} onLogin={handleLogin}/>}/>
        <Route path="/connexion/technicien" element={user ? <Navigate to={dashboardPath(user)} replace/> : <AuthForm role="technician" onBack={()=>navigate("/")} onLogin={handleLogin}/>}/>
        <Route path="/localisation" element={user ? <LocationModal role={user.role} user={user} onDone={handleLocation}/> : <Navigate to="/" replace/>}/>
        <Route path="/client" element={<Navigate to="/client/chat" replace/>}/>
        <Route path="/client/:tab" element={clientRoute}/>
        <Route path="/technicien" element={<Navigate to="/technicien/leads" replace/>}/>
        <Route path="/technicien/:tab" element={technicianRoute}/>
        <Route path="*" element={<Navigate to={user ? dashboardPath(user) : "/"} replace/>}/>
      </Routes>
    </div>
  );
}
