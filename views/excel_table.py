"""
Componente de Tabla Profesional Estilo Planilla Excel para CustomTkinter (SIGET).

Características principales:
- Desplazamiento bidireccional fluido: Barras de desplazamiento vertical y horizontal (CTkScrollbar).
- Responsive con Pesos Proporcionales (grid weights) y Ancho Mínimo de Seguridad (min_width):
  En pantallas grandes se expande al 100% sin dejar huecos; en pantallas compactas habilita
  scroll horizontal garantizando que NINGUNA columna o texto se corte o quede oculto.
- Estética Excel Institucional:
  * Encabezados contrastados en Azul Pizarra/Carbón corporativo (#1E3A5F / #1A2536).
  * Tipografía nítida en blanco de alto contraste.
  * Filas alternadas (Zebra striping) con divisores sutiles de celda.
  * Micro-interacción de hover sutil sobre las filas.
  * Compatibilidad total con Modo Claro y Modo Oscuro institucional.
- Soporte de scroll con la rueda del ratón (MouseWheel vertical y Shift+MouseWheel horizontal).
"""

import tkinter as tk
import customtkinter as ctk
from views.theme import Theme

class ExcelTableFrame(ctk.CTkFrame):
    def __init__(self, parent, min_width=1150, **kwargs):
        super().__init__(parent, fg_color="transparent", **kwargs)
        self.min_width = min_width
        self.column_configs = []
        self.row_widgets = []
        self.header_frame = None

        # Configuración del Grid del contenedor principal
        self.grid_rowconfigure(0, weight=1)
        self.grid_columnconfigure(0, weight=1)

        # Canvas para scroll bidireccional
        self.canvas = tk.Canvas(self, highlightthickness=0, bd=0)
        self.canvas.grid(row=0, column=0, sticky="nsew")

        # Barras de scroll CustomTkinter (Vertical y Horizontal)
        self.v_scrollbar = ctk.CTkScrollbar(
            self,
            orientation="vertical",
            command=self.canvas.yview,
            fg_color="transparent"
        )
        self.v_scrollbar.grid(row=0, column=1, sticky="ns", padx=(2, 0))

        self.h_scrollbar = ctk.CTkScrollbar(
            self,
            orientation="horizontal",
            command=self.canvas.xview,
            fg_color="transparent"
        )
        self.h_scrollbar.grid(row=1, column=0, sticky="ew", pady=(2, 0))

        self.canvas.configure(
            xscrollcommand=self.h_scrollbar.set,
            yscrollcommand=self.v_scrollbar.set
        )

        # Frame contenedor interno dentro del Canvas
        self.inner_frame = ctk.CTkFrame(self.canvas, fg_color="transparent", corner_radius=0)
        self.canvas_window = self.canvas.create_window((0, 0), window=self.inner_frame, anchor="nw")

        # Vinculación de eventos de redimensionamiento
        self.inner_frame.bind("<Configure>", self._on_inner_configure)
        self.canvas.bind("<Configure>", self._on_canvas_configure)

        # Soporte de MouseWheel en el canvas y el inner frame
        self.bind_scroll(self.canvas)
        self.bind_scroll(self.inner_frame)

        self._update_theme_colors()

    def _on_canvas_configure(self, event):
        """Ajusta el ancho del canvas_window asegurando respetar el ancho mínimo y expandir al 100%."""
        canvas_w = event.width
        target_w = max(canvas_w, self.min_width)
        self.canvas.itemconfig(self.canvas_window, width=target_w)
        self._update_theme_colors()

    def _on_inner_configure(self, event=None):
        """Actualiza la región de scroll con el bounding box total del contenido."""
        self.canvas.configure(scrollregion=self.canvas.bbox("all"))

    def _update_theme_colors(self):
        """Adapta el color de fondo del Canvas nativo al tema activo (Claro u Oscuro)."""
        mode = ctk.get_appearance_mode()
        bg_color = Theme.BG_WINDOW[1] if mode == "Dark" else Theme.BG_WINDOW[0]
        self.canvas.configure(bg=bg_color)

    def bind_scroll(self, widget):
        """Vincula recursivamente el scroll del ratón vertical y horizontal al widget dado."""
        widget.bind("<MouseWheel>", self._on_mousewheel, add="+")
        widget.bind("<Shift-MouseWheel>", self._on_shift_mousewheel, add="+")

    def _on_mousewheel(self, event):
        if self.canvas.winfo_exists():
            # En Windows cada muesca es delta 120
            self.canvas.yview_scroll(int(-1 * (event.delta / 120)), "units")

    def _on_shift_mousewheel(self, event):
        if self.canvas.winfo_exists():
            self.canvas.xview_scroll(int(-1 * (event.delta / 120)), "units")

    def set_columns(self, column_configs):
        """
        Define la estructura de columnas de la tabla.
        column_configs: lista de tuplas (título, weight, min_width) o dicts con esas claves.
        """
        self.column_configs = []
        for col in column_configs:
            if isinstance(col, (list, tuple)):
                title = col[0]
                weight = col[1] if len(col) > 1 else 1
                min_w = col[2] if len(col) > 2 else 100
                anchor = col[3] if len(col) > 3 else "w"
            else:
                title = col.get("title", "")
                weight = col.get("weight", 1)
                min_w = col.get("min_width", 100)
                anchor = col.get("anchor", "w")
            self.column_configs.append({
                "title": title,
                "weight": weight,
                "min_width": min_w,
                "anchor": anchor
            })

    def render_header(self):
        """Construye y visualiza la cabecera institucional estilo Excel."""
        if self.header_frame:
            self.header_frame.destroy()

        self.header_frame = ctk.CTkFrame(
            self.inner_frame,
            fg_color=Theme.EXCEL_HEADER_BG,
            height=42,
            corner_radius=6,
            border_width=1,
            border_color=Theme.EXCEL_BORDER
        )
        self.header_frame.pack(fill="x", padx=4, pady=(2, 6))

        for idx, col in enumerate(self.column_configs):
            self.header_frame.grid_columnconfigure(
                idx,
                weight=col["weight"],
                minsize=col["min_width"]
            )

            cell = ctk.CTkFrame(self.header_frame, fg_color="transparent")
            cell.grid(row=0, column=idx, sticky="nsew", padx=(10, 6), pady=8)

            lbl = ctk.CTkLabel(
                cell,
                text=col["title"].upper(),
                font=ctk.CTkFont(family="Segoe UI", size=11, weight="bold"),
                text_color=Theme.EXCEL_HEADER_TEXT,
                anchor=col["anchor"]
            )
            lbl.pack(side="left", fill="both", expand=True)

            # Divisor vertical institucional sutil excepto en la última columna
            if idx < len(self.column_configs) - 1:
                divider = ctk.CTkFrame(
                    self.header_frame,
                    width=1,
                    fg_color=Theme.EXCEL_HEADER_DIVIDER
                )
                divider.grid(row=0, column=idx, sticky="nse", padx=(0, 0), pady=6)

            self.bind_scroll(cell)
            self.bind_scroll(lbl)

        self.bind_scroll(self.header_frame)

    def create_row(self, row_idx):
        """
        Crea un frame de fila con estilos de Excel profesional:
        - Zebra striping (filas pares e impares)
        - Bordes sutiles de celda
        - Efecto hover interactivo
        - Mismos pesos de columnas que la cabecera
        """
        is_even = (row_idx % 2 == 0)
        bg_color = Theme.EXCEL_ROW_EVEN if is_even else Theme.EXCEL_ROW_ODD

        row_frame = ctk.CTkFrame(
            self.inner_frame,
            fg_color=bg_color,
            corner_radius=4,
            border_width=1,
            border_color=Theme.EXCEL_BORDER
        )
        row_frame.pack(fill="x", padx=4, pady=2)

        # Configurar las columnas con pesos idénticos a la cabecera
        for idx, col in enumerate(self.column_configs):
            row_frame.grid_columnconfigure(
                idx,
                weight=col["weight"],
                minsize=col["min_width"]
            )

        # Efecto hover interactivo
        def _on_enter(e):
            try:
                row_frame.configure(fg_color=Theme.EXCEL_ROW_HOVER)
            except Exception:
                pass

        def _on_leave(e):
            try:
                row_frame.configure(fg_color=bg_color)
            except Exception:
                pass

        row_frame.bind("<Enter>", _on_enter, add="+")
        row_frame.bind("<Leave>", _on_leave, add="+")
        self.bind_scroll(row_frame)

        self.row_widgets.append(row_frame)
        return row_frame

    def add_cell(self, row_frame, col_idx, widget=None, padx=(10, 6), pady=8, sticky="nsew"):
        """Inserta o posiciona un contenedor/widget en la columna correspondiente de la fila."""
        container = ctk.CTkFrame(row_frame, fg_color="transparent")
        container.grid(row=0, column=col_idx, sticky=sticky, padx=padx, pady=pady)
        self.bind_scroll(container)

        if widget:
            widget.pack(in_=container, fill="both", expand=True)
            self.bind_scroll(widget)
        return container

    def show_empty_message(self, message):
        """Muestra un mensaje claro y centrado cuando la tabla no contiene filas."""
        empty_box = ctk.CTkFrame(
            self.inner_frame,
            fg_color=Theme.BG_CARD,
            corner_radius=8,
            border_width=1,
            border_color=Theme.BORDER_CARD
        )
        empty_box.pack(fill="x", padx=4, pady=30)
        lbl = ctk.CTkLabel(
            empty_box,
            text=message,
            font=ctk.CTkFont(size=13),
            text_color=Theme.TEXT_MUTED
        )
        lbl.pack(pady=35)
        self.bind_scroll(empty_box)
        self.bind_scroll(lbl)
        self.row_widgets.append(empty_box)

    def clear_rows(self):
        """Elimina únicamente las filas de datos y conserva la cabecera."""
        for w in self.row_widgets:
            try:
                w.destroy()
            except Exception:
                pass
        self.row_widgets.clear()
        self.canvas.yview_moveto(0)
        self.canvas.xview_moveto(0)

    def clear_all(self):
        """Elimina todos los widgets dentro del inner_frame (cabecera y filas)."""
        self.clear_rows()
        if self.header_frame:
            try:
                self.header_frame.destroy()
            except Exception:
                pass
            self.header_frame = None
        for child in self.inner_frame.winfo_children():
            try:
                child.destroy()
            except Exception:
                pass
