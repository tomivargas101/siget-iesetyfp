import customtkinter as ctk
from tkinter import messagebox
from datetime import date, timedelta
from models.attendance import AttendanceService
from models.auth import CurrentSession
from views.theme import Theme

class AttendanceView(ctk.CTkFrame):
    def __init__(self, parent):
        super().__init__(parent, fg_color="transparent")
        self.current_date = date.today()
        self.records = []
        self.row_widgets = {}

        self._build_ui()
        self.refresh()

    def _build_ui(self):
        # 1. Encabezado y Navegación de Fechas
        top_frame = ctk.CTkFrame(
            self,
            fg_color=Theme.BG_CARD,
            corner_radius=12,
            border_width=1,
            border_color=Theme.BORDER_CARD
        )
        top_frame.pack(fill="x", padx=5, pady=(0, 15))

        # Título y Descripción
        info_box = ctk.CTkFrame(top_frame, fg_color="transparent")
        info_box.pack(side="left", padx=20, pady=15)

        ctk.CTkLabel(
            info_box,
            text="Control Diario de Asistencia Docente",
            font=ctk.CTkFont(size=18, weight="bold"),
            text_color=Theme.TEXT_PRIMARY
        ).pack(anchor="w")

        ctk.CTkLabel(
            info_box,
            text="Registro operativo de partes diarios y novedades de planta para Bedelía.",
            font=ctk.CTkFont(size=12),
            text_color=Theme.TEXT_SECONDARY
        ).pack(anchor="w", pady=(2, 0))

        # Selector de Fecha
        date_box = ctk.CTkFrame(top_frame, fg_color="transparent")
        date_box.pack(side="right", padx=20, pady=15)

        btn_prev = ctk.CTkButton(
            date_box,
            text="◀ Día Ant.",
            width=80,
            height=32,
            font=ctk.CTkFont(size=11),
            fg_color=Theme.SECONDARY,
            hover_color=Theme.SECONDARY_HOVER,
            text_color=Theme.SECONDARY_TEXT,
            command=self._prev_day
        )
        btn_prev.pack(side="left", padx=4)

        self.lbl_date = ctk.CTkLabel(
            date_box,
            text="",
            font=ctk.CTkFont(size=13, weight="bold"),
            text_color=Theme.INFO_TEXT,
            width=180
        )
        self.lbl_date.pack(side="left", padx=8)

        btn_today = ctk.CTkButton(
            date_box,
            text="Hoy",
            width=65,
            height=32,
            font=ctk.CTkFont(size=11, weight="bold"),
            fg_color=Theme.PRIMARY,
            hover_color=Theme.PRIMARY_HOVER,
            text_color=Theme.PRIMARY_TEXT,
            command=self._go_today
        )
        btn_today.pack(side="left", padx=4)

        btn_next = ctk.CTkButton(
            date_box,
            text="Día Sig. ▶",
            width=80,
            height=32,
            font=ctk.CTkFont(size=11),
            fg_color=Theme.SECONDARY,
            hover_color=Theme.SECONDARY_HOVER,
            text_color=Theme.SECONDARY_TEXT,
            command=self._next_day
        )
        btn_next.pack(side="left", padx=4)

        # 2. Tarjetas de Resumen Diario (KPIs)
        self.kpi_frame = ctk.CTkFrame(self, fg_color="transparent")
        self.kpi_frame.pack(fill="x", padx=5, pady=(0, 15))
        self.kpi_frame.grid_columnconfigure((0, 1, 2, 3), weight=1, uniform="kpi_att")

        self.kpi_labels = {}
        cards_info = [
            ("total", "Total Docentes", "#8C6F00"),
            ("presentes", "Presentes", "#059669"),
            ("ausentes", "Ausentes", "#DC2626"),
            ("licencias", "Licencias / Disp.", "#D97706"),
        ]

        for idx, (key, title, color) in enumerate(cards_info):
            card = ctk.CTkFrame(
                self.kpi_frame,
                fg_color=Theme.BG_CARD,
                corner_radius=10,
                border_width=1,
                border_color=Theme.BORDER_CARD
            )
            card.grid(row=0, column=idx, padx=4, sticky="nsew")

            accent = ctk.CTkFrame(card, height=3, fg_color=color, corner_radius=2)
            accent.pack(fill="x", padx=10, pady=(8, 4))

            ctk.CTkLabel(card, text=title, font=ctk.CTkFont(size=11, weight="bold"), text_color=Theme.TEXT_SECONDARY).pack(anchor="w", padx=12)
            lbl_val = ctk.CTkLabel(card, text="0", font=ctk.CTkFont(size=20, weight="bold"), text_color=Theme.TEXT_PRIMARY)
            lbl_val.pack(anchor="w", padx=12, pady=(0, 8))
            self.kpi_labels[key] = lbl_val

        # 3. Barra de Acciones y Filtros
        actions_bar = ctk.CTkFrame(
            self,
            fg_color=Theme.BG_CARD,
            corner_radius=10,
            border_width=1,
            border_color=Theme.BORDER_CARD
        )
        actions_bar.pack(fill="x", padx=5, pady=(0, 12))

        # Buscador
        self.entry_search = ctk.CTkEntry(
            actions_bar,
            placeholder_text="Buscar por docente o legajo...",
            width=260,
            height=34,
            font=ctk.CTkFont(size=12),
            fg_color=Theme.BG_INPUT,
            border_color=Theme.BORDER_INPUT,
            text_color=Theme.TEXT_PRIMARY
        )
        self.entry_search.pack(side="left", padx=15, pady=10)
        self.entry_search.bind("<KeyRelease>", lambda e: self._filter_table())

        # Filtro de Estado
        self.var_filter = ctk.StringVar(value="Todos")
        combo_filter = ctk.CTkComboBox(
            actions_bar,
            values=["Todos", "Presente", "Ausente c/aviso", "Ausente s/aviso", "Licencia", "Sin Registrar"],
            variable=self.var_filter,
            command=lambda v: self._filter_table(),
            width=160,
            height=34,
            fg_color=Theme.BG_INPUT,
            border_color=Theme.BORDER_INPUT,
            text_color=Theme.TEXT_PRIMARY,
            button_color=Theme.SECONDARY
        )
        combo_filter.pack(side="left", padx=(0, 15), pady=10)

        # Botones de Acción Operativa
        btn_mark_all = ctk.CTkButton(
            actions_bar,
            text="Marcar Todos Presentes",
            font=ctk.CTkFont(size=12, weight="bold"),
            fg_color=Theme.SUCCESS,
            hover_color=Theme.SUCCESS_HOVER,
            text_color="#FFFFFF",
            height=34,
            command=self._mark_all_present
        )
        btn_mark_all.pack(side="right", padx=15, pady=10)

        btn_save_all = ctk.CTkButton(
            actions_bar,
            text="Guardar Cambios",
            font=ctk.CTkFont(size=12, weight="bold"),
            fg_color=Theme.PRIMARY,
            hover_color=Theme.PRIMARY_HOVER,
            text_color=Theme.PRIMARY_TEXT,
            height=34,
            command=self._save_all_changes
        )
        btn_save_all.pack(side="right", padx=(0, 6), pady=10)

        # 4. Tabla Desplazable de Asistencias
        self.scroll_table = ctk.CTkScrollableFrame(self, fg_color="transparent")
        self.scroll_table.pack(fill="both", expand=True, padx=5, pady=0)

    def _prev_day(self):
        self.current_date -= timedelta(days=1)
        self.refresh()

    def _next_day(self):
        self.current_date += timedelta(days=1)
        self.refresh()

    def _go_today(self):
        self.current_date = date.today()
        self.refresh()

    def refresh(self):
        self.lbl_date.configure(text=self.current_date.strftime("%A %d/%m/%Y").capitalize())
        self.records = AttendanceService.get_daily_records(self.current_date)
        self._update_kpis()
        self._render_table()

    def _update_kpis(self):
        summary = AttendanceService.get_summary(self.current_date)
        self.kpi_labels["total"].configure(text=str(summary["total_teachers"]))
        self.kpi_labels["presentes"].configure(text=str(summary["presentes"]))
        self.kpi_labels["ausentes"].configure(text=str(summary["ausentes_total"]))
        self.kpi_labels["licencias"].configure(text=str(summary["licencias"]))

    def _render_table(self):
        # Limpiar filas existentes
        for child in self.scroll_table.winfo_children():
            child.destroy()
        self.row_widgets.clear()

        # Encabezados de Columna
        headers_frame = ctk.CTkFrame(
            self.scroll_table,
            fg_color=Theme.BG_CARD_ALT,
            height=38,
            corner_radius=6,
            border_width=1,
            border_color=Theme.BORDER_CARD
        )
        headers_frame.pack(fill="x", pady=(0, 6))

        cols = [
            ("Docente (Apellido y Nombre)", 240, "w"),
            ("Legajo", 110, "center"),
            ("Situación", 110, "center"),
            ("Estado Asistencia", 170, "center"),
            ("Hs Cátedra", 90, "center"),
            ("Observaciones / Justificación", 240, "w"),
            ("Acción", 90, "center")
        ]

        for text, width, anchor in cols:
            lbl = ctk.CTkLabel(
                headers_frame,
                text=text,
                font=ctk.CTkFont(size=11, weight="bold"),
                text_color=Theme.TEXT_SECONDARY,
                width=width,
                anchor=anchor
            )
            lbl.pack(side="left", padx=6)

        # Filtrar registros
        query = self.entry_search.get().strip().lower()
        filter_st = self.var_filter.get()

        displayed = 0
        for r in self.records:
            # Filtro texto
            if query and (query not in r["full_name"].lower() and query not in r["legajo"].lower() and query not in r["dni"]):
                continue
            # Filtro estado
            if filter_st != "Todos" and r["status"] != filter_st:
                continue

            displayed += 1
            self._render_row(r)

        if displayed == 0:
            ctk.CTkLabel(
                self.scroll_table,
                text="No se encontraron docentes con los criterios seleccionados.",
                font=ctk.CTkFont(size=13),
                text_color=Theme.TEXT_MUTED
            ).pack(pady=30)

    def _render_row(self, r):
        tid = r["teacher_id"]
        row = ctk.CTkFrame(
            self.scroll_table,
            fg_color=Theme.BG_CARD,
            corner_radius=8,
            border_width=1,
            border_color=Theme.BORDER_SUB
        )
        row.pack(fill="x", pady=3)

        # Nombre y DNI
        name_box = ctk.CTkFrame(row, fg_color="transparent", width=240)
        name_box.pack(side="left", padx=6, pady=8)
        ctk.CTkLabel(name_box, text=r["full_name"], font=ctk.CTkFont(size=12, weight="bold"), text_color=Theme.TEXT_PRIMARY, anchor="w").pack(anchor="w")
        ctk.CTkLabel(name_box, text=f"DNI: {r['dni']}", font=ctk.CTkFont(size=10), text_color=Theme.TEXT_MUTED, anchor="w").pack(anchor="w")

        # Legajo
        ctk.CTkLabel(
            row,
            text=r["legajo"],
            font=ctk.CTkFont(size=11),
            text_color=Theme.TEXT_SECONDARY,
            width=110,
            anchor="center"
        ).pack(side="left", padx=6)

        # Situación de Revista
        ctk.CTkLabel(
            row,
            text=r["revista"],
            font=ctk.CTkFont(size=11),
            text_color=Theme.TEXT_SECONDARY,
            width=110,
            anchor="center"
        ).pack(side="left", padx=6)

        # Estado Asistencia (Combobox)
        var_status = ctk.StringVar(value=r["status"])

        combo_status = ctk.CTkComboBox(
            row,
            values=["Presente", "Ausente c/aviso", "Ausente s/aviso", "Licencia", "Sin Registrar"],
            variable=var_status,
            width=170,
            height=30,
            font=ctk.CTkFont(size=11),
            fg_color=Theme.BG_INPUT,
            border_color=Theme.BORDER_INPUT,
            text_color=Theme.TEXT_PRIMARY,
            button_color=Theme.SECONDARY
        )
        combo_status.pack(side="left", padx=6)

        # Horas
        entry_hours = ctk.CTkEntry(
            row,
            width=90,
            height=30,
            font=ctk.CTkFont(size=11),
            justify="center",
            fg_color=Theme.BG_INPUT,
            border_color=Theme.BORDER_INPUT,
            text_color=Theme.TEXT_PRIMARY
        )
        entry_hours.insert(0, str(r["hours"]))
        entry_hours.pack(side="left", padx=6)

        # Observaciones
        entry_obs = ctk.CTkEntry(
            row,
            placeholder_text="Observaciones / N° Res...",
            width=240,
            height=30,
            font=ctk.CTkFont(size=11),
            fg_color=Theme.BG_INPUT,
            border_color=Theme.BORDER_INPUT,
            text_color=Theme.TEXT_PRIMARY
        )
        entry_obs.insert(0, r["observations"])
        entry_obs.pack(side="left", padx=6)

        # Botón Guardar Individual
        btn_save_row = ctk.CTkButton(
            row,
            text="Guardar",
            width=65,
            height=30,
            font=ctk.CTkFont(size=11, weight="bold"),
            fg_color=Theme.SECONDARY,
            hover_color=Theme.PRIMARY,
            text_color=Theme.SECONDARY_TEXT,
            command=lambda: self._save_single_row(tid)
        )
        btn_save_row.pack(side="left", padx=6)

        # Guardar referencias
        self.row_widgets[tid] = {
            "var_status": var_status,
            "entry_hours": entry_hours,
            "entry_obs": entry_obs,
            "record": r
        }

    def _filter_table(self):
        self._render_table()

    def _save_single_row(self, teacher_id):
        w = self.row_widgets.get(teacher_id)
        if not w:
            return

        st = w["var_status"].get()
        try:
            hs = int(w["entry_hours"].get().strip())
        except ValueError:
            hs = 4
        obs = w["entry_obs"].get().strip()

        ok, msg = AttendanceService.save_record(
            teacher_id=teacher_id,
            target_date=self.current_date,
            status=st,
            hours=hs,
            observations=obs
        )
        if ok:
            self._update_kpis()
            messagebox.showinfo("Guardado", f"Asistencia de {w['record']['full_name']} actualizada.")
        else:
            messagebox.showerror("Error", msg)

    def _save_all_changes(self):
        saved_count = 0
        for tid, w in self.row_widgets.items():
            st = w["var_status"].get()
            try:
                hs = int(w["entry_hours"].get().strip())
            except ValueError:
                hs = 4
            obs = w["entry_obs"].get().strip()

            ok, _ = AttendanceService.save_record(
                teacher_id=tid,
                target_date=self.current_date,
                status=st,
                hours=hs,
                observations=obs
            )
            if ok:
                saved_count += 1

        self.refresh()
        messagebox.showinfo("Éxito", f"Se guardaron correctamente {saved_count} registros de asistencia.")

    def _mark_all_present(self):
        if messagebox.askyesno("Confirmar", f"¿Desea marcar como 'Presente' a todos los docentes sin registrar para el día {self.current_date.strftime('%d/%m/%Y')}?"):
            ok, msg = AttendanceService.mark_all_present(self.current_date)
            if ok:
                self.refresh()
                messagebox.showinfo("Asistencias Registradas", msg)
            else:
                messagebox.showerror("Error", msg)
