import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Languages } from "lucide-react";

export type InterfaceLanguage = "fr" | "en";

type LanguageContextValue = {
  language: InterfaceLanguage;
  setLanguage: (language: InterfaceLanguage) => void;
  text: (fr: string, en: string) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);
const STORAGE_KEY = "quoteai_interface_language";
const PHRASES: Array<[string,string]> = [
  ["Espace client","Client space"],["Espace technicien","Technician space"],["Connexion client","Client login"],
  ["Fonctionnalités","Features"],["Tarification","Pricing"],["À propos","About"],
  ["Se connecter","Sign in"],["S'inscrire","Sign up"],["Créer un compte","Create an account"],["Créer mon compte","Create my account"],
  ["Pas encore de compte ?","No account yet?"],["Déjà un compte ?","Already have an account?"],
  ["Nom complet","Full name"],["Mot de passe","Password"],["Téléphone","Phone"],["Adresse","Address"],
  ["Ville ou localisation","City or location"],["Retour","Back"],["Chargement…","Loading…"],
  ["Utiliser ma position GPS","Use my GPS location"],["Continuer avec mon adresse et ma ville","Continue with my address and city"],
  ["Localisation en cours…","Locating…"],["Position obtenue","Location found"],["Activer ma position","Enable my location"],
  ["Désactiver ma position","Disable my location"],["Activer","Enable"],["Désactiver","Disable"],
  ["Devis IA","AI quote"],["Rendez-vous","Appointments"],["Techniciens","Technicians"],["Messages","Messages"],
  ["Leads entrants","Incoming leads"],["Tarifs","Pricing"],["Agenda","Schedule"],["Ce mois","This month"],
  ["Revenus","Revenue"],["Note moy.","Average rating"],["Notifications","Notifications"],
  ["Mon profil","My profile"],["Informations personnelles","Personal information"],["Photo de profil","Profile photo"],
  ["Choisir une photo","Choose a photo"],["Spécialisations","Specializations"],["Ajouter une spécialité personnalisée","Add a custom specialization"],
  ["Rayon d'intervention","Service radius"],["Enregistrer","Save"],["Profil enregistré !","Profile saved!"],
  ["Disponible","Available"],["Indisponible","Unavailable"],["Disponibles","Available"],["Contacté","Contacted"],
  ["Nom ou spécialisation…","Name or specialization…"],["Ouvrir la discussion","Open conversation"],
  ["Avis clients récents","Recent customer reviews"],["Évaluer ce technicien","Rate this technician"],["Publier","Publish"],
  ["Mes rendez-vous","My appointments"],["À venir","Upcoming"],["Historique","History"],["Annuler","Cancel"],
  ["Confirmer","Confirm"],["Non merci","No thanks"],["Voir plus de propositions","See more options"],["Réessayer","Try again"],
  ["Aucune conversation.","No conversations."],["Sélectionnez une conversation.","Select a conversation."],
  ["Envoyer","Send"],["Appeler","Call"],["Itinéraire","Directions"],["Adresse indisponible","Address unavailable"],
  ["Ma grille tarifaire","My pricing list"],["Ajouter un tarif","Add a price"],["Importer un fichier","Import a file"],
  ["Nouveau service","New service"],["Intitulé","Name"],["Unité","Unit"],["Catégorie","Category"],
  ["Enregistré !","Saved!"],["Modifier","Edit"],["Supprimer","Delete"],
  ["Horaires habituels","Regular working hours"],["Exceptions et absences","Exceptions and absences"],
  ["Bloquer un créneau","Block a time slot"],["Aucune indisponibilité","No unavailability"],
  ["Date","Date"],["Début","Start"],["Fin","End"],["Jours","Days"],["Fermé","Closed"],
  ["Accepter","Accept"],["Décliner","Decline"],["Accepté","Accepted"],["Clôturé","Closed"],
  ["Confiance IA","AI confidence"],["Description donnée par le client","Description provided by the customer"],
  ["Détail de la panne analysée","Analyzed issue details"],["Demande","Request"],["Créneau","Time slot"],
  ["Estimation","Estimate"],["Statut","Status"],["Pays","Country"],["Urgence","Urgency"],["Complexité","Complexity"],
  ["Équipement","Equipment"],["Marque","Brand"],["Saison","Season"],["Référence","Reference"],
  ["Tout marquer lu","Mark all as read"],["Aucune nouvelle notification","No new notifications"],
  ["Aucune évaluation pour le moment","No ratings yet"],["Évaluations clients","Customer ratings"],
  ["Laisser un avis","Leave a review"],["Votre avis","Your review"],["Prix estimé","Estimated price"],
  ["Prix réel","Actual price"],["Finaliser l'intervention","Complete the job"],["Que souhaitez-vous faire ?","What would you like to do?"],
  ["Décrivez votre problème HVAC…","Describe your HVAC issue…"],["Recherche intelligente dans les agendas…","Searching schedules intelligently…"],
  ["Aucun rendez-vous ce jour","No appointments on this day"],["Pas encore évalué","Not rated yet"],
  ["Position du profil","Profile location"],["Position en direct","Live location"],["Votre position","Your location"],
  ["Obtenir un devis","Get a quote"],["Essayer maintenant","Try now"],["Découvrir le fonctionnement","See how it works"],
  ["Assistant de devis IA","AI quote assistant"],["En ligne · réponse instantanée","Online · replies instantly"],
  ["DEVIS ESTIMATIF","ESTIMATED QUOTE"],["Fourchette estimée","Estimated range"],["Confiance élevée","High confidence"],
  ["Prochaine disponibilité","Next available"],["Spécialiste le plus proche","Nearest specialist"],["Aujourd’hui","Today"],
  ["Tarification adaptée au marché local","Local market pricing"],["Arabe, français et anglais","Arabic, French & English"],
  ["Mise en relation géolocalisée","Location-aware matching"],["De la complexité à la clarté","From friction to clarity"],
  ["Les devis ne doivent pas ralentir votre activité","Quoting should not slow your business down"],
  ["L’ancienne méthode","The old way"],["La méthode QuoteAI","The QuoteAI way"],
  ["Les devis lents, manuels et sujets aux erreurs font perdre du temps et créent de l’incertitude.","Slow, manual, and error-prone quotes cost time and create uncertainty for everyone."],
  ["Décrivez le problème","Describe the issue"],["Recevez une estimation locale","Receive a local estimate"],
  ["Réservez le bon spécialiste","Book the right specialist"],["Tarification adaptée à la région MENA","MENA-ready pricing"],
  ["Une tarification régionale claire pour les clients","Regional pricing clients can understand"],
  ["Commencez par une estimation IA","Start with an AI estimate"],["Aucun appel téléphonique nécessaire","No phone call required"],
  ["Une plateforme HVAC professionnelle dédiée à la région MENA","A professional HVAC platform dedicated to MENA"],
  ["Rejoindre comme technicien","Join as a technician"],
  ["Devis, mise en relation et planification HVAC professionnels pour la région MENA.","Professional HVAC quoting, matching, and scheduling for the MENA region."],
  ["Écrivez votre message…","Write your message…"],["Rechercher un client, une panne ou une ville…","Search for a customer, issue, or city…"],
  ["Demande comprise","Understood request"],["Intervention tarifaire","Priced service"],["Vérifier l’analyse et le calcul","Review analysis and calculation"],
  ["Devis gratuit et instantané.","Free instant quote."],["Prix confirmé","Price confirmed"],["Confirmer l’annulation","Confirm cancellation"],
  ["Garder le rendez-vous","Keep appointment"],["Annuler ce rendez-vous","Cancel this appointment"],
  ["Saisir le prix réel après intervention","Enter actual price after service"],["Prix réel facturé","Actual amount charged"],
  ["Synchronisation automatique.","Automatic synchronization."],["Importer un autre fichier","Import another file"],
  ["Votre semaine de travail récurrente","Your recurring work week"],["Journée non travaillée","Non-working day"],
  ["Congés, formation ou absence ponctuelle","Leave, training, or one-time absence"],["Motif (optionnel)","Reason (optional)"],
  ["Votre devis HVAC","Your HVAC quote"],["en quelques secondes.","in seconds."],
  ["Devis HVAC instantané par intelligence artificielle","Instant AI-powered HVAC quotes"],
  ["Décrivez votre problème, obtenez une estimation de prix et trouvez un technicien qualifié près de chez vous — sans attente, sans appel.","Describe your issue, get a price estimate, and find a qualified technician nearby—without waiting or calling."],
  ["Décrivez votre panne ou utilisez le micro.","Describe your issue or use the microphone."],
  ["Aucun agenda libre parmi les spécialistes compatibles. Vous pouvez leur envoyer un message.","No compatible specialist has an open slot. You can send them a message."],
  ["Contactez ce technicien pour pouvoir l’évaluer.","Contact this technician before leaving a rating."],
  ["Aucun commentaire écrit.","No written comment."],["Avis clients récents","Recent customer reviews"],
  ["Aucune nouvelle notification","No new notifications"],["Les détails de diagnostic ne sont pas disponibles pour cette ancienne demande.","Diagnostic details are unavailable for this older request."],
  ["Si vous déclinez, le moteur IA cherche automatiquement un autre technicien.","If you decline, the AI engine automatically searches for another technician."],
  ["Moteur IA recherche un autre technicien…","AI engine is searching for another technician…"],
  ["Symptôme / panne","Symptom / issue"],["Détail","Details"],["Justification","Reasoning"],
  ["Correspondance catalogue","Catalog match"],["Contexte saisonnier","Seasonal context"],["Âge équipement","Equipment age"],
  ["Intervention prévue","Scheduled service"],["Description du cas","Case description"],["Prix confirmé","Confirmed price"],
  ["Le technicien sera immédiatement informé.","The technician will be notified immediately."],
  ["Confirmez-vous avoir payé ce montant ?","Do you confirm that you paid this amount?"],
  ["Ajouter","Add"],["Nouveau","New"],["Tout","All"],["Nouveaux","New"],["Terminés","Completed"],
  ["Chargement des leads…","Loading leads…"],["Chargement des évaluations…","Loading ratings…"],
  ["Extraction en cours…","Extracting…"],["Extraction impossible","Extraction failed"],
  ["Vos tarifs alimentent le moteur IA pour les estimations clients.","Your prices feed the AI engine used for customer estimates."],
  ["Devise déterminée par votre ville","Currency determined by your city"],["Minimum local de déplacement et d’intervention inclus.","Local travel and service minimum included."],
  ["CSV, Excel .xlsx/.xlsm ou PDF texte — 5 Mo maximum","CSV, Excel .xlsx/.xlsm, or text PDF — 5 MB maximum"],
  ["Améliore les futures estimations IA","Improves future AI estimates"],["Historique et rendez-vous à venir","History and upcoming appointments"],
  ["Les clients ne pourront réserver que dans ces plages. Une intervention dure actuellement 2 heures.","Customers can only book within these hours. A service visit currently lasts 2 hours."],
  ["Créneaux bloqués","Blocked slots"],["Type","Type"],["Description","Description"],
  ["Modifier votre évaluation","Edit your rating"],["Notes et commentaires laissés par vos clients.","Ratings and comments left by your customers."],
  ["Les avis apparaîtront ici après les interventions évaluées par vos clients.","Reviews will appear here after customers rate completed jobs."],
  ["Cette spécialité sera utilisée pour proposer les demandes correspondantes.","This specialization will be used to match relevant requests."],
  ["Champ obligatoire — cette localisation sera utilisée par défaut lorsque le GPS est désactivé.","Required — this location is used by default when GPS is off."],
  ["Évitez votre nom, votre e-mail et les mots de passe courants.","Avoid your name, email, and common passwords."],
  ["ou saisissez votre ville","or enter your city"],["Aucune conversation.","No conversations."],
  ["Messagerie sécurisée","Secure messaging"],["Aucun technicien compatible n’est disponible sur ce créneau — client notifié.","No compatible technician is available for this time slot—the customer has been notified."],
  ["Espace client","Client space"],["Espace technicien","Technician space"],
  ["Conçu pour le marché HVAC de la région MENA","Built for the MENA HVAC market"],
  ["Générez des devis HVAC en quelques secondes grâce à l’IA","Generate HVAC quotes in seconds with AI"],
  ["Des estimations HVAC par IA adaptées aux marchés MENA, aux devises locales et aux réalités régionales. Décrivez le problème et trouvez le bon spécialiste disponible, sans attendre de rappel.","AI-powered HVAC estimates adapted to MENA markets, local currencies, and regional service realities. Describe the issue and connect with the right available specialist—without waiting for callbacks."],
  ["Estimation instantanée","Instant estimate"],["Devise locale","Local currency"],["Spécialistes qualifiés","Qualified specialists"],
  ["Expliquez ce qui se passe avec votre équipement HVAC.","Tell me what is happening with your HVAC equipment."],
  ["Mon climatiseur split fait beaucoup de bruit au démarrage.","My split AC makes a loud noise when it starts."],
  ["à proximité","away"],["Les estimations utilisent des données HVAC régionales et affichent la devise locale appropriée.","Estimates use regional HVAC data and display the appropriate local currency."],
  ["Un parcours client plus clair dans les langues les plus utilisées dans la région MENA.","A clearer customer journey across the languages most used throughout MENA."],
  ["Les clients trouvent des techniciens qualifiés à proximité dans leur zone d’intervention réelle.","Clients find qualified nearby technicians within their actual service area."],
  ["Appels répétés et descriptions incomplètes","Repeated calls and incomplete descriptions"],
  ["Tarification incohérente et calculs manuels","Inconsistent pricing and manual calculations"],
  ["Des heures perdues à chercher le bon technicien disponible","Hours lost finding the right available technician"],
  ["La tarification instantanée par IA transforme une description claire du problème en demande d’intervention exploitable et adaptée au marché MENA du client.","Instant AI-powered pricing turns a clear issue description into an actionable service request adapted to the customer’s MENA market."],
  ["Clarification contextuelle des problèmes HVAC","Context-aware HVAC issue clarification"],
  ["Estimations transparentes dans la bonne devise locale","Transparent estimates in the correct local currency"],
  ["Spécialistes à proximité classés par compétence et disponibilité","Nearby specialists ranked by skill and availability"],
  ["L’assistant multilingue pose des questions utiles et conserve tout le contexte de la conversation.","The multilingual assistant asks useful questions and keeps the full context of the conversation."],
  ["La tarification utilise les données HVAC régionales, la localisation, la complexité et l’urgence, sans estimation arbitraire.","Pricing uses regional HVAC data, location, complexity, and urgency—not guesswork."],
  ["Consultez les techniciens qualifiés à proximité et leur première disponibilité compatible.","See nearby qualified technicians and their earliest compatible availability."],
  ["QuoteAI adapte l’estimation au marché du client et affiche clairement la devise, la fourchette de prix et le niveau de confiance. Le prix final de l’intervention reste visible pendant tout le parcours.","QuoteAI adapts the estimate to the customer’s market and displays the currency, price range, and confidence clearly. The final intervention price remains visible throughout the service workflow."],
  ["Fourchette de prix dans votre devise locale","Price range in your local currency"],
  ["Spécialistes correspondant au problème HVAC réel","Specialists matched to the actual HVAC issue"],
  ["Créneaux disponibles avant confirmation","Available appointment options before confirmation"],
  ["Conçue autour des langues, devises, réalités géographiques et besoins HVAC de la région. Les clients gagnent en rapidité et en clarté, tandis que les techniciens gèrent les demandes pertinentes, les tarifs, les disponibilités, les rendez-vous et les conversations depuis un seul espace.","Designed around the region’s languages, currencies, geography, and HVAC service needs. Clients gain speed and clarity while technicians manage relevant requests, pricing, availability, appointments, and conversations from one workspace."],
  ["Aucun commentaire écrit.","No written comment."],["Aucun rendez-vous ce jour","No appointments on this day"],
  ["Aucun technicien compatible n’est disponible sur ce créneau — client notifié.","No compatible technician is available for this time slot—the customer was notified."],
  ["Aucune indisponibilité","No unavailability"],["Aucune nouvelle notification","No new notifications"],
  ["Bloquer ce créneau","Block this time slot"],["Bloquer un créneau","Block a time slot"],
  ["Catégorie","Category"],["Confiance","Confidence"],["Complexité de cette panne","Issue complexity"],
  ["Détail de la panne analysée","Analyzed issue details"],["Description donnée par le client","Customer-provided description"],
  ["Devis gratuit et instantané.","Free instant quote."],["Disponibles","Available"],["Extraction en cours…","Extracting…"],
  ["Finaliser l'intervention","Complete the service"],["Historique et rendez-vous à venir","History and upcoming appointments"],
  ["Intervention prévue","Scheduled service"],["Intervention tarifaire","Priced service"],["Journée non travaillée","Non-working day"],
  ["Le technicien sera immédiatement informé.","The technician will be notified immediately."],
  ["Minimum local de déplacement et d’intervention inclus.","Local travel and service minimum included."],
  ["Moteur IA recherche un autre technicien…","AI engine is searching for another technician…"],
  ["Prix réel facturé","Actual amount charged"],["Recherche intelligente dans les agendas…","Searching schedules…"],
  ["Si la demande comprise ou l’intervention tarifaire ne correspond pas à votre besoin, refusez le devis et reformulez avant de réserver.","If the understood request or priced service does not match your need, decline the quote and rephrase before booking."],
  ["Votre semaine de travail récurrente","Your recurring work week"],["Vérifier l’analyse et le calcul","Review analysis and calculation"],
  ["Tous","All"],["Nouveaux","New"],["Terminés","Completed"],["Réparation","Repair"],["Chauffage","Heating"],
  ["Installation","Installation"],["Climatisation","Air conditioning"],["Ventilation","Ventilation"],
];
const originalText = new WeakMap<Node,string>();
const originalAttributes = new WeakMap<Element,Map<string,string>>();

function initialLanguage(): InterfaceLanguage {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === "fr" || saved === "en") return saved;
  return navigator.language.toLowerCase().startsWith("fr") ? "fr" : "en";
}

export function InterfaceLanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<InterfaceLanguage>(initialLanguage);

  function setLanguage(nextLanguage: InterfaceLanguage) {
    localStorage.setItem(STORAGE_KEY, nextLanguage);
    setLanguageState(nextLanguage);
  }

  useEffect(() => {
    document.documentElement.lang = language;
    const translate = (source:string) => {
      let result=source;
      const ordered=[...PHRASES].sort((a,b)=>Math.max(b[0].length,b[1].length)-Math.max(a[0].length,a[1].length));
      for(const [fr,en] of ordered){
        const from=language==="fr"?en:fr;
        const to=language==="fr"?fr:en;
        if(result.includes(from))result=result.split(from).join(to);
      }
      return result;
    };
    const applyTranslations = (root:Node) => {
      if(root instanceof Element && root.closest("[data-language-neutral='true']"))return;
      if(root.nodeType===Node.TEXT_NODE){
        const source=originalText.get(root)??root.textContent??"";
        if(!originalText.has(root))originalText.set(root,source);
        const translated=translate(source);
        if(root.textContent!==translated)root.textContent=translated;
        return;
      }
      if(root instanceof Element){
        const saved=originalAttributes.get(root)??new Map<string,string>();
        for(const attribute of ["placeholder","title","aria-label"]){
          const current=root.getAttribute(attribute);
          if(current!=null&&!saved.has(attribute))saved.set(attribute,current);
          const source=saved.get(attribute);
          if(source!=null)root.setAttribute(attribute,translate(source));
        }
        originalAttributes.set(root,saved);
      }
      root.childNodes.forEach(applyTranslations);
    };
    applyTranslations(document.body);
    const observer=new MutationObserver((mutations)=>{
      for(const mutation of mutations)mutation.addedNodes.forEach(applyTranslations);
    });
    observer.observe(document.body,{childList:true,subtree:true});
    return()=>observer.disconnect();
  }, [language]);

  const value = useMemo<LanguageContextValue>(() => ({
    language,
    setLanguage,
    text: (fr, en) => language === "fr" ? fr : en,
  }), [language]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useInterfaceLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useInterfaceLanguage must be used inside InterfaceLanguageProvider");
  return context;
}

export function InterfaceLanguageSelector() {
  const { language, setLanguage, text } = useInterfaceLanguage();
  return (
    <div className="fixed bottom-4 left-4 z-[2000] flex items-center gap-1 rounded-xl border border-slate-200 bg-white/95 p-1 shadow-lg backdrop-blur" aria-label={text("Langue de l’interface","Interface language")}>
      <Languages className="mx-1 h-4 w-4 text-slate-500"/>
      {(["fr","en"] as const).map((option)=>(
        <button key={option} type="button" onClick={()=>setLanguage(option)} aria-pressed={language===option} className={`h-8 rounded-lg px-3 text-xs font-bold transition-colors ${language===option?"bg-primary text-white":"text-slate-600 hover:bg-slate-100"}`}>
          {option.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
