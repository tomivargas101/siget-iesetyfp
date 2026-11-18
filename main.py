import sys
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

import customtkinter as ctk
from database.config import load_config
from database.connection import init_db
from views.theme import Theme, apply_window_icon
from views.login_view import LoginWindow
from main_dashboard import MainDashboardWindow, MainWindow

class ApplicationController:
    def __init__(self):
        ctk.set_appearance_mode("Dark")
        ctk.set_default_color_theme("blue")

        self.current_window = None

        self._initialize_database()

    def _initialize_database(self):
        try:
            cfg = load_config()
            init_db(cfg)
        except Exception as e:
            print(f"[SIGET] Advertencia al inicializar base de datos: {e}")

    def start(self):
        while True:
            login_win = LoginWindow()
            apply_window_icon(login_win)
            self.current_window = login_win
            login_win.mainloop()

            user = login_win.authenticated_user
            if not user:
                break

            dashboard_win = MainDashboardWindow(user=user)
            apply_window_icon(dashboard_win)
            self.current_window = dashboard_win
            dashboard_win.mainloop()

            if not getattr(dashboard_win, "logout_requested", False):
                break

    def show_login(self):
        self.start()

    def show_main_dashboard(self, user=None):
        if self.current_window:
            try:
                self.current_window.destroy()
            except Exception:
                pass
        self.current_window = MainDashboardWindow(user=user)
        apply_window_icon(self.current_window)
        self.current_window.mainloop()

def main():
    app = ApplicationController()
    app.start()

if __name__ == "__main__":
    main()
