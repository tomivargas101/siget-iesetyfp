
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

        self.grid_rowconfigure(0, weight=1)
        self.grid_columnconfigure(0, weight=1)

        self.canvas = tk.Canvas(self, highlightthickness=0, bd=0)
        self.canvas.grid(row=0, column=0, sticky="nsew")

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

        self.inner_frame = ctk.CTkFrame(self.canvas, fg_color="transparent", corner_radius=0)
        self.canvas_window = self.canvas.create_window((0, 0), window=self.inner_frame, anchor="nw")

        self.inner_frame.bind("<Configure>", self._on_inner_configure)
        self.canvas.bind("<Configure>", self._on_canvas_configure)

        self.bind_scroll(self.canvas)
        self.bind_scroll(self.inner_frame)

        self._update_theme_colors()

    def _on_canvas_configure(self, event):
        canvas_w = event.width
        target_w = max(canvas_w, self.min_width)
        self.canvas.itemconfig(self.canvas_window, width=target_w)
        self._update_theme_colors()

    def _on_inner_configure(self, event=None):
        self.canvas.configure(scrollregion=self.canvas.bbox("all"))

    def _update_theme_colors(self):
        mode = ctk.get_appearance_mode()
        bg_color = Theme.BG_WINDOW[1] if mode == "Dark" else Theme.BG_WINDOW[0]
        self.canvas.configure(bg=bg_color)

    def bind_scroll(self, widget):
        widget.bind("<MouseWheel>", self._on_mousewheel, add="+")
        widget.bind("<Shift-MouseWheel>", self._on_shift_mousewheel, add="+")

    def _on_mousewheel(self, event):
        if self.canvas.winfo_exists():
            self.canvas.yview_scroll(int(-1 * (event.delta / 120)), "units")

    def _on_shift_mousewheel(self, event):
        if self.canvas.winfo_exists():
            self.canvas.xview_scroll(int(-1 * (event.delta / 120)), "units")

    def set_columns(self, column_configs):
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

        for idx, col in enumerate(self.column_configs):
            row_frame.grid_columnconfigure(
                idx,
                weight=col["weight"],
                minsize=col["min_width"]
            )

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
        container = ctk.CTkFrame(row_frame, fg_color="transparent")
        container.grid(row=0, column=col_idx, sticky=sticky, padx=padx, pady=pady)
        self.bind_scroll(container)

        if widget:
            widget.pack(in_=container, fill="both", expand=True)
            self.bind_scroll(widget)
        return container

    def show_empty_message(self, message):
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
        for w in self.row_widgets:
            try:
                w.destroy()
            except Exception:
                pass
        self.row_widgets.clear()
        self.canvas.yview_moveto(0)
        self.canvas.xview_moveto(0)

    def clear_all(self):
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
