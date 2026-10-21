import customtkinter as ctk
from datetime import datetime, date
from database.connection import get_db_session
from database.schema import Teacher, Student, Subject, Designation, Substitution, AuditLog, Attendance
from models.auth import CurrentSession
from views.theme import Theme

class DashboardView(ctk.CTkScrollableFrame):
    def __init__(self, parent, on_navigate=None):
        super().__init__(parent, fg_color="transparent")
        self.on_navigate = on_navigate
        self._load_data()
        self._build_ui()

    def _load_data(self):
        """
        Carga los datos asegurando extraer valores simples dentro de la sesión activa
        para evitar DetachedInstanceError al cerrar la sesión de SQLAlchemy.
        """
        session = get_db_session()
        try:
            self.total_teachers = session.query(Teacher).filter(Teacher.is_active == True).count()
            self.titulares = session.query(Teacher).filter(Teacher.is_active == True, Teacher.revista == "Titular").count()
            self.provisionales = session.query(Teacher).filter(Teacher.is_active == True, Teacher.revista == "Provisional").count()
            self.interinos = session.query(Teacher).filter(Teacher.is_active == True, Teacher.revista == "Interino").count()
            self.suplentes = session.query(Teacher).filter(Teacher.is_active == True, Teacher.revista == "Suplente").count()

            self.total_students = session.query(Student).filter(Student.is_active == True).count()
            
            designations = session.query(Designation).filter(Designation.is_active == True).all()
            self.total_designations = len(designations)
            self.total_weekly_hours = sum(d.hours_count for d in designations)

            # Suplencias activas mapeadas a DTOs para evitar detached lazy load
            raw_subs = session.query(Substitution).filter(
                Substitution.is_active == True,
                Substitution.end_date >= date.today()
            ).all()

            self.active_substitutions = []
            for s in raw_subs:
                self.active_substitutions.append({
                    "titular_name": s.titular.full_name if s.titular else "Titular",
                    "suplente_name": s.suplente.full_name if s.suplente else "Suplente",
                    "subject_name": s.designation.subject.name if (s.designation and s.designation.subject) else "Cátedra",
                    "resolution": s.resolution_number,
                    "end_date_str": s.end_date.strftime("%d/%m/%Y") if s.end_date else "-"
                })

            # Auditoría reciente
            raw_audits = session.query(AuditLog).order_by(AuditLog.timestamp.desc()).limit(8).all()
            self.recent_audits = []
            for a in raw_audits:
                self.recent_audits.append({
                    "timestamp_str": a.timestamp.strftime("%d/%m/%Y %H:%M") if a.timestamp else "-",
                    "username": a.username,
                    "action": a.action,
                    "details": a.details or ""
                })

            # Docentes cercanos al tope (ej. >= 24 hs de 30 hs)
            teachers = session.query(Teacher).filter(Teacher.is_active == True).all()
            self.near_cap_teachers = []
            for t in teachers:
                h = sum(d.hours_count for d in t.designations if d.is_active)
                if h >= 24:
                    self.near_cap_teachers.append({
                        "full_name": t.full_name,
                        "revista": t.revista,
                        "dni": t.dni,
                        "legajo": t.legajo,
                        "hours": h,
                        "max_hours": t.max_weekly_hours
                    })

            # Datos Operativos para Bedel: Asistencia de hoy
            today = date.today()
            today_atts = session.query(Attendance).filter(Attendance.date == today).all()
            self.today_presentes = sum(1 for a in today_atts if a.status == "Presente")
            self.today_ausentes = sum(1 for a in today_atts if "Ausente" in a.status)
            self.today_licencias = sum(1 for a in today_atts if a.status == "Licencia")
            self.today_sin_registrar = max(0, self.total_teachers - len(today_atts))

            # Alumnos inscriptos recientemente
            raw_students = session.query(Student).filter(Student.is_active == True).order_by(Student.created_at.desc()).limit(5).all()
            self.recent_students = []
            for st in raw_students:
                self.recent_students.append({
                    "legajo": st.legajo,
                    "full_name": st.full_name,
                    "career_name": st.career.name if st.career else "Sin Carrera",
                    "year_enrolled": st.year_enrolled
                })

        finally:
            session.close()

    def _build_ui(self):
        user = CurrentSession.user
        is_rector = CurrentSession.is_rector()

        # 1. Saludo y Encabezado de Rol
        role_label = "Rector / Directivo (Acceso Total a Planta Funcional y Reportes)" if is_rector else "Bedel / Administrativo (Acceso Operativo a Asistencias e Inscripciones)"

        header_frame = ctk.CTkFrame(
            self,
            fg_color=Theme.BG_CARD,
            corner_radius=12,
            border_width=1,
            border_color=Theme.BORDER_CARD
        )
        header_frame.pack(fill="x", pady=(0, 20), padx=5)

        welcome_box = ctk.CTkFrame(header_frame, fg_color="transparent")
        welcome_box.pack(side="left", padx=25, pady=20)

        ctk.CTkLabel(
            welcome_box,
            text=f"¡Bienvenido/a, {user.full_name if user else 'Usuario'}!",
            font=ctk.CTkFont(size=22, weight="bold"),
            text_color=Theme.TEXT_PRIMARY
        ).pack(anchor="w")

        ctk.CTkLabel(
            welcome_box,
            text=f"Rol: {role_label}  •  Período Lectivo {datetime.now().year}  •  {datetime.now().strftime('%A, %d de %B de %Y')}",
            font=ctk.CTkFont(size=13),
            text_color=Theme.TEXT_SECONDARY
        ).pack(anchor="w", pady=(4, 0))

        # 2. Tarjetas Métricas KPI diferenciadas por rol
        kpi_container = ctk.CTkFrame(self, fg_color="transparent")
        kpi_container.pack(fill="x", pady=(0, 20))
        kpi_container.grid_columnconfigure((0, 1, 2, 3), weight=1, uniform="kpi")

        if is_rector:
            cards_data = [
                ("Planta Docente", str(self.total_teachers), f"Titulares: {self.titulares} | Suplentes: {self.suplentes}", "#8C6F00"),
                ("Alumnos Regulares", str(self.total_students), "Matrícula total activa", "#059669"),
                ("Cátedras Asignadas", str(self.total_designations), f"Horas cátedra: {self.total_weekly_hours} hs/sem", "#7C3AED"),
                ("Suplencias Vigentes", str(len(self.active_substitutions)), "Docentes reemplazados", "#D97706"),
            ]
        else:
            cards_data = [
                ("Asistencia Docente Hoy", f"{self.today_presentes} / {self.total_teachers}", f"Ausentes: {self.today_ausentes} | Licencias: {self.today_licencias}", "#8C6F00"),
                ("Alumnos Registrados", str(self.total_students), "Padrón general de estudiantes", "#059669"),
                ("Cátedras Activas", str(self.total_designations), f"Total carga semanal: {self.total_weekly_hours} hs", "#7C3AED"),
                ("Suplencias en Horario", str(len(self.active_substitutions)), "Reemplazos y licencias vigentes", "#F59E0B"),
            ]

        for idx, (title, value, subtitle, color_accent) in enumerate(cards_data):
            card = ctk.CTkFrame(
                kpi_container,
                fg_color=Theme.BG_CARD,
                corner_radius=12,
                border_width=1,
                border_color=Theme.BORDER_CARD
            )
            card.grid(row=0, column=idx, padx=6, pady=5, sticky="nsew")

            bar = ctk.CTkFrame(card, height=4, fg_color=color_accent, corner_radius=2)
            bar.pack(fill="x", padx=12, pady=(12, 8))

            ctk.CTkLabel(
                card,
                text=title,
                font=ctk.CTkFont(size=13, weight="bold"),
                text_color=Theme.TEXT_SECONDARY
            ).pack(anchor="w", padx=15)

            ctk.CTkLabel(
                card,
                text=value,
                font=ctk.CTkFont(size=28, weight="bold"),
                text_color=Theme.TEXT_PRIMARY
            ).pack(anchor="w", padx=15, pady=(2, 0))

            ctk.CTkLabel(
                card,
                text=subtitle,
                font=ctk.CTkFont(size=11),
                text_color=Theme.TEXT_MUTED
            ).pack(anchor="w", padx=15, pady=(2, 14))

        # 3. Paneles Secundarios adaptados al Rol
        cols_frame = ctk.CTkFrame(self, fg_color="transparent")
        cols_frame.pack(fill="both", expand=True, pady=(0, 20))
        cols_frame.grid_columnconfigure((0, 1), weight=1, uniform="sub")

        if is_rector:
            self._build_rector_panels(cols_frame)
        else:
            self._build_bedel_panels(cols_frame)

        # 4. Sección adicional: Auditoría para Rector o Acciones rápidas para Bedel
        if is_rector:
            self._build_audit_section()
        else:
            self._build_quick_actions_bar()

    def _build_rector_panels(self, parent):
        # Columna Izquierda: Alertas de Tope Horario Normativo
        left_sub = ctk.CTkFrame(
            parent,
            fg_color=Theme.BG_CARD,
            corner_radius=12,
            border_width=1,
            border_color=Theme.BORDER_CARD
        )
        left_sub.grid(row=0, column=0, padx=(0, 8), sticky="nsew")

        ctk.CTkLabel(
            left_sub,
            text="Control Normativo: Docentes Próximos al Tope (30 hs)",
            font=ctk.CTkFont(size=14, weight="bold"),
            text_color=Theme.WARNING_TEXT
        ).pack(anchor="w", padx=20, pady=(15, 10))

        if self.near_cap_teachers:
            for item_data in self.near_cap_teachers[:5]:
                item = ctk.CTkFrame(
                    left_sub,
                    fg_color=Theme.BG_CARD_SUB,
                    corner_radius=8,
                    border_width=1,
                    border_color=Theme.BORDER_SUB
                )
                item.pack(fill="x", padx=15, pady=4)
                
                info = ctk.CTkFrame(item, fg_color="transparent")
                info.pack(side="left", padx=10, pady=8)
                ctk.CTkLabel(
                    info,
                    text=f"{item_data['full_name']} ({item_data['revista']})",
                    font=ctk.CTkFont(size=12, weight="bold"),
                    text_color=Theme.TEXT_PRIMARY
                ).pack(anchor="w")

                ctk.CTkLabel(
                    info,
                    text=f"DNI: {item_data['dni']} • Legajo: {item_data['legajo']}",
                    font=ctk.CTkFont(size=10),
                    text_color=Theme.TEXT_MUTED
                ).pack(anchor="w")

                badge_color = Theme.DANGER_TEXT if item_data['hours'] >= 30 else Theme.WARNING_TEXT
                badge = ctk.CTkLabel(
                    item,
                    text=f"{item_data['hours']} / {item_data['max_hours']} hs",
                    font=ctk.CTkFont(size=12, weight="bold"),
                    text_color=badge_color
                )
                badge.pack(side="right", padx=12)
        else:
            ctk.CTkLabel(
                left_sub,
                text="Todos los docentes se encuentran dentro de los márgenes seguros de carga horaria.",
                font=ctk.CTkFont(size=12),
                text_color=Theme.SUCCESS_TEXT
            ).pack(anchor="w", padx=20, pady=15)

        # Columna Derecha: Suplencias y Licencias Activas
        right_sub = ctk.CTkFrame(
            parent,
            fg_color=Theme.BG_CARD,
            corner_radius=12,
            border_width=1,
            border_color=Theme.BORDER_CARD
        )
        right_sub.grid(row=0, column=1, padx=(8, 0), sticky="nsew")

        ctk.CTkLabel(
            right_sub,
            text="Suplencias en Ejercicio (Vínculo Titular - Suplente)",
            font=ctk.CTkFont(size=14, weight="bold"),
            text_color=Theme.INFO_TEXT
        ).pack(anchor="w", padx=20, pady=(15, 10))

        if self.active_substitutions:
            for s in self.active_substitutions[:5]:
                s_item = ctk.CTkFrame(
                    right_sub,
                    fg_color=Theme.BG_CARD_SUB,
                    corner_radius=8,
                    border_width=1,
                    border_color=Theme.BORDER_SUB
                )
                s_item.pack(fill="x", padx=15, pady=4)

                sub_box = ctk.CTkFrame(s_item, fg_color="transparent")
                sub_box.pack(side="left", padx=10, pady=8)

                ctk.CTkLabel(
                    sub_box,
                    text=f"Suplente: {s['suplente_name']}  |  Titular: {s['titular_name']}",
                    font=ctk.CTkFont(size=11, weight="bold"),
                    text_color=Theme.INFO_TEXT
                ).pack(anchor="w")

                ctk.CTkLabel(
                    sub_box,
                    text=f"Cátedra: {s['subject_name']} • Res: {s['resolution']} • Vence: {s['end_date_str']}",
                    font=ctk.CTkFont(size=10),
                    text_color=Theme.TEXT_MUTED
                ).pack(anchor="w")
        else:
            ctk.CTkLabel(
                right_sub,
                text="No hay suplencias activas registradas en este momento.",
                font=ctk.CTkFont(size=12),
                text_color=Theme.TEXT_MUTED
            ).pack(anchor="w", padx=20, pady=15)

    def _build_bedel_panels(self, parent):
        # Columna Izquierda: Estado de Asistencia Operativa de Hoy
        left_sub = ctk.CTkFrame(
            parent,
            fg_color=Theme.BG_CARD,
            corner_radius=12,
            border_width=1,
            border_color=Theme.BORDER_CARD
        )
        left_sub.grid(row=0, column=0, padx=(0, 8), sticky="nsew")

        ctk.CTkLabel(
            left_sub,
            text="Estado Operativo de Asistencia de Hoy",
            font=ctk.CTkFont(size=14, weight="bold"),
            text_color=Theme.INFO_TEXT
        ).pack(anchor="w", padx=20, pady=(15, 10))

        att_stats_box = ctk.CTkFrame(
            left_sub,
            fg_color=Theme.BG_CARD_SUB,
            corner_radius=8,
            border_width=1,
            border_color=Theme.BORDER_SUB
        )
        att_stats_box.pack(fill="x", padx=15, pady=8)

        # Fila Presentes
        row_p = ctk.CTkFrame(att_stats_box, fg_color="transparent")
        row_p.pack(fill="x", padx=12, pady=6)
        ctk.CTkLabel(row_p, text="Docentes Presentes:", font=ctk.CTkFont(size=12, weight="bold"), text_color=Theme.TEXT_PRIMARY).pack(side="left")
        ctk.CTkLabel(row_p, text=str(self.today_presentes), font=ctk.CTkFont(size=12, weight="bold"), text_color=Theme.SUCCESS_TEXT).pack(side="right")

        # Fila Ausentes
        row_a = ctk.CTkFrame(att_stats_box, fg_color="transparent")
        row_a.pack(fill="x", padx=12, pady=6)
        ctk.CTkLabel(row_a, text="Docentes Ausentes:", font=ctk.CTkFont(size=12, weight="bold"), text_color=Theme.TEXT_PRIMARY).pack(side="left")
        ctk.CTkLabel(row_a, text=str(self.today_ausentes), font=ctk.CTkFont(size=12, weight="bold"), text_color=Theme.DANGER_TEXT).pack(side="right")

        # Fila Licencias
        row_l = ctk.CTkFrame(att_stats_box, fg_color="transparent")
        row_l.pack(fill="x", padx=12, pady=6)
        ctk.CTkLabel(row_l, text="En Licencia / Dispensa:", font=ctk.CTkFont(size=12, weight="bold"), text_color=Theme.TEXT_PRIMARY).pack(side="left")
        ctk.CTkLabel(row_l, text=str(self.today_licencias), font=ctk.CTkFont(size=12, weight="bold"), text_color=Theme.WARNING_TEXT).pack(side="right")

        # Fila Pendientes
        row_s = ctk.CTkFrame(att_stats_box, fg_color="transparent")
        row_s.pack(fill="x", padx=12, pady=6)
        ctk.CTkLabel(row_s, text="Sin Registrar / Pendientes:", font=ctk.CTkFont(size=12, weight="bold"), text_color=Theme.TEXT_PRIMARY).pack(side="left")
        ctk.CTkLabel(row_s, text=str(self.today_sin_registrar), font=ctk.CTkFont(size=12, weight="bold"), text_color=Theme.TEXT_MUTED).pack(side="right")

        btn_go_att = ctk.CTkButton(
            left_sub,
            text="Ir a Control de Asistencias",
            font=ctk.CTkFont(size=12, weight="bold"),
            fg_color=Theme.PRIMARY,
            hover_color=Theme.PRIMARY_HOVER,
            text_color=Theme.PRIMARY_TEXT,
            height=34,
            command=lambda: self.on_navigate("attendance") if self.on_navigate else None
        )
        btn_go_att.pack(fill="x", padx=15, pady=(10, 15))

        # Columna Derecha: Inscripciones y Alumnos Recientes
        right_sub = ctk.CTkFrame(
            parent,
            fg_color=Theme.BG_CARD,
            corner_radius=12,
            border_width=1,
            border_color=Theme.BORDER_CARD
        )
        right_sub.grid(row=0, column=1, padx=(8, 0), sticky="nsew")

        ctk.CTkLabel(
            right_sub,
            text="Últimos Alumnos Matriculados",
            font=ctk.CTkFont(size=14, weight="bold"),
            text_color=Theme.SUCCESS_TEXT
        ).pack(anchor="w", padx=20, pady=(15, 10))

        if self.recent_students:
            for st in self.recent_students:
                s_item = ctk.CTkFrame(
                    right_sub,
                    fg_color=Theme.BG_CARD_SUB,
                    corner_radius=8,
                    border_width=1,
                    border_color=Theme.BORDER_SUB
                )
                s_item.pack(fill="x", padx=15, pady=4)

                sub_box = ctk.CTkFrame(s_item, fg_color="transparent")
                sub_box.pack(side="left", padx=10, pady=6)

                ctk.CTkLabel(
                    sub_box,
                    text=f"{st['full_name']} ({st['legajo']})",
                    font=ctk.CTkFont(size=11, weight="bold"),
                    text_color=Theme.TEXT_PRIMARY
                ).pack(anchor="w")

                ctk.CTkLabel(
                    sub_box,
                    text=f"Carrera: {st['career_name']} • Cohorte {st['year_enrolled']}",
                    font=ctk.CTkFont(size=10),
                    text_color=Theme.TEXT_MUTED
                ).pack(anchor="w")
        else:
            ctk.CTkLabel(
                right_sub,
                text="No hay alumnos registrados recientemente.",
                font=ctk.CTkFont(size=12),
                text_color=Theme.TEXT_MUTED
            ).pack(anchor="w", padx=20, pady=15)

        btn_go_stu = ctk.CTkButton(
            right_sub,
            text="Ir a Gestión de Alumnos e Inscripciones",
            font=ctk.CTkFont(size=12, weight="bold"),
            fg_color=Theme.SECONDARY,
            hover_color=Theme.SECONDARY_HOVER,
            text_color=Theme.SECONDARY_TEXT,
            height=34,
            command=lambda: self.on_navigate("students") if self.on_navigate else None
        )
        btn_go_stu.pack(fill="x", padx=15, pady=(10, 15))

    def _build_audit_section(self):
        if not self.recent_audits:
            return

        audit_frame = ctk.CTkFrame(
            self,
            fg_color=Theme.BG_CARD,
            corner_radius=12,
            border_width=1,
            border_color=Theme.BORDER_CARD
        )
        audit_frame.pack(fill="x", pady=(0, 20), padx=5)

        ctk.CTkLabel(
            audit_frame,
            text="Registro de Auditoría y Actividad Institucional",
            font=ctk.CTkFont(size=14, weight="bold"),
            text_color=Theme.TEXT_PRIMARY
        ).pack(anchor="w", padx=20, pady=(15, 10))

        for a in self.recent_audits:
            a_row = ctk.CTkFrame(audit_frame, fg_color="transparent")
            a_row.pack(fill="x", padx=20, pady=3)
            
            ctk.CTkLabel(a_row, text=a["timestamp_str"], font=ctk.CTkFont(size=11), text_color=Theme.TEXT_MUTED, width=120, anchor="w").pack(side="left")
            ctk.CTkLabel(a_row, text=f"[{a['username']}]", font=ctk.CTkFont(size=11, weight="bold"), text_color=Theme.INFO_TEXT, width=100, anchor="w").pack(side="left")
            ctk.CTkLabel(a_row, text=a["action"], font=ctk.CTkFont(size=11, weight="bold"), text_color=Theme.TEXT_PRIMARY, width=180, anchor="w").pack(side="left")
            ctk.CTkLabel(a_row, text=a["details"], font=ctk.CTkFont(size=11), text_color=Theme.TEXT_SECONDARY, anchor="w").pack(side="left", fill="x", expand=True)

        ctk.CTkLabel(audit_frame, text="", height=8).pack()

    def _build_quick_actions_bar(self):
        quick_frame = ctk.CTkFrame(
            self,
            fg_color=Theme.BG_CARD,
            corner_radius=12,
            border_width=1,
            border_color=Theme.BORDER_CARD
        )
        quick_frame.pack(fill="x", pady=(0, 20), padx=5)

        ctk.CTkLabel(
            quick_frame,
            text="Accesos Directos Operativos de Bedelía",
            font=ctk.CTkFont(size=14, weight="bold"),
            text_color=Theme.TEXT_PRIMARY
        ).pack(anchor="w", padx=20, pady=(15, 10))

        btn_box = ctk.CTkFrame(quick_frame, fg_color="transparent")
        btn_box.pack(fill="x", padx=20, pady=(0, 15))

        btn_att = ctk.CTkButton(
            btn_box,
            text="Asistencias Diarias",
            font=ctk.CTkFont(size=12, weight="bold"),
            fg_color=Theme.PRIMARY,
            hover_color=Theme.PRIMARY_HOVER,
            text_color=Theme.PRIMARY_TEXT,
            height=38,
            command=lambda: self.on_navigate("attendance") if self.on_navigate else None
        )
        btn_att.pack(side="left", fill="x", expand=True, padx=(0, 6))

        btn_stu = ctk.CTkButton(
            btn_box,
            text="Inscripciones y Alumnos",
            font=ctk.CTkFont(size=12, weight="bold"),
            fg_color=Theme.SECONDARY,
            hover_color=Theme.SECONDARY_HOVER,
            text_color=Theme.SECONDARY_TEXT,
            height=38,
            command=lambda: self.on_navigate("students") if self.on_navigate else None
        )
        btn_stu.pack(side="left", fill="x", expand=True, padx=6)

        btn_des = ctk.CTkButton(
            btn_box,
            text="Consulta de Cátedras y Horarios",
            font=ctk.CTkFont(size=12, weight="bold"),
            fg_color=Theme.SECONDARY,
            hover_color=Theme.SECONDARY_HOVER,
            text_color=Theme.SECONDARY_TEXT,
            height=38,
            command=lambda: self.on_navigate("designations") if self.on_navigate else None
        )
        btn_des.pack(side="left", fill="x", expand=True, padx=(6, 0))
