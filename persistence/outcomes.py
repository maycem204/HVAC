from __future__ import annotations

import sqlite3
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = BASE_DIR / "data" / "outcomes.sqlite3"


def get_connection() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def initialize_db() -> None:
    with get_connection() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS quote_outcomes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type_panne TEXT NOT NULL,
                region TEXT NOT NULL,
                prix_estime REAL NOT NULL,
                prix_reel REAL NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )


def record_outcome(type_panne: str, region: str, prix_estime: float, prix_reel: float) -> None:
    initialize_db()
    with get_connection() as connection:
        connection.execute(
            """
            INSERT INTO quote_outcomes (type_panne, region, prix_estime, prix_reel)
            VALUES (?, ?, ?, ?)
            """,
            (type_panne, region, prix_estime, prix_reel),
        )


def get_records(type_panne: str, region: str) -> list[dict[str, object]]:
    initialize_db()
    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT id, type_panne, region, prix_estime, prix_reel, created_at
            FROM quote_outcomes
            WHERE type_panne = ? AND region = ?
            ORDER BY created_at DESC, id DESC
            """,
            (type_panne, region),
        ).fetchall()

    return [dict(row) for row in rows]


def maybe_adjust(type_panne: str, region: str) -> dict[str, object] | None:
    records = get_records(type_panne, region)
    if len(records) < 5:
        return None

    avg_estime = sum(float(record["prix_estime"]) for record in records) / len(records)
    avg_reel = sum(float(record["prix_reel"]) for record in records) / len(records)
    delta_ratio = (avg_reel - avg_estime) / avg_estime if avg_estime else 0.0

    if abs(delta_ratio) < 0.1:
        return None

    return {
        "type_panne": type_panne,
        "region": region,
        "records": len(records),
        "avg_estime": round(avg_estime, 2),
        "avg_reel": round(avg_reel, 2),
        "adjustment_ratio": round(delta_ratio, 3),
    }
