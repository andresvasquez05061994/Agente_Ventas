"""Configuración centralizada de la plataforma por fases."""

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "data" / "leads.db"

# ── Fase activa del proyecto ──────────────────────────────────────────────
# 1 = Plataforma integrada de Leads (Apollo + gestión)
# 2 = Configuración avanzada de base de datos
# 3 = Integración agente WhatsApp + Mistral
CURRENT_PHASE = 1

PHASE_LABELS = {
    1: "Plataforma integrada de Leads",
    2: "Configuración de base de datos",
    3: "Agente WhatsApp + Mistral",
}

# ── Apollo (Fase 1) ───────────────────────────────────────────────────────
APOLLO_API_KEY = os.getenv("APOLLO_API_KEY", "")
APOLLO_BASE_URL = os.getenv("APOLLO_BASE_URL", "https://api.apollo.io/api/v1")

# ── Mistral / WhatsApp (Fase 3 — aún no activos) ─────────────────────────
MISTRAL_API_KEY = os.getenv("MISTRAL_API_KEY", "")
MISTRAL_AGENT_ID = os.getenv(
    "MISTRAL_AGENT_ID", "ag_019ed5b36de7773894387f3ed518b45a"
)
SALES_EMAIL = os.getenv("SALES_EMAIL", "")

# ── Estados de lead (Fase 1) ────────────────────────────────────────────────
LEAD_STATUS_NEW = "Nuevo"
LEAD_STATUS_REVIEW = "En revisión"
LEAD_STATUS_APPROVED = "Aprobado para contacto"
LEAD_STATUS_DISCARDED = "Descartado"

LEAD_STATUSES = [
    LEAD_STATUS_NEW,
    LEAD_STATUS_REVIEW,
    LEAD_STATUS_APPROVED,
    LEAD_STATUS_DISCARDED,
]

# ── Estados WhatsApp (Fase 3) ─────────────────────────────────────────────
WHATSAPP_NOT_STARTED = "No iniciado"
WHATSAPP_STATUS_PENDING = "Pendiente"
WHATSAPP_STATUS_QUEUED = "Encolado"
WHATSAPP_STATUS_SENT = "Enviado"
WHATSAPP_STATUS_IN_CONVERSATION = "En conversación"
WHATSAPP_STATUS_SCHEDULED = "Agendado"
WHATSAPP_STATUS_ERROR = "Error"
WHATSAPP_STATUS_NO_PHONE = "Sin teléfono"
