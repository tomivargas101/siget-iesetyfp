"""
Módulo de Importación Masiva por Archivos CSV para SIGET (Python / SQLAlchemy)
Permite la precarga masiva y validación de:
1. Planta funcional / Legajos de docentes ("Datos del personal")
2. Registros históricos y operativos de Asistencias ("Asistencia")

Garantiza RN-01 (DNI formato texto), RN-02 (designaciones independientes),
RN-03 (tope de 30 horas semanales), prevención de duplicados e informe de inconsistencias.
"""

import csv
import io
import re
from datetime import datetime
from typing import Dict, List, Any, Tuple, Optional
from database.connection import get_db_session
from database.schema import Teacher, Career, Subject, Designation, Attendance, AuditLog, get_argentina_now
from models.security import SecurityGuard
from models.auth import CurrentSession, AuthService

class CsvImportServicePy:
    @staticmethod
    def _normalize_header(header: str) -> str:
        if not header:
            return ""
        s = header.strip().lower()
        # Normalizar tildes
        replacements = [('á', 'a'), ('é', 'e'), ('í', 'i'), ('ó', 'o'), ('ú', 'u'), ('ñ', 'n')]
        for a, b in replacements:
            s = s.replace(a, b)
        s = re.sub(r'[^a-z0-9]', '_', s)
        s = re.sub(r'_+', '_', s).strip('_')
        return s

    @staticmethod
    def parse_csv(csv_content: str) -> Tuple[List[str], List[Dict[str, Any]]]:
        if not csv_content or not csv_content.strip():
            return [], []

        # Detectar delimitador inspeccionando la primera línea
        first_line = csv_content.splitlines()[0]
        delimiter = ','
        if first_line.count(';') > first_line.count(','):
            delimiter = ';'
        elif first_line.count('\t') > first_line.count(','):
            delimiter = '\t'

        reader = csv.reader(io.StringIO(csv_content), delimiter=delimiter)
        raw_rows = [r for r in reader if any(cell.strip() for cell in r)]
        if not raw_rows:
            return [], []

        raw_headers = raw_rows[0]
        headers = [CsvImportServicePy._normalize_header(h) for h in raw_headers]

        rows = []
        for line_idx, r in enumerate(raw_rows[1:], start=2):
            row_dict = {}
            for col_idx, h in enumerate(headers):
                val = r[col_idx].strip() if col_idx < len(r) else ""
                row_dict[h] = val
            row_dict["_raw_line"] = line_idx
            rows.append(row_dict)

        return headers, rows

    @staticmethod
    def preview_personnel(csv_content: str) -> Dict[str, Any]:
        """
        Valida y genera informe de inconsistencias del archivo de personal.
        """
        headers, rows = CsvImportServicePy.parse_csv(csv_content)
        if not rows:
            return {
                "success": False,
                "message": "El archivo CSV está vacío o sin datos legibles.",
                "total_rows": 0,
                "valid_rows": 0,
                "invalid_rows": 0,
                "errors": [],
                "preview": []
            }

        session = get_db_session()
        try:
            existing_teachers = {str(t.dni).strip(): t for t in session.query(Teacher).all()}
            active_hours = {}
            for d in session.query(Designation).filter(Designation.is_active == True).all():
                active_hours[d.teacher_id] = active_hours.get(d.teacher_id, 0) + (d.hours_count or 0)

            errors = []
            preview = []
            seen_dnis = {}
            valid_count = 0
            invalid_count = 0

            for r in rows:
                line_num = r["_raw_line"]
                row_errors = []

                raw_dni = r.get("dni") or r.get("documento") or r.get("nro_doc") or ""
                clean_dni = re.sub(r'[\.\s]', '', str(raw_dni)).strip()

                apellido = (r.get("apellido") or r.get("apellidos") or "").strip()
                nombre = (r.get("nombre") or r.get("nombres") or "").strip()
                legajo = (r.get("legajo") or r.get("nro_legajo") or "").strip()

                revista = r.get("revista") or r.get("situacion_revista") or "Titular"
                rev_norm = revista.lower()
                if "titular" in rev_norm:
                    revista = "Titular"
                elif "provisional" in rev_norm:
                    revista = "Provisional"
                elif "interino" in rev_norm:
                    revista = "Interino"
                elif "suplente" in rev_norm:
                    revista = "Suplente"
                else:
                    revista = "Titular"

                catedra = (r.get("catedra") or r.get("materia") or "").strip()
                carrera = (r.get("carrera") or "Profesorado").strip()
                dia = (r.get("dia") or "Lunes").strip()
                horario = (r.get("horario") or "18:00 a 20:00").strip()
                resolucion = (r.get("resolucion") or "Disp. Pendiente").strip()

                try:
                    horas = int(r.get("horas") or r.get("cant_horas") or (4 if catedra else 0))
                except ValueError:
                    horas = 4 if catedra else 0

                if not clean_dni:
                    row_errors.append("DNI obligatorio ausente.")
                elif not re.match(r'^\d{6,10}$', clean_dni):
                    row_errors.append(f"DNI inválido: {clean_dni}. Debe contener entre 6 y 10 dígitos numéricos.")

                if not apellido:
                    row_errors.append("El campo Apellido es obligatorio.")
                if not nombre:
                    row_errors.append("El campo Nombre es obligatorio.")

                if clean_dni:
                    if clean_dni in seen_dnis and not catedra:
                        row_errors.append(f"DNI {clean_dni} duplicado en la fila {seen_dnis[clean_dni]}.")
                    else:
                        seen_dnis[clean_dni] = line_num

                existing = existing_teachers.get(clean_dni)
                curr_h = active_hours.get(existing.id, 0) if existing else 0
                proj_h = curr_h + horas

                if proj_h > 30:
                    row_errors.append(f"Tope de 30hs superado: el docente alcanzaría {proj_h} horas semanales.")

                is_valid = len(row_errors) == 0
                if is_valid:
                    valid_count += 1
                else:
                    invalid_count += 1
                    errors.append({
                        "line": line_num,
                        "dni": clean_dni,
                        "docente": f"{apellido}, {nombre}",
                        "errors": row_errors
                    })

                preview.append({
                    "line": line_num,
                    "dni": clean_dni,
                    "legajo": legajo or (existing.legajo if existing else "-"),
                    "apellido": apellido,
                    "nombre": nombre,
                    "fullName": f"{apellido}, {nombre}",
                    "revista": revista,
                    "catedra": catedra or "-",
                    "carrera": carrera,
                    "horas": horas,
                    "dia": dia,
                    "horario": horario,
                    "resolucion": resolucion,
                    "projectedHours": proj_h,
                    "existsInDb": bool(existing),
                    "status": "VÁLIDO" if is_valid else "OBSERVADO",
                    "errorMessages": " | ".join(row_errors)
                })

            return {
                "success": True,
                "total_rows": len(rows),
                "valid_rows": valid_count,
                "invalid_rows": invalid_count,
                "errors": errors,
                "preview": preview[:100]
            }
        finally:
            session.close()

    @staticmethod
    def import_personnel(csv_content: str, update_existing: bool = True) -> Dict[str, Any]:
        """
        Ejecuta la persistencia masiva de docentes y designaciones.
        """
        prev = CsvImportServicePy.preview_personnel(csv_content)
        if not prev["success"]:
            return prev

        session = get_db_session()
        try:
            # Buscar o crear carrera por defecto
            default_career = session.query(Career).first()
            if not default_career:
                default_career = Career(name="Profesorado de Educación Secundaria", code="PES", is_active=True)
                session.add(default_career)
                session.flush()

            inserted = 0
            updated = 0
            desigs_count = 0
            errors = []

            for item in prev["preview"]:
                if item["status"] != "VÁLIDO":
                    continue

                dni_str = str(item["dni"])
                teacher = session.query(Teacher).filter(Teacher.dni == dni_str).first()

                if not teacher:
                    legajo_val = item["legajo"] if item["legajo"] != "-" else f"LEG-{dni_str[-4:]}"
                    teacher = Teacher(
                        dni=dni_str,
                        legajo=legajo_val,
                        first_name=item["nombre"],
                        last_name=item["apellido"],
                        revista=item["revista"],
                        max_weekly_hours=30,
                        is_active=True
                    )
                    session.add(teacher)
                    session.flush()
                    inserted += 1
                else:
                    if update_existing:
                        teacher.first_name = item["nombre"]
                        teacher.last_name = item["apellido"]
                        teacher.revista = item["revista"]
                        updated += 1

                # Asignación de Cátedra si aplica
                if item["catedra"] and item["catedra"] != "-":
                    subject = session.query(Subject).filter(Subject.name.ilike(item["catedra"])).first()
                    if not subject:
                        subject = Subject(
                            career_id=default_career.id,
                            name=item["catedra"],
                            code=item["catedra"][:4].upper(),
                            year_level=1,
                            weekly_hours=item["horas"]
                        )
                        session.add(subject)
                        session.flush()

                    existing_desig = session.query(Designation).filter(
                        Designation.teacher_id == teacher.id,
                        Designation.subject_id == subject.id,
                        Designation.is_active == True
                    ).first()

                    if not existing_desig:
                        times = item["horario"].split("a") if "a" in item["horario"] else item["horario"].split("-")
                        start_t = times[0].strip() if len(times) > 0 and times[0].strip() else "18:00"
                        end_t = times[1].strip() if len(times) > 1 and times[1].strip() else "20:00"

                        desig = Designation(
                            subject_id=subject.id,
                            teacher_id=teacher.id,
                            day_of_week=item["dia"] if item["dia"] != "-" else "Lunes",
                            start_time=start_t,
                            end_time=end_t,
                            hours_count=item["horas"],
                            resolution_number=item["resolucion"] or "Disp. Pendiente",
                            cargo="Profesor",
                            revista=item["revista"],
                            is_active=True
                        )
                        session.add(desig)
                        desigs_count += 1

            session.commit()
            AuthService.log_action(
                "IMPORTACION_CSV_PERSONAL",
                f"Importación masiva: {inserted} docentes nuevos, {updated} actualizados, {desigs_count} cátedras asignadas."
            )

            return {
                "success": True,
                "message": f"Importación completada: {inserted} docentes creados, {updated} actualizados, {desigs_count} cátedras asignadas.",
                "inserted_teachers": inserted,
                "updated_teachers": updated,
                "created_designations": desigs_count,
                "errors": errors
            }
        except Exception as e:
            session.rollback()
            return {
                "success": False,
                "message": f"Error al procesar la importación: {str(e)}",
                "inserted_teachers": 0,
                "updated_teachers": 0,
                "created_designations": 0,
                "errors": [str(e)]
            }
        finally:
            session.close()

    @staticmethod
    def preview_attendance(csv_content: str) -> Dict[str, Any]:
        """
        Valida registros masivos de asistencia.
        """
        headers, rows = CsvImportServicePy.parse_csv(csv_content)
        if not rows:
            return {
                "success": False,
                "message": "Archivo de asistencias sin datos legibles.",
                "total_rows": 0,
                "valid_rows": 0,
                "invalid_rows": 0,
                "errors": [],
                "preview": []
            }

        session = get_db_session()
        try:
            teachers_by_dni = {str(t.dni).strip(): t for t in session.query(Teacher).all()}
            errors = []
            preview = []
            valid_count = 0
            invalid_count = 0

            for r in rows:
                line_num = r["_raw_line"]
                row_errors = []

                raw_dni = r.get("dni") or r.get("documento") or ""
                clean_dni = re.sub(r'[\.\s]', '', str(raw_dni)).strip()

                raw_fecha = r.get("fecha") or r.get("date") or r.get("dia") or ""
                parsed_date = None
                if re.match(r'^\d{4}-\d{2}-\d{2}$', raw_fecha):
                    parsed_date = raw_fecha
                else:
                    m = re.match(r'^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$', raw_fecha)
                    if m:
                        parsed_date = f"{m.group(3)}-{m.group(2).zfill(2)}-{m.group(1).zfill(2)}"

                raw_estado = (r.get("estado") or r.get("marca") or "").strip().upper()
                norm_status = None
                if raw_estado in ["PR", "PRESENTE"]:
                    norm_status = "PR"
                elif raw_estado in ["I", "INASISTENCIA", "FALTA"]:
                    norm_status = "I"
                elif raw_estado in ["P", "PERMISO", "115"]:
                    norm_status = "P"
                elif raw_estado in ["LIC", "LICENCIA", "114A"]:
                    norm_status = "LIC"
                elif raw_estado in ["LT", "LARGO_TRATAMIENTO", "114B"]:
                    norm_status = "LT"

                obs = (r.get("observaciones") or r.get("motivo") or "").strip()
                try:
                    horas = int(r.get("horas") or 4)
                except ValueError:
                    horas = 4

                teacher = teachers_by_dni.get(clean_dni)
                if not clean_dni:
                    row_errors.append("DNI obligatorio ausente.")
                elif not teacher:
                    row_errors.append(f"Docente con DNI '{clean_dni}' no registrado en la institución.")

                if not parsed_date:
                    row_errors.append(f"Fecha inválida: '{raw_fecha}'.")
                if not norm_status:
                    row_errors.append(f"Marca no admitida: '{raw_estado}'. Catálogo: PR, I, P, LIC, LT.")

                is_valid = len(row_errors) == 0
                if is_valid:
                    valid_count += 1
                else:
                    invalid_count += 1
                    errors.append({
                        "line": line_num,
                        "dni": clean_dni,
                        "errors": row_errors
                    })

                preview.append({
                    "line": line_num,
                    "dni": clean_dni,
                    "teacherName": f"{teacher.last_name}, {teacher.first_name}" if teacher else "Inexistente",
                    "fecha": parsed_date or raw_fecha,
                    "estado": norm_status or raw_estado,
                    "horas": horas,
                    "observaciones": obs,
                    "status": "VÁLIDO" if is_valid else "OBSERVADO",
                    "errorMessages": " | ".join(row_errors)
                })

            return {
                "success": True,
                "total_rows": len(rows),
                "valid_rows": valid_count,
                "invalid_rows": invalid_count,
                "errors": errors,
                "preview": preview[:100]
            }
        finally:
            session.close()

    @staticmethod
    def import_attendance(csv_content: str) -> Dict[str, Any]:
        prev = CsvImportServicePy.preview_attendance(csv_content)
        if not prev["success"]:
            return prev

        session = get_db_session()
        try:
            teachers_by_dni = {str(t.dni).strip(): t.id for t in session.query(Teacher).all()}
            imported = 0
            now = get_argentina_now()

            for item in prev["preview"]:
                if item["status"] != "VÁLIDO":
                    continue

                t_id = teachers_by_dni.get(item["dni"])
                if not t_id:
                    continue

                att_date = datetime.strptime(item["fecha"], "%Y-%m-%d").date()
                existing = session.query(Attendance).filter(
                    Attendance.teacher_id == t_id,
                    Attendance.date == att_date,
                    Attendance.is_active == True
                ).first()

                if existing:
                    existing.status = item["estado"]
                    existing.hours = item["horas"]
                    existing.observations = item["observaciones"]
                else:
                    att = Attendance(
                        teacher_id=t_id,
                        date=att_date,
                        status=item["estado"],
                        hours=item["horas"],
                        observations=item["observaciones"],
                        is_active=True
                    )
                    session.add(att)
                imported += 1

            session.commit()
            AuthService.log_action("IMPORTACION_CSV_ASISTENCIA", f"Importación CSV de asistencias: {imported} registros.")
            return {
                "success": True,
                "message": f"Importación de asistencias completada: {imported} registros procesados.",
                "imported_count": imported
            }
        except Exception as e:
            session.rollback()
            return {
                "success": False,
                "message": f"Error al importar asistencias: {str(e)}",
                "imported_count": 0
            }
        finally:
            session.close()
