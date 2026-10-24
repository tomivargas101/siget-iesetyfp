import os
import subprocess
import customtkinter as ctk
from tkinter import messagebox, filedialog
from datetime import datetime
import pandas as pd

from database.connection import get_db_session
from database.schema import Career
from models.reports import ReportService
from views.theme import Theme
from views.excel_table import ExcelTableFrame

MONTH_NAMES = [
    (1, "Enero"), (2, "Febrero"), (3, "Marzo"), (4, "Abril"),
    (5, "Mayo"), (6, "Junio"), (7, "Julio"), (8, "Agosto"),
    (9, "Septiembre"), (10, "Octubre"), (11, "Noviembre"), (12, "Diciembre")
]


class ReportsView(ctk.CTkFrame):
    """
    Vista del Generador de Planillas Oficiales en Excel con Previsualización Interactiva.
    
    Implementa:
    - Previsualización interactiva previa a la exportación procesada con Pandas (DL-01 y DL-02).
    - Tabla corporativa estilo Excel con columnas requeridas: (DNI, Docente, Código, Desde, Hasta, Oficina).
    - Filtro segmentado dinámico (Todos, Cuadro DL-01 Salud, Cuadro DL-02 Inasistencias/Licencias).
    - Botón de confirmación y descarga definitiva generado mediante openpyxl con estilos corporativos.
    """

    def __init__(self, parent):
        super().__init__(parent, fg_color="transparent")
        self.last_generated_file = None
        self.records_preview = []
        self.active_tab_filter = "all"  # 'all', 'dl01', 'dl02'

        self._load_careers()
        self._build_ui()
        # Carga automática inicial de previsualización para el mes en curso
        self._load_preview(silent=True)

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
        # =====================================================================
        # 1. TARJETA DE CONFIGURACIÓN Y PARÁMETROS DEL REPORTE
        # =====================================================================
        config_card = ctk.CTkFrame(
            self,
            fg_color=Theme.BG_CARD,
            corner_radius=12,
            border_width=1,
            border_color=Theme.BORDER_CARD
        )
        config_card.pack(fill="x", padx=5, pady=(0, 14))

        # Título y Descripción Institucional
        ctk.CTkLabel(
            config_card,
            text="Generador de Planilla Oficial de Estadísticas Mensuales y Planta Docente",
            font=ctk.CTkFont(family="Segoe UI", size=16, weight="bold"),
            text_color=Theme.TEXT_PRIMARY
        ).pack(anchor="w", padx=25, pady=(18, 4))

        ctk.CTkLabel(
            config_card,
            text="Previsualización interactiva con procesamiento de Pandas (Cuadros DL-01 y DL-02) y exportación final en openpyxl.",
            font=ctk.CTkFont(family="Segoe UI", size=12),
            text_color=Theme.TEXT_SECONDARY
        ).pack(anchor="w", padx=25, pady=(0, 16))

        # Fila de Controles y Botones de Acción
        ctrl_frame = ctk.CTkFrame(config_card, fg_color="transparent")
        ctrl_frame.pack(fill="x", padx=25, pady=(0, 20))

        # Año Académico
        f_y = ctk.CTkFrame(ctrl_frame, fg_color="transparent")
        f_y.pack(side="left", padx=(0, 15))
        ctk.CTkLabel(
            f_y,
            text="Año Académico:",
            font=ctk.CTkFont(family="Segoe UI", size=11, weight="bold"),
            text_color=Theme.TEXT_SECONDARY
        ).pack(anchor="w", pady=(0, 4))
        self.entry_year = ctk.CTkEntry(
            f_y,
            width=100,
            height=36,
            fg_color=Theme.BG_INPUT,
            border_color=Theme.BORDER_INPUT,
            text_color=Theme.TEXT_PRIMARY
        )
        self.entry_year.insert(0, str(datetime.now().year))
        self.entry_year.pack()

        # Mes de Cierre
        f_m = ctk.CTkFrame(ctrl_frame, fg_color="transparent")
        f_m.pack(side="left", padx=(0, 15))
        ctk.CTkLabel(
            f_m,
            text="Mes de Cierre:",
            font=ctk.CTkFont(family="Segoe UI", size=11, weight="bold"),
            text_color=Theme.TEXT_SECONDARY
        ).pack(anchor="w", pady=(0, 4))
        cur_month = datetime.now().month
        self.var_month = ctk.StringVar(value=MONTH_NAMES[cur_month - 1][1])
        self.combo_month = ctk.CTkComboBox(
            f_m,
            values=[name for _, name in MONTH_NAMES],
            variable=self.var_month,
            width=150,
            height=36,
            fg_color=Theme.BG_INPUT,
            border_color=Theme.BORDER_INPUT,
            text_color=Theme.TEXT_PRIMARY,
            button_color=Theme.SECONDARY,
            command=lambda _: self._load_preview(silent=True)
        )
        self.combo_month.pack()

        # Filtro de Carrera
        f_c = ctk.CTkFrame(ctrl_frame, fg_color="transparent")
        f_c.pack(side="left", padx=(0, 15), fill="x", expand=True)
        ctk.CTkLabel(
            f_c,
            text="Filtro de Carrera:",
            font=ctk.CTkFont(family="Segoe UI", size=11, weight="bold"),
            text_color=Theme.TEXT_SECONDARY
        ).pack(anchor="w", pady=(0, 4))
        self.var_career = ctk.StringVar(value="Todas las Carreras")
        self.combo_career = ctk.CTkComboBox(
            f_c,
            values=list(self.career_map.keys()),
            variable=self.var_career,
            height=36,
            fg_color=Theme.BG_INPUT,
            border_color=Theme.BORDER_INPUT,
            text_color=Theme.TEXT_PRIMARY,
            button_color=Theme.SECONDARY,
            command=lambda _: self._load_preview(silent=True)
        )
        self.combo_career.pack(fill="x")

        # Botón 1: Previsualizar Planilla
        self.btn_preview = ctk.CTkButton(
            ctrl_frame,
            text="Previsualizar Planilla",
            font=ctk.CTkFont(family="Segoe UI", size=12, weight="bold"),
            fg_color=Theme.SECONDARY,
            hover_color=Theme.SECONDARY_HOVER,
            text_color=Theme.SECONDARY_TEXT,
            height=36,
            corner_radius=6,
            command=lambda: self._load_preview(silent=False)
        )
        self.btn_preview.pack(side="left", padx=(10, 8), pady=(18, 0))

        # Botón 2: Confirmar y Descargar Excel
        self.btn_confirm = ctk.CTkButton(
            ctrl_frame,
            text="Confirmar y Descargar Excel",
            font=ctk.CTkFont(family="Segoe UI", size=12, weight="bold"),
            fg_color=Theme.PRIMARY,
            hover_color=Theme.PRIMARY_HOVER,
            text_color=Theme.PRIMARY_TEXT,
            height=36,
            corner_radius=6,
            command=self._confirm_and_download
        )
        self.btn_confirm.pack(side="left", padx=(0, 0), pady=(18, 0))

        # =====================================================================
        # 2. CONTENEDOR DE PREVISUALIZACIÓN INTERACTIVA (TABLA EXCEL)
        # =====================================================================
        self.preview_card = ctk.CTkFrame(
            self,
            fg_color=Theme.BG_CARD,
            corner_radius=12,
            border_width=1,
            border_color=Theme.BORDER_CARD
        )
        self.preview_card.pack(fill="both", expand=True, padx=5, pady=(0, 14))

        # Cabecera de la Previsualización con Métricas y Filtros
        preview_header = ctk.CTkFrame(self.preview_card, fg_color="transparent")
        preview_header.pack(fill="x", padx=20, pady=(16, 12))

        # Título y Badges
        title_box = ctk.CTkFrame(preview_header, fg_color="transparent")
        title_box.pack(side="left", fill="y")

        ctk.CTkLabel(
            title_box,
            text="Previsualización Oficial de Datos (Cuadros DL-01 y DL-02)",
            font=ctk.CTkFont(family="Segoe UI", size=14, weight="bold"),
            text_color=Theme.TEXT_PRIMARY
        ).pack(anchor="w")

        self.lbl_metrics = ctk.CTkLabel(
            title_box,
            text="Cargando registros normativos...",
            font=ctk.CTkFont(family="Segoe UI", size=11),
            text_color=Theme.TEXT_MUTED
        )
        self.lbl_metrics.pack(anchor="w", pady=(2, 0))

        # Filtros de Vista (Segmented / Botones)
        filter_box = ctk.CTkFrame(preview_header, fg_color="transparent")
        filter_box.pack(side="right")

        self.btn_tab_all = ctk.CTkButton(
            filter_box,
            text="Todos",
            font=ctk.CTkFont(family="Segoe UI", size=11, weight="bold"),
            height=28,
            width=70,
            corner_radius=5,
            fg_color=Theme.PRIMARY,
            text_color=Theme.PRIMARY_TEXT,
            hover_color=Theme.PRIMARY_HOVER,
            command=lambda: self._set_tab_filter("all")
        )
        self.btn_tab_all.pack(side="left", padx=2)

        self.btn_tab_dl01 = ctk.CTkButton(
            filter_box,
            text="DL-01 Salud",
            font=ctk.CTkFont(family="Segoe UI", size=11, weight="bold"),
            height=28,
            width=95,
            corner_radius=5,
            fg_color="transparent",
            text_color=Theme.TEXT_SECONDARY,
            hover_color=Theme.NAV_HOVER,
            command=lambda: self._set_tab_filter("dl01")
        )
        self.btn_tab_dl01.pack(side="left", padx=2)

        self.btn_tab_dl02 = ctk.CTkButton(
            filter_box,
            text="DL-02 Novedades",
            font=ctk.CTkFont(family="Segoe UI", size=11, weight="bold"),
            height=28,
            width=110,
            corner_radius=5,
            fg_color="transparent",
            text_color=Theme.TEXT_SECONDARY,
            hover_color=Theme.NAV_HOVER,
            command=lambda: self._set_tab_filter("dl02")
        )
        self.btn_tab_dl02.pack(side="left", padx=2)

        # Separador visual sutil
        sep = ctk.CTkFrame(self.preview_card, height=1, fg_color=Theme.BORDER_SEPARATOR)
        sep.pack(fill="x", padx=16, pady=(0, 8))

        # Componente de Tabla Estilo Excel (Scroll bidireccional y columnas requeridas)
        # Columnas solicitadas: DNI, Docente, Código, Desde, Hasta, Oficina
        self.table_frame = ExcelTableFrame(self.preview_card, min_width=950)
        self.table_frame.pack(fill="both", expand=True, padx=16, pady=(0, 16))

        # =====================================================================
        # 3. TARJETA DE ESTADO Y ACCIONES DE ARCHIVO EXCEL
        # =====================================================================
        self.file_card = ctk.CTkFrame(
            self,
            fg_color=Theme.BG_CARD,
            corner_radius=12,
            border_width=1,
            border_color=Theme.BORDER_CARD
        )
        self.file_card.pack(fill="x", padx=5, pady=(0, 5))

        self.lbl_file_status = ctk.CTkLabel(
            self.file_card,
            text="Verifique los registros en la tabla de previsualización y presione 'Confirmar y Descargar Excel'.",
            font=ctk.CTkFont(family="Segoe UI", size=12),
            text_color=Theme.TEXT_SECONDARY
        )
        self.lbl_file_status.pack(side="left", padx=20, pady=16)

        self.btn_open_file = ctk.CTkButton(
            self.file_card,
            text="Abrir Archivo Excel",
            font=ctk.CTkFont(family="Segoe UI", size=12, weight="bold"),
            fg_color=Theme.PRIMARY,
            hover_color=Theme.PRIMARY_HOVER,
            text_color=Theme.PRIMARY_TEXT,
            height=34,
            corner_radius=6,
            command=self._open_file,
            state="disabled"
        )
        self.btn_open_file.pack(side="right", padx=(5, 20), pady=16)

        self.btn_open_folder = ctk.CTkButton(
            self.file_card,
            text="Abrir Carpeta",
            font=ctk.CTkFont(family="Segoe UI", size=12),
            fg_color=Theme.SECONDARY,
            hover_color=Theme.SECONDARY_HOVER,
            text_color=Theme.SECONDARY_TEXT,
            height=34,
            corner_radius=6,
            command=self._open_folder,
            state="disabled"
        )
        self.btn_open_folder.pack(side="right", padx=5, pady=16)

    def _get_current_params(self):
        """Extrae y valida los parámetros de mes, año y carrera."""
        m_name = self.var_month.get()
        month = next((num for num, name in MONTH_NAMES if name == m_name), 1)

        y_str = self.entry_year.get().strip()
        year = int(y_str) if y_str.isdigit() else datetime.now().year

        c_id = self.career_map.get(self.var_career.get(), 0)
        return month, year, c_id

    def _set_tab_filter(self, filter_name: str):
        """Alterna el filtro visual entre Todos, DL-01 y DL-02."""
        self.active_tab_filter = filter_name

        def _style_btn(btn, is_active):
            if is_active:
                btn.configure(fg_color=Theme.PRIMARY, text_color=Theme.PRIMARY_TEXT)
            else:
                btn.configure(fg_color="transparent", text_color=Theme.TEXT_SECONDARY)

        _style_btn(self.btn_tab_all, filter_name == "all")
        _style_btn(self.btn_tab_dl01, filter_name == "dl01")
        _style_btn(self.btn_tab_dl02, filter_name == "dl02")

        self._render_table_rows()

    def _load_preview(self, silent: bool = False):
        """
        Procesa los datos mediante la lógica de Pandas para los cuadros DL-01 y DL-02
        y renderiza la tabla previa interactiva en pantalla.
        """
        month, year, c_id = self._get_current_params()

        try:
            # Procesamiento con Pandas mediante AttendanceProcessor
            df_dl01, df_dl02 = ReportService.get_processed_dataframes(
                month=month,
                year=year,
                career_id=c_id
            )

            self.records_preview = []

            # 1. Volcado y normalización de Cuadro DL-01 (Salud y Licencias Médicas)
            if not df_dl01.empty:
                for _, r in df_dl01.iterrows():
                    self.records_preview.append({
                        "dni": str(r.get("DNI", "")),
                        "docente": str(r.get("Apellido y Nombres", "")),
                        "codigo": f"DL-01 • {r.get('Artículo / Motivo', 'Salud')}",
                        "desde": str(r.get("Desde", "")),
                        "hasta": str(r.get("Hasta", "")),
                        "oficina": str(r.get("Oficina", "1452")),
                        "cuadro": "dl01",
                        "dias": int(r.get("Total Días", 1))
                    })

            # 2. Volcado y normalización de Cuadro DL-02 (Inasistencias y Permisos)
            if not df_dl02.empty:
                for _, r in df_dl02.iterrows():
                    self.records_preview.append({
                        "dni": str(r.get("DNI", "")),
                        "docente": str(r.get("Apellido y Nombres", "")),
                        "codigo": f"DL-02 • {r.get('Tipo Novedad / Motivo', 'Inasistencia')}",
                        "desde": str(r.get("Desde", "")),
                        "hasta": str(r.get("Hasta", "")),
                        "oficina": str(r.get("Oficina", "1452")),
                        "cuadro": "dl02",
                        "dias": int(r.get("Total Días", 1))
                    })

            count_01 = len([r for r in self.records_preview if r["cuadro"] == "dl01"])
            count_02 = len([r for r in self.records_preview if r["cuadro"] == "dl02"])
            total = len(self.records_preview)

            self.lbl_metrics.configure(
                text=f"Total: {total} registros listos | Cuadro DL-01 (Salud): {count_01} | Cuadro DL-02 (Novedades): {count_02} | Período: {month:02d}/{year}"
            )

            self._render_table_rows()

            if not silent:
                self.lbl_file_status.configure(
                    text=f"Previsualización actualizada: {total} registros procesados para {month:02d}/{year}.",
                    text_color=Theme.SUCCESS_TEXT
                )

        except Exception as e:
            if not silent:
                messagebox.showerror("Error de Previsualización", f"Error al procesar datos con Pandas:\n{str(e)}")
            self.lbl_metrics.configure(text="Error al calcular previsualización.")

    def _render_table_rows(self):
        """Renderiza las filas en el componente ExcelTableFrame con las 6 columnas normativas."""
        self.table_frame.clear_all()

        # Configuración exacta de Columnas solicitadas:
        # (DNI, Docente, Código, Desde, Hasta, Oficina)
        columns = [
            ("DNI", 1, 105, "center"),
            ("Docente", 3, 230, "w"),
            ("Código / Motivo", 2, 230, "w"),
            ("Desde", 1, 100, "center"),
            ("Hasta", 1, 100, "center"),
            ("Oficina", 1, 95, "center")
        ]
        self.table_frame.set_columns(columns)
        self.table_frame.render_header()

        # Filtrar registros según pestaña activa
        if self.active_tab_filter == "dl01":
            visible_records = [r for r in self.records_preview if r["cuadro"] == "dl01"]
        elif self.active_tab_filter == "dl02":
            visible_records = [r for r in self.records_preview if r["cuadro"] == "dl02"]
        else:
            visible_records = self.records_preview

        if not visible_records:
            msg = "No se encontraron registros de novedades o licencias para el período y filtro seleccionados."
            self.table_frame.show_empty_message(msg)
            return

        for idx, rec in enumerate(visible_records):
            row_frame = self.table_frame.create_row(idx)

            # Col 0: DNI (Texto estricto conforme a RN-01)
            c0 = self.table_frame.add_cell(row_frame, 0)
            ctk.CTkLabel(
                c0,
                text=rec["dni"],
                font=ctk.CTkFont(family="Segoe UI", size=11, weight="bold"),
                text_color=Theme.TEXT_PRIMARY
            ).pack(fill="both", expand=True)

            # Col 1: Docente (Apellido y Nombres)
            c1 = self.table_frame.add_cell(row_frame, 1)
            ctk.CTkLabel(
                c1,
                text=rec["docente"],
                font=ctk.CTkFont(family="Segoe UI", size=11, weight="bold"),
                text_color=Theme.TEXT_PRIMARY,
                anchor="w"
            ).pack(fill="both", expand=True)

            # Col 2: Código / Motivo (Resaltado con etiqueta visual de Cuadro)
            c2 = self.table_frame.add_cell(row_frame, 2)
            code_text = rec["codigo"]
            is_dl01 = (rec["cuadro"] == "dl01")
            code_color = Theme.WARNING_TEXT if is_dl01 else Theme.INFO_TEXT
            ctk.CTkLabel(
                c2,
                text=code_text,
                font=ctk.CTkFont(family="Segoe UI", size=11, weight="bold"),
                text_color=code_color,
                anchor="w"
            ).pack(fill="both", expand=True)

            # Col 3: Desde (Formato 'DD/MM/YYYY')
            c3 = self.table_frame.add_cell(row_frame, 3)
            ctk.CTkLabel(
                c3,
                text=rec["desde"],
                font=ctk.CTkFont(family="Segoe UI", size=11),
                text_color=Theme.TEXT_SECONDARY
            ).pack(fill="both", expand=True)

            # Col 4: Hasta (Formato 'DD/MM/YYYY')
            c4 = self.table_frame.add_cell(row_frame, 4)
            ctk.CTkLabel(
                c4,
                text=rec["hasta"],
                font=ctk.CTkFont(family="Segoe UI", size=11),
                text_color=Theme.TEXT_SECONDARY
            ).pack(fill="both", expand=True)

            # Col 5: Oficina (RN-07: 1452)
            c5 = self.table_frame.add_cell(row_frame, 5)
            badge_office = ctk.CTkLabel(
                c5,
                text=rec["oficina"],
                font=ctk.CTkFont(family="Segoe UI", size=10, weight="bold"),
                fg_color=Theme.GOLD_BG,
                text_color=Theme.GOLD_TEXT,
                corner_radius=4,
                height=22
            )
            badge_office.pack(fill="x", padx=10)

    def _confirm_and_download(self):
        """
        Ejecuta la exportación final de la planilla con openpyxl una vez validada la previsualización.
        Permite al usuario seleccionar el destino del archivo o descargar en la carpeta institucional.
        """
        month, year, c_id = self._get_current_params()
        default_filename = f"Planilla_Estadistica_Mensual_{year}_{month:02d}.xlsx"

        # Diálogo para confirmación de destino de descarga
        selected_path = filedialog.asksaveasfilename(
            title="Guardar Planilla Oficial Excel",
            defaultextension=".xlsx",
            initialfile=default_filename,
            filetypes=[("Libro de Excel (*.xlsx)", "*.xlsx")]
        )

        if not selected_path:
            # El usuario canceló el guardado
            return

        try:
            self.lbl_file_status.configure(
                text="⏳ Compilando planilla oficial con openpyxl...",
                text_color=Theme.WARNING_TEXT
            )
            self.update_idletasks()

            # Generación final con openpyxl preservando fórmulas y estilos
            out_path = ReportService.generate_monthly_statistics_excel(
                month=month,
                year=year,
                career_id=c_id,
                output_path=selected_path
            )
            self.last_generated_file = out_path

            filename = os.path.basename(out_path)
            self.lbl_file_status.configure(
                text=f"Planilla exportada exitosamente:\n{filename}",
                text_color=Theme.SUCCESS_TEXT
            )
            self.btn_open_file.configure(state="normal")
            self.btn_open_folder.configure(state="normal")

            messagebox.showinfo(
                "Exportación Exitosa",
                f"La planilla oficial se compiló y descargó correctamente en:\n\n{out_path}"
            )
        except Exception as e:
            self.lbl_file_status.configure(text="Error al exportar planilla Excel", text_color=Theme.DANGER_TEXT)
            messagebox.showerror("Error de Exportación", f"Ocurrió un error al compilar la planilla con openpyxl:\n{str(e)}")

    def _open_file(self):
        if self.last_generated_file and os.path.exists(self.last_generated_file):
            try:
                os.startfile(self.last_generated_file)
            except Exception as e:
                messagebox.showerror("Error", f"No se pudo abrir el archivo:\n{str(e)}")

    def _open_folder(self):
        if self.last_generated_file:
            folder = os.path.dirname(self.last_generated_file)
            if os.path.exists(folder):
                try:
                    os.startfile(folder)
                except Exception as e:
                    messagebox.showerror("Error", f"No se pudo abrir la carpeta:\n{str(e)}")
