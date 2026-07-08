from __future__ import annotations

import hashlib
import os
import secrets
import sqlite3
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any


BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = BASE_DIR / "data" / "outcomes.sqlite3"
PDF_DIR = BASE_DIR / "data" / "technician_pdfs"


def get_connection() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def initialize_auth_db() -> None:
    PDF_DIR.mkdir(parents=True, exist_ok=True)
    with get_connection() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                role TEXT NOT NULL CHECK(role IN ('client', 'technician')),
                full_name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                region TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                password_salt TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                expires_at TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS technician_price_docs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                original_filename TEXT NOT NULL,
                file_path TEXT NOT NULL,
                content_type TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS technician_price_rules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                service_type TEXT NOT NULL,
                price_dt REAL NOT NULL,
                source_doc_id INTEGER,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id),
                FOREIGN KEY (source_doc_id) REFERENCES technician_price_docs(id)
            )
            """
        )


def _hash_password(password: str, salt_hex: str) -> str:
    payload = (salt_hex + password).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def create_user(role: str, full_name: str, email: str, region: str, password: str) -> dict[str, Any]:
    initialize_auth_db()
    salt_hex = secrets.token_hex(16)
    password_hash = _hash_password(password, salt_hex)

    with get_connection() as connection:
        cursor = connection.execute(
            """
            INSERT INTO users (role, full_name, email, region, password_hash, password_salt)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (role, full_name.strip(), email.strip().lower(), region.strip(), password_hash, salt_hex),
        )
        user_id = int(cursor.lastrowid)

    return {
        "id": user_id,
        "role": role,
        "full_name": full_name.strip(),
        "email": email.strip().lower(),
        "region": region.strip(),
    }


def get_user_by_email(email: str) -> dict[str, Any] | None:
    initialize_auth_db()
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT id, role, full_name, email, region, password_hash, password_salt
            FROM users
            WHERE email = ?
            """,
            (email.strip().lower(),),
        ).fetchone()

    return dict(row) if row else None


def create_session(user_id: int, days_valid: int = 7) -> str:
    initialize_auth_db()
    token = secrets.token_urlsafe(32)
    expires_at = (datetime.now(UTC) + timedelta(days=days_valid)).isoformat()

    with get_connection() as connection:
        connection.execute(
            """
            INSERT INTO sessions (token, user_id, expires_at)
            VALUES (?, ?, ?)
            """,
            (token, user_id, expires_at),
        )

    return token


def authenticate_user(email: str, password: str, role: str | None = None) -> dict[str, Any] | None:
    user = get_user_by_email(email)
    if not user:
        return None

    if role and user["role"] != role:
        return None

    expected_hash = _hash_password(password, user["password_salt"])
    if expected_hash != user["password_hash"]:
        return None

    return {
        "id": user["id"],
        "role": user["role"],
        "full_name": user["full_name"],
        "email": user["email"],
        "region": user["region"],
    }


def get_user_by_token(token: str) -> dict[str, Any] | None:
    initialize_auth_db()
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT u.id, u.role, u.full_name, u.email, u.region, s.expires_at
            FROM sessions s
            JOIN users u ON u.id = s.user_id
            WHERE s.token = ?
            """,
            (token,),
        ).fetchone()

    if not row:
        return None

    user = dict(row)
    try:
        expires_at = datetime.fromisoformat(user["expires_at"])
    except ValueError:
        return None

    if expires_at < datetime.now(UTC):
        return None

    user.pop("expires_at", None)
    return user


def save_technician_pdf(user_id: int, filename: str, content: bytes, content_type: str | None) -> dict[str, Any]:
    initialize_auth_db()
    safe_name = os.path.basename(filename) or "prices.pdf"
    timestamp = datetime.now(UTC).strftime("%Y%m%d%H%M%S")
    stored_name = f"{user_id}_{timestamp}_{safe_name}"
    full_path = PDF_DIR / stored_name
    full_path.write_bytes(content)

    with get_connection() as connection:
        cursor = connection.execute(
            """
            INSERT INTO technician_price_docs (user_id, original_filename, file_path, content_type)
            VALUES (?, ?, ?, ?)
            """,
            (user_id, safe_name, str(full_path), content_type),
        )
        doc_id = int(cursor.lastrowid)

    return {
        "id": doc_id,
        "user_id": user_id,
        "original_filename": safe_name,
        "file_path": str(full_path),
        "content_type": content_type,
    }


def list_technician_docs(user_id: int) -> list[dict[str, Any]]:
    initialize_auth_db()
    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT id, original_filename, file_path, content_type, created_at
            FROM technician_price_docs
            WHERE user_id = ?
            ORDER BY created_at DESC, id DESC
            """,
            (user_id,),
        ).fetchall()

    return [dict(row) for row in rows]


def replace_technician_price_rules(
    user_id: int,
    price_rules: list[dict[str, Any]],
    source_doc_id: int | None,
) -> list[dict[str, Any]]:
    initialize_auth_db()
    with get_connection() as connection:
        connection.execute("DELETE FROM technician_price_rules WHERE user_id = ?", (user_id,))
        for rule in price_rules:
            connection.execute(
                """
                INSERT INTO technician_price_rules (user_id, service_type, price_dt, source_doc_id)
                VALUES (?, ?, ?, ?)
                """,
                (user_id, rule["service_type"], float(rule["price_dt"]), source_doc_id),
            )

    return list_technician_price_rules(user_id)


def list_technician_price_rules(user_id: int) -> list[dict[str, Any]]:
    initialize_auth_db()
    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT id, user_id, service_type, price_dt, source_doc_id, created_at
            FROM technician_price_rules
            WHERE user_id = ?
            ORDER BY created_at DESC, id DESC
            """,
            (user_id,),
        ).fetchall()

    return [dict(row) for row in rows]


def get_technician_price_rule(user_id: int, service_type: str) -> dict[str, Any] | None:
    initialize_auth_db()
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT id, user_id, service_type, price_dt, source_doc_id, created_at
            FROM technician_price_rules
            WHERE user_id = ? AND service_type = ?
            ORDER BY created_at DESC, id DESC
            LIMIT 1
            """,
            (user_id, service_type),
        ).fetchone()

    return dict(row) if row else None
