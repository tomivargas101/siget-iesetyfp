import os
import json
from pathlib import Path

CONFIG_FILE = Path(__file__).resolve().parent.parent / "config.json"

DEFAULT_CONFIG = {
    "db_type": "sqlite",  # 'sqlite', 'mysql', 'postgresql'
    "sqlite_path": "siget.db",
    "host": "localhost",
    "port": 3306,
    "database": "siget_db",
    "user": "root",
    "password": "",
    "connect_timeout": 5,      # Timeout en segundos para conexiones en red LAN
    "pool_size": 10,           # Conexiones simultáneas en pool
    "max_overflow": 20,        # Conexiones adicionales permitidas ante picos de concurrencia
    "pool_recycle": 1800,      # Reciclado de conexiones cada 30 min (evita desconexiones por inactividad)
    "sqlite_timeout": 30,      # Timeout para evitar bloqueos en SQLite ante escrituras concurrentes
    "max_weekly_hours_default": 30
}


def load_config() -> dict:
    if not CONFIG_FILE.exists():
        save_config(DEFAULT_CONFIG)
        return DEFAULT_CONFIG.copy()
    try:
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            merged = DEFAULT_CONFIG.copy()
            merged.update(data)
            return merged
    except Exception:
        return DEFAULT_CONFIG.copy()

def save_config(cfg: dict):
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=4)
