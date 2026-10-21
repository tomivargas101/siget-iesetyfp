import customtkinter as ctk
from tkinter import messagebox
from datetime import datetime
from database.connection import get_db_session
from database.schema import Career
from models.student import StudentService
from models.auth import CurrentSession
from views.theme import Theme, apply_window_icon

class StudentModal(ctk.CTkToplevel):
    def __init__(self, parent, student_data=None, on_saved=None):
        super().__init__(parent)
        self.student_data = student_data
        self.on_saved = on_saved

        title_text = "Modificar Alumno" if student_data else "Nuevo Legajo de Alumno"
        self.title(title_text)
        self.geometry("520x580")
        self.resizable(False, False)
        self.transient(parent)
        self.grab_set()

        apply_window_icon(self)
        self.configure(fg_color=Theme.BG_CARD)
        self._load_careers()
        self._build_ui()

    def _load_careers(self):
        session = get_db_session()
        try:
            self.careers = session.query(Career).all()
            self.career_map = {f"{c.code} - {c.name}": c.id for c in self.careers}
            self.career_map["Sin Asignar"] = 0
            self.reverse_career_map = {v: k for k, v in self.career_map.items()}
        finally:
            session.close()

    def _build_ui(self):
        header_text = "Editar Datos del Alumno" if self.student_data else "Registrar Nuevo Alumno"
        ctk.CTkLabel(
            self,
            text=header_text,
            font=ctk.CTkFont(size=18, weight="bold"),
            text_color=Theme.TEXT_PRIMARY
        ).pack(pady=(20, 15))

        form = ctk.CTkFrame(self, fg_color="transparent")
        form.pack(fill="both", expand=True, padx=35)

        # Legajo y DNI
        row1 = ctk.CTkFrame(form, fg_color="transparent")
        row1.pack(fill="x", pady=5)

        f_leg = ctk.CTkFrame(row1, fg_color="transparent")
        f_leg.pack(side="left", fill="x", expand=True, padx=(0, 6))
        ctk.CTkLabel(f_leg, text="N° Legajo:*", font=ctk.CTkFont(size=11, weight="bold"), text_color=Theme.TEXT_SECONDARY).pack(anchor="w")
        self.entry_legajo = ctk.CTkEntry(f_leg, placeholder_text="ALU-2026-003", fg_color=Theme.BG_INPUT, border_color=Theme.BORDER_INPUT, text_color=Theme.TEXT_PRIMARY)
        self.entry_legajo.pack(fill="x", pady=(2, 0))

        f_dni = ctk.CTkFrame(row1, fg_color="transparent")
        f_dni.pack(side="right", fill="x", expand=True, padx=(6, 0))
        ctk.CTkLabel(f_dni, text="DNI:*", font=ctk.CTkFont(size=11, weight="bold"), text_color=Theme.TEXT_SECONDARY).pack(anchor="w")
        self.entry_dni = ctk.CTkEntry(f_dni, placeholder_text="Sin puntos", fg_color=Theme.BG_INPUT, border_color=Theme.BORDER_INPUT, text_color=Theme.TEXT_PRIMARY)
        self.entry_dni.pack(fill="x", pady=(2, 0))

        # CUIL
        f_cuil = ctk.CTkFrame(form, fg_color="transparent")
        f_cuil.pack(fill="x", pady=5)
        ctk.CTkLabel(f_cuil, text="CUIL:", font=ctk.CTkFont(size=11, weight="bold"), text_color=Theme.TEXT_SECONDARY).pack(anchor="w")
        self.entry_cuil = ctk.CTkEntry(f_cuil, placeholder_text="20-...", fg_color=Theme.BG_INPUT, border_color=Theme.BORDER_INPUT, text_color=Theme.TEXT_PRIMARY)
        self.entry_cuil.pack(fill="x", pady=(2, 0))

        # Apellido y Nombre
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

        # Email y Teléfono
        row3 = ctk.CTkFrame(form, fg_color="transparent")
        row3.pack(fill="x", pady=5)

        f_mail = ctk.CTkFrame(row3, fg_color="transparent")
        f_mail.pack(side="left", fill="x", expand=True, padx=(0, 6))
        ctk.CTkLabel(f_mail, text="Email:", font=ctk.CTkFont(size=11, weight="bold"), text_color=Theme.TEXT_SECONDARY).pack(anchor="w")
        self.entry_email = ctk.CTkEntry(f_mail, placeholder_text="alumno@estudiante.edu.ar", fg_color=Theme.BG_INPUT, border_color=Theme.BORDER_INPUT, text_color=Theme.TEXT_PRIMARY)
        self.entry_email.pack(fill="x", pady=(2, 0))

        f_tel = ctk.CTkFrame(row3, fg_color="transparent")
        f_tel.pack(side="right", fill="x", expand=True, padx=(6, 0))
        ctk.CTkLabel(f_tel, text="Teléfono:", font=ctk.CTkFont(size=11, weight="bold"), text_color=Theme.TEXT_SECONDARY).pack(anchor="w")
        self.entry_phone = ctk.CTkEntry(f_tel, placeholder_text="11-...", fg_color=Theme.BG_INPUT, border_color=Theme.BORDER_INPUT, text_color=Theme.TEXT_PRIMARY)
        self.entry_phone.pack(fill="x", pady=(2, 0))

        # Carrera y Año de Ingreso
        row4 = ctk.CTkFrame(form, fg_color="transparent")
        row4.pack(fill="x", pady=5)

        f_car = ctk.CTkFrame(row4, fg_color="transparent")
        f_car.pack(side="left", fill="x", expand=True, padx=(0, 6))
        ctk.CTkLabel(f_car, text="Carrera:", font=ctk.CTkFont(size=11, weight="bold"), text_color=Theme.TEXT_SECONDARY).pack(anchor="w")
        career_names = list(self.career_map.keys())
        default_car = career_names[0] if career_names else "Sin Asignar"
        self.var_career = ctk.StringVar(value=default_car)
        self.combo_career = ctk.CTkComboBox(f_car, values=career_names, variable=self.var_career, fg_color=Theme.BG_INPUT, border_color=Theme.BORDER_INPUT, text_color=Theme.TEXT_PRIMARY, button_color=Theme.SECONDARY)
        self.combo_career.pack(fill="x", pady=(2, 0))

        f_yr = ctk.CTkFrame(row4, fg_color="transparent")
        f_yr.pack(side="right", fill="x", expand=True, padx=(6, 0))
        ctk.CTkLabel(f_yr, text="Año de Ingreso:", font=ctk.CTkFont(size=11, weight="bold"), text_color=Theme.TEXT_SECONDARY).pack(anchor="w")
        self.entry_year = ctk.CTkEntry(f_yr, fg_color=Theme.BG_INPUT, border_color=Theme.BORDER_INPUT, text_color=Theme.TEXT_PRIMARY)
        self.entry_year.insert(0, str(datetime.now().year))
        self.entry_year.pack(fill="x", pady=(2, 0))

        if self.student_data:
            self.entry_legajo.insert(0, self.student_data["legajo"])
            self.entry_dni.insert(0, self.student_data["dni"])
            if self.student_data.get("cuil") and self.student_data["cuil"] != "-":
                self.entry_cuil.insert(0, self.student_data["cuil"])
            self.entry_last_name.insert(0, self.student_data["last_name"])
            self.entry_first_name.insert(0, self.student_data["first_name"])
            if self.student_data.get("email") and self.student_data["email"] != "-":
                self.entry_email.insert(0, self.student_data["email"])
            if self.student_data.get("phone") and self.student_data["phone"] != "-":
                self.entry_phone.insert(0, self.student_data["phone"])
            c_name = self.reverse_career_map.get(self.student_data.get("career_id"), "Sin Asignar")
            self.var_career.set(c_name)
            self.entry_year.delete(0, "end")
            self.entry_year.insert(0, str(self.student_data.get("year_enrolled", 2026)))

        # Botones
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
            text="Guardar Alumno",
            fg_color=Theme.SUCCESS,
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
        yr = self.entry_year.get().strip()

        if not legajo or not dni or not last_name or not first_name:
            messagebox.showwarning("Campos Incompletos", "Por favor complete los campos obligatorios (*).")
            return

        c_id = self.career_map.get(self.var_career.get(), 0)

        payload = {
            "id": self.student_data.get("id") if self.student_data else None,
            "legajo": legajo,
            "dni": dni,
            "cuil": self.entry_cuil.get().strip() or None,
            "last_name": last_name,
            "first_name": first_name,
            "email": self.entry_email.get().strip() or None,
            "phone": self.entry_phone.get().strip() or None,
            "career_id": c_id,
            "year_enrolled": int(yr) if yr.isdigit() else datetime.now().year,
            "is_active": self.student_data.get("is_active", True) if self.student_data else True
        }

        success, msg = StudentService.save(payload)
        if success:
            messagebox.showinfo("Éxito", msg)
            if self.on_saved:
                self.on_saved()
            self.destroy()
        else:
            messagebox.showerror("Error", msg)

class StudentsView(ctk.CTkFrame):
    def __init__(self, parent):
        super().__init__(parent, fg_color="transparent")
        self._load_careers()
        self._build_ui()
        self.refresh()

    def _load_careers(self):
        session = get_db_session()
        try:
            self.careers = session.query(Career).all()
            self.career_filter_map = {"Todas las Carreras": 0}
            for c in self.careers:
                self.career_filter_map[c.name] = c.id
        finally:
            session.close()

    def _build_ui(self):
        toolbar = ctk.CTkFrame(
            self,
            fg_color=Theme.BG_CARD,
            corner_radius=10,
            border_width=1,
            border_color=Theme.BORDER_CARD
        )
        toolbar.pack(fill="x", pady=(0, 15), padx=5)

        # Buscador
        ctk.CTkLabel(toolbar, text="Buscar:", font=ctk.CTkFont(size=12, weight="bold"), text_color=Theme.TEXT_SECONDARY).pack(side="left", padx=(15, 5), pady=12)
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

        # Filtro Carrera
        ctk.CTkLabel(toolbar, text="Carrera:", font=ctk.CTkFont(size=12, weight="bold"), text_color=Theme.TEXT_SECONDARY).pack(side="left", padx=(20, 5))
        self.var_filter_career = ctk.StringVar(value="Todas las Carreras")
        self.combo_career = ctk.CTkComboBox(
            toolbar,
            values=list(self.career_filter_map.keys()),
            variable=self.var_filter_career,
            command=lambda v: self.refresh(),
            width=250,
            height=36,
            fg_color=Theme.BG_INPUT,
            border_color=Theme.BORDER_INPUT,
            text_color=Theme.TEXT_PRIMARY,
            button_color=Theme.SECONDARY
        )
        self.combo_career.pack(side="left", padx=5)

        # Botón Nuevo Alumno
        self.btn_new = ctk.CTkButton(
            toolbar,
            text="Nuevo Alumno",
            font=ctk.CTkFont(size=12, weight="bold"),
            fg_color=Theme.PRIMARY,
            hover_color=Theme.PRIMARY_HOVER,
            text_color=Theme.PRIMARY_TEXT,
            height=36,
            command=self._open_new_modal
        )
        self.btn_new.pack(side="right", padx=15, pady=12)

        # Contenedor Tabla
        self.table_container = ctk.CTkScrollableFrame(self, fg_color="transparent")
        self.table_container.pack(fill="both", expand=True, padx=5)

    def refresh(self):
        for widget in self.table_container.winfo_children():
            widget.destroy()

        search = self.entry_search.get()
        c_id = self.career_filter_map.get(self.var_filter_career.get(), 0)
        students = StudentService.get_all(search_term=search, career_id=c_id)

        header_row = ctk.CTkFrame(
            self.table_container,
            fg_color=Theme.BG_CARD_ALT,
            height=38,
            corner_radius=6,
            border_width=1,
            border_color=Theme.BORDER_CARD
        )
        header_row.pack(fill="x", pady=(0, 6))

        cols = [
            ("LEGAJO", 130),
            ("ALUMNO (APELLIDO Y NOMBRES)", 250),
            ("DNI", 110),
            ("CARRERA", 280),
            ("AÑO INGRESO", 110),
            ("ESTADO", 90),
            ("ACCIONES", 110)
        ]

        for text, width in cols:
            lbl = ctk.CTkLabel(
                header_row,
                text=text,
                font=ctk.CTkFont(size=11, weight="bold"),
                text_color=Theme.TEXT_SECONDARY,
                width=width,
                anchor="w"
            )
            lbl.pack(side="left", padx=8, pady=8)

        if not students:
            empty_lbl = ctk.CTkLabel(
                self.table_container,
                text="No se encontraron alumnos registrados.",
                font=ctk.CTkFont(size=13),
                text_color=Theme.TEXT_MUTED
            )
            empty_lbl.pack(pady=40)
            return

        for s in students:
            row = ctk.CTkFrame(
                self.table_container,
                fg_color=Theme.BG_CARD,
                corner_radius=6,
                border_width=1,
                border_color=Theme.BORDER_SUB
            )
            row.pack(fill="x", pady=3)

            ctk.CTkLabel(row, text=s["legajo"], font=ctk.CTkFont(size=12, weight="bold"), text_color=Theme.INFO_TEXT, width=130, anchor="w").pack(side="left", padx=8, pady=10)
            ctk.CTkLabel(row, text=s["full_name"], font=ctk.CTkFont(size=12), text_color=Theme.TEXT_PRIMARY, width=250, anchor="w").pack(side="left", padx=8)
            ctk.CTkLabel(row, text=s["dni"], font=ctk.CTkFont(size=12), text_color=Theme.TEXT_SECONDARY, width=110, anchor="w").pack(side="left", padx=8)
            ctk.CTkLabel(row, text=s["career_name"], font=ctk.CTkFont(size=12), text_color=Theme.TEXT_SECONDARY, width=280, anchor="w").pack(side="left", padx=8)
            ctk.CTkLabel(row, text=str(s["year_enrolled"]), font=ctk.CTkFont(size=12), text_color=Theme.TEXT_MUTED, width=110, anchor="w").pack(side="left", padx=8)

            status_txt = "Activo" if s["is_active"] else "Inactivo"
            status_col = Theme.SUCCESS_TEXT if s["is_active"] else Theme.DANGER_TEXT
            ctk.CTkLabel(row, text=status_txt, font=ctk.CTkFont(size=11, weight="bold"), text_color=status_col, width=90, anchor="w").pack(side="left", padx=8)

            actions_box = ctk.CTkFrame(row, fg_color="transparent", width=140)
            actions_box.pack(side="left", padx=8)

            btn_edit = ctk.CTkButton(
                actions_box,
                text="Editar",
                font=ctk.CTkFont(size=11, weight="bold"),
                width=55,
                height=28,
                fg_color=Theme.SECONDARY,
                hover_color=Theme.PRIMARY,
                text_color=Theme.SECONDARY_TEXT,
                command=lambda d=s: self._open_edit_modal(d)
            )
            btn_edit.pack(side="left", padx=3)

            toggle_text = "Baja" if s["is_active"] else "Alta"
            btn_toggle = ctk.CTkButton(
                actions_box,
                text=toggle_text,
                font=ctk.CTkFont(size=11, weight="bold"),
                width=50,
                height=28,
                fg_color=Theme.SECONDARY,
                hover_color=Theme.DANGER_HOVER if s["is_active"] else Theme.SUCCESS_HOVER,
                text_color=Theme.DANGER_TEXT if s["is_active"] else Theme.SUCCESS_TEXT,
                command=lambda sid=s["id"]: self._toggle_status(sid)
            )
            btn_toggle.pack(side="left", padx=3)

    def _open_new_modal(self):
        StudentModal(self, on_saved=self.refresh)

    def _open_edit_modal(self, data):
        StudentModal(self, student_data=data, on_saved=self.refresh)

    def _toggle_status(self, student_id):
        success, msg = StudentService.toggle_active(student_id)
        if success:
            self.refresh()
        else:
            messagebox.showerror("Error", msg)
