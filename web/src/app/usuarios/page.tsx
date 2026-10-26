"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeading } from "@/components/HelpTip";
import { ActionBanner, FeedbackAnchor } from "@/components/ui";
import { useActionFeedback } from "@/hooks/use-action-feedback";
import { parseApiResponse } from "@/lib/parse-api-response";

type UserStatus = "pending" | "approved" | "rejected" | "disabled";

type Account = {
  id: number;
  email: string;
  role: "admin" | "user";
  status: UserStatus;
  created_at: string;
  leads: number;
  credits_this_month: number;
};

const STATUS_LABEL: Record<UserStatus, string> = {
  pending: "Pendiente",
  approved: "Activo",
  rejected: "Rechazado",
  disabled: "De baja",
};

function formatWhen(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
}

export default function UsuariosPage() {
  const { feedback, showError, showSuccess, clear } = useActionFeedback();
  const [users, setUsers] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    const sessionRes = await fetch("/api/auth/session");
    const session = (await sessionRes.json()) as { user?: { role?: string } | null };
    if (session.user?.role !== "admin") {
      throw new Error("Solo el administrador puede ver esta página.");
    }
    const res = await fetch("/api/admin/users");
    const { data, error } = await parseApiResponse<{ users?: Account[]; error?: string }>(res);
    if (error || data?.error || !data?.users) {
      throw new Error(error ?? data?.error ?? "No se pudieron leer los usuarios");
    }
    setUsers(data.users);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve()
      .then(load)
      .catch((e: unknown) => {
        if (!cancelled) showError(e instanceof Error ? e.message : "No se pudieron leer los usuarios");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [load, showError]);

  async function changeStatus(account: Account, status: UserStatus) {
    if (status === "disabled" && !window.confirm(`¿Dar de baja a ${account.email}? Conserva sus datos, pero no podrá entrar.`)) {
      return;
    }
    if (status === "rejected" && !window.confirm(`¿Rechazar la solicitud de ${account.email}?`)) {
      return;
    }
    setBusyId(account.id);
    clear();
    try {
      const res = await fetch(`/api/admin/users/${account.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const { data, error } = await parseApiResponse<{ error?: string }>(res);
      if (!res.ok || error || data?.error) {
        showError(error ?? data?.error ?? "No se pudo actualizar");
        return;
      }
      await load();
      showSuccess(`${account.email} quedó ${STATUS_LABEL[status].toLowerCase()}.`);
    } catch {
      showError("No se pudo actualizar");
    } finally {
      setBusyId(null);
    }
  }

  const totalLeads = users.reduce((sum, user) => sum + user.leads, 0);
  const totalCredits = users.reduce((sum, user) => sum + user.credits_this_month, 0);

  return (
    <main className="app-content flex-1 py-6 lg:py-8">
      <header className="page-header">
        <PageHeading
          title="Usuarios"
          help="Aprueba o rechaza solicitudes y da de baja el acceso. Los datos se conservan. Cada usuario aprobado tiene su propio tope de 2.500 créditos Apollo al mes. Aquí ves sus contactos y el consumo del mes."
        />
      </header>

      {feedback && (
        <FeedbackAnchor className="mt-6">
          <ActionBanner tone={feedback.tone} title={feedback.title} message={feedback.message} onDismiss={clear} />
        </FeedbackAnchor>
      )}

      {loading ? (
        <div className="settings-panel mt-6">
          <div className="kpi-skeleton h-28" />
        </div>
      ) : (
        <div className="portfolio-table-wrap mt-6 rounded border border-[#E2E6EA] dark:border-[#2A3544]">
          <table className="data-table">
            <thead>
              <tr>
                <th>Correo</th>
                <th>Estado</th>
                <th>Contactos</th>
                <th>Créditos del mes</th>
                <th>Alta</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td className="cell-strong">{user.email}</td>
                  <td>{user.role === "admin" ? "Administrador" : STATUS_LABEL[user.status]}</td>
                  <td>{user.leads.toLocaleString("es-CO")}</td>
                  <td>{user.credits_this_month.toLocaleString("es-CO")}</td>
                  <td>{formatWhen(user.created_at)}</td>
                  <td>
                    {user.role === "admin" ? (
                      "—"
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {(user.status === "pending" || user.status === "rejected") && (
                          <button
                            type="button"
                            className="btn-primary"
                            disabled={busyId === user.id}
                            onClick={() => void changeStatus(user, "approved")}
                          >
                            Aprobar
                          </button>
                        )}
                        {user.status === "pending" && (
                          <button
                            type="button"
                            className="btn-secondary"
                            disabled={busyId === user.id}
                            onClick={() => void changeStatus(user, "rejected")}
                          >
                            Rechazar
                          </button>
                        )}
                        {user.status === "approved" && (
                          <button
                            type="button"
                            className="btn-danger"
                            disabled={busyId === user.id}
                            onClick={() => void changeStatus(user, "disabled")}
                          >
                            Dar de baja
                          </button>
                        )}
                        {user.status === "disabled" && (
                          <button
                            type="button"
                            className="btn-secondary"
                            disabled={busyId === user.id}
                            onClick={() => void changeStatus(user, "approved")}
                          >
                            Reactivar
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              <tr>
                <td className="cell-strong">Total</td>
                <td>{users.length.toLocaleString("es-CO")} cuentas</td>
                <td>{totalLeads.toLocaleString("es-CO")}</td>
                <td>{totalCredits.toLocaleString("es-CO")}</td>
                <td />
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
