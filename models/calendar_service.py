"""
Servicio de Calendario Institucional del Profesorado para SIGET (Python / SQLAlchemy)
Provee el historial cronológico y control de disponibilidad de los docentes:
- Licencias médicas (Art. 114 a, 114 b)
- Faltas y permisos particulares (Art. 115)
- Designaciones activas y control de 30 horas semanales
- Suplencias activas
- Acumulado del ciclo lectivo y alertas de proximidad a topes estatutarios.
"""

from typing import Dict, Any, List, Optional
from datetime import datetime, date
from database.connection import get_db_session
from database.schema import Teacher, Designation, Attendance, Substitution, Subject, Career

class AttendanceClassification:
    def __init__(self, is_presence=False, is_unexcused_absence=False, is_permit=False, is_license=False, is_long_treatment=False):
        self.is_presence = is_presence
        self.is_unexcused_absence = is_unexcused_absence
        self.is_permit = is_permit
        self.is_license = is_license
        self.is_long_treatment = is_long_treatment

def classify_attendance(status: str, observations: str = "") -> AttendanceClassification:
    s = (status or "").upper().strip()
    obs = (observations or "").upper().strip()

    if s in ["PR", "PRESENTE"]:
        return AttendanceClassification(is_presence=True)
    if s in ["I", "INASISTENCIA", "AUSENTE", "FALTA"]:
        return AttendanceClassification(is_unexcused_absence=True)
    if s in ["P", "PERMISO"] or "115" in obs:
        return AttendanceClassification(is_permit=True)
    if s in ["LT", "LARGO TRATAMIENTO", "LARGO_TRATAMIENTO"] or "114B" in obs or "114 B" in obs:
        return AttendanceClassification(is_long_treatment=True)
    if s in ["LIC", "LICENCIA"] or "114A" in obs or "114 A" in obs:
        return AttendanceClassification(is_license=True)

    return AttendanceClassification(is_presence=True)

class TeacherCalendarServicePy:
    @staticmethod
    def get_teacher_timeline(teacher_id: int, start_date: Optional[str] = None, end_date: Optional[str] = None) -> Dict[str, Any]:
        session = get_db_session()
        try:
            teacher = session.query(Teacher).filter(Teacher.id == teacher_id).first()
            if not teacher:
                return {"success": False, "message": "Docente no encontrado."}

            now = datetime.now()
            start = start_date or f"{now.year}-{str(now.month).zfill(2)}-01"
            end = end_date or f"{now.year}-{str(now.month).zfill(2)}-28"

            # Designaciones activas
            desigs = session.query(Designation).filter(
                Designation.teacher_id == teacher.id,
                Designation.is_active == True
            ).all()

            active_hours = sum(d.hours_count or 0 for d in desigs)
            designations_list = []
            for d in desigs:
                sub_name = d.subject.name if d.subject else "Sin Cátedra"
                car_name = d.subject.career.name if d.subject and d.subject.career else "Sin Carrera"
                designations_list.append({
                    "id": d.id,
                    "subjectName": sub_name,
                    "careerName": car_name,
                    "dayOfWeek": d.day_of_week,
                    "startTime": d.start_time,
                    "endTime": d.end_time,
                    "hoursCount": d.hours_count,
                    "resolution": d.resolution_number,
                    "revista": d.revista
                })

            # Suplencias como titular
            tit_subs = session.query(Substitution).filter(
                Substitution.titular_teacher_id == teacher.id
            ).order_by(Substitution.start_date.desc()).all()

            tit_list = []
            for s in tit_subs:
                sup_name = f"{s.suplente.last_name}, {s.suplente.first_name}" if s.suplente else "Sin Asignar"
                tit_list.append({
                    "id": s.id,
                    "rol": "Titular Sustituido",
                    "suplenteName": sup_name,
                    "reason": s.license_reason,
                    "startDate": str(s.start_date),
                    "endDate": str(s.end_date) if s.end_date else "Abierta",
                    "resolution": s.resolution_number,
                    "isActive": bool(s.is_active)
                })

            # Suplencias como suplente
            sup_subs = session.query(Substitution).filter(
                Substitution.suplente_teacher_id == teacher.id
            ).order_by(Substitution.start_date.desc()).all()

            sup_list = []
            for s in sup_subs:
                tit_name = f"{s.titular.last_name}, {s.titular.first_name}" if s.titular else "Sin Asignar"
                sup_list.append({
                    "id": s.id,
                    "rol": "Suplente Asignado",
                    "titularName": tit_name,
                    "reason": s.license_reason,
                    "startDate": str(s.start_date),
                    "endDate": str(s.end_date) if s.end_date else "Abierta",
                    "resolution": s.resolution_number,
                    "isActive": bool(s.is_active)
                })

            # Eventos de asistencia en el rango
            start_d = datetime.strptime(start, "%Y-%m-%d").date()
            end_d = datetime.strptime(end, "%Y-%m-%d").date()

            atts = session.query(Attendance).filter(
                Attendance.teacher_id == teacher.id,
                Attendance.date >= start_d,
                Attendance.date <= end_d,
                Attendance.is_active == True
            ).order_by(Attendance.date.asc()).all()

            events = []
            for a in atts:
                c = classify_attendance(a.status, a.observations or "")
                event_type = "Presente"
                badge = "bg-emerald-500/20 text-emerald-400"
                if c.is_unexcused_absence:
                    event_type = "Inasistencia"
                    badge = "bg-rose-500/20 text-rose-400"
                elif c.is_permit:
                    event_type = "Permiso Particular"
                    badge = "bg-amber-500/20 text-amber-400"
                elif c.is_license:
                    event_type = "Licencia Médica"
                    badge = "bg-purple-500/20 text-purple-400"
                elif c.is_long_treatment:
                    event_type = "Largo Tratamiento"
                    badge = "bg-indigo-500/20 text-indigo-400"

                events.append({
                    "id": a.id,
                    "date": str(a.date),
                    "status": a.status,
                    "hours": a.hours,
                    "eventType": event_type,
                    "badgeClass": badge,
                    "observations": a.observations or ""
                })

            # Acumulados del año
            year_val = start_d.year
            year_atts = session.query(Attendance).filter(
                Attendance.teacher_id == teacher.id,
                Attendance.date >= date(year_val, 1, 1),
                Attendance.date <= date(year_val, 12, 31),
                Attendance.is_active == True
            ).all()

            seen_dates = set()
            inasistencias = 0
            permisos = 0
            licencias = 0
            largo_trat = 0
            presentes = 0

            for a in year_atts:
                if a.date in seen_dates:
                    continue
                seen_dates.add(a.date)
                c = classify_attendance(a.status, a.observations or "")
                if c.is_unexcused_absence:
                    inasistencias += 1
                elif c.is_permit:
                    permisos += 1
                elif c.is_license:
                    licencias += 1
                elif c.is_long_treatment:
                    largo_trat += 1
                elif c.is_presence:
                    presentes += 1

            # Disponibilidad
            avail_status = "Disponible"
            avail_badge = "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
            if any(s["isActive"] for s in tit_list):
                avail_status = "De Licencia (Reemplazado)"
                avail_badge = "bg-purple-500/20 text-purple-400 border-purple-500/30"
            elif inasistencias >= 5:
                avail_status = "Límite de Faltas Agotado"
                avail_badge = "bg-rose-500/20 text-rose-400 border-rose-500/30"
            elif active_hours >= 30:
                avail_status = "Tope Semanal Completo (30 hs)"
                avail_badge = "bg-blue-500/20 text-blue-400 border-blue-500/30"

            return {
                "success": True,
                "teacher": {
                    "id": teacher.id,
                    "dni": str(teacher.dni),
                    "legajo": teacher.legajo,
                    "fullName": f"{teacher.last_name}, {teacher.first_name}",
                    "revista": teacher.revista,
                    "activeHours": active_hours,
                    "maxWeeklyHours": teacher.max_weekly_hours or 30,
                    "availabilityStatus": avail_status,
                    "availabilityBadge": avail_badge
                },
                "period": {"startDate": start, "endDate": end},
                "designations": designations_list,
                "substitutions": {
                    "asTitular": tit_list,
                    "asSuplente": sup_list,
                    "totalActive": sum(1 for s in tit_list if s["isActive"]) + sum(1 for s in sup_list if s["isActive"])
                },
                "events": events,
                "annualMetrics": {
                    "cycleYear": str(year_val),
                    "presentes": presentes,
                    "inasistencias": {
                        "count": inasistencias,
                        "limit": 5,
                        "percentage": min(100, int((inasistencias / 5) * 100)),
                        "isWarning": 3 <= inasistencias < 5,
                        "isDanger": inasistencias >= 5
                    },
                    "permisos": {
                        "count": permisos,
                        "limit": 6,
                        "percentage": min(100, int((permisos / 6) * 100)),
                        "isWarning": 4 <= permisos < 6,
                        "isDanger": permisos >= 6
                    },
                    "licenciasMedicas": {
                        "count": licencias,
                        "limit": 25,
                        "percentage": min(100, int((licencias / 25) * 100)),
                        "isWarning": 20 <= licencias < 25,
                        "isDanger": licencias >= 25
                    },
                    "largoTratamiento": largo_trat
                }
            }
        finally:
            session.close()
