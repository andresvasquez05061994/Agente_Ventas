"""Gestión de la base de datos SQLite — Fase 1 (leads) + preparado para Fases 2 y 3."""

from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Iterator

from config import (
    DB_PATH,
    LEAD_STATUS_NEW,
    WHATSAPP_NOT_STARTED,
)

SCHEMA_VERSION = 2


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


def _get_schema_version(conn: sqlite3.Connection) -> int:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS schema_meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
        """
    )
    row = conn.execute(
        "SELECT value FROM schema_meta WHERE key = 'version'"
    ).fetchone()
    return int(row["value"]) if row else 0


def _set_schema_version(conn: sqlite3.Connection, version: int) -> None:
    conn.execute(
        """
        INSERT INTO schema_meta (key, value) VALUES ('version', ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
        """,
        (str(version),),
    )


def _migrate_v1(conn: sqlite3.Connection) -> None:
    """Esquema inicial de leads."""
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS leads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            apollo_id TEXT NOT NULL UNIQUE,
            nombre TEXT NOT NULL,
            cargo TEXT,
            empresa TEXT,
            email TEXT,
            telefono TEXT,
            pais TEXT,
            linkedin_url TEXT,
            lead_status TEXT NOT NULL DEFAULT 'Nuevo',
            whatsapp_status TEXT NOT NULL DEFAULT 'No iniciado',
            mistral_conversation_id TEXT,
            notas TEXT,
            fuente_busqueda TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS whatsapp_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            lead_id INTEGER NOT NULL,
            telefono TEXT NOT NULL,
            direction TEXT NOT NULL CHECK(direction IN ('outbound', 'inbound')),
            content TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_leads_lead_status ON leads(lead_status);
        CREATE INDEX IF NOT EXISTS idx_leads_whatsapp_status ON leads(whatsapp_status);
        CREATE INDEX IF NOT EXISTS idx_leads_empresa ON leads(empresa);
        CREATE INDEX IF NOT EXISTS idx_messages_lead_id ON whatsapp_messages(lead_id);
        """
    )


def _migrate_v2(conn: sqlite3.Connection) -> None:
    """Añade columnas si la BD existía de una versión anterior."""
    columns = {
        row["name"] for row in conn.execute("PRAGMA table_info(leads)").fetchall()
    }
    additions = {
        "lead_status": f"TEXT NOT NULL DEFAULT '{LEAD_STATUS_NEW}'",
        "fuente_busqueda": "TEXT",
    }
    for col, definition in additions.items():
        if col not in columns:
            conn.execute(f"ALTER TABLE leads ADD COLUMN {col} {definition}")

    conn.execute(
        """
        UPDATE leads
        SET whatsapp_status = ?
        WHERE whatsapp_status = 'Pendiente' AND lead_status = 'Nuevo'
        """,
        (WHATSAPP_NOT_STARTED,),
    )


def init_db() -> None:
    """Inicializa y migra la base de datos al esquema actual."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with get_connection() as conn:
        version = _get_schema_version(conn)
        if version < 1:
            _migrate_v1(conn)
            _set_schema_version(conn, 1)
            version = 1
        if version < 2:
            _migrate_v2(conn)
            _set_schema_version(conn, 2)


@contextmanager
def get_connection() -> Iterator[sqlite3.Connection]:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def get_db_info() -> dict[str, Any]:
    """Información básica de la BD (usado en Fase 2)."""
    init_db()
    with get_connection() as conn:
        version = _get_schema_version(conn)
        lead_count = conn.execute("SELECT COUNT(*) AS c FROM leads").fetchone()["c"]
        msg_count = conn.execute(
            "SELECT COUNT(*) AS c FROM whatsapp_messages"
        ).fetchone()["c"]
    return {
        "path": str(DB_PATH),
        "schema_version": version,
        "total_leads": lead_count,
        "total_messages": msg_count,
        "exists": DB_PATH.exists(),
    }


def apollo_id_exists(apollo_id: str) -> bool:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT 1 FROM leads WHERE apollo_id = ?", (apollo_id,)
        ).fetchone()
    return row is not None


def save_leads(
    leads: list[dict[str, Any]],
    fuente_busqueda: str | None = None,
) -> tuple[int, int]:
    """
    Guarda leads evitando duplicados por apollo_id.

    Returns:
        (insertados, omitidos_por_duplicado)
    """
    inserted = 0
    skipped = 0
    now = _utcnow()

    with get_connection() as conn:
        for lead in leads:
            apollo_id = lead.get("apollo_id")
            if not apollo_id:
                continue
            try:
                conn.execute(
                    """
                    INSERT INTO leads (
                        apollo_id, nombre, cargo, empresa, email, telefono,
                        pais, linkedin_url, lead_status, whatsapp_status,
                        fuente_busqueda, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        apollo_id,
                        lead.get("nombre", ""),
                        lead.get("cargo"),
                        lead.get("empresa"),
                        lead.get("email"),
                        lead.get("telefono"),
                        lead.get("pais"),
                        lead.get("linkedin_url"),
                        lead.get("lead_status", LEAD_STATUS_NEW),
                        lead.get("whatsapp_status", WHATSAPP_NOT_STARTED),
                        fuente_busqueda or lead.get("fuente_busqueda"),
                        now,
                        now,
                    ),
                )
                inserted += 1
            except sqlite3.IntegrityError:
                skipped += 1

    return inserted, skipped


def get_all_leads(
    lead_status: str | None = None,
    search_text: str | None = None,
    has_phone: bool | None = None,
    has_email: bool | None = None,
) -> list[dict[str, Any]]:
    query = """
        SELECT id, apollo_id, nombre, cargo, empresa, email, telefono,
               pais, linkedin_url, lead_status, whatsapp_status,
               notas, fuente_busqueda, created_at, updated_at
        FROM leads
        WHERE 1=1
    """
    params: list[Any] = []

    if lead_status:
        query += " AND lead_status = ?"
        params.append(lead_status)
    if search_text:
        query += " AND (nombre LIKE ? OR empresa LIKE ? OR cargo LIKE ?)"
        term = f"%{search_text}%"
        params.extend([term, term, term])
    if has_phone is True:
        query += " AND telefono IS NOT NULL AND telefono != ''"
    elif has_phone is False:
        query += " AND (telefono IS NULL OR telefono = '')"
    if has_email is True:
        query += " AND email IS NOT NULL AND email != ''"
    elif has_email is False:
        query += " AND (email IS NULL OR email = '')"

    query += " ORDER BY created_at DESC"

    with get_connection() as conn:
        rows = conn.execute(query, params).fetchall()
    return [dict(row) for row in rows]


def get_lead_stats() -> dict[str, Any]:
    with get_connection() as conn:
        total = conn.execute("SELECT COUNT(*) AS c FROM leads").fetchone()["c"]
        by_status = conn.execute(
            """
            SELECT lead_status, COUNT(*) AS c
            FROM leads GROUP BY lead_status
            """
        ).fetchall()
        with_phone = conn.execute(
            """
            SELECT COUNT(*) AS c FROM leads
            WHERE telefono IS NOT NULL AND telefono != ''
            """
        ).fetchone()["c"]
        with_email = conn.execute(
            """
            SELECT COUNT(*) AS c FROM leads
            WHERE email IS NOT NULL AND email != ''
            """
        ).fetchone()["c"]
        approved = conn.execute(
            """
            SELECT COUNT(*) AS c FROM leads
            WHERE lead_status = 'Aprobado para contacto'
            """
        ).fetchone()["c"]

    return {
        "total": total,
        "by_status": {row["lead_status"]: row["c"] for row in by_status},
        "with_phone": with_phone,
        "with_email": with_email,
        "approved_for_contact": approved,
    }


def get_leads_by_whatsapp_status(status: str) -> list[dict[str, Any]]:
    """Reservado para Fase 3."""
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT id, apollo_id, nombre, cargo, empresa, email, telefono,
                   pais, lead_status, whatsapp_status, mistral_conversation_id
            FROM leads
            WHERE whatsapp_status = ?
            ORDER BY created_at ASC
            """,
            (status,),
        ).fetchall()
    return [dict(row) for row in rows]


def get_leads_by_status(status: str) -> list[dict[str, Any]]:
    return get_all_leads(lead_status=status)


def get_lead_by_id(lead_id: int) -> dict[str, Any] | None:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM leads WHERE id = ?", (lead_id,)).fetchone()
    return dict(row) if row else None


def get_lead_by_phone(telefono: str) -> dict[str, Any] | None:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM leads WHERE telefono = ?", (telefono,)
        ).fetchone()
    return dict(row) if row else None


def update_lead_status(lead_id: int, status: str) -> None:
    with get_connection() as conn:
        conn.execute(
            "UPDATE leads SET lead_status = ?, updated_at = ? WHERE id = ?",
            (status, _utcnow(), lead_id),
        )


def update_leads_status_bulk(lead_ids: list[int], status: str) -> int:
    if not lead_ids:
        return 0
    now = _utcnow()
    placeholders = ",".join("?" * len(lead_ids))
    with get_connection() as conn:
        cursor = conn.execute(
            f"""
            UPDATE leads SET lead_status = ?, updated_at = ?
            WHERE id IN ({placeholders})
            """,
            [status, now, *lead_ids],
        )
    return cursor.rowcount


def update_lead_notes(lead_id: int, notas: str) -> None:
    with get_connection() as conn:
        conn.execute(
            "UPDATE leads SET notas = ?, updated_at = ? WHERE id = ?",
            (notas, _utcnow(), lead_id),
        )


def delete_lead(lead_id: int) -> bool:
    with get_connection() as conn:
        cursor = conn.execute("DELETE FROM leads WHERE id = ?", (lead_id,))
    return cursor.rowcount > 0


def delete_leads_bulk(lead_ids: list[int]) -> int:
    if not lead_ids:
        return 0
    placeholders = ",".join("?" * len(lead_ids))
    with get_connection() as conn:
        cursor = conn.execute(
            f"DELETE FROM leads WHERE id IN ({placeholders})", lead_ids
        )
    return cursor.rowcount


def update_lead_whatsapp_status(lead_id: int, status: str) -> None:
    """Reservado para Fase 3."""
    with get_connection() as conn:
        conn.execute(
            "UPDATE leads SET whatsapp_status = ?, updated_at = ? WHERE id = ?",
            (status, _utcnow(), lead_id),
        )


def update_lead_conversation(lead_id: int, conversation_id: str) -> None:
    """Reservado para Fase 3."""
    with get_connection() as conn:
        conn.execute(
            """
            UPDATE leads
            SET mistral_conversation_id = ?, updated_at = ?
            WHERE id = ?
            """,
            (conversation_id, _utcnow(), lead_id),
        )


def save_message(
    lead_id: int,
    telefono: str,
    direction: str,
    content: str,
) -> None:
    """Reservado para Fase 3."""
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO whatsapp_messages (lead_id, telefono, direction, content, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (lead_id, telefono, direction, content, _utcnow()),
        )


def get_messages_for_lead(lead_id: int) -> list[dict[str, Any]]:
    """Reservado para Fase 3."""
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT id, direction, content, created_at
            FROM whatsapp_messages
            WHERE lead_id = ?
            ORDER BY created_at ASC
            """,
            (lead_id,),
        ).fetchall()
    return [dict(row) for row in rows]


def get_message_history_for_agent(lead_id: int) -> list[dict[str, str]]:
    """Reservado para Fase 3."""
    messages = get_messages_for_lead(lead_id)
    return [
        {
            "role": "assistant" if m["direction"] == "outbound" else "user",
            "content": m["content"],
        }
        for m in messages
    ]
