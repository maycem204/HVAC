import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import api from "../lib/api";
import { clearAuthSession, getAuthToken } from "../lib/auth-storage";
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
  const navigate = useNavigate();

  const dashboardPath = (currentUser: AppUser) => currentUser.role === "client" ? "/client/chat" : "/technicien/leads";

  // Auto-login dans la session propre à cet onglet.
  useEffect(() => {
    const token = getAuthToken();
    if (!token) { setBooting(false); return; }
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
      .catch(() => clearAuthSession())
      .finally(() => setBooting(false));
  }, []);

  // Les techniciens sont utilisés par le client (recherche/chat) — chargés une fois connecté
  useEffect(() => {
    if (!user) return;
    api.get("/technicians", {
      params: location ? { lat: location.lat, lng: location.lng } : undefined,
    }).then((res) => setTechnicians(res.data.map(mapTechnician))).catch(console.error);
  }, [user, location]);

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
  function logout(){ disconnectRealtime(); clearAuthSession(); setUser(null);setLocation(null);navigate("/", { replace:true }); }
  function updateUser(u: AppUser){setUser(u);}
  function updateTechnicianLocation(loc: UserLocation, updatedUser: AppUser){setLocation(loc);setUser(updatedUser);}

  if (booting) {
    return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin"/></div>;
  }

  function AuthRoute() {
    const { role: roleParam } = useParams();
    if (user) return <Navigate to={dashboardPath(user)} replace/>;
    if (roleParam !== "client" && roleParam !== "technicien") return <Navigate to="/" replace/>;
    const role: Role = roleParam === "client" ? "client" : "technician";
    return <AuthForm role={role} onBack={()=>navigate("/")} onLogin={handleLogin}/>;
  }

  function ClientRoute() {
    if (!user) return <Navigate to="/connexion/client" replace/>;
    if (user.role !== "client") return <Navigate to={dashboardPath(user)} replace/>;
    return <ClientDashboard user={user} location={location} technicians={technicians} onLogout={logout} onUpdateUser={updateUser}/>;
  }

  function TechnicianRoute() {
    if (!user) return <Navigate to="/connexion/technicien" replace/>;
    if (user.role !== "technician") return <Navigate to={dashboardPath(user)} replace/>;
    return <TechDashboard user={user} location={location} onLogout={logout} onUpdateUser={updateUser} onLocationUpdate={updateTechnicianLocation}/>;
  }

  return (
    <div className="bg-background min-h-screen" style={{ fontFamily:"Onest,sans-serif" }}>
      <style>{`* { scrollbar-width:none; -ms-overflow-style:none; } *::-webkit-scrollbar { display:none; }`}</style>
      <Routes>
        <Route path="/" element={user ? <Navigate to={dashboardPath(user)} replace/> : <Landing onSelect={selectRole}/>}/>
        <Route path="/connexion/:role" element={<AuthRoute/>}/>
        <Route path="/localisation" element={user ? <LocationModal role={user.role} user={user} onDone={handleLocation}/> : <Navigate to="/" replace/>}/>
        <Route path="/client" element={<Navigate to="/client/chat" replace/>}/>
        <Route path="/client/:tab" element={<ClientRoute/>}/>
        <Route path="/technicien" element={<Navigate to="/technicien/leads" replace/>}/>
        <Route path="/technicien/:tab" element={<TechnicianRoute/>}/>
        <Route path="*" element={<Navigate to={user ? dashboardPath(user) : "/"} replace/>}/>
      </Routes>
    </div>
  );
}
