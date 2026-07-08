from __future__ import annotations

import re
from datetime import UTC, datetime
from typing import Any
from urllib.parse import quote_plus

import requests
from bs4 import BeautifulSoup


HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    )
}

# broad regex that captures values like 120 DT, 80 TND, 60 EUR, etc.
PRICE_TOKEN = re.compile(
    r"(?P<value>\d{2,5}(?:[\.,]\d{1,2})?)\s*(?P<currency>DT|TND|EUR|€|dinar(?:s)?(?:\s+tunisiens?)?)",
    flags=re.IGNORECASE,
)


def _to_dt(value: float, currency: str) -> float:
    normalized = currency.upper()
    if normalized in {"EUR", "€"}:
        return value * 3.4
    return value


def _extract_prices_from_text(text: str) -> list[dict[str, Any]]:
    prices: list[dict[str, Any]] = []
    for match in PRICE_TOKEN.finditer(text):
        raw_value = match.group("value").replace(",", ".")
        try:
            parsed_value = float(raw_value)
        except ValueError:
            continue

        currency = match.group("currency")
        prices.append(
            {
                "raw": f"{match.group('value')} {currency}",
                "value": parsed_value,
                "currency": currency,
                "value_dt": round(_to_dt(parsed_value, currency), 2),
            }
        )
    return prices


def _fallback_prices(region: str) -> dict[str, Any]:
    fallback_by_region = {
        "tunis": [180, 220, 260],
        "sfax": [170, 210, 250],
        "sousse": [175, 215, 255],
        "default": [160, 200, 240],
    }
    values = fallback_by_region.get(region.strip().lower(), fallback_by_region["default"])
    return {
        "mode": "fallback",
        "query": f"prix climatisation {region}",
        "region": region,
        "sources": [],
        "prices": [{"raw": f"{v} DT", "value": float(v), "currency": "DT", "value_dt": float(v)} for v in values],
        "summary": {
            "count": len(values),
            "avg_dt": round(sum(values) / len(values), 2),
            "min_dt": float(min(values)),
            "max_dt": float(max(values)),
        },
        "scraped_at": datetime.now(UTC).isoformat(),
    }


def scrape_market_prices(region: str, service_hint: str = "climatisation entretien reparation") -> dict[str, Any]:
    region_clean = region.strip()
    if not region_clean:
        return _fallback_prices("default")

    query = f"prix {service_hint} {region_clean}"
    url = f"https://www.bing.com/search?q={quote_plus(query)}"

    try:
        response = requests.get(url, headers=HEADERS, timeout=10)
        response.raise_for_status()
    except requests.RequestException:
        return _fallback_prices(region_clean)

    soup = BeautifulSoup(response.text, "html.parser")
    result_nodes = soup.select("li.b_algo")

    sources: list[dict[str, str]] = []
    prices: list[dict[str, Any]] = []

    for node in result_nodes[:8]:
        title_node = node.select_one("h2")
        link_node = node.select_one("h2 a")
        snippet_node = node.select_one("p")

        title = title_node.get_text(" ", strip=True) if title_node else "Source"
        link = link_node.get("href", "") if link_node else ""
        snippet = snippet_node.get_text(" ", strip=True) if snippet_node else node.get_text(" ", strip=True)

        if link:
            sources.append({"title": title, "url": link})

        prices.extend(_extract_prices_from_text(snippet))

    if not prices:
        return _fallback_prices(region_clean)

    values_dt = [entry["value_dt"] for entry in prices]

    return {
        "mode": "scraped",
        "query": query,
        "region": region_clean,
        "sources": sources,
        "prices": prices,
        "summary": {
            "count": len(prices),
            "avg_dt": round(sum(values_dt) / len(values_dt), 2),
            "min_dt": round(min(values_dt), 2),
            "max_dt": round(max(values_dt), 2),
        },
        "scraped_at": datetime.now(UTC).isoformat(),
    }
