import sys
import os
from pathlib import Path

# Asegurar que el directorio raíz de la aplicación esté en sys.path
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
    """
    Controlador principal del ciclo de vida y navegación de SIGET.
    Gestiona el flujo continuo y fluido entre la autenticación institucional y el Dashboard principal.
    Asegura inicio por defecto en Modo Claro e integración del icono oficial de la aplicación.
    """
    def __init__(self):
        # 1. Configuración estética institucional: Modo Claro por defecto
        ctk.set_appearance_mode("Light")
        ctk.set_default_color_theme("blue")

        self.current_window = None

        # 2. Inicialización de Base de Datos y Semillas
        self._initialize_database()

    def _initialize_database(self):
        try:
            cfg = load_config()
            init_db(cfg)
        except Exception as e:
            print(f"[SIGET] Advertencia al inicializar base de datos: {e}")

    def start(self):
        """
        Ciclo de vida principal continuo y fluido:
        1. Presenta la ventana de acceso (LoginWindow) con icono oficial y tema claro.
        2. Al autenticar (o usar botón de prueba Rector / Bedel), la ventana de Login se destruye
           y da paso al Dashboard Principal correspondiente sin cerrar la aplicación.
        3. Si se solicita 'Cerrar Sesión', el Dashboard se destruye y vuelve al Login.
        4. Si el usuario cierra con la 'X', la aplicación termina limpiamente.
        """
        while True:
            # 1. Ventana de Login
            login_win = LoginWindow()
            apply_window_icon(login_win)
            self.current_window = login_win
            login_win.mainloop()

            # Verificar si hubo autenticación exitosa
            user = login_win.authenticated_user
            if not user:
                # El usuario cerró la ventana de login sin ingresar
                break

            # 2. Ventana del Dashboard Principal (main_dashboard.py)
            dashboard_win = MainDashboardWindow(user=user)
            apply_window_icon(dashboard_win)
            self.current_window = dashboard_win
            dashboard_win.mainloop()

            # Si no solicitó cerrar sesión (cerró con la X), salir del bucle
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
