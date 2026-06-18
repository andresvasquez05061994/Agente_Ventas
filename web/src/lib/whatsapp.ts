import type { WhatsAppStatus } from "./types";

export const WHATSAPP_STATUSES: WhatsAppStatus[] = [
  "No iniciado",
  "Pendiente",
  "Encolado",
  "Enviado",
  "En conversación",
  "Agendado",
  "Error",
  "Sin teléfono",
];

export const INBOX_FILTERS = [
  { value: "all", label: "Todas" },
  { value: "active", label: "En conversación" },
  { value: "pending", label: "Pendientes" },
  { value: "scheduled", label: "Agendadas" },
  { value: "error", label: "Con error" },
  { value: "awaiting", label: "Esperando respuesta" },
] as const;

export type InboxFilter = (typeof INBOX_FILTERS)[number]["value"];

export function statusBadgeClass(status: string): string {
  switch (status) {
    case "En conversación":
      return "wa-badge wa-badge--active";
    case "Agendado":
      return "wa-badge wa-badge--scheduled";
    case "Pendiente":
    case "Encolado":
      return "wa-badge wa-badge--pending";
    case "Enviado":
      return "wa-badge wa-badge--sent";
    case "Error":
    case "Sin teléfono":
      return "wa-badge wa-badge--error";
    default:
      return "wa-badge wa-badge--idle";
  }
}

export function formatMessageTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  if (isToday) {
    return d.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("es-CO", { day: "2-digit", month: "short" });
}

export function truncatePreview(text: string | null, max = 72): string {
  if (!text) return "Sin mensajes aún";
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (oneLine.length <= max) return oneLine;
  return `${oneLine.slice(0, max - 1)}…`;
}
