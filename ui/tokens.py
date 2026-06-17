"""
Design tokens — estética consultora (referencia Evaluador de Impacto / IAC).
Blanco + navy profundo + tipografía Plus Jakarta Sans.
"""

# ── Tipografía ────────────────────────────────────────────────────────────
FONT_DISPLAY = "'Plus Jakarta Sans', system-ui, sans-serif"
FONT_BODY = "'Plus Jakarta Sans', system-ui, sans-serif"

FONT_SIZE_XS = "0.6875rem"     # 11px — section labels
FONT_SIZE_SM = "0.8125rem"     # 13px — nav, captions
FONT_SIZE_BASE = "0.875rem"    # 14px — body
FONT_SIZE_LG = "1rem"          # 16px — emphasis
FONT_SIZE_XL = "1.25rem"       # 20px — page title

# ── Marca IAC / consultora ──────────────────────────────────────────────────
NAVY = "#003366"
NAVY_HOVER = "#002244"
NAVY_LIGHT = "#E8EEF4"
NAVY_MUTED = "#4A6FA5"

# ── Superficies ───────────────────────────────────────────────────────────
WHITE = "#FFFFFF"
BG_PAGE = "#FFFFFF"
BG_SIDEBAR = "#FAFBFC"
BG_SUBTLE = "#F4F6F8"
BG_HOVER = "#F0F4F8"

BORDER = "#E2E6EA"
BORDER_STRONG = "#C8D0D8"

# ── Texto (legibilidad WCAG AA+) ──────────────────────────────────────────
TEXT_PRIMARY = "#1A2332"
TEXT_BODY = "#3D4F63"
TEXT_MUTED = "#6B7C93"
TEXT_LABEL = "#8A97A8"
TEXT_ON_NAVY = "#FFFFFF"

# ── Semánticos ────────────────────────────────────────────────────────────
SUCCESS = "#0D6E4F"
SUCCESS_BG = "#EDF7F2"
WARNING = "#9A6700"
WARNING_BG = "#FFF8E6"
ERROR = "#B42318"
ERROR_BG = "#FEF3F2"
INFO = "#175CD3"
INFO_BG = "#EFF4FF"

# ── Módulos principales (barra superior) ──────────────────────────────────
NAV_MODULES = ["Resumen", "Prospección", "Portafolio"]

# Alias compatibilidad
BRAND_900 = NAVY
BRAND_800 = NAVY
BRAND_700 = NAVY
BRAND_600 = NAVY_MUTED
BRAND_50 = NAVY_LIGHT
NAVY_DARK = NAVY
NAVY_PRIMARY = NAVY
NAVY_ACCENT = NAVY_MUTED
GRAY_BG = BG_SUBTLE
GRAY_BORDER = BORDER
TEXT_SECONDARY = TEXT_MUTED
TEXT_ON_DARK = TEXT_ON_NAVY
