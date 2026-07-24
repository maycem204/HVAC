import { useEffect, useRef, useState } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import api from "../lib/api";
import { disconnectRealtime, realtimeSocket } from "../lib/socket";
import type { AppUser, Role, Technician, UserLocation } from "./domain";
import { mapTechnician } from "./mappers";
import { AuthForm, LocationModal } from "./PublicViews";
import { MarketingLanding } from "./MarketingLanding";
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
  const lastLocationLabelRef = useRef<{lat:number;lng:number;at:number}|null>(null);
  const navigate = useNavigate();

  const dashboardPath = (currentUser: AppUser) => currentUser.role === "client" ? "/client/chat" : "/technicien/leads";

  // Auto-login dans la session propre à cet onglet.
  useEffect(() => {
    sessionStorage.removeItem("token");
    sessionStorage.removeItem("user");
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    api.get("/me")
      .then(async (res) => {
        const currentUser = res.data.user ?? res.data;
        setUser(currentUser);
        const lat = Number(currentUser.lat);
        const lng = Number(currentUser.lng);
        const liveRequested=sessionStorage.getItem("live_location_enabled")==="true";
        if(liveRequested&&Number.isFinite(lat)&&Number.isFinite(lng)&&(lat!==0||lng!==0)){
          setLocation({lat,lng,city:"Position actuelle",district:"Position GPS",source:"gps"});
        }else{
          await restoreProfileLocation(currentUser);
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

  useEffect(()=>{
    if(user?.role!=="client")return;
    const socket=realtimeSocket();if(!socket)return;
    const updateTechnicianLocation=(payload:{technicianId:number;lat:number;lng:number;liveLocationActive?:boolean})=>{
      const lat=Number(payload.lat);const lng=Number(payload.lng);
      if(!Number.isFinite(lat)||!Number.isFinite(lng))return;
      setTechnicians((items)=>items.map((technician)=>{
        if(technician.id!==Number(payload.technicianId))return technician;
        let distanceKm=technician.distanceKm;
        if(location){
          const toRad=(value:number)=>value*Math.PI/180;
          const dLat=toRad(lat-location.lat);const dLng=toRad(lng-location.lng);
          const a=Math.sin(dLat/2)**2+Math.cos(toRad(location.lat))*Math.cos(toRad(lat))*Math.sin(dLng/2)**2;
          distanceKm=6371*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
        }
        return {...technician,lat,lng,distanceKm,liveLocationActive:Boolean(payload.liveLocationActive)};
      }));
    };
    socket.on("technician:location",updateTechnicianLocation);
    return()=>{socket.off("technician:location",updateTechnicianLocation);};
  },[user?.role,location]);

  function selectRole(r: Role){navigate(`/connexion/${r === "client" ? "client" : "technicien"}`);}
  function handleLogin(u: AppUser){setUser(u);navigate("/localisation", { replace:true });}
  async function handleLocation(loc: UserLocation | null){
    setLocation(loc);
    if (loc && user) {
      try {
        const { data } = await api.patch(`/users/${user.id}`, {
          lat: loc.lat,
          lng: loc.lng,
          live_location_active:loc.source==="gps",
          ...(loc.source==="profile"?{city:loc.city}:{}),
        });
        setUser(data);
      } catch (err) {
        console.error(err);
      }
    }
    if(loc?.source==="gps"){
      sessionStorage.setItem("live_location_enabled","true");
      startLiveLocation();
    }
    if (user) navigate(dashboardPath(user), { replace:true });
  }
  async function logout(){
    stopLiveLocation(false);
    disconnectRealtime();
    try { await api.post("/logout"); } catch (error) { console.error(error); }
    setUser(null);setLocation(null);navigate("/", { replace:true });
  }
  function updateUser(u: AppUser){
    setUser(u);
    if(!locationTracking&&locationWatchRef.current==null)void restoreProfileLocation(u);
  }

  async function restoreProfileLocation(currentUser: AppUser){
    const queries=[
      currentUser.city,
      [currentUser.address,currentUser.city].filter(Boolean).join(", "),
    ].filter((value,index,items)=>value&&items.indexOf(value)===index);
    if(!queries.length){setLocation(null);return;}
    setLocation(null);
    try{
      let place:null|{lat:number|string;lng:number|string;city?:string;district?:string}=null;
      for(const query of queries){
        try{
          const response=await api.get("/geocode/forward",{params:{city:query}});
          place=response.data;break;
        }catch{}
      }
      if(!place)throw new Error("Profile location unavailable");
      const fallback:UserLocation={lat:Number(place.lat),lng:Number(place.lng),city:currentUser.city||place.city||"Position du profil",district:currentUser.address||place.district||currentUser.city||"",source:"profile"};
      setLocation(fallback);
      const {data}=await api.patch(`/users/${currentUser.id}`,{lat:fallback.lat,lng:fallback.lng,live_location_active:false});
      setUser(data);
    }catch{
      setLocationError("Le suivi est désactivé, mais la position de votre ville n’a pas pu être actualisée.");
    }
  }
  function stopLiveLocation(restoreProfile=true){
    if(locationWatchRef.current!=null&&"geolocation" in navigator)navigator.geolocation.clearWatch(locationWatchRef.current);
    sessionStorage.removeItem("live_location_enabled");
    locationWatchRef.current=null;setLocationTracking(false);setLocationLocating(false);
    const currentUser=user;
    if(restoreProfile&&currentUser)void restoreProfileLocation(currentUser);
  }
  function startLiveLocation(){
    if(!user)return;
    if(!("geolocation" in navigator)){setLocationError("La géolocalisation n’est pas disponible sur ce navigateur.");return;}
    lastLocationSyncRef.current=0;setLocationLocating(true);setLocationError("");
    sessionStorage.setItem("live_location_enabled","true");setLocationTracking(true);
    try{
      const watchId=navigator.geolocation.watchPosition(async({coords})=>{
        const {latitude,longitude}=coords;const now=Date.now();
        if(now-lastLocationSyncRef.current<15000||locationWatchRef.current==null)return;
        lastLocationSyncRef.current=now;
        setLocation((current)=>({lat:latitude,lng:longitude,city:current?.source==="gps"?current.city:"Position actuelle",district:current?.source==="gps"?current.district:"Position GPS",source:"gps"}));
        setUser((current)=>current?{...current,lat:latitude,lng:longitude}:current);setLocationLocating(false);setLocationError("");
        const previousLabel=lastLocationLabelRef.current;
        const shouldRefreshLabel=!previousLabel||now-previousLabel.at>=5*60*1000||Math.abs(latitude-previousLabel.lat)>=0.02||Math.abs(longitude-previousLabel.lng)>=0.02;
        if(shouldRefreshLabel){
          lastLocationLabelRef.current={lat:latitude,lng:longitude,at:now};
          api.get("/geocode/reverse",{params:{lat:latitude,lng:longitude}}).then(({data})=>{
            if(locationWatchRef.current==null)return;
            setLocation((current)=>current?.source==="gps"?{...current,city:data.city||"Position actuelle",district:data.district||data.city||"Position GPS"}:current);
          }).catch(()=>{lastLocationLabelRef.current=null;});
        }
        try{const {data}=await api.patch(`/users/${user.id}`,{lat:latitude,lng:longitude,live_location_active:true});if(locationWatchRef.current!=null)setUser(data);}
        catch{setLocationError("La position est active, mais sa synchronisation a temporairement échoué.");}
      },(error)=>{
        setLocationLocating(false);
        if(error.code===error.PERMISSION_DENIED){setLocationError("La localisation est bloquée. Autorisez-la dans les réglages du navigateur, puis réessayez.");stopLiveLocation();return;}
        setLocationError(error.code===error.TIMEOUT?"La recherche GPS prend du temps. Le suivi reste actif.":"Position GPS momentanément indisponible. Le suivi reste actif.");
      },{enableHighAccuracy:true,maximumAge:30000,timeout:30000});
      locationWatchRef.current=watchId;
    }catch{
      sessionStorage.removeItem("live_location_enabled");setLocationTracking(false);setLocationLocating(false);
      setLocationError("Le navigateur empêche l’activation de la position. Vérifiez l’autorisation de localisation du site.");
    }
  }
  function toggleLiveLocation(){if(locationTracking||locationWatchRef.current!=null)stopLiveLocation();else startLiveLocation();}

  useEffect(()=>()=>{if(locationWatchRef.current!=null&&"geolocation" in navigator)navigator.geolocation.clearWatch(locationWatchRef.current);},[]);
  useEffect(()=>{
    if(user&&sessionStorage.getItem("live_location_enabled")==="true"&&locationWatchRef.current==null)startLiveLocation();
  },[user?.id,user?.role]);

  if (booting) {
    return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin"/></div>;
  }

  const clientRoute = !user ? <Navigate to="/connexion/client" replace/>
    : user.role !== "client" ? <Navigate to={dashboardPath(user)} replace/>
      : <ClientDashboard user={user} location={location} technicians={technicians} onLogout={logout} onUpdateUser={updateUser} locationTracking={locationTracking} locating={locationLocating} locationError={locationError} onToggleLocation={toggleLiveLocation} onClearLocationError={()=>setLocationError("")}/>;
  const technicianRoute = !user ? <Navigate to="/connexion/technicien" replace/>
    : user.role !== "technician" ? <Navigate to={dashboardPath(user)} replace/>
      : <TechDashboard user={user} location={location} onLogout={logout} onUpdateUser={updateUser} locationTracking={locationTracking} locating={locationLocating} locationError={locationError} onToggleLocation={toggleLiveLocation} onClearLocationError={()=>setLocationError("")}/>;

  return (
    <div className="bg-background min-h-screen" style={{ fontFamily:"Onest,sans-serif" }}>
      <style>{`* { scrollbar-width:none; -ms-overflow-style:none; } *::-webkit-scrollbar { display:none; }`}</style>
      <Routes>
        <Route path="/" element={user ? <Navigate to={dashboardPath(user)} replace/> : <MarketingLanding onSelect={selectRole}/>}/>
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
