export type LeadStatus =
  | "Nuevo"
  | "En revisión"
  | "Aprobado para contacto"
  | "Descartado";

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
  whatsapp_status: string;
  notas: string | null;
  fuente_busqueda: string | null;
  created_at: string;
  updated_at: string;
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
