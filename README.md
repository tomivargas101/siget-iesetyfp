# SIGET - Sistema Integral de Gestión Educativa Terciaria

SIGET es una aplicación de escritorio corporativa y robusta desarrollada en **Python 3.10+** y **CustomTkinter**, diseñada específicamente para la gestión académica y administrativa de institutos de educación superior terciaria (Rectores, Secretarios y Bedeles).

---

## 🏛️ Módulos Principales Implementados

1. **Autenticación y Control de Accesos por Roles (RBAC):**
   - Ventana de Login moderna en CustomTkinter con diseño en dos paneles institucionales.
   - Seguridad mediante contraseñas hasheadas con algoritmo **bcrypt** (cost factor 12).
   - Roles diferenciados:
     - **Rector / Directivo:** Acceso integral a toda la planta funcional, designaciones, auditoría y reportes.
     - **Bedel / Administrativo:** Acceso operativo para carga de asistencia, licencias y registro de alumnos.
   - Registro de auditoría centralizado de inicios/cierres de sesión y operaciones sensibles.

2. **Módulo de Legajos Docentes y Alumnos:**
   - CRUD completo de profesores y estudiantes (Legajo, DNI, CUIL, contacto, carrera).
   - Clasificación por situación de revista: `Titular`, `Provisional`, `Interino`, `Suplente`.
   - Medidor visual en tiempo real de carga horaria activa frente al tope reglamentario.

3. **Módulo de Designaciones y Suplencias (Core):**
   - Vinculación relacional de Cátedras, Carreras y Docentes.
   - Registro formal de suplencias asociadas al titular reemplazado:
     - Motivo de licencia reglamentaria (Art. 48 Salud, Maternidad, etc.).
     - Fechas de vigencia (inicio y fin).
     - Número de resolución ministerial respaldatoria.

4. **Validaciones de Negocio Críticas en Backend:**
   - **Tope de Horas Cátedra:** Impide que un docente supere las 30 horas cátedra semanales (configurable) considerando la totalidad de sus designaciones activas.
   - **Compatibilidad Horaria:** Detecta automáticamente solapamientos de días y rangos horarios con otras materias asignadas antes de confirmar cualquier designación o suplencia.

5. **Módulo de Reportes Oficiales (Excel):**
   - Generación automática de la **Planilla de Estadísticas Mensuales y Asistencia Docente** con `pandas` y `openpyxl`.
   - Estilizado corporativo institucional: cabeceras azul marino, filas cebra, anchos dinámicos y fórmulas automáticas de totales.

---

## 📁 Arquitectura del Código

```text
siget/
├── main.py                   # Punto de entrada y orquestador del ciclo de vida
├── config.json               # Configuración de base de datos y parámetros
├── requirements.txt          # Dependencias del proyecto
├── test_siget.py             # Suite de verificación y validación automática
├── build_exe.py              # Script para compilar el ejecutable con PyInstaller
│
├── database/
│   ├── config.py             # Carga y persistencia de configuración de conexión
│   ├── connection.py         # Motor SQLAlchemy, pooling, sesiones y hashing bcrypt
│   └── schema.py             # Modelos relacionales ORM (User, Teacher, Student, Designation...)
│
├── models/
│   ├── auth.py               # Servicio de autenticación, UserDTO y sesión activa
│   ├── teacher.py            # Lógica de negocio y CRUD de docentes
│   ├── student.py            # Lógica de negocio y CRUD de estudiantes
│   ├── designation.py        # Core de designaciones y registro de suplencias
│   ├── validation.py         # Servicio de reglas críticas (tope horas y superposiciones)
│   └── reports.py            # Compilador de planillas oficiales Excel
│
└── views/
    ├── login_view.py         # Ventana moderna de acceso y configuración de servidor BD
    ├── main_window.py        # Ventana principal con sidebar responsivo y control de roles
    ├── dashboard_view.py     # KPIs globales, alertas de tope y suplencias vigentes
    ├── teachers_view.py      # Gestión de planta funcional y legajos docentes
    ├── students_view.py      # Gestión de matrícula y alumnos
    ├── designations_view.py  # Cátedras, asignaciones y suplencias
    └── reports_view.py       # Selector mensual y exportación a Excel
```

---

## 🚀 Puesta en Marcha

### 1. Activar Entorno Virtual e Instalar Dependencias
```bash
# Windows
.venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Ejecutar la Aplicación
```bash
python main.py
```

### 3. Credenciales Iniciales de Demostración
El sistema inicializa automáticamente una base de datos con los siguientes usuarios de prueba:

| Rol | Usuario | Contraseña | Nivel de Acceso |
| :--- | :--- | :--- | :--- |
| **Rector / Directivo** | `rector` | `rector123` | Acceso Total (Planta, Auditoría, Config BD) |
| **Bedel / Administrativo** | `bedel` | `bedel123` | Acceso Operativo (Legajos, Suplencias, Asistencia) |
| **Secretaría Académica** | `admin` | `admin123` | Acceso Total |

---

## 🗄️ Conexión a Servidor Centralizado (MySQL / PostgreSQL)
Por defecto, SIGET incluye SQLite local para pruebas inmediatas y contingencia. Para conectar la aplicación a un servidor centralizado en red o dedicado:
1. Abra la ventana de Login y presione el botón **⚙️ Base de Datos**.
2. Seleccione el motor (`MySQL` o `PostgreSQL`).
3. Ingrese el host, puerto, nombre de la base de datos, usuario y contraseña.
4. Presione **Guardar y Conectar**.

---

## 📦 Compilación a Archivo Ejecutable (.exe)
Para generar el archivo ejecutable listo para distribución sin requerir Python en las máquinas de bedelía/rectoría:
```bash
python build_exe.py
```
El ejecutable resultante se ubicará en la carpeta `dist/SIGET/SIGET.exe`.
