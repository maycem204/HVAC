import { useEffect, useState } from "react";
import api from "../lib/api";
import { clearAuthSession, getAuthToken } from "../lib/auth-storage";
import { disconnectRealtime } from "../lib/socket";
import type { AppUser, Role, Technician, UserLocation, View } from "./domain";
import { mapTechnician } from "./mappers";
import { AuthForm, Landing, LocationModal } from "./PublicViews";
import { ClientDashboard } from "./ClientDashboard";
import { TechDashboard } from "./TechnicianDashboard";

export default function App() {
  const [view, setView] = useState<View>("home");
  const [role, setRole] = useState<Role>("client");
  const [user, setUser] = useState<AppUser|null>(null);
  const [location, setLocation] = useState<UserLocation|null>(null);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [booting, setBooting] = useState(true);

  // Auto-login dans la session propre à cet onglet.
  useEffect(() => {
    const token = getAuthToken();
    if (!token) { setBooting(false); return; }
    api.get("/me")
      .then((res) => {
        const currentUser = res.data.user ?? res.data;
        setUser(currentUser);
        setRole(currentUser.role);
        const lat = Number(currentUser.lat);
        const lng = Number(currentUser.lng);
        if (Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)) {
          setLocation({ lat, lng, city: currentUser.city || "Position du profil", district: currentUser.city || "" });
        } else if (currentUser.city || currentUser.address) {
          const query = [currentUser.address, currentUser.city].filter(Boolean).join(", ");
          api.get("/geocode/forward", { params:{ city:query } }).then(({data})=>setLocation({ lat:Number(data.lat), lng:Number(data.lng), city:currentUser.city||data.city, district:currentUser.address||data.district||currentUser.city })).catch(()=>{});
        }
        setView(currentUser.role === "client" ? "client" : "tech");
      })
      .catch(() => clearAuthSession())
      .finally(() => setBooting(false));
  }, []);

  // Les techniciens sont utilisés par le client (recherche/chat) — chargés une fois connecté
  useEffect(() => {
    if (view !== "client" && view !== "tech") return;
    api.get("/technicians", {
      params: location ? { lat: location.lat, lng: location.lng } : undefined,
    }).then((res) => setTechnicians(res.data.map(mapTechnician))).catch(console.error);
  }, [view, location]);

  function selectRole(r: Role){setRole(r);setView("auth");}
  function handleLogin(u: AppUser){setUser(u);setView("location");}
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
    setView(role==="client"?"client":"tech");
  }
  function logout(){ disconnectRealtime(); clearAuthSession(); setUser(null);setLocation(null);setView("home"); }
  function updateUser(u: AppUser){setUser(u);}
  function updateTechnicianLocation(loc: UserLocation, updatedUser: AppUser){setLocation(loc);setUser(updatedUser);}

  if (booting) {
    return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin"/></div>;
  }

  return (
    <div className="bg-background min-h-screen" style={{ fontFamily:"Onest,sans-serif" }}>
      <style>{`* { scrollbar-width:none; -ms-overflow-style:none; } *::-webkit-scrollbar { display:none; }`}</style>
      {view==="home"&&<Landing onSelect={selectRole}/>}
      {view==="auth"&&<AuthForm role={role} onBack={()=>setView("home")} onLogin={handleLogin}/>}
      {view==="location"&&user&&<LocationModal role={role} user={user} onDone={handleLocation}/>}
      {view==="client"&&user&&<ClientDashboard user={user} location={location} technicians={technicians} onLogout={logout} onUpdateUser={updateUser}/>}
      {view==="tech"&&user&&<TechDashboard user={user} location={location} onLogout={logout} onUpdateUser={updateUser} onLocationUpdate={updateTechnicianLocation}/>}
    </div>
  );
}
