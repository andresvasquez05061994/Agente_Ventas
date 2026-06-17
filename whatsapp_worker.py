"""
Worker en segundo plano para WhatsApp — Fase 3 (inactivo hasta activar CURRENT_PHASE = 3).

Toma leads aprobados, genera mensajes con Mistral y gestiona conversaciones.
"""

from __future__ import annotations

import logging
import sys
import time

from config import (
    CURRENT_PHASE,
    LEAD_STATUS_APPROVED,
    WHATSAPP_STATUS_ERROR,
    WHATSAPP_STATUS_IN_CONVERSATION,
    WHATSAPP_STATUS_NO_PHONE,
    WHATSAPP_STATUS_PENDING,
    WHATSAPP_STATUS_QUEUED,
    WHATSAPP_STATUS_SENT,
)
from database import (
    get_leads_by_whatsapp_status,
    save_message,
    update_lead_conversation,
    update_lead_whatsapp_status,
)
from mistral_agent import MistralAgentError, SalesAgent

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def _ensure_phase3() -> None:
    if CURRENT_PHASE < 3:
        logger.error(
            "WhatsApp worker requiere Fase 3. Cambia CURRENT_PHASE = 3 en config.py"
        )
        sys.exit(1)


def process_pending_leads(batch_size: int = 5, sleep_seconds: int = 10) -> None:
    """
    Bucle de procesamiento para leads con WhatsApp pendiente.

    Solo procesa leads con lead_status = 'Aprobado para contacto'.
    """
    _ensure_phase3()

    try:
        agent = SalesAgent()
    except MistralAgentError as exc:
        logger.error("No se pudo iniciar el agente Mistral: %s", exc)
        return

    while True:
        pending = get_leads_by_whatsapp_status(WHATSAPP_STATUS_PENDING)[:batch_size]
        pending = [l for l in pending if l.get("lead_status") == LEAD_STATUS_APPROVED]

        if not pending:
            logger.info("Sin leads pendientes. Esperando %ss...", sleep_seconds)
            time.sleep(sleep_seconds)
            continue

        for lead in pending:
            lead_id = lead["id"]
            telefono = lead.get("telefono")

            if not telefono:
                update_lead_whatsapp_status(lead_id, WHATSAPP_STATUS_NO_PHONE)
                logger.warning("Lead %s sin teléfono.", lead_id)
                continue

            try:
                update_lead_whatsapp_status(lead_id, WHATSAPP_STATUS_QUEUED)
                message, conv_id = agent.generate_first_message(lead)

                save_message(lead_id, telefono, "outbound", message)
                if conv_id:
                    update_lead_conversation(lead_id, conv_id)

                # Aquí irá send_whatsapp(telefono, message) con la API de Meta/Twilio
                update_lead_whatsapp_status(lead_id, WHATSAPP_STATUS_SENT)
                logger.info("Lead %s: mensaje generado para %s", lead_id, telefono)

            except MistralAgentError as exc:
                update_lead_whatsapp_status(lead_id, WHATSAPP_STATUS_ERROR)
                logger.error("Error en lead %s: %s", lead_id, exc)

        time.sleep(sleep_seconds)


def handle_inbound_whatsapp(telefono: str, mensaje: str) -> str | None:
    """Punto de entrada para webhooks de WhatsApp (Fase 3)."""
    _ensure_phase3()

    from config import WHATSAPP_STATUS_SCHEDULED
    from database import get_lead_by_phone

    lead = get_lead_by_phone(telefono)
    if not lead:
        logger.warning("Mensaje de número desconocido: %s", telefono)
        return None

    agent = SalesAgent()
    save_message(lead["id"], telefono, "inbound", mensaje)

    reply, conv_id = agent.handle_inbound_message(
        lead, mensaje, lead.get("mistral_conversation_id")
    )
    save_message(lead["id"], telefono, "outbound", reply)

    if conv_id:
        update_lead_conversation(lead["id"], conv_id)

    update_lead_whatsapp_status(lead["id"], WHATSAPP_STATUS_IN_CONVERSATION)

    if agent.detect_scheduling_intent(mensaje):
        update_lead_whatsapp_status(lead["id"], WHATSAPP_STATUS_SCHEDULED)
        logger.info("Lead %s: interés en agendar detectado.", lead["id"])

    return reply


if __name__ == "__main__":
    process_pending_leads()
