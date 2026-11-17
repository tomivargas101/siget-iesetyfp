
import sys
import os
from pathlib import Path

def get_asset_path(filename: str) -> str:
    if getattr(sys, 'frozen', False):
        base_path = getattr(sys, '_MEIPASS', os.path.dirname(sys.executable))
    else:
        base_path = Path(__file__).resolve().parent.parent
    return str(Path(base_path) / "assets" / filename)

def apply_window_icon(window):
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
    GOLD_ACCENT = "#E0C45D"
    GOLD = ("#B3921D", "#E0C45D")
    GOLD_HOVER = ("#A38314", "#D4B843")
    GOLD_BG = ("#FEF9E7", "#2B2818")
    GOLD_BORDER = ("#E0C45D", "#5A4E1B")
    GOLD_TEXT = ("#8A6F0E", "#E0C45D")

    GRAPHITE_DARK = "#2B2B2B"
    GRAPHITE_MID = "#4A4A4A"
    GRAPHITE_LIGHT = "#A6A6A5"

    BG_WINDOW = ("#F8FAFC", "#202020")
    BG_CONTENT = ("#F8FAFC", "#202020")
    BG_SIDEBAR = ("#FFFFFF", "#2B2B2B")
    BG_TOPBAR = ("#FFFFFF", "#2B2B2B")
    
    BG_CARD = ("#FFFFFF", "#333333")
    BG_CARD_SUB = ("#F8FAFC", "#2B2B2B")
    BG_CARD_ALT = ("#E5E7EB", "#2D333B")
    
    BG_INPUT = ("#FFFFFF", "#242424")
    BORDER_INPUT = ("#CBD5E1", "#4A4A4A")
    BG_DROPDOWN = ("#FFFFFF", "#2B2B2B")
    
    BORDER_CARD = ("#E2E8F0", "#3D3D3D")
    BORDER_SUB = ("#E2E8F0", "#4A4A4A")
    BORDER_SEPARATOR = ("#E2E8F0", "#3D3D3D")
    BORDER_GOLD = ("#E0C45D", "#B3921D")
    
    TEXT_PRIMARY = ("#2B2B2B", "#F8FAFC")
    TEXT_SECONDARY = ("#4A4A4A", "#A6A6A5")
    TEXT_MUTED = ("#6B7280", "#8E8E93")
    TEXT_INVERSE = ("#FFFFFF", "#2B2B2B")
    
    PRIMARY = ("#D4B843", "#E0C45D")
    PRIMARY_HOVER = ("#C2A532", "#D4B843")
    PRIMARY_TEXT = ("#2B2B2B", "#1A1A1A")
    
    SECONDARY = ("#F1F5F9", "#3D3D3D")
    SECONDARY_HOVER = ("#E2E8F0", "#4A4A4A")
    SECONDARY_TEXT = ("#2B2B2B", "#F8FAFC")
    
    NAV_ACTIVE_BG = ("#E0C45D", "#E0C45D")
    NAV_ACTIVE_TEXT = ("#2B2B2B", "#1A1A1A")
    NAV_HOVER = ("#F1F5F9", "#383838")
    NAV_TEXT = ("#4A4A4A", "#E2E8F0")
    
    SUCCESS = ("#059669", "#10B981")
    SUCCESS_HOVER = ("#047857", "#059669")
    SUCCESS_BG = ("#DCFCE7", "#064E3B")
    SUCCESS_TEXT = ("#065F46", "#34D399")
    
    WARNING = ("#D97706", "#F59E0B")
    WARNING_HOVER = ("#B45309", "#D97706")
    WARNING_BG = ("#FEF3C7", "#78350F")
    WARNING_TEXT = ("#92400E", "#FCD34D")
    
    DANGER = ("#DC2626", "#EF4444")
    DANGER_HOVER = ("#B91C1C", "#DC2626")
    DANGER_BG = ("#FEE2E2", "#7F1D1D")
    DANGER_TEXT = ("#991B1B", "#F87171")
    
    INFO = ("#0284C7", "#38BDF8")
    INFO_HOVER = ("#0369A1", "#0284C7")
    INFO_BG = ("#E0F2FE", "#082F49")
    INFO_TEXT = ("#075985", "#7DD3FC")
    
    PURPLE = ("#7C3AED", "#A855F7")
    PURPLE_HOVER = ("#6D28D9", "#7C3AED")
    PURPLE_BG = ("#EDE9FE", "#3B0764")
    PURPLE_TEXT = ("#5B21B6", "#C084FC")

    EXCEL_HEADER_BG = ("#E5E7EB", "#2D333B")
    EXCEL_HEADER_TEXT = ("#1F2937", "#F9FAFB")
    EXCEL_HEADER_DIVIDER = ("#D1D5DB", "#404752")
    EXCEL_ROW_EVEN = ("#FFFFFF", "#242830")
    EXCEL_ROW_ODD = ("#F9FAFB", "#2B303A")
    EXCEL_ROW_HOVER = ("#F3F4F6", "#323B47")
    EXCEL_BORDER = ("#E5E7EB", "#374151")
    EXCEL_CELL_DIVIDER = ("#E5E7EB", "#2D333D")
    EXCEL_BADGE_BG = ("#F3F4F6", "#2A3240")
    EXCEL_BADGE_TEXT = ("#1F2937", "#93C5FD")
