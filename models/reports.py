import os
from datetime import datetime, date
import pandas as pd
from openpyxl import Workbook
from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
from openpyxl.utils import get_column_letter
from database.connection import get_db_session
from database.schema import Designation, Teacher, Subject, Career, Substitution, Attendance

class ReportService:
    @staticmethod
    def generate_monthly_statistics_excel(month: int, year: int, career_id: int = None, output_path: str = None) -> str:
        """
        Genera la 'Planilla Oficial de Estadísticas Mensuales y Asistencia Docente'
        respetando el formato institucional de educación superior.
        """
        if not output_path:
            reports_dir = os.path.join(os.getcwd(), "reportes")
            os.makedirs(reports_dir, exist_ok=True)
            output_path = os.path.join(reports_dir, f"Planilla_Estadistica_Mensual_{year}_{month:02d}.xlsx")

        session = get_db_session()
        try:
            # Consultar todas las designaciones
            query = session.query(Designation).join(Subject).join(Teacher).outerjoin(Career, Subject.career_id == Career.id)
            if career_id and career_id != 0:
                query = query.filter(Subject.career_id == career_id)

            designations = query.filter(Designation.is_active == True).order_by(
                Teacher.last_name, Designation.day_of_week
            ).all()

            # Estructurar datos
            rows = []
            for d in designations:
                t = d.teacher
                s = d.subject
                c = s.career if s else None

                # Verificar suplencias vigentes en el mes analizado
                # Primer y último día del mes
                first_day_of_month = date(year, month, 1)
                if month == 12:
                    last_day_of_month = date(year, 12, 31)
                else:
                    last_day_of_month = date(year, month + 1, 1) - pd.Timedelta(days=1)

                active_sub = session.query(Substitution).filter(
                    Substitution.designation_id == d.id,
                    Substitution.is_active == True,
                    Substitution.start_date <= last_day_of_month,
                    Substitution.end_date >= first_day_of_month
                ).first()

                condicion = "Titular en Ejercicio"
                detalle_suplencia = "-"
                resolucion = d.resolution_number or "-"

                if active_sub:
                    condicion = f"Licencia (Reemplazado por {active_sub.suplente.full_name})"
                    detalle_suplencia = f"{active_sub.license_reason} ({active_sub.start_date.strftime('%d/%m')} al {active_sub.end_date.strftime('%d/%m')})"
                    resolucion = active_sub.resolution_number

                # Estimación de horas mensuales (4.2 semanas promedio por mes)
                horas_semanales = d.hours_count
                horas_mensuales = int(horas_semanales * 4)

                rows.append({
                    "Legajo": t.legajo,
                    "Apellido y Nombres": t.full_name,
                    "DNI": t.dni,
                    "Situación de Revista": t.revista,
                    "Carrera": c.name if c else "Sin Asignar",
                    "Cátedra / Espacio Curricular": s.name if s else "-",
                    "Día": d.day_of_week,
                    "Horario": f"{d.start_time} - {d.end_time}",
                    "Hs Cátedra Sem.": horas_semanales,
                    "Hs Cátedra Mes": horas_mensuales,
                    "Condición": condicion,
                    "N° Resolución Ministerial": resolucion,
                    "Motivo Licencia / Suplencia": detalle_suplencia
                })

            # Generar Excel con openpyxl para estilizado corporativo impecable
            wb = Workbook()
            ws = wb.active
            ws.title = f"Estadística {month:02d}-{year}"

            # Paleta de colores institucional
            NAVY_PRIMARY = "1B365D"
            NAVY_ACCENT = "2C5282"
            GRAY_LIGHT = "F7FAFC"
            WHITE = "FFFFFF"
            BORDER_COLOR = "D2D6DC"

            title_font = Font(name="Calibri", size=16, bold=True, color=WHITE)
            sub_font = Font(name="Calibri", size=11, italic=True, color=WHITE)
            header_font = Font(name="Calibri", size=11, bold=True, color=WHITE)
            data_font = Font(name="Calibri", size=10)
            bold_font = Font(name="Calibri", size=10, bold=True)

            navy_fill = PatternFill(start_color=NAVY_PRIMARY, end_color=NAVY_PRIMARY, fill_type="solid")
            accent_fill = PatternFill(start_color=NAVY_ACCENT, end_color=NAVY_ACCENT, fill_type="solid")
            zebra_fill = PatternFill(start_color=GRAY_LIGHT, end_color=GRAY_LIGHT, fill_type="solid")

            thin_side = Side(border_style="thin", color=BORDER_COLOR)
            border = Border(left=thin_side, right=thin_side, top=thin_side, bottom=thin_side)

            # 1. Encabezado institucional
            ws.merge_cells("A1:M1")
            top_title = ws["A1"]
            top_title.value = "SIGET - SISTEMA INTEGRAL DE GESTIÓN EDUCATIVA TERCIARIA"
            top_title.font = title_font
            top_title.fill = navy_fill
            top_title.alignment = Alignment(horizontal="center", vertical="center")
            ws.row_dimensions[1].height = 36

            ws.merge_cells("A2:M2")
            sub_title = ws["A2"]
            sub_title.value = f"PLANILLA OFICIAL DE ESTADÍSTICAS MENSUALES Y PLANTA FUNCIONAL - PERÍODO: {month:02d}/{year} (Generado: {datetime.now().strftime('%d/%m/%Y %H:%M')})"
            sub_title.font = sub_font
            sub_title.fill = accent_fill
            sub_title.alignment = Alignment(horizontal="center", vertical="center")
            ws.row_dimensions[2].height = 24

            ws.row_dimensions[3].height = 10  # Espacio en blanco

            # 2. Cabeceras de columnas
            headers = [
                "Legajo", "Apellido y Nombres", "DNI", "Situación Revista",
                "Carrera", "Cátedra / Espacio Curricular", "Día", "Horario",
                "Hs Semanales", "Hs Mes", "Condición en Planta",
                "N° Resolución", "Detalle Suplencia / Licencia"
            ]

            header_row = 4
            ws.row_dimensions[header_row].height = 26
            for col_idx, h in enumerate(headers, start=1):
                cell = ws.cell(row=header_row, column=col_idx, value=h)
                cell.font = header_font
                cell.fill = navy_fill
                cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
                cell.border = border

            # 3. Filas de datos
            start_row = 5
            total_hs_semanales = 0
            total_hs_mes = 0

            for i, r in enumerate(rows):
                cur_row = start_row + i
                ws.row_dimensions[cur_row].height = 20

                values = [
                    r["Legajo"],
                    r["Apellido y Nombres"],
                    r["DNI"],
                    r["Situación de Revista"],
                    r["Carrera"],
                    r["Cátedra / Espacio Curricular"],
                    r["Día"],
                    r["Horario"],
                    r["Hs Cátedra Sem."],
                    r["Hs Cátedra Mes"],
                    r["Condición"],
                    r["N° Resolución Ministerial"],
                    r["Motivo Licencia / Suplencia"]
                ]

                total_hs_semanales += r["Hs Cátedra Sem."]
                total_hs_mes += r["Hs Cátedra Mes"]

                for col_idx, val in enumerate(values, start=1):
                    cell = ws.cell(row=cur_row, column=col_idx, value=val)
                    cell.font = data_font
                    cell.border = border
                    
                    # Alineación
                    if col_idx in [1, 3, 7, 8, 12]:
                        cell.alignment = Alignment(horizontal="center", vertical="center")
                    elif col_idx in [9, 10]:
                        cell.alignment = Alignment(horizontal="right", vertical="center")
                    else:
                        cell.alignment = Alignment(horizontal="left", vertical="center")

                    # Cebra en filas pares
                    if i % 2 == 1:
                        cell.fill = zebra_fill

            # 4. Fila de Totales
            tot_row = start_row + len(rows)
            ws.row_dimensions[tot_row].height = 24
            ws.cell(row=tot_row, column=1, value="TOTALES GENERALES").font = bold_font
            ws.merge_cells(start_row=tot_row, start_column=1, end_row=tot_row, end_column=8)
            ws.cell(row=tot_row, column=1).alignment = Alignment(horizontal="right", vertical="center")
            
            c_tot_sem = ws.cell(row=tot_row, column=9, value=total_hs_semanales)
            c_tot_sem.font = bold_font
            c_tot_sem.alignment = Alignment(horizontal="right", vertical="center")

            c_tot_mes = ws.cell(row=tot_row, column=10, value=total_hs_mes)
            c_tot_mes.font = bold_font
            c_tot_mes.alignment = Alignment(horizontal="right", vertical="center")

            for col_idx in range(1, 14):
                ws.cell(row=tot_row, column=col_idx).border = border
                ws.cell(row=tot_row, column=col_idx).fill = zebra_fill

            # 5. Ajustar ancho automático de columnas
            for col in ws.columns:
                max_len = 0
                col_letter = get_column_letter(col[0].column)
                for cell in col:
                    if cell.row in [1, 2]:
                        continue
                    if cell.value:
                        max_len = max(max_len, len(str(cell.value)))
                ws.column_dimensions[col_letter].width = max(max_len + 4, 12)

            wb.save(output_path)
            return output_path
        finally:
            session.close()
