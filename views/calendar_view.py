"""
Vista de Calendario Institucional del Profesorado para SIGET (CustomTkinter)
Permite visualizar de fecha a fecha el historial completo de cada docente:
- Licencias médicas (Art. 114 a, 114 b)
- Faltas y permisos particulares (Art. 115)
- Designaciones activas y control de 30 horas semanales
- Suplencias vigentes (titular sustituido y suplente asignado)
- Barra de progreso de topes anuales y estado de disponibilidad institucional.
"""

import customtkinter as ctk
from datetime import datetime, date
from typing import Optional, List, Dict, Any
from views.theme import Theme
from database.connection import get_db_session
from database.schema import Teacher
from models.calendar_service import TeacherCalendarServicePy

class CalendarView(ctk.CTkFrame):
    def __init__(self, master, **kwargs):
        super().__init__(master, fg_color="transparent", **kwargs)
        self.teachers_map: Dict[str, int] = {}
        self._build_ui()
        self._load_teachers()

    def _build_ui(self):
        # Barra superior de filtros
        filter_card = ctk.CTkFrame(self, fg_color=Theme.BG_CARD, corner_radius=10, border_width=1, border_color=Theme.BORDER)
        filter_card.pack(fill="x", padx=16, pady=(12, 8))

        row = ctk.CTkFrame(filter_card, fg_color="transparent")
        row.pack(fill="x", padx=14, pady=12)

        # Selector de Docente
        lbl_doc = ctk.CTkLabel(row, text="Docente:", font=ctk.CTkFont(size=12, weight="bold"), text_color=Theme.TEXT_SECONDARY)
        lbl_doc.pack(side="left", padx=(0, 6))

        self.combo_teacher = ctk.CTkComboBox(
            row,
            values=["Cargando docentes..."],
            width=280,
            command=self._on_teacher_selected,
            font=ctk.CTkFont(size=12),
            dropdown_font=ctk.CTkFont(size=11)
        )
        self.combo_teacher.pack(side="left", padx=(0, 16))

        # Rango de fechas
        now = datetime.now()
        lbl_start = ctk.CTkLabel(row, text="Desde:", font=ctk.CTkFont(size=12, weight="bold"), text_color=Theme.TEXT_SECONDARY)
        lbl_start.pack(side="left", padx=(0, 6))

        self.entry_start = ctk.CTkEntry(row, width=105, font=ctk.CTkFont(size=12))
        self.entry_start.insert(0, f"{now.year}-{str(now.month).zfill(2)}-01")
        self.entry_start.pack(side="left", padx=(0, 12))

        lbl_end = ctk.CTkLabel(row, text="Hasta:", font=ctk.CTkFont(size=12, weight="bold"), text_color=Theme.TEXT_SECONDARY)
        lbl_end.pack(side="left", padx=(0, 6))

        self.entry_end = ctk.CTkEntry(row, width=105, font=ctk.CTkFont(size=12))
        self.entry_end.insert(0, f"{now.year}-{str(now.month).zfill(2)}-28")
        self.entry_end.pack(side="left", padx=(0, 16))

        btn_search = ctk.CTkButton(
            row,
            text="Consultar Cronograma",
            command=self._load_timeline,
            fg_color=Theme.GOLD_PRIMARY,
            text_color="#000000",
            hover_color=Theme.GOLD_HOVER,
            font=ctk.CTkFont(size=12, weight="bold"),
            height=32
        )
        btn_search.pack(side="left")

        # Contenedor de Ficha del Docente y Topes Estatutarios
        self.profile_frame = ctk.CTkFrame(self, fg_color=Theme.BG_CARD, corner_radius=10, border_width=1, border_color=Theme.BORDER)
        self.profile_frame.pack(fill="x", padx=16, pady=(6, 12))

        p_inner = ctk.CTkFrame(self.profile_frame, fg_color="transparent")
        p_inner.pack(fill="x", padx=16, pady=14)

        top_info = ctk.CTkFrame(p_inner, fg_color="transparent")
        top_info.pack(fill="x")

        self.lbl_teacher_name = ctk.CTkLabel(
            top_info,
            text="Seleccione un Docente para consultar",
            font=ctk.CTkFont(size=15, weight="bold"),
            text_color=Theme.TEXT_PRIMARY
        )
        self.lbl_teacher_name.pack(side="left")

        self.badge_avail = ctk.CTkLabel(
            top_info,
            text="DISPONIBLE",
            font=ctk.CTkFont(size=11, weight="bold"),
            fg_color="#065f46",
            text_color="#34d399",
            corner_radius=6,
            padx=10,
            pady=3
        )
        self.badge_avail.pack(side="right")

        self.lbl_teacher_meta = ctk.CTkLabel(
            p_inner,
            text="DNI: - | Legajo: - | Situación de Revista: -",
            font=ctk.CTkFont(size=11),
            text_color=Theme.TEXT_SECONDARY
        )
        self.lbl_teacher_meta.pack(anchor="w", pady=(2, 8))

        # Métricas de carga horaria y topes en columnas
        metrics_grid = ctk.CTkFrame(p_inner, fg_color="transparent")
        metrics_grid.pack(fill="x", pady=(4, 0))

        # Carga Horaria Semanal
        col_hours = ctk.CTkFrame(metrics_grid, fg_color=Theme.BG_SURFACE, corner_radius=8, border_width=1, border_color=Theme.BORDER)
        col_hours.pack(side="left", fill="both", expand=True, padx=(0, 6), pady=4)
        ctk.CTkLabel(col_hours, text="Carga Horaria Semanal", font=ctk.CTkFont(size=10, weight="bold"), text_color=Theme.TEXT_SECONDARY).pack(anchor="w", padx=10, pady=(6, 2))
        self.lbl_hours = ctk.CTkLabel(col_hours, text="0 / 30 hs", font=ctk.CTkFont(size=13, weight="bold"), text_color=Theme.TEXT_PRIMARY)
        self.lbl_hours.pack(anchor="w", padx=10)
        self.bar_hours = ctk.CTkProgressBar(col_hours, height=8, progress_color=Theme.GOLD_PRIMARY)
        self.bar_hours.set(0)
        self.bar_hours.pack(fill="x", padx=10, pady=(4, 8))

        # Inasistencias Injustificadas
        col_i = ctk.CTkFrame(metrics_grid, fg_color=Theme.BG_SURFACE, corner_radius=8, border_width=1, border_color=Theme.BORDER)
        col_i.pack(side="left", fill="both", expand=True, padx=4, pady=4)
        ctk.CTkLabel(col_i, text="Inasistencias (I)", font=ctk.CTkFont(size=10, weight="bold"), text_color=Theme.TEXT_SECONDARY).pack(anchor="w", padx=10, pady=(6, 2))
        self.lbl_i = ctk.CTkLabel(col_i, text="0 / 5 faltas", font=ctk.CTkFont(size=13, weight="bold"), text_color="#ef4444")
        self.lbl_i.pack(anchor="w", padx=10)
        self.bar_i = ctk.CTkProgressBar(col_i, height=8, progress_color="#ef4444")
        self.bar_i.set(0)
        self.bar_i.pack(fill="x", padx=10, pady=(4, 8))

        # Permisos Art. 115
        col_p = ctk.CTkFrame(metrics_grid, fg_color=Theme.BG_SURFACE, corner_radius=8, border_width=1, border_color=Theme.BORDER)
        col_p.pack(side="left", fill="both", expand=True, padx=4, pady=4)
        ctk.CTkLabel(col_p, text="Permisos Particulares (115)", font=ctk.CTkFont(size=10, weight="bold"), text_color=Theme.TEXT_SECONDARY).pack(anchor="w", padx=10, pady=(6, 2))
        self.lbl_p = ctk.CTkLabel(col_p, text="0 / 6 permisos", font=ctk.CTkFont(size=13, weight="bold"), text_color="#f59e0b")
        self.lbl_p.pack(anchor="w", padx=10)
        self.bar_p = ctk.CTkProgressBar(col_p, height=8, progress_color="#f59e0b")
        self.bar_p.set(0)
        self.bar_p.pack(fill="x", padx=10, pady=(4, 8))

        # Licencias Médicas Art. 114 a
        col_lic = ctk.CTkFrame(metrics_grid, fg_color=Theme.BG_SURFACE, corner_radius=8, border_width=1, border_color=Theme.BORDER)
        col_lic.pack(side="left", fill="both", expand=True, padx=(6, 0), pady=4)
        ctk.CTkLabel(col_lic, text="Lic. Médica (114 a)", font=ctk.CTkFont(size=10, weight="bold"), text_color=Theme.TEXT_SECONDARY).pack(anchor="w", padx=10, pady=(6, 2))
        self.lbl_lic = ctk.CTkLabel(col_lic, text="0 / 25 días", font=ctk.CTkFont(size=13, weight="bold"), text_color="#a855f7")
        self.lbl_lic.pack(anchor="w", padx=10)
        self.bar_lic = ctk.CTkProgressBar(col_lic, height=8, progress_color="#a855f7")
        self.bar_lic.set(0)
        self.bar_lic.pack(fill="x", padx=10, pady=(4, 8))

        # Historial de Novedades / Cronograma
        tbl_frame = ctk.CTkFrame(self, fg_color=Theme.BG_CARD, corner_radius=10, border_width=1, border_color=Theme.BORDER)
        tbl_frame.pack(fill="both", expand=True, padx=16, pady=(6, 16))

        lbl_tbl = ctk.CTkLabel(
            tbl_frame,
            text="Línea de Tiempo de Novedades y Asistencias",
            font=ctk.CTkFont(size=13, weight="bold"),
            text_color=Theme.TEXT_PRIMARY
        )
        lbl_tbl.pack(anchor="w", padx=14, pady=(10, 6))

        self.scroll_events = ctk.CTkScrollableFrame(tbl_frame, fg_color="transparent")
        self.scroll_events.pack(fill="both", expand=True, padx=10, pady=(0, 10))

    def _load_teachers(self):
        session = get_db_session()
        try:
            teachers = session.query(Teacher).filter(Teacher.is_active == True).order_by(Teacher.last_name.asc()).all()
            self.teachers_map = {}
            names = []
            for t in teachers:
                label = f"{t.last_name}, {t.first_name} (DNI: {t.dni})"
                self.teachers_map[label] = t.id
                names.append(label)

            if names:
                self.combo_teacher.configure(values=names)
                self.combo_teacher.set(names[0])
                self._load_timeline()
            else:
                self.combo_teacher.configure(values=["Sin docentes registrados"])
        finally:
            session.close()

    def _on_teacher_selected(self, choice):
        self._load_timeline()

    def _load_timeline(self):
        choice = self.combo_teacher.get()
        teacher_id = self.teachers_map.get(choice)
        if not teacher_id:
            return

        start_date = self.entry_start.get().strip() or None
        end_date = self.entry_end.get().strip() or None

        res = TeacherCalendarServicePy.get_teacher_timeline(teacher_id, start_date, end_date)
        if not res["success"]:
            return

        t = res["teacher"]
        m = res["annualMetrics"]

        self.lbl_teacher_name.configure(text=t["fullName"])
        self.lbl_teacher_meta.configure(text=f"DNI: {t['dni']} | Legajo: {t['legajo']} | Situación de Revista: {t['revista']}")
        self.badge_avail.configure(text=t["availabilityStatus"])

        # Barra horas
        active_h = t["activeHours"]
        self.lbl_hours.configure(text=f"{active_h} / 30 hs")
        self.bar_hours.set(min(1.0, active_h / 30.0))

        # Topes
        i_cnt = m["inasistencias"]["count"]
        self.lbl_i.configure(text=f"{i_cnt} / 5 faltas")
        self.bar_i.set(min(1.0, i_cnt / 5.0))

        p_cnt = m["permisos"]["count"]
        self.lbl_p.configure(text=f"{p_cnt} / 6 permisos")
        self.bar_p.set(min(1.0, p_cnt / 6.0))

        lic_cnt = m["licenciasMedicas"]["count"]
        self.lbl_lic.configure(text=f"{lic_cnt} / 25 días")
        self.bar_lic.set(min(1.0, lic_cnt / 25.0))

        # Limpiar eventos previos
        for widget in self.scroll_events.winfo_children():
            widget.destroy()

        events = res["events"]
        if not events:
            lbl_empty = ctk.CTkLabel(
                self.scroll_events,
                text="No existen asistencias ni novedades registradas en el período seleccionado.",
                text_color=Theme.TEXT_SECONDARY,
                font=ctk.CTkFont(size=12, slant="italic")
            )
            lbl_empty.pack(pady=20)
            return

        for ev in events:
            row = ctk.CTkFrame(self.scroll_events, fg_color=Theme.BG_SURFACE, corner_radius=6, border_width=1, border_color=Theme.BORDER)
            row.pack(fill="x", pady=2, padx=2)

            f_left = ctk.CTkFrame(row, fg_color="transparent")
            f_left.pack(side="left", padx=10, pady=8)

            ctk.CTkLabel(f_left, text=ev["date"], font=ctk.CTkFont(size=11, weight="bold"), text_color=Theme.TEXT_PRIMARY).pack(side="left", padx=(0, 10))
            
            badge_color = "#065f46" if ev["status"] == "PR" else ("#7f1d1d" if ev["status"] == "I" else "#78350f")
            text_color = "#34d399" if ev["status"] == "PR" else ("#f87171" if ev["status"] == "I" else "#fbbf24")
            
            b = ctk.CTkLabel(f_left, text=f"{ev['eventType']} ({ev['status']})", font=ctk.CTkFont(size=10, weight="bold"), fg_color=badge_color, text_color=text_color, corner_radius=4, padx=6, pady=2)
            b.pack(side="left")

            obs_txt = ev["observations"] or "Sin observaciones"
            ctk.CTkLabel(row, text=obs_txt, font=ctk.CTkFont(size=11), text_color=Theme.TEXT_SECONDARY).pack(side="right", padx=12, pady=8)
