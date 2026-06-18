export type LeadStatus =
  | "Nuevo"
  | "En revisión"
  | "Aprobado para contacto"
  | "Descartado";

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
  pais: string | null;
  linkedin_url: string | null;
  lead_status: LeadStatus;
  whatsapp_status: WhatsAppStatus | string;
  mistral_conversation_id?: string | null;
  notas: string | null;
  fuente_busqueda: string | null;
  created_at: string;
  updated_at: string;
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
