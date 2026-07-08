import json
from typing import Optional, Literal
from pydantic import BaseModel, ConfigDict, ValidationError
from openai import OpenAI

# =====================================================================
# 1. CONFIGURATION POUR LM STUDIO (LOCAL)
# =====================================================================

client = OpenAI(
    base_url="http://localhost:1234/v1", 
    api_key="lm-studio"
)

NOM_MODELE = "local-model" 

# =====================================================================
# 2. SCHEMA DES DONNÉES (STRUCTURE PYDANTIC V2)
# =====================================================================
class HVACRequestFeatures(BaseModel):
    model_config = ConfigDict(extra="ignore")

    type_intervention: Optional[Literal["Reparation", "Installation", "Entretien", "Inconnu"]] = None
    categorie_excel: Optional[Literal["Climatisation", "Chauffage", "Ventilation", "Controles", "Inconnu"]] = None
    type_appareil: Optional[str] = None 
    
    manifestation_panne: Optional[Literal["ne_demarre_pas", "bruit", "fuite_eau", "fuite_gaz", "pas_de_froid_chaud", "disjoncte"]] = None
    composant_suspect: Optional[str] = None 
    
    puissance_kw_btu: Optional[str] = None
    code_erreur: Optional[str] = None
    depuis_quand: Optional[str] = None
    pays: Optional[str] = None 
    urgence: Optional[Literal["Standard", "Rapide", "Urgent"]] = None

# =====================================================================
# 3. PROMPTS DU SYSTÈME (EXTRACTION ET RÉPONSE)
# =====================================================================

EXTRACTION_SYSTEM_PROMPT = """Tu es un robot d'extraction de données HVAC. Ton unique but est de renvoyer un objet JSON pur.
Analyse le message du client et remplis les champs suivants si l'information est présente :

1. 'type_intervention' : "Reparation" (si panne/anomalie), "Installation" ou "Entretien".
2. 'categorie_excel' : "Climatisation" (si split, inverter, froid, climatiseur) ou "Chauffage" (si chaudière, pompe à chaleur, radiateur, chaud).
3. 'manifestation_panne' : Choisis STRICTEMENT parmi : "ne_demarre_pas", "bruit", "fuite_eau", "fuite_gaz", "pas_de_froid_chaud", "disjoncte".
4. 'pays' : Remplis uniquement si une ville ou un pays est explicitement nommé.

Exemple de sortie attendue :
{
  "type_intervention": "Reparation",
  "categorie_excel": "Climatisation",
  "manifestation_panne": "bruit"
}
Remplis uniquement ce que tu es sûr d'avoir détecté. Ne rajoute aucun texte avant ou après le JSON."""

REPLY_SYSTEM_PROMPT = """Tu es une assistante commerciale experte en génie climatique (HVAC).

RÈGLE IMPÉRATIVE : On t'impose une question précise à poser (la 'Question Obligatoire'). Tu dois obligatoirement formuler ta réponse pour poser CETTE question et aucune autre. Ne commence pas à demander d'autres détails techniques."""

# =====================================================================
# 4. LOGIQUE MÉTIER ET ARBRE DE DIAGNOSTIC
# =====================================================================

FIELD_PRIORITY = ["type_intervention", "categorie_excel", "manifestation_panne", "type_appareil", "pays"]

FALLBACK_QUESTIONS = {
    "type_intervention": "S'agit-il d'une réparation, d'une installation neuve ou d'un entretien ?",
    "categorie_excel": "Votre demande concerne-t-elle un système de climatisation ou de chauffage ?",
    "manifestation_panne": "Que fait l'appareil exactement ? (Est-ce qu'il fuit, fait du bruit, ne démarre plus, ou ne fait plus de froid/chaud ?)",
    "type_appareil": "Quel est le type exact de votre appareil (climatiseur split mural, système central, chaudière...) ?",
    "pays": "Dans quelle ville ou quel pays se trouve l'appareil ?"
}

def merge_features(old: dict, new: dict) -> dict:
    merged = dict(old)
    for k, v in new.items():
        if v is not None and v != "Inconnu":
            merged[k] = v
    return merged

def get_missing_field(features: dict) -> Optional[str]:
    for field in FIELD_PRIORITY:
        if features.get(field) is None or features.get(field) == "Inconnu":
            return field
    return None

# =====================================================================
# 5. FONCTIONS D'APPEL AUX LLM LOCAUX (CORRIGÉES COMPATIBILITÉ)
# =====================================================================

def llm_extract_features(user_message: str) -> dict:
    """Appelle LM Studio en format texte standard, nettoie le Markdown et valide via Pydantic."""
    try:
        response = client.chat.completions.create(
            model=NOM_MODELE,
            messages=[
                {"role": "system", "content": EXTRACTION_SYSTEM_PROMPT},
                {"role": "user", "content": f"Message client : '{user_message}'"}
            ],
            temperature=0.0
            # Retrait du format_response restrictif pour éviter l'erreur 400
        )
        
        content = response.choices[0].message.content.strip()
        
        # Sécurité anti-Markdown : Nettoie les balises ```json si le modèle en génère
        if content.startswith("```"):
            lines = content.split("\n")
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines[-1].startswith("```"):
                lines = lines[:-1]
            content = "\n".join(lines).strip()
        
        # Validation stricte par Pydantic
        validated_features = HVACRequestFeatures.model_validate_json(content)
        return validated_features.model_dump(exclude_none=True)
        
    except ValidationError as e:
        print(f"[DEBUG ERR] Erreur validation structure JSON : {e}")
        return {}
    except Exception as e:
        print(f"[DEBUG ERR] Échec extraction : {e}")
        return {}

def llm_generate_reply(history: list, next_question: str, known_features: dict) -> str:
    """Génère la réponse finale en fournissant l'état actuel du fichier à l'assistante."""
    
    context_actuel = f"Voici les informations techniques déjà validées dans notre système (ne les redemande pas) : {json.dumps(known_features, ensure_ascii=False)}."
    
    messages = [
        {"role": "system", "content": REPLY_SYSTEM_PROMPT},
        {"role": "system", "content": context_actuel}
    ]
    messages.extend(history)
    messages.append({
        "role": "system", 
        "content": f"CONSIGNE STRICTE : Tu dois intégrer naturellement cette question exacte dans ta réponse : '{next_question}'"
    })
    
    try:
        response = client.chat.completions.create(
            model=NOM_MODELE,
            messages=messages,
            temperature=0.7
        )
        return response.choices[0].message.content
    except Exception as e:
        print(f"[DEBUG ERR] Échec génération réponse : {e}")
        return next_question

# =====================================================================
# 6. BOUCLE PRINCIPALE
# =====================================================================
def run_chatbot():
    print("\n=== HVAC BOT v4.1 (COMPATIBILITÉ LM STUDIO MAXIMALE) ===")
    print("Tapez 'quit' pour sortir, '/debug' pour voir l'état des cases JSON.\n")
    
    known_features = {
        "type_intervention": None,
        "categorie_excel": None,
        "type_appareil": None,
        "manifestation_panne": None,
        "composant_suspect": None,
        "puissance_kw_btu": None,
        "code_erreur": None,
        "depuis_quand": None,
        "pays": "Tunisie", 
        "urgence": None
    }
    
    conversation_history = []
    first_missing = get_missing_field(known_features)
    current_question = FALLBACK_QUESTIONS[first_missing]
    
    welcome_msg = f"Bonjour ! Bienvenue sur notre assistant technique. {current_question}"
    print(f"Assistant > {welcome_msg}")
    conversation_history.append({"role": "assistant", "content": welcome_msg})

    while True:
        user_input = input("\nClient > ").strip()
        
        if user_input.lower() == 'quit':
            break
            
        if user_input.lower() == '/debug':
            print("\n--- [DEBUG] CASES JSON ACTUELLES ---")
            print(json.dumps(known_features, indent=2, ensure_ascii=False))
            print("------------------------------------")
            continue

        if not user_input:
            continue

        # 1. Extraction et fusion
        extracted = llm_extract_features(user_input)
        known_features = merge_features(known_features, extracted)
        conversation_history.append({"role": "user", "content": user_input})
        
        # 2. Analyse de l'arbre
        missing_field = get_missing_field(known_features)
        
        if missing_field is None:
            print("\nAssistant > Merci beaucoup ! J'ai collecté toutes les informations nécessaires pour identifier précisément votre problème technique. Notre équipe analyse votre demande et vous transmet votre estimation immédiatement.")
            print("\n--- [DEBUG FINAL] Prêt pour l'intégration ---")
            print(json.dumps(known_features, indent=2, ensure_ascii=False))
            break
        
        # 3. Réponse fluide
        current_question = FALLBACK_QUESTIONS[missing_field]
        reply = llm_generate_reply(conversation_history, current_question, known_features)
        
        print(f"\nAssistant > {reply}")
        conversation_history.append({"role": "assistant", "content": reply})

if __name__ == "__main__":
    run_chatbot()