"""
Fase 2 — Configuración avanzada de base de datos (próximamente).

Al activar CURRENT_PHASE = 2 en config.py, se habilitará:
  - Panel de administración de la BD en Streamlit
  - Respaldo y restauración de leads.db
  - Migraciones de esquema versionadas
  - Limpieza de duplicados y mantenimiento
  - Estadísticas avanzadas y auditoría
"""

from __future__ import annotations

from typing import Any

from database import get_db_info, init_db


def is_enabled(current_phase: int) -> bool:
    return current_phase >= 2


def get_phase2_status() -> dict[str, Any]:
    init_db()
    info = get_db_info()
    return {
        "enabled": False,
        "message": "Fase 2 pendiente de activación. Cambia CURRENT_PHASE = 2 en config.py.",
        "db_info": info,
    }
