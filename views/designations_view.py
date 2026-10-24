import customtkinter as ctk
from tkinter import messagebox
from datetime import datetime, date
from database.connection import get_db_session
from database.schema import Subject, Teacher, Career, Designation
from models.designation import DesignationService, DAYS_OF_WEEK
from models.validation import BusinessValidationService
from views.theme import Theme, apply_window_icon
from views.excel_table import ExcelTableFrame

class DesignationModal(ctk.CTkToplevel):
    def __init__(self, parent, designation_data=None, on_saved=None):
        super().__init__(parent)
        self.designation_data = designation_data
        self.on_saved = on_saved

        title_text = "Modificar Designación de Cátedra" if designation_data else "Nueva Designación de Cátedra"
        self.title(title_text)
        self.geometry("560x660")
        self.resizable(False, False)
        self.transient(parent)
        self.grab_set()

        apply_window_icon(self)
        self.configure(fg_color=Theme.BG_CARD)
        self._load_options()
        self._build_ui()

    def _load_options(self):
        session = get_db_session()
        try:
            # Materias con carrera
            subjects = session.query(Subject).join(Career).all()
            self.subject_map = {f"[{s.career.code}] {s.name} ({s.code})": s.id for s in subjects}
            self.reverse_subject_map = {v: k for k, v in self.subject_map.items()}

            # Docentes activos
            teachers = session.query(Teacher).filter(Teacher.is_active == True).order_by(Teacher.last_name).all()
            self.teacher_map = {}
            self.teacher_obj_map = {}
            for t in teachers:
                label = f"{t.full_name} (DNI: {t.dni}) - {t.revista}"
                self.teacher_map[label] = t.id
                self.teacher_obj_map[t.id] = t
            self.reverse_teacher_map = {v: k for k, v in self.teacher_map.items()}
        finally:
            session.close()

    def _build_ui(self):
        header_text = "Editar Asignación Docente" if self.designation_data else "Asignación de Cátedra a Docente"
        ctk.CTkLabel(
            self,
            text=header_text,
            font=ctk.CTkFont(size=18, weight="bold"),
            text_color=Theme.TEXT_PRIMARY
        ).pack(pady=(20, 15))

        form = ctk.CTkFrame(self, fg_color="transparent")
        form.pack(fill="both", expand=True, padx=35)

        # Materia / Cátedra
        f_sub = ctk.CTkFrame(form, fg_color="transparent")
        f_sub.pack(fill="x", pady=6)
        ctk.CTkLabel(f_sub, text="Materia / Espacio Curricular:*", font=ctk.CTkFont(size=11, weight="bold"), text_color=Theme.TEXT_SECONDARY).pack(anchor="w")
        sub_names = list(self.subject_map.keys())
        default_sub = sub_names[0] if sub_names else "Sin Materias"
        self.var_subject = ctk.StringVar(value=default_sub)
        self.combo_subject = ctk.CTkComboBox(
            f_sub,
            values=sub_names,
            variable=self.var_subject,
            height=34,
            fg_color=Theme.BG_INPUT,
            border_color=Theme.BORDER_INPUT,
            text_color=Theme.TEXT_PRIMARY,
            dropdown_fg_color=Theme.BG_CARD,
            dropdown_text_color=Theme.TEXT_PRIMARY
        )
        self.combo_subject.pack(fill="x", pady=(2, 0))

        # Docente
        f_tea = ctk.CTkFrame(form, fg_color="transparent")
        f_tea.pack(fill="x", pady=6)
        ctk.CTkLabel(f_tea, text="Docente Designado:*", font=ctk.CTkFont(size=11, weight="bold"), text_color=Theme.TEXT_SECONDARY).pack(anchor="w")
        tea_names = list(self.teacher_map.keys())
        default_tea = tea_names[0] if tea_names else "Sin Docentes"
        self.var_teacher = ctk.StringVar(value=default_tea)
        self.combo_teacher = ctk.CTkComboBox(
            f_tea,
            values=tea_names,
            variable=self.var_teacher,
            command=self._update_teacher_hours_info,
            height=34,
            fg_color=Theme.BG_INPUT,
            border_color=Theme.BORDER_INPUT,
            text_color=Theme.TEXT_PRIMARY,
            dropdown_fg_color=Theme.BG_CARD,
            dropdown_text_color=Theme.TEXT_PRIMARY
        )
        self.combo_teacher.pack(fill="x", pady=(2, 0))

        # Indicador de horas actuales del docente
        self.lbl_teacher_hours = ctk.CTkLabel(
            form,
            text="Cargando estado horario...",
            font=ctk.CTkFont(size=11, weight="bold"),
            text_color=Theme.INFO_TEXT
        )
        self.lbl_teacher_hours.pack(anchor="w", pady=(0, 6))

        # Día de la semana y Horas Cátedra
        row_time = ctk.CTkFrame(form, fg_color="transparent")
        row_time.pack(fill="x", pady=6)

        f_day = ctk.CTkFrame(row_time, fg_color="transparent")
        f_day.pack(side="left", fill="x", expand=True, padx=(0, 6))
        ctk.CTkLabel(f_day, text="Día de Cursada:*", font=ctk.CTkFont(size=11, weight="bold"), text_color=Theme.TEXT_SECONDARY).pack(anchor="w")
        self.var_day = ctk.StringVar(value="Lunes")
        self.combo_day = ctk.CTkComboBox(
            f_day,
            values=DAYS_OF_WEEK,
            variable=self.var_day,
            height=34,
            fg_color=Theme.BG_INPUT,
            border_color=Theme.BORDER_INPUT,
            text_color=Theme.TEXT_PRIMARY,
            dropdown_fg_color=Theme.BG_CARD,
            dropdown_text_color=Theme.TEXT_PRIMARY
        )
        self.combo_day.pack(fill="x", pady=(2, 0))

        f_hs = ctk.CTkFrame(row_time, fg_color="transparent")
        f_hs.pack(side="right", fill="x", expand=True, padx=(6, 0))
        ctk.CTkLabel(f_hs, text="Horas Cátedra Semanales:*", font=ctk.CTkFont(size=11, weight="bold"), text_color=Theme.TEXT_SECONDARY).pack(anchor="w")
        self.entry_hours = ctk.CTkEntry(
            f_hs,
            height=34,
            fg_color=Theme.BG_INPUT,
            border_color=Theme.BORDER_INPUT,
            text_color=Theme.TEXT_PRIMARY
        )
        self.entry_hours.insert(0, "4")
        self.entry_hours.pack(fill="x", pady=(2, 0))

        # Horario Inicio y Fin
        row_slot = ctk.CTkFrame(form, fg_color="transparent")
        row_slot.pack(fill="x", pady=6)

        f_st = ctk.CTkFrame(row_slot, fg_color="transparent")
        f_st.pack(side="left", fill="x", expand=True, padx=(0, 6))
        ctk.CTkLabel(f_st, text="Hora Inicio (HH:MM):*", font=ctk.CTkFont(size=11, weight="bold"), text_color=Theme.TEXT_SECONDARY).pack(anchor="w")
        self.entry_start = ctk.CTkEntry(
            f_st,
            placeholder_text="18:30",
            height=34,
            fg_color=Theme.BG_INPUT,
            border_color=Theme.BORDER_INPUT,
            text_color=Theme.TEXT_PRIMARY
        )
        self.entry_start.insert(0, "18:30")
        self.entry_start.pack(fill="x", pady=(2, 0))

        f_en = ctk.CTkFrame(row_slot, fg_color="transparent")
        f_en.pack(side="right", fill="x", expand=True, padx=(6, 0))
        ctk.CTkLabel(f_en, text="Hora Fin (HH:MM):*", font=ctk.CTkFont(size=11, weight="bold"), text_color=Theme.TEXT_SECONDARY).pack(anchor="w")
        self.entry_end = ctk.CTkEntry(
            f_en,
            placeholder_text="21:30",
            height=34,
            fg_color=Theme.BG_INPUT,
            border_color=Theme.BORDER_INPUT,
            text_color=Theme.TEXT_PRIMARY
        )
        self.entry_end.insert(0, "21:30")
        self.entry_end.pack(fill="x", pady=(2, 0))

        # Resolución Ministerial / Interna
        f_res = ctk.CTkFrame(form, fg_color="transparent")
        f_res.pack(fill="x", pady=6)
        ctk.CTkLabel(f_res, text="N° de Resolución / Disposición:", font=ctk.CTkFont(size=11, weight="bold"), text_color=Theme.TEXT_SECONDARY).pack(anchor="w")
        self.entry_res = ctk.CTkEntry(
            f_res,
            placeholder_text="RES-DIR-045/2026",
            height=34,
            fg_color=Theme.BG_INPUT,
            border_color=Theme.BORDER_INPUT,
            text_color=Theme.TEXT_PRIMARY
        )
        self.entry_res.pack(fill="x", pady=(2, 0))

        # Observaciones
        f_obs = ctk.CTkFrame(form, fg_color="transparent")
        f_obs.pack(fill="x", pady=6)
        ctk.CTkLabel(f_obs, text="Observaciones:", font=ctk.CTkFont(size=11, weight="bold"), text_color=Theme.TEXT_SECONDARY).pack(anchor="w")
        self.entry_notes = ctk.CTkEntry(
            f_obs,
            placeholder_text="Turno Vespertino, Comisión A",
            height=34,
            fg_color=Theme.BG_INPUT,
            border_color=Theme.BORDER_INPUT,
            text_color=Theme.TEXT_PRIMARY
        )
        self.entry_notes.pack(fill="x", pady=(2, 0))

        # Si es edición, prellenar
        if self.designation_data:
            s_name = self.reverse_subject_map.get(self.designation_data["subject_id"])
            if s_name:
                self.var_subject.set(s_name)
            t_name = self.reverse_teacher_map.get(self.designation_data["teacher_id"])
            if t_name:
                self.var_teacher.set(t_name)
            self.var_day.set(self.designation_data["day_of_week"])
            self.entry_hours.delete(0, "end")
            self.entry_hours.insert(0, str(self.designation_data["hours_count"]))
            self.entry_start.delete(0, "end")
            self.entry_start.insert(0, self.designation_data["start_time"])
            self.entry_end.delete(0, "end")
            self.entry_end.insert(0, self.designation_data["end_time"])
            self.entry_res.delete(0, "end")
            self.entry_res.insert(0, self.designation_data.get("resolution_number", ""))
            self.entry_notes.delete(0, "end")
            self.entry_notes.insert(0, self.designation_data.get("notes", ""))

        self._update_teacher_hours_info(self.var_teacher.get())

        # Botones
        btn_box = ctk.CTkFrame(self, fg_color="transparent")
        btn_box.pack(fill="x", padx=35, pady=(15, 20))

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
            text="Validar y Guardar",
            fg_color=Theme.PRIMARY,
            hover_color=Theme.PRIMARY_HOVER,
            text_color="#FFFFFF",
            width=160,
            command=self._save
        ).pack(side="right")

    def _update_teacher_hours_info(self, teacher_label):
        t_id = self.teacher_map.get(teacher_label)
        if not t_id:
            return
        
        session = get_db_session()
        try:
            ex_id = self.designation_data.get("id") if self.designation_data else None
            curr_h = BusinessValidationService.calculate_teacher_active_hours(t_id, session, exclude_designation_id=ex_id)
            teacher = self.teacher_obj_map.get(t_id)
            max_h = teacher.max_weekly_hours if teacher else 30
            avail = max(0, max_h - curr_h)

            color = Theme.SUCCESS_TEXT if curr_h < 24 else (Theme.WARNING_TEXT if curr_h < max_h else Theme.DANGER_TEXT)
            self.lbl_teacher_hours.configure(
                text=f"Horas activas actuales: {curr_h} hs  •  Disponibles para asignar: {avail} hs (Tope: {max_h} hs)",
                text_color=color
            )
        finally:
            session.close()

    def _save(self):
        s_id = self.subject_map.get(self.var_subject.get())
        t_id = self.teacher_map.get(self.var_teacher.get())
        day = self.var_day.get()
        hs_str = self.entry_hours.get().strip()
        start = self.entry_start.get().strip()
        end = self.entry_end.get().strip()

        if not s_id or not t_id:
            messagebox.showwarning("Incompleto", "Debe seleccionar una materia y un docente.")
            return

        if not hs_str.isdigit() or int(hs_str) <= 0:
            messagebox.showwarning("Inválido", "Las horas cátedra deben ser un número positivo.")
            return

        payload = {
            "id": self.designation_data.get("id") if self.designation_data else None,
            "subject_id": s_id,
            "teacher_id": t_id,
            "day_of_week": day,
            "start_time": start,
            "end_time": end,
            "hours_count": int(hs_str),
            "resolution_number": self.entry_res.get().strip() or None,
            "notes": self.entry_notes.get().strip() or None,
            "is_active": True
        }

        success, msg = DesignationService.save_designation(payload)
        if success:
            messagebox.showinfo("Cátedra Designada", msg)
            if self.on_saved:
                self.on_saved()
            self.destroy()
        else:
            messagebox.showerror("Error en Validación de Negocio", msg)

class SubstitutionModal(ctk.CTkToplevel):
    def __init__(self, parent, designation_info=None, on_saved=None):
        super().__init__(parent)
        self.designation_info = designation_info
        self.on_saved = on_saved

        self.title("Registro Oficial de Suplencia Docente")
        self.geometry("560x650")
        self.resizable(False, False)
        self.transient(parent)
        self.grab_set()

        apply_window_icon(self)
        self.configure(fg_color=Theme.BG_CARD)
        self._load_options()
        self._build_ui()

    def _load_options(self):
        session = get_db_session()
        try:
            # Lista de docentes disponibles para suplencia
            teachers = session.query(Teacher).filter(Teacher.is_active == True).order_by(Teacher.last_name).all()
            self.suplentes_map = {}
            for t in teachers:
                # Excluir titular de la lista de suplentes
                if self.designation_info and t.id == self.designation_info["teacher_id"]:
                    continue
                label = f"{t.full_name} (DNI: {t.dni}) - {t.revista}"
                self.suplentes_map[label] = t.id
        finally:
            session.close()

    def _build_ui(self):
        ctk.CTkLabel(
            self,
            text="Alta de Suplencia / Reemplazo por Licencia",
            font=ctk.CTkFont(size=18, weight="bold"),
            text_color=Theme.TEXT_PRIMARY
        ).pack(pady=(20, 10))

        # Cuadro de Resumen de la Cátedra y Titular
        box_titular = ctk.CTkFrame(
            self,
            fg_color=Theme.BG_CARD_SUB,
            border_width=1,
            border_color=Theme.BORDER_CARD,
            corner_radius=8
        )
        box_titular.pack(fill="x", padx=35, pady=(0, 15))

        d = self.designation_info
        ctk.CTkLabel(
            box_titular,
            text=f"Cátedra: {d['subject_name']} ({d['career_name']})",
            font=ctk.CTkFont(size=12, weight="bold"),
            text_color=Theme.INFO_TEXT
        ).pack(anchor="w", padx=12, pady=(8, 2))

        ctk.CTkLabel(
            box_titular,
            text=f"Docente Titular a Reemplazar: {d['teacher_name']} (DNI: {d['teacher_dni']})",
            font=ctk.CTkFont(size=11),
            text_color=Theme.TEXT_PRIMARY
        ).pack(anchor="w", padx=12, pady=2)

        ctk.CTkLabel(
            box_titular,
            text=f"Horario: {d['day_of_week']} {d['start_time']} a {d['end_time']} ({d['hours_count']} hs cátedra)",
            font=ctk.CTkFont(size=11),
            text_color=Theme.TEXT_MUTED
        ).pack(anchor="w", padx=12, pady=(2, 8))

        form = ctk.CTkFrame(self, fg_color="transparent")
        form.pack(fill="both", expand=True, padx=35)

        # Seleccionar Suplente
        f_sup = ctk.CTkFrame(form, fg_color="transparent")
        f_sup.pack(fill="x", pady=5)
        ctk.CTkLabel(f_sup, text="Docente Suplente Designado:*", font=ctk.CTkFont(size=11, weight="bold"), text_color=Theme.TEXT_SECONDARY).pack(anchor="w")
        sup_names = list(self.suplentes_map.keys())
        default_sup = sup_names[0] if sup_names else "Sin Suplentes Disponibles"
        self.var_suplente = ctk.StringVar(value=default_sup)
        self.combo_suplente = ctk.CTkComboBox(
            f_sup,
            values=sup_names,
            variable=self.var_suplente,
            height=34,
            fg_color=Theme.BG_INPUT,
            border_color=Theme.BORDER_INPUT,
            text_color=Theme.TEXT_PRIMARY,
            dropdown_fg_color=Theme.BG_CARD,
            dropdown_text_color=Theme.TEXT_PRIMARY
        )
        self.combo_suplente.pack(fill="x", pady=(2, 0))

        # Motivo de Licencia
        f_mot = ctk.CTkFrame(form, fg_color="transparent")
        f_mot.pack(fill="x", pady=5)
        ctk.CTkLabel(f_mot, text="Motivo de Licencia del Titular:*", font=ctk.CTkFont(size=11, weight="bold"), text_color=Theme.TEXT_SECONDARY).pack(anchor="w")
        motivos = [
            "Tratamiento Médico / Salud Prolongada (Art. 48)",
            "Licencia por Maternidad / Paternidad",
            "Mayor Jerarquía / Cargo de Gestión",
            "Capacitación / Perfeccionamiento Docente",
            "Razones Particulares sin Goce de Haberes"
        ]
        self.var_motivo = ctk.StringVar(value=motivos[0])
        self.combo_motivo = ctk.CTkComboBox(
            f_mot,
            values=motivos,
            variable=self.var_motivo,
            height=34,
            fg_color=Theme.BG_INPUT,
            border_color=Theme.BORDER_INPUT,
            text_color=Theme.TEXT_PRIMARY,
            dropdown_fg_color=Theme.BG_CARD,
            dropdown_text_color=Theme.TEXT_PRIMARY
        )
        self.combo_motivo.pack(fill="x", pady=(2, 0))

        # Fechas Inicio y Fin
        row_dates = ctk.CTkFrame(form, fg_color="transparent")
        row_dates.pack(fill="x", pady=5)

        f_start = ctk.CTkFrame(row_dates, fg_color="transparent")
        f_start.pack(side="left", fill="x", expand=True, padx=(0, 6))
        ctk.CTkLabel(f_start, text="Fecha de Inicio (YYYY-MM-DD):*", font=ctk.CTkFont(size=11, weight="bold"), text_color=Theme.TEXT_SECONDARY).pack(anchor="w")
        self.entry_start_date = ctk.CTkEntry(
            f_start,
            height=34,
            fg_color=Theme.BG_INPUT,
            border_color=Theme.BORDER_INPUT,
            text_color=Theme.TEXT_PRIMARY
        )
        self.entry_start_date.insert(0, date.today().strftime("%Y-%m-%d"))
        self.entry_start_date.pack(fill="x", pady=(2, 0))

        f_end = ctk.CTkFrame(row_dates, fg_color="transparent")
        f_end.pack(side="right", fill="x", expand=True, padx=(6, 0))
        ctk.CTkLabel(f_end, text="Fecha de Fin (YYYY-MM-DD):*", font=ctk.CTkFont(size=11, weight="bold"), text_color=Theme.TEXT_SECONDARY).pack(anchor="w")
        self.entry_end_date = ctk.CTkEntry(
            f_end,
            height=34,
            fg_color=Theme.BG_INPUT,
            border_color=Theme.BORDER_INPUT,
            text_color=Theme.TEXT_PRIMARY
        )
        self.entry_end_date.insert(0, (date.today().replace(day=28)).strftime("%Y-%m-%d"))
        self.entry_end_date.pack(fill="x", pady=(2, 0))

        # Resolución Ministerial
        f_res = ctk.CTkFrame(form, fg_color="transparent")
        f_res.pack(fill="x", pady=5)
        ctk.CTkLabel(f_res, text="N° Resolución Ministerial de Designación:*", font=ctk.CTkFont(size=11, weight="bold"), text_color=Theme.TEXT_SECONDARY).pack(anchor="w")
        self.entry_res = ctk.CTkEntry(
            f_res,
            placeholder_text="RES-MIN-1045/26",
            height=34,
            fg_color=Theme.BG_INPUT,
            border_color=Theme.BORDER_INPUT,
            text_color=Theme.TEXT_PRIMARY
        )
        self.entry_res.pack(fill="x", pady=(2, 0))

        # Botones
        btn_box = ctk.CTkFrame(self, fg_color="transparent")
        btn_box.pack(fill="x", padx=35, pady=(20, 20))

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
            text="Asignar Suplencia",
            fg_color=Theme.WARNING,
            hover_color=Theme.WARNING_HOVER,
            text_color="#FFFFFF",
            width=160,
            command=self._save
        ).pack(side="right")

    def _save(self):
        sup_id = self.suplentes_map.get(self.var_suplente.get())
        motivo = self.var_motivo.get()
        start = self.entry_start_date.get().strip()
        end = self.entry_end_date.get().strip()
        res = self.entry_res.get().strip()

        if not sup_id:
            messagebox.showwarning("Incompleto", "Debe seleccionar un docente suplente.")
            return

        if not res:
            messagebox.showwarning("Incompleto", "Debe ingresar el número de resolución ministerial.")
            return

        payload = {
            "designation_id": self.designation_info["id"],
            "suplente_teacher_id": sup_id,
            "license_reason": motivo,
            "start_date": start,
            "end_date": end,
            "resolution_number": res
        }

        success, msg = DesignationService.save_substitution(payload)
        if success:
            messagebox.showinfo("Suplencia Asignada", msg)
            if self.on_saved:
                self.on_saved()
            self.destroy()
        else:
            messagebox.showerror("Error en Validación de Suplencia", msg)

class DesignationsView(ctk.CTkFrame):
    def __init__(self, parent):
        super().__init__(parent, fg_color="transparent")
        self._load_careers()
        self._build_ui()
        self.refresh()

    def _load_careers(self):
        session = get_db_session()
        try:
            self.careers = session.query(Career).all()
            self.career_map = {"Todas las Carreras": 0}
            for c in self.careers:
                self.career_map[c.name] = c.id
        finally:
            session.close()

    def _build_ui(self):
        # Tabs de Navegación: Cátedras vs Suplencias
        self.tabview = ctk.CTkTabview(
            self,
            fg_color="transparent",
            segmented_button_fg_color=Theme.BG_CARD_ALT,
            segmented_button_selected_color=Theme.PRIMARY,
            segmented_button_selected_hover_color=Theme.PRIMARY_HOVER,
            text_color=Theme.TEXT_PRIMARY
        )
        self.tabview.pack(fill="both", expand=True, padx=5, pady=0)

        self.tab_desig = self.tabview.add("Planta de Cátedras y Designaciones")
        self.tab_subst = self.tabview.add("Suplencias y Reemplazos Oficiales")

        # Tab 1: Cátedras
        self._build_desig_tab()

        # Tab 2: Suplencias
        self._build_subst_tab()

    def _build_desig_tab(self):
        toolbar = ctk.CTkFrame(
            self.tab_desig,
            fg_color=Theme.BG_CARD,
            corner_radius=10,
            border_width=1,
            border_color=Theme.BORDER_CARD
        )
        toolbar.pack(fill="x", pady=(0, 15))

        ctk.CTkLabel(
            toolbar,
            text="Filtrar Carrera:",
            font=ctk.CTkFont(size=12, weight="bold"),
            text_color=Theme.TEXT_SECONDARY
        ).pack(side="left", padx=(15, 5), pady=12)

        self.var_filter_career = ctk.StringVar(value="Todas las Carreras")
        self.combo_career = ctk.CTkComboBox(
            toolbar,
            values=list(self.career_map.keys()),
            variable=self.var_filter_career,
            command=lambda v: self.refresh(),
            width=260,
            height=36,
            fg_color=Theme.BG_INPUT,
            border_color=Theme.BORDER_INPUT,
            text_color=Theme.TEXT_PRIMARY,
            dropdown_fg_color=Theme.BG_CARD,
            dropdown_text_color=Theme.TEXT_PRIMARY
        )
        self.combo_career.pack(side="left", padx=5)

        self.btn_new_desig = ctk.CTkButton(
            toolbar,
            text="Nueva Designación",
            font=ctk.CTkFont(size=12, weight="bold"),
            fg_color=Theme.PRIMARY,
            hover_color=Theme.PRIMARY_HOVER,
            text_color=Theme.PRIMARY_TEXT,
            height=36,
            command=self._open_new_desig_modal
        )
        self.btn_new_desig.pack(side="right", padx=15, pady=12)

        # Tabla estilo Excel con scroll bidireccional (evita desborde y cortes)
        self.desig_table = ExcelTableFrame(self.tab_desig, min_width=1120)
        self.desig_table.pack(fill="both", expand=True, pady=5)

    def _build_subst_tab(self):
        toolbar = ctk.CTkFrame(
            self.tab_subst,
            fg_color=Theme.BG_CARD,
            corner_radius=10,
            border_width=1,
            border_color=Theme.BORDER_CARD
        )
        toolbar.pack(fill="x", pady=(0, 15))

        info_box = ctk.CTkFrame(toolbar, fg_color="transparent")
        info_box.pack(side="left", padx=15, pady=12)

        ctk.CTkLabel(
            info_box,
            text="Planilla Oficial de Reemplazos y Suplencias por Licencia",
            font=ctk.CTkFont(size=13, weight="bold"),
            text_color=Theme.TEXT_PRIMARY
        ).pack(anchor="w")

        ctk.CTkLabel(
            info_box,
            text="Registro histórico y vigente de vinculaciones titular-suplente con números de resolución y vigencias de ley.",
            font=ctk.CTkFont(size=11),
            text_color=Theme.TEXT_SECONDARY
        ).pack(anchor="w")

        # Tabla estilo Excel con scroll bidireccional que asegura visualización total de columnas
        self.subst_table = ExcelTableFrame(self.tab_subst, min_width=1180)
        self.subst_table.pack(fill="both", expand=True, pady=5)

    def refresh(self):
        self._refresh_designations()
        self._refresh_substitutions()

    def _refresh_designations(self):
        self.desig_table.clear_all()

        c_id = self.career_map.get(self.var_filter_career.get(), 0)
        designations = DesignationService.get_all(career_id=c_id)

        cols = [
            ("Cátedra / Carrera", 3, 260, "w"),
            ("Docente Titular", 2, 200, "w"),
            ("Día y Horario", 2, 160, "w"),
            ("Hs Cát.", 1, 90, "center"),
            ("Estado / Condición", 2, 210, "w"),
            ("Acciones", 2, 170, "center")
        ]
        self.desig_table.set_columns(cols)
        self.desig_table.render_header()

        if not designations:
            self.desig_table.show_empty_message("No hay cátedras designadas en la carrera seleccionada.")
            return

        for idx, d in enumerate(designations):
            row = self.desig_table.create_row(idx)

            # Cátedra
            c_box = self.desig_table.add_cell(row, 0)
            ctk.CTkLabel(
                c_box,
                text=d["subject_name"],
                font=ctk.CTkFont(size=12, weight="bold"),
                text_color=Theme.TEXT_PRIMARY,
                anchor="w"
            ).pack(fill="x", anchor="w")
            ctk.CTkLabel(
                c_box,
                text=f"{d['career_name']} ({d['subject_code']})",
                font=ctk.CTkFont(size=10),
                text_color=Theme.TEXT_MUTED,
                anchor="w"
            ).pack(fill="x", anchor="w")

            # Docente
            t_box = self.desig_table.add_cell(row, 1)
            ctk.CTkLabel(
                t_box,
                text=d["teacher_name"],
                font=ctk.CTkFont(size=12),
                text_color=Theme.INFO_TEXT,
                anchor="w"
            ).pack(fill="x", anchor="w")
            ctk.CTkLabel(
                t_box,
                text=f"DNI: {d['teacher_dni']} • {d['teacher_revista']}",
                font=ctk.CTkFont(size=10),
                text_color=Theme.TEXT_MUTED,
                anchor="w"
            ).pack(fill="x", anchor="w")

            # Día y Horario
            h_box = self.desig_table.add_cell(row, 2)
            ctk.CTkLabel(
                h_box,
                text=d["day_of_week"],
                font=ctk.CTkFont(size=11, weight="bold"),
                text_color=Theme.TEXT_SECONDARY,
                anchor="w"
            ).pack(fill="x", anchor="w")
            ctk.CTkLabel(
                h_box,
                text=f"{d['start_time']} a {d['end_time']}",
                font=ctk.CTkFont(size=10),
                text_color=Theme.TEXT_MUTED,
                anchor="w"
            ).pack(fill="x", anchor="w")

            # Hs Cátedra (Badge centrado tipo Excel)
            hs_box = self.desig_table.add_cell(row, 3)
            hs_badge = ctk.CTkFrame(
                hs_box,
                fg_color=Theme.SUCCESS_BG,
                corner_radius=4,
                border_width=1,
                border_color=Theme.SUCCESS_HOVER
            )
            hs_badge.pack(anchor="center", pady=2)
            ctk.CTkLabel(
                hs_badge,
                text=f" {d['hours_count']} hs ",
                font=ctk.CTkFont(size=11, weight="bold"),
                text_color=Theme.SUCCESS_TEXT
            ).pack(padx=6, pady=2)

            # Condición (Titular o Suplencia)
            cond_box = self.desig_table.add_cell(row, 4)
            if d["active_substitution"]:
                sub = d["active_substitution"]
                cond_badge = ctk.CTkFrame(
                    cond_box,
                    fg_color=Theme.WARNING_BG,
                    corner_radius=4,
                    border_width=1,
                    border_color=Theme.WARNING_HOVER
                )
                cond_badge.pack(anchor="w", pady=(0, 2))
                ctk.CTkLabel(
                    cond_badge,
                    text=f" Suplente: {sub['suplente_name']} ",
                    font=ctk.CTkFont(size=10, weight="bold"),
                    text_color=Theme.WARNING_TEXT
                ).pack(padx=4, pady=2)
                ctk.CTkLabel(
                    cond_box,
                    text=f"Res. {sub['resolution']} (hasta {sub['end_date']})",
                    font=ctk.CTkFont(size=10),
                    text_color=Theme.WARNING_TEXT,
                    anchor="w"
                ).pack(fill="x", anchor="w")
            else:
                tit_badge = ctk.CTkFrame(
                    cond_box,
                    fg_color=Theme.SUCCESS_BG,
                    corner_radius=4,
                    border_width=1,
                    border_color=Theme.SUCCESS_HOVER
                )
                tit_badge.pack(anchor="w", pady=2)
                ctk.CTkLabel(
                    tit_badge,
                    text=" Titular en Ejercicio ",
                    font=ctk.CTkFont(size=10, weight="bold"),
                    text_color=Theme.SUCCESS_TEXT
                ).pack(padx=6, pady=2)

            # Acciones
            actions = self.desig_table.add_cell(row, 5)
            btn_subst = ctk.CTkButton(
                actions,
                text="Suplencia",
                font=ctk.CTkFont(size=11, weight="bold"),
                width=80,
                height=28,
                fg_color=Theme.WARNING,
                hover_color=Theme.WARNING_HOVER,
                text_color="#FFFFFF",
                command=lambda data=d: self._open_subst_modal(data)
            )
            btn_subst.pack(side="left", padx=3)

            btn_edit = ctk.CTkButton(
                actions,
                text="Editar",
                font=ctk.CTkFont(size=11, weight="bold"),
                width=55,
                height=28,
                fg_color=Theme.SECONDARY,
                hover_color=Theme.SECONDARY_HOVER,
                text_color=Theme.SECONDARY_TEXT,
                command=lambda data=d: self._open_edit_desig_modal(data)
            )
            btn_edit.pack(side="left", padx=3)

    def _refresh_substitutions(self):
        self.subst_table.clear_all()

        substitutions = DesignationService.get_all_substitutions()

        cols = [
            ("Cátedra Asociada", 3, 230, "w"),
            ("Docente Titular", 2, 190, "w"),
            ("Docente Suplente", 2, 190, "w"),
            ("Motivo de Licencia", 3, 240, "w"),
            ("Vigencia (Inicio - Fin)", 2, 170, "center"),
            ("N° Resolución", 2, 150, "center")
        ]
        self.subst_table.set_columns(cols)
        self.subst_table.render_header()

        if not substitutions:
            self.subst_table.show_empty_message("No hay registros históricos ni vigentes de suplencias.")
            return

        for idx, s in enumerate(substitutions):
            row = self.subst_table.create_row(idx)

            # Cátedra Asociada
            c_box = self.subst_table.add_cell(row, 0)
            ctk.CTkLabel(
                c_box,
                text=s["subject_name"],
                font=ctk.CTkFont(size=12, weight="bold"),
                text_color=Theme.TEXT_PRIMARY,
                anchor="w"
            ).pack(fill="x", anchor="w")
            ctk.CTkLabel(
                c_box,
                text="Espacio Curricular Oficial",
                font=ctk.CTkFont(size=10),
                text_color=Theme.TEXT_MUTED,
                anchor="w"
            ).pack(fill="x", anchor="w")

            # Docente Titular
            t_box = self.subst_table.add_cell(row, 1)
            ctk.CTkLabel(
                t_box,
                text=s["titular_name"],
                font=ctk.CTkFont(size=12),
                text_color=Theme.TEXT_SECONDARY,
                anchor="w"
            ).pack(fill="x", anchor="w")
            ctk.CTkLabel(
                t_box,
                text="Titular Licenciado",
                font=ctk.CTkFont(size=10),
                text_color=Theme.TEXT_MUTED,
                anchor="w"
            ).pack(fill="x", anchor="w")

            # Docente Suplente
            sup_box = self.subst_table.add_cell(row, 2)
            ctk.CTkLabel(
                sup_box,
                text=s["suplente_name"],
                font=ctk.CTkFont(size=12, weight="bold"),
                text_color=Theme.INFO_TEXT,
                anchor="w"
            ).pack(fill="x", anchor="w")
            ctk.CTkLabel(
                sup_box,
                text="Suplente en Ejercicio",
                font=ctk.CTkFont(size=10),
                text_color=Theme.GOLD_TEXT,
                anchor="w"
            ).pack(fill="x", anchor="w")

            # Motivo de Licencia
            m_box = self.subst_table.add_cell(row, 3)
            ctk.CTkLabel(
                m_box,
                text=s["license_reason"],
                font=ctk.CTkFont(size=11),
                text_color=Theme.TEXT_PRIMARY,
                anchor="w",
                wraplength=240,
                justify="left"
            ).pack(fill="x", anchor="w")

            # Vigencia (Inicio - Fin)
            v_box = self.subst_table.add_cell(row, 4)
            v_badge = ctk.CTkFrame(
                v_box,
                fg_color=Theme.WARNING_BG,
                corner_radius=4,
                border_width=1,
                border_color=Theme.WARNING_HOVER
            )
            v_badge.pack(anchor="center", pady=2)
            ctk.CTkLabel(
                v_badge,
                text=f" {s['start_date']} al {s['end_date']} ",
                font=ctk.CTkFont(size=10, weight="bold"),
                text_color=Theme.WARNING_TEXT
            ).pack(padx=6, pady=3)

            # N° Resolución
            r_box = self.subst_table.add_cell(row, 5)
            r_badge = ctk.CTkFrame(
                r_box,
                fg_color=Theme.EXCEL_BADGE_BG,
                corner_radius=4,
                border_width=1,
                border_color=Theme.BORDER_CARD
            )
            r_badge.pack(anchor="center", pady=2)
            ctk.CTkLabel(
                r_badge,
                text=f" {s['resolution_number']} ",
                font=ctk.CTkFont(size=10, weight="bold"),
                text_color=Theme.EXCEL_BADGE_TEXT
            ).pack(padx=8, pady=3)

    def _open_new_desig_modal(self):
        DesignationModal(self, on_saved=self.refresh)

    def _open_edit_desig_modal(self, data):
        DesignationModal(self, designation_data=data, on_saved=self.refresh)

    def _open_subst_modal(self, desig_info):
        SubstitutionModal(self, designation_info=desig_info, on_saved=self.refresh)
