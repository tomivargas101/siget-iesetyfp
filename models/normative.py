"""
Módulo de Catálogo y Reglas Normativas del Instituto (RN-01 a RN-08).

Implementa las directrices oficiales para la gestión docente y el procesamiento de novedades:
- RN-01: Identificación unívoca de persona por DNI (almacenado como texto) y datos comunes almacenados una sola vez.
- RN-02: Múltiples designaciones por persona (cargos, materias, situación de revista: TIT, INT, SUP).
- RN-03: Conservación del historial completo de designaciones y registros de asistencia (bajas lógicas sin borrado físico).
- RN-04: Cuadro DL-01 - Exclusivo para licencias por enfermedad (catálogo médico).
- RN-05: Cuadro DL-02 - Inasistencias, permisos y otras licencias que no sean por enfermedad.
- RN-06: Una inasistencia solo puede abarcar un día (Desde == Hasta, Total Días == 1).
- RN-07: Autocompletado normativo de columna "Oficina" con el valor 1452.
- RN-08: Autocompletado normativo de columna "Año" con el año calendario actual.
"""

from datetime import datetime, date
from typing import Optional, Union

# ==============================================================================
# CONSTANTES NORMATIVAS INSTITUCIONALES (RN-07, RN-08, RN-01, RN-02)
# ==============================================================================
DEFAULT_OFFICE_CODE: int = 1452  # RN-07: Código de oficina oficial de liquidaciones

REVISTA_TIT: str = "TIT"  # Titular
REVISTA_INT: str = "INT"  # Interino / Provisional
REVISTA_SUP: str = "SUP"  # Suplente

REVISTA_CODES: list[str] = [REVISTA_TIT, REVISTA_INT, REVISTA_SUP]

# Estados cerrados acordados (Documento de Requerimientos v2.0):
# P (Permiso), I (Inasistencia - estado por defecto), LIC (Licencia), LT (Largo tratamiento), PR (Presente)
STATUS_PERMISO: str = "P"
STATUS_INASISTENCIA: str = "I"
STATUS_LIC: str = "LIC"
STATUS_LARGO_TRATAMIENTO: str = "LT"
STATUS_PRESENTE_CODE: str = "PR"

# Compatibilidad con nomenclaturas históricas
STATUS_PRESENTE: str = "Presente"
STATUS_AUSENTE_AVISO: str = "Ausente c/aviso"
STATUS_AUSENTE_SIN_AVISO: str = "Ausente s/aviso"
STATUS_LICENCIA: str = "Licencia"
STATUS_CLOSED_CODES: list[str] = [
    STATUS_INASISTENCIA, STATUS_PRESENTE_CODE, STATUS_PERMISO, STATUS_LIC, STATUS_LARGO_TRATAMIENTO
]

# ==============================================================================
# CATÁLOGO DE ARTÍCULOS Y MOTIVOS NORMATIVOS (RN-04 & RN-05)
# ==============================================================================

# Licencias Médicas / Salud (Cuadro DL-01 - RN-04)
MEDICAL_ARTICLES: dict[str, str] = {
    "ART_48": "Art. 48 - Tratamiento Médico Prolongado",
    "ART_47": "Art. 47 - Enfermedad Corta Duración",
    "ART_114_A": "Art. 114 a - Afección Común / Salud",
    "ART_114_B": "Art. 114 b - Largo Tratamiento de Salud",
    "ART_114_C": "Art. 114 c - Atención Familiar Enfermo",
    "ART_70": "Art. 70 - Licencia Médica / ART",
    "ENFERMEDAD_COMUN": "Licencia Médica - Enfermedad Común",
    "ACCIDENTE_TRABAJO": "Accidente de Trabajo / ART",
    "REPOSO_MEDICO": "Reposo Médico Domiciliario"
}

# ==============================================================================
# CATÁLOGO MAESTRO DE LICENCIAS Y NOVEDADES (HOJAS 1 A 6 - REQUERIMIENTOS V2.0)
# ==============================================================================
MASTER_LICENSE_CATALOG: list[dict] = [
    # --- HOJA 1: Licencias Médicas de Corto Tratamiento / Afección Común (Cuadro IL-01 / DL-01) ---
    {
        "sheet": 1,
        "sheet_name": "Hoja 1: Enfermedad Corto Tratamiento",
        "article": "Art. 114 a",
        "code": "114A",
        "name": "Afección Común / Corto Tratamiento de Salud",
        "target_cuadro": "IL-01",
        "alias_cuadro": "DL-01",
        "is_medical": True,
        "max_days_annual": 25
    },
    {
        "sheet": 1,
        "sheet_name": "Hoja 1: Enfermedad Corto Tratamiento",
        "article": "Art. 47",
        "code": "ART-47",
        "name": "Enfermedad Personal Común / Reposo Médico",
        "target_cuadro": "IL-01",
        "alias_cuadro": "DL-01",
        "is_medical": True,
        "max_days_annual": 30
    },
    {
        "sheet": 1,
        "sheet_name": "Hoja 1: Enfermedad Corto Tratamiento",
        "article": "Art. 114 c",
        "code": "114C",
        "name": "Atención Familiar Enfermo",
        "target_cuadro": "IL-01",
        "alias_cuadro": "DL-01",
        "is_medical": True,
        "max_days_annual": 20
    },

    # --- HOJA 2: Licencias Médicas de Largo Tratamiento y Riesgos de Trabajo (Cuadro IL-01 / DL-01) ---
    {
        "sheet": 2,
        "sheet_name": "Hoja 2: Largo Tratamiento y ART",
        "article": "Art. 114 b",
        "code": "114B",
        "name": "Largo Tratamiento de Salud (LT)",
        "target_cuadro": "IL-01",
        "alias_cuadro": "DL-01",
        "is_medical": True,
        "max_days_annual": 730
    },
    {
        "sheet": 2,
        "sheet_name": "Hoja 2: Largo Tratamiento y ART",
        "article": "Art. 48",
        "code": "ART-48",
        "name": "Tratamiento Médico Prolongado / Junta Médica",
        "target_cuadro": "IL-01",
        "alias_cuadro": "DL-01",
        "is_medical": True,
        "max_days_annual": 730
    },
    {
        "sheet": 2,
        "sheet_name": "Hoja 2: Largo Tratamiento y ART",
        "article": "Art. 70",
        "code": "ART-70",
        "name": "Accidente de Trabajo / ART",
        "target_cuadro": "IL-01",
        "alias_cuadro": "DL-01",
        "is_medical": True,
        "max_days_annual": None
    },

    # --- HOJA 3: Inasistencias y Permisos Particulares (Cuadro IL-02 / DL-02) ---
    {
        "sheet": 3,
        "sheet_name": "Hoja 3: Inasistencias y Permisos",
        "article": "Inasistencia Injustificada",
        "code": "I",
        "name": "Inasistencia sin Aviso / Injustificada",
        "target_cuadro": "IL-02",
        "alias_cuadro": "DL-02",
        "is_medical": False,
        "max_days_annual": 10
    },
    {
        "sheet": 3,
        "sheet_name": "Hoja 3: Inasistencias y Permisos",
        "article": "Inasistencia Justificada",
        "code": "IJ",
        "name": "Inasistencia Justificada con Aviso",
        "target_cuadro": "IL-02",
        "alias_cuadro": "DL-02",
        "is_medical": False,
        "max_days_annual": 10
    },
    {
        "sheet": 3,
        "sheet_name": "Hoja 3: Inasistencias y Permisos",
        "article": "Art. 115",
        "code": "115",
        "name": "Asuntos o Razones Particulares (P)",
        "target_cuadro": "IL-02",
        "alias_cuadro": "DL-02",
        "is_medical": False,
        "max_days_annual": 6
    },

    # --- HOJA 4: Licencias Familiares, Maternidad, Nacimiento y Adopción (Cuadro IL-02 / DL-02) ---
    {
        "sheet": 4,
        "sheet_name": "Hoja 4: Maternidad y Familiares",
        "article": "Art. 114 d",
        "code": "114D",
        "name": "Maternidad / Embarazo",
        "target_cuadro": "IL-02",
        "alias_cuadro": "DL-02",
        "is_medical": False,
        "max_days_annual": 135
    },
    {
        "sheet": 4,
        "sheet_name": "Hoja 4: Maternidad y Familiares",
        "article": "Art. 114 e",
        "code": "114E",
        "name": "Nacimiento de Hijo / Paternidad",
        "target_cuadro": "IL-02",
        "alias_cuadro": "DL-02",
        "is_medical": False,
        "max_days_annual": 15
    },
    {
        "sheet": 4,
        "sheet_name": "Hoja 4: Maternidad y Familiares",
        "article": "Art. 114 f",
        "code": "114F",
        "name": "Adopción de Menores",
        "target_cuadro": "IL-02",
        "alias_cuadro": "DL-02",
        "is_medical": False,
        "max_days_annual": 90
    },

    # --- HOJA 5: Licencias por Matrimonio y Duelo Familiar (Cuadro IL-02 / DL-02) ---
    {
        "sheet": 5,
        "sheet_name": "Hoja 5: Matrimonio y Duelo",
        "article": "Art. 114 g",
        "code": "114G",
        "name": "Matrimonio del Agente",
        "target_cuadro": "IL-02",
        "alias_cuadro": "DL-02",
        "is_medical": False,
        "max_days_annual": 12
    },
    {
        "sheet": 5,
        "sheet_name": "Hoja 5: Matrimonio y Duelo",
        "article": "Art. 114 h",
        "code": "114H",
        "name": "Matrimonio de Hijo",
        "target_cuadro": "IL-02",
        "alias_cuadro": "DL-02",
        "is_medical": False,
        "max_days_annual": 2
    },
    {
        "sheet": 5,
        "sheet_name": "Hoja 5: Matrimonio y Duelo",
        "article": "Art. 114 i",
        "code": "114I",
        "name": "Fallecimiento Cónyuge, Padres o Hijos",
        "target_cuadro": "IL-02",
        "alias_cuadro": "DL-02",
        "is_medical": False,
        "max_days_annual": 5
    },
    {
        "sheet": 5,
        "sheet_name": "Hoja 5: Matrimonio y Duelo",
        "article": "Art. 114 j",
        "code": "114J",
        "name": "Fallecimiento Hermanos o Parientes Segundo Grado",
        "target_cuadro": "IL-02",
        "alias_cuadro": "DL-02",
        "is_medical": False,
        "max_days_annual": 3
    },

    # --- HOJA 6: Licencias Especiales, Exámenes, Perfeccionamiento y Gremial (Cuadro IL-02 / DL-02) ---
    {
        "sheet": 6,
        "sheet_name": "Hoja 6: Exámenes y Licencias Especiales",
        "article": "Art. 114 l",
        "code": "114L",
        "name": "Mesa de Examen / Estudio y Perfeccionamiento",
        "target_cuadro": "IL-02",
        "alias_cuadro": "DL-02",
        "is_medical": False,
        "max_days_annual": 28
    },
    {
        "sheet": 6,
        "sheet_name": "Hoja 6: Exámenes y Licencias Especiales",
        "article": "Art. 114 m",
        "code": "114M",
        "name": "Donación de Sangre",
        "target_cuadro": "IL-02",
        "alias_cuadro": "DL-02",
        "is_medical": False,
        "max_days_annual": 2
    },
    {
        "sheet": 6,
        "sheet_name": "Hoja 6: Exámenes y Licencias Especiales",
        "article": "Art. 114 n",
        "code": "114N",
        "name": "Actividad Gremial y Representación",
        "target_cuadro": "IL-02",
        "alias_cuadro": "DL-02",
        "is_medical": False,
        "max_days_annual": None
    },
    {
        "sheet": 6,
        "sheet_name": "Hoja 6: Exámenes y Licencias Especiales",
        "article": "Art. 114 o",
        "code": "114O",
        "name": "Fuerza Mayor / Razones Climáticas",
        "target_cuadro": "IL-02",
        "alias_cuadro": "DL-02",
        "is_medical": False,
        "max_days_annual": None
    },
    {
        "sheet": 6,
        "sheet_name": "Hoja 6: Exámenes y Licencias Especiales",
        "article": "Art. 114 p",
        "code": "114P",
        "name": "Cargo de Mayor Jerarquía / Reserva de Cargo",
        "target_cuadro": "IL-02",
        "alias_cuadro": "DL-02",
        "is_medical": False,
        "max_days_annual": None
    }
]

# ==============================================================================
# CALENDARIO ESCOLAR INSTITUCIONAL Y FERIADOS (RF-10)
# ==============================================================================
ACADEMIC_CALENDAR_HOLIDAYS: list[dict] = [
    {"date": "01-01", "name": "Año Nuevo", "type": "Feriado Nacional Inamovible"},
    {"date": "03-24", "name": "Día Nacional de la Memoria por la Verdad y la Justicia", "type": "Feriado Nacional Inamovible"},
    {"date": "04-02", "name": "Día del Veterano y de los Caídos en Malvinas", "type": "Feriado Nacional Inamovible"},
    {"date": "05-01", "name": "Día del Trabajador", "type": "Feriado Nacional Inamovible"},
    {"date": "05-25", "name": "Día de la Revolución de Mayo", "type": "Feriado Nacional Inamovible"},
    {"date": "06-17", "name": "Paso a la Inmortalidad del Gral. Don Martín Miguel de Güemes", "type": "Feriado Nacional"},
    {"date": "06-20", "name": "Paso a la Inmortalidad del Gral. Manuel Belgrano", "type": "Feriado Nacional Inamovible"},
    {"date": "07-09", "name": "Día de la Independencia", "type": "Feriado Nacional Inamovible"},
    # Receso Escolar de Invierno (Julio institucional)
    {"date": "07-13", "name": "Receso Escolar de Invierno", "type": "Receso Invernal Institucional"},
    {"date": "07-14", "name": "Receso Escolar de Invierno", "type": "Receso Invernal Institucional"},
    {"date": "07-15", "name": "Receso Escolar de Invierno", "type": "Receso Invernal Institucional"},
    {"date": "07-16", "name": "Receso Escolar de Invierno", "type": "Receso Invernal Institucional"},
    {"date": "07-17", "name": "Receso Escolar de Invierno", "type": "Receso Invernal Institucional"},
    {"date": "07-20", "name": "Receso Escolar de Invierno", "type": "Receso Invernal Institucional"},
    {"date": "07-21", "name": "Receso Escolar de Invierno", "type": "Receso Invernal Institucional"},
    {"date": "07-22", "name": "Receso Escolar de Invierno", "type": "Receso Invernal Institucional"},
    {"date": "07-23", "name": "Receso Escolar de Invierno", "type": "Receso Invernal Institucional"},
    {"date": "07-24", "name": "Receso Escolar de Invierno", "type": "Receso Invernal Institucional"},
    {"date": "08-17", "name": "Paso a la Inmortalidad del Gral. José de San Martín", "type": "Feriado Nacional"},
    {"date": "08-25", "name": "Día de la Autonomía de Catamarca", "type": "Feriado Provincial"},
    {"date": "09-11", "name": "Día del Maestro", "type": "Asueto Escolar Docente"},
    {"date": "09-21", "name": "Día del Estudiante", "type": "Asueto Nivel Terciario"},
    {"date": "10-12", "name": "Día del Respeto a la Diversidad Cultural", "type": "Feriado Nacional"},
    {"date": "11-20", "name": "Día de la Soberanía Nacional", "type": "Feriado Nacional"},
    {"date": "12-08", "name": "Inmaculada Concepción (Virgen del Valle)", "type": "Feriado Provincial y Nacional"},
    {"date": "12-25", "name": "Navidad", "type": "Feriado Nacional Inamovible"}
]

# Inasistencias y Licencias No Médicas (Cuadro DL-02 - RN-05)
NON_MEDICAL_ARTICLES: dict[str, str] = {
    # Inasistencias (RN-06: 1 día exclusivo)
    "AUSENTE_AVISO": "Inasistencia con Aviso",
    "AUSENTE_SIN_AVISO": "Inasistencia Injustificada / sin Aviso",
    "FALTA_PUNTUAL": "Falta Puntual de Jornada",
    # Permisos y otras licencias no médicas
    "ART_114_D": "Art. 114 d - Maternidad / Paternidad",
    "ART_115": "Art. 115 - Razones Particulares",
    "DUELO": "Duelo Familiar",
    "MESA_EXAMEN": "Mesa de Examen / Estudio",
    "DONACION_SANGRE": "Donación de Sangre",
    "CAPACITACION": "Capacitación / Perfeccionamiento Docente",
    "TRAMITE_PERSONAL": "Trámites Personales Justificados",
    "GREMIAL": "Actividad Gremial",
    "FUERZA_MAYOR": "Fuerza Mayor / Climática"
}

# Palabras clave para clasificación inteligente de licencias médicas (RN-04)
MEDICAL_KEYWORDS: tuple[str, ...] = (
    "art. 48", "art 48", "art. 47", "art 47",
    "art. 114 a", "art 114 a", "art. 114a",
    "art. 114 b", "art 114 b", "art. 114b",
    "art. 114 c", "art 114 c", "art. 114c",
    "art. 70", "art 70",
    "salud", "médic", "medic", "enferm", "patolog", "quirurg", "quirúrg",
    "reposo", "psicol", "psiquiatr", "odontol", "accidente",
    "art", "tratamiento médico", "familiar enfermo", "aislamiento", "covid"
)

# Palabras clave para inasistencias (RN-06: regla de 1 solo día)
ABSENCE_KEYWORDS: tuple[str, ...] = (
    "ausente", "falta", "inasistencia", "no asistió", "no asistio"
)


class NormativeClassifier:
    """
    Clasificador y validador de normas institucionales para personal y novedades.
    """

    @staticmethod
    def normalize_dni(dni: any) -> str:
        """
        Garantiza que el DNI se almacene y manipule como texto limpio (RN-01),
        preservando ceros a la izquierda y sin caracteres no numéricos o espacios.
        """
        if dni is None:
            return ""
        dni_str = str(dni).strip()
        # Filtrar caracteres si viniera formateado con puntos
        digits_only = "".join(ch for ch in dni_str if ch.isdigit())
        return digits_only if digits_only else dni_str

    @staticmethod
    def normalize_revista(revista: Optional[str]) -> str:
        """
        Normaliza la situación de revista al código estándar de tres letras (RN-02):
        'TIT' (Titular), 'INT' (Interino / Provisional), 'SUP' (Suplente).
        """
        if not revista:
            return REVISTA_TIT

        rev_upper = revista.strip().upper()
        if rev_upper.startswith("TIT"):
            return REVISTA_TIT
        elif rev_upper.startswith("INT") or rev_upper.startswith("PROV"):
            return REVISTA_INT
        elif rev_upper.startswith("SUP"):
            return REVISTA_SUP
        return rev_upper[:3]

    @staticmethod
    def is_medical_license(status: str, observations: str = "") -> bool:
        """
        Determina si un registro corresponde a una Licencia por Enfermedad (RN-04 -> Cuadro DL-01).
        """
        st_clean = (status or "").strip().lower()
        obs_clean = (observations or "").strip().lower()

        # Si el estado es directamente "Licencia" y las observaciones refieren a salud
        if st_clean == "licencia":
            if not obs_clean:
                # Por defecto normativo ante ausencia de detalle médico en licencia
                return True
            return any(kw in obs_clean for kw in MEDICAL_KEYWORDS)

        # Si en observaciones se menciona explícitamente salud o artículo médico
        return any(kw in obs_clean for kw in MEDICAL_KEYWORDS)

    @staticmethod
    def is_absence(status: str, observations: str = "") -> bool:
        """
        Determina si el registro es una inasistencia puntual (RN-06: solo 1 día).
        """
        st_clean = (status or "").strip().lower()
        if any(kw in st_clean for kw in ("ausente", "falta", "inasistencia")):
            return True

        obs_clean = (observations or "").strip().lower()
        if any(kw in obs_clean for kw in ("ausente", "falta sin aviso", "falta con aviso")):
            return True

        return False

    @staticmethod
    def is_non_medical_license(status: str, observations: str = "") -> bool:
        """
        Determina si un registro corresponde a un permiso o licencia no médica (RN-05 -> Cuadro DL-02).
        """
        if NormativeClassifier.is_medical_license(status, observations):
            return False

        st_clean = (status or "").strip().lower()
        if st_clean == "licencia":
            return True

        obs_clean = (observations or "").strip().lower()
        non_med_keywords = (
            "maternidad", "paternidad", "duelo", "examen", "mesa",
            "art. 115", "art 115", "razones particulares", "donacion", "donación",
            "capacitacion", "capacitación", "gremial", "fuerza mayor", "permiso"
        )
        return any(kw in obs_clean for kw in non_med_keywords)

    @staticmethod
    def classify_target_table(status: str, observations: str = "") -> str:
        """
        Clasifica un registro de asistencia en:
        - 'DL-01': Cuadro DL-01 (Licencias por Enfermedad - RN-04)
        - 'DL-02': Cuadro DL-02 (Inasistencias, Permisos y Licencias no médicas - RN-05)
        - 'PRESENTE': Asistencia normal (no computa para DL-01 ni DL-02)
        - 'IGNORAR': Sin registrar o estado desconocido
        """
        st_clean = (status or "").strip().lower()
        if st_clean == "presente":
            return "PRESENTE"
        if st_clean in ("sin registrar", "", "pendiente"):
            return "IGNORAR"

        if NormativeClassifier.is_medical_license(status, observations):
            return "DL-01"

        return "DL-02"

    @staticmethod
    def get_current_academic_year() -> int:
        """Retorna el año calendario actual (RN-08)."""
        return datetime.now().year

    @staticmethod
    def get_default_office() -> int:
        """Retorna el código oficial de oficina 1452 (RN-07)."""
        return DEFAULT_OFFICE_CODE

    @staticmethod
    def get_closed_status_codes() -> list[str]:
        """Retorna el catálogo cerrado de marcas de asistencia (RF-08): PR, I, P, LIC, LT."""
        return ["PR", "I", "P", "LIC", "LT"]

    @staticmethod
    def get_master_catalog() -> list[dict]:
        """Retorna el catálogo maestro completo de licencias y novedades (Hojas 1 a 6)."""
        return MASTER_LICENSE_CATALOG

    @staticmethod
    def get_article_details(search_key: str) -> Optional[dict]:
        """
        Busca los detalles de un artículo o código en el catálogo maestro (Hojas 1-6).
        Autocompleta el código y deriva al cuadro correspondiente (IL-01 o IL-02 / DL-01 o DL-02).
        """
        if not search_key:
            return None
        norm_key = str(search_key).lower().strip()
        clean_key = "".join(ch for ch in norm_key if ch.isalnum())

        # 1. Coincidencia exacta
        for item in MASTER_LICENSE_CATALOG:
            clean_code = "".join(ch for ch in item["code"].lower() if ch.isalnum())
            clean_art = "".join(ch for ch in item["article"].lower() if ch.isalnum())
            if item["code"].lower() == norm_key or item["article"].lower() == norm_key or clean_code == clean_key or clean_art == clean_key:
                return item

        # 2. Coincidencia parcial
        for item in MASTER_LICENSE_CATALOG:
            clean_code = "".join(ch for ch in item["code"].lower() if ch.isalnum())
            clean_art = "".join(ch for ch in item["article"].lower() if ch.isalnum())
            if (item["code"].lower() in norm_key or
                item["article"].lower() in norm_key or
                norm_key in item["name"].lower() or
                (len(clean_code) >= 3 and clean_key.startswith(clean_code)) or
                (len(clean_art) >= 3 and clean_key.startswith(clean_art))):
                return item

        # 3. Fallback por clasificación médica o no médica
        is_med = NormativeClassifier.is_medical_license("Licencia", norm_key)
        return {
            "sheet": 1 if is_med else 3,
            "sheet_name": "Hoja 1: Salud" if is_med else "Hoja 3: Inasistencias y Permisos",
            "article": search_key,
            "code": "MED-GEN" if is_med else "GEN-NO-MED",
            "name": search_key,
            "target_cuadro": "IL-01" if is_med else "IL-02",
            "alias_cuadro": "DL-01" if is_med else "DL-02",
            "is_medical": is_med,
            "max_days_annual": 25 if is_med else 6
        }

    @staticmethod
    def classify_novelty(status: str, observation: str = "") -> dict:
        """
        Clasifica una novedad en IL-01 o IL-02 según las 6 hojas del catálogo maestro:
        - Hoja 1 y 2 -> IL-01 (Licencias Médicas y Salud - RN-04)
        - Hoja 3 a 6 -> IL-02 (Inasistencias, Permisos y Licencias Especiales - RN-05)
        """
        text = f"{status or ''} {observation or ''}".strip()
        norm_status = (status or "").strip().upper()

        if norm_status == "LT":
            return {
                "target_cuadro": "IL-01",
                "alias_cuadro": "DL-01",
                "tipo": "Licencia Médica - Largo Tratamiento (LT)",
                "can_group": True,
                "code": "114B"
            }

        if norm_status == "P":
            return {
                "target_cuadro": "IL-02",
                "alias_cuadro": "DL-02",
                "tipo": "Permiso Oficial (P)",
                "can_group": True,
                "code": "115"
            }

        if norm_status == "I" or (not NormativeClassifier.is_medical_license(status, observation) and NormativeClassifier.is_absence(status, observation)):
            return {
                "target_cuadro": "IL-02",
                "alias_cuadro": "DL-02",
                "tipo": "Inasistencia (I)",
                "can_group": False,  # RN-06: 1 solo día
                "code": "I"
            }

        details = NormativeClassifier.get_article_details(text) or NormativeClassifier.get_article_details(status)
        if details and (details.get("sheet") in (1, 2) or details.get("is_medical") or details.get("target_cuadro") == "IL-01"):
            return {
                "target_cuadro": "IL-01",
                "alias_cuadro": "DL-01",
                "tipo": details.get("name") or "Licencia Médica / Salud",
                "can_group": True,
                "code": details.get("code") or "114A"
            }

        if norm_status == "LIC" or NormativeClassifier.is_medical_license(status, observation):
            return {
                "target_cuadro": "IL-01",
                "alias_cuadro": "DL-01",
                "tipo": "Licencia Médica / Salud",
                "can_group": True,
                "code": details.get("code") if details else "114A"
            }

        return {
            "target_cuadro": "IL-02",
            "alias_cuadro": "DL-02",
            "tipo": details.get("name") if details else "Novedad / Licencia Ordinaria",
            "can_group": True,
            "code": details.get("code") if details else "ORD-GEN"
        }

    @staticmethod
    def get_calendar_day_info(date_val: Union[date, str, datetime]) -> dict:
        """
        Determina si una fecha corresponde a un día inhábil escolar (feriado nacional,
        asueto educativo, receso invernal o fin de semana) para la interfaz operativa (RF-10).
        """
        if isinstance(date_val, str):
            parts = date_val.split("-") if "-" in date_val else date_val.split("/")
            if len(parts) == 3:
                if len(parts[0]) == 4:  # YYYY-MM-DD
                    d_obj = date(int(parts[0]), int(parts[1]), int(parts[2]))
                else:  # DD/MM/YYYY
                    d_obj = date(int(parts[2]), int(parts[1]), int(parts[0]))
            else:
                return {"is_non_working": False, "reason": None, "type": None, "is_weekend": False, "badge": None}
        elif isinstance(date_val, datetime):
            d_obj = date_val.date()
        else:
            d_obj = date_val

        # Fin de semana (5: Sábado, 6: Domingo)
        weekday = d_obj.weekday()
        is_weekend = (weekday in (5, 6))

        mm_dd = f"{d_obj.month:02d}-{d_obj.day:02d}"
        for h in ACADEMIC_CALENDAR_HOLIDAYS:
            if h["date"] == mm_dd:
                return {
                    "is_non_working": True,
                    "reason": h["name"],
                    "type": h["type"],
                    "is_weekend": is_weekend,
                    "badge": f"{h['name']} ({h['type']})"
                }

        if is_weekend:
            day_name = "Sábado" if weekday == 5 else "Domingo"
            return {
                "is_non_working": True,
                "reason": day_name,
                "type": "Fin de Semana",
                "is_weekend": True,
                "badge": f"{day_name} (Fin de Semana - Sin actividad áulica)"
            }

        return {
            "is_non_working": False,
            "reason": None,
            "type": None,
            "is_weekend": False,
            "badge": None
        }
