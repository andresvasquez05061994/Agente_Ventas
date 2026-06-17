"""
Plataforma integrada de Leads — Fase 1.
Layout: header blanco + nav superior + sidebar izquierdo + área principal.
"""

from __future__ import annotations

from datetime import datetime

import pandas as pd
import streamlit as st

from apollo_client import ApolloClient, ApolloClientError
from config import APOLLO_API_KEY, LEAD_STATUSES
from database import init_db
from services.lead_service import (
    change_lead_status,
    change_leads_status_bulk,
    export_leads_csv,
    filter_leads,
    get_dashboard_data,
    get_lead_detail,
    remove_lead,
    remove_leads_bulk,
    save_lead_notes,
    save_selected_from_apollo,
)
from ui.components import init_ui, render_app_shell, render_logo_hint_sidebar
from ui.theme import empty_state, section_label

st.set_page_config(
    page_title="Agente Ventas B2B",
    page_icon="◆",
    layout="wide",
    initial_sidebar_state="expanded",
)

init_db()


def _init_session_state() -> None:
    defaults = {
        "theme_mode": "light",
        "selection_df": None,
        "last_search": {"pais": "", "cargo": "", "keywords": ""},
        "apollo_status": None,
        "trigger_apollo_check": False,
        "search_params": {
            "pais": "",
            "cargo": "",
            "keywords": "",
            "page": 1,
            "per_page": 25,
            "enrich": False,
        },
        "lead_filters": {
            "status": "Todos",
            "contact": "Todos",
            "search": "",
        },
    }
    for key, value in defaults.items():
        if key not in st.session_state:
            st.session_state[key] = value


_init_session_state()
init_ui(st.session_state.theme_mode)


def _handle_apollo_check() -> None:
    if not st.session_state.trigger_apollo_check:
        return
    st.session_state.trigger_apollo_check = False
    if not APOLLO_API_KEY:
        st.session_state.apollo_status = False
        st.sidebar.error("API key no configurada en .env")
        return
    try:
        client = ApolloClient()
        ok, msg = client.check_connection()
        st.session_state.apollo_status = ok
        if ok:
            st.sidebar.success(msg)
        else:
            st.sidebar.error(msg)
    except ApolloClientError as exc:
        st.session_state.apollo_status = False
        st.sidebar.error(str(exc))


# ── Sidebar: Resumen ──────────────────────────────────────────────────────

def _sidebar_resumen() -> None:
    data = get_dashboard_data()
    section_label("Resumen del pipeline", first=True)
    st.sidebar.metric("Total leads", data["total"])
    st.sidebar.metric("Aprobados", data["approved"])
    st.sidebar.metric("Con teléfono", data["with_phone"])
    st.sidebar.metric("Con email", data["with_email"])

    section_label("Estado Apollo")
    if not APOLLO_API_KEY:
        st.sidebar.warning("Configure APOLLO_API_KEY en .env")
    elif st.session_state.apollo_status is True:
        st.sidebar.success("Conexión activa")
    elif st.session_state.apollo_status is False:
        st.sidebar.error("Sin conexión")
    else:
        st.sidebar.info("Pendiente de verificar")


# ── Sidebar: Prospección ─────────────────────────────────────────────────

def _sidebar_prospeccion() -> dict:
    section_label("Contexto de búsqueda", first=True)
    p = st.session_state.search_params
    p["pais"] = st.sidebar.text_input(
        "País / Ubicación",
        value=p.get("pais", ""),
        placeholder="Colombia, México, Spain",
    )
    p["cargo"] = st.sidebar.text_input(
        "Cargo(s)",
        value=p.get("cargo", ""),
        placeholder="CEO, Director Comercial",
    )
    p["keywords"] = st.sidebar.text_input(
        "Palabras clave",
        value=p.get("keywords", ""),
        placeholder="software, logística, retail",
    )

    section_label("Parámetros")
    p["page"] = st.sidebar.number_input("Página", min_value=1, value=int(p.get("page", 1)))
    p["per_page"] = st.sidebar.slider(
        "Resultados por página",
        min_value=10,
        max_value=100,
        value=int(p.get("per_page", 25)),
        step=5,
    )
    p["enrich"] = st.sidebar.checkbox(
        "Enriquecer contactos (email / teléfono)",
        value=p.get("enrich", False),
    )

    st.session_state.search_params = p

    search = st.sidebar.button("Ejecutar búsqueda", type="primary", use_container_width=True)
    return {**p, "search_clicked": search}


# ── Sidebar: Portafolio ───────────────────────────────────────────────────

def _sidebar_portafolio() -> dict:
    f = st.session_state.lead_filters
    section_label("Filtros del portafolio", first=True)

    f["status"] = st.sidebar.selectbox("Estado", ["Todos", *LEAD_STATUSES], index=0)
    f["contact"] = st.sidebar.selectbox(
        "Datos de contacto",
        ["Todos", "Con teléfono", "Con email", "Sin teléfono", "Sin email"],
    )
    f["search"] = st.sidebar.text_input(
        "Buscar",
        value=f.get("search", ""),
        placeholder="Nombre, empresa o cargo...",
    )

    st.session_state.lead_filters = f
    leads = filter_leads(f["status"], f["search"], f["contact"])

    section_label("Exportar")
    csv_data = export_leads_csv(leads)
    st.sidebar.download_button(
        "Descargar CSV",
        data=csv_data,
        file_name=f"leads_{datetime.now().strftime('%Y%m%d_%H%M')}.csv",
        mime="text/csv",
        use_container_width=True,
        disabled=not leads,
    )
    return f


# ── Main: Resumen ─────────────────────────────────────────────────────────

def _main_resumen() -> None:
    data = get_dashboard_data()

    tab_resumen, tab_pipeline, tab_apollo = st.tabs(
        ["Resumen", "Distribución", "Integración Apollo"]
    )

    with tab_resumen:
        if data["total"] == 0:
            if empty_state(
                "Sin leads en el pipeline",
                "Ir a Prospección",
                "go_prospeccion",
            ):
                st.session_state.active_module = "Prospección"
                st.rerun()
        else:
            c1, c2, c3, c4 = st.columns(4)
            c1.metric("Total leads", data["total"])
            c2.metric("Con teléfono", data["with_phone"])
            c3.metric("Con email", data["with_email"])
            c4.metric("Listos para contacto", data["approved"])

    with tab_pipeline:
        st.markdown(
            """
            <table class="pipeline-table">
                <thead><tr><th>Paso</th><th>Acción</th></tr></thead>
                <tbody>
                    <tr><td>01</td><td>Buscar prospectos en Apollo (Prospección)</td></tr>
                    <tr><td>02</td><td>Seleccionar y guardar contactos</td></tr>
                    <tr><td>03</td><td>Revisar y clasificar en Portafolio</td></tr>
                    <tr><td>04</td><td>Aprobar para contacto</td></tr>
                    <tr><td>05</td><td>Contacto WhatsApp automático (Fase 3)</td></tr>
                </tbody>
            </table>
            """,
            unsafe_allow_html=True,
        )

    with tab_apollo:
        if not APOLLO_API_KEY:
            st.warning("Configure `APOLLO_API_KEY` en el archivo `.env` para habilitar Apollo.")
        elif st.session_state.apollo_status is True:
            st.success("La integración con Apollo está operativa.")
        elif st.session_state.apollo_status is False:
            st.error("No se pudo verificar la conexión. Use **Verificar Apollo** en la barra superior.")
        else:
            st.info("Pulse **Verificar Apollo** en la barra superior para comprobar la conexión.")


# ── Main: Prospección ─────────────────────────────────────────────────────

def _main_prospeccion(params: dict) -> None:
    if params.get("search_clicked"):
        pais, cargo, keywords = params["pais"], params["cargo"], params["keywords"]
        if not pais and not cargo and not keywords:
            st.warning("Ingrese al menos un criterio de búsqueda en el panel izquierdo.")
        else:
            try:
                client = ApolloClient()
                with st.spinner("Consultando Apollo..."):
                    results, meta = client.search_and_normalize(
                        pais=pais,
                        cargo=cargo,
                        keywords=keywords,
                        page=int(params["page"]),
                        per_page=int(params["per_page"]),
                        enrich=params["enrich"],
                    )
                st.session_state.last_search = {
                    "pais": pais, "cargo": cargo, "keywords": keywords,
                }
                st.session_state.apollo_status = True

                if results:
                    df = pd.DataFrame(results)
                    df.insert(0, "Seleccionar", False)
                    st.session_state.selection_df = df
                    st.success(
                        f"{meta.get('total_entries', len(results))} resultados · "
                        f"pág. {meta.get('page', params['page'])} de {meta.get('total_pages', 1)}"
                    )
                else:
                    st.session_state.selection_df = None
                    st.info("No se encontraron resultados.")

            except ApolloClientError as exc:
                st.session_state.apollo_status = False
                st.error(str(exc))

    df_sel = st.session_state.selection_df

    if df_sel is None or df_sel.empty:
        if empty_state("Sin búsqueda activa", "Nueva búsqueda", "new_search"):
            st.session_state.search_params["pais"] = ""
            st.session_state.search_params["cargo"] = ""
            st.session_state.search_params["keywords"] = ""
            st.rerun()
        return

    tab_resultados, tab_acciones = st.tabs(["Resultados", "Acciones"])

    with tab_resultados:
        btn1, btn2, btn3, _ = st.columns([1, 1, 1, 3])
        with btn1:
            if st.button("Seleccionar todos"):
                d = st.session_state.selection_df.copy()
                d["Seleccionar"] = True
                st.session_state.selection_df = d
                st.rerun()
        with btn2:
            if st.button("Deseleccionar todos"):
                d = st.session_state.selection_df.copy()
                d["Seleccionar"] = False
                st.session_state.selection_df = d
                st.rerun()
        with btn3:
            n = len(df_sel[df_sel["Seleccionar"] == True])  # noqa: E712
            st.markdown(
                f'<div class="text-meta" style="padding-top:0.4rem;">'
                f"<strong>{n}</strong> seleccionados</div>",
                unsafe_allow_html=True,
            )

        edited = st.data_editor(
            st.session_state.selection_df,
            column_config={
                "Seleccionar": st.column_config.CheckboxColumn("Sel.", width="small"),
                "apollo_id": st.column_config.TextColumn("ID", disabled=True),
                "nombre": st.column_config.TextColumn("Nombre", disabled=True),
                "cargo": st.column_config.TextColumn("Cargo", disabled=True),
                "empresa": st.column_config.TextColumn("Empresa", disabled=True),
                "email": st.column_config.TextColumn("Email", disabled=True),
                "telefono": st.column_config.TextColumn("Teléfono", disabled=True),
                "pais": st.column_config.TextColumn("País", disabled=True),
                "linkedin_url": st.column_config.LinkColumn("LinkedIn", disabled=True),
            },
            hide_index=True,
            use_container_width=True,
            key="apollo_editor",
        )
        st.session_state.selection_df = edited

    with tab_acciones:
        selected = st.session_state.selection_df[
            st.session_state.selection_df["Seleccionar"] == True  # noqa: E712
        ]
        st.markdown(
            f'<div class="text-meta"><strong>{len(selected)}</strong> contacto(s) '
            f"listos para incorporar al portafolio.</div>",
            unsafe_allow_html=True,
        )
        if st.button("Guardar en portafolio", type="primary"):
            if selected.empty:
                st.warning("Seleccione al menos un contacto en la pestaña Resultados.")
            else:
                s = st.session_state.last_search
                inserted, skipped = save_selected_from_apollo(
                    selected.to_dict("records"),
                    pais=s["pais"], cargo=s["cargo"], keywords=s["keywords"],
                )
                st.success(f"{inserted} guardado(s). {skipped} duplicado(s) omitido(s).")


# ── Main: Portafolio ──────────────────────────────────────────────────────

def _main_portafolio(filters: dict) -> None:
    leads = filter_leads(filters["status"], filters["search"], filters["contact"])

    if not leads:
        if empty_state(
            "Sin contactos en el portafolio",
            "Ir a Prospección",
            "go_prosp_from_port",
        ):
            st.session_state.active_module = "Prospección"
            st.rerun()
        return

    tab_listado, tab_detalle = st.tabs(["Listado", "Detalle y notas"])

    with tab_listado:
        st.markdown(
            f'<div class="text-meta" style="margin-bottom:0.75rem;">'
            f"<strong>{len(leads)}</strong> registro(s)</div>",
            unsafe_allow_html=True,
        )

        df = pd.DataFrame(leads)
        df_display = df.copy()
        df_display.insert(0, "Seleccionar", False)

        edited = st.data_editor(
            df_display,
            column_config={
                "Seleccionar": st.column_config.CheckboxColumn("Sel.", width="small"),
                "id": st.column_config.NumberColumn("ID", disabled=True, width="small"),
                "lead_status": st.column_config.SelectboxColumn(
                    "Estado", options=LEAD_STATUSES, required=True
                ),
                "nombre": st.column_config.TextColumn("Nombre", disabled=True),
                "cargo": st.column_config.TextColumn("Cargo", disabled=True),
                "empresa": st.column_config.TextColumn("Empresa", disabled=True),
                "email": st.column_config.TextColumn("Email", disabled=True),
                "telefono": st.column_config.TextColumn("Teléfono", disabled=True),
                "whatsapp_status": st.column_config.TextColumn("WhatsApp", disabled=True),
                "fuente_busqueda": st.column_config.TextColumn("Fuente", disabled=True),
                "created_at": st.column_config.TextColumn("Creado", disabled=True),
            },
            hide_index=True,
            use_container_width=True,
            disabled=[
                "id", "apollo_id", "nombre", "cargo", "empresa", "email",
                "telefono", "pais", "linkedin_url", "whatsapp_status",
                "notas", "fuente_busqueda", "created_at", "updated_at",
            ],
            key="leads_editor",
        )

        sel = edited[edited["Seleccionar"] == True]  # noqa: E712
        sel_ids = sel["id"].tolist() if not sel.empty else []

        ac1, ac2, ac3 = st.columns([1.2, 1, 1])
        with ac1:
            bulk = st.selectbox("Cambiar estado a", LEAD_STATUSES, key="bulk_st")
        with ac2:
            if st.button("Aplicar a seleccionados", disabled=not sel_ids, use_container_width=True):
                n = change_leads_status_bulk(sel_ids, bulk)
                st.success(f"{n} actualizado(s).")
                st.rerun()
        with ac3:
            if st.button("Eliminar seleccionados", disabled=not sel_ids, use_container_width=True):
                n = remove_leads_bulk(sel_ids)
                st.success(f"{n} eliminado(s).")
                st.rerun()

        changes = edited[edited["lead_status"] != df["lead_status"]]
        if not changes.empty and st.button("Guardar cambios de estado"):
            for _, row in changes.iterrows():
                change_lead_status(int(row["id"]), row["lead_status"])
            st.success("Estados guardados.")
            st.rerun()

    with tab_detalle:
        opts = {f"{l['nombre']} — {l['empresa'] or 'Sin empresa'}": l["id"] for l in leads}
        label = st.selectbox("Contacto", list(opts.keys()), label_visibility="collapsed")
        if not label:
            return
        lead_id = opts[label]
        detail = get_lead_detail(lead_id)
        if not detail:
            return

        st.markdown(
            f"""
            <div class="detail-grid">
                <div>
                    <div class="field-label">Nombre</div>
                    <div class="field-value">{detail['nombre']}</div>
                    <div class="field-label">Cargo</div>
                    <div class="field-value">{detail.get('cargo') or '—'}</div>
                    <div class="field-label">Empresa</div>
                    <div class="field-value">{detail.get('empresa') or '—'}</div>
                </div>
                <div>
                    <div class="field-label">Email</div>
                    <div class="field-value">{detail.get('email') or '—'}</div>
                    <div class="field-label">Teléfono</div>
                    <div class="field-value">{detail.get('telefono') or '—'}</div>
                    <div class="field-label">Estado</div>
                    <div class="field-value">{detail['lead_status']}</div>
                </div>
            </div>
            """,
            unsafe_allow_html=True,
        )

        notes = st.text_area(
            "Notas internas",
            value=detail.get("notas") or "",
            key=f"notes_{lead_id}",
            height=100,
        )
        n1, n2 = st.columns(2)
        with n1:
            if st.button("Guardar notas", key=f"save_{lead_id}", use_container_width=True):
                save_lead_notes(lead_id, notes)
                st.success("Notas guardadas.")
        with n2:
            if st.button("Eliminar contacto", key=f"del_{lead_id}", use_container_width=True):
                remove_lead(lead_id)
                st.success("Eliminado.")
                st.rerun()


# ── Entry point ───────────────────────────────────────────────────────────

def main() -> None:
    active = render_app_shell()
    _handle_apollo_check()
    render_logo_hint_sidebar()

    if active == "Resumen":
        _sidebar_resumen()
        _main_resumen()
    elif active == "Prospección":
        params = _sidebar_prospeccion()
        _main_prospeccion(params)
    elif active == "Portafolio":
        filters = _sidebar_portafolio()
        _main_portafolio(filters)


if __name__ == "__main__":
    main()
