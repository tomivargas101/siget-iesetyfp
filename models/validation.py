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

            # Condición de solapamiento: max(inicio1, inicio2) < min(fin1, fin2)
            if max(new_start, ex_start) < min(new_end, ex_end):
                sub_name = desig.subject.name if desig.subject else "Materia ID " + str(desig.subject_id)
                conflict_msg = (
                    f"INCOMPATIBILIDAD HORARIA: Existe superposición el día {day_of_week}.\n"
                    f"Conflicto con la cátedra '{sub_name}' ({desig.start_time} - {desig.end_time})."
                )
                return False, conflict_msg

        return True, "Horario compatible sin superposición."
