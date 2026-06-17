"""Estilos globales — soporta modo claro y oscuro."""

from __future__ import annotations

import streamlit as st

from ui.themes import ThemeColors, get_theme
from ui.tokens import FONT_BODY, FONT_SIZE_BASE, FONT_SIZE_SM, FONT_SIZE_XS


def inject_styles(theme_mode: str = "light") -> None:
    t: ThemeColors = get_theme(theme_mode)

    st.markdown(
        f"""
        <style>
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');

        .stApp {{
            background: {t["bg_page"]};
            font-family: {FONT_BODY};
            font-size: {FONT_SIZE_BASE};
            color: {t["text_body"]};
        }}
        html, body, [class*="css"] {{
            font-family: {FONT_BODY};
            -webkit-font-smoothing: antialiased;
        }}

        #MainMenu, footer, header[data-testid="stHeader"] {{
            visibility: hidden;
            height: 0;
        }}

        .block-container {{
            padding: 0 !important;
            max-width: 100% !important;
        }}
        [data-testid="stAppViewContainer"] > section {{
            padding-top: 0 !important;
        }}

        [data-testid="stSidebar"] {{
            background: {t["bg_sidebar"]} !important;
            border-right: 1px solid {t["border"]} !important;
            min-width: 300px !important;
            max-width: 340px !important;
        }}
        [data-testid="stSidebar"] > div:first-child {{
            padding: 1.5rem 1.25rem 2rem 1.25rem;
        }}

        .section-label {{
            color: {t["text_label"]};
            font-size: {FONT_SIZE_XS};
            font-weight: 700;
            letter-spacing: 0.12em;
            text-transform: uppercase;
            margin: 0 0 1rem 0;
        }}

        div[data-testid="stTabs"] button {{
            font-family: {FONT_BODY} !important;
            font-size: {FONT_SIZE_SM} !important;
            font-weight: 500 !important;
            color: {t["text_muted"]} !important;
            background: transparent !important;
            border: none !important;
            border-bottom: 2px solid transparent !important;
            border-radius: 0 !important;
            padding: 0.75rem 1.25rem !important;
        }}
        div[data-testid="stTabs"] button[aria-selected="true"] {{
            color: {t["text_primary"]} !important;
            font-weight: 700 !important;
            border-bottom: 2px solid {t["navy"]} !important;
        }}
        div[data-testid="stTabs"] button:hover {{
            color: {t["text_primary"]} !important;
            background: {t["bg_hover"]} !important;
        }}

        label, .stTextInput label, .stSelectbox label,
        .stNumberInput label, .stCheckbox label, .stTextArea label,
        .stSlider label {{
            color: {t["text_primary"]} !important;
            font-size: {FONT_SIZE_SM} !important;
            font-weight: 600 !important;
        }}
        input, textarea, [data-baseweb="select"] > div {{
            font-family: {FONT_BODY} !important;
            font-size: {FONT_SIZE_BASE} !important;
            color: {t["text_primary"]} !important;
            background: {t["input_bg"]} !important;
            border: 1px solid {t["border_strong"]} !important;
            border-radius: 4px !important;
        }}
        input::placeholder, textarea::placeholder {{
            color: {t["text_label"]} !important;
            opacity: 1 !important;
        }}
        input:focus, textarea:focus {{
            border-color: {t["navy"]} !important;
            box-shadow: 0 0 0 2px {t["navy_light"]} !important;
        }}

        .stSlider [data-baseweb="slider"] [role="slider"] {{
            background: {t["navy"]} !important;
        }}
        .stSlider [data-baseweb="slider"] > div > div {{
            background: {t["border"]} !important;
        }}

        .stButton > button {{
            font-family: {FONT_BODY} !important;
            font-size: {FONT_SIZE_SM} !important;
            font-weight: 600 !important;
            border-radius: 4px !important;
            min-height: 2.25rem !important;
        }}
        .stButton > button[kind="primary"] {{
            background: {t["navy"]} !important;
            color: #FFFFFF !important;
            border: 1px solid {t["navy"]} !important;
        }}
        .stButton > button[kind="primary"]:hover {{
            background: {t["navy_hover"]} !important;
            border-color: {t["navy_hover"]} !important;
        }}
        .stButton > button[kind="secondary"] {{
            background: {t["btn_secondary_bg"]} !important;
            color: {t["text_primary"]} !important;
            border: 1px solid {t["border_strong"]} !important;
        }}
        .stButton > button[kind="secondary"]:hover {{
            background: {t["bg_hover"]} !important;
        }}

        [data-testid="stMetric"] {{
            background: {t["bg_card"]};
            border: 1px solid {t["border"]};
            border-radius: 4px;
            padding: 1rem 1.15rem;
        }}
        [data-testid="stMetricLabel"] {{
            color: {t["text_label"]} !important;
            font-size: {FONT_SIZE_XS} !important;
            font-weight: 700 !important;
            text-transform: uppercase !important;
            letter-spacing: 0.08em !important;
        }}
        [data-testid="stMetricValue"] {{
            color: {t["text_primary"]} !important;
            font-weight: 700 !important;
            font-size: 1.65rem !important;
        }}

        [data-testid="stDataFrame"] {{
            border: 1px solid {t["border"]};
            border-radius: 4px;
            font-size: {FONT_SIZE_SM} !important;
        }}

        .stSuccess {{
            background: {t["success_bg"]} !important;
            color: {t["success"]} !important;
            border-left: 3px solid {t["success"]} !important;
        }}
        .stWarning {{
            background: {t["warning_bg"]} !important;
            color: {t["warning"]} !important;
            border-left: 3px solid {t["warning"]} !important;
        }}
        .stInfo {{
            background: {t["info_bg"]} !important;
            color: {t["info"]} !important;
            border-left: 3px solid {t["info"]} !important;
        }}
        .stError {{
            background: {t["error_bg"]} !important;
            color: {t["error"]} !important;
            border-left: 3px solid {t["error"]} !important;
        }}

        .empty-state .empty-title {{
            color: {t["text_muted"]};
            font-size: {FONT_SIZE_BASE};
            font-weight: 500;
        }}

        .pipeline-table th {{
            background: {t["bg_subtle"]};
            color: {t["text_label"]};
            border-bottom: 1px solid {t["border"]};
        }}
        .pipeline-table td {{
            border-bottom: 1px solid {t["border"]};
            color: {t["text_body"]};
        }}

        .detail-grid {{
            background: {t["bg_card"]};
            border: 1px solid {t["border"]};
        }}
        .detail-grid .field-label {{ color: {t["text_label"]}; }}
        .detail-grid .field-value {{ color: {t["text_primary"]}; }}

        .text-meta {{ color: {t["text_muted"]}; }}
        .text-meta strong {{ color: {t["text_primary"]}; }}

        .brand-subtitle {{
            color: {t["text_muted"]};
            font-size: {FONT_SIZE_XS};
            font-weight: 600;
            letter-spacing: 0.13em;
            text-transform: uppercase;
            line-height: 1.3;
        }}

        hr {{ border-color: {t["border"]} !important; }}

        /* Header sticky */
        div[data-testid="stVerticalBlock"]:has(.header-marker) {{
            position: sticky;
            top: 0;
            z-index: 1000;
            background: {t["header_bg"]};
            border-bottom: 1px solid {t["border"]};
            padding: 0 0.5rem;
            margin-bottom: 0.5rem;
        }}

        /* Nav principal */
        div[data-testid="stRadio"][aria-label="nav_modules"] > label {{
            display: none !important;
        }}
        div[data-testid="stRadio"][aria-label="nav_modules"] > div {{
            flex-direction: row !important;
            gap: 0 !important;
            justify-content: center !important;
        }}
        div[data-testid="stRadio"][aria-label="nav_modules"] > div > label {{
            background: transparent !important;
            color: {t["text_muted"]} !important;
            border-bottom: 2px solid transparent !important;
            border-radius: 0 !important;
            padding: 0.9rem 1.35rem 0.75rem !important;
            font-family: {FONT_BODY} !important;
            font-weight: 500 !important;
            font-size: {FONT_SIZE_SM} !important;
        }}
        div[data-testid="stRadio"][aria-label="nav_modules"] > div > label:hover {{
            color: {t["text_primary"]} !important;
        }}
        div[data-testid="stRadio"][aria-label="nav_modules"] > div > label:has(input:checked) {{
            color: {t["text_primary"]} !important;
            font-weight: 700 !important;
            border-bottom: 2px solid {t["navy"]} !important;
        }}
        div[data-testid="stRadio"][aria-label="nav_modules"] > div > label > div:first-child {{
            display: none !important;
        }}

        div[data-testid="column"]:has(.hdr-btn-marker) .stButton > button {{
            font-size: 0.75rem !important;
            padding: 0.35rem 0.65rem !important;
            min-height: 2rem !important;
        }}
        </style>
        <div class="header-marker"></div>
        """,
        unsafe_allow_html=True,
    )


def section_label(text: str, first: bool = False) -> None:
    st.sidebar.markdown(
        f'<p class="section-label">{text}</p>',
        unsafe_allow_html=True,
    )


def empty_state(
    message: str,
    button_label: str | None = None,
    button_key: str = "empty_cta",
) -> bool:
    st.markdown(
        f"""
        <div class="empty-state" style="min-height:380px;display:flex;flex-direction:column;
            align-items:center;justify-content:center;text-align:center;padding:3rem 2rem;">
            <div class="empty-title">{message}</div>
        </div>
        """,
        unsafe_allow_html=True,
    )
    if button_label:
        _, col, _ = st.columns([2, 1, 2])
        with col:
            return st.button(
                button_label, type="primary", use_container_width=True, key=button_key
            )
    return False
