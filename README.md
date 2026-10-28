# SIGET - Sistema Integral de Gestión Educativa Terciaria
### Instituto de Educación Superior de Educación Técnica y Formación Profesional (IESETyFP)

**SIGET** es una aplicación de escritorio corporativa y de misión crítica desarrollada para la administración académica, funcional y operativa de institutos de educación superior terciaria. Diseñada con una arquitectura robusta, modular y desacoplada, SIGET centraliza el control de planta funcional, designaciones de cátedras, cobertura de suplencias, seguimiento de asistencia docente y matrícula estudiantil bajo estrictas normativas institucionales.

---

## 🛠️ Stack Tecnológico Real

El sistema combina un núcleo de procesamiento en **Python** de alto rendimiento con tooling de soporte y verificación en **JavaScript / Node.js**:

* **Lenguajes y Entornos:**
  * **Python 3.10+**: Motor central del sistema, implementación de reglas de negocio, modelos de datos relacionales, servicios de validación y aplicación de escritorio.
  * **JavaScript / Node.js**: Entorno de tooling, scripts de soporte y suites de prueba automatizadas para integración continua (`test_backend.js`, `test_v2_features.js`).
* **Interfaz Gráfica de Usuario (GUI):**
  * **CustomTkinter (>=5.2.0)**: Biblioteca moderna de interfaz basada en widgets de alta fidelidad visual, con paleta institucional corporativa, componentes reactivos, transiciones limpias y soporte para personalización de temas (oscuro/claro).
* **Capa de Persistencia y Base de Datos:**
  * **SQLAlchemy (>=2.0.0)**: ORM relacional agnóstico y de alto rendimiento. Soporta sin fricción entornos distribuidos:
    * **SQLite**: Base de datos local embebida (`siget.db`) para despliegue inmediato o trabajo fuera de línea.
    * **MySQL / MariaDB**: Conexión a servidores departamentales mediante `PyMySQL`.
    * **PostgreSQL**: Despliegue en servidores institucionales mediante `psycopg2`.
* **Seguridad y Criptografía:**
  * **bcrypt (>=4.0.0)**: Algoritmo de salado y hasheo unidireccional de grado criptográfico (*cost factor 12*) para todas las credenciales de usuario, garantizando protección total frente a accesos no autorizados.
* **Procesamiento de Reportes Oficiales:**
  * **pandas (>=2.0.0)** & **openpyxl (>=3.1.0)**: Generación programática de planillas estadísticas y planillas de novedades en formato Microsoft Excel (`.xlsx`), incorporando estilizado corporativo, anchos de columna automáticos, formato cebra y fórmulas integradas.
* **Empaquetado y Distribución:**
  * **PyInstaller (>=6.0.0)** & script automatizado [`build_exe.py`](file:///c:/Users/tomiv/.gemini/antigravity-ide/scratch/siget/build_exe.py): Pipeline de empaquetado en un solo paso para compilar la aplicación en un ejecutable standalone para Windows (`dist/SIGET.exe`), incluyendo icono institucional y recursos estáticos.

---

## 👥 Roles Institucionales Autorizados

El sistema implementa un modelo estricto de Control de Acceso Basado en Roles (**RBAC**), restringido exclusivamente a las tres figuras institucionales oficiales del IESETyFP:

| Rol Oficial | Clave Interna | Alcance y Responsabilidades |
| :--- | :---: | :--- |
| **Rectoría** | `RECTOR` | **Acceso Total e Irrestricto:** Gestión de planta docente, definición y adjudicación de cátedras/cargos, auditoría histórica integral de operaciones (`audit_logs`), configuración de motores de base de datos y supervisión de novedades. |
| **Secretaría** | `SECRETARIA` | **Gestión Académica y Administrativa:** Administración de legajos de profesores y estudiantes (Formulario N° 1), emisión y certificación de reportes oficiales mensuales, gestión de planes de estudio y resoluciones ministeriales. |
| **Bedelía** | `BEDEL` | **Operativa Diaria de Aula:** Carga diaria de partes de asistencia docente, registro y tipificación de licencias e inasistencias (Cuadros DL-01 y DL-02), consulta de horarios de comisiones y padrón de estudiantes. |

---

## 🏛️ Módulos Principales Implementados

### 1. Autenticación y Seguridad Institucional
* **Pantalla de Acceso Moderna:** Ventana de Login en dos paneles institucionales con identidad gráfica del IESETyFP.
* **Control Visual de Contraseña:** Botón interactivo de alternancia (*toggle eye*) para visualizar u ocultar la clave en tiempo de ingreso de forma segura.
* **Protección Criptográfica:** Validación contra hashes `bcrypt` almacenados en base de datos.
* **Configuración Rápida de Base de Datos:** Cuadro de diálogo modal accesible desde el login para conmutar entre motores (SQLite, MySQL, PostgreSQL) y definir parámetros de conexión sin modificar código.
* **Auditoría Transaccional:** Registro pormenorizado en `audit_logs` con sello de tiempo en zona horaria oficial argentina (**GMT-3**).

### 2. Legajos Docentes y Estudiantiles (Formulario N° 1)
* **Gestión de Planta Funcional:** Alta, baja, modificación y consulta de profesores y alumnos.
* **Identificación Unívoca (RN-01):** Almacenamiento y normalización estricta del DNI como clave unívoca de persona en formato texto.
* **Situación de Revista:** Tipificación reglamentaria de docentes en `Titular`, `Interino`, `Provisional` y `Suplente`.
* **Monitor de Carga Horaria:** Indicador visual en tiempo real que compara las horas cátedra acumuladas por el docente frente a su tope reglamentario.

### 3. Designaciones de Cátedra y Cobertura de Suplencias (Core Rectoría)
* **Designación de Cátedras (RN-02):** Asignación relacional de docentes a materias y carreras con especificación de cargo, día de la semana, franja horaria de dictado (`HH:MM`) y cantidad de horas cátedra semanales.
* **Situación de Revista por Designación:** Capacidad de asignar situaciones de revista diferenciadas por cargo a un mismo agente (`TIT`, `INT`, `SUP`).
* **Módulo de Suplencias Formales:** Cobertura de ausencias prolongadas vinculando directamente al suplente con la designación del titular:
  * Motivo estatutario o licencia (Art. 48 Salud, Maternidad, Art. 115, etc.).
  * Período de vigencia delimitado por fechas de inicio y culminación.
  * Número de resolución ministerial o disposición habilitante.
* **Preservación Histórica (RN-03):** Implementación de bajas lógicas (`is_active = False`) en designaciones, suplencias y asistencias, impidiendo el borrado físico de antecedentes administrativos.

### 4. Validaciones de Negocio Críticas en Backend
El motor de validación centralizada ([`models/validation.py`](file:///c:/Users/tomiv/.gemini/antigravity-ide/scratch/siget/models/validation.py)) actúa previo a cualquier persistencia:
* **Control de Tope Horario Semanal:** Verifica que la suma de horas cátedra de todas las designaciones activas del docente no supere su límite legal (30 horas por defecto).
* **Prevención de Solapamiento Horario:** Algoritmo de detección de incompatibilidad horaria que impide asignar cátedras o suplencias a un docente si los días y rangos horarios coinciden o se superponen con otra designación preexistente.

### 5. Reportes Oficiales y Cuadros de Novedades (Excel)
* **Exportación Automatizada:** Generación de planillas estadísticas mensuales de asistencia docente en formato `.xlsx`.
* **Clasificación Inteligente de Licencias:**
  * **Cuadro DL-01 (RN-04):** Exclusivo para licencias médicas y de salud (Art. 48, Art. 114 a/b/c, ART).
  * **Cuadro DL-02 (RN-05):** Inasistencias justificadas/injustificadas y permisos no médicos.
  * **Regla de Inasistencia Diaria (RN-06):** Inasistencias computadas estrictamente por día único.
* **Diseño Editorial Corporativo:** Cabeceras en azul marino institucional, cuadrícula legible, bandas cebra para facilitar la lectura y fórmulas de suma automáticas.

---

## 📁 Estructura del Proyecto

```text
siget/
├── main.py                     # Punto de entrada y orquestador del ciclo de vida de la aplicación
├── build_exe.py                # Script automatizado de compilación con PyInstaller
├── siget.spec                  # Especificación de empaquetado y recursos de PyInstaller
├── config.json                 # Configuración persistente del motor de base de datos
├── requirements.txt            # Dependencias del entorno de producción Python
├── package.json                # Configuración de herramientas y scripts Node.js
├── siget.db                    # Base de datos SQLite local preconfigurada
├── test_siget.py               # Suite de pruebas unitarias y de integración (Python)
├── test_business_logic_dl.py   # Pruebas de reglas normativas DL-01/DL-02 y validaciones (Python)
├── test_backend.js             # Suite de verificación de reglas de negocio en Node.js
├── test_v2_features.js         # Pruebas de integración de funcionalidades extendidas en Node.js
│
├── assets/                     # Identidad gráfica, logotipos e iconos institucionales (.ico, .png)
├── reportes/                   # Directorio de salida para planillas Excel generadas
│
├── database/                   # Capa de persistencia y conexión
│   ├── config.py               # Gestor de configuración y lectura de config.json
│   ├── connection.py           # Engine de SQLAlchemy, sesiones scoped, migraciones y seeders
│   └── schema.py               # Modelos relacionales ORM (User, Teacher, Student, Designation, etc.)
│
├── models/                     # Lógica de dominio, servicios de negocio y normativas
│   ├── attendance.py           # Servicio de registro y gestión de asistencias
│   ├── attendance_processor.py # Motor de procesamiento de novedades docentes para planillas
│   ├── auth.py                 # Servicio de autenticación, verificación bcrypt y control de sesión
│   ├── designation.py          # Gestión integral de cátedras, horarios y suplencias
│   ├── normative.py            # Catálogo oficial de artículos, cuadros DL-01/DL-02 y reglas RN-01 a RN-08
│   ├── reports.py              # Compilador de reportes corporativos en Excel con openpyxl/pandas
│   ├── student.py              # Servicio CRUD y padrón de estudiantes
│   ├── teacher.py              # Servicio CRUD y legajo docente
│   └── validation.py           # Validador de topes horarios y solapamientos de cátedra
│
└── views/                      # Capa de presentación (CustomTkinter GUI)
    ├── attendance_view.py      # Planilla interactiva de carga de asistencia diaria
    ├── dashboard_view.py       # Panel de control institucional con métricas y alertas
    ├── designations_view.py    # Pantalla de asignación de cátedras y cobertura de suplencias
    ├── excel_table.py          # Componente de tabla visual con estilo de planilla de cálculo
    ├── login_view.py           # Ventana de Login con botón ver contraseña y selector de BD
    ├── main_window.py          # Contenedor principal con sidebar responsivo según rol
    ├── register_view.py        # Diálogo para registro institucional de nuevos usuarios
    ├── reports_view.py         # Vista para parametrizar y generar reportes oficiales
    ├── students_view.py        # Formulario N° 1 para gestión de matrícula de alumnos
    ├── teachers_view.py        # Formulario N° 1 para gestión de legajos docentes
    └── theme.py                # Definición centralizada de colores, tipografías y estilos
```

---

## 🚀 Guía de Puesta en Marcha

### 1. Requisitos Previos
* **Python 3.10 o superior** instalado en el sistema.
* **Node.js 18+** (opcional, requerido para ejecutar las suites de prueba de tooling en JavaScript).

### 2. Configuración del Entorno Virtual (Python)

Abrir una terminal en el directorio raíz del proyecto:

```bash
# Crear el entorno virtual (si no existe)
python -m venv .venv

# Activar el entorno virtual
# En Windows (PowerShell):
.venv\Scripts\Activate.ps1
# En Windows (CMD):
.venv\Scripts\activate.bat
# En Linux / macOS:
source .venv/bin/activate
```

### 3. Instalación de Dependencias

```bash
# Dependencias principales de Python
pip install --upgrade pip
pip install -r requirements.txt

# Dependencias de tooling y pruebas JS (opcional)
npm install
```

### 4. Ejecución del Sistema

Con el entorno virtual activado:

```bash
python main.py
```

---

## 🔐 Credenciales Iniciales de Demostración

Al iniciarse por primera vez, SIGET inicializa automáticamente la base de datos con carreras, materias, docentes y los siguientes usuarios de demostración:

| Rol Oficial | Usuario (`username`) | Contraseña | Nivel de Acceso y Funciones |
| :--- | :--- | :--- | :--- |
| **Rectoría** | `rector` | `rector123` | **Acceso Total:** Planta docente, designaciones, auditoría y configuración de BD. |
| **Secretaría** | `secretaria` | `secretaria123` | **Gestión Académica:** Legajos (Formulario N° 1), emisión de reportes oficiales. |
| **Bedelía** | `bedel` | `bedel123` | **Operativa:** Asistencia diaria, licencias, inasistencias y matrícula. |

---

## 🗄️ Conexión a Servidores de Base de Datos (MySQL / PostgreSQL)

Por defecto, SIGET opera sobre SQLite local (`siget.db`). Para conectarse a un servidor de red o en la nube:

1. Inicie la aplicación y en la pantalla de Login presione el botón **⚙️ Base de Datos**.
2. En la lista desplegable, seleccione el motor: `mysql` o `postgresql`.
3. Complete los parámetros del servidor:
   * **Host / Servidor:** Dirección IP o dominio (p. ej., `192.168.1.50` o `localhost`).
   * **Puerto:** `3306` para MySQL, `5432` para PostgreSQL.
   * **Base de Datos:** Nombre del esquema (p. ej., `siget_db`).
   * **Usuario y Contraseña:** Credenciales del motor de base de datos.
4. Presione **Guardar y Conectar**. El sistema verificará la conectividad, creará las tablas automáticamente si no existen y persistirá la configuración en `config.json`.

---

## 📦 Compilación a Archivo Ejecutable (.exe)

Para generar la versión de distribución standalone (que no requiere instalación previa de Python en los puestos de trabajo del instituto):

```bash
python build_exe.py
```

El script invocará PyInstaller respetando las directivas de [`siget.spec`](file:///c:/Users/tomiv/.gemini/antigravity-ide/scratch/siget/siget.spec) e incrustando el icono institucional. Al finalizar con éxito, el ejecutable empaquetado estará disponible en:
```text
dist/SIGET.exe
```

---

## 🧪 Ejecución de Pruebas Automatizadas

El proyecto incluye suites de prueba completas para validar tanto la lógica de negocio como los componentes de integración:

```bash
# Pruebas funcionales y de modelo en Python
python -m unittest test_siget.py

# Pruebas de reglas normativas DL-01 / DL-02 y topes horarios
python -m unittest test_business_logic_dl.py

# Pruebas de verificación de reglas con entorno Node.js
npm run test:backend
```

---

## 📄 Licencia y Marco Institucional
Sistema desarrollado para el **IESETyFP** (Instituto de Educación Superior de Educación Técnica y Formación Profesional). Todos los derechos reservados.
