from __future__ import annotations

from pricing.tables import get_base_price, get_standard_hours


DEFAULT_RATE = 55.0
DEFAULT_MARGIN = 35.0
DEFAULT_CURRENCY = "DT"


URGENCY_MULTIPLIERS = {
    "urgent": 1.25,
    "normal": 1.0,
    "inconnu": 1.1,
}


COMPLEXITY_MULTIPLIERS = {
    "facile": 0.95,
    "difficile": 1.2,
    "inconnu": 1.05,
}


def calculate_price(params: dict) -> int:
    type_panne = params.get("type_panne") or "entretien_annuel"
    base = get_base_price(type_panne)
    standard_hours = get_standard_hours(type_panne)

    urgency_mult = URGENCY_MULTIPLIERS.get(params.get("urgence"), 1.1)

    accessibilite = params.get("accessibilite")
    complexity_mult = COMPLEXITY_MULTIPLIERS.get(accessibilite, 1.05)

    age_appareil = params.get("age_appareil")
    if isinstance(age_appareil, (int, float)) and age_appareil >= 10:
        complexity_mult += 0.1

    region_mult = float(params.get("region_mult") or 1.0)
    hourly_rate = float(params.get("taux_horaire") or DEFAULT_RATE)
    margin = float(params.get("marge") or DEFAULT_MARGIN)
    hours = float(params.get("heures") or standard_hours)

    price = (
        base * urgency_mult * complexity_mult
        + hours * hourly_rate * region_mult
        + margin
    )
    return int(round(price / 10.0) * 10)
