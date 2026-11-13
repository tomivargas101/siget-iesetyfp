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
import os
import re
import zipfile
from datetime import datetime
from typing import Dict, List, Any, Tuple, Optional
from database.connection import get_db_session
from database.schema import Teacher, Career, Subject, Designation, Attendance, AuditLog, get_argentina_now
from models.security import SecurityGuard
from models.auth import CurrentSession, AuthService

class CsvImportServicePy:
    @staticmethod
    def parse_universal_file(file_source: Any, filename: str = "", explicit_type: str = "auto") -> Dict[str, Any]:
        """
        Parsea un archivo universal (.xlsx, .xls, .docx, .doc, .csv, .txt) ya sea pasando
        la ruta al archivo o un buffer de bytes, y devuelve el tipo detectado ('personnel' o 'attendance'),
        nombre de hoja y el contenido CSV normalizado.
        """
        if not file_source:
            return {"success": False, "message": "No se recibieron datos de archivo."}

        # Obtener bytes y nombre de archivo
        if isinstance(file_source, str) and os.path.exists(file_source):
            if not filename:
                filename = os.path.basename(file_source)
            with open(file_source, "rb") as f:
                raw_bytes = f.read()
        elif isinstance(file_source, (bytes, bytearray)):
            raw_bytes = bytes(file_source)
        else:
            return {"success": False, "message": "Origen de archivo no válido."}

        if len(raw_bytes) == 0:
            return {"success": False, "message": "El archivo está vacío."}

        ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ""
        detected_type = explicit_type
        sheet_name = None
        csv_text = ""

        try:
            if ext in ["xlsx", "xls"]:
                import openpyxl
                wb = openpyxl.load_workbook(io.BytesIO(raw_bytes), data_only=True)
                if not wb.sheetnames:
                    return {"success": False, "message": "El archivo Excel no contiene hojas de cálculo legibles."}

                target_sheet = None
                if explicit_type == "personnel":
                    for name in wb.sheetnames:
                        if re.search(r'datos.*personal|personal|docentes|planta', name, re.IGNORECASE):
                            target_sheet = wb[name]
                            break
                    if not target_sheet:
                        target_sheet = wb.active
                    detected_type = "personnel"
                elif explicit_type == "attendance":
                    for name in wb.sheetnames:
                        if re.search(r'asistencia|novedad', name, re.IGNORECASE):
                            target_sheet = wb[name]
                            break
                    if not target_sheet:
                        target_sheet = wb.active
                    detected_type = "attendance"
                else:
                    pers_sheet = None
                    att_sheet = None
                    for name in wb.sheetnames:
                        if re.search(r'datos.*personal|personal|docentes|planta', name, re.IGNORECASE):
                            pers_sheet = wb[name]
                        elif re.search(r'asistencia|novedad', name, re.IGNORECASE):
                            att_sheet = wb[name]

                    if pers_sheet:
                        target_sheet = pers_sheet
                        detected_type = "personnel"
                    elif att_sheet:
                        target_sheet = att_sheet
                        detected_type = "attendance"
                    else:
                        target_sheet = wb.active

                sheet_name = target_sheet.title

                raw_rows = []
                for row in target_sheet.iter_rows(values_only=True):
                    str_vals = [str(c).strip() if c is not None else "" for c in row]
                    if any(v != "" for v in str_vals):
                        raw_rows.append(str_vals)

                if not raw_rows:
                    return {"success": False, "message": f"La hoja '{sheet_name}' no contiene filas con datos."}

                # Buscar fila de cabecera
                header_idx = 0
                for i, r in enumerate(raw_rows[:6]):
                    r_lower = " ".join(r).lower()
                    if any(k in r_lower for k in ["dni", "legajo", "apellido", "agente", "fecha"]):
                        header_idx = i
                        break

                headers = raw_rows[header_idx]
                data_rows = raw_rows[header_idx + 1:]

                if detected_type == "auto":
                    h_lower = " ".join(headers).lower()
                    if any(k in h_lower for k in ["asistencia", "lic", "fecha"]):
                        detected_type = "attendance"
                    else:
                        detected_type = "personnel"

                # Grilla mensual de asistencia
                is_grid = detected_type == "attendance" and any(re.match(r'^[1-9]$|^[12][0-9]$|^3[01]$', str(h).strip()) for h in headers)
                if is_grid:
                    dni_col = 2
                    for col_i, h in enumerate(headers):
                        if re.search(r'dni|documento', str(h), re.IGNORECASE):
                            dni_col = col_i
                            break

                    now = datetime.now()
                    year = now.year
                    month_num = now.month
                    months = {"enero": 1, "febrero": 2, "marzo": 3, "abril": 4, "mayo": 5, "junio": 6, "julio": 7, "agosto": 8, "septiembre": 9, "octubre": 10, "noviembre": 11, "diciembre": 12}
                    for m_name, m_val in months.items():
                        if m_name in sheet_name.lower():
                            month_num = m_val
                            break

                    month_str = str(month_num).zfill(2)
                    unpivoted = [["DNI", "Fecha", "Estado", "Horas", "Observaciones"]]

                    for r in data_rows:
                        dni_val = re.sub(r'\D', '', r[dni_col] if dni_col < len(r) else "")
                        if not dni_val:
                            continue
                        for col_i, h in enumerate(headers):
                            day_str = str(h).strip()
                            if re.match(r'^[1-9]$|^[12][0-9]$|^3[01]$', day_str):
                                mark = r[col_i].strip().upper() if col_i < len(r) else ""
                                if mark in ["PR", "I", "P", "LIC", "LT"]:
                                    date_iso = f"{year}-{month_str}-{day_str.zfill(2)}"
                                    unpivoted.append([dni_val, date_iso, mark, "4", f"Carga desde planilla {sheet_name}"])

                    out = io.StringIO()
                    writer = csv.writer(out)
                    for r in unpivoted:
                        writer.writerow(r)
                    csv_text = out.getvalue()
                else:
                    out = io.StringIO()
                    writer = csv.writer(out)
                    writer.writerow(headers)
                    for r in data_rows:
                        writer.writerow(r)
                    csv_text = out.getvalue()

            elif ext == "docx":
                with zipfile.ZipFile(io.BytesIO(raw_bytes)) as z:
                    xml_content = z.read("word/document.xml").decode("utf-8", errors="ignore")

                # Tablas
                tr_list = re.findall(r'<w:tr[\s>][\s\S]*?<\/w:tr>', xml_content)
                if tr_list:
                    table_rows = []
                    for tr in tr_list:
                        tc_list = re.findall(r'<w:tc[\s>][\s\S]*?<\/w:tc>', tr)
                        row_vals = []
                        for tc in tc_list:
                            t_list = re.findall(r'<w:t[\s>][\s\S]*?<\/w:t>', tc)
                            text = "".join(re.sub(r'<[^>]+>', '', t) for t in t_list).strip()
                            row_vals.append(text)
                        if any(v != "" for v in row_vals):
                            table_rows.append(row_vals)

                    out = io.StringIO()
                    writer = csv.writer(out)
                    for r in table_rows:
                        writer.writerow(r)
                    csv_text = out.getvalue()
                else:
                    # Párrafos
                    p_list = re.findall(r'<w:p[\s>][\s\S]*?<\/w:p>', xml_content)
                    lines = []
                    for p in p_list:
                        t_list = re.findall(r'<w:t[\s>][\s\S]*?<\/w:t>', p)
                        text = "".join(re.sub(r'<[^>]+>', '', t) for t in t_list).strip()
                        if text:
                            lines.append(text)
                    csv_text = "\n".join(lines)

                if detected_type == "auto":
                    first_chars = csv_text[:500].lower()
                    if any(k in first_chars for k in ["fecha", "asistencia", "lic"]):
                        detected_type = "attendance"
                    else:
                        detected_type = "personnel"

            elif ext == "doc":
                # Extracción de cadenas legibles
                text_latin = raw_bytes.decode("latin1", errors="ignore")
                lines = [l.strip() for l in text_latin.splitlines() if len(l.strip()) > 5 and (',' in l or ';' in l or '\t' in l)]
                if not lines:
                    return {"success": False, "message": "No se encontraron tablas estructuradas legibles en el archivo .doc."}
                csv_text = "\n".join(lines)
                if detected_type == "auto":
                    detected_type = "attendance" if "fecha" in csv_text[:400].lower() else "personnel"

            else:
                # CSV o TXT
                try:
                    csv_text = raw_bytes.decode("utf-8")
                except UnicodeDecodeError:
                    csv_text = raw_bytes.decode("latin1", errors="ignore")

                if detected_type == "auto":
                    first_chars = csv_text[:500].lower()
                    if any(k in first_chars for k in ["fecha", "asistencia", "lic"]):
                        detected_type = "attendance"
                    else:
                        detected_type = "personnel"

            _, parsed_rows = CsvImportServicePy.parse_csv(csv_text)
            return {
                "success": True,
                "file_name": filename,
                "file_size": len(raw_bytes),
                "file_ext": ext.upper(),
                "detected_type": "personnel" if detected_type == "auto" else detected_type,
                "sheet_name": sheet_name,
                "csv_text": csv_text,
                "total_rows": len(parsed_rows),
                "message": f"Archivo '{filename}' cargado correctamente ({len(parsed_rows)} registros detectados)."
            }

        except Exception as e:
            return {
                "success": False,
                "message": f"Error al procesar el archivo: {str(e)}"
            }
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
