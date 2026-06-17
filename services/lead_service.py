"""Capa de servicios — lógica de negocio de la Fase 1 (Leads)."""

from __future__ import annotations

import io
from typing import Any

import pandas as pd

from config import LEAD_STATUS_NEW, LEAD_STATUSES
from database import (
    delete_lead,
    delete_leads_bulk,
    get_all_leads,
    get_lead_by_id,
    get_lead_stats,
    save_leads,
    update_lead_notes,
    update_lead_status,
    update_leads_status_bulk,
)


def build_search_source_label(pais: str, cargo: str, keywords: str) -> str:
    parts = [p for p in (pais, cargo, keywords) if p and p.strip()]
    return " | ".join(parts) if parts else "Búsqueda Apollo"


def save_selected_from_apollo(
    selected_rows: list[dict[str, Any]],
    pais: str = "",
    cargo: str = "",
    keywords: str = "",
) -> tuple[int, int]:
    """Persiste los contactos seleccionados desde la tabla de Apollo."""
    fuente = build_search_source_label(pais, cargo, keywords)
    leads = [
        {
            "apollo_id": row["apollo_id"],
            "nombre": row["nombre"],
            "cargo": row.get("cargo"),
            "empresa": row.get("empresa"),
            "email": row.get("email"),
            "telefono": row.get("telefono"),
            "pais": row.get("pais"),
            "linkedin_url": row.get("linkedin_url"),
            "lead_status": LEAD_STATUS_NEW,
            "fuente_busqueda": fuente,
        }
        for row in selected_rows
        if row.get("apollo_id")
    ]
    return save_leads(leads, fuente_busqueda=fuente)


def filter_leads(
    status: str | None = None,
    search: str | None = None,
    contact_filter: str | None = None,
) -> list[dict[str, Any]]:
    has_phone = None
    has_email = None
    if contact_filter == "Con teléfono":
        has_phone = True
    elif contact_filter == "Con email":
        has_email = True
    elif contact_filter == "Sin teléfono":
        has_phone = False
    elif contact_filter == "Sin email":
        has_email = False

    status_filter = None if status in (None, "Todos") else status
    return get_all_leads(
        lead_status=status_filter,
        search_text=search or None,
        has_phone=has_phone,
        has_email=has_email,
    )


def get_dashboard_data() -> dict[str, Any]:
    stats = get_lead_stats()
    return {
        "total": stats["total"],
        "approved": stats["approved_for_contact"],
        "with_phone": stats["with_phone"],
        "with_email": stats["with_email"],
        "by_status": stats["by_status"],
    }


def export_leads_csv(leads: list[dict[str, Any]]) -> bytes:
    """Genera un CSV en memoria para descarga."""
    if not leads:
        df = pd.DataFrame(columns=[
            "id", "nombre", "cargo", "empresa", "email", "telefono",
            "pais", "lead_status", "fuente_busqueda", "created_at",
        ])
    else:
        df = pd.DataFrame(leads)
        export_cols = [
            c for c in [
                "id", "apollo_id", "nombre", "cargo", "empresa", "email",
                "telefono", "pais", "linkedin_url", "lead_status",
                "whatsapp_status", "notas", "fuente_busqueda", "created_at",
            ]
            if c in df.columns
        ]
        df = df[export_cols]

    buffer = io.StringIO()
    df.to_csv(buffer, index=False, encoding="utf-8-sig")
    return buffer.getvalue().encode("utf-8-sig")


def change_lead_status(lead_id: int, new_status: str) -> bool:
    if new_status not in LEAD_STATUSES:
        return False
    update_lead_status(lead_id, new_status)
    return True


def change_leads_status_bulk(lead_ids: list[int], new_status: str) -> int:
    if new_status not in LEAD_STATUSES:
        return 0
    return update_leads_status_bulk(lead_ids, new_status)


def save_lead_notes(lead_id: int, notes: str) -> None:
    update_lead_notes(lead_id, notes)


def remove_lead(lead_id: int) -> bool:
    return delete_lead(lead_id)


def remove_leads_bulk(lead_ids: list[int]) -> int:
    return delete_leads_bulk(lead_ids)


def get_lead_detail(lead_id: int) -> dict[str, Any] | None:
    return get_lead_by_id(lead_id)
