from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path


DATA_FILE = Path(__file__).resolve().parent.parent / "data" / "base_prices.json"


@lru_cache(maxsize=1)
def load_tables() -> dict:
    with DATA_FILE.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def get_base_price(type_panne: str) -> float:
    tables = load_tables()
    entry = tables.get(type_panne) or tables.get("entretien_annuel")
    return float(entry["base"])


def get_standard_hours(type_panne: str) -> float:
    tables = load_tables()
    entry = tables.get(type_panne) or tables.get("entretien_annuel")
    return float(entry["heures"])

