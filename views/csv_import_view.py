"""
Vista de Carga Masiva por Archivos para SIGET (CustomTkinter)
Permite la importación unificada de personal ("Datos del personal") y asistencias ("Asistencia"),
con soporte dinámico para archivos Excel (.xlsx, .xls), Word (.docx, .doc), CSV y TXT.
"""

import os
import customtkinter as ctk
from tkinter import filedialog, messagebox
from views.theme import Theme
from models.csv_import import CsvImportServicePy

class CsvImportView(ctk.CTkFrame):
    def __init__(self, master, **kwargs):
        super().__init__(master, fg_color="transparent", **kwargs)
        self.explicit_mode = "auto"  # "auto", "personnel", "attendance"
        self.detected_mode = "personnel"
        self.csv_text = ""
        self.loaded_file_info = None
        self.preview_data = None
        self._build_ui()

    def _build_ui(self):
        card = ctk.CTkFrame(self, fg_color=Theme.BG_CARD, corner_radius=10, border_width=1, border_color=Theme.BORDER)
        card.pack(fill="x", padx=16, pady=(12, 8))

        inner = ctk.CTkFrame(card, fg_color="transparent")
        inner.pack(fill="x", padx=16, pady=14)

        ctk.CTkLabel(
            inner,
            text="Módulo de Carga Masiva de Archivos",
            font=ctk.CTkFont(size=15, weight="bold"),
            text_color=Theme.TEXT_PRIMARY
        ).pack(anchor="w")

        ctk.CTkLabel(
            inner,
            text="Importación unificada para Planta Docente y Registros de Asistencia con soporte para Excel, Word, CSV y TXT.",
            font=ctk.CTkFont(size=11),
            text_color=Theme.TEXT_SECONDARY
        ).pack(anchor="w", pady=(2, 10))

        # Selector Unificado de Tipo de Ingesta
        mode_box = ctk.CTkFrame(inner, fg_color=Theme.BG_SURFACE, corner_radius=8, border_width=1, border_color=Theme.BORDER)
        mode_box.pack(fill="x", pady=(0, 10), ipady=4)

        m_inner = ctk.CTkFrame(mode_box, fg_color="transparent")
        m_inner.pack(fill="x", padx=10, pady=4)

        ctk.CTkLabel(m_inner, text="Tipo de Ingesta:", font=ctk.CTkFont(size=11, weight="bold"), text_color=Theme.TEXT_PRIMARY).pack(side="left", padx=(0, 8))

        self.btn_mode_auto = ctk.CTkButton(
            m_inner,
            text="Auto-Detectar",
            command=lambda: self._set_explicit_mode("auto"),
            fg_color=Theme.GOLD_PRIMARY,
            text_color="#000000",
            font=ctk.CTkFont(size=11, weight="bold"),
            height=26,
            width=100
        )
        self.btn_mode_auto.pack(side="left", padx=(0, 6))

        self.btn_mode_pers = ctk.CTkButton(
            m_inner,
            text="Planta Funcional",
            command=lambda: self._set_explicit_mode("personnel"),
            fg_color="transparent",
            border_width=1,
            border_color=Theme.BORDER,
            text_color=Theme.TEXT_SECONDARY,
            font=ctk.CTkFont(size=11, weight="bold"),
            height=26,
            width=120
        )
        self.btn_mode_pers.pack(side="left", padx=(0, 6))

        self.btn_mode_att = ctk.CTkButton(
            m_inner,
            text="Asistencias y Novedades",
            command=lambda: self._set_explicit_mode("attendance"),
            fg_color="transparent",
            border_width=1,
            border_color=Theme.BORDER,
            text_color=Theme.TEXT_SECONDARY,
            font=ctk.CTkFont(size=11, weight="bold"),
            height=26,
            width=150
        )
        self.btn_mode_att.pack(side="left")

        # Selector y estado de archivo
        file_box = ctk.CTkFrame(inner, fg_color=Theme.BG_SURFACE, corner_radius=8, border_width=1, border_color=Theme.BORDER)
        file_box.pack(fill="x", pady=(0, 10))

        fb_inner = ctk.CTkFrame(file_box, fg_color="transparent")
        fb_inner.pack(fill="x", padx=12, pady=10)

        self.lbl_file_status = ctk.CTkLabel(
            fb_inner,
            text="Ningún archivo seleccionado. Formatos admitidos: .xlsx, .xls, .docx, .doc, .csv, .txt",
            font=ctk.CTkFont(size=11),
            text_color=Theme.TEXT_SECONDARY
        )
        self.lbl_file_status.pack(side="left")

        btn_box = ctk.CTkFrame(fb_inner, fg_color="transparent")
        btn_box.pack(side="right")

        self.btn_clear = ctk.CTkButton(
            btn_box,
            text="Descartar / Limpiar",
            command=self._clear_file,
            fg_color="#7f1d1d",
            hover_color="#991b1b",
            text_color="#fca5a5",
            font=ctk.CTkFont(size=11, weight="bold"),
            height=28,
            width=120,
            state="disabled"
        )
        self.btn_clear.pack(side="left", padx=(0, 6))

        btn_file = ctk.CTkButton(
            btn_box,
            text="Examinar Archivo...",
            command=self._choose_file,
            width=130,
            height=28,
            font=ctk.CTkFont(size=11, weight="bold")
        )
        btn_file.pack(side="left")

        # Botones de acción
        btn_row = ctk.CTkFrame(inner, fg_color="transparent")
        btn_row.pack(fill="x")

        self.btn_preview = ctk.CTkButton(
            btn_row,
            text="Previsualizar y Validar",
            command=self._run_preview,
            fg_color=Theme.GOLD_PRIMARY,
            text_color="#000000",
            hover_color=Theme.GOLD_HOVER,
            font=ctk.CTkFont(size=12, weight="bold"),
            height=32,
            state="disabled"
        )
        self.btn_preview.pack(side="left")

        self.btn_commit = ctk.CTkButton(
            btn_row,
            text="Confirmar e Importar a Base de Datos",
            command=self._run_commit,
            fg_color="#059669",
            hover_color="#047857",
            font=ctk.CTkFont(size=12, weight="bold"),
            height=32,
            state="disabled"
        )
        self.btn_commit.pack(side="right")

        # Resultados de validación
        self.res_frame = ctk.CTkFrame(self, fg_color=Theme.BG_CARD, corner_radius=10, border_width=1, border_color=Theme.BORDER)
        self.res_frame.pack(fill="both", expand=True, padx=16, pady=(4, 12))

        self.lbl_summary = ctk.CTkLabel(
            self.res_frame,
            text="Seleccione un archivo universal para iniciar la validación e importación.",
            font=ctk.CTkFont(size=12),
            text_color=Theme.TEXT_SECONDARY
        )
        self.lbl_summary.pack(anchor="w", padx=14, pady=10)

        self.scroll_preview = ctk.CTkScrollableFrame(self.res_frame, fg_color="transparent")
        self.scroll_preview.pack(fill="both", expand=True, padx=10, pady=(0, 10))

    def _set_explicit_mode(self, mode):
        self.explicit_mode = mode
        active_fg = Theme.GOLD_PRIMARY
        active_text = "#000000"
        inactive_fg = "transparent"
        inactive_text = Theme.TEXT_SECONDARY

        self.btn_mode_auto.configure(
            fg_color=active_fg if mode == "auto" else inactive_fg,
            text_color=active_text if mode == "auto" else inactive_text
        )
        self.btn_mode_pers.configure(
            fg_color=active_fg if mode == "personnel" else inactive_fg,
            text_color=active_text if mode == "personnel" else inactive_text
        )
        self.btn_mode_att.configure(
            fg_color=active_fg if mode == "attendance" else inactive_fg,
            text_color=active_text if mode == "attendance" else inactive_text
        )

        if self.loaded_file_info and "filepath" in self.loaded_file_info:
            self._process_file_path(self.loaded_file_info["filepath"])

    def _choose_file(self):
        f = filedialog.askopenfilename(filetypes=[
            ("Archivos Soportados", "*.xlsx;*.xls;*.docx;*.doc;*.csv;*.txt"),
            ("Planillas Excel", "*.xlsx;*.xls"),
            ("Documentos Word", "*.docx;*.doc"),
            ("Archivos de Texto", "*.csv;*.txt"),
            ("Todos los archivos", "*.*")
        ])
        if f:
            self._process_file_path(f)

    def _process_file_path(self, filepath):
        try:
            res = CsvImportServicePy.parse_universal_file(filepath, os.path.basename(filepath), self.explicit_mode)
            if not res["success"]:
                messagebox.showerror("Error", res["message"])
                return

            self.loaded_file_info = {
                "filepath": filepath,
                "filename": res["file_name"],
                "detected_type": res["detected_type"],
                "total_rows": res["total_rows"]
            }
            self.detected_mode = res["detected_type"]
            self.csv_text = res["csv_text"]

            type_name = "Planta Funcional" if self.detected_mode == "personnel" else "Asistencias"
            sheet_info = f" (Hoja: {res['sheet_name']})" if res.get("sheet_name") else ""
            status_text = f"Archivo: {res['file_name']} | Tipo: {type_name}{sheet_info} | {res['total_rows']} filas"
            self.lbl_file_status.configure(text=status_text, text_color=Theme.TEXT_PRIMARY)

            self.btn_clear.configure(state="normal")
            self.btn_preview.configure(state="normal")

            # Ejecutar preview automático
            self._run_preview()

        except Exception as e:
            messagebox.showerror("Error", f"No se pudo procesar el archivo: {str(e)}")

    def _clear_file(self):
        self.loaded_file_info = None
        self.csv_text = ""
        self.preview_data = None
        self.lbl_file_status.configure(
            text="Ningún archivo seleccionado. Formatos admitidos: .xlsx, .xls, .docx, .doc, .csv, .txt",
            text_color=Theme.TEXT_SECONDARY
        )
        self.btn_clear.configure(state="disabled")
        self.btn_preview.configure(state="disabled")
        self.btn_commit.configure(state="disabled")

        for w in self.scroll_preview.winfo_children():
            w.destroy()
        self.lbl_summary.configure(text="Archivo descartado. Puede cargar uno nuevo.")

    def _run_preview(self):
        if not self.csv_text:
            messagebox.showwarning("Atención", "Cargue un archivo antes de validar.")
            return

        target_mode = self.explicit_mode if self.explicit_mode != "auto" else self.detected_mode

        if target_mode == "personnel":
            res = CsvImportServicePy.preview_personnel(self.csv_text)
        else:
            res = CsvImportServicePy.preview_attendance(self.csv_text)

        if not res["success"]:
            messagebox.showerror("Error", res["message"])
            return

        self.preview_data = res
        self.lbl_summary.configure(
            text=f"Total filas: {res['total_rows']} | Válidos: {res['valid_rows']} | Con inconsistencias: {res['invalid_rows']}"
        )

        for w in self.scroll_preview.winfo_children():
            w.destroy()

        for item in res["preview"]:
            row = ctk.CTkFrame(self.scroll_preview, fg_color=Theme.BG_SURFACE, corner_radius=6, border_width=1, border_color=Theme.BORDER)
            row.pack(fill="x", pady=2)

            f_left = ctk.CTkFrame(row, fg_color="transparent")
            f_left.pack(side="left", padx=8, pady=6)

            st_color = "#065f46" if item["status"] == "VÁLIDO" else "#7f1d1d"
            st_text = "#34d399" if item["status"] == "VÁLIDO" else "#f87171"

            ctk.CTkLabel(f_left, text=f"L{item['line']}", font=ctk.CTkFont(size=10, weight="bold"), text_color=Theme.TEXT_SECONDARY).pack(side="left", padx=(0, 6))
            ctk.CTkLabel(f_left, text=item["status"], font=ctk.CTkFont(size=10, weight="bold"), fg_color=st_color, text_color=st_text, corner_radius=4, padx=6, pady=2).pack(side="left", padx=(0, 8))
            
            txt_desc = f"DNI {item['dni']} - {item.get('fullName') or item.get('teacherName')}"
            ctk.CTkLabel(f_left, text=txt_desc, font=ctk.CTkFont(size=11, weight="bold"), text_color=Theme.TEXT_PRIMARY).pack(side="left")

            err_text = item.get("errorMessages") or "OK"
            ctk.CTkLabel(row, text=err_text, font=ctk.CTkFont(size=10), text_color=Theme.TEXT_SECONDARY).pack(side="right", padx=10, pady=6)

        if res["valid_rows"] > 0:
            self.btn_commit.configure(state="normal")
        else:
            self.btn_commit.configure(state="disabled")

    def _run_commit(self):
        if not self.preview_data or self.preview_data["valid_rows"] == 0:
            return

        target_mode = self.explicit_mode if self.explicit_mode != "auto" else self.detected_mode
        if not messagebox.askyesno("Confirmar", f"¿Desea importar {self.preview_data['valid_rows']} registros válidos a la base de datos?"):
            return

        if target_mode == "personnel":
            res = CsvImportServicePy.import_personnel(self.csv_text)
        else:
            res = CsvImportServicePy.import_attendance(self.csv_text)

        if res["success"]:
            messagebox.showinfo("Éxito", res["message"])
            self._clear_file()
            self.lbl_summary.configure(text="Importación completada con éxito.")
        else:
            messagebox.showerror("Error", res["message"])
            messagebox.showwarning("Atención", "Pegue contenido CSV antes de validar.")
            return

        if self.mode == "personnel":
            res = CsvImportServicePy.preview_personnel(content)
        else:
            res = CsvImportServicePy.preview_attendance(content)

        if not res["success"]:
            messagebox.showerror("Error", res["message"])
            return

        self.preview_data = res
        self.lbl_summary.configure(
            text=f"Total filas: {res['total_rows']} | Válidos: {res['valid_rows']} | Con inconsistencias: {res['invalid_rows']}"
        )

        for w in self.scroll_preview.winfo_children():
            w.destroy()

        for item in res["preview"]:
            row = ctk.CTkFrame(self.scroll_preview, fg_color=Theme.BG_SURFACE, corner_radius=6, border_width=1, border_color=Theme.BORDER)
            row.pack(fill="x", pady=2)

            f_left = ctk.CTkFrame(row, fg_color="transparent")
            f_left.pack(side="left", padx=8, pady=6)

            st_color = "#065f46" if item["status"] == "VÁLIDO" else "#7f1d1d"
            st_text = "#34d399" if item["status"] == "VÁLIDO" else "#f87171"

            ctk.CTkLabel(f_left, text=f"L{item['line']}", font=ctk.CTkFont(size=10, weight="bold"), text_color=Theme.TEXT_SECONDARY).pack(side="left", padx=(0, 6))
            ctk.CTkLabel(f_left, text=item["status"], font=ctk.CTkFont(size=10, weight="bold"), fg_color=st_color, text_color=st_text, corner_radius=4, padx=6, pady=2).pack(side="left", padx=(0, 8))
            
            txt_desc = f"DNI {item['dni']} - {item.get('fullName') or item.get('teacherName')}"
            ctk.CTkLabel(f_left, text=txt_desc, font=ctk.CTkFont(size=11, weight="bold"), text_color=Theme.TEXT_PRIMARY).pack(side="left")

            err_text = item.get("errorMessages") or "OK"
            ctk.CTkLabel(row, text=err_text, font=ctk.CTkFont(size=10), text_color=Theme.TEXT_SECONDARY).pack(side="right", padx=10, pady=6)

        if res["valid_rows"] > 0:
            self.btn_commit.configure(state="normal")
        else:
            self.btn_commit.configure(state="disabled")

    def _run_commit(self):
        if not self.preview_data or self.preview_data["valid_rows"] == 0:
            return

        content = self.txt_csv.get("1.0", "end").strip()
        if not messagebox.askyesno("Confirmar", f"¿Desea importar {self.preview_data['valid_rows']} registros válidos a la base de datos?"):
            return

        if self.mode == "personnel":
            res = CsvImportServicePy.import_personnel(content)
        else:
            res = CsvImportServicePy.import_attendance(content)

        if res["success"]:
            messagebox.showinfo("Éxito", res["message"])
            self.txt_csv.delete("1.0", "end")
            self.preview_data = None
            self.btn_commit.configure(state="disabled")
            for w in self.scroll_preview.winfo_children():
                w.destroy()
            self.lbl_summary.configure(text="Importación completada con éxito.")
        else:
            messagebox.showerror("Error", res["message"])
