from __future__ import annotations

import re
from typing import Any


SERVICE_KEYWORDS = {
    "recharge_fluide": ["recharge", "fluide", "gaz"],
    "fuite_detectee": ["fuite", "detection fuite", "reparation fuite"],
    "panne_compresseur": ["compresseur", "panne compresseur"],
    "entretien_annuel": ["entretien", "maintenance annuelle", "visite annuelle"],
}

PRICE_REGEX = re.compile(r"(\d{2,5}(?:[\.,]\d{1,2})?)\s*(DT|TND|EUR|€)", flags=re.IGNORECASE)


def _currency_to_dt(value: float, currency: str) -> float:
    upper = currency.upper()
    if upper in {"EUR", "€"}:
        return value * 3.4
    return value


def _extract_text_from_pdf(content: bytes) -> str:
    if content.startswith(b"%PDF"):
        try:
            from pypdf import PdfReader

            # pypdf supports file-like objects.
            import io

            reader = PdfReader(io.BytesIO(content))
            page_text = []
            for page in reader.pages:
                page_text.append(page.extract_text() or "")
            text = "\n".join(page_text).strip()
            if text:
                return text
        except Exception:
            pass

    # fallback: best-effort decode for text-like PDF payloads
    return content.decode("latin-1", errors="ignore")


def _find_price_near_keyword(text: str, keywords: list[str]) -> float | None:
    lower = text.lower()

    # First pass: line-based match is more reliable for tariff tables.
    for line in text.splitlines():
        line_lower = line.lower()
        if not any(keyword in line_lower for keyword in keywords):
            continue

        match = PRICE_REGEX.search(line)
        if not match:
            continue

        raw_value = match.group(1).replace(",", ".")
        currency = match.group(2)
        try:
            value = float(raw_value)
        except ValueError:
            continue

        return round(_currency_to_dt(value, currency), 2)

    # Second pass: within global text, search only after keyword position.
    for keyword in keywords:
        idx = lower.find(keyword)
        if idx < 0:
            continue

        window_end = min(len(text), idx + 220)
        window = text[idx:window_end]
        match = PRICE_REGEX.search(window)
        if not match:
            continue

        raw_value = match.group(1).replace(",", ".")
        currency = match.group(2)
        try:
            value = float(raw_value)
        except ValueError:
            continue

        return round(_currency_to_dt(value, currency), 2)

    return None


def extract_price_rules_from_pdf(content: bytes) -> dict[str, Any]:
    text = _extract_text_from_pdf(content)
    rules: list[dict[str, Any]] = []

    for service_type, keywords in SERVICE_KEYWORDS.items():
        price_dt = _find_price_near_keyword(text, keywords)
        if price_dt is None:
            continue
        rules.append({"service_type": service_type, "price_dt": price_dt})

    return {
        "raw_text_length": len(text),
        "rules": rules,
    }
