import customtkinter as ctk
from tkinter import messagebox
import os
from PIL import Image
from database.config import load_config, save_config
from database.connection import init_db
from models.auth import AuthService
from views.theme import Theme, apply_window_icon, get_asset_path

class DatabaseConfigDialog(ctk.CTkToplevel):
    def __init__(self, parent, on_saved=None):
        super().__init__(parent)
        self.on_saved = on_saved
        self.title("Configuración de Motor de Base de Datos")
        self.geometry("480x420")
        self.resizable(False, False)
        self.transient(parent)
        self.grab_set()

        apply_window_icon(self)
        self.configure(fg_color=Theme.BG_CARD)

        self.cfg = load_config()
        self._build_ui()

    def _build_ui(self):
        ctk.CTkLabel(
            self,
            text="Parámetros de Base de Datos",
            font=ctk.CTkFont(size=16, weight="bold"),
            text_color=Theme.TEXT_PRIMARY
        ).pack(pady=(20, 15))

        # Selector de Motor
        frame_engine = ctk.CTkFrame(self, fg_color="transparent")
        frame_engine.pack(fill="x", padx=30, pady=5)
        ctk.CTkLabel(frame_engine, text="Motor de Base de Datos:", width=140, anchor="w", text_color=Theme.TEXT_SECONDARY).pack(side="left")
        self.var_engine = ctk.StringVar(value=self.cfg.get("db_type", "sqlite"))
        self.combo_engine = ctk.CTkComboBox(
            frame_engine,
            values=["sqlite", "mysql", "postgresql"],
            variable=self.var_engine,
            command=self._on_engine_change,
            width=240,
            fg_color=Theme.BG_INPUT,
            border_color=Theme.BORDER_INPUT,
            text_color=Theme.TEXT_PRIMARY,
            dropdown_fg_color=Theme.BG_CARD,
            dropdown_text_color=Theme.TEXT_PRIMARY
        )
        self.combo_engine.pack(side="right")

        # Host
        self.frame_host = ctk.CTkFrame(self, fg_color="transparent")
        self.frame_host.pack(fill="x", padx=30, pady=5)
        ctk.CTkLabel(self.frame_host, text="Host / Servidor:", width=140, anchor="w", text_color=Theme.TEXT_SECONDARY).pack(side="left")
        self.entry_host = ctk.CTkEntry(self.frame_host, width=240, fg_color=Theme.BG_INPUT, border_color=Theme.BORDER_INPUT, text_color=Theme.TEXT_PRIMARY)
        self.entry_host.insert(0, str(self.cfg.get("host", "localhost")))
        self.entry_host.pack(side="right")

        # Puerto
        self.frame_port = ctk.CTkFrame(self, fg_color="transparent")
        self.frame_port.pack(fill="x", padx=30, pady=5)
        ctk.CTkLabel(self.frame_port, text="Puerto:", width=140, anchor="w", text_color=Theme.TEXT_SECONDARY).pack(side="left")
        self.entry_port = ctk.CTkEntry(self.frame_port, width=240, fg_color=Theme.BG_INPUT, border_color=Theme.BORDER_INPUT, text_color=Theme.TEXT_PRIMARY)
        self.entry_port.insert(0, str(self.cfg.get("port", 3306)))
        self.entry_port.pack(side="right")

        # Nombre de Base de Datos
        self.frame_db = ctk.CTkFrame(self, fg_color="transparent")
        self.frame_db.pack(fill="x", padx=30, pady=5)
        ctk.CTkLabel(self.frame_db, text="Nombre de BD:", width=140, anchor="w", text_color=Theme.TEXT_SECONDARY).pack(side="left")
        self.entry_db = ctk.CTkEntry(self.frame_db, width=240, fg_color=Theme.BG_INPUT, border_color=Theme.BORDER_INPUT, text_color=Theme.TEXT_PRIMARY)
        self.entry_db.insert(0, str(self.cfg.get("database", "siget_db")))
        self.entry_db.pack(side="right")

        # Usuario
        self.frame_user = ctk.CTkFrame(self, fg_color="transparent")
        self.frame_user.pack(fill="x", padx=30, pady=5)
        ctk.CTkLabel(self.frame_user, text="Usuario:", width=140, anchor="w", text_color=Theme.TEXT_SECONDARY).pack(side="left")
        self.entry_user = ctk.CTkEntry(self.frame_user, width=240, fg_color=Theme.BG_INPUT, border_color=Theme.BORDER_INPUT, text_color=Theme.TEXT_PRIMARY)
        self.entry_user.insert(0, str(self.cfg.get("user", "root")))
        self.entry_user.pack(side="right")

        # Contraseña
        self.frame_pass = ctk.CTkFrame(self, fg_color="transparent")
        self.frame_pass.pack(fill="x", padx=30, pady=5)
        ctk.CTkLabel(self.frame_pass, text="Contraseña:", width=140, anchor="w", text_color=Theme.TEXT_SECONDARY).pack(side="left")
        self.entry_pass = ctk.CTkEntry(self.frame_pass, width=240, show="*", fg_color=Theme.BG_INPUT, border_color=Theme.BORDER_INPUT, text_color=Theme.TEXT_PRIMARY)
        self.entry_pass.insert(0, str(self.cfg.get("password", "")))
        self.entry_pass.pack(side="right")

        # Botones
        frame_btn = ctk.CTkFrame(self, fg_color="transparent")
        frame_btn.pack(fill="x", padx=30, pady=(25, 10))

        btn_cancel = ctk.CTkButton(
            frame_btn,
            text="Cancelar",
            fg_color=Theme.SECONDARY,
            hover_color=Theme.SECONDARY_HOVER,
            text_color=Theme.SECONDARY_TEXT,
            command=self.destroy,
            width=100
        )
        btn_cancel.pack(side="left")

        btn_save = ctk.CTkButton(
            frame_btn,
            text="Guardar y Conectar",
            fg_color=Theme.PRIMARY,
            hover_color=Theme.PRIMARY_HOVER,
            text_color=Theme.PRIMARY_TEXT,
            command=self._save,
            width=180
        )
        btn_save.pack(side="right")

        self._on_engine_change(self.var_engine.get())

    def _on_engine_change(self, val):
        is_remote = val in ["mysql", "postgresql"]
        state = "normal" if is_remote else "disabled"
        for entry in [self.entry_host, self.entry_port, self.entry_db, self.entry_user, self.entry_pass]:
            entry.configure(state=state)

    def _save(self):
        self.cfg["db_type"] = self.var_engine.get()
        if self.cfg["db_type"] in ["mysql", "postgresql"]:
            self.cfg["host"] = self.entry_host.get().strip()
            self.cfg["port"] = int(self.entry_port.get().strip()) if self.entry_port.get().strip().isdigit() else 3306
            self.cfg["database"] = self.entry_db.get().strip()
            self.cfg["user"] = self.entry_user.get().strip()
            self.cfg["password"] = self.entry_pass.get()

        save_config(self.cfg)
        try:
            init_db(self.cfg)
            messagebox.showinfo("Éxito", "Configuración guardada e inicializada correctamente.")
            if self.on_saved:
                self.on_saved()
            self.destroy()
        except Exception as e:
            messagebox.showerror("Error de Conexión", f"No se pudo conectar con los parámetros provistos:\n{str(e)}")

class LoginWindow(ctk.CTk):
    """
    Ventana de Autenticación Institucional para SIGET.
    Inicia en Modo Claro por defecto con soporte completo para alternancia y paleta oficial
    basada en el logotipo del instituto (Carbón y Dorado Mostaza).
    """
    def __init__(self, on_login_success=None):
        super().__init__()
        self.on_login_success = on_login_success
        self.authenticated_user = None
        self.logo_image = None

        self.title("SIGET - Acceso Institucional")
        self.geometry("900x560")
        self.minsize(860, 520)
        self.resizable(False, False)

        apply_window_icon(self)
        self.configure(fg_color=Theme.BG_WINDOW)

        # Configurar protocolo de cerrado seguro
        self.protocol("WM_DELETE_WINDOW", self._on_close)

        self._center_window()
        self._build_ui()
        self._check_db_status()

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

    def _center_window(self):
        self.update_idletasks()
        width = 900
        height = 560
        x = max(0, (self.winfo_screenwidth() // 2) - (width // 2))
        y = max(0, (self.winfo_screenheight() // 2) - (height // 2))
        self.geometry(f"{width}x{height}+{x}+{y}")

    def _build_ui(self):
        # Contenedor Principal en 2 Columnas
        self.grid_columnconfigure(0, weight=4)
        self.grid_columnconfigure(1, weight=5)
        self.grid_rowconfigure(0, weight=1)

        # =====================================================
        # PANEL IZQUIERDO: Branding Institucional (Carbón Grafito)
        # =====================================================
        self.left_panel = ctk.CTkFrame(
            self,
            corner_radius=0,
            fg_color="#181818"  # Carbón profundo institucional
        )
        self.left_panel.grid(row=0, column=0, sticky="nsew", padx=0, pady=0)

        # Cargar Logotipo Oficial
        logo_path = get_asset_path("logo_transparent.png")
        if not os.path.exists(logo_path):
            logo_path = get_asset_path("logo.png")

        if os.path.exists(logo_path):
            try:
                pil_logo = Image.open(logo_path)
                self.logo_image = ctk.CTkImage(light_image=pil_logo, dark_image=pil_logo, size=(68, 68))
                lbl_logo = ctk.CTkLabel(self.left_panel, image=self.logo_image, text="")
                lbl_logo.pack(anchor="w", padx=35, pady=(35, 12))
            except Exception:
                pass

        lbl_brand_badge = ctk.CTkLabel(
            self.left_panel,
            text="INSTITUTO DE EDUCACIÓN SUPERIOR",
            font=ctk.CTkFont(family="Segoe UI", size=10, weight="bold"),
            text_color=Theme.GOLD_ACCENT  # Dorado institucional del logo oficial (#E0C45D)
        )
        lbl_brand_badge.pack(anchor="w", padx=35, pady=(0, 4))

        lbl_app_name = ctk.CTkLabel(
            self.left_panel,
            text="SIGET",
            font=ctk.CTkFont(family="Segoe UI", size=38, weight="bold"),
            text_color="#F8FAFC"
        )
        lbl_app_name.pack(anchor="w", padx=35, pady=(0, 2))

        lbl_app_desc = ctk.CTkLabel(
            self.left_panel,
            text="Sistema Integral de Gestión Educativa Terciaria",
            font=ctk.CTkFont(family="Segoe UI", size=12, weight="normal"),
            text_color="#94A3B8",
            wraplength=270,
            justify="left"
        )
        lbl_app_desc.pack(anchor="w", padx=35, pady=(0, 20))

        # Características destacadas (Sin emojis, con punto dorado)
        features = [
            "Control de Planta Funcional y Legajos",
            "Validación de Tope de Horas Cátedra",
            "Detección de Superposiciones Horarias",
            "Gestión Integral de Suplencias y Licencias",
            "Reportes Estadísticos Mensuales Oficiales"
        ]

        for text in features:
            f_frame = ctk.CTkFrame(self.left_panel, fg_color="transparent")
            f_frame.pack(fill="x", padx=35, pady=4)
            ctk.CTkLabel(
                f_frame,
                text="•",
                font=ctk.CTkFont(size=14, weight="bold"),
                text_color=Theme.GOLD_ACCENT,
                width=16
            ).pack(side="left")
            ctk.CTkLabel(
                f_frame,
                text=text,
                font=ctk.CTkFont(size=11),
                text_color="#CBD5E1",
                anchor="w"
            ).pack(side="left", padx=4)

        # Pie del panel izquierdo
        lbl_version = ctk.CTkLabel(
            self.left_panel,
            text="Versión 1.0.0 Enterprise • PyInstaller Ready",
            font=ctk.CTkFont(size=10),
            text_color="#64748B"
        )
        lbl_version.pack(side="bottom", pady=18)

        # =====================================================
        # PANEL DERECHO: Formulario de Acceso Institucional
        # =====================================================
        self.right_panel = ctk.CTkFrame(
            self,
            corner_radius=0,
            fg_color=Theme.BG_CARD
        )
        self.right_panel.grid(row=0, column=1, sticky="nsew", padx=0, pady=0)

        # Encabezado Formulario
        header_frame = ctk.CTkFrame(self.right_panel, fg_color="transparent")
        header_frame.pack(fill="x", padx=45, pady=(35, 15))

        ctk.CTkLabel(
            header_frame,
            text="Acceso al Sistema",
            font=ctk.CTkFont(family="Segoe UI", size=24, weight="bold"),
            text_color=Theme.TEXT_PRIMARY
        ).pack(anchor="w")

        ctk.CTkLabel(
            header_frame,
            text="Ingrese su usuario y clave institucional asignada",
            font=ctk.CTkFont(size=12),
            text_color=Theme.TEXT_SECONDARY
        ).pack(anchor="w", pady=(4, 0))

        # Campo: Usuario
        form_frame = ctk.CTkFrame(self.right_panel, fg_color="transparent")
        form_frame.pack(fill="x", padx=45, pady=6)

        ctk.CTkLabel(
            form_frame,
            text="Usuario o Legajo:",
            font=ctk.CTkFont(size=12, weight="bold"),
            text_color=Theme.TEXT_SECONDARY
        ).pack(anchor="w", pady=(0, 4))

        self.entry_username = ctk.CTkEntry(
            form_frame,
            placeholder_text="Ej. rector o bedel",
            height=38,
            font=ctk.CTkFont(size=13),
            fg_color=Theme.BG_INPUT,
            border_color=Theme.BORDER_INPUT,
            text_color=Theme.TEXT_PRIMARY
        )
        self.entry_username.pack(fill="x", pady=(0, 12))
        self.entry_username.bind("<Return>", lambda e: self.entry_password.focus())

        # Campo: Contraseña
        ctk.CTkLabel(
            form_frame,
            text="Contraseña:",
            font=ctk.CTkFont(size=12, weight="bold"),
            text_color=Theme.TEXT_SECONDARY
        ).pack(anchor="w", pady=(0, 4))

        self.pass_container = ctk.CTkFrame(form_frame, fg_color="transparent")
        self.pass_container.pack(fill="x", pady=(0, 4))

        self.entry_password = ctk.CTkEntry(
            self.pass_container,
            placeholder_text="••••••••",
            show="*",
            height=38,
            font=ctk.CTkFont(size=13),
            fg_color=Theme.BG_INPUT,
            border_color=Theme.BORDER_INPUT,
            text_color=Theme.TEXT_PRIMARY
        )
        self.entry_password.pack(side="left", fill="x", expand=True)
        self.entry_password.bind("<Return>", lambda e: self._handle_login())

        self.btn_toggle_pass = ctk.CTkButton(
            self.pass_container,
            text="Ver",
            width=50,
            height=38,
            fg_color=Theme.SECONDARY,
            hover_color=Theme.SECONDARY_HOVER,
            text_color=Theme.SECONDARY_TEXT,
            command=self._toggle_password_visibility
        )
        self.btn_toggle_pass.pack(side="right", padx=(8, 0))

        # Mensaje de error/estado
        self.lbl_status = ctk.CTkLabel(
            self.right_panel,
            text="",
            font=ctk.CTkFont(size=11, weight="bold"),
            text_color=Theme.DANGER_TEXT
        )
        self.lbl_status.pack(padx=45, pady=(2, 4), anchor="w")

        # Botón Iniciar Sesión (Dorado Institucional)
        self.btn_login = ctk.CTkButton(
            self.right_panel,
            text="Ingresar a SIGET",
            height=42,
            font=ctk.CTkFont(size=13, weight="bold"),
            fg_color=Theme.PRIMARY,
            hover_color=Theme.PRIMARY_HOVER,
            text_color=Theme.PRIMARY_TEXT,
            command=self._handle_login
        )
        self.btn_login.pack(fill="x", padx=45, pady=(4, 12))

        # Accesos Rápidos de Prueba (Rector / Bedel)
        demo_frame = ctk.CTkFrame(
            self.right_panel,
            fg_color=Theme.BG_CARD_SUB,
            border_width=1,
            border_color=Theme.BORDER_CARD,
            corner_radius=8
        )
        demo_frame.pack(fill="x", padx=45, pady=(4, 12))

        ctk.CTkLabel(
            demo_frame,
            text="Perfiles de Demostración y Pruebas:",
            font=ctk.CTkFont(size=11, weight="bold"),
            text_color=Theme.TEXT_MUTED
        ).pack(anchor="w", padx=12, pady=(6, 4))

        quick_btns_frame = ctk.CTkFrame(demo_frame, fg_color="transparent")
        quick_btns_frame.pack(fill="x", padx=12, pady=(0, 8))

        self.btn_fill_rector = ctk.CTkButton(
            quick_btns_frame,
            text="Rector (Acceso Total)",
            font=ctk.CTkFont(size=11, weight="bold"),
            fg_color=Theme.SECONDARY,
            hover_color=Theme.SECONDARY_HOVER,
            text_color=Theme.SECONDARY_TEXT,
            height=30,
            command=lambda: self._quick_login("rector", "rector123")
        )
        self.btn_fill_rector.pack(side="left", expand=True, fill="x", padx=(0, 4))

        self.btn_fill_bedel = ctk.CTkButton(
            quick_btns_frame,
            text="Bedel (Operativo)",
            font=ctk.CTkFont(size=11, weight="bold"),
            fg_color=Theme.SECONDARY,
            hover_color=Theme.SECONDARY_HOVER,
            text_color=Theme.SECONDARY_TEXT,
            height=30,
            command=lambda: self._quick_login("bedel", "bedel123")
        )
        self.btn_fill_bedel.pack(side="right", expand=True, fill="x", padx=(4, 0))

        # Barra inferior: Estado de BD y Configuración
        bottom_bar = ctk.CTkFrame(self.right_panel, fg_color="transparent")
        bottom_bar.pack(side="bottom", fill="x", padx=45, pady=18)

        self.lbl_db_badge = ctk.CTkLabel(
            bottom_bar,
            text="Estado BD: Conectando...",
            font=ctk.CTkFont(size=11),
            text_color=Theme.SUCCESS_TEXT
        )
        self.lbl_db_badge.pack(side="left")

        btn_db_settings = ctk.CTkButton(
            bottom_bar,
            text="Configuración BD",
            font=ctk.CTkFont(size=11),
            fg_color=Theme.SECONDARY,
            hover_color=Theme.SECONDARY_HOVER,
            text_color=Theme.SECONDARY_TEXT,
            border_width=1,
            border_color=Theme.BORDER_CARD,
            height=28,
            width=120,
            command=self._open_db_config
        )
        btn_db_settings.pack(side="right")

    def _quick_login(self, u, p):
        """Llena las credenciales de prueba y ejecuta la validación inmediata del usuario."""
        self._set_credentials(u, p)
        self._handle_login()

    def _set_credentials(self, u, p):
        self.entry_username.delete(0, "end")
        self.entry_username.insert(0, u)
        self.entry_password.delete(0, "end")
        self.entry_password.insert(0, p)
        self.lbl_status.configure(text="")

    def _toggle_password_visibility(self):
        if self.entry_password.cget("show") == "*":
            self.entry_password.configure(show="")
            self.btn_toggle_pass.configure(text="Ocultar")
        else:
            self.entry_password.configure(show="*")
            self.btn_toggle_pass.configure(text="Ver")

    def _check_db_status(self):
        try:
            cfg = load_config()
            init_db(cfg)
            db_type = cfg.get("db_type", "sqlite").upper()
            self.lbl_db_badge.configure(
                text=f"Estado BD: {db_type} Activa",
                text_color=Theme.SUCCESS_TEXT
            )
        except Exception:
            self.lbl_db_badge.configure(
                text="Estado BD: Error de Conexión",
                text_color=Theme.DANGER_TEXT
            )

    def _open_db_config(self):
        DatabaseConfigDialog(self, on_saved=self._check_db_status)

    def _handle_login(self):
        u = self.entry_username.get().strip()
        p = self.entry_password.get()

        if not u or not p:
            self.lbl_status.configure(text="Complete usuario y contraseña institucional.", text_color=Theme.WARNING_TEXT)
            return

        self.lbl_status.configure(text="Validando credenciales...", text_color=Theme.INFO_TEXT)
        self.btn_login.configure(state="disabled")
        self.update_idletasks()

        success, result = AuthService.login(u, p)
        if success:
            user = result
            self.lbl_status.configure(
                text=f"Bienvenido/a {user.full_name}. Accediendo...",
                text_color=Theme.SUCCESS_TEXT
            )
            self.update_idletasks()
            self.after(300, lambda: self._on_success(user))
        else:
            self.btn_login.configure(state="normal")
            self.lbl_status.configure(
                text=f"{result}",
                text_color=Theme.DANGER_TEXT
            )

    def _on_success(self, user):
        self.authenticated_user = user
        self.withdraw()
        self.destroy()
        if self.on_login_success:
            self.on_login_success(user)

    def _on_close(self):
        self.authenticated_user = None
        self.withdraw()
        self.destroy()
