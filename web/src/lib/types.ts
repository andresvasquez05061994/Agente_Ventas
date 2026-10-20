export type LeadStatus = "Nuevo" | "En revisión";

export const LEAD_STATUSES: LeadStatus[] = ["Nuevo", "En revisión"];

export function isLeadStatus(value: unknown): value is LeadStatus {
  return typeof value === "string" && (LEAD_STATUSES as string[]).includes(value);
}

export type GestionResultado =
  | "Interesado"
  | "En seguimiento"
  | "No interesado"
  | "No contesta";

export const GESTION_RESULTADOS: GestionResultado[] = [
  "Interesado",
  "En seguimiento",
  "No interesado",
  "No contesta",
];

export function isGestionResultado(value: unknown): value is GestionResultado {
  return typeof value === "string" && (GESTION_RESULTADOS as string[]).includes(value);
}

/** No interesado y No contesta salen de la lista de trabajo. */
export function isOpenGestion(value: string | null | undefined): boolean {
  return !value || value === "Interesado" || value === "En seguimiento";
}

/**
 * Etapa comercial de la EMPRESA (no del contacto). Se fija desde la ficha y
 * aplica a todos los contactos de esa empresa del mismo vendedor.
 */
export type EtapaComercial = "Prospecto" | "Calificado" | "Oportunidad" | "Cliente";

export const ETAPAS_COMERCIALES: EtapaComercial[] = [
  "Prospecto",
  "Calificado",
  "Oportunidad",
  "Cliente",
];

export const DEFAULT_ETAPA: EtapaComercial = "Prospecto";

export function isEtapaComercial(value: unknown): value is EtapaComercial {
  return typeof value === "string" && (ETAPAS_COMERCIALES as string[]).includes(value);
}

export function etapaOf(value: string | null | undefined): EtapaComercial {
  return isEtapaComercial(value) ? value : DEFAULT_ETAPA;
}

export type MessageChannel = "call" | "email" | "whatsapp";

export const MESSAGE_CHANNEL_LABELS: Record<MessageChannel, string> = {
  call: "Llamada",
  email: "Correo",
  whatsapp: "WhatsApp",
};

/** Mensaje generado por la IA y guardado para trazabilidad. Nunca se envía desde aquí. */
export interface GeneratedMessageSummary {
  id: number;
  lead_id: number;
  channel: MessageChannel;
  headline: string;
  lead_status: string | null;
  resultado_gestion: string | null;
  etapa_comercial: string | null;
  source: string;
  used_at: string | null;
  created_at: string;
}

export type WhatsAppStatus =
  | "No iniciado"
  | "Pendiente"
  | "Encolado"
  | "Enviado"
  | "En conversación"
  | "Agendado"
  | "Error"
  | "Sin teléfono";

export type MessageDirection = "inbound" | "outbound";

export interface Lead {
  id: number;
  apollo_id: string;
  nombre: string;
  cargo: string | null;
  empresa: string | null;
  email: string | null;
  telefono: string | null;
  telefono_e164?: string | null;
  pais: string | null;
  linkedin_url: string | null;
  lead_status: LeadStatus;
  resultado_gestion?: GestionResultado | null;
  etapa_comercial?: EtapaComercial | string | null;
  whatsapp_status: WhatsAppStatus | string;
  mistral_conversation_id?: string | null;
  notas: string | null;
  fuente_busqueda: string | null;
  created_at: string;
  updated_at: string;
  owner_email?: string | null;
}

export interface WhatsAppMessage {
  id: number;
  lead_id: number;
  telefono: string;
  direction: MessageDirection;
  content: string;
  created_at: string;
}

export interface ConversationThread {
  id: number;
  nombre: string;
  empresa: string | null;
  cargo: string | null;
  telefono: string | null;
  email: string | null;
  lead_status: LeadStatus;
  whatsapp_status: string;
  notas: string | null;
  last_message: string | null;
  last_direction: MessageDirection | null;
  last_message_at: string | null;
  message_count: number;
}

export interface ConversationStats {
  total_threads: number;
  active: number;
  pending: number;
  scheduled: number;
  errors: number;
  awaiting_reply: number;
}

export interface ApolloPerson {
  apollo_id: string;
  nombre: string;
  cargo: string | null;
  empresa: string | null;
  email: string | null;
  telefono: string | null;
  pais: string | null;
  linkedin_url: string | null;
}
