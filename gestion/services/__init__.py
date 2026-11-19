import csv
import io
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from datetime import date, timedelta
from django.db import transaction
from django.db.models import Count, Q
from ..models import (
    Agente, Carrera, Materia, Designacion, TipoLicencia,
    NovedadAsistencia, Disposicion, RenglonMensual, Auditoria,
    DEFAULT_OFFICE_CODE
)
from .horarios import HorarioService, DIAS_SEMANA_ORDEN

DIAS_MAP = {
    0: "Lunes",
    1: "Martes",
    2: "Miércoles",
    3: "Jueves",
    4: "Viernes",
    5: "Sábado",
    6: "Domingo"
}

def registrar_auditoria(usuario, accion, detalles="", ip=None):
    nombre = usuario.username if (usuario and hasattr(usuario, "username") and usuario.is_authenticated) else "Sistema / Anónimo"
    Auditoria.objects.create(
        usuario=usuario if (usuario and hasattr(usuario, "is_authenticated") and usuario.is_authenticated) else None,
        usuario_nombre=nombre,
        accion=accion,
        detalles=detalles,
        ip=ip
    )

class ProcesadorMensualService:
    @classmethod
    @transaction.atomic
    def procesar_mes(cls, mes: int, anio: int, usuario_responsable=None) -> dict:
        RenglonMensual.objects.filter(mes=mes, anio=anio).delete()

        novedades = NovedadAsistencia.objects.filter(
            fecha__year=anio,
            fecha__month=mes,
            estado__in=["I", "LIC", "P", "LT"]
        ).select_related("agente", "tipo_licencia", "suplente").order_by(
            "agente__apellido", "agente__nombre", "fecha"
        )

        if not novedades.exists():
            return {
                "success": True,
                "total_renglones": 0,
                "il01_count": 0,
                "il02_count": 0,
                "disposiciones_creadas": 0,
                "mensaje": f"No se registraron inasistencias ni licencias (I, LIC, P, LT) para el período {mes:02d}/{anio}."
            }

        tipo_lic_defecto_i = TipoLicencia.objects.filter(codigo="I").first()
        tipo_lic_defecto_p = TipoLicencia.objects.filter(codigo="115").first()
        tipo_lic_defecto_lic = TipoLicencia.objects.filter(codigo="114A").first()

        novedades_por_agente = {}
        for nov in novedades:
            agente_id = nov.agente_id
            if agente_id not in novedades_por_agente:
                novedades_por_agente[agente_id] = []
            novedades_por_agente[agente_id].append(nov)

        agentes_ordenados = sorted(
            novedades_por_agente.keys(),
            key=lambda a_id: (
                novedades_por_agente[a_id][0].agente.apellido.lower(),
                novedades_por_agente[a_id][0].agente.nombre.lower()
            )
        )

        ultima_disp = Disposicion.objects.filter(anio=anio).order_by("-numero").first()
        proximo_numero_disp = (ultima_disp.numero + 1) if ultima_disp else 1

        renglones_creados = []
        disposiciones_nuevas = 0

        for agente_id in agentes_ordenados:
            lista_novs = novedades_por_agente[agente_id]
            
            bloques = []
            bloque_actual = []
            for nov in lista_novs:
                if not bloque_actual:
                    bloque_actual.append(nov)
                else:
                    ultimo = bloque_actual[-1]
                    es_consecutivo = (nov.fecha - ultimo.fecha).days == 1
                    mismo_tipo = (nov.estado == ultimo.estado and nov.formulario_numero == ultimo.formulario_numero)
                    if es_consecutivo and mismo_tipo:
                        bloque_actual.append(nov)
                    else:
                        bloques.append(bloque_actual)
                        bloque_actual = [nov]
            if bloque_actual:
                bloques.append(bloque_actual)

            for bloque in bloques:
                fecha_desde = bloque[0].fecha
                fecha_hasta = bloque[-1].fecha
                primer_nov = bloque[0]

                tipo_lic = primer_nov.tipo_licencia
                if not tipo_lic:
                    if primer_nov.estado == "I":
                        tipo_lic = tipo_lic_defecto_i
                    elif primer_nov.estado == "P":
                        tipo_lic = tipo_lic_defecto_p
                    else:
                        tipo_lic = tipo_lic_defecto_lic

                cuadro_destino = "IL-01" if (tipo_lic and tipo_lic.cuadro_destino == "IL-01") else "IL-02"
                articulo_str = tipo_lic.articulo if tipo_lic else "Inasistencia"
                codigo_str = tipo_lic.codigo if tipo_lic else primer_nov.estado

                num_disp = proximo_numero_disp
                disp_str = f"Disp. N° {num_disp:03d}/{anio}"
                disposicion_obj, created = Disposicion.objects.get_or_create(
                    anio=anio,
                    numero=num_disp,
                    defaults={
                        "numero_formateado": disp_str,
                        "fecha_emision": date.today(),
                        "observaciones": f"Asignada a {primer_nov.agente.nombre_completo} para el período {fecha_desde} al {fecha_hasta}."
                    }
                )
                if created:
                    proximo_numero_disp += 1
                    disposiciones_nuevas += 1

                fechas_del_bloque = [n.fecha for n in bloque]
                agente_obj = primer_nov.agente
                designaciones_agente = list(agente_obj.designaciones.filter(activo=True).select_related("materia", "materia__carrera"))

                materias_impactadas = False
                for fecha_dia in fechas_del_bloque:
                    franjas_del_dia = HorarioService.obtener_franjas_docente_en_fecha(agente_obj, fecha_dia)

                    for franja in franjas_del_dia:
                        materias_impactadas = True
                        desig = franja["designacion"]
                        suplente_final = primer_nov.suplente
                        if suplente_final:
                            obs = f"Reemplazado por: {suplente_final.apellido}, {suplente_final.nombre}"
                        else:
                            obs = "Sin suplente asignado / Cátedra sin cobertura"

                        renglon = RenglonMensual(
                            mes=mes,
                            anio=anio,
                            cuadro=cuadro_destino,
                            oficina=DEFAULT_OFFICE_CODE,
                            agente=agente_obj,
                            designacion=desig,
                            materia_nombre=desig.materia.nombre,
                            carrera_nombre=desig.materia.carrera.nombre,
                            situacion_revista=desig.situacion_revista,
                            horas_afectadas=franja["horas_catedra"],
                            desde=fecha_desde,
                            hasta=fecha_hasta,
                            tipo_licencia=tipo_lic,
                            articulo=articulo_str,
                            codigo_licencia=codigo_str,
                            disposicion=disposicion_obj,
                            formulario_numero=primer_nov.formulario_numero,
                            suplente=suplente_final,
                            observaciones=obs,
                            creado_por=usuario_responsable
                        )
                        renglones_creados.append(renglon)

                if not materias_impactadas:
                    desig_generica = designaciones_agente[0] if designaciones_agente else None
                    if desig_generica:
                        renglon = RenglonMensual(
                            mes=mes,
                            anio=anio,
                            cuadro=cuadro_destino,
                            oficina=DEFAULT_OFFICE_CODE,
                            agente=agente_obj,
                            designacion=desig_generica,
                            materia_nombre=desig_generica.materia.nombre,
                            carrera_nombre=desig_generica.materia.carrera.nombre,
                            situacion_revista=desig_generica.situacion_revista,
                            horas_afectadas=desig_generica.horas_catedra,
                            desde=fecha_desde,
                            hasta=fecha_hasta,
                            tipo_licencia=tipo_lic,
                            articulo=articulo_str,
                            codigo_licencia=codigo_str,
                            disposicion=disposicion_obj,
                            formulario_numero=primer_nov.formulario_numero,
                            suplente=primer_nov.suplente,
                            observaciones="Jornada institucional sin cátedra directa",
                            creado_por=usuario_responsable
                        )
                        renglones_creados.append(renglon)

        RenglonMensual.objects.bulk_create(renglones_creados)

        il01_total = sum(1 for r in renglones_creados if r.cuadro == "IL-01")
        il02_total = sum(1 for r in renglones_creados if r.cuadro == "IL-02")

        registrar_auditoria(
            usuario=usuario_responsable,
            accion="PROCESAMIENTO_MENSUAL",
            detalles=f"Período {mes:02d}/{anio}: Se generaron {len(renglones_creados)} renglones (IL-01: {il01_total}, IL-02: {il02_total}) y {disposiciones_nuevas} disposiciones."
        )

        return {
            "success": True,
            "total_renglones": len(renglones_creados),
            "il01_count": il01_total,
            "il02_count": il02_total,
            "disposiciones_creadas": disposiciones_nuevas,
            "mensaje": f"Período {mes:02d}/{anio} procesado exitosamente: {len(renglones_creados)} renglones desglosados."
        }


class ExportadorExcelService:
    @classmethod
    def generar_reporte_mensual(cls, mes: int, anio: int) -> io.BytesIO:
        wb = openpyxl.Workbook()
        ws_resumen = wb.active
        ws_resumen.title = f"Resumen {mes:02d}-{anio}"

        ws_il01 = wb.create_sheet(title=f"Cuadro IL-01 ({mes:02d}-{anio})")
        ws_il02 = wb.create_sheet(title=f"Cuadro IL-02 ({mes:02d}-{anio})")

        fnt_titulo = Font(name="Segoe UI", size=14, bold=True, color="1E1E1E")
        fnt_subtitulo = Font(name="Segoe UI", size=10, italic=True, color="4B5563")
        fnt_cabecera = Font(name="Segoe UI", size=10, bold=True, color="1E1E1E")
        fnt_datos = Font(name="Segoe UI", size=9, color="1E1E1E")
        fnt_bold = Font(name="Segoe UI", size=9, bold=True, color="1E1E1E")

        fill_header = PatternFill(start_color="F1F5F9", end_color="F1F5F9", fill_type="solid")
        fill_zebra = PatternFill(start_color="F8FAFC", end_color="F8FAFC", fill_type="solid")

        thin = Side(border_style="thin", color="CBD5E1")
        border_box = Border(left=thin, right=thin, top=thin, bottom=thin)

        columnas = [
            ("N°", 5),
            ("Oficina", 8),
            ("Legajo", 10),
            ("DNI", 12),
            ("Apellido y Nombre", 28),
            ("Revista", 10),
            ("Materia / Cátedra", 25),
            ("Carrera", 25),
            ("Hs Cat.", 8),
            ("Desde", 12),
            ("Hasta", 12),
            ("N° Formulario", 14),
            ("Art.", 14),
            ("Cód.", 8),
            ("Disposición", 16),
            ("Observaciones / Suplente", 32),
        ]

        for ws, cuadro_nombre, titulo_texto in [
            (ws_il01, "IL-01", f"CUADRO IL-01 — LICENCIAS POR ENFERMEDAD Y ATENCIÓN FAMILIAR (OFICINA 1452) — {mes:02d}/{anio}"),
            (ws_il02, "IL-02", f"CUADRO IL-02 — INASISTENCIAS, PERMISOS Y OTRAS CAUSALES (OFICINA 1452) — {mes:02d}/{anio}"),
        ]:
            ws.views.sheetView[0].showGridLines = True

            ws.merge_cells("A1:P1")
            ws["A1"] = "IESETyFP (Instituto de Educación Superior de Educación Técnica y Formación Profesional) — Resistencia, Chaco"
            ws["A1"].font = fnt_titulo
            ws["A1"].alignment = Alignment(horizontal="left", vertical="center")

            ws.merge_cells("A2:P2")
            ws["A2"] = titulo_texto
            ws["A2"].font = fnt_subtitulo
            ws["A2"].alignment = Alignment(horizontal="left", vertical="center")

            for col_idx, (col_name, col_width) in enumerate(columnas, start=1):
                cell = ws.cell(row=4, column=col_idx, value=col_name)
                cell.font = fnt_cabecera
                cell.fill = fill_header
                cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
                cell.border = border_box
                ws.column_dimensions[openpyxl.utils.get_column_letter(col_idx)].width = col_width

            renglones = RenglonMensual.objects.filter(
                mes=mes, anio=anio, cuadro=cuadro_nombre
            ).select_related("agente", "disposicion").order_by(
                "agente__apellido", "agente__nombre", "desde", "materia_nombre"
            )

            row_num = 5
            for idx, r in enumerate(renglones, start=1):
                disp_str = r.disposicion.numero_formateado if r.disposicion else "—"
                valores = [
                    idx,
                    r.oficina,
                    r.agente.legajo,
                    r.agente.dni,
                    r.agente.nombre_completo,
                    r.situacion_revista,
                    r.materia_nombre,
                    r.carrera_nombre,
                    r.horas_afectadas,
                    r.desde.strftime("%d/%m/%Y"),
                    r.hasta.strftime("%d/%m/%Y"),
                    r.formulario_numero or "—",
                    r.articulo,
                    r.codigo_licencia,
                    disp_str,
                    r.observaciones or "—",
                ]

                is_even = (idx % 2 == 0)
                for col_idx, val in enumerate(valores, start=1):
                    c = ws.cell(row=row_num, column=col_idx, value=val)
                    c.font = fnt_datos
                    c.border = border_box
                    if is_even:
                        c.fill = fill_zebra
                    if col_idx in [1, 2, 3, 6, 9, 10, 11, 12, 14, 15]:
                        c.alignment = Alignment(horizontal="center", vertical="center")
                    else:
                        c.alignment = Alignment(horizontal="left", vertical="center")
                row_num += 1

            ws.row_dimensions[4].height = 28

        ws_resumen.views.sheetView[0].showGridLines = True
        ws_resumen.merge_cells("A1:G1")
        ws_resumen["A1"] = f"RESUMEN ESTADÍSTICO DE ASISTENCIA — PERÍODO {mes:02d}/{anio}"
        ws_resumen["A1"].font = fnt_titulo

        cab_resumen = ["DNI", "Legajo", "Docente", "Presentes (PR)", "Inasistencias (I)", "Permisos (P)", "Licencias (LIC/LT)"]
        for c_idx, h in enumerate(cab_resumen, 1):
            c = ws_resumen.cell(row=3, column=c_idx, value=h)
            c.font = fnt_cabecera
            c.fill = fill_header
            c.border = border_box
            c.alignment = Alignment(horizontal="center")
            ws_resumen.column_dimensions[openpyxl.utils.get_column_letter(c_idx)].width = 20

        agentes = Agente.objects.filter(activo=True).order_by("apellido", "nombre")
        r_idx = 4
        for ag in agentes:
            novs = NovedadAsistencia.objects.filter(agente=ag, fecha__year=anio, fecha__month=mes)
            c_pr = novs.filter(estado="PR").count()
            c_i = novs.filter(estado="I").count()
            c_p = novs.filter(estado="P").count()
            c_lic = novs.filter(estado__in=["LIC", "LT"]).count()

            fila = [ag.dni, ag.legajo, ag.nombre_completo, c_pr, c_i, c_p, c_lic]
            for col_num, val in enumerate(fila, 1):
                cell = ws_resumen.cell(row=r_idx, column=col_num, value=val)
                cell.font = fnt_datos
                cell.border = border_box
                if col_num in [1, 2, 4, 5, 6, 7]:
                    cell.alignment = Alignment(horizontal="center")
            r_idx += 1

        output = io.BytesIO()
        wb.save(output)
        output.seek(0)
        return output


class ImportadorCSVService:
    @classmethod
    def importar_agentes(cls, archivo_texto, usuario=None) -> dict:
        lineas = archivo_texto.splitlines()
        if not lineas:
            return {"creados": 0, "actualizados": 0, "errores": ["El archivo CSV se encuentra vacío."]}

        primera = lineas[0]
        delimitador = ";" if ";" in primera else ","
        reader = csv.DictReader(lineas, delimiter=delimitador)

        creados = 0
        actualizados = 0
        errores = []

        for idx, row in enumerate(reader, start=2):
            dni_raw = row.get("dni") or row.get("DNI") or row.get("Documento") or ""
            dni = str(dni_raw).strip().replace(".", "").replace(" ", "")
            if not dni:
                errores.append(f"Fila {idx}: DNI vacío, fila ignorada.")
                continue

            apellido = (row.get("apellido") or row.get("Apellido") or row.get("Apellidos") or "").strip()
            nombre = (row.get("nombre") or row.get("Nombre") or row.get("Nombres") or "").strip()
            if not apellido or not nombre:
                nom_comp = (row.get("nombre_completo") or row.get("Docente") or "").strip()
                if "," in nom_comp:
                    partes = nom_comp.split(",", 1)
                    apellido = partes[0].strip()
                    nombre = partes[1].strip()
                elif nom_comp:
                    apellido = nom_comp
                    nombre = "—"

            legajo = (row.get("legajo") or row.get("Legajo") or f"LEG-{dni}").strip()
            sexo = (row.get("sexo") or row.get("Sexo") or "M").strip().upper()
            if sexo not in ["M", "F", "X"]:
                sexo = "M"

            email = (row.get("email") or row.get("Email") or row.get("Correo") or "").strip()
            telefono = (row.get("telefono") or row.get("Telefono") or "").strip()
            revista = (row.get("revista") or row.get("Revista") or "TIT").strip().upper()
            if revista not in ["TIT", "INT", "SUP"]:
                revista = "TIT"

            agente, created = Agente.objects.update_or_create(
                dni=dni,
                defaults={
                    "legajo": legajo,
                    "apellido": apellido or "DOCENTE",
                    "nombre": nombre or "S/N",
                    "sexo": sexo,
                    "email": email or None,
                    "telefono": telefono or None,
                    "situacion_revista_defecto": revista,
                    "activo": True
                }
            )
            if created:
                creados += 1
            else:
                actualizados += 1

        registrar_auditoria(
            usuario=usuario,
            accion="IMPORTACION_CSV_AGENTES",
            detalles=f"Se importaron {creados} agentes nuevos y se actualizaron {actualizados}. Errores: {len(errores)}."
        )

        return {"creados": creados, "actualizados": actualizados, "errores": errores}


class CalculadorAlertasService:
    @classmethod
    def obtener_alertas_docentes(cls, anio: int = None) -> list[dict]:
        if not anio:
            anio = date.today().year

        agentes = Agente.objects.filter(activo=True).order_by("apellido", "nombre")
        resultado = []

        for ag in agentes:
            novs = NovedadAsistencia.objects.filter(agente=ag, fecha__year=anio)
            faltas = novs.filter(estado="I").count()
            permisos = novs.filter(estado="P").count()
            licencias = novs.filter(estado__in=["LIC", "LT"]).count()

            tope_faltas = 10
            tope_permisos = 6

            porcentaje_faltas = min(100, int((faltas / tope_faltas) * 100))
            porcentaje_permisos = min(100, int((permisos / tope_permisos) * 100))
            restantes_faltas = max(0, tope_faltas - faltas)
            restantes_permisos = max(0, tope_permisos - permisos)

            if faltas >= 8 or permisos >= 5:
                nivel = "CRITICO"
                badge = "badge-danger"
                mensaje = "¡Límite reglamentario próximo a agotarse!"
            elif faltas >= 5 or permisos >= 3:
                nivel = "ADVERTENCIA"
                badge = "badge-warning"
                mensaje = "Atención: Más del 50% del cupo anual consumido."
            else:
                nivel = "NORMAL"
                badge = "badge-success"
                mensaje = "Dentro de los márgenes reglamentarios."

            resultado.append({
                "agente": ag,
                "faltas": faltas,
                "total_inasistencias": faltas,
                "tope_faltas": tope_faltas,
                "limite_anual": tope_faltas,
                "restantes": restantes_faltas,
                "restantes_faltas": restantes_faltas,
                "porcentaje_faltas": porcentaje_faltas,
                "permisos": permisos,
                "tope_permisos": tope_permisos,
                "restantes_permisos": restantes_permisos,
                "porcentaje_permisos": porcentaje_permisos,
                "licencias": licencias,
                "nivel": nivel,
                "badge": badge,
                "mensaje": mensaje,
            })

        return resultado

