import sys
import os
from pathlib import Path

# Asegurar directorio raíz en sys.path
BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

import customtkinter as ctk
from tkinter import messagebox
from PIL import Image
from models.auth import CurrentSession, AuthService
from views.theme import Theme, apply_window_icon, get_asset_path
from views.dashboard_view import DashboardView
from views.teachers_view import TeachersView
from views.students_view import StudentsView
from views.designations_view import DesignationsView
from views.reports_view import ReportsView
from views.attendance_view import AttendanceView
from views.login_view import DatabaseConfigDialog

class MainDashboardWindow(ctk.CTk):
    """
    Ventana del Dashboard Principal de SIGET construida con CustomTkinter.
    Implementa la identidad institucional basada en el logotipo oficial (Carbón y Dorado Mostaza).
    Diseño 100% corporativo sin emojis, con soporte de inicio en Modo Claro por defecto y alternancia a Modo Oscuro.
    """
    def __init__(self, user=None, on_logout=None):
        super().__init__()
        self.on_logout = on_logout
        self.logout_requested = False
        self.current_view = None
        self.logo_image = None

        if user:
            CurrentSession.set_user(user)

        self._configure_window()
        self._build_ui()
        self.show_view("dashboard")

    def _configure_window(self):
        user = CurrentSession.user
        is_rector = CurrentSession.is_rector()
        role_title = "Rector / Directivo - Acceso Total" if is_rector else "Bedelía / Operativo"
        self.title(f"SIGET - Panel Institucional [{role_title}]")
        self.geometry("1280x820")
        self.minsize(1050, 700)

        # Aplicar icono oficial de la aplicación
        apply_window_icon(self)

        # Aplicar color de fondo responsivo al frame raíz
        self.configure(fg_color=Theme.BG_WINDOW)

        # Configurar protocolo de cerrado seguro de la ventana
        self.protocol("WM_DELETE_WINDOW", self._on_close)

        # Centrar en pantalla
        self.update_idletasks()
        width = 1280
        height = 820
        x = max(0, (self.winfo_screenwidth() // 2) - (width // 2))
        y = max(0, (self.winfo_screenheight() // 2) - (height // 2))
        self.geometry(f"{width}x{height}+{x}+{y}")

    def _windows_set_titlebar_color(self, color_mode: str):
        try:
            super()._windows_set_titlebar_color(color_mode)
        except Exception:
            pass

    def deiconify(self):
        try:
            super().deiconify()
        except Exception:
            pass

    def mainloop(self, *args, **kwargs):
        try:
            super().mainloop(*args, **kwargs)
        except Exception:
            pass

    def destroy(self):
        try:
            super().destroy()
        except Exception:
            pass

    def _build_ui(self):
        self.grid_columnconfigure(0, weight=0)  # Barra lateral fija
        self.grid_columnconfigure(1, weight=1)  # Área de contenido
        self.grid_rowconfigure(0, weight=1)

        # =====================================================
        # 1. BARRA LATERAL (SIDEBAR) CORPORATIVA
        # =====================================================
        self.sidebar = ctk.CTkFrame(
            self,
            width=270,
            corner_radius=0,
            fg_color=Theme.BG_SIDEBAR,
            border_width=1,
            border_color=Theme.BORDER_SEPARATOR
        )
        self.sidebar.grid(row=0, column=0, sticky="nsew")
        self.sidebar.grid_propagate(False)

        # Branding Institucional con Logotipo Oficial
        brand_box = ctk.CTkFrame(self.sidebar, fg_color="transparent")
        brand_box.pack(fill="x", padx=18, pady=(20, 15))

        logo_path = get_asset_path("logo_transparent.png")
        if not os.path.exists(logo_path):
            logo_path = get_asset_path("logo.png")

        if os.path.exists(logo_path):
            try:
                pil_logo = Image.open(logo_path)
                self.logo_image = ctk.CTkImage(light_image=pil_logo, dark_image=pil_logo, size=(44, 44))
                lbl_logo_img = ctk.CTkLabel(brand_box, image=self.logo_image, text="")
                lbl_logo_img.pack(side="left", padx=(0, 10))
            except Exception:
                pass

        brand_text_box = ctk.CTkFrame(brand_box, fg_color="transparent")
        brand_text_box.pack(side="left", fill="both", expand=True)

        lbl_logo = ctk.CTkLabel(
            brand_text_box,
            text="SIGET",
            font=ctk.CTkFont(family="Segoe UI", size=22, weight="bold"),
            text_color=Theme.GOLD_ACCENT
        )
        lbl_logo.pack(anchor="w")

        lbl_sublogo = ctk.CTkLabel(
            brand_text_box,
            text="Gestión Educativa Terciaria",
            font=ctk.CTkFont(size=10),
            text_color=Theme.TEXT_MUTED
        )
        lbl_sublogo.pack(anchor="w")

        # Tarjeta del Usuario y Rol
        user = CurrentSession.user
        is_rector = CurrentSession.is_rector()

        user_card = ctk.CTkFrame(
            self.sidebar,
            fg_color=Theme.BG_CARD_SUB,
            corner_radius=8,
            border_width=1,
            border_color=Theme.BORDER_CARD
        )
        user_card.pack(fill="x", padx=16, pady=(0, 18))

        ctk.CTkLabel(
            user_card,
            text=user.full_name if user else "Usuario Activo",
            font=ctk.CTkFont(size=12, weight="bold"),
            text_color=Theme.TEXT_PRIMARY,
            wraplength=220,
            justify="left"
        ).pack(anchor="w", padx=12, pady=(10, 2))

        # Rol Badge resaltado con Dorado Institucional (#E0C45D)
        role_name = "RECTOR / DIRECTIVO" if is_rector else "BEDELÍA / OPERATIVO"
        badge_bg = ("#2B2B2B", "#1A1A1A")
        badge_fg = Theme.GOLD_ACCENT

        badge_role = ctk.CTkLabel(
            user_card,
            text=f"  {role_name}  ",
            font=ctk.CTkFont(size=10, weight="bold"),
            fg_color=badge_bg,
            text_color=badge_fg,
            corner_radius=4,
            height=20
        )
        badge_role.pack(anchor="w", padx=12, pady=(0, 10))

        # Menú de Navegación diferenciado según el rol (Sin Emojis)
        self.nav_buttons = {}
        nav_box = ctk.CTkFrame(self.sidebar, fg_color="transparent")
        nav_box.pack(fill="x", padx=12, pady=5)

        if is_rector:
            nav_items = [
                ("dashboard", "Dashboard General", True),
                ("teachers", "Docentes", True),
                ("designations", "Cátedras y Suplencias", True),
                ("reports", "Reportes y Planillas Excel", True),
                ("students", "Matrícula de Alumnos", True),
                ("config", "Configuración de BD", True),
            ]
        else:
            nav_items = [
                ("dashboard", "Dashboard Operativo", True),
                ("teachers", "Docentes", True),
                ("designations", "Consulta de Cátedras", True),
                ("students", "Inscripciones y Alumnos", True),
            ]

        for key, text, allowed in nav_items:
            if not allowed:
                continue
            btn = ctk.CTkButton(
                nav_box,
                text=text,
                font=ctk.CTkFont(size=12, weight="bold"),
                anchor="w",
                height=40,
                corner_radius=6,
                fg_color="transparent",
                hover_color=Theme.NAV_HOVER,
                text_color=Theme.NAV_TEXT,
                command=lambda k=key: self.show_view(k)
            )
            btn.pack(fill="x", pady=2)
            self.nav_buttons[key] = btn

        # =====================================================
        # Pie del Sidebar: Switch Tema y Cerrar Sesión
        # =====================================================
        bottom_box = ctk.CTkFrame(self.sidebar, fg_color="transparent")
        bottom_box.pack(side="bottom", fill="x", padx=16, pady=20)

        # Switch interactivo de Modo Oscuro ubicado exactamente arriba del botón rojo de Cerrar Sesión
        current_mode = ctk.get_appearance_mode()
        self.switch_theme = ctk.CTkSwitch(
            bottom_box,
            text="Modo Oscuro",
            font=ctk.CTkFont(family="Segoe UI", size=11, weight="bold"),
            text_color=Theme.TEXT_SECONDARY,
            progress_color=Theme.GOLD,
            command=self._toggle_theme,
            onvalue="Dark",
            offvalue="Light"
        )
        if current_mode == "Dark":
            self.switch_theme.select()
        else:
            self.switch_theme.deselect()
        self.switch_theme.pack(anchor="w", padx=2, pady=(0, 12))

        # Botón rojo institucional de Cerrar Sesión
        btn_logout = ctk.CTkButton(
            bottom_box,
            text="Cerrar Sesión",
            font=ctk.CTkFont(family="Segoe UI", size=12, weight="bold"),
            fg_color=Theme.DANGER,
            hover_color=Theme.DANGER_HOVER,
            text_color=("#FFFFFF", "#FFFFFF"),
            height=38,
            corner_radius=8,
            command=self._confirm_logout
        )
        btn_logout.pack(fill="x")

        # =====================================================
        # 2. CONTENIDO PRINCIPAL
        # =====================================================
        self.content_area = ctk.CTkFrame(
            self,
            corner_radius=0,
            fg_color=Theme.BG_CONTENT
        )
        self.content_area.grid(row=0, column=1, sticky="nsew", padx=0, pady=0)

        # Barra Superior de Estado y Título con Línea Acento Dorado
        self.top_bar = ctk.CTkFrame(
            self.content_area,
            height=62,
            fg_color=Theme.BG_TOPBAR,
            corner_radius=0,
            border_width=1,
            border_color=Theme.BORDER_SEPARATOR
        )
        self.top_bar.pack(fill="x", side="top")
        self.top_bar.pack_propagate(False)

        # Franja sutil institucional dorada en la parte superior
        gold_line = ctk.CTkFrame(self.top_bar, height=3, fg_color=Theme.GOLD, corner_radius=0)
        gold_line.pack(side="top", fill="x")

        bar_content = ctk.CTkFrame(self.top_bar, fg_color="transparent")
        bar_content.pack(fill="both", expand=True, padx=25)

        self.lbl_view_title = ctk.CTkLabel(
            bar_content,
            text="Dashboard Principal",
            font=ctk.CTkFont(size=17, weight="bold"),
            text_color=Theme.TEXT_PRIMARY
        )
        self.lbl_view_title.pack(side="left")

        role_badge_text = "Rectoría • Supervisión y Normativa" if is_rector else "Bedelía • Operativa y Alumnado"
        self.lbl_top_info = ctk.CTkLabel(
            bar_content,
            text=f"Instituto Terciario | {role_badge_text}",
            font=ctk.CTkFont(size=12),
            text_color=Theme.TEXT_MUTED
        )
        self.lbl_top_info.pack(side="right")

        # Contenedor para Vistas Dinámicas
        self.view_container = ctk.CTkFrame(self.content_area, fg_color="transparent")
        self.view_container.pack(fill="both", expand=True, padx=25, pady=20)

    def show_view(self, view_name):
        if view_name == "config":
            DatabaseConfigDialog(self, on_saved=self._on_db_config_saved)
            return

        # Mapeo de botón activo (si se solicita attendance desde accesos directos, resalta Docentes)
        active_key = "teachers" if view_name == "attendance" else view_name

        # Actualizar resaltado de botón activo en la barra lateral con paleta institucional
        for key, btn in self.nav_buttons.items():
            if key == active_key:
                btn.configure(fg_color=Theme.NAV_ACTIVE_BG, text_color=Theme.NAV_ACTIVE_TEXT)
            else:
                btn.configure(fg_color="transparent", text_color=Theme.NAV_TEXT)

        # Destruir vista anterior
        if self.current_view:
            try:
                self.current_view.destroy()
            except Exception:
                pass
            self.current_view = None

        # Título dinámico sin emojis
        titles = {
            "dashboard": "Panel de Control y Estadísticas Globales" if CurrentSession.is_rector() else "Panel Operativo de Bedelía",
            "teachers": "Gestión Integral de Docentes: Planta Funcional y Asistencias",
            "students": "Matrícula y Legajos de Alumnos",
            "designations": "Designaciones de Cátedras y Registro de Suplencias",
            "reports": "Reportes Oficiales y Planilla de Estadísticas (Excel)",
            "attendance": "Gestión Integral de Docentes: Planta Funcional y Asistencias"
        }
        self.lbl_view_title.configure(text=titles.get(view_name, "SIGET"))

        # Instanciar vista correspondiente con protección de resiliencia LAN
        try:
            if view_name == "dashboard":
                self.current_view = DashboardView(self.view_container, on_navigate=self.show_view)
            elif view_name == "teachers":
                self.current_view = TeachersView(self.view_container)
            elif view_name == "attendance":
                # Abre el módulo de docentes directamente posicionado en Asistencias
                self.current_view = TeachersView(self.view_container, default_tab="attendance")
            elif view_name == "students":
                self.current_view = StudentsView(self.view_container)
            elif view_name == "designations":
                self.current_view = DesignationsView(self.view_container)
            elif view_name == "reports":
                self.current_view = ReportsView(self.view_container)

            if self.current_view:
                self.current_view.pack(fill="both", expand=True)
        except Exception as e:
            messagebox.showwarning(
                "Interrupción de Conectividad LAN",
                f"No se pudieron cargar los datos de la vista '{titles.get(view_name, view_name)}'.\n\n"
                f"Detalle: {str(e)}\n\n"
                "Verifique la conexión física o Wi-Fi con la PC Servidor e intente nuevamente."
            )

    def _on_db_config_saved(self):
        messagebox.showinfo("Actualizado", "Configuración de base de datos actualizada. Refrescando vistas.")
        self.show_view("dashboard")

    def _toggle_theme(self):
        """Altera fluidamente entre Modo Oscuro institucional y Modo Claro limpio."""
        mode = self.switch_theme.get()
        ctk.set_appearance_mode(mode)
        self.update_idletasks()

    def _confirm_logout(self):
        if messagebox.askyesno("Cerrar Sesión", "¿Está seguro de que desea cerrar la sesión actual?"):
            AuthService.logout()
            self.logout_requested = True
            self.withdraw()
            self.destroy()
            if self.on_logout:
                self.on_logout()

    def _on_close(self):
        """Maneja el cierre de la ventana con la X."""
        self.logout_requested = False
        self.withdraw()
        self.destroy()

# Alias de compatibilidad
MainWindow = MainDashboardWindow

if __name__ == "__main__":
    from database.config import load_config
    from database.connection import init_db

    ctk.set_appearance_mode("Light")
    ctk.set_default_color_theme("blue")
    cfg = load_config()
    init_db(cfg)

    # Iniciar con Rector para prueba si no hay sesión
    if not CurrentSession.is_authenticated():
        AuthService.login("rector", "rector123")

    app = MainDashboardWindow()
    app.mainloop()
