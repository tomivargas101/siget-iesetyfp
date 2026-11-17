from datetime import datetime, date
from typing import Optional, Union

DEFAULT_OFFICE_CODE: int = 1452

REVISTA_TIT: str = "TIT"
REVISTA_INT: str = "INT"
REVISTA_SUP: str = "SUP"

REVISTA_CODES: list[str] = [REVISTA_TIT, REVISTA_INT, REVISTA_SUP]

STATUS_PERMISO: str = "P"
STATUS_INASISTENCIA: str = "I"
STATUS_LIC: str = "LIC"
STATUS_LARGO_TRATAMIENTO: str = "LT"
STATUS_PRESENTE_CODE: str = "PR"

STATUS_PRESENTE: str = "Presente"
STATUS_AUSENTE_AVISO: str = "Ausente c/aviso"
STATUS_AUSENTE_SIN_AVISO: str = "Ausente s/aviso"
STATUS_LICENCIA: str = "Licencia"
STATUS_CLOSED_CODES: list[str] = [
    STATUS_INASISTENCIA, STATUS_PRESENTE_CODE, STATUS_PERMISO, STATUS_LIC, STATUS_LARGO_TRATAMIENTO
]

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

MASTER_LICENSE_CATALOG: list[dict] = [
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

ACADEMIC_CALENDAR_HOLIDAYS: list[dict] = [
    {"date": "01-01", "name": "Año Nuevo", "type": "Feriado Nacional Inamovible"},
    {"date": "03-24", "name": "Día Nacional de la Memoria por la Verdad y la Justicia", "type": "Feriado Nacional Inamovible"},
    {"date": "04-02", "name": "Día del Veterano y de los Caídos en Malvinas", "type": "Feriado Nacional Inamovible"},
    {"date": "05-01", "name": "Día del Trabajador", "type": "Feriado Nacional Inamovible"},
    {"date": "05-25", "name": "Día de la Revolución de Mayo", "type": "Feriado Nacional Inamovible"},
    {"date": "06-17", "name": "Paso a la Inmortalidad del Gral. Don Martín Miguel de Güemes", "type": "Feriado Nacional"},
    {"date": "06-20", "name": "Paso a la Inmortalidad del Gral. Manuel Belgrano", "type": "Feriado Nacional Inamovible"},
    {"date": "07-09", "name": "Día de la Independencia", "type": "Feriado Nacional Inamovible"},
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

NON_MEDICAL_ARTICLES: dict[str, str] = {
    "AUSENTE_AVISO": "Inasistencia con Aviso",
    "AUSENTE_SIN_AVISO": "Inasistencia Injustificada / sin Aviso",
    "FALTA_PUNTUAL": "Falta Puntual de Jornada",
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

ABSENCE_KEYWORDS: tuple[str, ...] = (
    "ausente", "falta", "inasistencia", "no asistió", "no asistio"
)


class NormativeClassifier:
    @staticmethod
    def normalize_dni(dni: any) -> str:
        if dni is None:
            return ""
        dni_str = str(dni).strip()
        digits_only = "".join(ch for ch in dni_str if ch.isdigit())
        return digits_only if digits_only else dni_str

    @staticmethod
    def normalize_revista(revista: Optional[str]) -> str:
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
        st_clean = (status or "").strip().lower()
        obs_clean = (observations or "").strip().lower()

        if st_clean == "licencia":
            if not obs_clean:
                return True
            return any(kw in obs_clean for kw in MEDICAL_KEYWORDS)

        return any(kw in obs_clean for kw in MEDICAL_KEYWORDS)

    @staticmethod
    def is_absence(status: str, observations: str = "") -> bool:
        st_clean = (status or "").strip().lower()
        if any(kw in st_clean for kw in ("ausente", "falta", "inasistencia")):
            return True

        obs_clean = (observations or "").strip().lower()
        if any(kw in obs_clean for kw in ("ausente", "falta sin aviso", "falta con aviso")):
            return True

        return False

    @staticmethod
    def is_non_medical_license(status: str, observations: str = "") -> bool:
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
        return datetime.now().year

    @staticmethod
    def get_default_office() -> int:
        return DEFAULT_OFFICE_CODE

    @staticmethod
    def get_closed_status_codes() -> list[str]:
        return ["PR", "I", "P", "LIC", "LT"]

    @staticmethod
    def get_master_catalog() -> list[dict]:
        return MASTER_LICENSE_CATALOG

    @staticmethod
    def get_article_details(search_key: str) -> Optional[dict]:
        if not search_key:
            return None
        norm_key = str(search_key).lower().strip()
        clean_key = "".join(ch for ch in norm_key if ch.isalnum())

        for item in MASTER_LICENSE_CATALOG:
            clean_code = "".join(ch for ch in item["code"].lower() if ch.isalnum())
            clean_art = "".join(ch for ch in item["article"].lower() if ch.isalnum())
            if item["code"].lower() == norm_key or item["article"].lower() == norm_key or clean_code == clean_key or clean_art == clean_key:
                return item

        for item in MASTER_LICENSE_CATALOG:
            clean_code = "".join(ch for ch in item["code"].lower() if ch.isalnum())
            clean_art = "".join(ch for ch in item["article"].lower() if ch.isalnum())
            if (item["code"].lower() in norm_key or
                item["article"].lower() in norm_key or
                norm_key in item["name"].lower() or
                (len(clean_code) >= 3 and clean_key.startswith(clean_code)) or
                (len(clean_art) >= 3 and clean_key.startswith(clean_art))):
                return item

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
                "can_group": False,
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
        if isinstance(date_val, str):
            parts = date_val.split("-") if "-" in date_val else date_val.split("/")
            if len(parts) == 3:
                if len(parts[0]) == 4:
                    d_obj = date(int(parts[0]), int(parts[1]), int(parts[2]))
                else:
                    d_obj = date(int(parts[2]), int(parts[1]), int(parts[0]))
            else:
                return {"is_non_working": False, "reason": None, "type": None, "is_weekend": False, "badge": None}
        elif isinstance(date_val, datetime):
            d_obj = date_val.date()
        else:
            d_obj = date_val

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
