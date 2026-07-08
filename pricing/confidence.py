from __future__ import annotations


WEIGHTS = {
    "type_panne": 0.30,
    "urgence": 0.20,
    "marque": 0.15,
    "age_appareil": 0.20,
    "accessibilite": 0.15,
}


def confidence_score(params: dict) -> float:
    total_weight = sum(WEIGHTS.values())
    matched_weight = 0.0

    if params.get("type_panne") and params["type_panne"] != "inconnu":
        matched_weight += WEIGHTS["type_panne"]
    if params.get("urgence") and params["urgence"] != "inconnu":
        matched_weight += WEIGHTS["urgence"]
    if params.get("marque"):
        matched_weight += WEIGHTS["marque"]
    if params.get("age_appareil") is not None:
        matched_weight += WEIGHTS["age_appareil"]
    if params.get("accessibilite") and params["accessibilite"] != "inconnu":
        matched_weight += WEIGHTS["accessibilite"]

    return round(matched_weight / total_weight, 3)
