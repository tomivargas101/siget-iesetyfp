# SIGET - Sistema de Gestión de Asistencia Docente
### Instituto de Educación Superior de Educación Técnica y Formación Profesional (IESETyFP) — Resistencia, Chaco
**Cátedra:** Diseño y Elaboración de Proyectos Informáticos — 3° Año, Tecnicatura Superior en Desarrollo de Software  
**Arquitectura:** 100% Aplicación Web Centralizada en **Python & Django**  
**Fecha de Consolidación y Entrega:** 19 de Noviembre de 2026  

[![Python](https://img.shields.io/badge/Python-3.13-blue.svg)](https://www.python.org/)
[![Django](https://img.shields.io/badge/Django-6.1%2B-092E20.svg)](https://www.djangoproject.com/)
[![Database](https://img.shields.io/badge/Database-SQLite%203NF%20%7C%20PostgreSQL-003B57.svg)](https://www.sqlite.org/)
[![UI Framework](https://img.shields.io/badge/UI-Bootstrap%205.3%20Institucional-17365D.svg)](https://getbootstrap.com/)
[![Excel Processing](https://img.shields.io/badge/Excel-openpyxl%20%7C%20pandas-217346.svg)](https://openpyxl.readthedocs.io/)
[![Auditoría](https://img.shields.io/badge/Auditor%C3%ADa-Inmutable%20RF--20-E0C45D.svg)](#)

---

## 📖 1. Resumen Ejecutivo y Alcance Institucional

**SIGET** (Sistema de Gestión de Asistencia Docente) es una plataforma web desarrollada de manera exclusiva sobre **Python y Django**, diseñada para dar cumplimiento estricto e integral al **Documento de Requerimientos Intercátedra v2.0** y a las pautas ministeriales de liquidación de haberes docentes del Chaco.

El sistema modela el flujo administrativo de bedelía y secretaría académica para el registro diario de novedades de asistencia, la recepción y justificación con formularios oficiales, la cobertura de cátedras mediante suplencias con control de incompatibilidad, y la emisión mensual de los **Cuadros Estadísticos Oficiales IL-01** (licencias médicas e inasistencias con descuento) e **IL-02** (licencias normativas con goce de haberes y suplencia) con destino a la **Dirección de Liquidaciones del Ministerio de Educación (Oficina Técnica 1452)**.

---

## 🔄 2. Migración Tecnológica: de Node.js/Electron a Python/Django

El proyecto atravesó un proceso de reingeniería arquitectónica y migración completa:

1. **Abandono de la Arquitectura Desktop / Híbrida:**  
   Se desestimó el esquema legacy basado en Node.js, Electron y empaquetados binarios de escritorio (`.exe`), los cuales presentaban problemas de concurrencia en red local, aislamiento de bases de datos y dependencia de entornos runtime pesados.
2. **Adopción de Arquitectura Web Centralizada en Django:**  
   Se reimplementó el 100% del sistema sobre el patrón **MVT (Model-View-Template)** de Django. Esto garantiza:
   - Base de datos relacional centralizada en **Tercera Forma Normal (3NF)** con integridad referencial estricta.
   - Seguridad de acceso basada en sesiones HTTP con hashing PBKDF2/SHA256 y protección CSRF nativa.
   - Interfaz web multiusuario accesible desde cualquier puesto de trabajo de Bedelía o Secretaría a través de la red local del instituto.
   - Separación rigurosa de responsabilidades mediante una capa de servicios (`gestion/services/`) desacoplada de los controladores.

---

## 🏛️ 3. Estructura del Proyecto

```text
siget/
│
├── manage.py                          # Gestor de comandos del framework Django
├── requirements.txt                   # Dependencias fijadas y verificadas de Python
├── db.sqlite3                         # Base de datos relacional SQLite 3NF (o PostgreSQL)
├── .gitignore                         # Exclusión de entornos, temporales y credenciales
├── README.md                          # Documentación institucional y manual de despliegue
│
├── siget_project/                     # Configuración principal del proyecto
│   ├── __init__.py
│   ├── settings.py                    # Regionalización (es-ar, UTC-3), middleware y seguridad
│   ├── urls.py                        # Enrutador central y vistas de autenticación (/login, /logout)
│   ├── wsgi.py                        # Punto de entrada para servidores WSGI (Gunicorn / uWSGI)
│   └── asgi.py                        # Punto de entrada asíncrono
│
├── gestion/                           # Aplicación de dominio institucional
│   ├── __init__.py
│   ├── admin.py                       # Panel administrativo Django
│   ├── apps.py                        # Configuración de la aplicación
│   ├── models.py                      # Modelos ORM: Agente, Carrera, Materia, Designacion,
│   │                                  # HorarioDesignacion, Suplencia, TipoLicencia, Feriado,
│   │                                  # NovedadAsistencia, Disposicion, RenglonMensual, Auditoria
│   ├── forms.py                       # Formularios y validaciones (tope 30 hs, anti-auto-suplencia, CSV)
│   ├── urls.py                        # Enrutador interno de rutas de negocio
│   ├── views.py                       # Vistas controladoras web y respuestas JSON reactivas
│   ├── tests.py                       # Suite de 22 pruebas unitarias y de integración
│   │
│   ├── services/                      # Capa de Lógica de Negocio y Reglas de Dominio
│   │   ├── __init__.py                # ProcesadorMensual, ExportadorExcel, ImportadorCSV,
│   │   │                              # CalculadorAlertas, JustificacionService y registrar_auditoria
│   │   └── horarios.py                # HorarioService (validación de franjas y superposiciones)
│   │
│   └── management/
│       └── commands/
│           └── cargar_datos_iniciales.py # Seeder oficial de catálogos, roles, feriados y docentes
│
├── templates/                         # Plantillas HTML con Bootstrap 5.3
│   ├── base.html                      # Layout maestro con barra horizontal del IESETyFP y toasts flotantes
│   ├── registration/
│   │   └── login.html                 # Pantalla de acceso seguro con credenciales institucionales (RF-19)
│   └── gestion/
│       ├── dashboard.html             # Tablero de control de asistencia y KPIs institucionales
│       ├── asistencia_diaria.html     # Grilla diaria con combo box reactivo y modal de justificación
│       ├── recepcion_formulario.html  # Formulario físico con artículo normativo y carga de certificado
│       ├── suplencia_form.html        # Pantalla dedicada de asignación de suplencias en 3 pasos
│       ├── procesamiento_mensual.html # Cuadros IL-01 / IL-02 y Disposiciones consecutivas
│       ├── agentes_list.html          # Padrón docente con pluralidad de revistas activas
│       ├── agente_form.html           # Alta/edición de agentes con preservación de ceros (RN-01)
│       ├── agente_detail.html         # Ficha individual del docente con historial persistente
│       ├── designaciones_list.html    # Cátedras, designaciones y horarios
│       ├── designacion_form.html      # Asignación de cátedra con franjas 1:N y control de 30 hs
│       ├── designacion_detail.html    # Detalle de cátedra y franjas horarias
│       ├── carreras_list.html         # Planes de estudio y tecnicaturas
│       ├── carrera_form.html          # Alta/edición de carreras
│       ├── materias_list.html         # Espacios curriculares
│       ├── materia_form.html          # Formulario de materias
│       ├── licencias_list.html        # Nomenclador de 20 licencias (Hojas 1 a 6)
│       ├── importar_csv.html          # Carga masiva segura con validación de extensión y binarios
│       ├── consultas.html             # Consultas multidimensionales y alertas de inasistencias
│       └── auditoria.html             # Registro inmutable de trazabilidad (RF-20)
│
├── static/                            # Recursos estáticos
│   └── img/
│       ├── logo_iesetyfp.jpg          # Isologo institucional del IESETyFP
│       └── icon.ico                   # Favicon
│
├── media/                             # Almacenamiento seguro de certificados médicos escaneados
│   └── certificados/
│
└── reportes/                          # Planillas Excel oficiales exportadas (.xlsx)
```

---

## ⚡ 4. Guía de Instalación y Ejecución Local

### Paso 1: Clonar o posicionarse en el proyecto
```bash
git clone https://github.com/tomivargas101/siget-iesetyfp.git
cd siget-iesetyfp
```

### Paso 2: Crear y activar el entorno virtual (Python 3.10+)
- **En Windows (PowerShell):**
  ```powershell
  python -m venv .venv
  .\.venv\Scripts\activate
  ```
- **En Linux / macOS:**
  ```bash
  python3 -m venv .venv
  source .venv/bin/activate
  ```

### Paso 3: Instalar las dependencias
```bash
pip install -r requirements.txt
```

### Paso 4: Ejecutar migraciones de base de datos
```bash
python manage.py migrate
```

### Paso 5: Sembrar datos iniciales institucionales (RF-19 y Hojas 1–6)
```bash
python manage.py cargar_datos_iniciales
```
*Este comando pre-carga los usuarios de prueba, el catálogo oficial de 20 licencias ministeriales, carreras, espacios curriculares, docentes de muestra y el calendario de feriados 2026.*

### Paso 6: Ejecutar la suite de pruebas automatizadas
```bash
python manage.py test
```
*Salida esperada:*
```text
Creating test database for alias 'default'...
....................
----------------------------------------------------------------------
Ran 22 tests in ~65s

OK
```

### Paso 7: Iniciar el servidor web de desarrollo
```bash
python manage.py runserver
```
Abra su navegador web en: **[http://127.0.0.1:8000/](http://127.0.0.1:8000/)**

---

## 👥 5. Credenciales de Demostración (RF-19)

El sistema cuenta con un rol de **Bedelía unificado** (sin división artificial por turnos), junto a **Secretaría** y **Superusuario**:

| Perfil / Rol | Usuario | Contraseña | Nombre Completo | Atribuciones Operativas |
| :--- | :--- | :--- | :--- | :--- |
| **Secretaría** | `zaquino` | `zaquino123` | Zunilda Aquino | Gestión de legajos, carreras, cátedras, suplencias, procesamiento mensual y reportes. |
| **Bedelía** | `meduarte` | `meduarte123` | María Eva Duarte | Registro diario de asistencia, recepción de formularios físicos, asignación de suplencias y consultas. |
| **Bedelía (Alternativo)** | `msosa` | `msosa123` | Mirtha Sosa | Mismas atribuciones operativas de Bedelía unificada. |
| **Superusuario** | `admin` | `admin123` | Administrador SIGET | Acceso irrestricto, configuración del sistema y panel de auditoría global. |

---

## 🧩 6. Módulos y Capacidades del Sistema

### 1. Navegación e Identidad Visual Institucional
- **Barra Superior Horizontal:** Inspirada en la estética del IESETyFP (`#17365D`, `#2878A5`, `#F4F6F9`), con accesos desplegables por área de trabajo (*Personal*, *Asistencia*, *Cuadros IL*, *Consultas*, *Auditoría*) y estado de sesión a la derecha.
- **Notificaciones Flotantes Efímeras (Toasts):** Ubicadas en la esquina inferior derecha (`bottom-0 end-0`), con desaparición automática a los 4.5 segundos y botón de cierre manual, garantizando una pantalla limpia sin desplazamiento involuntario del contenido.

### 2. Padrón Docente y Pluralidad de Revistas
- **DNI como Texto (RN-01):** Preservación de ceros a la izquierda (ej: `04812345`).
- **Pluralidad de Situaciones de Revista:** Refleja de forma combinada las revistas activas reales del docente en sus cátedras (`TIT`, `INT`, `SUP`).
- **Control del Tope Semanal:** Monitor visual sobre el límite legal de 30 horas cátedra semanales activas.
- **Ficha del Agente:** Historial persistente de novedades con selector temporal por año y mes.

### 3. Cátedras, Horarios 1:N y Suplencias
- **Separación de Granularidad:**
  - `Designacion`: Cargo, carrera, materia, situación de revista (`TIT`, `INT`, `SUP`) y vigencia (`SIN INICIO` / `SIN TERMINO`).
  - `HorarioDesignacion`: Relación 1:N que permite múltiples franjas horarias por cátedra con validación de no superposición (`validar_superposicion_franjas`).
- **Módulo Dedicado "Asignar Suplencia":** Formulario en 3 pasos que selecciona al docente suplente, la designación a cubrir, calcula la compatibilidad horaria, previene la auto-suplencia y genera la designación `SUP` heredando los horarios de la cátedra.

### 4. Asistencia Diaria y Justificación por Rango
- **Combo Box Reactivo en Fila:** Permite cambiar directamente el estado diario (`PR`, `I`, `P`, `LIC`, `LT`) con sincronización asíncrona vía AJAX y fallback estándar.
- **Recepción de Formulario Físico en Modal:** Permite ingresar el número de formulario, certificado médico adjunto, artículo reglamentario y rango de fechas `Desde`–`Hasta`.
- **Recorte y Restauración Automática de Rangos (`JustificacionService`):** Si una justificación se acorta (ej. de 10 días a 5 días), los días sobrantes se desvinculan del formulario y se restauran al estado **Inasistencia (`I`)**, actualizando el contador de la grilla a `5d` de forma inmediata.

### 5. Nomenclador de Licencias Ministeriales (Hojas 1 a 6)
- Catálogo de 20 causales normativas tipificadas según el estatuto docente del Chaco:
  - **Hoja 1 y 2 (Salud y ART):** Arts. 114 a, 114 b, 114 c, 47, 48, 70 $\rightarrow$ Enrutan al **Cuadro IL-01** (con o sin descuento).
  - **Hojas 3 a 6 (Inasistencias, Permisos, Maternidad, Familiares, Exámenes):** Arts. I, IJ, 115, 114 d a 114 o $\rightarrow$ Enrutan al **Cuadro IL-02**.

### 6. Procesamiento Mensual y Disposiciones Correlativas
- Motor automático `ProcesadorMensualService` que:
  - Identifica bloques consecutivos de inasistencias y licencias.
  - Cruza con los días de la semana de las cátedras asignadas al docente, desagregando un renglón por cátedra afectada (RN-10).
  - Asigna una **Disposición Ministerial consecutiva** ordenada alfabéticamente por apellido y nombre (RN-11).
  - Incorpora el código fijo de **Oficina Técnica 1452** (RN-07).

### 7. Exportación Oficial en Excel Multi-Hoja (.xlsx)
- Generación con `openpyxl` en modo de alta legibilidad blanco y negro:
  - **Pestaña 1:** Resumen estadístico mensual por docente.
  - **Pestaña 2:** Cuadro IL-01 con formato oficial y columnas ministeriales.
  - **Pestaña 3:** Cuadro IL-02 con detalle de suplentes y números de formulario.

### 8. Importación Masiva Segura (CSV / TXT)
- Valida estrictamente extensiones permitidas (`.csv`, `.txt`) y tamaño máximo (5 MB).
- Rechaza de forma limpia archivos ejecutables (`.exe`), binarios, documentos ofimáticos (`.pdf`, `.docx`, `.pptx`) y archivos con bytes nulos (`\x00`).
- Verifica la presencia obligatoria de la columna de DNI/documento y preserva ceros a la izquierda (RN-01).

### 9. Consultas, Alertas y Auditoría
- Filtros cruzados por mes, docente, estado y espacio curricular.
- Cálculo de alertas preventivas ante la proximidad del límite anual de 10 faltas injustificadas.
- Pistas de auditoría inmutables (`Auditoria`) que registran usuario, acción, timestamp, dirección IP y detalle de cada operación crítica (RF-20).

---

## ⚖️ 7. Matriz de Cumplimiento de Reglas de Negocio (RN)

| Regla | Descripción Oficial | Implementación Técnica en Django |
| :--- | :--- | :--- |
| **RN-01** | **DNI como Texto:** Preservar ceros a la izquierda (ej: `04812345`). | `Agente.dni = models.CharField(max_length=20, unique=True)`. Normalización en formularios y servicios. |
| **RN-02** | **Unicidad de DNI y Legajo:** No permitir duplicación de agentes. | Restricciones `unique=True` a nivel ORM y base de datos relacional. |
| **RN-03** | **Persistencia Histórica:** La baja o cese no borra antecedentes de la base. | Bajas lógicas (`activo=False`) y conservación de vigencias en `Designacion` y `Suplencia`. |
| **RN-04** | **Enrutamiento a Cuadro IL-01:** Descuento de haberes en salud/inasistencias. | Enrutador automático en `ProcesadorMensualService` hacia Cuadro IL-01. |
| **RN-05** | **Enrutamiento a Cuadro IL-02:** Licencias normativas con suplencia y formulario. | Enrutador hacia Cuadro IL-02 con cruce de suplentes y formularios oficiales. |
| **RN-06** | **Unicidad de Novedad Diaria:** Una marcación por docente y fecha. | Restricción `unique_together = ("agente", "fecha")` en `NovedadAsistencia`. |
| **RN-07** | **Oficina Técnica 1452:** Imputación obligatoria en cada renglón. | Constante `DEFAULT_OFFICE_CODE = 1452` inyectada en cada `RenglonMensual`. |
| **RN-08** | **Ciclo Lectivo Activo:** Liquidación de novedades del año en curso. | Filtro `fecha__year = anio` en todas las consultas de procesamiento y reportes. |
| **RN-09** | **Valores "SIN INICIO" y "SIN TERMINO":** Por defecto en designaciones sin término. | Valores predeterminados en campos de vigencia del modelo `Designacion`. |
| **RN-10** | **Desagregación por Cátedra:** Una fila por materia afectada en el período. | Desglose por `dia_semana` de cátedras activas conservando el rango de la novedad. |
| **RN-11** | **Disposición Única Consecutiva:** Una disposición consecutiva por período y docente. | Ordenamiento alfabético y asignación de `Disp. N° XXX/YYYY` en `Disposicion`. |
| **Tope 30 hs** | **Tope Horario Semanal:** Máximo 30 horas cátedra activas por docente. | Validación en `clean()` de `DesignacionForm` y `AsignarSuplenciaForm`. |
| **Anti-Auto-Suplencia** | **Incompatibilidad de Reemplazo:** El titular no puede suplirse a sí mismo. | Validación estricta en formularios y servicios de justificación y suplencia. |

---

## 🎓 8. Créditos y Autoría
Proyecto Final de Cátedra — **Tecnicatura Superior en Desarrollo de Software**  
**Instituto de Educación Superior de Educación Técnica y Formación Profesional (IESETyFP)**  
*Resistencia, Chaco, Argentina — Ciclo Lectivo 2026*
