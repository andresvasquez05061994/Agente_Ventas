"""Logos de marca — rutas y renderizado para modo claro / oscuro."""

from __future__ import annotations

import base64
from pathlib import Path

from config import BASE_DIR

LOGOS_DIR = BASE_DIR / "assets" / "logos"
EXTENSIONS = (".svg", ".png", ".jpg", ".jpeg", ".webp")

# Orden de búsqueda por tema (primer archivo existente gana)
LOGO_CANDIDATES = {
    "light": ("logo-light", "logo-iac", "logo"),
    "dark": ("logo-dark", "logo-iac-white", "logo-white"),
}


def _find_logo(basenames: tuple[str, ...]) -> Path | None:
    for name in basenames:
        for ext in EXTENSIONS:
            path = LOGOS_DIR / f"{name}{ext}"
            if path.is_file():
                return path
    return None


def get_logo_path(theme_mode: str) -> Path | None:
    """Devuelve la ruta del logo según el tema activo."""
    key = "dark" if theme_mode == "dark" else "light"
    return _find_logo(LOGO_CANDIDATES[key])


def logos_configured() -> tuple[bool, bool]:
    return (
        _find_logo(LOGO_CANDIDATES["light"]) is not None,
        _find_logo(LOGO_CANDIDATES["dark"]) is not None,
    )


def _mime_for(path: Path) -> str:
    ext = path.suffix.lower()
    return {
        ".svg": "image/svg+xml",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
    }.get(ext, "application/octet-stream")


def render_logo_html(theme_mode: str, height: int = 32) -> str:
    """HTML del logo para el header."""
    path = get_logo_path(theme_mode)
    if path:
        data = base64.b64encode(path.read_bytes()).decode("ascii")
        mime = _mime_for(path)
        return (
            f'<img src="data:{mime};base64,{data}" alt="IAC" '
            f'height="{height}" style="display:block;max-width:140px;object-fit:contain;" />'
        )

    from ui.themes import get_theme

    t = get_theme(theme_mode)
    return (
        f'<div style="background:{t["navy"]};color:#FFFFFF;font-size:0.62rem;'
        f'font-weight:800;letter-spacing:0.06em;padding:0.3rem 0.45rem;'
        f'border-radius:3px;line-height:1;">iac</div>'
    )
