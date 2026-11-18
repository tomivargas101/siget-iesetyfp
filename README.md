# SIGET - Sistema Integral de Gestión Educativa Terciaria
### Instituto de Educación Superior de Educación Técnica y Formación Profesional (IESETyFP)

[![Electron Version](https://img.shields.io/badge/Electron-35.x-47848F.svg)](https://www.electronjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B%20%7C%2022%2B-339933.svg)](https://nodejs.org/)
[![Database](https://img.shields.io/badge/Database-SQLite%20(WAL%20Mode)-orange.svg)](https://www.sqlite.org/)
[![CSS](https://img.shields.io/badge/CSS-Tailwind%20CSS%203.4-38B2AC.svg)](https://tailwindcss.com/)
[![Security](https://img.shields.io/badge/Security-bcrypt%20Hashes-success.svg)](https://github.com/dcodeIO/bcrypt.js)
[![License](https://img.shields.io/badge/Institucional-IESETyFP-gold.svg)](#)

**SIGET** es una aplicación de escritorio corporativa y de misión crítica desarrollada específicamente para la administración académica, funcional y operativa de institutos de educación superior técnica terciaria. Centraliza el control de planta funcional docente, cátedras y designaciones multi-día, cobertura formal de suplencias, control de asistencia diaria y generación de planillas oficiales con formato ministerial bajo estrictas normativas institucionales.

---

## 👥 Roles Institucionales y Niveles de Acceso

El acceso al sistema está estrictamente restringido a los dos perfiles de usuario autorizados por la normativa del instituto:

| Rol Institucional | Perfil | Alcance y Módulos Habilitados |
| :--- | :--- | :--- |
| **Secretaría** | Administrativo / Gestión | **Acceso Completo de Gestión:** Gestión de legajos docentes (altas, modificaciones, unicidad de DNI y legajo), asignación de cátedras y designaciones multi-día, registro de suplencias con resolución ministerial, administración y blanqueo de usuarios institucionales, emisión de libros Excel y reportes oficiales. |
| **Bedelía** | Operativo / Control Diario | **Gestión Diaria de Asistencia:** Carga del parte diario de presentismo, ausentismo y licencias médicas/particulares (DL-01 / DL-02), generación de la Planilla Imprimible de Control Diario con casillas de verificación para papel, consulta interactiva del Calendario Institucional y Fichas Docentes. |

> [!IMPORTANT]
> **Seguridad y Jerarquía de Accesos:** Bedelía tiene restringido el acceso al módulo de administración de usuarios y configuración sensible. Cualquier intento de acceso no autorizado es bloqueado por las guardas de seguridad y registrado en el log inmutable de auditoría (`audit_logs`).

---

## 🚀 Mejoras y Actualizaciones Institucionales Recientes (14/11/2026)

Durante la jornada del 14/11/2026 se incorporaron refactorizaciones clave y nuevas funcionalidades al sistema:

### 1. Calendario Institucional Unificado "2 en 1"
- **Fusión Integral:** Se combinó la grilla mensual del mes en curso y la planilla de novedades en una única vista interactiva con etiquetas de estado (*pills*) por evento (feriados, jornadas institucionales, licencias y ausencias).
- **Modal Flotante de Detalle Diario:** Al hacer clic sobre cualquier celda de la grilla mensual, se abre un modal flotante detallado que desglosa la nómina de profesores presentes, suplencias activas, licencias especiales e inasistencias del día, con botón de salto directo a la fecha en la pestaña de Asistencias.

### 2. Cátedras Multi-Día con Cargas y Horarios Variables
- **Soporte Integral de Múltiples Días:** Las cátedras y materias pueden contar con dictado en diferentes días de la semana con franjas horarias y cargas horarias independientes (por ejemplo: *Lunes de 18:00 a 20:15 con 3 hs y Jueves de 18:00 a 18:40 con 1 h*).
- **Consolidación Inteligente:** En el listado general de cátedras, la materia se consolida en una única fila representativa con el total acumulado de horas semanales y el detalle de cada día.

### 3. Planilla Imprimible de Control Diario para Bedelía
- **Optimización para Impresión en Papel:** Generación de planilla oficial en formato **A4 Horizontal (Landscape)** tanto en PDF vectorial como en Excel (`.xlsx`).
- **Casillas de Verificación Manual:** Diseñada específicamente para uso diario en el mostrador de Bedelía, incluye casillas de verificación manual (*checkboxes*) para la firma de cada docente por materia y horario.

### 4. Contextualización Dinámica de Exportación
- **Ficha Docente Independiente:** En la sub-pestaña "Ficha Docente", la interfaz oculta automáticamente los botones de exportación del mes general y exhibe únicamente los botones dedicados de *Exportar Ficha (PDF)* y *Exportar Ficha (Excel)*.
- **Diálogos Nativos del Sistema Operativo (`showSaveDialog`):** Todas las funciones de exportación (calendarios, fichas individuales y planillas de control diario) abren el diálogo nativo de guardado del sistema operativo, permitiendo al usuario elegir la carpeta y nombre de archivo deseado.

### 5. Depuración y Limpieza de Módulos Redundantes
- **Eliminación del Módulo Huérfano:** Se suprimió del menú lateral el antiguo módulo independiente de "Planilla Mensual", integrando toda la reportería mensual directamente en el Calendario Institucional.
- **Corrección de Validación de Legajos:** Se corrigió la consulta de validación de unicidad de DNI al momento de editar (`UPDATE`), excluyendo el propio ID del registro (`WHERE dni = ? AND id != ?`), permitiendo guardar modificaciones en datos docentes sin bloqueos indebidos.

---

## 🛠️ Stack Tecnológico y Arquitectura

```text
                  ┌────────────────────────────────────────┐
                  │          SIGET CLIENTE DESKTOP         │
                  │   Electron 35 + HTML5 + Tailwind CSS   │
                  └──────────────────┬─────────────────────┘
                                     │
                                     ▼
                  ┌────────────────────────────────────────┐
                  │       PRELOAD BRIDGE (SEGURO)          │
                  │   contextBridge (window.sigetApi)      │
                  └──────────────────┬─────────────────────┘
                                     │
            ┌────────────────────────┴────────────────────────┐
            ▼                                                 ▼
 ┌──────────────────────┐                         ┌──────────────────────┐
 │    MAIN PROCESS      │                         │  SERVICIOS BACKEND   │
 │ Electron App, IPC,   │                         │ Attendance, Calendar │
 │ Dialogs, Lifecycle   │                         │ Teachers, Designat.  │
 └──────────┬───────────┘                         └──────────┬───────────┘
            │                                                 │
            └────────────────────────┬────────────────────────┘
                                     │
                                     ▼
                  ┌────────────────────────────────────────┐
                  │    MOTOR DE BASE DE DATOS LOCAL        │
                  │    SQLite 3 Nativo (node:sqlite)       │
                  │        Modo WAL Concurrente            │
                  └────────────────────────────────────────┘
```

- **Runtime y Plataforma:** [Node.js](https://nodejs.org/) v20+ / v22+ con [Electron](https://www.electronjs.org/) v35.
- **Interfaz Gráfica:** HTML5 semántico, [Tailwind CSS](https://tailwindcss.com/) 3.4 y suite de iconos [Lucide](https://lucide.dev/).
- **Base de Datos y Persistencia:** SQLite 3 nativo de alto rendimiento (`node:sqlite`) con modo `WAL` (*Write-Ahead Logging*), garantizando integridad referencial estricta y lecturas concurrentes sin bloqueo.
- **Seguridad y Criptografía:** Hash de contraseñas mediante `bcryptjs` con salado dinámico, preguntas de seguridad institucionales y clave de recuperación maestra (*Master Recovery Key*) de 16 caracteres.
- **Generación de Reportes y Planillas:** [ExcelJS](https://github.com/exceljs/exceljs) para generación de libros de cálculo con diseño y estilos ministeriales oficiales, y motor Chromium integrado para exportación a PDF en tamaño A4.

---

## 📋 Guía Rápida de Instalación y Ejecución

### Paso 1: Clonar el Repositorio
```bash
git clone https://github.com/tomivargas101/siget-iesetyfp.git
cd siget
```

### Paso 2: Instalar Dependencias
```bash
npm install
# o utilizando pnpm:
pnpm install
```

### Paso 3: Iniciar la Aplicación en Modo Escritorio
```bash
npm start
```

---

## 🔑 Credenciales de Acceso de Demostración

El sistema inicializa automáticamente la base de datos `siget.db` con dos usuarios predeterminados:

| Rol | Usuario | Contraseña | Perfil y Alcance |
| :--- | :--- | :--- | :--- |
| **Secretaría** | `secretaria` | `secretaria123` | Control total administrativo, cátedras, legajos y reportes. |
| **Bedelía** | `bedel` | `bedel123` | Carga de asistencia diaria y planilla imprimible. |

*(En la pantalla de inicio de sesión dispones de botones de acceso rápido para autocompletar credenciales en modo evaluación).*

---

## 🧪 Ejecución de Pruebas Automatizadas

El proyecto cuenta con un conjunto integral de suites de pruebas que validan reglas de negocio, consistencia de base de datos y nuevas funcionalidades:

```bash
# 1. Pruebas de backend, autenticación, seguridad bcrypt y reglas normativas (39 tests)
npm run test:backend

# 2. Pruebas de funcionalidades recientes: multi-día, calendario y planilla imprimible (8 bloques)
node test_new_features.js

# 3. Pruebas de requerimientos normativos v2.0, ABMC y catálogo IL-01/IL-02 (12 bloques)
node test_v2_features.js

# 4. Verificación de inicio y carga de ventana de Electron
npm run test:electron
```

---

## 📁 Estructura del Repositorio

```text
siget/
├── src/
│   ├── database/
│   │   └── db.js                 # Conexión nativa SQLite, migraciones y seeds iniciales
│   ├── main/
│   │   ├── main.js               # Ciclo de vida de Electron, BrowserWindow y single-instance lock
│   │   └── ipcHandlers.js        # Handlers IPC asíncronos para comunicación Main <-> Renderer
│   ├── preload/
│   │   └── preload.js            # Exposición segura de APIs en window.sigetApi
│   ├── services/
│   │   ├── attendanceService.js  # Lógica de asistencias, estados cerrados y planilla imprimible
│   │   ├── attendanceProcessor.js# Agrupamiento de novedades para planillas oficiales
│   │   ├── auditService.js       # Registro de auditoría institucional y exportación PDF
│   │   ├── authService.js        # Autenticación bcrypt, preguntas secretas y Master Key
│   │   ├── csvImportService.js   # Importación universal de CSV con detección automática
│   │   ├── dashboardService.js   # Métricas y estadísticas institucionales
│   │   ├── designationService.js # Cátedras multi-día y asignación de suplencias
│   │   ├── normativeService.js   # Catálogo maestro de licencias (IL-01 / IL-02)
│   │   ├── reportService.js      # Generación de libro Excel mensual oficial
│   │   ├── teacherCalendarService.js # Matriz de mes, fichas docentes y exportaciones
│   │   ├── teacherService.js     # Legajos de profesores y validación de unicidad
│   │   ├── userService.js        # Gestión de cuentas de usuario y blanqueo
│   │   └── validationService.js  # Reglas de negocio estatutarias y topes horarios
│   └── renderer/
│       ├── index.html            # Interfaz de usuario SPA institucional
│       ├── css/                  # Estilos Tailwind CSS y temas de la app
│       └── js/
│           └── app.js            # Controlador del frontend y gestión de eventos
│
├── assets/                       # Logotipos e identidad visual oficial (.png)
├── reportes/                     # Carpeta de salida de reportes generados
├── export_schema_pdf.js          # Script auxiliar de compilación del esquema de BD
├── package.json                  # Dependencias y scripts de npm
└── README.md                     # Documentación general del sistema
```

---

## 📄 Marco Institucional
Sistema desarrollado para el **IESETyFP** (*Instituto de Educación Superior de Educación Técnica y Formación Profesional*). Cumple con los lineamientos de acreditación académica y administrativa vigentes.
