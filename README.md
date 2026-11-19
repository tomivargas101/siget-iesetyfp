# SIGET - Sistema Integral de Gestión Educativa Terciaria
### Instituto de Educación Superior de Educación Técnica y Formación Profesional (IESETyFP)
**Cátedra:** Diseño y Elaboración de Proyectos Informáticos — 3° Año, Tecnicatura Superior en Desarrollo de Software  
**Arquitectura:** 100% Aplicación Web en **Python & Django**  

[![Python](https://img.shields.io/badge/Python-3.10%20%7C%203.11%20%7C%203.12%20%7C%203.13-blue.svg)](https://www.python.org/)
[![Django](https://img.shields.io/badge/Django-5.1%2B%20%7C%206.x-092E20.svg)](https://www.djangoproject.com/)
[![Database](https://img.shields.io/badge/Database-SQLite%203NF-003B57.svg)](https://www.sqlite.org/)
[![UI Theme](https://img.shields.io/badge/UI-Bootstrap%205.3%20Dark%20Permanent-7952B3.svg)](https://getbootstrap.com/)
[![Excel Processing](https://img.shields.io/badge/Excel-openpyxl%20%7C%20pandas-217346.svg)](https://openpyxl.readthedocs.io/)
[![Institucional](https://img.shields.io/badge/Institucional-IESETyFP%20Resistencia-E0C45D.svg)](#)

---

## 📖 Resumen Ejecutivo del Proyecto

**SIGET** es una plataforma web desarrollada de manera exclusiva sobre el framework **Django en Python**, diseñada para dar cumplimiento estricto e irrestricto al **Documento de Requerimientos Intercátedra v2.0** y la **Consigna de Entrega Obligatoria** de la carrera Tecnicatura Superior en Desarrollo de Software del IESETyFP.

El sistema resuelve la problemática de gestión de inasistencias docentes, licencias médicas y normativas, cobertura formal de suplencias y emisión mensual de los **Cuadros Estadísticos Oficiales IL-01** (con descuento de haberes) e **IL-02** (con justificación normativa y reemplazo) con destino a la **Dirección de Liquidaciones del Ministerio de Educación (Oficina Técnica 1452)**.

---

## 🏛️ Estructura del Proyecto (100% Django Web)

El proyecto prescinde por completo de entornos de escritorio, Node.js, Electron, librerías de empaquetado `.exe` o dependencias híbridas, estructurándose bajo el patrón estándar de Django:

```text
siget/
│
├── manage.py                          # Gestor de comandos del proyecto Django
├── requirements.txt                   # Dependencias exclusivas de Python (Django, openpyxl, pandas)
├── db.sqlite3                         # Base de datos relacional SQLite en 3NF con integridad referencial
├── README.md                          # Manual técnico, instalación y ejecución
│
├── siget_project/                     # Configuración del proyecto Django (Settings, URLs, WSGI, ASGI)
│   ├── __init__.py
│   ├── settings.py                    # Configuración regional (es-ar, UTC-3), apps, plantillas y estáticos
│   ├── urls.py                        # Enrutador raíz y endpoints de autenticación (/login, /logout)
│   ├── wsgi.py                        # Entrada WSGI para despliegue web en servidores de producción
│   └── asgi.py                        # Entrada ASGI para ejecución asíncrona
│
├── gestion/                           # Aplicación principal de gestión institucional
│   ├── __init__.py
│   ├── models.py                      # Modelos ORM: Agente, Carrera, Materia, Designacion, TipoLicencia,
│   │                                  # Feriado, NovedadAsistencia, Disposicion, RenglonMensual, Auditoria
│   ├── views.py                       # Vistas controladoras: Dashboard, Asistencia, Formularios, Procesamiento,
│   │                                  # ABMC de Agentes, Designaciones, Catálogos, Consultas y Auditoría
│   ├── forms.py                       # Formularios Django con validaciones anti-auto-suplencia y tope 30 hs
│   ├── services.py                    # Capa de lógica de negocio pura:
│   │                                  # - ProcesadorMensualService (Cómputo IL-01/IL-02, RN-04 a RN-11)
│   │                                  # - ExportadorExcelService (Multi-pestaña openpyxl modo B&N)
│   │                                  # - ImportadorCSVService (Normalización de DNI y carga masiva)
│   │                                  # - CalculadorAlertasService (Control de consumos anuales)
│   │                                  # - registrar_auditoria (Pistas inmutables)
│   ├── urls.py                        # Enrutador interno de la aplicación
│   ├── tests.py                       # Suite de pruebas automatizadas de reglas de negocio
│   └── management/
│       └── commands/
│           └── cargar_datos_iniciales.py # Seeder oficial de usuarios, licencias, materias y asistencias
│
├── templates/                         # Plantillas HTML con Bootstrap 5.3 en Modo Oscuro Permanente
│   ├── base.html                      # Layout maestro institucional con barra lateral y alertas
│   ├── registration/
│   │   └── login.html                 # Pantalla de acceso seguro con credenciales y branding
│   └── gestion/
│       ├── dashboard.html             # Tablero de control con KPIs y alertas de consumo
│       ├── asistencia_diaria.html     # Grilla diaria con botones 1-clic (PR, I, LIC, P, LT) y feriados
│       ├── recepcion_formulario.html  # Banner fijo de titular, selección de artículo y anti-auto-suplencia
│       ├── procesamiento_mensual.html # Cuadros IL-01 / IL-02 con rango continuo y desagregación de cátedras
│       ├── agentes_list.html          # Padrón docente con indicador de tope semanal de 30 horas
│       ├── agente_form.html           # Alta/edición de agentes con preservación de ceros en DNI
│       ├── agente_detail.html         # Ficha individual con cátedras activas e historial persistente
│       ├── designaciones_list.html    # Listado de cátedras y horarios
│       ├── designacion_form.html      # Asignación con control estricto de tope de 30 horas semanales
│       ├── carreras_list.html         # Catálogo de tecnicaturas y planes de estudio
│       ├── carrera_form.html          # Formulario de carreras
│       ├── materias_list.html         # Espacios curriculares por carrera y año
│       ├── materia_form.html          # Formulario de materias
│       ├── licencias_list.html        # Nomenclador oficial de 20 licencias (Hojas 1 a 6)
│       ├── importar_csv.html          # Interfaz de carga masiva de docentes vía archivo CSV
│       ├── consultas.html             # Filtros multidimensionales y barras de progreso de topes
│       └── auditoria.html             # Bitácora inmutable de eventos del sistema
│
├── static/                            # Archivos estáticos institucionales
│   └── img/                           # Logotipos del IESETyFP
│
└── media/                             # Almacenamiento de certificados y constancias adjuntas
```

---

## ⚡ Guía Paso a Paso de Instalación y Ejecución

### 1. Clonar el Repositorio o Posicionarse en el Directorio
```bash
cd siget
```

### 2. Crear y Activar el Entorno Virtual (Python 3.10+)
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

### 3. Instalar las Dependencias Oficiales
```bash
pip install -r requirements.txt
```

### 4. Aplicar las Migraciones a la Base de Datos
```bash
python manage.py migrate
```

### 5. Sembrar la Base de Datos con Datos Iniciales y Pruebas
Este comando pre-carga los usuarios de bedelía/secretaría, el catálogo oficial de licencias normativas (Hojas 1 a 6), las carreras, materias, docentes de prueba con DNI con ceros iniciales, feriados del calendario 2026 y registros de asistencia:
```bash
python manage.py cargar_datos_iniciales
```

### 6. Ejecutar la Suite de Pruebas Automatizadas
Verifica que el 100% de las reglas de negocio críticas pasen exitosamente:
```bash
python manage.py test
```
*Salida esperada:*
```text
Creating test database for alias 'default'...
.......
----------------------------------------------------------------------
Ran 7 tests in 11.478s

OK
```

### 7. Iniciar el Servidor Web de Desarrollo
```bash
python manage.py runserver
```

Abra su navegador web en: **[http://127.0.0.1:8000/](http://127.0.0.1:8000/)**

---

## 👥 Credenciales de Acceso Institucional Pre-cargadas (RF-19)

| Usuario | Contraseña | Nombre y Apellido | Perfil / Rol |
| :--- | :--- | :--- | :--- |
| `zaquino` | `zaquino123` | Zunilda Aquino | **Secretaría Académica** (Gestión de legajos, cátedras y reportes) |
| `meduarte` | `meduarte123` | María Eva Duarte | **Bedelía** (Control diario de asistencia y partes) |
| `msosa` | `msosa123` | Mirtha Sosa | **Bedelía** (Control diario de asistencia y partes) |
| `admin` | `admin123` | Administrador SIGET | **Superusuario / Soporte Técnico** |

---

## ⚖️ Implementación de Reglas de Negocio Institucionales

| Regla | Descripción Oficial | Implementación Técnica en Django |
| :--- | :--- | :--- |
| **RN-01** | **DNI como Texto con Ceros a la Izquierda:** Los documentos deben almacenarse como `VARCHAR`/`TEXT` para no truncar ceros iniciales (ej: `04812345`). | `Agente.dni = models.CharField(max_length=20, unique=True)`. Validador y normalizador en `AgenteForm` e `ImportadorCSVService`. |
| **RN-02** | **Unicidad de DNI y Legajo:** No pueden existir agentes duplicados. | `unique=True` y `db_index=True` a nivel ORM y base de datos SQLite. |
| **RN-03** | **Persistencia Histórica en Ceses:** La baja o cese de un docente o cátedra no elimina el registro de la base de datos. | Bajas lógicas con flag `activo=False` y preservación de `vigencia_hasta`. Los antecedentes se mantienen accesibles en Fichas. |
| **RN-04** | **Enrutamiento a Cuadro IL-01:** Inasistencias injustificadas se computan con descuento de haberes. | `ProcesadorMensualService` mapea novedades con estado `I` o licencias de Cuadro `IL-01` en el libro correspondiente. |
| **RN-05** | **Enrutamiento a Cuadro IL-02:** Licencias normativas de Hojas 1 a 6 con goce de haberes se dirigen al Cuadro IL-02. | Catálogo `TipoLicencia` con `cuadro_destino="IL-02"`, asociando número de formulario físico y docente suplente. |
| **RN-06** | **Unicidad de Novedad Diaria:** Un docente solo puede tener una marcación de estado por día. | Restricción `unique_together = ("agente", "fecha")` en `NovedadAsistencia`. |
| **RN-07** | **Código Fijo de Oficina Técnica 1452:** Toda fila enviada a Liquidaciones debe consignar la oficina 1452. | Constante `DEFAULT_OFFICE_CODE = 1452` inyectada en cada instancia de `RenglonMensual`. |
| **RN-08** | **Cómputo en Año en Curso:** Solo se liquidan novedades del ciclo lectivo activo. | Filtro `fecha__year = anio` en todas las consultas de consolidación mensual y cómputo de alertas. |
| **RN-09** | **Valores "SIN INICIO" y "SIN TERMINO":** Valores por defecto requeridos para designaciones sin fecha fija. | Defaults formales en el modelo `Designacion` y validados en `DesignacionForm`. |
| **RN-10** | **Propagación de Rango y Desagregación por Cátedra:** Si una licencia abarca varios días, se genera un renglón por cada cátedra que dictaba en esos días, manteniendo el rango completo `Desde` y `Hasta`. | Algoritmo en `ProcesadorMensualService`: agrupa bloques continuos, cruza con `dia_semana` de las cátedras y desglosa horas afectadas. |
| **RN-11** | **Disposición Oficial Única y Numeración Alfabética:** Una única disposición por docente/período, numerada consecutivamente en orden alfabético. | Ordenamiento por `(apellido, nombre)` y asignación consecutiva `Disp. N° XXX/YYYY` persistida en el modelo `Disposicion`. |
| **Tope 30 hs** | **Tope Horario Semanal Docente:** Ningún docente puede acumular más de 30 horas cátedra semanales activas. | Validación en `Agente.validar_tope_horas()` ejecutada en el `clean()` de `Designacion` y `DesignacionForm`. |
| **Anti-Auto-Suplencia** | **Incompatibilidad de Reemplazo:** Un docente titular no puede seleccionarse como su propio suplente. | Filtro de exclusión en el queryset de `RecepcionFormularioFisicoForm` y validación en `clean_suplente()`. |

---

## 📊 Matriz de Cumplimiento de Requerimientos Funcionales (RF)

- **RF-01 a RF-04 (Autenticación y Sesiones):** Módulo `django.contrib.auth` con vistas `login` y `logout`, contraseñas con hashing PBKDF2/SHA256 y control de sesiones activas.
- **RF-05 a RF-09 (Padrón Docente y Cátedras):** Vistas ABMC en `gestion/views.py` para agentes y asignaturas, con control de horas cátedra semanales y visualización de historial.
- **RF-10 (Control de Asistencia Diaria):** Interfaz interactiva en `asistencia_diaria.html` con detección de feriados institucionales y botones rápidos de un solo clic.
- **RF-11 a RF-13 (Recepción de Formularios Físicos):** Modal / página de carga en `recepcion_formulario.html` con banner contextualmente fijo del titular y adjunto de certificados médicos escaneados.
- **RF-14 (Procesamiento Mensual Automatizado):** Motor `ProcesadorMensualService` que genera automáticamente los renglones de IL-01 e IL-02 sin intervención manual.
- **RF-15 (Exportación Oficial Excel Multi-Hoja):** Servicio `ExportadorExcelService` con `openpyxl` que emite el libro `.xlsx` con hojas de Resumen, Cuadro IL-01 y Cuadro IL-02, estilizado con fondos claros para óptima impresión en blanco y negro.
- **RF-16 a RF-18 (Consultas, Alertas y Auditoría):** Panel `consultas.html` con filtrado dinámico por docente, cátedra y estado, alertas de aproximación al límite anual de 10 faltas y registro inmutable en `auditoria.html`.
- **RF-19 y RF-20 (Roles y Catálogos):** Separación de perfiles Secretaría/Bedelía y catálogo completo de 20 licencias ministeriales.

---

## 🎨 Sistema de Diseño y Accesibilidad

- **Modo Oscuro Permanente:** Configurado a nivel global en `templates/base.html` con paleta institucional de alto contraste (`#18181B`, `#242424`, `#E0C45D` dorado institucional).
- **Optimización para Impresión en Papel:** Tanto las tablas web como las planillas Excel exportables utilizan bordes delgados de alto contraste y celdas sin rellenos saturados, permitiendo una firma manual clara y un ahorro sustancial de tóner.

---

## 🎓 Créditos y Autoría
Proyecto Final de Cátedra — **Tecnicatura Superior en Desarrollo de Software**  
**Instituto de Educación Superior de Educación Técnica y Formación Profesional (IESETyFP)**  
*Resistencia, Chaco, Argentina — Ciclo Lectivo 2026*
