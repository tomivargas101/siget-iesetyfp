from database.connection import get_db_session
from database.schema import Teacher, Designation
from models.auth import AuthService

REVISTAS = ["Titular", "Provisional", "Interino", "Suplente"]

class TeacherService:
    @staticmethod
    def get_all(search_term: str = "", revista_filter: str = "Todos"):
        session = get_db_session()
        try:
            query = session.query(Teacher)
            if revista_filter and revista_filter != "Todos":
                query = query.filter(Teacher.revista == revista_filter)
            
            if search_term:
                term = f"%{search_term.strip()}%"
                query = query.filter(
                    (Teacher.last_name.ilike(term)) |
                    (Teacher.first_name.ilike(term)) |
                    (Teacher.dni.ilike(term)) |
                    (Teacher.legajo.ilike(term))
                )
            teachers = query.order_by(Teacher.last_name, Teacher.first_name).all()
            
            # Map with active hours
            results = []
            for t in teachers:
                active_hours = sum(d.hours_count for d in t.designations if d.is_active)
                results.append({
                    "id": t.id,
                    "legajo": t.legajo,
                    "dni": t.dni,
                    "cuil": t.cuil or "-",
                    "full_name": t.full_name,
                    "first_name": t.first_name,
                    "last_name": t.last_name,
                    "email": t.email or "-",
                    "phone": t.phone or "-",
                    "revista": t.revista,
                    "max_hours": t.max_weekly_hours,
                    "active_hours": active_hours,
                    "is_active": t.is_active
                })
            return results
        finally:
            session.close()

    @staticmethod
    def get_by_id(teacher_id: int):
        session = get_db_session()
        try:
            return session.query(Teacher).filter(Teacher.id == teacher_id).first()
        finally:
            session.close()

    @staticmethod
    def get_by_dni(dni: str):
        """
        Recupera un docente por su DNI almacenado como texto unívoco (RN-01).
        """
        from models.normative import NormativeClassifier
        clean_dni = NormativeClassifier.normalize_dni(dni)
        session = get_db_session()
        try:
            return session.query(Teacher).filter(Teacher.dni == clean_dni).first()
        finally:
            session.close()

    @staticmethod
    def save(data: dict) -> tuple[bool, str]:
        """
        Guarda o actualiza los datos personales comunes de un docente (RN-01).
        Los datos personales se almacenan una sola vez independientemente de sus designaciones.
        """
        from models.normative import NormativeClassifier
        session = get_db_session()
        try:
            t_id = data.get("id")
            clean_dni = NormativeClassifier.normalize_dni(data["dni"])
            clean_legajo = str(data["legajo"]).strip()
            
            # Validar unicidad DNI y Legajo (RN-01)
            dni_check = session.query(Teacher).filter(Teacher.dni == clean_dni)
            if t_id:
                dni_check = dni_check.filter(Teacher.id != t_id)
            if dni_check.first():
                return False, f"Ya existe un docente registrado con el DNI {clean_dni} (RN-01: datos comunes únicos)."

            legajo_check = session.query(Teacher).filter(Teacher.legajo == clean_legajo)
            if t_id:
                legajo_check = legajo_check.filter(Teacher.id != t_id)
            if legajo_check.first():
                return False, f"Ya existe un docente con el Legajo {clean_legajo}."

            if t_id:
                teacher = session.query(Teacher).filter(Teacher.id == t_id).first()
                if not teacher:
                    return False, "Docente no encontrado para actualizar."
                teacher.legajo = clean_legajo
                teacher.dni = clean_dni
                teacher.cuil = str(data.get("cuil")).strip() if data.get("cuil") else None
                teacher.first_name = str(data["first_name"]).strip()
                teacher.last_name = str(data["last_name"]).strip()
                teacher.email = str(data.get("email")).strip() if data.get("email") else None
                teacher.phone = str(data.get("phone")).strip() if data.get("phone") else None
                teacher.revista = data.get("revista", "Titular")
                teacher.max_weekly_hours = int(data.get("max_weekly_hours", 30))
                teacher.is_active = data.get("is_active", True)
                action = "ACTUALIZAR_DOCENTE"
            else:
                teacher = Teacher(
                    legajo=clean_legajo,
                    dni=clean_dni,
                    cuil=str(data.get("cuil")).strip() if data.get("cuil") else None,
                    first_name=str(data["first_name"]).strip(),
                    last_name=str(data["last_name"]).strip(),
                    email=str(data.get("email")).strip() if data.get("email") else None,
                    phone=str(data.get("phone")).strip() if data.get("phone") else None,
                    revista=data.get("revista", "Titular"),
                    max_weekly_hours=int(data.get("max_weekly_hours", 30)),
                    is_active=data.get("is_active", True)
                )
                session.add(teacher)
                action = "CREAR_DOCENTE"

            session.commit()
            AuthService.log_action(action, f"Docente {teacher.legajo} - {teacher.full_name} (DNI: {clean_dni})")
            return True, "Docente guardado correctamente conforme a RN-01."
        except Exception as e:
            session.rollback()
            return False, f"Error al guardar docente: {str(e)}"
        finally:
            session.close()

    @staticmethod
    def toggle_active(teacher_id: int) -> tuple[bool, str]:
        """
        Aplica baja lógica o reactivación preservando el historial íntegro (RN-03).
        Nunca elimina antecedentes históricos ni registros de asistencia vinculados.
        """
        session = get_db_session()
        try:
            t = session.query(Teacher).filter(Teacher.id == teacher_id).first()
            if not t:
                return False, "Docente no encontrado."
            t.is_active = not t.is_active
            session.commit()
            status_text = "activado" if t.is_active else "dado de baja lógica (antecedentes conservados)"
            AuthService.log_action("CAMBIO_ESTADO_DOCENTE", f"Docente {t.legajo} {status_text} (RN-03)")
            return True, f"Docente {status_text} exitosamente."
        except Exception as e:
            session.rollback()
            return False, str(e)
        finally:
            session.close()

    @staticmethod
    def get_full_history(teacher_id: int) -> dict:
        """
        Recupera el historial completo de un docente (RN-01 a RN-03):
        - Datos personales comunes (RN-01).
        - Todas sus designaciones históricas y activas con situación de revista (RN-02).
        - Suplencias vinculadas y registros de asistencia acumulados sin borrado lógico (RN-03).
        """
        from database.schema import Designation, Substitution, Attendance
        session = get_db_session()
        try:
            t = session.query(Teacher).filter(Teacher.id == teacher_id).first()
            if not t:
                return {}

            designations = session.query(Designation).filter(Designation.teacher_id == teacher_id).all()
            attendances = session.query(Attendance).filter(Attendance.teacher_id == teacher_id).order_by(Attendance.date.desc()).all()
            substitutions = session.query(Substitution).filter(
                (Substitution.titular_teacher_id == teacher_id) | (Substitution.suplente_teacher_id == teacher_id)
            ).all()

            return {
                "teacher_id": t.id,
                "dni": t.dni,
                "legajo": t.legajo,
                "full_name": t.full_name,
                "is_active": t.is_active,
                "designations_count": len(designations),
                "designations": [
                    {
                        "id": d.id,
                        "subject_name": d.subject.name if d.subject else "-",
                        "cargo": d.effective_cargo,
                        "revista": d.effective_revista,
                        "hours": d.hours_count,
                        "day": d.day_of_week,
                        "time": f"{d.start_time} - {d.end_time}",
                        "is_active": d.is_active,
                        "academic_year": d.academic_year
                    }
                    for d in designations
                ],
                "attendances_count": len(attendances),
                "attendances": [
                    {
                        "id": a.id,
                        "date": a.date.strftime("%d/%m/%Y"),
                        "status": a.status,
                        "observations": a.observations or "",
                        "hours": a.hours
                    }
                    for a in attendances
                ],
                "substitutions_count": len(substitutions)
            }
        finally:
            session.close()

