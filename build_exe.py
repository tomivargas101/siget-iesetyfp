"""
Script automatizado de compilación y empaquetado para SIGET.
Genera el ejecutable (.exe) institucional standalone con el icono oficial y todos sus activos.

Uso:
    python build_exe.py
"""

import sys
import os
import subprocess

def build():
    print("=" * 60)
    print("Iniciando empaquetado corporativo de SIGET con PyInstaller...")
    print("=" * 60)

    # Verificar existencia de archivos clave
    if not os.path.exists("assets/icon.ico"):
        print("[ERROR] No se encontró 'assets/icon.ico'.")
        sys.exit(1)

    cmd = [
        sys.executable,
        "-m", "PyInstaller",
        "--noconfirm",
        "siget.spec"
    ]

    print(f"Ejecutando: {' '.join(cmd)}")
    result = subprocess.run(cmd)

    if result.returncode == 0:
        print("\n" + "=" * 60)
        print("¡Compilación finalizada con éxito!")
        print("El ejecutable oficial se encuentra en: dist/SIGET.exe")
        print("=" * 60)
    else:
        print(f"\n[ERROR] El proceso de compilación falló con código {result.returncode}")

if __name__ == "__main__":
    build()
