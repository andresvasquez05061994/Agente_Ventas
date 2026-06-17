"""Paleta claro / oscuro con contraste legible."""

from __future__ import annotations

from typing import TypedDict


class ThemeColors(TypedDict):
    bg_page: str
    bg_sidebar: str
    bg_subtle: str
    bg_hover: str
    bg_card: str
    header_bg: str
    border: str
    border_strong: str
    text_primary: str
    text_body: str
    text_muted: str
    text_label: str
    navy: str
    navy_hover: str
    navy_light: str
    btn_secondary_bg: str
    success: str
    success_bg: str
    warning: str
    warning_bg: str
    error: str
    error_bg: str
    info: str
    info_bg: str
    input_bg: str


THEME_LIGHT: ThemeColors = {
    "bg_page": "#FFFFFF",
    "bg_sidebar": "#FAFBFC",
    "bg_subtle": "#F4F6F8",
    "bg_hover": "#F0F4F8",
    "bg_card": "#FFFFFF",
    "header_bg": "#FFFFFF",
    "border": "#E2E6EA",
    "border_strong": "#C8D0D8",
    "text_primary": "#1A2332",
    "text_body": "#3D4F63",
    "text_muted": "#6B7C93",
    "text_label": "#8A97A8",
    "navy": "#003366",
    "navy_hover": "#002244",
    "navy_light": "#E8EEF4",
    "btn_secondary_bg": "#FFFFFF",
    "success": "#0D6E4F",
    "success_bg": "#EDF7F2",
    "warning": "#9A6700",
    "warning_bg": "#FFF8E6",
    "error": "#B42318",
    "error_bg": "#FEF3F2",
    "info": "#175CD3",
    "info_bg": "#EFF4FF",
    "input_bg": "#FFFFFF",
}

THEME_DARK: ThemeColors = {
    "bg_page": "#0F1419",
    "bg_sidebar": "#151B23",
    "bg_subtle": "#1A222D",
    "bg_hover": "#222C3A",
    "bg_card": "#1A222D",
    "header_bg": "#0F1419",
    "border": "#2A3544",
    "border_strong": "#3D4D61",
    "text_primary": "#E8EEF4",
    "text_body": "#B8C5D3",
    "text_muted": "#8A9BB0",
    "text_label": "#6E7F94",
    "navy": "#4A8FD4",
    "navy_hover": "#6BA8E8",
    "navy_light": "#1E3A5F",
    "btn_secondary_bg": "#1A222D",
    "success": "#3FB88F",
    "success_bg": "#132820",
    "warning": "#E5B35A",
    "warning_bg": "#2A2210",
    "error": "#F07067",
    "error_bg": "#2D1513",
    "info": "#6BA3F7",
    "info_bg": "#152238",
    "input_bg": "#0F1419",
}


def get_theme(mode: str) -> ThemeColors:
    return THEME_DARK if mode == "dark" else THEME_LIGHT
