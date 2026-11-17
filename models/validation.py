import re
from datetime import datetime
from sqlalchemy.orm import Session
from database.schema import Designation, Teacher, Subject

def parse_time_to_minutes(time_str: str) -> int:
    """Convierte una cadena 'HH:MM' a minutos desde la medianoche."""
    try:
        parts = time_str.strip().split(":")
        hours = int(parts[0])
        minutes = int(parts[1]) if len(parts) > 1 else 0
        return hours * 60 + minutes
    except Exception:
        return 0

def format_minutes_to_time(minutes: int) -> str:
    h = minutes // 60
    m = minutes % 60
    return f"{h:02d}:{m:02d}"

def validate_dni(dni: any) -> tuple[bool, str, str]:
    """
    Valida el formato de DNI argentino (6 a 8 dígitos numéricos).
    Retorna: (is_valid, clean_dni, error_message)
    """
    if dni is None or str(dni).strip() == "":
        return False, "", "El DNI es un campo obligatorio."
    raw = str(dni).strip()
    clean = re.sub(r"[\.\s\-]", "", raw)
    if not clean.isdigit():
        return False, clean, f"El DNI solo puede contener dígitos numéricos. Se ingresó: '{raw}'."
    if len(clean) < 6 or len(clean) > 8:
        return False, clean, f"El DNI debe contener 7 u 8 dígitos numéricos válidos (ej. 28456123). Se ingresó un valor incompleto o fuera de rango: '{raw}'."
    return True, clean, ""

def validate_cuil(cuil: any, dni: any = None) -> tuple[bool, str, str]:
    """
    Valida el formato y coherencia del CUIL argentino (11 dígitos, prefijo válido y match de DNI).
    Retorna: (is_valid, clean_cuil, error_message)
    """
    if cuil is None or str(cuil).strip() == "":
        return True, "", ""
    raw = str(cuil).strip()
    digits = re.sub(r"\D", "", raw)
    if len(digits) != 11:
        return False, "", f"El CUIL/CUIT debe contener exactamente 11 dígitos numéricos (ej. 20-28456123-7). Se recibió: '{raw}'."
    prefix = digits[:2]
    if prefix not in ["20", "23", "24", "27", "30", "33", "34"]:
        return False, "", f"El prefijo del CUIL '{prefix}' no es válido en el sistema argentino."
    if dni:
        clean_dni = re.sub(r"\D", "", str(dni))
        cuil_dni = digits[2:10]
        matches = (cuil_dni == clean_dni) or (len(clean_dni) == 7 and (cuil_dni == "0" + clean_dni or digits[3:10] == clean_dni)) or (len(clean_dni) == 6 and cuil_dni.endswith(clean_dni))
        if not matches:
            return False, "", f"El DNI contenido en el CUIL ({cuil_dni}) no coincide con el DNI del docente ({clean_dni})."
    formatted = f"{digits[:2]}-{digits[2:10]}-{digits[10]}"
    return True, formatted, ""

def validate_name(name: any, field_name: str = "Nombre", min_len: int = 2, max_len: int = 100) -> tuple[bool, str, str]:
    """
    Valida nombres y apellidos evitando cadenas absurdas, números o caracteres inválidos.
    Retorna: (is_valid, clean_name, error_message)
    """
    if name is None or str(name).strip() == "":
        return False, "", f"El campo {field_name} es obligatorio y no puede estar vacío."
    trimmed = str(name).strip()
    if len(trimmed) < min_len:
        return False, trimmed, f"El campo {field_name} debe contener al menos {min_len} caracteres."
    if len(trimmed) > max_len:
        return False, trimmed, f"El campo {field_name} no puede exceder los {max_len} caracteres."
    if not re.match(r"^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s'\-\._]+$", trimmed):
        return False, trimmed, f"El campo {field_name} solo puede contener letras y signos de puntuación válidos."
    letters = re.sub(r"[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ]", "", trimmed)
    if len(letters) <= 4 and re.match(r"^(.)\1+$", letters, re.IGNORECASE):
        return False, trimmed, f"El valor ingresado para {field_name} ('{trimmed}') no parece un nombre o apellido válido."
    if len(letters) <= 4 and not re.search(r"[aeiouáéíóúyü]", letters, re.IGNORECASE):
        return False, trimmed, f"El valor ingresado para {field_name} ('{trimmed}') no contiene vocales válidas."
    return True, trimmed, ""

def validate_legajo(legajo: any) -> tuple[bool, str, str]:
    """
    Valida el número de legajo institucional.
    Retorna: (is_valid, clean_legajo, error_message)
    """
    if legajo is None or str(legajo).strip() == "":
        return False, "", "El número de Legajo es obligatorio."
    trimmed = str(legajo).strip()
    if len(trimmed) < 2:
        return False, trimmed, "El Legajo debe tener al menos 2 caracteres."
    if len(trimmed) > 50:
        return False, trimmed, "El Legajo no puede superar los 50 caracteres."
    if not re.search(r"[a-zA-Z0-9]", trimmed):
        return False, trimmed, "El Legajo debe contener al menos un carácter alfanumérico."
    return True, trimmed, ""

def validate_email(email: any, is_required: bool = False) -> tuple[bool, str, str]:
    """
    Valida formato de correo electrónico.
    Retorna: (is_valid, clean_email, error_message)
    """
    if email is None or str(email).strip() == "":
        if is_required:
            return False, "", "El correo electrónico es obligatorio."
        return True, "", ""
    trimmed = str(email).strip().lower()
    if not re.match(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$", trimmed):
        return False, trimmed, f"El correo electrónico '{trimmed}' tiene un formato inválido."
    return True, trimmed, ""

def validate_max_weekly_hours(hours: any) -> tuple[bool, int, str]:
    """
    Valida que el tope semanal de horas cátedra esté dentro del rango institucional permitido (1 a 30).
    Retorna: (is_valid, clean_hours, error_message)
    """
    if hours is None or str(hours).strip() == "":
        return True, 30, ""
    try:
        val = int(hours)
        if val < 1 or val > 30:
            return False, val, f"El tope semanal institucional no puede exceder las 30 horas cátedra (valor permitido: entre 1 y 30). Se recibió: '{hours}'."
        return True, val, ""
    except (ValueError, TypeError):
        return False, 0, f"El tope semanal de horas cátedra debe ser un número entero válido entre 1 y 30. Se recibió: '{hours}'."

class BusinessValidationService:
    @staticmethod
    def calculate_teacher_active_hours(teacher_id: int, session: Session, exclude_designation_id: int = None) -> int:
        """
        Calcula la suma total de horas cátedra semanales activas para un docente.
        """
        query = session.query(Designation).filter(
            Designation.teacher_id == teacher_id,
            Designation.is_active == True
        )
        if exclude_designation_id:
            query = query.filter(Designation.id != exclude_designation_id)
        
        designations = query.all()
        return sum(d.hours_count for d in designations)

    @classmethod
    def validate_hours_cap(
        cls, 
        teacher_id: int, 
        new_hours: int, 
        session: Session, 
        exclude_designation_id: int = None
    ) -> tuple[bool, int, int, str]:
        """
        Valida que el docente no supere el tope reglamentario semanal (ej. 30 horas cátedra).
        Retorna: (is_valid, horas_actuales, horas_maximas, mensaje)
        """
        teacher = session.query(Teacher).filter(Teacher.id == teacher_id).first()
        if not teacher:
            return False, 0, 0, "Docente no encontrado."

        current_hours = cls.calculate_teacher_active_hours(
            teacher_id, session, exclude_designation_id=exclude_designation_id
        )
        projected_hours = current_hours + new_hours
        max_allowed = teacher.max_weekly_hours or 30

        if projected_hours > max_allowed:
            excess = projected_hours - max_allowed
            msg = (
                f"LÍMITE EXCEDIDO: El docente {teacher.full_name} posee actualmente {current_hours} hs cátedra activas.\n"
                f"Al agregar {new_hours} hs alcanzaría {projected_hours} hs, superando el tope reglamentario "
                f"de {max_allowed} hs semanales por {excess} hs de exceso."
            )
            return False, current_hours, max_allowed, msg

        return True, current_hours, max_allowed, f"Horas válidas ({projected_hours}/{max_allowed} hs semanales)."

    @classmethod
    def validate_schedule_compatibility(
        cls,
        teacher_id: int,
        day_of_week: str,
        start_time: str,
        end_time: str,
        session: Session,
        exclude_designation_id: int = None
    ) -> tuple[bool, str]:
        """
        Valida que no exista superposición de días y horarios con otras designaciones activas del docente.
        Retorna: (is_valid, mensaje_detalle)
        """
        new_start = parse_time_to_minutes(start_time)
        new_end = parse_time_to_minutes(end_time)

        if new_end <= new_start:
            return False, "La hora de finalización debe ser posterior a la hora de inicio."

        query = session.query(Designation).join(Subject).filter(
            Designation.teacher_id == teacher_id,
            Designation.is_active == True,
            Designation.day_of_week == day_of_week
        )
        if exclude_designation_id:
            query = query.filter(Designation.id != exclude_designation_id)

        existing_designations = query.all()

        for desig in existing_designations:
            ex_start = parse_time_to_minutes(desig.start_time)
            ex_end = parse_time_to_minutes(desig.end_time)

            if max(new_start, ex_start) < min(new_end, ex_end):
                sub_name = desig.subject.name if desig.subject else "Materia ID " + str(desig.subject_id)
                conflict_msg = (
                    f"INCOMPATIBILIDAD HORARIA: Existe superposición el día {day_of_week}.\n"
                    f"Conflicto con la cátedra '{sub_name}' ({desig.start_time} - {desig.end_time})."
                )
                return False, conflict_msg

        return True, "Horario compatible sin superposición."
