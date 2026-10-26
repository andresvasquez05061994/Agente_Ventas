export type InboundLeadRef = {
  id: number;
  owner_id?: number | null;
  updated_at?: string | null;
};

/**
 * Un móvil puede existir en más de un portafolio.
 * Si hay un solo dueño, el mensaje entra al contacto más reciente de ese dueño.
 * Si hay dos dueños, no se asigna.
 */
export function resolveInboundLead<T extends InboundLeadRef>(
  leads: T[]
): { status: "none" } | { status: "ambiguous" } | { status: "matched"; lead: T } {
  if (!leads.length) return { status: "none" };
  const owners = new Set(leads.map((lead) => lead.owner_id ?? 0));
  if (owners.size > 1) return { status: "ambiguous" };
  const lead = [...leads].sort((a, b) =>
    String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? ""))
  )[0];
  return { status: "matched", lead };
}
