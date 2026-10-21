import os
import subprocess
import customtkinter as ctk
from tkinter import messagebox, filedialog
from datetime import datetime
from database.connection import get_db_session
from database.schema import Career
from models.reports import ReportService
from views.theme import Theme

MONTH_NAMES = [
    (1, "Enero"), (2, "Febrero"), (3, "Marzo"), (4, "Abril"),
    (5, "Mayo"), (6, "Junio"), (7, "Julio"), (8, "Agosto"),
    (9, "Septiembre"), (10, "Octubre"), (11, "Noviembre"), (12, "Diciembre")
]

class ReportsView(ctk.CTkFrame):
    def __init__(self, parent):
        super().__init__(parent, fg_color="transparent")
        self.last_generated_file = None
        self._load_careers()
        self._build_ui()

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
        # 1. Tarjeta de Configuración del Reporte
        config_card = ctk.CTkFrame(
            self,
            fg_color=Theme.BG_CARD,
            corner_radius=12,
            border_width=1,
            border_color=Theme.BORDER_CARD
        )
        config_card.pack(fill="x", padx=5, pady=(0, 20))

        ctk.CTkLabel(
            config_card,
            text="Generador de Planilla Oficial de Estadísticas Mensuales y Planta Docente",
            font=ctk.CTkFont(size=16, weight="bold"),
            text_color=Theme.TEXT_PRIMARY
        ).pack(anchor="w", padx=25, pady=(20, 5))

        ctk.CTkLabel(
            config_card,
            text="Automatización de planilla Excel conforme a normativa ministerial de educación superior terciaria.",
            font=ctk.CTkFont(size=12),
            text_color=Theme.TEXT_SECONDARY
        ).pack(anchor="w", padx=25, pady=(0, 20))

        # Controles
        ctrl_frame = ctk.CTkFrame(config_card, fg_color="transparent")
        ctrl_frame.pack(fill="x", padx=25, pady=(0, 25))

        # Mes
        f_m = ctk.CTkFrame(ctrl_frame, fg_color="transparent")
        f_m.pack(side="left", padx=(0, 15))
        ctk.CTkLabel(f_m, text="Mes Calendario:", font=ctk.CTkFont(size=11, weight="bold"), text_color=Theme.TEXT_SECONDARY).pack(anchor="w", pady=(0, 4))
        cur_month = datetime.now().month
        self.var_month = ctk.StringVar(value=MONTH_NAMES[cur_month - 1][1])
        self.combo_month = ctk.CTkComboBox(
            f_m,
            values=[name for _, name in MONTH_NAMES],
            variable=self.var_month,
            width=160,
            height=36,
            fg_color=Theme.BG_INPUT,
            border_color=Theme.BORDER_INPUT,
            text_color=Theme.TEXT_PRIMARY,
            button_color=Theme.SECONDARY
        )
        self.combo_month.pack()

        # Año
        f_y = ctk.CTkFrame(ctrl_frame, fg_color="transparent")
        f_y.pack(side="left", padx=(0, 15))
        ctk.CTkLabel(f_y, text="Año Lectivo:", font=ctk.CTkFont(size=11, weight="bold"), text_color=Theme.TEXT_SECONDARY).pack(anchor="w", pady=(0, 4))
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

        # Carrera
        f_c = ctk.CTkFrame(ctrl_frame, fg_color="transparent")
        f_c.pack(side="left", padx=(0, 15), fill="x", expand=True)
        ctk.CTkLabel(f_c, text="Filtro de Carrera:", font=ctk.CTkFont(size=11, weight="bold"), text_color=Theme.TEXT_SECONDARY).pack(anchor="w", pady=(0, 4))
        self.var_career = ctk.StringVar(value="Todas las Carreras")
        self.combo_career = ctk.CTkComboBox(
            f_c,
            values=list(self.career_map.keys()),
            variable=self.var_career,
            height=36,
            fg_color=Theme.BG_INPUT,
            border_color=Theme.BORDER_INPUT,
            text_color=Theme.TEXT_PRIMARY,
            button_color=Theme.SECONDARY
        )
        self.combo_career.pack(fill="x")

        # Botón de Generación
        self.btn_generate = ctk.CTkButton(
            ctrl_frame,
            text="Generar Planilla Excel",
            font=ctk.CTkFont(size=12, weight="bold"),
            fg_color=Theme.PRIMARY,
            hover_color=Theme.PRIMARY_HOVER,
            text_color=Theme.PRIMARY_TEXT,
            height=36,
            command=self._generate_report
        )
        self.btn_generate.pack(side="right", padx=(10, 0), pady=(18, 0))

        # 2. Tarjeta de Estado y Acciones de Archivo Generado
        self.file_card = ctk.CTkFrame(
            self,
            fg_color=Theme.BG_CARD,
            corner_radius=12,
            border_width=1,
            border_color=Theme.BORDER_CARD
        )
        self.file_card.pack(fill="x", padx=5, pady=(0, 20))

        self.lbl_file_status = ctk.CTkLabel(
            self.file_card,
            text="Presione 'Generar Planilla Excel' para compilar la estadística mensual oficial.",
            font=ctk.CTkFont(size=13),
            text_color=Theme.TEXT_SECONDARY
        )
        self.lbl_file_status.pack(side="left", padx=25, pady=20)

        self.btn_open_file = ctk.CTkButton(
            self.file_card,
            text="Abrir Archivo Excel",
            font=ctk.CTkFont(size=12, weight="bold"),
            fg_color=Theme.PRIMARY,
            hover_color=Theme.PRIMARY_HOVER,
            text_color=Theme.PRIMARY_TEXT,
            height=34,
            command=self._open_file,
            state="disabled"
        )
        self.btn_open_file.pack(side="right", padx=(5, 25), pady=20)

        self.btn_open_folder = ctk.CTkButton(
            self.file_card,
            text="Abrir Carpeta",
            font=ctk.CTkFont(size=12),
            fg_color=Theme.SECONDARY,
            hover_color=Theme.SECONDARY_HOVER,
            text_color=Theme.SECONDARY_TEXT,
            height=34,
            command=self._open_folder,
            state="disabled"
        )
        self.btn_open_folder.pack(side="right", padx=5, pady=20)

        # 3. Vista Informativa de la Normativa
        norm_frame = ctk.CTkFrame(
            self,
            fg_color=Theme.BG_CARD,
            corner_radius=12,
            border_width=1,
            border_color=Theme.BORDER_CARD
        )
        norm_frame.pack(fill="both", expand=True, padx=5)

        ctk.CTkLabel(
            norm_frame,
            text="ℹ️ Estructura y Parámetros Oficiales del Reporte Excel",
            font=ctk.CTkFont(size=14, weight="bold"),
            text_color=Theme.INFO_TEXT
        ).pack(anchor="w", padx=25, pady=(20, 10))

        info_text = (
            "• La planilla generada vincula de forma automatizada:\n"
            "  1. La totalidad de la Planta Docente con discriminación exacta por situación de revista (Titular, Provisional, Interino, Suplente).\n"
            "  2. El total acumulado de horas cátedra semanales y mensuales de cada espacio curricular.\n"
            "  3. Las suplencias vigentes en el mes, consignando docente titular reemplazado, docente suplente, motivo reglamentario y número de resolución ministerial.\n"
            "  4. Formato corporativo institucional con cabeceras estilizadas, celdas formateadas y cálculo automático de totales generales."
        )

        ctk.CTkLabel(
            norm_frame,
            text=info_text,
            font=ctk.CTkFont(size=12),
            text_color=Theme.TEXT_SECONDARY,
            justify="left"
        ).pack(anchor="w", padx=25, pady=(0, 20))

    def _generate_report(self):
        m_name = self.var_month.get()
        month = next((num for num, name in MONTH_NAMES if name == m_name), 1)
        
        y_str = self.entry_year.get().strip()
        year = int(y_str) if y_str.isdigit() else datetime.now().year

        c_id = self.career_map.get(self.var_career.get(), 0)

        try:
            self.lbl_file_status.configure(text="⏳ Procesando datos y compilando planilla Excel...", text_color=Theme.WARNING_TEXT)
            self.update_idletasks()

            out_path = ReportService.generate_monthly_statistics_excel(month=month, year=year, career_id=c_id)
            self.last_generated_file = out_path

            filename = os.path.basename(out_path)
            self.lbl_file_status.configure(
                text=f"Planilla generada exitosamente:\n{filename}",
                text_color=Theme.SUCCESS_TEXT
            )
            self.btn_open_file.configure(state="normal")
            self.btn_open_folder.configure(state="normal")
            messagebox.showinfo("Reporte Oficial Generado", f"La planilla se generó correctamente en:\n{out_path}")
        except Exception as e:
            self.lbl_file_status.configure(text="Error al generar planilla", text_color=Theme.DANGER_TEXT)
            messagebox.showerror("Error en Reporte", f"Ocurrió un error al generar la planilla:\n{str(e)}")

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
