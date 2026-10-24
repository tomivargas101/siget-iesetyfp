import customtkinter as ctk
from tkinter import messagebox
from models.teacher import TeacherService, REVISTAS
from models.auth import CurrentSession
from views.theme import Theme, apply_window_icon
from views.excel_table import ExcelTableFrame
from views.attendance_view import AttendanceView

class TeacherModal(ctk.CTkToplevel):
    def __init__(self, parent, teacher_data=None, on_saved=None):
        super().__init__(parent)
        self.teacher_data = teacher_data
        self.on_saved = on_saved

        title_text = "Modificar Docente" if teacher_data else "Nuevo Legajo Docente"
        self.title(title_text)
        self.geometry("540x620")
        self.resizable(False, False)
        self.transient(parent)
        self.grab_set()

        apply_window_icon(self)
        self.configure(fg_color=Theme.BG_CARD)
        self._build_ui()

    def _build_ui(self):
        header_text = "Editar Datos del Docente" if self.teacher_data else "Registrar Nuevo Docente en Planta"
        ctk.CTkLabel(
            self,
            text=header_text,
            font=ctk.CTkFont(size=18, weight="bold"),
            text_color=Theme.TEXT_PRIMARY
        ).pack(pady=(20, 15))

        form = ctk.CTkFrame(self, fg_color="transparent")
        form.pack(fill="both", expand=True, padx=35)

        # Campos: Legajo y DNI
        row1 = ctk.CTkFrame(form, fg_color="transparent")
        row1.pack(fill="x", pady=5)
        
        f_leg = ctk.CTkFrame(row1, fg_color="transparent")
        f_leg.pack(side="left", fill="x", expand=True, padx=(0, 6))
        ctk.CTkLabel(f_leg, text="N° Legajo:*", font=ctk.CTkFont(size=11, weight="bold"), text_color=Theme.TEXT_SECONDARY).pack(anchor="w")
        self.entry_legajo = ctk.CTkEntry(f_leg, placeholder_text="DOC-00105", fg_color=Theme.BG_INPUT, border_color=Theme.BORDER_INPUT, text_color=Theme.TEXT_PRIMARY)
        self.entry_legajo.pack(fill="x", pady=(2, 0))

        f_dni = ctk.CTkFrame(row1, fg_color="transparent")
        f_dni.pack(side="right", fill="x", expand=True, padx=(6, 0))
        ctk.CTkLabel(f_dni, text="DNI:*", font=ctk.CTkFont(size=11, weight="bold"), text_color=Theme.TEXT_SECONDARY).pack(anchor="w")
        self.entry_dni = ctk.CTkEntry(f_dni, placeholder_text="Sin puntos", fg_color=Theme.BG_INPUT, border_color=Theme.BORDER_INPUT, text_color=Theme.TEXT_PRIMARY)
        self.entry_dni.pack(fill="x", pady=(2, 0))

        # Campo: CUIL
        f_cuil = ctk.CTkFrame(form, fg_color="transparent")
        f_cuil.pack(fill="x", pady=5)
        ctk.CTkLabel(f_cuil, text="CUIL:", font=ctk.CTkFont(size=11, weight="bold"), text_color=Theme.TEXT_SECONDARY).pack(anchor="w")
        self.entry_cuil = ctk.CTkEntry(f_cuil, placeholder_text="20-12345678-9", fg_color=Theme.BG_INPUT, border_color=Theme.BORDER_INPUT, text_color=Theme.TEXT_PRIMARY)
        self.entry_cuil.pack(fill="x", pady=(2, 0))

        # Campos: Apellido y Nombre
        row2 = ctk.CTkFrame(form, fg_color="transparent")
        row2.pack(fill="x", pady=5)

        f_ape = ctk.CTkFrame(row2, fg_color="transparent")
        f_ape.pack(side="left", fill="x", expand=True, padx=(0, 6))
        ctk.CTkLabel(f_ape, text="Apellido(s):*", font=ctk.CTkFont(size=11, weight="bold"), text_color=Theme.TEXT_SECONDARY).pack(anchor="w")
        self.entry_last_name = ctk.CTkEntry(f_ape, fg_color=Theme.BG_INPUT, border_color=Theme.BORDER_INPUT, text_color=Theme.TEXT_PRIMARY)
        self.entry_last_name.pack(fill="x", pady=(2, 0))

        f_nom = ctk.CTkFrame(row2, fg_color="transparent")
        f_nom.pack(side="right", fill="x", expand=True, padx=(6, 0))
        ctk.CTkLabel(f_nom, text="Nombre(s):*", font=ctk.CTkFont(size=11, weight="bold"), text_color=Theme.TEXT_SECONDARY).pack(anchor="w")
        self.entry_first_name = ctk.CTkEntry(f_nom, fg_color=Theme.BG_INPUT, border_color=Theme.BORDER_INPUT, text_color=Theme.TEXT_PRIMARY)
        self.entry_first_name.pack(fill="x", pady=(2, 0))

        # Campos: Email y Teléfono
        row3 = ctk.CTkFrame(form, fg_color="transparent")
        row3.pack(fill="x", pady=5)

        f_mail = ctk.CTkFrame(row3, fg_color="transparent")
        f_mail.pack(side="left", fill="x", expand=True, padx=(0, 6))
        ctk.CTkLabel(f_mail, text="Correo Electrónico:", font=ctk.CTkFont(size=11, weight="bold"), text_color=Theme.TEXT_SECONDARY).pack(anchor="w")
        self.entry_email = ctk.CTkEntry(f_mail, placeholder_text="docente@siget.edu.ar", fg_color=Theme.BG_INPUT, border_color=Theme.BORDER_INPUT, text_color=Theme.TEXT_PRIMARY)
        self.entry_email.pack(fill="x", pady=(2, 0))

        f_tel = ctk.CTkFrame(row3, fg_color="transparent")
        f_tel.pack(side="right", fill="x", expand=True, padx=(6, 0))
        ctk.CTkLabel(f_tel, text="Teléfono:", font=ctk.CTkFont(size=11, weight="bold"), text_color=Theme.TEXT_SECONDARY).pack(anchor="w")
        self.entry_phone = ctk.CTkEntry(f_tel, fg_color=Theme.BG_INPUT, border_color=Theme.BORDER_INPUT, text_color=Theme.TEXT_PRIMARY)
        self.entry_phone.pack(fill="x", pady=(2, 0))

        # Situación de Revista y Tope de Horas
        row4 = ctk.CTkFrame(form, fg_color="transparent")
        row4.pack(fill="x", pady=5)

        f_rev = ctk.CTkFrame(row4, fg_color="transparent")
        f_rev.pack(side="left", fill="x", expand=True, padx=(0, 6))
        ctk.CTkLabel(f_rev, text="Situación de Revista:*", font=ctk.CTkFont(size=11, weight="bold"), text_color=Theme.TEXT_SECONDARY).pack(anchor="w")
        self.var_revista = ctk.StringVar(value="Titular")
        self.combo_revista = ctk.CTkComboBox(f_rev, values=REVISTAS, variable=self.var_revista, fg_color=Theme.BG_INPUT, border_color=Theme.BORDER_INPUT, text_color=Theme.TEXT_PRIMARY, button_color=Theme.SECONDARY)
        self.combo_revista.pack(fill="x", pady=(2, 0))

        f_max = ctk.CTkFrame(row4, fg_color="transparent")
        f_max.pack(side="right", fill="x", expand=True, padx=(6, 0))
        ctk.CTkLabel(f_max, text="Tope Horas Cátedra Semanal:*", font=ctk.CTkFont(size=11, weight="bold"), text_color=Theme.TEXT_SECONDARY).pack(anchor="w")
        self.entry_max_hours = ctk.CTkEntry(f_max, fg_color=Theme.BG_INPUT, border_color=Theme.BORDER_INPUT, text_color=Theme.TEXT_PRIMARY)
        self.entry_max_hours.insert(0, "30")
        self.entry_max_hours.pack(fill="x", pady=(2, 0))

        # Rellenar datos si es edición
        if self.teacher_data:
            self.entry_legajo.insert(0, self.teacher_data["legajo"])
            self.entry_dni.insert(0, self.teacher_data["dni"])
            if self.teacher_data.get("cuil") and self.teacher_data["cuil"] != "-":
                self.entry_cuil.insert(0, self.teacher_data["cuil"])
            self.entry_last_name.insert(0, self.teacher_data["last_name"])
            self.entry_first_name.insert(0, self.teacher_data["first_name"])
            if self.teacher_data.get("email") and self.teacher_data["email"] != "-":
                self.entry_email.insert(0, self.teacher_data["email"])
            if self.teacher_data.get("phone") and self.teacher_data["phone"] != "-":
                self.entry_phone.insert(0, self.teacher_data["phone"])
            self.var_revista.set(self.teacher_data.get("revista", "Titular"))
            self.entry_max_hours.delete(0, "end")
            self.entry_max_hours.insert(0, str(self.teacher_data.get("max_hours", 30)))

        # Botones de Acción
        btn_box = ctk.CTkFrame(self, fg_color="transparent")
        btn_box.pack(fill="x", padx=35, pady=(20, 25))

        ctk.CTkButton(
            btn_box,
            text="Cancelar",
            fg_color=Theme.SECONDARY,
            hover_color=Theme.SECONDARY_HOVER,
            text_color=Theme.SECONDARY_TEXT,
            width=100,
            command=self.destroy
        ).pack(side="left")

        ctk.CTkButton(
            btn_box,
            text="Guardar Docente",
            fg_color=Theme.PRIMARY,
            hover_color=Theme.PRIMARY_HOVER,
            text_color="#FFFFFF",
            width=150,
            command=self._save
        ).pack(side="right")

    def _save(self):
        legajo = self.entry_legajo.get().strip()
        dni = self.entry_dni.get().strip()
        last_name = self.entry_last_name.get().strip()
        first_name = self.entry_first_name.get().strip()
        max_h = self.entry_max_hours.get().strip()

        if not legajo or not dni or not last_name or not first_name:
            messagebox.showwarning("Campos Incompletos", "Por favor complete los campos obligatorios (*).")
            return

        if not max_h.isdigit() or int(max_h) <= 0:
            messagebox.showwarning("Valor Inválido", "El tope de horas cátedra debe ser un número entero mayor a 0.")
            return

        payload = {
            "id": self.teacher_data.get("id") if self.teacher_data else None,
            "legajo": legajo,
            "dni": dni,
            "cuil": self.entry_cuil.get().strip() or None,
            "last_name": last_name,
            "first_name": first_name,
            "email": self.entry_email.get().strip() or None,
            "phone": self.entry_phone.get().strip() or None,
            "revista": self.var_revista.get(),
            "max_weekly_hours": int(max_h),
            "is_active": self.teacher_data.get("is_active", True) if self.teacher_data else True
        }

        success, msg = TeacherService.save(payload)
        if success:
            messagebox.showinfo("Éxito", msg)
            if self.on_saved:
                self.on_saved()
            self.destroy()
        else:
            messagebox.showerror("Error", msg)

class TeachersView(ctk.CTkFrame):
    def __init__(self, parent, default_tab=None):
        super().__init__(parent, fg_color="transparent")
        self.default_tab = default_tab
        self._build_ui()
        self.refresh()

    def _build_ui(self):
        # Tabs de Navegación del Módulo Unificado de Docentes
        self.tabview = ctk.CTkTabview(
            self,
            fg_color="transparent",
            segmented_button_fg_color=Theme.BG_CARD_ALT,
            segmented_button_selected_color=Theme.PRIMARY,
            segmented_button_selected_hover_color=Theme.PRIMARY_HOVER,
            text_color=Theme.TEXT_PRIMARY,
            command=self._on_tab_change
        )
        self.tabview.pack(fill="both", expand=True, padx=5, pady=0)

        self.tab_teachers = self.tabview.add("Planta Funcional y Legajos")
        self.tab_attendance = self.tabview.add("Control Diario de Asistencias")

        # ---------------------------------------------------------
        # TAB 1: PLANTA FUNCIONAL Y LEGAJOS DOCENTES
        # ---------------------------------------------------------
        self._build_teachers_tab()

        # ---------------------------------------------------------
        # TAB 2: CONTROL DIARIO DE ASISTENCIAS
        # ---------------------------------------------------------
        self._build_attendance_tab()

        # Selección de solapa inicial si se solicitó expresamente
        if self.default_tab == "attendance":
            self.tabview.set("Control Diario de Asistencias")

    def _build_teachers_tab(self):
        # Barra de herramientas superior
        toolbar = ctk.CTkFrame(
            self.tab_teachers,
            fg_color=Theme.BG_CARD,
            corner_radius=10,
            border_width=1,
            border_color=Theme.BORDER_CARD
        )
        toolbar.pack(fill="x", pady=(0, 15))

        # Buscador
        ctk.CTkLabel(
            toolbar,
            text="Buscar:",
            font=ctk.CTkFont(size=12, weight="bold"),
            text_color=Theme.TEXT_SECONDARY
        ).pack(side="left", padx=(15, 5), pady=12)

        self.entry_search = ctk.CTkEntry(
            toolbar,
            placeholder_text="Buscar por Apellido, Nombre, DNI o Legajo...",
            width=280,
            height=36,
            fg_color=Theme.BG_INPUT,
            border_color=Theme.BORDER_INPUT,
            text_color=Theme.TEXT_PRIMARY
        )
        self.entry_search.pack(side="left", padx=5, pady=12)
        self.entry_search.bind("<KeyRelease>", lambda e: self.refresh())

        # Filtro Revista
        ctk.CTkLabel(
            toolbar,
            text="Revista:",
            font=ctk.CTkFont(size=12, weight="bold"),
            text_color=Theme.TEXT_SECONDARY
        ).pack(side="left", padx=(20, 5))

        self.var_filter_revista = ctk.StringVar(value="Todos")
        self.combo_filter = ctk.CTkComboBox(
            toolbar,
            values=["Todos"] + REVISTAS,
            variable=self.var_filter_revista,
            command=lambda v: self.refresh(),
            width=130,
            height=36,
            fg_color=Theme.BG_INPUT,
            border_color=Theme.BORDER_INPUT,
            text_color=Theme.TEXT_PRIMARY,
            button_color=Theme.SECONDARY
        )
        self.combo_filter.pack(side="left", padx=5)

        # Botón Nuevo Docente
        self.btn_new = ctk.CTkButton(
            toolbar,
            text="Nuevo Docente",
            font=ctk.CTkFont(size=12, weight="bold"),
            fg_color=Theme.PRIMARY,
            hover_color=Theme.PRIMARY_HOVER,
            text_color=Theme.PRIMARY_TEXT,
            height=36,
            command=self._open_new_modal
        )
        self.btn_new.pack(side="right", padx=15, pady=12)

        # Tabla estilo Excel con scroll bidireccional
        self.teachers_table = ExcelTableFrame(self.tab_teachers, min_width=1080)
        self.teachers_table.pack(fill="both", expand=True, pady=5)

    def _build_attendance_tab(self):
        self.attendance_view = AttendanceView(self.tab_attendance)
        self.attendance_view.pack(fill="both", expand=True)

    def _on_tab_change(self):
        tab = self.tabview.get()
        if tab == "Control Diario de Asistencias" and hasattr(self, "attendance_view"):
            self.attendance_view.refresh()
        elif tab == "Planta Funcional y Legajos":
            self.refresh()

    def refresh(self):
        self.teachers_table.clear_all()

        search = self.entry_search.get()
        rev = self.var_filter_revista.get()
        teachers = TeacherService.get_all(search_term=search, revista_filter=rev)

        cols = [
            ("Legajo", 1, 95, "center"),
            ("Docente (Apellido y Nombres)", 3, 240, "w"),
            ("DNI", 1, 105, "center"),
            ("Situación Revista", 2, 140, "center"),
            ("Carga Horaria (Activa / Tope)", 2, 190, "w"),
            ("Estado", 1, 90, "center"),
            ("Acciones", 2, 130, "center")
        ]
        self.teachers_table.set_columns(cols)
        self.teachers_table.render_header()

        if not teachers:
            self.teachers_table.show_empty_message("No se encontraron docentes registrados con los filtros aplicados.")
            return

        for idx, t in enumerate(teachers):
            row = self.teachers_table.create_row(idx)

            # Legajo
            l_box = self.teachers_table.add_cell(row, 0)
            ctk.CTkLabel(
                l_box,
                text=t["legajo"],
                font=ctk.CTkFont(size=12, weight="bold"),
                text_color=Theme.INFO_TEXT,
                anchor="center"
            ).pack(fill="x", anchor="center")

            # Docente
            d_box = self.teachers_table.add_cell(row, 1)
            ctk.CTkLabel(
                d_box,
                text=t["full_name"],
                font=ctk.CTkFont(size=12, weight="bold"),
                text_color=Theme.TEXT_PRIMARY,
                anchor="w"
            ).pack(fill="x", anchor="w")
            ctk.CTkLabel(
                d_box,
                text=f"{t['email'] or 'Sin correo'} • {t['phone'] or 'Sin teléfono'}",
                font=ctk.CTkFont(size=10),
                text_color=Theme.TEXT_MUTED,
                anchor="w"
            ).pack(fill="x", anchor="w")

            # DNI
            dni_box = self.teachers_table.add_cell(row, 2)
            ctk.CTkLabel(
                dni_box,
                text=t["dni"],
                font=ctk.CTkFont(size=12),
                text_color=Theme.TEXT_SECONDARY,
                anchor="center"
            ).pack(fill="x", anchor="center")

            # Revista Badge
            rev_box = self.teachers_table.add_cell(row, 3)
            rev_colors = {
                "Titular": ("#DCFCE7", "#065F46"),
                "Provisional": ("#DBEAFE", "#1E40AF"),
                "Interino": ("#FEF3C7", "#92400E"),
                "Suplente": ("#FEE2E2", "#991B1B")
            }
            bg_col, txt_col = rev_colors.get(t["revista"], ("#F1F5F9", "#334155"))
            rev_badge = ctk.CTkFrame(
                rev_box,
                fg_color=bg_col,
                corner_radius=4,
                border_width=1,
                border_color=txt_col
            )
            rev_badge.pack(anchor="center", pady=2)
            ctk.CTkLabel(
                rev_badge,
                text=f" {t['revista']} ",
                font=ctk.CTkFont(size=10, weight="bold"),
                text_color=txt_col
            ).pack(padx=8, pady=2)

            # Carga Horaria (Activa / Tope)
            h_box = self.teachers_table.add_cell(row, 4)
            act_h = t["active_hours"]
            max_h = t["max_hours"]
            h_color = Theme.DANGER_TEXT if act_h >= max_h else (Theme.WARNING_TEXT if act_h >= 24 else Theme.SUCCESS_TEXT)

            ctk.CTkLabel(
                h_box,
                text=f"{act_h} / {max_h} hs semanales",
                font=ctk.CTkFont(size=12, weight="bold"),
                text_color=h_color,
                anchor="w"
            ).pack(fill="x", anchor="w")

            # Estado
            st_box = self.teachers_table.add_cell(row, 5)
            status_txt = "Activo" if t["is_active"] else "Inactivo"
            status_bg = Theme.SUCCESS_BG if t["is_active"] else Theme.DANGER_BG
            status_col = Theme.SUCCESS_TEXT if t["is_active"] else Theme.DANGER_TEXT
            st_badge = ctk.CTkFrame(
                st_box,
                fg_color=status_bg,
                corner_radius=4,
                border_width=1,
                border_color=status_col
            )
            st_badge.pack(anchor="center", pady=2)
            ctk.CTkLabel(
                st_badge,
                text=f" {status_txt} ",
                font=ctk.CTkFont(size=10, weight="bold"),
                text_color=status_col
            ).pack(padx=6, pady=2)

            # Acciones
            actions_box = self.teachers_table.add_cell(row, 6)
            btn_edit = ctk.CTkButton(
                actions_box,
                text="Editar",
                font=ctk.CTkFont(size=11, weight="bold"),
                width=55,
                height=28,
                fg_color=Theme.SECONDARY,
                hover_color=Theme.PRIMARY,
                text_color=Theme.SECONDARY_TEXT,
                command=lambda d=t: self._open_edit_modal(d)
            )
            btn_edit.pack(side="left", padx=3)

            toggle_text = "Baja" if t["is_active"] else "Alta"
            btn_toggle = ctk.CTkButton(
                actions_box,
                text=toggle_text,
                font=ctk.CTkFont(size=11, weight="bold"),
                width=50,
                height=28,
                fg_color=Theme.SECONDARY,
                hover_color=Theme.DANGER_HOVER if t["is_active"] else Theme.SUCCESS_HOVER,
                text_color=Theme.DANGER_TEXT if t["is_active"] else Theme.SUCCESS_TEXT,
                command=lambda tid=t["id"]: self._toggle_status(tid)
            )
            btn_toggle.pack(side="left", padx=3)

    def _open_new_modal(self):
        TeacherModal(self, on_saved=self._on_teacher_saved)

    def _open_edit_modal(self, teacher_data):
        TeacherModal(self, teacher_data=teacher_data, on_saved=self._on_teacher_saved)

    def _on_teacher_saved(self):
        self.refresh()
        if hasattr(self, "attendance_view"):
            try:
                self.attendance_view.refresh()
            except Exception:
                pass

    def _toggle_status(self, teacher_id):
        success, msg = TeacherService.toggle_active(teacher_id)
        if success:
            self._on_teacher_saved()
        else:
            messagebox.showerror("Error", msg)
