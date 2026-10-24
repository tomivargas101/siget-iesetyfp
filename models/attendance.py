from datetime import date, datetime, timedelta
from typing import Optional, Union
from database.connection import get_db_session
from database.schema import Teacher, Attendance
from models.auth import CurrentSession, AuthService

class AttendanceService:
    @staticmethod
    def get_daily_records(target_date: date = None):
        """
        Retorna la lista de docentes activos con su estado de asistencia para target_date.
        Si aún no tienen registro para ese día, devuelve estado 'Sin Registrar'.
        """
        if target_date is None:
            target_date = date.today()

        session = get_db_session()
        try:
            teachers = session.query(Teacher).filter(Teacher.is_active == True).order_by(Teacher.last_name, Teacher.first_name).all()
            attendances = session.query(Attendance).filter(Attendance.date == target_date).all()
            att_map = {a.teacher_id: a for a in attendances}

            results = []
            for t in teachers:
                att = att_map.get(t.id)
                results.append({
                    "attendance_id": att.id if att else None,
                    "teacher_id": t.id,
                    "legajo": t.legajo,
                    "dni": t.dni,
                    "full_name": t.full_name,
                    "revista": t.revista,
                    "status": att.status if att else "Sin Registrar",
                    "hours": att.hours if att else 4,
                    "observations": att.observations if (att and att.observations) else "",
                    "registered_by": att.registered_by if (att and att.registered_by) else "Pendiente"
                })
            return results
        finally:
            session.close()

    @staticmethod
    def save_record(teacher_id: int, target_date: date, status: str, hours: int = 4, observations: str = "", registered_by: str = None) -> tuple[bool, str]:
        """
        Guarda o actualiza la asistencia de un docente para la fecha especificada.
        """
        session = get_db_session()
        try:
            if not registered_by:
                registered_by = CurrentSession.user.username if CurrentSession.user else "Bedel"

            att = session.query(Attendance).filter(
                Attendance.teacher_id == teacher_id,
                Attendance.date == target_date
            ).first()

            if not att:
                att = Attendance(
                    teacher_id=teacher_id,
                    date=target_date,
                    status=status,
                    hours=hours,
                    observations=observations,
                    registered_by=registered_by
                )
                session.add(att)
            else:
                att.status = status
                att.hours = hours
                att.observations = observations
                att.registered_by = registered_by

            session.commit()
            AuthService.log_action(
                action="REGISTRO_ASISTENCIA",
                details=f"Docente ID {teacher_id} - Fecha {target_date.strftime('%d/%m/%Y')} - Estado: {status}"
            )
            return True, "Asistencia registrada correctamente."
        except Exception as e:
            session.rollback()
            return False, f"Error al guardar asistencia: {str(e)}"
        finally:
            session.close()

    @staticmethod
    def mark_all_present(target_date: date = None, registered_by: str = None) -> tuple[bool, str]:
        """
        Marca automáticamente a todos los docentes activos que estén 'Sin Registrar' como 'Presente'.
        """
        if target_date is None:
            target_date = date.today()

        session = get_db_session()
        try:
            if not registered_by:
                registered_by = CurrentSession.user.username if CurrentSession.user else "Bedel"

            teachers = session.query(Teacher).filter(Teacher.is_active == True).all()
            existing_atts = {a.teacher_id: a for a in session.query(Attendance).filter(Attendance.date == target_date).all()}

            count_marked = 0
            for t in teachers:
                if t.id not in existing_atts:
                    new_att = Attendance(
                        teacher_id=t.id,
                        date=target_date,
                        status="Presente",
                        hours=4,
                        observations="Asistencia confirmada en lote",
                        registered_by=registered_by
                    )
                    session.add(new_att)
                    count_marked += 1

            session.commit()
            AuthService.log_action(
                action="REGISTRO_ASISTENCIA_LOTE",
                details=f"Marcados {count_marked} docentes como Presentes para {target_date.strftime('%d/%m/%Y')}"
            )
            return True, f"Se registraron {count_marked} docentes como Presentes."
        except Exception as e:
            session.rollback()
            return False, f"Error al marcar asistencias: {str(e)}"
        finally:
            session.close()

    @staticmethod
    def get_summary(target_date: date = None) -> dict:
        """
        Retorna resumen estadístico de la asistencia del día.
        """
        if target_date is None:
            target_date = date.today()

        records = AttendanceService.get_daily_records(target_date)
        total = len(records)
        presentes = sum(1 for r in records if r["status"] == "Presente")
        ausentes_aviso = sum(1 for r in records if r["status"] == "Ausente c/aviso")
        ausentes_sin_aviso = sum(1 for r in records if r["status"] == "Ausente s/aviso")
        licencias = sum(1 for r in records if r["status"] == "Licencia")
        sin_registrar = sum(1 for r in records if r["status"] == "Sin Registrar")

        return {
            "total_teachers": total,
            "presentes": presentes,
            "ausentes_total": ausentes_aviso + ausentes_sin_aviso,
            "ausentes_aviso": ausentes_aviso,
            "ausentes_sin_aviso": ausentes_sin_aviso,
            "licencias": licencias,
            "sin_registrar": sin_registrar
        }

    @staticmethod
    def register_range(
        teacher_id: int,
        start_date: date,
        end_date: date,
        status: str = "Licencia",
        hours: int = 4,
        observations: str = "",
        designation_id: Optional[int] = None,
        registered_by: Optional[str] = None
    ) -> tuple[bool, str, int]:
        """
        Registra un rango de días continuos de asistencia/licencia para un docente.
        Garantiza la trazabilidad día por día para el posterior procesamiento con Pandas.
        """
        if end_date < start_date:
            return False, "La fecha de fin no puede ser anterior a la de inicio.", 0

        session = get_db_session()
        try:
            if not registered_by:
                registered_by = CurrentSession.user.username if CurrentSession.user else "Bedel"

            current_d = start_date
            count = 0
            while current_d <= end_date:
                att = session.query(Attendance).filter(
                    Attendance.teacher_id == teacher_id,
                    Attendance.date == current_d
                ).first()

                if not att:
                    att = Attendance(
                        teacher_id=teacher_id,
                        designation_id=designation_id,
                        date=current_d,
                        status=status,
                        hours=hours,
                        observations=observations,
                        registered_by=registered_by,
                        is_active=True
                    )
                    session.add(att)
                else:
                    att.status = status
                    att.hours = hours
                    att.observations = observations
                    att.designation_id = designation_id or att.designation_id
                    att.registered_by = registered_by
                    att.is_active = True
                count += 1
                current_d += timedelta(days=1)

            session.commit()
            AuthService.log_action(
                action="REGISTRO_ASISTENCIA_RANGO",
                details=f"Docente ID {teacher_id} - Rango {start_date.strftime('%d/%m/%Y')} al {end_date.strftime('%d/%m/%Y')} ({count} días - {status})"
            )
            return True, f"Se registraron {count} días de {status} correctamente.", count
        except Exception as e:
            session.rollback()
            return False, f"Error al registrar rango: {str(e)}", 0
        finally:
            session.close()

    @staticmethod
    def get_history(teacher_id: Optional[int] = None, start_date: Optional[date] = None, end_date: Optional[date] = None) -> list[dict]:
        """
        Recupera el historial de registros de asistencia respetando RN-03 (sin borrado físico).
        """
        session = get_db_session()
        try:
            query = session.query(Attendance).join(Teacher)
            if teacher_id:
                query = query.filter(Attendance.teacher_id == teacher_id)
            if start_date:
                query = query.filter(Attendance.date >= start_date)
            if end_date:
                query = query.filter(Attendance.date <= end_date)

            records = query.order_by(Attendance.date.desc(), Teacher.last_name).all()
            return [
                {
                    "id": a.id,
                    "teacher_id": a.teacher_id,
                    "teacher_dni": a.teacher.dni if a.teacher else "-",
                    "teacher_name": a.teacher.full_name if a.teacher else "-",
                    "date": a.date.strftime("%d/%m/%Y"),
                    "status": a.status,
                    "hours": a.hours,
                    "observations": a.observations or "",
                    "registered_by": a.registered_by or "-",
                    "is_active": a.is_active
                }
                for a in records
            ]
        finally:
            session.close()

    @staticmethod
    def get_processed_monthly(month: int, year: Optional[int] = None, career_id: Optional[int] = None):
        """
        Acceso directo al procesamiento de DataFrames DL-01 y DL-02 para el mes analizado.
        """
        from models.attendance_processor import AttendanceProcessor
        return AttendanceProcessor.process_monthly_attendance(month=month, year=year, career_id=career_id)

