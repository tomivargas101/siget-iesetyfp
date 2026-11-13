"""
Test de Carga Masiva Universal para Python / SQLAlchemy
Verifica parse_universal_file en Excel (.xlsx), Word (.docx) y CSV.
"""

import os
import io
import zipfile
import openpyxl
from models.csv_import import CsvImportServicePy

def test_excel_personnel():
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Datos del personal"
    ws.append(["DNI", "Legajo", "Apellido", "Nombre", "Revista", "Horas", "Cátedra", "Carrera", "Día", "Horario", "Resolución"])
    ws.append(["40111222", "LEG-777", "SANCHEZ", "Mariana", "Titular", "4", "Didáctica General", "Profesorado", "Lunes", "18:00 a 20:40", "Disp. 05/26"])
    
    buf = io.BytesIO()
    wb.save(buf)
    data = buf.getvalue()

    res = CsvImportServicePy.parse_universal_file(data, "Planta_Docente.xlsx", "auto")
    assert res["success"] is True, res.get("message")
    assert res["detected_type"] == "personnel"
    assert res["sheet_name"] == "Datos del personal"
    assert res["total_rows"] == 1
    print("✅ [PASS] Python parse_universal_file Excel Personal OK")

    prev = CsvImportServicePy.preview_personnel(res["csv_text"])
    assert prev["success"] is True
    assert prev["valid_rows"] == 1
    print("✅ [PASS] Python preview_personnel OK")

def test_excel_attendance_grid():
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Asistencia Julio"
    ws.append(["N°", "Agente", "DNI", "1", "2", "3", "4", "5"])
    ws.append(["1", "SANCHEZ Mariana", "40111222", "PR", "I", "LIC", "P", "LT"])

    buf = io.BytesIO()
    wb.save(buf)
    data = buf.getvalue()

    res = CsvImportServicePy.parse_universal_file(data, "Asistencia_Julio.xlsx", "auto")
    assert res["success"] is True, res.get("message")
    assert res["detected_type"] == "attendance"
    assert res["total_rows"] == 5
    print("✅ [PASS] Python parse_universal_file Excel Asistencia Grilla unpivoted OK (5 filas)")

def test_docx():
    xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body>
            <w:tbl>
                <w:tr>
                    <w:tc><w:p><w:r><w:t>DNI</w:t></w:r></w:p></w:tc>
                    <w:tc><w:p><w:r><w:t>Apellido</w:t></w:r></w:p></w:tc>
                    <w:tc><w:p><w:r><w:t>Nombre</w:t></w:r></w:p></w:tc>
                </w:tr>
                <w:tr>
                    <w:tc><w:p><w:r><w:t>33444555</w:t></w:r></w:p></w:tc>
                    <w:tc><w:p><w:r><w:t>PERALTA</w:t></w:r></w:p></w:tc>
                    <w:tc><w:p><w:r><w:t>Lucas</w:t></w:r></w:p></w:tc>
                </w:tr>
            </w:tbl>
        </w:body>
    </w:document>"""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("word/document.xml", xml)
    data = buf.getvalue()

    res = CsvImportServicePy.parse_universal_file(data, "Docentes.docx", "personnel")
    assert res["success"] is True, res.get("message")
    assert res["total_rows"] == 1
    print("✅ [PASS] Python parse_universal_file Word (.docx) OK")

if __name__ == "__main__":
    test_excel_personnel()
    test_excel_attendance_grid()
    test_docx()
    print("\n==================================================")
    print("[OK] TODOS LOS TESTS UNIVERSALES PYTHON PASARON")
    print("==================================================")
