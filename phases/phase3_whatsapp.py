"""
Fase 3 — Integración agente WhatsApp + Mistral (próximamente).

Al activar CURRENT_PHASE = 3 en config.py, se habilitará:
  - Worker en segundo plano (whatsapp_worker.py)
  - Primer mensaje personalizado vía Mistral Agent
  - Webhook para respuestas entrantes de WhatsApp
  - Historial de conversaciones por lead
  - Detección de interés y notificación por correo
"""

from __future__ import annotations

from typing import Any

from config import MISTRAL_AGENT_ID, SALES_EMAIL


def is_enabled(current_phase: int) -> bool:
    return current_phase >= 3


def get_phase3_status() -> dict[str, Any]:
    return {
        "enabled": False,
        "message": "Fase 3 pendiente. Requiere Fase 2 completada y credenciales WhatsApp.",
        "mistral_agent_id": MISTRAL_AGENT_ID,
        "sales_email": SALES_EMAIL or "(no configurado)",
        "modules": ["mistral_agent.py", "whatsapp_worker.py"],
    }
