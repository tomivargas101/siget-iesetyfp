# SIGET - Sistema Integral de Gestión Educativa Terciaria
### Instituto de Educación Superior de Educación Técnica y Formación Profesional (IESETyFP)

[![Python Version](https://img.shields.io/badge/Python-3.10%20%7C%203.11%20%7C%203.12%20%7C%203.13-blue.svg)](https://www.python.org/)
[![GUI](https://img.shields.io/badge/GUI-CustomTkinter%20v5%2B-blueviolet.svg)](https://github.com/TomSchimansky/CustomTkinter)
[![ORM](https://img.shields.io/badge/ORM-SQLAlchemy%202.0%2B-red.svg)](https://www.sqlalchemy.org/)
[![Database](https://img.shields.io/badge/Database-SQLite%20%7C%20MySQL%20LAN-orange.svg)](https://www.mysql.com/)
[![Security](https://img.shields.io/badge/Security-bcrypt%20Hashes-success.svg)](https://pypi.org/project/bcrypt/)

**SIGET** es una aplicación de escritorio corporativa y de misión crítica desarrollada para la administración académica, funcional y operativa de institutos de educación superior técnica. Diseñada bajo una arquitectura cliente ligera y desacoplada (**Python + CustomTkinter**), centraliza el control de planta funcional, designaciones de cátedras, cobertura formal de suplencias, control de asistencia diaria docente y matrícula estudiantil bajo estrictas normativas institucionales.

---

## 📋 Guía Rápida de Instalación y Prueba (Para la Cátedra)

Esta sección permite poner en marcha y evaluar el sistema en **menos de 3 minutos** en cualquier puesto de trabajo con Windows, Linux o macOS.

### Paso 1: Clonar el Repositorio
```bash
git clone https://github.com/tomivargas101/siget-iesetyfp.git
cd siget-iesetyfp
```
*(o ubicarse en la carpeta raíz del proyecto `siget` descargada).*

---

### Paso 2: Crear y Activar el Entorno Virtual (`.venv`)
Se recomienda usar Python 3.10 o superior:

* **En Windows (PowerShell):**
  ```powershell
  python -m venv .venv
  .venv\Scripts\Activate.ps1
  ```
  *(Si PowerShell restringe la ejecución de scripts, ejecutar previamente: `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`)*

* **En Windows (Símbolo del sistema / CMD):**
  ```cmd
  python -m venv .venv
  .venv\Scripts\activate.bat
  ```

* **En Linux / macOS:**
  ```bash
  python3 -m venv .venv
  source .venv/bin/activate
  ```

---

### Paso 3: Instalar Dependencias del Proyecto
Con el entorno virtual activado, actualizar pip e instalar los paquetes requeridos:
```bash
pip install --upgrade pip
pip install -r requirements.txt
```

---

### Paso 4: Configuración de Base de Datos (`config.json`)
SIGET incluye soporte nativo tanto para trabajo autónomo fuera de línea (SQLite) como para despliegue distribuido multi-usuario en Red de Área Local (LAN).

El archivo `config.json` se encuentra en la raíz del proyecto. Elige una de las siguientes opciones:

#### Opción A: Evaluación Rápida Local con SQLite (Por Defecto - Sin Servidores Adicionales)
No requiere instalar ningún servicio de base de datos. La base de datos `siget.db` se inicializa y crea automáticamente:
```json
{
    "db_type": "sqlite",
    "sqlite_path": "siget.db",
    "max_weekly_hours_default": 30
}
```

#### Opción B: Conexión en Red LAN a Servidor Central (MySQL / MariaDB)
Si la cátedra cuenta con un servidor central de base de datos en la red local (ej. XAMPP, MariaDB Server o MySQL Server), configura la IP del servidor en el campo `host`:
```json
{
    "db_type": "mysql",
    "host": "192.168.1.100",
    "port": 3306,
    "database": "siget_db",
    "user": "siget_user",
    "password": "tu_password_seguro",
    "connect_timeout": 5,
    "pool_size": 10,
    "max_overflow": 20,
    "pool_recycle": 1800,
    "max_weekly_hours_default": 30
}
```

> [!TIP]
> **Configuración visual sin editar código ni archivos:** También puedes abrir la aplicación y hacer clic en el botón **⚙️ Base de Datos** ubicado en la esquina superior de la pantalla de inicio (*Login*). Desde allí podrás cambiar de motor, ingresar la IP del servidor LAN y probar la conexión con verificación de ping en tiempo real.

---

### Paso 5: Ejecutar el Sistema
```bash
python main.py
```

---

### Paso 6: Credenciales de Acceso de Demostración
Al iniciar, SIGET verifica la base de datos y genera automáticamente las tablas, carreras, materias y los usuarios iniciales con contraseñas seguras hasheadas con `bcrypt`:

| Rol Institucional | Usuario | Contraseña | Alcance y Módulos Habilitados |
| :--- | :--- | :--- | :--- |
| **Rectoría** | `rector` | `rector123` | **Acceso Total:** Planta docente, designaciones, auditoría integral (`audit_logs`) y configuración. |
| **Secretaría** | `secretaria` | `secretaria123` | **Académica y Matrícula:** Legajos docentes y alumnos (Formulario N° 1), emisión de reportes Excel. |
| **Bedelía** | `bedel` | `bedel123` | **Gestión Diaria:** Carga de partes diarios de asistencia, licencias (DL-01 / DL-02) e inasistencias. |

> [!NOTE]
> En la pantalla de login dispones además de botones de acceso rápido de prueba (`Rector` / `Bedel`) para agilizar la navegación durante las evaluaciones.

---

## 🛠️ Stack Tecnológico y Arquitectura

```
                  ┌────────────────────────────────────────┐
                  │          SIGET CLIENTE GUI             │
                  │   CustomTkinter + Responsive Canvas    │
                  └──────────────────┬─────────────────────┘
                                     │
                                     ▼
                  ┌────────────────────────────────────────┐
                  │       CONTROLADOR DE APLICACIÓN        │
                  │    ApplicationController (main.py)     │
                  └──────────────────┬─────────────────────┘
                                     │
           ┌─────────────────────────┴─────────────────────────┐
           ▼                                                   ▼
┌──────────────────────┐                           ┌──────────────────────┐
│  SERVICIOS DOMINIO   │                           │     VALIDACIONES     │
│ Auth, Attendance,    │                           │ Topes de Cátedra,    │
│ Reports, Designation │                           │ Solapamiento Horario │
└──────────┬───────────┘                           └──────────┬───────────┘
           │                                                   │
           └─────────────────────────┬─────────────────────────┘
                                     │
                                     ▼
                  ┌────────────────────────────────────────┐
                  │       CAPA DE PERSISTENCIA ORM         │
                  │     SQLAlchemy 2.0+ (Scoped Session)   │
                  └──────────────────┬─────────────────────┘
                                     │
                    ┌────────────────┴────────────────┐
                    ▼                                 ▼
         ┌─────────────────────┐           ┌─────────────────────┐
         │    SQLite Local     │           │   Servidor LAN      │
         │  (Embebido/Offline) │           │  (MySQL / MariaDB)  │
         └─────────────────────┘           └─────────────────────┘
```

* **Lenguaje:** **Python 3.10+** (implementación pura de reglas de negocio, modelos de datos relacionales y servicios de presentación).
* **Capa de Presentación (GUI):** **CustomTkinter (>=5.2.0)** con tematización institucional, modo claro por defecto (*Light Mode*), layouts adaptativos y tablas estilizadas.
* **Capa de Persistencia y ORM:** **SQLAlchemy (>=2.0.0)** agnóstico al motor:
  * **Modo SQLite (Embebido):** Con `PRAGMA journal_mode=WAL` y `busy_timeout` para evitar bloqueos concurrentes.
  * **Modo Red LAN (MySQL / MariaDB vía PyMySQL):** Conexiones administradas mediante *Connection Pooling* (`QueuePool`), reconexión ante caídas temporales de red y reciclado automático de sockets inactivos.
* **Seguridad y Criptografía:** **bcrypt (>=4.0.0)** con salado dinámico (*rounds=12*) para todas las credenciales y pistas de recuperación.
* **Generación de Reportes Oficiales:** **pandas (>=2.0.0)** y **openpyxl (>=3.1.0)** para emisión programática de planillas de asistencia y estadística mensual con formato oficial ministerial, autoajuste de columnas y colores institucionales.
* **Empaquetado:** **PyInstaller (>=6.0.0)** con especificación corporativa [`siget.spec`](file:///c:/Users/tomiv/.gemini/antigravity-ide/scratch/siget/siget.spec) y script [`build_exe.py`](file:///c:/Users/tomiv/.gemini/antigravity-ide/scratch/siget/build_exe.py).

---

## 🏛️ Reglas de Negocio Implementadas

El sistema valida de forma exhaustiva la normativa ministerial del nivel superior terciario:

1. **RN-01 (Identificación Unívoca):** El DNI se normaliza como clave alfanumérica unívoca de personas físicas, impidiendo registros duplicados.
2. **RN-02 (Designaciones por Cátedra):** Adjudicación formal de materias, cargo institucional, día de dictado, horario (`HH:MM`) y horas cátedra.
3. **RN-03 (Trazabilidad y Baja Lógica):** Eliminación lógica (`is_active = False`) en todas las entidades clave (docentes, alumnos, asistencias y designaciones) preservando el historial administrativo.
4. **RN-04 (Cuadro DL-01 - Salud y Licencias Médicas):** Clasificación estricta de licencias de salud (Art. 48, ART, atención familiar) en el cuadro ministerial correspondiente.
5. **RN-05 (Cuadro DL-02 - Otras Novedades):** Clasificación de inasistencias por causas particulares, mesas de examen, donación de sangre o motivos no médicos.
6. **RN-06 (Cómputo Diario Unificado):** Registro de inasistencia tipificado por jornada laboral única.
7. **RN-07 (Control de Tope Horario):** Rechazo preventivo de designaciones que superen el tope reglamentario (30 horas cátedra semanales por defecto).
8. **RN-08 (Incompatibilidad Horaria):** Algoritmo que detecta y bloquea superposiciones horarias de dictado en el mismo día para un mismo docente.

---

## 📁 Estructura del Proyecto

```text
siget/
├── main.py                     # Controlador del ciclo de vida y navegación de la app
├── main_dashboard.py           # Dashboard principal con panel lateral dinámico según rol
├── build_exe.py                # Script de compilación automática a ejecutable standalone
├── siget.spec                  # Especificación de recursos y empaquetado para PyInstaller
├── config.json                 # Configuración de base de datos (SQLite / MySQL LAN)
├── requirements.txt            # Dependencias oficiales de Python del proyecto
├── .gitignore                  # Reglas de exclusión en codificación UTF-8
├── test_siget.py               # Suite de pruebas de validaciones, base de datos y reportes
├── test_business_logic_dl.py   # Pruebas de reglas normativas DL-01/DL-02 y topes horarios
│
├── assets/                     # Identidad visual, logotipos e iconos (.ico, .png)
├── reportes/                   # Directorio de salida para planillas Excel generadas
│
├── database/                   # Capa de datos y persistencia
│   ├── config.py               # Gestor de configuración y lectura de config.json
│   ├── connection.py           # Engine SQLAlchemy, pooling LAN, migraciones y seeders
│   └── schema.py               # Modelos relacionales ORM (User, Teacher, Student, etc.)
│
├── models/                     # Servicios de lógica de negocio y normativas
│   ├── attendance.py           # Registro y novedades de asistencia
│   ├── attendance_processor.py # Agrupador de partes diarios para planillas
│   ├── auth.py                 # Autenticación, sesión y seguridad bcrypt
│   ├── designation.py          # Gestión de cátedras y suplencias
│   ├── normative.py            # Artículos estatutarios y tipificación ministerial
│   ├── reports.py              # Exportador a planillas Excel con openpyxl/pandas
│   ├── student.py              # Gestión de matrícula y legajos de alumnos
│   ├── teacher.py              # Gestión de legajos docentes
│   └── validation.py           # Algoritmos de topes horarios y prevención de solapamientos
│
└── views/                      # Capa de interfaz gráfica (CustomTkinter)
    ├── attendance_view.py      # Planilla de asistencia diaria y carga de novedades
    ├── dashboard_view.py       # Pantalla de bienvenida, métricas y accesos rápidos
    ├── designations_view.py    # Formulario de designación de cátedras y suplencias
    ├── excel_table.py          # Componente visual de tabla de datos interactiva
    ├── login_view.py           # Ventana de autenticación institucional y configuración de BD
    ├── main_window.py          # Ventana contenedora principal
    ├── register_view.py        # Alta institucional de nuevos usuarios
    ├── reports_view.py         # Generador de reportes mensuales en Excel
    ├── students_view.py        # Gestión de legajos de alumnos
    ├── teachers_view.py        # Gestión de legajos docentes
    └── theme.py                # Paleta de colores institucional y configuración de temas
```

---

## 🧪 Ejecución de Pruebas Automatizadas

Para verificar el correcto funcionamiento de la base de datos, autenticación, topes horarios y generación de reportes:

```bash
# Ejecutar suite principal de integración
python test_siget.py

# Ejecutar pruebas específicas de reglas de negocio normativas
python test_business_logic_dl.py
```

Ambas suites se ejecutan en consola y emiten un informe detallado indicando la conformidad de cada validación.

---

## 📦 Generación de Ejecutable para Windows (`.exe`)

Si se desea generar un instalador o ejecutable independiente para distribuir en PCs sin Python instalado:

```bash
python build_exe.py
```

El ejecutable resultante se ubicará en `dist/SIGET.exe`, incluyendo todos los componentes gráficos, librerías y recursos necesarios en un único archivo autónomo.

---

## 📄 Marco Institucional
Sistema desarrollado para el **IESETyFP** (*Instituto de Educación Superior de Educación Técnica y Formación Profesional*). Cumple con los lineamientos de acreditación académica y administrativa vigentes.
