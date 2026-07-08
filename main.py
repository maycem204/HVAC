from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from llm.extractor import llm_extract_features, FIELD_PRIORITY, FALLBACK_QUESTIONS, merge_features, get_missing_field, llm_generate_reply
from persistence.auth import (
    authenticate_user,
    create_session,
    create_user,
    get_technician_price_rule,
    get_user_by_token,
    initialize_auth_db,
    list_technician_docs,
    list_technician_price_rules,
    replace_technician_price_rules,
    save_technician_pdf,
)
from persistence.outcomes import get_records, maybe_adjust, record_outcome
from pricing.confidence import confidence_score
from pricing.engine import DEFAULT_CURRENCY, calculate_price
from services.market_scraper import scrape_market_prices
from services.pdf_price_parser import extract_price_rules_from_pdf


BASE_DIR = Path(__file__).resolve().parent

load_dotenv(BASE_DIR / ".env")

app = FastAPI(title="HVAC Quote Chatbot", description="Chatbot de devis HVAC avec estimation paramétrique.")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5174", "http://localhost:5174", "http://localhost:5175", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class MessageIn(BaseModel):
    message: str = Field(min_length=1, max_length=2000)

class ChatSession(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    conversation_history: list = []
    known_features: dict = {}


class OutcomeIn(BaseModel):
    type_panne: str = Field(min_length=1, max_length=100)
    region: str = Field(min_length=1, max_length=100)
    prix_estime: float = Field(ge=0)
    prix_reel: float = Field(ge=0)


class RegisterIn(BaseModel):
    role: str = Field(pattern="^(client|technician)$")
    full_name: str = Field(min_length=2, max_length=120)
    email: str = Field(min_length=5, max_length=255)
    password: str = Field(min_length=6, max_length=120)
    region: str = Field(min_length=2, max_length=120)


class LoginIn(BaseModel):
    role: str = Field(pattern="^(client|technician)$")
    email: str = Field(min_length=5, max_length=255)
    password: str = Field(min_length=6, max_length=120)


class TechnicianPriceRuleIn(BaseModel):
    service_type: str = Field(pattern="^(recharge_fluide|fuite_detectee|panne_compresseur|entretien_annuel)$")
    price_dt: float = Field(gt=0)


class TechnicianPriceRulesIn(BaseModel):
    rules: list[TechnicianPriceRuleIn]


class AppointmentIn(BaseModel):
    client_id: int
    technician_id: int
    date: str
    time: str
    issue: str
    region: str


def _extract_bearer_token(authorization: str | None) -> str:
    if not authorization:
        raise HTTPException(status_code=401, detail="Authorization manquante")
    parts = authorization.split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(status_code=401, detail="Format Authorization invalide")
    return parts[1].strip()


def _current_user(authorization: str | None) -> dict:
    token = _extract_bearer_token(authorization)
    user = get_user_by_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Session invalide ou expirée")
    return user


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.on_event("startup")
def on_startup() -> None:
    initialize_auth_db()


@app.post("/auth/register")
def auth_register(body: RegisterIn) -> dict:
    try:
        user = create_user(body.role, body.full_name, body.email, body.region, body.password)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Impossible de créer le compte: {exc}") from exc

    token = create_session(user["id"])
    return {"status": "ok", "token": token, "user": user}


@app.post("/auth/login")
def auth_login(body: LoginIn) -> dict:
    user = authenticate_user(body.email, body.password, body.role)
    if not user:
        raise HTTPException(status_code=401, detail="Identifiants invalides")

    token = create_session(user["id"])
    return {"status": "ok", "token": token, "user": user}


@app.get("/me")
def me(authorization: str | None = Header(default=None)) -> dict:
    user = _current_user(authorization)
    return {"user": user}


@app.post("/technician/upload-price-pdf")
async def technician_upload_price_pdf(
    file: UploadFile = File(...),
    authorization: str | None = Header(default=None),
) -> dict:
    user = _current_user(authorization)
    if user["role"] != "technician":
        raise HTTPException(status_code=403, detail="Réservé aux techniciens")

    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Le fichier doit être un PDF")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Fichier vide")

    saved_doc = save_technician_pdf(user["id"], file.filename, content, file.content_type)
    parsed = extract_price_rules_from_pdf(content)
    saved_rules = replace_technician_price_rules(user["id"], parsed["rules"], saved_doc["id"])
    return {
        "status": "saved",
        "document": saved_doc,
        "parsed": {
            "raw_text_length": parsed["raw_text_length"],
            "rules_count": len(saved_rules),
            "rules": saved_rules,
        },
    }


@app.get("/technician/pdfs")
def technician_pdfs(authorization: str | None = Header(default=None)) -> dict:
    user = _current_user(authorization)
    if user["role"] != "technician":
        raise HTTPException(status_code=403, detail="Réservé aux techniciens")

    return {"documents": list_technician_docs(user["id"])}


@app.get("/technician/price-rules")
def technician_price_rules(authorization: str | None = Header(default=None)) -> dict:
    user = _current_user(authorization)
    if user["role"] != "technician":
        raise HTTPException(status_code=403, detail="Réservé aux techniciens")

    return {"rules": list_technician_price_rules(user["id"])}


@app.post("/technician/price-rules")
def technician_update_price_rules(
    body: TechnicianPriceRulesIn,
    authorization: str | None = Header(default=None),
) -> dict:
    user = _current_user(authorization)
    if user["role"] != "technician":
        raise HTTPException(status_code=403, detail="Réservé aux techniciens")

    sanitized_rules = [
        {
            "service_type": rule.service_type,
            "price_dt": round(float(rule.price_dt), 2),
        }
        for rule in body.rules
    ]
    saved_rules = replace_technician_price_rules(user["id"], sanitized_rules, None)
    return {"status": "updated", "rules": saved_rules}


@app.get("/market/prices")
def market_prices(
    counterparty_region: str | None = None,
    authorization: str | None = Header(default=None),
) -> dict:
    user = _current_user(authorization)

    own_market = scrape_market_prices(user["region"])
    counterparty_market = scrape_market_prices(counterparty_region) if counterparty_region else None

    return {
        "profile": {
            "role": user["role"],
            "name": user["full_name"],
            "region": user["region"],
        },
        "own_market": own_market,
        "counterparty_region": counterparty_region,
        "counterparty_market": counterparty_market,
    }


@app.post("/quote")
def get_quote(body: MessageIn, authorization: str | None = Header(default=None)) -> dict:
    params = llm_extract_features(body.message)
    score = confidence_score(params)
    source = params.pop("_source", "unknown")

    current_user = None
    if authorization:
        token = _extract_bearer_token(authorization)
        current_user = get_user_by_token(token)

    if score >= 0.75:
        price = calculate_price(params)

        price_source = "engine"
        if current_user and current_user.get("role") == "technician":
            rule = get_technician_price_rule(current_user["id"], params.get("type_panne", ""))
            if rule:
                price = round(float(rule["price_dt"]) / 10) * 10
                price_source = "technician_pdf"

        return {
            "confidence": "high",
            "confidence_score": score,
            "price": price,
            "currency": DEFAULT_CURRENCY,
            "price_text": f"{price} {DEFAULT_CURRENCY}",
            "range": {"min": round(price * 0.95, -1), "max": round(price * 1.05, -1)},
            "params": params,
            "source": source,
            "price_source": price_source,
        }

    if score >= 0.45:
        follow_up = "Quel est l'age de votre appareil et la marque exacte ?"
        return {
            "confidence": "medium",
            "confidence_score": score,
            "follow_up": follow_up,
            "params": params,
            "source": source,
        }

    return {
        "confidence": "low",
        "confidence_score": score,
        "message": "Une evaluation sur site est recommandee pour affiner le devis.",
        "params": params,
        "source": source,
    }


@app.post("/chat")
def chat(body: MessageIn, authorization: str | None = Header(default=None)) -> dict:
    quote = get_quote(body, authorization)

    if quote["confidence"] == "high":
        reply = (
            f"Je peux proposer un devis estime a {quote['price_text']}. "
            f"Fourchette indicative: {quote['range']['min']} a {quote['range']['max']} {quote['currency']}."
        )
    elif quote["confidence"] == "medium":
        reply = quote["follow_up"]
    else:
        reply = quote["message"]

    llm_label = "LLM actif" if quote.get("source") == "llm" else "Extraction de secours"
    return {"reply": reply, "quote": quote, "llm_status": llm_label}


# Nouvel endpoint pour le chatbot conversationnel avec extraction séquentielle
@app.post("/chat/conversation")
def chat_conversation(body: ChatSession) -> dict:
    """Endpoint qui utilise la logique de conversation séquentielle du chatbot"""
    user_message = body.message
    
    # Si c'est le premier message, initialiser
    if not body.conversation_history:
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
        
        # Première question
        first_missing = get_missing_field(known_features)
        current_question = FALLBACK_QUESTIONS[first_missing]
        conversation_history.append({"role": "assistant", "content": current_question})
        
        return {
            "reply": current_question,
            "conversation_history": conversation_history,
            "known_features": known_features,
            "is_complete": False
        }
    
    # Sinon, continuer la conversation
    known_features = body.known_features
    conversation_history = body.conversation_history
    
    # Extraction des features du message utilisateur
    extracted = llm_extract_features(user_message)
    known_features = merge_features(known_features, extracted)
    conversation_history.append({"role": "user", "content": user_message})
    
    # Vérifier si toutes les informations sont collectées
    missing_field = get_missing_field(known_features)
    
    if missing_field is None:
        # Toutes les informations sont collectées
        reply = "Merci beaucoup ! J'ai collecté toutes les informations nécessaires pour identifier précisément votre problème technique. Notre équipe analyse votre demande et vous transmet votre estimation immédiatement."
        return {
            "reply": reply,
            "conversation_history": conversation_history,
            "known_features": known_features,
            "is_complete": True
        }
    
    # Sinon, poser la prochaine question
    current_question = FALLBACK_QUESTIONS[missing_field]
    reply = llm_generate_reply(conversation_history, current_question)
    conversation_history.append({"role": "assistant", "content": reply})
    
    return {
        "reply": reply,
        "conversation_history": conversation_history,
        "known_features": known_features,
        "is_complete": False
    }


@app.post("/outcomes/record")
def record_quote(body: OutcomeIn) -> dict:
    record_outcome(body.type_panne, body.region, body.prix_estime, body.prix_reel)
    adjustment = maybe_adjust(body.type_panne, body.region)
    return {
        "status": "saved",
        "outcome": body.model_dump(),
        "adjustment": adjustment,
    }


@app.get("/outcomes")
def list_outcomes(type_panne: str, region: str) -> dict:
    records = get_records(type_panne, region)
    return {
        "type_panne": type_panne,
        "region": region,
        "count": len(records),
        "records": records,
        "adjustment": maybe_adjust(type_panne, region),
    }


# Appointment endpoints
@app.post("/appointments")
def create_appointment(
    body: AppointmentIn,
    authorization: str | None = Header(default=None),
) -> dict:
    user = _current_user(authorization)
    if user["role"] != "client":
        raise HTTPException(status_code=403, detail="Réservé aux clients")

    # In a real implementation, this would save to a database
    # For now, we'll return a mock response
    return {
        "status": "created",
        "appointment": {
            "id": 1,
            "client_id": body.client_id,
            "technician_id": body.technician_id,
            "date": body.date,
            "time": body.time,
            "issue": body.issue,
            "region": body.region,
            "status": "pending"
        }
    }


@app.get("/appointments")
def list_appointments(authorization: str | None = Header(default=None)) -> dict:
    user = _current_user(authorization)
    
    if user["role"] == "technician":
        # Return appointments for this technician
        # In a real implementation, this would query the database
        return {
            "appointments": [
                {
                    "id": 1,
                    "client_name": "Ahmed Ben Ali",
                    "region": "Tunis",
                    "date": "2026-06-28",
                    "time": "14:00",
                    "issue": "Climatisation qui ne refroidit plus",
                    "status": "confirmed"
                }
            ]
        }
    else:
        # Return appointments for this client
        return {
            "appointments": []
        }
