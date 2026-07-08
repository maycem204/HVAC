import json
from typing import Optional, Literal
from pydantic import BaseModel, ConfigDict
from openai import OpenAI

# =========================================================
# CONFIG LM STUDIO
# =========================================================

client = OpenAI(
    base_url="http://localhost:1234/v1",
    api_key="lm-studio"
)

NOM_MODELE = "local-model"

# =========================================================
# SCHEMA
# =========================================================

class HVACRequestFeatures(BaseModel):
    model_config = ConfigDict(extra="ignore")

    type_intervention: Optional[Literal["Reparation", "Installation", "Entretien", "Inconnu"]] = None
    categorie_excel: Optional[Literal["Climatisation", "Chauffage", "Ventilation", "Controles", "Inconnu"]] = None
    type_appareil: Optional[str] = None
    manifestation_panne: Optional[Literal[
        "ne_demarre_pas", "bruit", "fuite_eau",
        "fuite_gaz", "pas_de_froid_chaud", "disjoncte"
    ]] = None
    pays: Optional[str] = None

# =========================================================
# EXTRACTION PROMPT
# =========================================================

EXTRACTION_SYSTEM_PROMPT = """
Tu es un extracteur de données HVAC.

Règles:
- retourne UNIQUEMENT un JSON valide
- aucune phrase
- aucune explication

Champs:
- type_intervention
- categorie_excel
- manifestation_panne
- type_appareil
- pays
"""

# =========================================================
# LOGIQUE
# =========================================================

FIELD_PRIORITY = [
    "type_intervention",
    "categorie_excel",
    "manifestation_panne",
    "type_appareil"
]

FALLBACK_QUESTIONS = {
    "type_intervention": "S'agit-il d'une réparation, installation ou entretien ?",
    "categorie_excel": "Climatisation ou chauffage ?",
    "manifestation_panne": "Quel est le problème (bruit, fuite, ne démarre pas) ?",
    "type_appareil": "Quel type d'appareil utilisez-vous ?"
}

# =========================================================
# UTILS
# =========================================================

def merge_features(old: dict, new: dict) -> dict:
    merged = dict(old)
    for k, v in new.items():
        if v is not None and v != "Inconnu":
            merged[k] = v
    return merged


def get_missing_field(features: dict):
    for f in FIELD_PRIORITY:
        if not features.get(f):
            return f
    return None


def llm_generate_reply(conversation_history: list, current_question: str) -> str:
    last_user_message = ""
    for item in reversed(conversation_history):
        if item.get("role") == "user" and item.get("content"):
            last_user_message = str(item["content"]).strip()
            break

    if last_user_message:
        return f"Merci. {current_question}"

    return current_question

# =========================================================
# EXTRACTION LLM
# =========================================================

def llm_extract_features(user_message: str) -> dict:
    try:
        response = client.chat.completions.create(
            model=NOM_MODELE,
            messages=[
                {"role": "system", "content": EXTRACTION_SYSTEM_PROMPT},
                {"role": "user", "content": user_message}
            ],
            temperature=0
        )

        content = response.choices[0].message.content.strip()

        # extraction JSON safe
        start = content.find("{")
        end = content.rfind("}")

        if start == -1 or end == -1:
            return {}

        content = content[start:end+1]

        return json.loads(content)

    except Exception as e:
        print(f"[DEBUG] extraction error: {e}")
        return {}

# =========================================================
# BOT LOGIC (IMPORTANT)
# =========================================================

def run_chatbot():
    print("\n=== HVAC BOT PRO (STABLE VERSION) ===\n")

    known_features = {
        "type_intervention": None,
        "categorie_excel": None,
        "type_appareil": None,
        "manifestation_panne": None,
        "pays": "Tunisie"
    }

    first = get_missing_field(known_features)
    print(f"Assistant > {FALLBACK_QUESTIONS[first]}")

    while True:
        user_input = input("\nClient > ").strip()

        if user_input.lower() == "quit":
            break

        if not user_input:
            continue

        # =========================
        # EXTRACTION
        # =========================
        extracted = llm_extract_features(user_input)
        known_features = merge_features(known_features, extracted)

        # =========================
        # DECISION LOGIQUE (CODE ONLY)
        # =========================
        missing = get_missing_field(known_features)

        # =========================
        # FIN DU FLOW
        # =========================
        if missing is None:
            print("\nAssistant > Merci, votre demande est complète et en cours d'analyse.")
            print("\nDEBUG FINAL:")
            print(json.dumps(known_features, indent=2, ensure_ascii=False))
            break

        # =========================
        # QUESTION FIXE (PAS DE LLM ICI)
        # =========================
        print(f"\nAssistant > {FALLBACK_QUESTIONS[missing]}")

# =========================================================

if __name__ == "__main__":
    run_chatbot()