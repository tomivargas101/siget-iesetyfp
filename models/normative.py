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
from typing import Optional

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
