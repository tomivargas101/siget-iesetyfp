"""
Módulo de Diseño y Paleta de Colores Institucional para SIGET (CustomTkinter).
Basado en la Identidad Visual Oficial:
- Dorado Institucional del Logotipo Oficial: #E0C45D
- Gris Grafito / Negro Carbón del Logotipo: #2B2B2B, #4A4A4A, #1E1E1E
Provee tuplas dinámicas (Modo Claro, Modo Oscuro) para software corporativo formal y sobrio.
"""

import sys
import os
from pathlib import Path

def get_asset_path(filename: str) -> str:
    """Obtiene la ruta absoluta a un asset, compatible con PyInstaller (_MEIPASS)."""
    if getattr(sys, 'frozen', False):
        base_path = getattr(sys, '_MEIPASS', os.path.dirname(sys.executable))
    else:
        base_path = Path(__file__).resolve().parent.parent
    return str(Path(base_path) / "assets" / filename)

def apply_window_icon(window):
    """Aplica el icono oficial en formato .ico o .png a cualquier ventana CTk/Toplevel."""
    ico_path = get_asset_path("icon.ico")
    if os.path.exists(ico_path):
        try:
            window.iconbitmap(ico_path)
        except Exception:
            pass
    png_path = get_asset_path("logo_transparent.png")
    if not os.path.exists(png_path):
        png_path = get_asset_path("logo.png")
    if os.path.exists(png_path):
        try:
            from PIL import ImageTk, Image
            img = Image.open(png_path)
            photo = ImageTk.PhotoImage(img)
            window.iconphoto(False, photo)
            window._icon_photo_ref = photo
        except Exception:
            pass

class Theme:
    # =========================================================================
    # COLORES INSTITUCIONALES DEL LOGOTIPO OFICIAL
    # =========================================================================
    # Dorado Institucional (#E0C45D extraído directamente del isotipo oficial)
    GOLD_ACCENT = "#E0C45D"
    GOLD = ("#B3921D", "#E0C45D")              # Dorado adaptativo para textos y bordes
    GOLD_HOVER = ("#A38314", "#D4B843")
    GOLD_BG = ("#FEF9E7", "#2B2818")
    GOLD_BORDER = ("#E0C45D", "#5A4E1B")
    GOLD_TEXT = ("#8A6F0E", "#E0C45D")          # Texto dorado para badges y roles

    # Gris Grafito / Carbón Oficial (#2B2B2B, #4A4A4A, #A6A6A5 del logo)
    GRAPHITE_DARK = "#2B2B2B"                   # Grafito oscuro oficial
    GRAPHITE_MID = "#4A4A4A"                    # Grafito medio oficial
    GRAPHITE_LIGHT = "#A6A6A5"                  # Gris plata oficial de los arcos del logo

    # =========================================================================
    # FONDOS PRINCIPALES (Blanco/Gris suave en Light, Grafito sobrio en Dark)
    # =========================================================================
    BG_WINDOW = ("#F8FAFC", "#202020")        # Fondo general de la ventana
    BG_CONTENT = ("#F8FAFC", "#202020")       # Fondo del área dinámica de trabajo
    BG_SIDEBAR = ("#FFFFFF", "#2B2B2B")       # Fondo de la barra de navegación lateral
    BG_TOPBAR = ("#FFFFFF", "#2B2B2B")        # Barra de estado superior
    
    # =========================================================================
    # CONTENEDORES, TARJETAS Y ELEVACIÓN VISUAL
    # =========================================================================
    BG_CARD = ("#FFFFFF", "#333333")          # Tarjetas y paneles principales
    BG_CARD_SUB = ("#F8FAFC", "#2B2B2B")      # Filas, ítems y subpaneles anidados
    BG_CARD_ALT = ("#F1F5F9", "#3D3D3D")      # Encabezados de tabla y badges
    
    # =========================================================================
    # CAMPOS DE ENTRADA, CONTROLES Y COMBOS
    # =========================================================================
    BG_INPUT = ("#FFFFFF", "#242424")         # Fondo de cajas de texto
    BORDER_INPUT = ("#CBD5E1", "#4A4A4A")     # Borde de inputs
    BG_DROPDOWN = ("#FFFFFF", "#2B2B2B")      # Listas desplegables
    
    # =========================================================================
    # BORDES Y SEPARADORES DE CONTRASTE
    # =========================================================================
    BORDER_CARD = ("#E2E8F0", "#3D3D3D")      # Borde sutil para tarjetas
    BORDER_SUB = ("#E2E8F0", "#4A4A4A")       # Borde de filas o subcontenedores
    BORDER_SEPARATOR = ("#E2E8F0", "#3D3D3D") # Línea divisoria entre áreas
    BORDER_GOLD = ("#E0C45D", "#B3921D")      # Borde institucional dorado
    
    # =========================================================================
    # TIPOGRAFÍA Y TEXTOS LEGIBLES EN AMBOS MODOS (#2B2B2B y #4A4A4A)
    # =========================================================================
    TEXT_PRIMARY = ("#2B2B2B", "#F8FAFC")     # Títulos y datos (#2B2B2B grafito en Light)
    TEXT_SECONDARY = ("#4A4A4A", "#A6A6A5")   # Subtítulos y etiquetas (#4A4A4A en Light, #A6A6A5 en Dark)
    TEXT_MUTED = ("#6B7280", "#8E8E93")       # Metadatos, horas y fechas secundarias
    TEXT_INVERSE = ("#FFFFFF", "#2B2B2B")     # Texto en contraste inverso
    
    # =========================================================================
    # BOTONES, ACENTOS Y PALETA INSTITUCIONAL
    # =========================================================================
    # Primario Institucional (Dorado del Logotipo Oficial)
    PRIMARY = ("#D4B843", "#E0C45D")
    PRIMARY_HOVER = ("#C2A532", "#D4B843")
    PRIMARY_TEXT = ("#2B2B2B", "#1A1A1A")     # Grafito oscuro para máximo contraste sobre dorado
    
    # Secundario (Gris Neutro Corporativo)
    SECONDARY = ("#F1F5F9", "#3D3D3D")
    SECONDARY_HOVER = ("#E2E8F0", "#4A4A4A")
    SECONDARY_TEXT = ("#2B2B2B", "#F8FAFC")
    
    # Navegación Sidebar (Botón Activo en Dorado Institucional)
    NAV_ACTIVE_BG = ("#E0C45D", "#E0C45D")    # Resaltado en Dorado del Logo
    NAV_ACTIVE_TEXT = ("#2B2B2B", "#1A1A1A")  # Texto grafito legible
    NAV_HOVER = ("#F1F5F9", "#383838")
    NAV_TEXT = ("#4A4A4A", "#E2E8F0")
    
    # Éxito / Presente (Esmeralda Formal)
    SUCCESS = ("#059669", "#10B981")
    SUCCESS_HOVER = ("#047857", "#059669")
    SUCCESS_BG = ("#DCFCE7", "#064E3B")
    SUCCESS_TEXT = ("#065F46", "#34D399")
    
    # Advertencia / Licencia / Topes (Ámbar)
    WARNING = ("#D97706", "#F59E0B")
    WARNING_HOVER = ("#B45309", "#D97706")
    WARNING_BG = ("#FEF3C7", "#78350F")
    WARNING_TEXT = ("#92400E", "#FCD34D")
    
    # Alerta / Ausente / Peligro (Rojo)
    DANGER = ("#DC2626", "#EF4444")
    DANGER_HOVER = ("#B91C1C", "#DC2626")
    DANGER_BG = ("#FEE2E2", "#7F1D1D")
    DANGER_TEXT = ("#991B1B", "#F87171")
    
    # Informativo / Bedelía (Azul Institucional)
    INFO = ("#0284C7", "#38BDF8")
    INFO_HOVER = ("#0369A1", "#0284C7")
    INFO_BG = ("#E0F2FE", "#082F49")
    INFO_TEXT = ("#075985", "#7DD3FC")
    
    # Cátedras / Nivel Terciario (Púrpura)
    PURPLE = ("#7C3AED", "#A855F7")
    PURPLE_HOVER = ("#6D28D9", "#7C3AED")
    PURPLE_BG = ("#EDE9FE", "#3B0764")
    PURPLE_TEXT = ("#5B21B6", "#C084FC")
