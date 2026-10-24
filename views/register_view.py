"""
Módulo de Registro Institucional y Configuración Inicial (First-Run) para SIGET (CustomTkinter).
Permite crear cuentas de usuario con roles RECTOR, BEDEL o SECRETARIO, cifrando contraseñas con bcrypt,
configurando pregunta secreta y generando la Master Recovery Key alfanumérica única.
"""

import os
import customtkinter as ctk
from tkinter import messagebox
from PIL import Image

from database.connection import init_db
from database.config import load_config
from models.auth import AuthService
from views.theme import Theme, apply_window_icon, get_asset_path


class RegisterDialog(ctk.CTkToplevel):
    """
    Ventana emergente institucional para el Registro de Cuentas y Configuración Inicial de SIGET.
    Diseño sobrio y corporativo basado en la paleta institucional (Carbón #181818 y Dorado #E0C45D).
    """
    def __init__(self, parent=None, on_register_success=None, is_first_run=False):
        super().__init__(parent)
        self.parent_window = parent
        self.on_register_success = on_register_success
        self.is_first_run = is_first_run
        self.master_recovery_key = None

        title_text = "Configuración Inicial de Rector (First-Run)" if is_first_run else "Registro Institucional de Cuenta"
        self.title(f"SIGET - {title_text}")
        self.geometry("560x700")
        self.minsize(520, 650)
        self.resizable(False, False)

        if parent:
            self.transient(parent)
            try:
                self.grab_set()
            except Exception:
                pass

        apply_window_icon(self)
        self.configure(fg_color=Theme.BG_WINDOW)

        self._center_window()
        self._build_ui()

    def _center_window(self):
        self.update_idletasks()
        w = 560
        h = 700
        x = max(0, (self.winfo_screenwidth() // 2) - (w // 2))
        y = max(0, (self.winfo_screenheight() // 2) - (h // 2))
        self.geometry(f"{w}x{h}+{x}+{y}")

    def _build_ui(self):
        # Contenedor Tarjeta Blanca Central
        self.card = ctk.CTkFrame(
            self,
            corner_radius=12,
            fg_color=Theme.BG_CARD,
            border_width=1,
            border_color=Theme.BORDER_CARD
        )
        self.card.pack(fill="both", expand=True, padx=20, pady=20)

        # 1. Encabezado con Isotipo y Título
        header_frame = ctk.CTkFrame(self.card, fg_color="transparent")
        header_frame.pack(fill="x", padx=25, pady=(20, 10))

        logo_path = get_asset_path("logo_transparent.png")
        if not os.path.exists(logo_path):
            logo_path = get_asset_path("logo.png")

        if os.path.exists(logo_path):
            try:
                pil_logo = Image.open(logo_path)
                self.logo_img = ctk.CTkImage(light_image=pil_logo, dark_image=pil_logo, size=(38, 38))
                lbl_logo = ctk.CTkLabel(header_frame, image=self.logo_img, text="")
                lbl_logo.pack(side="left", padx=(0, 12))
            except Exception:
                pass

        title_container = ctk.CTkFrame(header_frame, fg_color="transparent")
        title_container.pack(side="left", fill="both", expand=True)

        badge_text = "CONFIGURACIÓN INICIAL" if self.is_first_run else "REGISTRO DE CUENTA"
        ctk.CTkLabel(
            title_container,
            text=badge_text,
            font=ctk.CTkFont(family="Segoe UI", size=10, weight="bold"),
            text_color=Theme.GOLD_ACCENT
        ).pack(anchor="w")

        ctk.CTkLabel(
            title_container,
            text="Alta de Perfil Institucional",
            font=ctk.CTkFont(family="Segoe UI", size=18, weight="bold"),
            text_color=Theme.TEXT_PRIMARY
        ).pack(anchor="w")

        desc_text = "Cree la cuenta maestra obligatoria de Rector para inicializar SIGET." if self.is_first_run else "Complete los datos para generar un nuevo perfil de acceso."
        ctk.CTkLabel(
            self.card,
            text=desc_text,
            font=ctk.CTkFont(size=11),
            text_color=Theme.TEXT_SECONDARY,
            wraplength=480,
            justify="left"
        ).pack(anchor="w", padx=25, pady=(0, 10))

        # 2. Formulario de Campos con ScrollFrame si se requiere
        form_frame = ctk.CTkScrollableFrame(self.card, fg_color="transparent", height=420)
        form_frame.pack(fill="both", expand=True, padx=15, pady=0)

        # Nombre Completo
        ctk.CTkLabel(form_frame, text="Nombre y Apellido *", font=ctk.CTkFont(size=11, weight="bold"), text_color=Theme.TEXT_SECONDARY).pack(anchor="w", padx=10, pady=(4, 2))
        self.entry_fullname = ctk.CTkEntry(form_frame, placeholder_text="Ej. Lic. Roberto Gómez", height=34, font=ctk.CTkFont(size=12), fg_color=Theme.BG_INPUT, border_color=Theme.BORDER_INPUT, text_color=Theme.TEXT_PRIMARY)
        self.entry_fullname.pack(fill="x", padx=10, pady=(0, 8))

        # Rol Institucional
        ctk.CTkLabel(form_frame, text="Rol Institucional *", font=ctk.CTkFont(size=11, weight="bold"), text_color=Theme.TEXT_SECONDARY).pack(anchor="w", padx=10, pady=(4, 2))
        self.role_var = ctk.StringVar(value="Rector" if self.is_first_run else "Bedelía")
        role_values = ["Rector", "Secretaría", "Bedelía"] if not self.is_first_run else ["Rector"]
        self.combo_role = ctk.CTkComboBox(
            form_frame,
            values=role_values,
            variable=self.role_var,
            height=34,
            command=self._on_role_change,
            fg_color=Theme.BG_INPUT,
            border_color=Theme.BORDER_INPUT,
            text_color=Theme.TEXT_PRIMARY,
            dropdown_fg_color=Theme.BG_CARD,
            dropdown_text_color=Theme.TEXT_PRIMARY,
            state="disabled" if self.is_first_run else "readonly"
        )
        self.combo_role.pack(fill="x", padx=10, pady=(0, 8))

        # Usuario y Correo (2 columnas)
        u_box = ctk.CTkFrame(form_frame, fg_color="transparent")
        u_box.pack(fill="x", padx=10, pady=(0, 8))
        u_box.grid_columnconfigure(0, weight=1)
        u_box.grid_columnconfigure(1, weight=1)

        ctk.CTkLabel(u_box, text="Usuario / Identificador *", font=ctk.CTkFont(size=11, weight="bold"), text_color=Theme.TEXT_SECONDARY).grid(row=0, column=0, sticky="w", pady=(0, 2))
        self.entry_username = ctk.CTkEntry(u_box, placeholder_text="Ej. rector o rgomez", height=34, font=ctk.CTkFont(size=12), fg_color=Theme.BG_INPUT, border_color=Theme.BORDER_INPUT, text_color=Theme.TEXT_PRIMARY)
        self.entry_username.grid(row=1, column=0, sticky="ew", padx=(0, 6))

        ctk.CTkLabel(u_box, text="Correo Institucional", font=ctk.CTkFont(size=11, weight="bold"), text_color=Theme.TEXT_SECONDARY).grid(row=0, column=1, sticky="w", pady=(0, 2))
        self.entry_email = ctk.CTkEntry(u_box, placeholder_text="institucional@ies.edu.ar", height=34, font=ctk.CTkFont(size=12), fg_color=Theme.BG_INPUT, border_color=Theme.BORDER_INPUT, text_color=Theme.TEXT_PRIMARY)
        self.entry_email.grid(row=1, column=1, sticky="ew", padx=(6, 0))

        # Contraseña y Confirmar Contraseña
        p_box = ctk.CTkFrame(form_frame, fg_color="transparent")
        p_box.pack(fill="x", padx=10, pady=(0, 8))
        p_box.grid_columnconfigure(0, weight=1)
        p_box.grid_columnconfigure(1, weight=1)

        ctk.CTkLabel(p_box, text="Contraseña (mín. 6 caract.) *", font=ctk.CTkFont(size=11, weight="bold"), text_color=Theme.TEXT_SECONDARY).grid(row=0, column=0, sticky="w", pady=(0, 2))
        self.entry_pass = ctk.CTkEntry(p_box, placeholder_text="••••••••", show="*", height=34, font=ctk.CTkFont(size=12), fg_color=Theme.BG_INPUT, border_color=Theme.BORDER_INPUT, text_color=Theme.TEXT_PRIMARY)
        self.entry_pass.grid(row=1, column=0, sticky="ew", padx=(0, 6))

        ctk.CTkLabel(p_box, text="Confirmar Contraseña *", font=ctk.CTkFont(size=11, weight="bold"), text_color=Theme.TEXT_SECONDARY).grid(row=0, column=1, sticky="w", pady=(0, 2))
        self.entry_confirm = ctk.CTkEntry(p_box, placeholder_text="••••••••", show="*", height=34, font=ctk.CTkFont(size=12), fg_color=Theme.BG_INPUT, border_color=Theme.BORDER_INPUT, text_color=Theme.TEXT_PRIMARY)
        self.entry_confirm.grid(row=1, column=1, sticky="ew", padx=(6, 0))

        # Pregunta y Respuesta de Seguridad
        ctk.CTkLabel(form_frame, text="Pregunta Secreta de Recuperación *", font=ctk.CTkFont(size=11, weight="bold"), text_color=Theme.TEXT_SECONDARY).pack(anchor="w", padx=10, pady=(6, 2))
        self.q_presets = [
            "¿Cuál fue el nombre de tu primera escuela?",
            "¿En qué ciudad naciste?",
            "¿Cuál es el segundo nombre de tu madre?",
            "¿Cuál fue tu primer número de legajo institucional?",
            "Personalizada (Escribir otra pregunta)..."
        ]
        self.var_question = ctk.StringVar(value=self.q_presets[0])
        self.combo_question = ctk.CTkComboBox(
            form_frame,
            values=self.q_presets,
            variable=self.var_question,
            command=self._on_question_change,
            height=34,
            fg_color=Theme.BG_INPUT,
            border_color=Theme.BORDER_INPUT,
            text_color=Theme.TEXT_PRIMARY,
            dropdown_fg_color=Theme.BG_CARD,
            dropdown_text_color=Theme.TEXT_PRIMARY
        )
        self.combo_question.pack(fill="x", padx=10, pady=(0, 4))

        self.entry_custom_q = ctk.CTkEntry(
            form_frame,
            placeholder_text="Escriba su pregunta de seguridad personalizada...",
            height=34,
            font=ctk.CTkFont(size=12),
            fg_color=Theme.BG_INPUT,
            border_color=Theme.BORDER_INPUT,
            text_color=Theme.TEXT_PRIMARY
        )

        ctk.CTkLabel(form_frame, text="Respuesta Secreta Confidencial *", font=ctk.CTkFont(size=11, weight="bold"), text_color=Theme.TEXT_SECONDARY).pack(anchor="w", padx=10, pady=(6, 2))
        self.entry_answer = ctk.CTkEntry(form_frame, placeholder_text="Respuesta para restaurar clave offline", height=34, font=ctk.CTkFont(size=12), fg_color=Theme.BG_INPUT, border_color=Theme.BORDER_INPUT, text_color=Theme.TEXT_PRIMARY)
        self.entry_answer.pack(fill="x", padx=10, pady=(0, 10))

        # Aviso dinámico de Master Recovery Key si es Rector
        self.frame_rector_hint = ctk.CTkFrame(form_frame, fg_color=Theme.GOLD_BG, corner_radius=8, border_width=1, border_color=Theme.GOLD_ACCENT)
        self.frame_rector_hint.pack(fill="x", padx=10, pady=(4, 8))

        ctk.CTkLabel(
            self.frame_rector_hint,
            text="⚠️ Privilegio de Rector: El sistema generará una Master Recovery Key única de rescate definitivo.",
            font=ctk.CTkFont(size=10, weight="bold"),
            text_color=Theme.PRIMARY_TEXT,
            wraplength=460,
            justify="left"
        ).pack(padx=10, pady=8)

        if not self.is_first_run and self.role_var.get() != "Rector":
            self.frame_rector_hint.pack_forget()

        # 3. Label de Estado / Errores
        self.lbl_status = ctk.CTkLabel(
            self.card,
            text="",
            font=ctk.CTkFont(size=11, weight="bold"),
            text_color=Theme.DANGER_TEXT
        )
        self.lbl_status.pack(padx=25, pady=(2, 4), anchor="w")

        # 4. Botones de Acción
        action_frame = ctk.CTkFrame(self.card, fg_color="transparent")
        action_frame.pack(fill="x", padx=25, pady=(8, 18))

        btn_cancel = ctk.CTkButton(
            action_frame,
            text="Volver al Login",
            font=ctk.CTkFont(size=12, weight="bold"),
            fg_color=Theme.SECONDARY,
            hover_color=Theme.SECONDARY_HOVER,
            text_color=Theme.SECONDARY_TEXT,
            height=38,
            command=self._on_cancel
        )
        btn_cancel.pack(side="left", padx=(0, 8), fill="x", expand=True)

        self.btn_submit = ctk.CTkButton(
            action_frame,
            text="Crear Cuenta Institucional",
            font=ctk.CTkFont(size=12, weight="bold"),
            fg_color=Theme.PRIMARY,
            hover_color=Theme.PRIMARY_HOVER,
            text_color=Theme.PRIMARY_TEXT,
            height=38,
            command=self._handle_submit
        )
        self.btn_submit.pack(side="right", fill="x", expand=True)

    def _on_role_change(self, choice):
        if choice == "Rector":
            self.frame_rector_hint.pack(fill="x", padx=10, pady=(4, 8))
        else:
            self.frame_rector_hint.pack_forget()

    def _on_question_change(self, choice):
        if choice.startswith("Personalizada"):
            self.entry_custom_q.pack(fill="x", padx=10, pady=(0, 6))
        else:
            self.entry_custom_q.pack_forget()

    def _handle_submit(self):
        full_name = self.entry_fullname.get().strip()
        username = self.entry_username.get().strip()
        email = self.entry_email.get().strip()
        role_raw = self.role_var.get().strip().upper()
        if "SECRETAR" in role_raw:
            role = "SECRETARIA"
        elif "BEDEL" in role_raw:
            role = "BEDEL"
        else:
            role = "RECTOR"
        p1 = self.entry_pass.get()
        p2 = self.entry_confirm.get()
        ans = self.entry_answer.get().strip()

        q_choice = self.var_question.get()
        if q_choice.startswith("Personalizada"):
            question = self.entry_custom_q.get().strip()
        else:
            question = q_choice

        # Validaciones
        if not full_name or not username or not p1 or not ans or not question:
            self.lbl_status.configure(text="Por favor complete todos los campos obligatorios (*).", text_color=Theme.WARNING_TEXT)
            return

        if len(p1) < 6:
            self.lbl_status.configure(text="La contraseña debe tener un mínimo de 6 caracteres.", text_color=Theme.WARNING_TEXT)
            return

        if p1 != p2:
            self.lbl_status.configure(text="Las contraseñas no coinciden. Verifíquelas.", text_color=Theme.DANGER_TEXT)
            return

        self.btn_submit.configure(state="disabled")
        self.lbl_status.configure(text="Cifrando y registrando credenciales en la base de datos...", text_color=Theme.INFO_TEXT)
        self.update_idletasks()

        ok, msg, master_key = AuthService.register_user(
            full_name=full_name,
            username=username,
            password=p1,
            role=role,
            email=email,
            security_question=question,
            security_answer=ans
        )

        self.btn_submit.configure(state="normal")

        if ok:
            if master_key:
                # Mostrar ventana de Master Recovery Key para el Rector
                self._show_master_key_dialog(username, master_key)
            else:
                messagebox.showinfo("Registro Exitoso", f"Cuenta de '{username}' creada exitosamente. Redirigiendo al inicio de sesión.")
                self._finish_and_redirect(username)
        else:
            self.lbl_status.configure(text=msg, text_color=Theme.DANGER_TEXT)

    def _show_master_key_dialog(self, username, key):
        """Muestra la Master Recovery Key alfanumérica única en pantalla para guardado físico."""
        key_win = ctk.CTkToplevel(self)
        key_win.title("SIGET - Clave Maestra de Rescate Oficial")
        key_win.geometry("500x320")
        key_win.resizable(False, False)
        key_win.transient(self)
        key_win.grab_set()
        apply_window_icon(key_win)
        key_win.configure(fg_color=Theme.BG_CARD)

        ctk.CTkLabel(
            key_win,
            text="CLAVE MAESTRA DE RESCATE (OFFLINE)",
            font=ctk.CTkFont(family="Segoe UI", size=14, weight="bold"),
            text_color=Theme.GOLD_ACCENT
        ).pack(pady=(20, 4))

        ctk.CTkLabel(
            key_win,
            text=f"Cuenta de Rector '{username}' creada correctamente.\nGuarde esta clave en un lugar seguro offline como llave definitiva de emergencia:",
            font=ctk.CTkFont(size=11),
            text_color=Theme.TEXT_SECONDARY,
            wraplength=440,
            justify="center"
        ).pack(pady=(0, 15))

        key_box = ctk.CTkFrame(key_win, fg_color=Theme.BG_INPUT, border_width=2, border_color=Theme.GOLD_ACCENT, corner_radius=8)
        key_box.pack(fill="x", padx=35, pady=5)

        lbl_key = ctk.CTkLabel(
            key_box,
            text=key,
            font=ctk.CTkFont(family="Consolas", size=15, weight="bold"),
            text_color=Theme.TEXT_PRIMARY
        )
        lbl_key.pack(pady=10)

        def copy_key():
            self.clipboard_clear()
            self.clipboard_append(key)
            messagebox.showinfo("Copiado", "Clave Maestra de Rescate copiada al portapapeles.")

        btn_copy = ctk.CTkButton(
            key_win,
            text="Copiar al Portapapeles",
            font=ctk.CTkFont(size=11, weight="bold"),
            fg_color=Theme.SECONDARY,
            hover_color=Theme.SECONDARY_HOVER,
            text_color=Theme.SECONDARY_TEXT,
            height=30,
            command=copy_key
        )
        btn_copy.pack(pady=6)

        def proceed():
            key_win.destroy()
            self._finish_and_redirect(username)

        btn_go_login = ctk.CTkButton(
            key_win,
            text="Comprendido • Ir al Inicio de Sesión",
            font=ctk.CTkFont(size=12, weight="bold"),
            fg_color=Theme.PRIMARY,
            hover_color=Theme.PRIMARY_HOVER,
            text_color=Theme.PRIMARY_TEXT,
            height=36,
            command=proceed
        )
        btn_go_login.pack(pady=(8, 15))

    def _finish_and_redirect(self, username):
        if self.on_register_success:
            self.on_register_success(username)
        self.destroy()

    def _on_cancel(self):
        self.destroy()
