from datetime import datetime, date
from database.connection import get_db_session
from database.schema import Designation, Substitution, Subject, Teacher, Career
from models.validation import BusinessValidationService
from models.auth import AuthService

DAYS_OF_WEEK = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"]

class DesignationService:
    @staticmethod
    def get_all(career_id: int = None, teacher_id: int = None, only_active: bool = True):
        session = get_db_session()
        try:
            query = session.query(Designation).join(Subject).join(Teacher).outerjoin(Career, Subject.career_id == Career.id)
            if only_active:
                query = query.filter(Designation.is_active == True)
            if career_id and career_id != 0:
                query = query.filter(Subject.career_id == career_id)
            if teacher_id and teacher_id != 0:
                query = query.filter(Designation.teacher_id == teacher_id)

            designations = query.order_by(Designation.day_of_week, Designation.start_time).all()

            results = []
            for d in designations:
                # Verificar si tiene suplencia activa vigente
                active_sub = session.query(Substitution).filter(
                    Substitution.designation_id == d.id,
                    Substitution.is_active == True,
                    Substitution.start_date <= date.today(),
                    Substitution.end_date >= date.today()
                ).first()

                suplente_info = None
                if active_sub and active_sub.suplente:
                    suplente_info = {
                        "id": active_sub.id,
                        "suplente_name": active_sub.suplente.full_name,
                        "suplente_dni": active_sub.suplente.dni,
                        "reason": active_sub.license_reason,
                        "start_date": active_sub.start_date.strftime("%d/%m/%Y"),
                        "end_date": active_sub.end_date.strftime("%d/%m/%Y"),
                        "resolution": active_sub.resolution_number
                    }

                results.append({
                    "id": d.id,
                    "subject_id": d.subject_id,
                    "subject_code": d.subject.code if d.subject else "-",
                    "subject_name": d.subject.name if d.subject else "-",
                    "career_name": d.subject.career.name if (d.subject and d.subject.career) else "Sin Carrera",
                    "teacher_id": d.teacher_id,
                    "teacher_name": d.teacher.full_name if d.teacher else "-",
                    "teacher_dni": d.teacher.dni if d.teacher else "-",
                    "teacher_revista": d.effective_revista,
                    "cargo": d.effective_cargo,
                    "revista": d.effective_revista,
                    "day_of_week": d.day_of_week,
                    "start_time": d.start_time,
                    "end_time": d.end_time,
                    "hours_count": d.hours_count,
                    "resolution_number": d.resolution_number or "-",
                    "notes": d.notes or "",
                    "is_active": d.is_active,
                    "active_substitution": suplente_info
                })
            return results
        finally:
            session.close()

    @staticmethod
    def get_by_teacher_dni(dni: str, only_active: bool = False):
        """
        Recupera todas las designaciones de una persona a partir de su DNI (RN-01 y RN-02).
        Permite consultar cargos múltiples y situaciones de revista diferenciadas (TIT, INT, SUP).
        """
        from models.normative import NormativeClassifier
        clean_dni = NormativeClassifier.normalize_dni(dni)
        session = get_db_session()
        try:
            query = session.query(Designation).join(Teacher).filter(Teacher.dni == clean_dni)
            if only_active:
                query = query.filter(Designation.is_active == True)
            designations = query.all()
            return [
                {
                    "id": d.id,
                    "subject_name": d.subject.name if d.subject else "-",
                    "cargo": d.effective_cargo,
                    "revista": d.effective_revista,
                    "hours_count": d.hours_count,
                    "day_of_week": d.day_of_week,
                    "time": f"{d.start_time} - {d.end_time}",
                    "is_active": d.is_active,
                    "academic_year": d.academic_year
                }
                for d in designations
            ]
        finally:
            session.close()

    @staticmethod
    def get_history(teacher_id: int = None, subject_id: int = None):
        """
        Recupera el historial completo de designaciones (activas y dadas de baja lógica - RN-03).
        """
        session = get_db_session()
        try:
            query = session.query(Designation).join(Subject).join(Teacher)
            if teacher_id:
                query = query.filter(Designation.teacher_id == teacher_id)
            if subject_id:
                query = query.filter(Designation.subject_id == subject_id)
            designations = query.order_by(Designation.academic_year.desc(), Designation.id.desc()).all()
            return [
                {
                    "id": d.id,
                    "teacher_dni": d.teacher.dni if d.teacher else "-",
                    "teacher_name": d.teacher.full_name if d.teacher else "-",
                    "subject_name": d.subject.name if d.subject else "-",
                    "cargo": d.effective_cargo,
                    "revista": d.effective_revista,
                    "hours_count": d.hours_count,
                    "is_active": d.is_active,
                    "academic_year": d.academic_year,
                    "resolution_number": d.resolution_number or "-"
                }
                for d in designations
            ]
        finally:
            session.close()

    @staticmethod
    def save_designation(data: dict) -> tuple[bool, str]:
        """
        Guarda o actualiza una designación validando previamente el tope de horas y compatibilidad horaria.
        Soporta cargos y situación de revista por designación (RN-02).
        """
        from models.normative import NormativeClassifier
        session = get_db_session()
        try:
            desig_id = data.get("id")
            teacher_id = int(data["teacher_id"])
            hours = int(data["hours_count"])
            day = data["day_of_week"]
            start = data["start_time"]
            end = data["end_time"]
            cargo = data.get("cargo")
            revista = NormativeClassifier.normalize_revista(data.get("revista")) if data.get("revista") else None

            # 1. Validación de tope de horas cátedra
            is_cap_valid, curr_hs, max_hs, cap_msg = BusinessValidationService.validate_hours_cap(
                teacher_id=teacher_id,
                new_hours=hours,
                session=session,
                exclude_designation_id=desig_id
            )
            if not is_cap_valid:
                return False, cap_msg

            # 2. Validación de superposición horaria
            is_time_valid, time_msg = BusinessValidationService.validate_schedule_compatibility(
                teacher_id=teacher_id,
                day_of_week=day,
                start_time=start,
                end_time=end,
                session=session,
                exclude_designation_id=desig_id
            )
            if not is_time_valid:
                return False, time_msg

            # Guardar o actualizar
            if desig_id:
                desig = session.query(Designation).filter(Designation.id == desig_id).first()
                if not desig:
                    return False, "Designación no encontrada."
                desig.subject_id = int(data["subject_id"])
                desig.teacher_id = teacher_id
                desig.day_of_week = day
                desig.start_time = start
                desig.end_time = end
                desig.hours_count = hours
                desig.cargo = cargo
                if revista:
                    desig.revista = revista
                desig.resolution_number = data.get("resolution_number")
                desig.notes = data.get("notes")
                desig.is_active = data.get("is_active", True)
                action = "ACTUALIZAR_DESIGNACION"
            else:
                desig = Designation(
                    subject_id=int(data["subject_id"]),
                    teacher_id=teacher_id,
                    day_of_week=day,
                    start_time=start,
                    end_time=end,
                    hours_count=hours,
                    cargo=cargo,
                    revista=revista,
                    resolution_number=data.get("resolution_number"),
                    notes=data.get("notes"),
                    is_active=data.get("is_active", True)
                )
                session.add(desig)
                action = "CREAR_DESIGNACION"

            session.commit()
            rev_label = desig.effective_revista
            AuthService.log_action(action, f"Designación ID {desig.id} - Docente {desig.teacher.full_name} ({hours} hs - {rev_label})")
            return True, "Designación guardada exitosamente y validada conforme a normativa."
        except Exception as e:
            session.rollback()
            return False, f"Error al guardar designación: {str(e)}"
        finally:
            session.close()

    @staticmethod
    def toggle_active(desig_id: int) -> tuple[bool, str]:
        """
        Baja lógica de designación: preserva el historial íntegro de la designación y de asistencias (RN-03).
        """
        session = get_db_session()
        try:
            d = session.query(Designation).filter(Designation.id == desig_id).first()
            if not d:
                return False, "Designación no encontrada."
            d.is_active = not d.is_active
            session.commit()
            txt = "activada" if d.is_active else "dada de baja lógica (historial conservado)"
            AuthService.log_action("CAMBIO_ESTADO_DESIGNACION", f"Designación {d.id} {txt} (RN-03)")
            return True, f"Designación {txt} correctamente."
        except Exception as e:
            session.rollback()
            return False, str(e)
        finally:
            session.close()

    @staticmethod
    def get_all_substitutions():
        session = get_db_session()
        try:
            subs = session.query(Substitution).join(Designation).order_by(Substitution.created_at.desc()).all()
            results = []
            for s in subs:
                results.append({
                    "id": s.id,
                    "designation_id": s.designation_id,
                    "subject_name": s.designation.subject.name if s.designation and s.designation.subject else "-",
                    "titular_id": s.titular_teacher_id,
                    "titular_name": s.titular.full_name if s.titular else "-",
                    "titular_dni": s.titular.dni if s.titular else "-",
                    "suplente_id": s.suplente_teacher_id,
                    "suplente_name": s.suplente.full_name if s.suplente else "-",
                    "suplente_dni": s.suplente.dni if s.suplente else "-",
                    "license_reason": s.license_reason,
                    "start_date": s.start_date.strftime("%d/%m/%Y"),
                    "end_date": s.end_date.strftime("%d/%m/%Y"),
                    "resolution_number": s.resolution_number,
                    "is_active": s.is_active
                })
            return results
        finally:
            session.close()

    @staticmethod
    def save_substitution(data: dict) -> tuple[bool, str]:
        session = get_db_session()
        try:
            sub_id = data.get("id")
            desig_id = int(data["designation_id"])
            suplente_id = int(data["suplente_teacher_id"])
            
            desig = session.query(Designation).filter(Designation.id == desig_id).first()
            if not desig:
                return False, "Designación no encontrada."

            # Validar que el suplente no supere su tope de horas con esta suplencia
            is_cap_valid, curr, max_hs, cap_msg = BusinessValidationService.validate_hours_cap(
                teacher_id=suplente_id,
                new_hours=desig.hours_count,
                session=session
            )
            if not is_cap_valid:
                return False, f"Docente suplente excede horas: {cap_msg}"

            # Validar compatibilidad horaria para el suplente
            is_time_valid, time_msg = BusinessValidationService.validate_schedule_compatibility(
                teacher_id=suplente_id,
                day_of_week=desig.day_of_week,
                start_time=desig.start_time,
                end_time=desig.end_time,
                session=session
            )
            if not is_time_valid:
                return False, f"Conflicto de horario para el suplente: {time_msg}"

            start_d = datetime.strptime(data["start_date"], "%Y-%m-%d").date()
            end_d = datetime.strptime(data["end_date"], "%Y-%m-%d").date()

            if end_d < start_d:
                return False, "La fecha de fin no puede ser anterior a la fecha de inicio."

            if sub_id:
                sub = session.query(Substitution).filter(Substitution.id == sub_id).first()
                if not sub:
                    return False, "Suplencia no encontrada."
                sub.designation_id = desig_id
                sub.titular_teacher_id = desig.teacher_id
                sub.suplente_teacher_id = suplente_id
                sub.license_reason = data["license_reason"]
                sub.start_date = start_d
                sub.end_date = end_d
                sub.resolution_number = data["resolution_number"]
                sub.is_active = data.get("is_active", True)
                action = "ACTUALIZAR_SUPLENCIA"
            else:
                sub = Substitution(
                    designation_id=desig_id,
                    titular_teacher_id=desig.teacher_id,
                    suplente_teacher_id=suplente_id,
                    license_reason=data["license_reason"],
                    start_date=start_d,
                    end_date=end_d,
                    resolution_number=data["resolution_number"],
                    is_active=True
                )
                session.add(sub)
                action = "REGISTRAR_SUPLENCIA"

            session.commit()
            AuthService.log_action(action, f"Suplencia para designación {desig_id} - Res. {sub.resolution_number}")
            return True, "Suplencia registrada con éxito vinculada al titular."
        except Exception as e:
            session.rollback()
            return False, f"Error al guardar suplencia: {str(e)}"
        finally:
            session.close()
