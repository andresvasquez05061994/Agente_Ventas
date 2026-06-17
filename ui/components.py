"""Shell de aplicación — header, logos, tema claro/oscuro."""

from __future__ import annotations

import streamlit as st

from config import CURRENT_PHASE
from ui.branding import logos_configured, render_logo_html
from ui.theme import inject_styles
from ui.themes import get_theme
from ui.tokens import FONT_SIZE_XS, NAV_MODULES


def init_ui(theme_mode: str = "light") -> None:
    inject_styles(theme_mode)


def toggle_theme() -> str:
    """Alterna claro ↔ oscuro. Devuelve el modo activo."""
    current = st.session_state.get("theme_mode", "light")
    if current == "light":
        st.session_state.theme_mode = "dark"
    else:
        st.session_state.theme_mode = "light"
    return st.session_state.theme_mode


def render_app_shell() -> str:
    theme_mode = st.session_state.get("theme_mode", "light")
    t = get_theme(theme_mode)

    if "active_module" not in st.session_state:
        st.session_state.active_module = NAV_MODULES[0]

    col_brand, col_nav, col_actions = st.columns([1.5, 3, 1.8])

    with col_brand:
        logo_html = render_logo_html(theme_mode)
        st.markdown(
            f"""
            <div style="display:flex;align-items:center;gap:0.65rem;
                padding:0.65rem 0 0.5rem 0.5rem;">
                {logo_html}
                <div class="brand-subtitle">Agente Ventas B2B</div>
            </div>
            """,
            unsafe_allow_html=True,
        )

    with col_nav:
        idx = NAV_MODULES.index(st.session_state.active_module)
        active = st.radio(
            "nav_modules",
            NAV_MODULES,
            horizontal=True,
            label_visibility="collapsed",
            key="top_nav",
            index=idx,
        )
        st.session_state.active_module = active

    with col_actions:
        st.markdown('<div class="hdr-btn-marker"></div>', unsafe_allow_html=True)

        theme_label = "Claro" if theme_mode == "dark" else "Oscuro"
        ac0, ac1, ac2, ac3 = st.columns(4)
        with ac0:
            if st.button(theme_label, key="theme_toggle", use_container_width=True):
                toggle_theme()
                st.rerun()
        with ac1:
            if st.button("Verificar", key="hdr_apollo", use_container_width=True):
                st.session_state.trigger_apollo_check = True
        with ac2:
            st.button("Exportar", key="hdr_export", disabled=True, use_container_width=True)
        with ac3:
            if st.button("Nueva búsqueda", key="hdr_new", type="primary", use_container_width=True):
                st.session_state.active_module = "Prospección"
                st.session_state.selection_df = None
                st.rerun()

        st.markdown(
            f'<div style="text-align:right;color:{t["text_label"]};font-size:0.65rem;'
            f'font-weight:600;letter-spacing:0.08em;margin-top:2px;">'
            f"FASE {CURRENT_PHASE}</div>",
            unsafe_allow_html=True,
        )

    return st.session_state.active_module


def render_logo_hint_sidebar() -> None:
    """Aviso en sidebar si faltan archivos de logo."""
    light_ok, dark_ok = logos_configured()
    if light_ok and dark_ok:
        return
    missing = []
    if not light_ok:
        missing.append("logo-light")
    if not dark_ok:
        missing.append("logo-dark")
    st.sidebar.caption(
        f"Logos pendientes: {', '.join(missing)}. "
        f"Ver `assets/logos/LEEME.txt`"
    )
