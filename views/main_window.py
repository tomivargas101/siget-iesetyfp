"""
Módulo de compatibilidad y exportación de la ventana principal de SIGET.
Reenvía a main_dashboard.MainDashboardWindow manteniendo compatibilidad.
"""
from main_dashboard import MainDashboardWindow, MainWindow

__all__ = ["MainDashboardWindow", "MainWindow"]
