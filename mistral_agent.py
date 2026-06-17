"""Motor de conversación con el agente de Mistral para prospección B2B."""

from __future__ import annotations

from typing import Any

from mistralai import Mistral

from config import MISTRAL_AGENT_ID, MISTRAL_API_KEY, SALES_EMAIL


class MistralAgentError(Exception):
    """Error al comunicarse con Mistral."""


class SalesAgent:
    """
    Envuelve el Agent ID de Mistral para generar mensajes personalizados
    y mantener conversaciones multi-turno por lead.
    """

    FIRST_MESSAGE_PROMPT = """Genera el primer mensaje de WhatsApp para iniciar contacto B2B.

Contexto del lead:
- Nombre: {nombre}
- Cargo: {cargo}
- Empresa: {empresa}

Instrucciones:
- Mensaje breve (máximo 3 oraciones), tono profesional y cercano.
- Menciona su cargo o empresa de forma natural.
- Objetivo: abrir conversación para detectar si necesitan un diagnóstico de sus procesos.
- No incluyas saludos excesivos ni emojis.
- Responde SOLO con el texto del mensaje, sin comillas ni explicaciones."""

    INBOUND_CONTEXT_PROMPT = """El lead respondió por WhatsApp. Continúa la conversación de forma fluida.

Contexto del lead:
- Nombre: {nombre}
- Cargo: {cargo}
- Empresa: {empresa}

Mensaje recibido del lead:
"{mensaje_entrante}"

Objetivo de la conversación:
1. Detectar si existe un posible diagnóstico o necesidad de consultoría.
2. Si hay interés, proponer agendar una reunión y confirma que se notificará a {sales_email}.
3. Si no hay interés, agradece cordialmente y cierra sin insistir.

Responde SOLO con el texto del mensaje de WhatsApp a enviar."""

    def __init__(
        self,
        api_key: str | None = None,
        agent_id: str | None = None,
        sales_email: str | None = None,
    ):
        self.api_key = api_key or MISTRAL_API_KEY
        self.agent_id = agent_id or MISTRAL_AGENT_ID
        self.sales_email = sales_email or SALES_EMAIL or "ventas@empresa.com"

        if not self.api_key:
            raise MistralAgentError(
                "MISTRAL_API_KEY no configurada. Añádela en tu archivo .env"
            )

        self._client = Mistral(api_key=self.api_key)

    def _lead_context(self, lead: dict[str, Any]) -> dict[str, str]:
        return {
            "nombre": lead.get("nombre") or "estimado contacto",
            "cargo": lead.get("cargo") or "su rol",
            "empresa": lead.get("empresa") or "su empresa",
            "sales_email": self.sales_email,
        }

    @staticmethod
    def _extract_assistant_text(response: Any) -> str:
        """Extrae el texto de la respuesta del agente desde distintos formatos."""
        if hasattr(response, "outputs") and response.outputs:
            for output in response.outputs:
                content = getattr(output, "content", None)
                if content:
                    return str(content).strip()
                if hasattr(output, "message") and output.message:
                    return str(output.message).strip()

        if hasattr(response, "choices") and response.choices:
            choice = response.choices[0]
            message = getattr(choice, "message", None)
            if message and getattr(message, "content", None):
                return str(message.content).strip()

        if isinstance(response, dict):
            for key in ("outputs", "choices"):
                items = response.get(key, [])
                if items:
                    first = items[0]
                    if isinstance(first, dict):
                        return str(
                            first.get("content")
                            or first.get("message", {}).get("content", "")
                        ).strip()

        raise MistralAgentError("No se pudo extraer texto de la respuesta de Mistral")

    def generate_first_message(self, lead: dict[str, Any]) -> tuple[str, str | None]:
        """
        Genera el primer mensaje de WhatsApp para un lead.

        Returns:
            (mensaje, conversation_id)
        """
        prompt = self.FIRST_MESSAGE_PROMPT.format(**self._lead_context(lead))
        response = self._client.beta.conversations.start(
            agent_id=self.agent_id,
            inputs=prompt,
        )
        text = self._extract_assistant_text(response)
        conv_id = getattr(response, "conversation_id", None)
        return text, conv_id

    def handle_inbound_message(
        self,
        lead: dict[str, Any],
        mensaje_entrante: str,
        conversation_id: str | None = None,
    ) -> tuple[str, str | None]:
        """
        Procesa una respuesta entrante y genera la réplica del agente.

        Si existe conversation_id, continúa la conversación existente.
        """
        ctx = self._lead_context(lead)
        ctx["mensaje_entrante"] = mensaje_entrante
        prompt = self.INBOUND_CONTEXT_PROMPT.format(**ctx)

        if conversation_id:
            response = self._client.beta.conversations.append(
                conversation_id=conversation_id,
                inputs=prompt,
            )
        else:
            response = self._client.beta.conversations.start(
                agent_id=self.agent_id,
                inputs=prompt,
            )

        text = self._extract_assistant_text(response)
        conv_id = getattr(response, "conversation_id", None) or conversation_id
        return text, conv_id

    def detect_scheduling_intent(self, conversation_text: str) -> bool:
        """
        Heurística simple para detectar si el lead mostró interés en agendar.
        En fases posteriores esto puede delegarse al propio agente con tools.
        """
        keywords = (
            "agendar",
            "reunión",
            "reunion",
            "llamada",
            "disponible",
            "me interesa",
            "cuándo",
            "cuando",
            "horario",
            "cita",
        )
        lowered = conversation_text.lower()
        return any(kw in lowered for kw in keywords)
