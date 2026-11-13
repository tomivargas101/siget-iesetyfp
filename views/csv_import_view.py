"""
Vista de Carga Masiva por Archivos CSV para SIGET (CustomTkinter)
Permite la importación de personal ("Datos del personal") y asistencias ("Asistencia").
"""

import customtkinter as ctk
from tkinter import filedialog, messagebox
from views.theme import Theme
from models.csv_import import CsvImportServicePy

class CsvImportView(ctk.CTkFrame):
    def __init__(self, master, **kwargs):
        super().__init__(master, fg_color="transparent", **kwargs)
        self.mode = "personnel"
        self.preview_data = None
        self._build_ui()

    def _build_ui(self):
        card = ctk.CTkFrame(self, fg_color=Theme.BG_CARD, corner_radius=10, border_width=1, border_color=Theme.BORDER)
        card.pack(fill="x", padx=16, pady=(12, 8))

        inner = ctk.CTkFrame(card, fg_color="transparent")
        inner.pack(fill="x", padx=16, pady=14)

        ctk.CTkLabel(
            inner,
            text="Módulo de Importación Masiva por Archivos CSV",
            font=ctk.CTkFont(size=15, weight="bold"),
            text_color=Theme.TEXT_PRIMARY
        ).pack(anchor="w")

        ctk.CTkLabel(
            inner,
            text="Cargue masivamente la planta funcional o registros de asistencia garantizando validaciones de negocio.",
            font=ctk.CTkFont(size=11),
            text_color=Theme.TEXT_SECONDARY
        ).pack(anchor="w", pady=(2, 10))

        # Pestañas de modo
        tab_row = ctk.CTkFrame(inner, fg_color="transparent")
        tab_row.pack(fill="x", pady=(0, 10))

        self.btn_tab_pers = ctk.CTkButton(
            tab_row,
            text="Planta Funcional (Datos del personal)",
            command=lambda: self._set_mode("personnel"),
            fg_color=Theme.GOLD_PRIMARY,
            text_color="#000000",
            font=ctk.CTkFont(size=11, weight="bold"),
            height=28
        )
        self.btn_tab_pers.pack(side="left", padx=(0, 8))

        self.btn_tab_att = ctk.CTkButton(
            tab_row,
            text="Asistencias y Novedades",
            command=lambda: self._set_mode("attendance"),
            fg_color=Theme.BG_SURFACE,
            text_color=Theme.TEXT_PRIMARY,
            font=ctk.CTkFont(size=11, weight="bold"),
            height=28
        )
        self.btn_tab_att.pack(side="left")

        # Archivo y texto
        act_row = ctk.CTkFrame(inner, fg_color="transparent")
        act_row.pack(fill="x", pady=4)

        ctk.CTkLabel(act_row, text="Pegue el contenido CSV o examine un archivo:", font=ctk.CTkFont(size=11, weight="bold"), text_color=Theme.TEXT_SECONDARY).pack(side="left")

        btn_file = ctk.CTkButton(
            act_row,
            text="Examinar Archivo...",
            command=self._choose_file,
            width=130,
            height=26,
            font=ctk.CTkFont(size=11)
        )
        btn_file.pack(side="right")

        self.txt_csv = ctk.CTkTextbox(inner, height=120, font=ctk.CTkFont(family="Consolas", size=11))
        self.txt_csv.pack(fill="x", pady=(4, 10))

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
            height=32
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
            text="Pegue registros CSV y presione Previsualizar y Validar.",
            font=ctk.CTkFont(size=12),
            text_color=Theme.TEXT_SECONDARY
        )
        self.lbl_summary.pack(anchor="w", padx=14, pady=10)

        self.scroll_preview = ctk.CTkScrollableFrame(self.res_frame, fg_color="transparent")
        self.scroll_preview.pack(fill="both", expand=True, padx=10, pady=(0, 10))

    def _set_mode(self, mode):
        self.mode = mode
        if mode == "personnel":
            self.btn_tab_pers.configure(fg_color=Theme.GOLD_PRIMARY, text_color="#000000")
            self.btn_tab_att.configure(fg_color=Theme.BG_SURFACE, text_color=Theme.TEXT_PRIMARY)
        else:
            self.btn_tab_pers.configure(fg_color=Theme.BG_SURFACE, text_color=Theme.TEXT_PRIMARY)
            self.btn_tab_att.configure(fg_color=Theme.GOLD_PRIMARY, text_color="#000000")
        self.preview_data = None
        self.btn_commit.configure(state="disabled")

    def _choose_file(self):
        f = filedialog.askopenfilename(filetypes=[("Archivos CSV", "*.csv;*.txt"), ("Todos los archivos", "*.*")])
        if f:
            try:
                with open(f, "r", encoding="utf-8") as fp:
                    content = fp.read()
                self.txt_csv.delete("1.0", "end")
                self.txt_csv.insert("1.0", content)
            except Exception as e:
                messagebox.showerror("Error", f"No se pudo leer el archivo: {str(e)}")

    def _run_preview(self):
        content = self.txt_csv.get("1.0", "end").strip()
        if not content:
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
