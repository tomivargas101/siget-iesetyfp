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
        if isinstance(file_source, str) and not os.path.exists(file_source) and isinstance(filename, (bytes, bytearray)):
            raw_bytes = bytes(filename)
            filename = file_source
        elif isinstance(file_source, str):
            if os.path.exists(file_source):
                if not filename:
                    filename = os.path.basename(file_source)
                with open(file_source, "rb") as f:
                    raw_bytes = f.read()
            else:
                raw_bytes = file_source.encode("utf-8")
                if not filename:
                    filename = "upload.csv"
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
                # CSV o TXT plano
                if len(raw_bytes) >= 2 and raw_bytes[:2] == b'\xff\xfe':
                    csv_text = raw_bytes[2:].decode("utf-16le", errors="ignore")
                else:
                    try:
                        csv_text = raw_bytes.decode("utf-8")
                    except UnicodeDecodeError:
                        csv_text = raw_bytes.decode("latin1", errors="ignore")

                csv_text = csv_text.lstrip('\ufeff')

                if detected_type == "auto":
                    sample = csv_text[:1500].lower()
                    has_attendance = bool(re.search(r'\b(fecha|date|dia|asistencia|novedad|marca|inasistencia|presente|lic|lt|falta|permiso|ausente)\b', sample))
                    has_date_pat = bool(re.search(r'\b\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2}\b|\b\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}\b', sample))
                    has_personnel = bool(re.search(r'\b(legajo|apellido|catedra|carrera|revista|titular|provisional|interino|suplente|resolucion|disposicion)\b', sample))

                    if (has_attendance or has_date_pat) and not has_personnel:
                        detected_type = "attendance"
                    elif has_personnel and not has_date_pat:
                        detected_type = "personnel"
                    elif has_date_pat:
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
        replacements = [('á', 'a'), ('é', 'e'), ('í', 'i'), ('ó', 'o'), ('ú', 'u'), ('ñ', 'n')]
        for a, b in replacements:
            s = s.replace(a, b)
        s = re.sub(r'[^a-z0-9]', '_', s)
        s = re.sub(r'_+', '_', s).strip('_')
        return s

    @staticmethod
    def _clean_cell_value(val: str) -> str:
        if not val:
            return ""
        s = val.strip()
        if (s.startswith('"') and s.endswith('"')) or (s.startswith("'") and s.endswith("'")):
            s = s[1:-1].strip()
        s = re.sub(r'^[“”«»]+|[“”«»]+$', '', s).strip()
        return s

    @staticmethod
    def _parse_date(raw_fecha: str) -> Optional[str]:
        if not raw_fecha:
            return None
        s = re.sub(r'[\'\"“”«»]', '', str(raw_fecha)).strip()

        # ISO: YYYY-MM-DD o YYYY/MM/DD o YYYY.MM.DD
        m = re.match(r'^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$', s)
        if m:
            return f"{m.group(1)}-{m.group(2).zfill(2)}-{m.group(3).zfill(2)}"

        # DD/MM/YYYY o DD-MM-YYYY o DD.MM.YYYY
        m = re.match(r'^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$', s)
        if m:
            return f"{m.group(3)}-{m.group(2).zfill(2)}-{m.group(1).zfill(2)}"

        # DD/MM/YY
        m = re.match(r'^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2})$', s)
        if m:
            return f"20{m.group(3)}-{m.group(2).zfill(2)}-{m.group(1).zfill(2)}"

        return None

    @staticmethod
    def _normalize_attendance_status(status: str) -> Optional[str]:
        if not status:
            return None
        s = re.sub(r'[\'\"“”«»]', '', str(status)).strip().upper()
        if s in ["PR", "PRESENTE", "P_PRESENTE", "PRES", "P."]:
            return "PR"
        if s in ["I", "INASISTENCIA", "FALTA", "AUSENTE", "INJUSTIFICADA", "AUS"]:
            return "I"
        if s in ["P", "PERMISO", "ART_115", "115", "ART115"]:
            return "P"
        if s in ["LIC", "LICENCIA", "MEDICA", "ART_114A", "114A", "ART114A", "114-A", "JUSTIFICADA"]:
            return "LIC"
        if s in ["LT", "LARGO_TRATAMIENTO", "LARGO TRATAMIENTO", "114B", "ART_114B", "ART114B", "114-B"]:
            return "LT"
        return None

    @staticmethod
    def parse_csv(csv_content: str, default_type: str = "auto") -> Tuple[List[str], List[Dict[str, Any]]]:
        if not csv_content or not csv_content.strip():
            return [], []

        clean_text = csv_content.lstrip('\ufeff').replace('\r\n', '\n').replace('\r', '\n')
        raw_lines = [l.strip() for l in clean_text.splitlines() if l.strip()]
        if not raw_lines:
            return [], []

        # Detectar delimitador inspeccionando las primeras líneas
        sample_text = "\n".join(raw_lines[:10])
        commas = sample_text.count(',')
        semicolons = sample_text.count(';')
        tabs = sample_text.count('\t')
        pipes = sample_text.count('|')

        delimiter = ','
        if semicolons > 0 and semicolons >= commas and semicolons >= tabs:
            delimiter = ';'
        elif tabs > commas and tabs > semicolons:
            delimiter = '\t'
        elif pipes > commas and pipes > semicolons:
            delimiter = '|'

        reader = csv.reader(io.StringIO(clean_text), delimiter=delimiter)
        raw_rows = [[CsvImportServicePy._clean_cell_value(cell) for cell in r] for r in reader if any(cell.strip() for cell in r)]
        if not raw_rows:
            return [], []

        first_row = raw_rows[0]
        # Determinar si la primera fila es encabezado o fila de datos
        has_dni_or_date = any(
            (len(re.sub(r'\D', '', val)) in range(7, 11)) or (CsvImportServicePy._parse_date(val) is not None)
            for val in first_row
        )
        has_keywords = any(
            any(k in CsvImportServicePy._normalize_header(val) for k in ['dni', 'documento', 'doc', 'fecha', 'dia', 'date', 'estado', 'marca', 'novedad', 'asistencia', 'horas', 'apellido', 'nombre', 'legajo', 'catedra'])
            for val in first_row
        )

        if has_keywords and not has_dni_or_date:
            headers = [CsvImportServicePy._normalize_header(h) for h in first_row]
            data_rows = raw_rows[1:]
            start_line = 2
        else:
            has_date_in_line = any(CsvImportServicePy._parse_date(val) is not None for val in first_row)
            is_attendance = (default_type == "attendance") or (default_type == "auto" and has_date_in_line)
            if is_attendance:
                headers = ['dni', 'fecha', 'estado', 'horas', 'observaciones']
            else:
                # Estructura oficial de planta institucional: DNI, Legajo, Apellido, Nombre...
                headers = ['dni', 'legajo', 'apellido', 'nombre', 'revista', 'horas', 'catedra', 'carrera', 'dia', 'horario', 'resolucion']
            data_rows = raw_rows
            start_line = 1

        has_header_row = (start_line == 2)
        rows = []
        for line_idx, r in enumerate(data_rows, start=start_line):
            row_dict = {}
            for col_idx in range(max(len(headers), len(r))):
                header_name = headers[col_idx] if col_idx < len(headers) else f"col_{col_idx}"
                val = r[col_idx].strip() if col_idx < len(r) else ""
                row_dict[header_name] = val
                row_dict[f"_{col_idx}"] = val
            row_dict["_raw_line"] = line_idx
            row_dict["_raw_values"] = r
            row_dict["_has_header_row"] = has_header_row
            rows.append(row_dict)

        return headers, rows

    @staticmethod
    def preview_personnel(csv_content: str) -> Dict[str, Any]:
        """
        Valida y genera informe de inconsistencias del archivo de personal.
        """
        headers, rows = CsvImportServicePy.parse_csv(csv_content, "personnel")
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
            existing_teachers = {}
            for t in session.query(Teacher).all():
                raw = str(t.dni or "").strip()
                digits = re.sub(r'\D', '', raw)
                existing_teachers[raw] = t
                if digits:
                    existing_teachers[digits] = t
                    existing_teachers[digits.lstrip('0')] = t
                    if len(digits) <= 8:
                        existing_teachers[digits.zfill(8)] = t
                if t.legajo:
                    existing_teachers[str(t.legajo).strip().lower()] = t

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

                # 1. Extraer DNI con búsqueda flexible
                raw_dni = (
                    r.get("dni") or r.get("documento") or r.get("doc") or
                    r.get("nro_doc") or r.get("num_doc") or r.get("nro_documento") or
                    r.get("num_documento") or r.get("documento_nro") or
                    r.get("agente") or r.get("docente") or ""
                )
                if not raw_dni and r.get("_raw_values"):
                    for v in r["_raw_values"]:
                        d = re.sub(r'\D', '', str(v))
                        if 6 <= len(d) <= 10:
                            raw_dni = v
                            break
                if not raw_dni and r.get("_0"):
                    raw_dni = r["_0"]
                clean_dni = re.sub(r'\D', '', re.sub(r'[\'\"“”«»]', '', str(raw_dni))).strip()

                legajo = ""
                apellido = ""
                nombre = ""

                raw_vals = r.get("_raw_values") or []
                dni_idx = -1
                for idx, v in enumerate(raw_vals):
                    if re.sub(r'[\'\"“”«»\.\s]', '', str(v)) == clean_dni:
                        dni_idx = idx
                        break

                non_dni_cells = [re.sub(r'[\'\"“”«»]', '', str(v)).strip() for idx, v in enumerate(raw_vals) if idx != dni_idx]
                has_header_row = r.get("_has_header_row", True)

                if has_header_row:
                    legajo = re.sub(r'[\'\"“”«»]', '', str(r.get("legajo") or r.get("nro_legajo") or r.get("n_legajo") or r.get("num_legajo") or "")).strip()
                    apellido = re.sub(r'[\'\"“”«»]', '', str(r.get("apellido") or r.get("apellidos") or "")).strip()
                    nombre = re.sub(r'[\'\"“”«»]', '', str(r.get("nombre") or r.get("nombres") or "")).strip()

                    if (not apellido or not nombre) and r.get("apellido_y_nombre"):
                        raw_full = re.sub(r'[\'\"“”«»]', '', str(r["apellido_y_nombre"])).strip()
                        if "," in raw_full:
                            parts = raw_full.split(",")
                            apellido = parts[0].strip()
                            nombre = " ".join(p.strip() for p in parts[1:])
                        else:
                            parts = raw_full.split()
                            if len(parts) > 1:
                                apellido = parts[0].strip()
                                nombre = " ".join(parts[1:])
                            else:
                                apellido = raw_full
                else:
                    # Caso directo sin encabezados: mapeo semántico por contenido de celdas
                    c0 = non_dni_cells[0] if len(non_dni_cells) > 0 else ""
                    c1 = non_dni_cells[1] if len(non_dni_cells) > 1 else ""
                    c2 = non_dni_cells[2] if len(non_dni_cells) > 2 else ""

                    is_c0_code = bool(re.match(r'^\d+$', re.sub(r'\D', '', c0))) and (len(c0) <= 8 or bool(re.match(r'^(LEG|DOC|L|P)-', c0, re.IGNORECASE)))
                    is_c1_code = bool(re.match(r'^\d+$', re.sub(r'\D', '', c1))) and (len(c1) <= 8 or bool(re.match(r'^(LEG|DOC|L|P)-', c1, re.IGNORECASE)))
                    is_c2_code = bool(re.match(r'^\d+$', re.sub(r'\D', '', c2))) and (len(c2) <= 8 or bool(re.match(r'^(LEG|DOC|L|P)-', c2, re.IGNORECASE)))

                    if "," in c0 and not re.search(r'\d', c0):
                        parts = c0.split(",")
                        apellido = parts[0].strip()
                        nombre = " ".join(p.strip() for p in parts[1:])
                        legajo = c1
                    elif "," in c1 and not re.search(r'\d', c1):
                        parts = c1.split(",")
                        apellido = parts[0].strip()
                        nombre = " ".join(p.strip() for p in parts[1:])
                        legajo = c0
                    elif is_c0_code and not is_c1_code and len(c1) > 0:
                        # Formato Institucional Estándar: DNI ; Legajo (c0) ; Apellido (c1) ; Nombre (c2)
                        legajo = c0
                        apellido = c1
                        nombre = c2 if not is_c2_code else ""
                    elif not is_c0_code and not is_c1_code and is_c2_code:
                        # Formato Alternativo: DNI ; Apellido (c0) ; Nombre (c1) ; Legajo (c2)
                        apellido = c0
                        nombre = c1
                        legajo = c2
                    elif not is_c0_code and is_c1_code:
                        # Formato DNI ; Apellido (c0) ; Legajo (c1) ; Nombre (c2)
                        apellido = c0
                        legajo = c1
                        nombre = c2 if not is_c2_code else ""
                    else:
                        legajo = c0
                        apellido = c1
                        nombre = c2

                # Fallback por índices posicionales estándar
                if not legajo and r.get("_1") and bool(re.match(r'^\d+$', str(r["_1"]).strip())): legajo = str(r["_1"]).strip()
                if not apellido and r.get("_2"): apellido = str(r["_2"]).strip()
                if not nombre and r.get("_3"): nombre = str(r["_3"]).strip()
                if not apellido and r.get("_1") and not bool(re.match(r'^\d+$', str(r["_1"]).strip())): apellido = str(r["_1"]).strip()
                if not nombre and r.get("_2") and not bool(re.match(r'^\d+$', str(r["_2"]).strip())) and not nombre: nombre = str(r["_2"]).strip()

                if apellido and not nombre and "," in apellido:
                    parts = apellido.split(",")
                    apellido = parts[0].strip()
                    nombre = " ".join(p.strip() for p in parts[1:])

                # SANITY CHECK & AUTOCORRECCIÓN ESTRICTA
                is_apellido_numeric = bool(re.match(r'^\d+$', re.sub(r'[\.\-\s]', '', apellido)))
                is_nombre_numeric = bool(re.match(r'^\d+$', re.sub(r'[\.\-\s]', '', nombre)))
                is_legajo_text_only = not bool(re.search(r'\d', legajo)) and len(legajo) > 2

                if is_apellido_numeric and is_legajo_text_only and not is_nombre_numeric:
                    legajo, apellido, nombre = apellido, nombre, legajo
                elif is_apellido_numeric and not is_nombre_numeric:
                    legajo, apellido, nombre = apellido, nombre, ""
                elif is_nombre_numeric:
                    legajo, nombre = nombre, legajo

                revista = r.get("revista") or r.get("situacion_revista") or "Titular"
                rev_norm = str(revista).lower()
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

                catedra = re.sub(r'[\'\"“”«»]', '', str(r.get("catedra") or r.get("materia") or "")).strip()
                carrera = re.sub(r'[\'\"“”«»]', '', str(r.get("carrera") or "Profesorado")).strip()
                dia = re.sub(r'[\'\"“”«»]', '', str(r.get("dia") or "Lunes")).strip()
                horario = re.sub(r'[\'\"“”«»]', '', str(r.get("horario") or "18:00 a 20:00")).strip()
                resolucion = re.sub(r'[\'\"“”«»]', '', str(r.get("resolucion") or "Disp. Pendiente")).strip()

                try:
                    horas = int(re.sub(r'\D', '', str(r.get("horas") or r.get("cant_horas") or (4 if catedra else 0))))
                except (ValueError, TypeError):
                    horas = 4 if catedra else 0

                existing = (
                    existing_teachers.get(clean_dni) or
                    existing_teachers.get(clean_dni.lstrip('0')) or
                    (existing_teachers.get(clean_dni.zfill(8)) if len(clean_dni) <= 8 else None)
                )

                if not nombre and existing:
                    nombre = existing.first_name
                if not legajo and existing:
                    legajo = existing.legajo

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

                existing = (
                    existing_teachers.get(clean_dni) or
                    existing_teachers.get(clean_dni.lstrip('0')) or
                    (existing_teachers.get(clean_dni.zfill(8)) if len(clean_dni) <= 8 else None)
                )
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

                dni_str = str(item["dni"]).strip()
                clean_digits = re.sub(r'\D', '', dni_str)
                possible_dnis = list({dni_str, clean_digits, clean_digits.lstrip('0'), clean_digits.zfill(8)})
                teacher = session.query(Teacher).filter(Teacher.dni.in_(possible_dnis)).first()

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
                        if item.get("legajo") and item["legajo"] != "-" and not str(item["legajo"]).startswith("LEG-"):
                            teacher.legajo = item["legajo"]
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
            teachers_by_dni = {}
            for t in session.query(Teacher).all():
                raw = str(t.dni or "").strip()
                digits = re.sub(r'\D', '', raw)
                teachers_by_dni[raw] = t
                if digits:
                    teachers_by_dni[digits] = t
                    teachers_by_dni[digits.lstrip('0')] = t
                    if len(digits) <= 8:
                        teachers_by_dni[digits.zfill(8)] = t
                if t.legajo:
                    teachers_by_dni[str(t.legajo).strip().lower()] = t

            errors = []
            preview = []
            valid_count = 0
            invalid_count = 0

            for r in rows:
                line_num = r["_raw_line"]
                row_errors = []

                # 1. DNI con búsqueda flexible por alias o posición
                raw_dni = (
                    r.get("dni") or r.get("documento") or r.get("doc") or
                    r.get("nro_doc") or r.get("num_doc") or r.get("nro_documento") or
                    r.get("num_documento") or r.get("documento_nro") or
                    r.get("agente") or r.get("docente") or r.get("profesor") or
                    r.get("_0") or ""
                )
                if not raw_dni and r.get("_raw_values"):
                    for v in r["_raw_values"]:
                        d = re.sub(r'\D', '', str(v))
                        if 6 <= len(d) <= 10:
                            raw_dni = v
                            break
                clean_dni = re.sub(r'\D', '', re.sub(r'[\'\"“”«»]', '', str(raw_dni))).strip()

                # 2. Fecha con búsqueda flexible
                raw_fecha = (
                    r.get("fecha") or r.get("date") or r.get("dia") or
                    r.get("fecha_asistencia") or r.get("fecha_novedad") or
                    r.get("dia_fecha") or r.get("jornada") or r.get("_1") or ""
                )
                parsed_date = CsvImportServicePy._parse_date(raw_fecha)
                if not parsed_date and r.get("_raw_values"):
                    for v in r["_raw_values"]:
                        pd = CsvImportServicePy._parse_date(v)
                        if pd:
                            parsed_date = pd
                            raw_fecha = str(v)
                            break

                # 3. Marca / Estado con búsqueda flexible
                raw_estado = str(
                    r.get("estado") or r.get("marca") or r.get("asistencia") or
                    r.get("novedad") or r.get("condicion") or r.get("situacion") or
                    r.get("motivo") or r.get("codigo") or r.get("marca_asistencia") or
                    r.get("tipo") or r.get("_2") or ""
                ).strip()
                norm_status = CsvImportServicePy._normalize_attendance_status(raw_estado)
                if not norm_status and r.get("_raw_values"):
                    for v in r["_raw_values"]:
                        ns = CsvImportServicePy._normalize_attendance_status(v)
                        if ns:
                            norm_status = ns
                            raw_estado = str(v)
                            break

                # 4. Horas y Observaciones
                raw_horas = r.get("horas") or r.get("cant_horas") or r.get("cantidad_horas") or r.get("hs") or r.get("_3") or "4"
                try:
                    horas = int(re.sub(r'\D', '', str(raw_horas))) or 4
                except (ValueError, TypeError):
                    horas = 4

                obs = re.sub(
                    r'[\'\"“”«»]', '',
                    str(r.get("observaciones") or r.get("observacion") or r.get("obs") or
                        r.get("motivo") or r.get("detalle") or r.get("comentario") or r.get("_4") or "")
                ).strip()

                # 5. Búsqueda de docente en el catálogo institucional
                teacher = (
                    teachers_by_dni.get(clean_dni) or
                    teachers_by_dni.get(clean_dni.lstrip('0')) or
                    (teachers_by_dni.get(clean_dni.zfill(8)) if len(clean_dni) <= 8 else None)
                )

                if not clean_dni:
                    row_errors.append("DNI obligatorio no indicado.")
                elif not teacher:
                    row_errors.append(f"No existe ningún docente registrado con el DNI '{clean_dni}'. Debe cargarlo previamente en Planta Funcional.")

                if not parsed_date:
                    row_errors.append(f"Formato de fecha inválido: '{raw_fecha}'. Use AAAA-MM-DD o DD/MM/AAAA.")
                if not norm_status:
                    row_errors.append(f"Marca de asistencia no válida: '{raw_estado}'. Catálogo cerrado admitido: PR, I, P, LIC, LT.")

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
                    "teacherName": f"{teacher.last_name}, {teacher.first_name}" if teacher else "Docente Inexistente",
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
            teachers_by_dni = {}
            for t in session.query(Teacher).all():
                raw = str(t.dni or "").strip()
                digits = re.sub(r'\D', '', raw)
                teachers_by_dni[raw] = t.id
                if digits:
                    teachers_by_dni[digits] = t.id
                    teachers_by_dni[digits.lstrip('0')] = t.id
                    if len(digits) <= 8:
                        teachers_by_dni[digits.zfill(8)] = t.id
                if t.legajo:
                    teachers_by_dni[str(t.legajo).strip().lower()] = t.id

            imported = 0
            for item in prev["preview"]:
                if item["status"] != "VÁLIDO":
                    continue

                dni_val = str(item["dni"]).strip()
                t_id = (
                    teachers_by_dni.get(dni_val) or
                    teachers_by_dni.get(dni_val.lstrip('0')) or
                    (teachers_by_dni.get(dni_val.zfill(8)) if len(dni_val) <= 8 else None)
                )
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
