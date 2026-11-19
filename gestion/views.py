from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.http import HttpResponse, JsonResponse
from django.core.paginator import Paginator
from django.db import transaction
from django.db.models import Count, Q
from django.utils import timezone
from datetime import date, datetime, timedelta
from calendar import monthrange
import json

from .models import (
    Agente, Carrera, Materia, Designacion, HorarioDesignacion, Suplencia,
    TipoLicencia, Feriado, NovedadAsistencia, Disposicion, RenglonMensual, Auditoria
)
from .forms import (
    AgenteForm, DesignacionForm, HorarioFormSet, SuplenciaForm, AsignarSuplenciaForm, CarreraForm, MateriaForm,
    RecepcionFormularioFisicoForm, ImportarCSVForm
)
from .services import (
    ProcesadorMensualService, ExportadorExcelService,
    ImportadorCSVService, CalculadorAlertasService, registrar_auditoria,
    HorarioService, DIAS_MAP
)

@login_required
def dashboard_view(request):
    hoy = date.today()
    mes_actual = hoy.month
    anio_actual = hoy.year

    total_agentes = Agente.objects.filter(activo=True).count()
    asistencias_hoy = NovedadAsistencia.objects.filter(fecha=hoy)
    presentes_hoy = asistencias_hoy.filter(estado__in=["PR", "Presente"]).count()
    inasistencias_hoy = asistencias_hoy.filter(estado="I").count()
    licencias_hoy = asistencias_hoy.filter(estado__in=["LIC", "LT"]).count()

    novs_mes = NovedadAsistencia.objects.filter(fecha__year=anio_actual, fecha__month=mes_actual)
    total_inasistencias_mes = novs_mes.filter(estado="I").count()
    total_licencias_mes = novs_mes.filter(estado__in=["LIC", "LT"]).count()
    total_permisos_mes = novs_mes.filter(estado="P").count()

    renglones_mes = RenglonMensual.objects.filter(mes=mes_actual, anio=anio_actual)
    procesado_il01 = renglones_mes.filter(cuadro="IL-01").count()
    procesado_il02 = renglones_mes.filter(cuadro="IL-02").count()

    alertas_docentes = CalculadorAlertasService.obtener_alertas_docentes(anio_actual)
    alertas_criticas = [a for a in alertas_docentes if a["nivel"] in ["CRITICO", "ADVERTENCIA"]]

    ultimas_auditorias = Auditoria.objects.all()[:8]

    context = {
        "hoy": hoy,
        "mes_actual": mes_actual,
        "anio_actual": anio_actual,
        "total_agentes": total_agentes,
        "presentes_hoy": presentes_hoy,
        "inasistencias_hoy": inasistencias_hoy,
        "licencias_hoy": licencias_hoy,
        "total_inasistencias_mes": total_inasistencias_mes,
        "total_licencias_mes": total_licencias_mes,
        "total_permisos_mes": total_permisos_mes,
        "procesado_il01": procesado_il01,
        "procesado_il02": procesado_il02,
        "alertas_criticas": alertas_criticas[:5],
        "ultimas_auditorias": ultimas_auditorias,
    }
    return render(request, "gestion/dashboard.html", context)


@login_required
def asistencia_diaria_view(request):
    fecha_str = request.GET.get("fecha")
    if fecha_str:
        try:
            fecha_sel = datetime.strptime(fecha_str, "%Y-%m-%d").date()
        except ValueError:
            fecha_sel = date.today()
    else:
        fecha_sel = date.today()

    feriado_obj = Feriado.objects.filter(fecha=fecha_sel).first()

    if request.method == "POST":
        accion = request.POST.get("accion")
        agente_id = request.POST.get("agente_id")
        agente = get_object_or_404(Agente, pk=agente_id)

        if accion == "justificar_modal" or request.POST.get("formulario_numero"):
            form_num = request.POST.get("formulario_numero", "").strip()
            estado = request.POST.get("estado", "LIC")
            tipo_lic_id = request.POST.get("tipo_licencia_id")
            suplente_id = request.POST.get("suplente_id")
            fecha_desde_str = request.POST.get("fecha_desde")
            fecha_hasta_str = request.POST.get("fecha_hasta")
            obs = request.POST.get("observaciones", "").strip()
            adjunto = request.FILES.get("adjunto_certificado")

            try:
                fecha_d = datetime.strptime(fecha_desde_str, "%Y-%m-%d").date() if fecha_desde_str else fecha_sel
            except ValueError:
                fecha_d = fecha_sel

            try:
                fecha_h = datetime.strptime(fecha_hasta_str, "%Y-%m-%d").date() if fecha_hasta_str else fecha_d
            except ValueError:
                fecha_h = fecha_d

            if fecha_d > fecha_h:
                messages.error(request, "La fecha 'Desde' no puede ser posterior a la fecha 'Hasta'.")
                return redirect(f"{request.path}?fecha={fecha_sel.strftime('%Y-%m-%d')}")

            tipo_lic = TipoLicencia.objects.filter(pk=tipo_lic_id).first() if tipo_lic_id else None

            suplente = None
            if suplente_id:
                try:
                    suplente_id_int = int(suplente_id)
                    if suplente_id_int == agente.id:
                        messages.error(request, f"Incompatibilidad detectada: El docente titular {agente.nombre_completo} no puede seleccionarse como su propio suplente.")
                        return redirect(f"{request.path}?fecha={fecha_sel.strftime('%Y-%m-%d')}")
                    suplente = Agente.objects.filter(pk=suplente_id_int).first()
                except ValueError:
                    suplente = None

            dias_procesados = 0
            with transaction.atomic():
                cur = fecha_d
                while cur <= fecha_h:
                    nov, _ = NovedadAsistencia.objects.get_or_create(
                        agente=agente,
                        fecha=cur,
                        defaults={"estado": estado, "registrado_por": request.user}
                    )
                    nov.estado = estado
                    nov.formulario_numero = form_num
                    nov.tipo_licencia = tipo_lic
                    nov.suplente = suplente
                    if obs:
                        nov.observaciones = obs
                    if adjunto:
                        nov.adjunto_certificado = adjunto
                    nov.registrado_por = request.user
                    nov.save()
                    dias_procesados += 1
                    cur += timedelta(days=1)

                registrar_auditoria(
                    usuario=request.user,
                    accion="JUSTIFICACION_FORMULARIO_MODAL",
                    detalles=f"Formulario {form_num} cargado para {agente.nombre_completo} ({fecha_d} al {fecha_h}). Estado: {estado} | Lic: {tipo_lic.codigo if tipo_lic else 'S/C'} | Suplente: {suplente.nombre_completo if suplente else 'Ninguno'}.",
                    ip=request.META.get("REMOTE_ADDR")
                )

            messages.success(request, f"¡Formulario {form_num} registrado con éxito para {agente.nombre_completo} ({dias_procesados} día/s registrados del {fecha_d.strftime('%d/%m/%Y')} al {fecha_h.strftime('%d/%m/%Y')})!")
            return redirect(f"{request.path}?fecha={fecha_sel.strftime('%Y-%m-%d')}")

        else:
            # Cambio de estado vía combo box o actualización de días (asociada a suplencia / lic. / permiso / LT)
            nuevo_estado = request.POST.get("estado", "PR")
            dias_param = request.POST.get("dias", "1")
            try:
                dias = max(1, min(365, int(dias_param)))
            except (ValueError, TypeError):
                dias = 1

            if nuevo_estado not in ["PR", "I", "P", "LIC", "LT"]:
                nuevo_estado = "PR"

            with transaction.atomic():
                if dias > 1 and nuevo_estado in ["LIC", "LT", "P", "I"]:
                    cur = fecha_sel
                    fecha_fin = fecha_sel + timedelta(days=dias - 1)
                    while cur <= fecha_fin:
                        nov, _ = NovedadAsistencia.objects.get_or_create(
                            agente=agente,
                            fecha=cur,
                            defaults={"estado": nuevo_estado, "registrado_por": request.user}
                        )
                        nov.estado = nuevo_estado
                        nov.registrado_por = request.user
                        nov.save()
                        cur += timedelta(days=1)

                    detalles_auditoria = (
                        f"Período de {dias} días ({fecha_sel.strftime('%d/%m/%Y')} al {fecha_fin.strftime('%d/%m/%Y')}) | "
                        f"Agente: {agente.nombre_completo} | Estado: {nuevo_estado}"
                    )
                else:
                    nov, _ = NovedadAsistencia.objects.get_or_create(
                        agente=agente,
                        fecha=fecha_sel,
                        defaults={"estado": nuevo_estado, "registrado_por": request.user}
                    )
                    nov.estado = nuevo_estado
                    nov.registrado_por = request.user
                    nov.save()
                    detalles_auditoria = (
                        f"Fecha: {fecha_sel.strftime('%d/%m/%Y')} | Agente: {agente.nombre_completo} | Estado: {nuevo_estado}"
                    )

                registrar_auditoria(
                    usuario=request.user,
                    accion="CAMBIO_ESTADO_ASISTENCIA",
                    detalles=detalles_auditoria,
                    ip=request.META.get("REMOTE_ADDR")
                )

            # Respuesta JSON para peticiones asíncronas (AJAX / Fetch)
            if (
                request.headers.get("x-requested-with") == "XMLHttpRequest"
                or request.POST.get("ajax") == "1"
                or "application/json" in request.headers.get("Accept", "")
            ):
                agentes_activos = Agente.objects.filter(activo=True)
                novedades_dia = {
                    n.agente_id: n.estado 
                    for n in NovedadAsistencia.objects.filter(fecha=fecha_sel)
                }
                presentes = sum(
                    1 for ag in agentes_activos 
                    if novedades_dia.get(ag.id, "PR") in ["PR", "Presente"]
                )
                inasistencias = sum(
                    1 for ag in agentes_activos 
                    if novedades_dia.get(ag.id) == "I"
                )
                licencias = sum(
                    1 for ag in agentes_activos 
                    if novedades_dia.get(ag.id) in ["LIC", "LT"]
                )
                permisos = sum(
                    1 for ag in agentes_activos 
                    if novedades_dia.get(ag.id) == "P"
                )

                estado_dict = {
                    "PR": "Presente (PR)",
                    "I": "Inasistencia (I)",
                    "P": "Permiso (P)",
                    "LIC": "Lic. Médica (LIC)",
                    "LT": "Largo Tratamiento (LT)",
                }

                return JsonResponse({
                    "status": "ok",
                    "mensaje": f"Asistencia actualizada para {agente.nombre_completo}: {estado_dict.get(nuevo_estado, nuevo_estado)} ({dias} día/s).",
                    "agente_id": agente.id,
                    "estado": nuevo_estado,
                    "estado_display": estado_dict.get(nuevo_estado, nuevo_estado),
                    "dias": dias,
                    "resumen": {
                        "total_agentes": agentes_activos.count(),
                        "presentes": presentes,
                        "inasistencias": inasistencias,
                        "licencias": licencias,
                        "permisos": permisos,
                        "licencias_permisos": licencias + permisos,
                    }
                })

            messages.success(
                request,
                f"Asistencia actualizada para {agente.nombre_completo}: {nuevo_estado} ({dias} día/s)."
            )
            return redirect(f"{request.path}?fecha={fecha_sel.strftime('%Y-%m-%d')}")

    nombre_dia = DIAS_MAP.get(fecha_sel.weekday(), "")
    agentes = Agente.objects.filter(activo=True).prefetch_related("designaciones", "designaciones__materia").order_by("apellido", "nombre")
    novedades_dict = {n.agente_id: n for n in NovedadAsistencia.objects.filter(fecha=fecha_sel).select_related("tipo_licencia", "suplente")}

    # Días de período para agentes con formularios físicos o rangos continuos
    forms_nums = [n.formulario_numero for n in novedades_dict.values() if n.formulario_numero]
    form_counts = {}
    if forms_nums:
        qs_forms = NovedadAsistencia.objects.filter(formulario_numero__in=forms_nums).values("formulario_numero", "agente_id").annotate(total_dias=Count("id"))
        for item in qs_forms:
            form_counts[(item["agente_id"], item["formulario_numero"])] = item["total_dias"]

    agentes_sin_form = [ag.id for ag in agentes if novedades_dict.get(ag.id) and not novedades_dict.get(ag.id).formulario_numero and novedades_dict.get(ag.id).estado != 'PR']
    consecutivos_dict = {}
    if agentes_sin_form:
        novs_futuras = NovedadAsistencia.objects.filter(
            agente_id__in=agentes_sin_form,
            fecha__gte=fecha_sel,
            fecha__lte=fecha_sel + timedelta(days=60)
        ).values("agente_id", "fecha", "estado").order_by("agente_id", "fecha")

        from collections import defaultdict
        por_ag = defaultdict(dict)
        for nf in novs_futuras:
            por_ag[nf["agente_id"]][nf["fecha"]] = nf["estado"]

        for aid, fechas_map in por_ag.items():
            estado_base = novedades_dict[aid].estado
            conteo = 0
            cur = fecha_sel
            while cur in fechas_map and fechas_map[cur] == estado_base:
                conteo += 1
                cur += timedelta(days=1)
            consecutivos_dict[aid] = max(1, conteo)

    filas = []
    for ag in agentes:
        nov = novedades_dict.get(ag.id)
        estado_actual = nov.estado if nov else "PR"
        desigs_hoy = [d for d in ag.designaciones.all() if d.activo and d.dia_semana.lower() == nombre_dia.lower()]
        total_hs_hoy = sum(d.horas_catedra for d in desigs_hoy)

        dias_periodo = 1
        if nov:
            if nov.formulario_numero:
                dias_periodo = form_counts.get((ag.id, nov.formulario_numero), 1)
            elif ag.id in consecutivos_dict:
                dias_periodo = consecutivos_dict[ag.id]

        filas.append({
            "agente": ag,
            "novedad": nov,
            "estado": estado_actual,
            "dias_periodo": dias_periodo,
            "tiene_catedra_hoy": len(desigs_hoy) > 0,
            "desigs_hoy": desigs_hoy,
            "horas_hoy": total_hs_hoy,
        })

    resumen_dia = {
        "total_agentes": agentes.count(),
        "presentes": sum(1 for f in filas if f["estado"] in ["PR", "Presente"]),
        "inasistencias": sum(1 for f in filas if f["estado"] == "I"),
        "licencias": sum(1 for f in filas if f["estado"] in ["LIC", "LT"]),
        "permisos": sum(1 for f in filas if f["estado"] == "P"),
    }
    tipos_licencia = TipoLicencia.objects.filter(activo=True).order_by("hoja", "articulo")
    suplentes_disponibles = agentes

    context = {
        "fecha_sel": fecha_sel,
        "nombre_dia": nombre_dia,
        "feriado_obj": feriado_obj,
        "filas": filas,
        "resumen_dia": resumen_dia,
        "tipos_licencia": tipos_licencia,
        "suplentes_disponibles": suplentes_disponibles,
        "fecha_ayer": fecha_sel - timedelta(days=1),
        "fecha_manana": fecha_sel + timedelta(days=1),
    }
    return render(request, "gestion/asistencia_diaria.html", context)


@login_required
def recepcion_formulario_view(request, agente_id, fecha):
    agente = get_object_or_404(Agente, pk=agente_id)
    try:
        fecha_obj = datetime.strptime(fecha, "%Y-%m-%d").date()
    except ValueError:
        fecha_obj = date.today()

    nombre_dia = DIAS_MAP.get(fecha_obj.weekday(), "")
    catedras_hoy = agente.designaciones.filter(activo=True, dia_semana__iexact=nombre_dia).select_related("materia", "materia__carrera")

    nov = NovedadAsistencia.objects.filter(agente=agente, fecha=fecha_obj).first()

    if request.method == "POST":
        form = RecepcionFormularioFisicoForm(request.POST, request.FILES, titular_agente=agente)
        if form.is_valid():
            estado = form.cleaned_data["estado"]
            form_num = form.cleaned_data["formulario_numero"]
            tipo_lic = form.cleaned_data["tipo_licencia"]
            suplente = form.cleaned_data["suplente"]
            adjunto = form.cleaned_data.get("adjunto_certificado")
            obs = form.cleaned_data.get("observaciones")

            novedad, created = NovedadAsistencia.objects.get_or_create(
                agente=agente,
                fecha=fecha_obj,
                defaults={"estado": estado, "registrado_por": request.user}
            )
            novedad.estado = estado
            novedad.formulario_numero = form_num
            novedad.tipo_licencia = tipo_lic
            novedad.suplente = suplente
            if adjunto:
                novedad.adjunto_certificado = adjunto
            if obs:
                novedad.observaciones = obs
            novedad.registrado_por = request.user
            novedad.save()

            registrar_auditoria(
                usuario=request.user,
                accion="RECEPCION_FORMULARIO_FISICO",
                detalles=f"Formulario {form_num} recibido para {agente.nombre_completo} el {fecha_obj}. Estado: {estado} | Licencia: {tipo_lic.codigo} | Suplente: {suplente.nombre_completo if suplente else 'Ninguno'}",
                ip=request.META.get("REMOTE_ADDR")
            )
            messages.success(request, f"¡Formulario físico {form_num} procesado con éxito para {agente.nombre_completo}!")
            return redirect(f"/asistencia/?fecha={fecha_obj.strftime('%Y-%m-%d')}")
    else:
        initial = {
            "estado": nov.estado if (nov and nov.estado in ["LIC", "P", "LT"]) else "LIC",
            "formulario_numero": nov.formulario_numero if nov else "",
            "tipo_licencia": nov.tipo_licencia if nov else None,
            "suplente": nov.suplente if nov else None,
            "observaciones": nov.observaciones if nov else ""
        }
        form = RecepcionFormularioFisicoForm(initial=initial, titular_agente=agente)

    context = {
        "agente": agente,
        "fecha": fecha_obj,
        "catedras_hoy": catedras_hoy,
        "form": form,
    }
    return render(request, "gestion/recepcion_formulario.html", context)


@login_required
def procesamiento_mensual_view(request):
    hoy = date.today()
    mes_sel = int(request.GET.get("mes", hoy.month))
    anio_sel = int(request.GET.get("anio", hoy.year))

    if request.method == "POST":
        res = ProcesadorMensualService.procesar_mes(mes=mes_sel, anio=anio_sel, usuario_responsable=request.user)
        if res["success"]:
            messages.success(request, res["mensaje"])
        else:
            messages.error(request, res["mensaje"])
        return redirect(f"{request.path}?mes={mes_sel}&anio={anio_sel}")

    renglones_il01 = RenglonMensual.objects.filter(
        mes=mes_sel, anio=anio_sel, cuadro="IL-01"
    ).select_related("agente", "tipo_licencia", "disposicion", "suplente").order_by("agente__apellido", "agente__nombre", "desde")

    renglones_il02 = RenglonMensual.objects.filter(
        mes=mes_sel, anio=anio_sel, cuadro="IL-02"
    ).select_related("agente", "tipo_licencia", "disposicion", "suplente").order_by("agente__apellido", "agente__nombre", "desde")

    total_renglones = renglones_il01.count() + renglones_il02.count()
    total_horas_il01 = sum(r.horas_afectadas for r in renglones_il01)
    total_horas_il02 = sum(r.horas_afectadas for r in renglones_il02)

    meses_choices = [
        (1, "Enero"), (2, "Febrero"), (3, "Marzo"), (4, "Abril"),
        (5, "Mayo"), (6, "Junio"), (7, "Julio"), (8, "Agosto"),
        (9, "Septiembre"), (10, "Octubre"), (11, "Noviembre"), (12, "Diciembre")
    ]

    context = {
        "mes_sel": mes_sel,
        "anio_sel": anio_sel,
        "meses_choices": meses_choices,
        "renglones_il01": renglones_il01,
        "renglones_il02": renglones_il02,
        "total_renglones": total_renglones,
        "total_horas_il01": total_horas_il01,
        "total_horas_il02": total_horas_il02,
    }
    return render(request, "gestion/procesamiento_mensual.html", context)


@login_required
def exportar_excel_mensual_view(request):
    hoy = date.today()
    mes = int(request.GET.get("mes", hoy.month))
    anio = int(request.GET.get("anio", hoy.year))

    buffer = ExportadorExcelService.generar_reporte_mensual(mes=mes, anio=anio)
    filename = f"Planilla_Estadistica_Oficial_{anio}_{mes:02d}.xlsx"

    registrar_auditoria(
        usuario=request.user,
        accion="EXPORTACION_EXCEL_OFICIAL",
        detalles=f"Descarga de planilla mensual oficial período {mes:02d}/{anio}.",
        ip=request.META.get("REMOTE_ADDR")
    )

    response = HttpResponse(
        buffer.getvalue(),
        content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response


@login_required
def agentes_list_view(request):
    q = request.GET.get("q", "").strip()
    qs = Agente.objects.all().prefetch_related("designaciones")
    if q:
        qs = qs.filter(Q(apellido__icontains=q) | Q(nombre__icontains=q) | Q(dni__icontains=q) | Q(legajo__icontains=q))

    paginator = Paginator(qs, 15)
    page_number = request.GET.get("page")
    page_obj = paginator.get_page(page_number)

    return render(request, "gestion/agentes_list.html", {"page_obj": page_obj, "q": q})


@login_required
def agente_create_view(request):
    if request.method == "POST":
        form = AgenteForm(request.POST)
        if form.is_valid():
            agente = form.save()
            registrar_auditoria(
                usuario=request.user,
                accion="ALTA_AGENTE",
                detalles=f"Alta del agente {agente.nombre_completo} (DNI: {agente.dni}).",
                ip=request.META.get("REMOTE_ADDR")
            )
            messages.success(request, f"Docente {agente.nombre_completo} registrado con éxito.")
            return redirect("agentes_list")
    else:
        form = AgenteForm()
    return render(request, "gestion/agente_form.html", {"form": form, "titulo": "Registrar Nuevo Agente Docente"})


@login_required
def agente_edit_view(request, pk):
    agente = get_object_or_404(Agente, pk=pk)
    if request.method == "POST":
        form = AgenteForm(request.POST, instance=agente)
        if form.is_valid():
            agente = form.save()
            registrar_auditoria(
                usuario=request.user,
                accion="MODIFICACION_AGENTE",
                detalles=f"Modificación del agente {agente.nombre_completo} (DNI: {agente.dni}).",
                ip=request.META.get("REMOTE_ADDR")
            )
            messages.success(request, f"Docente {agente.nombre_completo} actualizado.")
            return redirect("agentes_list")
    else:
        form = AgenteForm(instance=agente)
    return render(request, "gestion/agente_form.html", {"form": form, "titulo": f"Modificar Agente: {agente.nombre_completo}"})


@login_required
def agente_detail_view(request, pk):
    agente = get_object_or_404(Agente, pk=pk)
    designaciones = agente.designaciones.filter(activo=True).select_related("materia", "materia__carrera").prefetch_related("horarios")
    designaciones_hist = agente.designaciones.filter(activo=False).select_related("materia", "materia__carrera").prefetch_related("horarios")

    hoy = timezone.localdate() if hasattr(timezone, "localdate") else date.today()

    # 1. Selector de período: Mes y Año (por defecto mes y año actual)
    try:
        mes_sel = int(request.GET.get("mes", hoy.month))
        if not (1 <= mes_sel <= 12):
            mes_sel = hoy.month
    except (ValueError, TypeError):
        mes_sel = hoy.month

    try:
        anio_sel = int(request.GET.get("anio", hoy.year))
        if not (2000 <= anio_sel <= 2100):
            anio_sel = hoy.year
    except (ValueError, TypeError):
        anio_sel = hoy.year

    # Rango de fechas mensual: date(anio, mes, 1) hasta último día del mes
    _, ultimo_dia = monthrange(anio_sel, mes_sel)
    fecha_inicio_mes = date(anio_sel, mes_sel, 1)
    fecha_fin_mes = date(anio_sel, mes_sel, ultimo_dia)

    # 2. Tabla de novedades del período (orden cronológico)
    # Conserva intactos todos los registros históricos y justificaciones originales (RF-14)
    novedades_mes = agente.novedades_asistencia.filter(
        fecha__gte=fecha_inicio_mes,
        fecha__lte=fecha_fin_mes
    ).select_related("tipo_licencia", "suplente").order_by("fecha")

    resumen_mes = {
        "total": novedades_mes.count(),
        "presentes": novedades_mes.filter(estado__in=["PR", "Presente"]).count(),
        "inasistencias": novedades_mes.filter(estado="I").count(),
        "licencias": novedades_mes.filter(estado__in=["LIC", "LT"]).count(),
        "permisos": novedades_mes.filter(estado="P").count(),
        "licencias_permisos": novedades_mes.filter(estado__in=["LIC", "LT", "P"]).count(),
    }

    # 3. Resumen Anual Independiente (RF-18)
    # Calculado sobre todo el año anio_sel sin ser afectado por el filtro de mes
    resumen_anual = CalculadorAlertasService.obtener_resumen_docente_anual(agente, anio_sel)

    meses_choices = [
        (1, "Enero"), (2, "Febrero"), (3, "Marzo"), (4, "Abril"),
        (5, "Mayo"), (6, "Junio"), (7, "Julio"), (8, "Agosto"),
        (9, "Septiembre"), (10, "Octubre"), (11, "Noviembre"), (12, "Diciembre")
    ]
    nombre_mes_sel = dict(meses_choices).get(mes_sel, "")

    anios_disponibles = sorted(set([hoy.year - 1, hoy.year, hoy.year + 1, anio_sel]), reverse=True)

    return render(request, "gestion/agente_detail.html", {
        "agente": agente,
        "designaciones": designaciones,
        "designaciones_hist": designaciones_hist,
        "novedades_mes": novedades_mes,
        "resumen_mes": resumen_mes,
        "resumen_anual": resumen_anual,
        "mes_sel": mes_sel,
        "anio_sel": anio_sel,
        "nombre_mes_sel": nombre_mes_sel,
        "meses_choices": meses_choices,
        "anios_disponibles": anios_disponibles,
        "hoy": hoy,
    })


@login_required
def designaciones_list_view(request):
    q = request.GET.get("q", "").strip()
    qs = Designacion.objects.select_related(
        "agente", "materia", "materia__carrera"
    ).prefetch_related(
        "horarios",
        "suplencias_como_suplente__designacion_cubierta__agente",
        "suplencias_recibidas__designacion_suplente__agente"
    ).order_by("-activo", "agente__apellido", "materia__nombre")

    if q:
        qs = qs.filter(
            Q(agente__apellido__icontains=q) |
            Q(agente__nombre__icontains=q) |
            Q(agente__dni__icontains=q) |
            Q(materia__nombre__icontains=q) |
            Q(materia__carrera__nombre__icontains=q) |
            Q(horarios__dia_semana__icontains=q) |
            Q(dia_semana__icontains=q)
        ).distinct()

    paginator = Paginator(qs, 20)
    page_number = request.GET.get("page")
    page_obj = paginator.get_page(page_number)

    return render(request, "gestion/designaciones_list.html", {"page_obj": page_obj, "q": q})


@login_required
def designacion_create_view(request):
    agente_id = request.GET.get("agente_id")
    materia_id = request.GET.get("materia_id")
    initial = {}
    if agente_id:
        initial["agente"] = agente_id
    if materia_id:
        initial["materia"] = materia_id

    if request.method == "POST":
        form = DesignacionForm(request.POST)
        desig_dummy = Designacion()
        horario_formset = HorarioFormSet(request.POST, instance=desig_dummy)
        
        agente_sel_id = request.POST.get("agente")
        materia_sel_id = request.POST.get("materia")
        suplencia_form = SuplenciaForm(
            request.POST,
            prefix="suplencia",
            materia_id=materia_sel_id,
            excluir_agente_id=agente_sel_id
        )

        es_suplente = request.POST.get("situacion_revista") == "SUP"

        if form.is_valid():
            desig = form.save(commit=False)
            horario_formset = HorarioFormSet(request.POST, instance=desig)

            horarios_validos = []
            nuevas_horas = 0
            if horario_formset.is_valid():
                for hf in horario_formset.forms:
                    if not hf.cleaned_data or hf.cleaned_data.get("DELETE", False):
                        continue
                    if hf.cleaned_data.get("activo", True):
                        horarios_validos.append(hf.cleaned_data)
                        nuevas_horas += hf.cleaned_data.get("horas_catedra", 0)

            # Fallback legacy si no cargó formset pero cargó horas_catedra en form
            if not horarios_validos and desig.horas_catedra:
                nuevas_horas = desig.horas_catedra

            # 1. Validar tope semanal de horas institucional
            valido_tope, msg_tope = HorarioService.validar_tope_semanal(
                desig.agente,
                nuevas_horas=nuevas_horas,
                excluir_designacion_id=None
            )
            if not valido_tope:
                form.add_error(None, msg_tope)

            # 2. Validar superposición de horarios externa
            if horarios_validos:
                valido_sup, msg_sup = HorarioService.validar_superposicion_franjas(
                    horarios_validos,
                    docente=desig.agente,
                    excluir_designacion_id=None
                )
                if not valido_sup:
                    form.add_error(None, msg_sup)

            # 3. Validar bloque de suplencia si es SUP
            valido_supl = True
            if es_suplente:
                if suplencia_form.is_valid():
                    valido_supl, msg_supl = HorarioService.validar_suplencia(
                        designacion_suplente=desig,
                        designacion_cubierta=suplencia_form.cleaned_data.get("designacion_cubierta"),
                        motivo=suplencia_form.cleaned_data.get("motivo"),
                        fecha_desde=suplencia_form.cleaned_data.get("fecha_desde"),
                        fecha_hasta=suplencia_form.cleaned_data.get("fecha_hasta")
                    )
                    if not valido_supl:
                        suplencia_form.add_error(None, msg_supl)
                else:
                    valido_supl = False

            if form.is_valid() and horario_formset.is_valid() and (not es_suplente or valido_supl):
                with transaction.atomic():
                    if horarios_validos:
                        primera = horarios_validos[0]
                        desig.dia_semana = primera["dia_semana"]
                        desig.hora_inicio = primera["hora_inicio"].strftime("%H:%M") if hasattr(primera["hora_inicio"], "strftime") else str(primera["hora_inicio"])
                        desig.hora_fin = primera["hora_fin"].strftime("%H:%M") if hasattr(primera["hora_fin"], "strftime") else str(primera["hora_fin"])
                        desig.horas_catedra = sum(h["horas_catedra"] for h in horarios_validos)

                    desig.save()
                    horario_formset.instance = desig
                    horario_formset.save()

                    if es_suplente and suplencia_form.is_valid():
                        supl = suplencia_form.save(commit=False)
                        supl.designacion_suplente = desig
                        supl.save()

                    registrar_auditoria(
                        usuario=request.user,
                        accion="ALTA_DESIGNACION",
                        detalles=f"Cátedra asignada a {desig.agente.nombre_completo}: {desig.materia.nombre} ({desig.resumen_horarios or 'Sin horarios'}). Revista: {desig.situacion_revista}.",
                        ip=request.META.get("REMOTE_ADDR")
                    )

                messages.success(request, f"Designación creada con éxito para {desig.agente.nombre_completo}.")
                return redirect("designaciones_list")
    else:
        form = DesignacionForm(initial=initial)
        horario_formset = HorarioFormSet(instance=Designacion())
        suplencia_form = SuplenciaForm(prefix="suplencia")

    return render(request, "gestion/designacion_form.html", {
        "form": form,
        "horario_formset": horario_formset,
        "suplencia_form": suplencia_form,
        "titulo": "Nueva Designación de Cátedra"
    })


@login_required
def suplencia_create_view(request):
    agente_preseleccionado_id = request.GET.get("agente_id")
    designacion_preseleccionada_id = request.GET.get("designacion_id")

    if request.method == "POST":
        form = AsignarSuplenciaForm(request.POST)
        if form.is_valid():
            docente_suplente = form.cleaned_data["docente_suplente"]
            designacion_cubierta = form.cleaned_data["designacion_cubierta"]
            motivo = form.cleaned_data["motivo"]
            fecha_desde = form.cleaned_data["fecha_desde"]
            fecha_hasta = form.cleaned_data["fecha_hasta"]
            sin_termino = form.cleaned_data["sin_termino"]
            instrumento_legal = form.cleaned_data["instrumento_legal"]
            observaciones = form.cleaned_data["observaciones"]

            str_desde = fecha_desde.strftime("%d/%m/%Y") if fecha_desde else ""
            str_hasta = "SIN TERMINO" if (sin_termino or not fecha_hasta) else fecha_hasta.strftime("%d/%m/%Y")

            with transaction.atomic():
                # 1. Crear la Designación del suplente en situación de revista 'SUP'
                nueva_desig = Designacion.objects.create(
                    agente=docente_suplente,
                    materia=designacion_cubierta.materia,
                    situacion_revista="SUP",
                    cargo_codigo=designacion_cubierta.cargo_codigo or "Cátedra",
                    dia_semana=designacion_cubierta.dia_semana,
                    hora_inicio=designacion_cubierta.hora_inicio,
                    hora_fin=designacion_cubierta.hora_fin,
                    horas_catedra=designacion_cubierta.horas_catedra,
                    vigencia_desde=str_desde,
                    vigencia_hasta=str_hasta,
                    activo=True,
                )

                # 2. Replicar franjas horarias 1:N de la cátedra cubierta
                horarios_cubiertos = designacion_cubierta.horarios.filter(activo=True)
                if horarios_cubiertos.exists():
                    for h in horarios_cubiertos:
                        HorarioDesignacion.objects.create(
                            designacion=nueva_desig,
                            dia_semana=h.dia_semana,
                            hora_inicio=h.hora_inicio,
                            hora_fin=h.hora_fin,
                            horas_catedra=h.horas_catedra,
                            activo=True,
                        )
                elif designacion_cubierta.dia_semana and designacion_cubierta.horas_catedra:
                    HorarioDesignacion.objects.create(
                        designacion=nueva_desig,
                        dia_semana=designacion_cubierta.dia_semana,
                        hora_inicio=designacion_cubierta.hora_inicio or "18:30",
                        hora_fin=designacion_cubierta.hora_fin or "21:00",
                        horas_catedra=designacion_cubierta.horas_catedra,
                        activo=True,
                    )

                # 3. Crear registro de Suplencia / Cobertura
                suplencia = Suplencia.objects.create(
                    designacion_suplente=nueva_desig,
                    designacion_cubierta=designacion_cubierta,
                    motivo=motivo,
                    fecha_desde=fecha_desde,
                    fecha_hasta=None if sin_termino else fecha_hasta,
                    instrumento_legal=instrumento_legal,
                    observaciones=observaciones,
                    activo=True,
                )

                # 4. Registrar en Auditoría inmutable (RF-20)
                registrar_auditoria(
                    usuario=request.user,
                    accion="ASIGNAR_SUPLENCIA",
                    detalles=(
                        f"Suplencia creada: {docente_suplente.nombre_completo} (DNI: {docente_suplente.dni}) "
                        f"suple a {designacion_cubierta.agente.nombre_completo} en '{designacion_cubierta.materia.nombre}' "
                        f"({designacion_cubierta.materia.carrera.codigo}) con {nueva_desig.total_horas_semanales} hs semanales. "
                        f"Vigencia: {str_desde} al {str_hasta}. Instrumento: {instrumento_legal or 'S/I'}."
                    ),
                    ip=request.META.get("REMOTE_ADDR")
                )

            messages.success(
                request,
                f"¡Suplencia asignada exitosamente! {docente_suplente.nombre_completo} quedó designado como Suplente (SUP) "
                f"en '{designacion_cubierta.materia.nombre}' cubriendo a {designacion_cubierta.agente.nombre_completo}."
            )
            return redirect("designaciones_list")
    else:
        initial_data = {}
        if agente_preseleccionado_id:
            initial_data["docente_suplente"] = agente_preseleccionado_id
        if designacion_preseleccionada_id:
            initial_data["designacion_cubierta"] = designacion_preseleccionada_id

        form = AsignarSuplenciaForm(initial=initial_data)

    # Preparar metadata serializada en JSON para preview reactivo en el frontend
    designaciones_activas = Designacion.objects.filter(
        activo=True,
        situacion_revista__in=["TIT", "INT"]
    ).select_related("agente", "materia", "materia__carrera").prefetch_related("horarios")

    metadata_desigs = {}
    for d in designaciones_activas:
        horarios_list = []
        for h in d.horarios.filter(activo=True):
            hi = h.hora_inicio.strftime('%H:%M') if hasattr(h.hora_inicio, 'strftime') else str(h.hora_inicio)
            hf = h.hora_fin.strftime('%H:%M') if hasattr(h.hora_fin, 'strftime') else str(h.hora_fin)
            horarios_list.append(f"{h.dia_semana} {hi} a {hf} ({h.horas_catedra} hs)")
        
        metadata_desigs[str(d.id)] = {
            "id": d.id,
            "titular_id": d.agente.id,
            "titular_nombre": d.agente.nombre_completo,
            "titular_dni": d.agente.dni,
            "titular_revista": d.situacion_revista,
            "materia_nombre": d.materia.nombre,
            "materia_codigo": d.materia.codigo,
            "carrera_nombre": d.materia.carrera.nombre,
            "carrera_codigo": d.materia.carrera.codigo,
            "total_horas": d.total_horas_semanales,
            "resumen_horarios": d.resumen_horarios,
            "horarios_detalle": horarios_list,
        }

    agentes_activos = Agente.objects.filter(activo=True)
    metadata_agentes = {}
    for ag in agentes_activos:
        metadata_agentes[str(ag.id)] = {
            "id": ag.id,
            "nombre": ag.nombre_completo,
            "dni": ag.dni,
            "horas_actuales": ag.horas_activas_semanales,
            "max_horas": ag.max_horas_semanales,
            "horas_disponibles": max(0, ag.max_horas_semanales - ag.horas_activas_semanales),
        }

    return render(request, "gestion/suplencia_form.html", {
        "form": form,
        "metadata_desigs_json": json.dumps(metadata_desigs),
        "metadata_agentes_json": json.dumps(metadata_agentes),
    })


@login_required
def designacion_edit_view(request, pk):
    desig = get_object_or_404(Designacion, pk=pk)
    suplencia_actual = desig.suplencia_activa

    if request.method == "POST":
        form = DesignacionForm(request.POST, instance=desig)
        horario_formset = HorarioFormSet(request.POST, instance=desig)
        suplencia_form = SuplenciaForm(
            request.POST,
            prefix="suplencia",
            instance=suplencia_actual,
            materia_id=desig.materia_id,
            excluir_agente_id=desig.agente_id
        )
        es_suplente = request.POST.get("situacion_revista") == "SUP"

        if form.is_valid():
            desig_temp = form.save(commit=False)

            horarios_validos = []
            nuevas_horas = 0
            if horario_formset.is_valid():
                for hf in horario_formset.forms:
                    if not hf.cleaned_data or hf.cleaned_data.get("DELETE", False):
                        continue
                    if hf.cleaned_data.get("activo", True):
                        horarios_validos.append(hf.cleaned_data)
                        nuevas_horas += hf.cleaned_data.get("horas_catedra", 0)

            if not horarios_validos and desig_temp.horas_catedra:
                nuevas_horas = desig_temp.horas_catedra

            valido_tope, msg_tope = HorarioService.validar_tope_semanal(
                desig_temp.agente,
                nuevas_horas=nuevas_horas,
                excluir_designacion_id=desig.pk
            )
            if not valido_tope:
                form.add_error(None, msg_tope)

            if horarios_validos:
                valido_sup, msg_sup = HorarioService.validar_superposicion_franjas(
                    horarios_validos,
                    docente=desig_temp.agente,
                    excluir_designacion_id=desig.pk
                )
                if not valido_sup:
                    form.add_error(None, msg_sup)

            valido_supl = True
            if es_suplente:
                if suplencia_form.is_valid():
                    valido_supl, msg_supl = HorarioService.validar_suplencia(
                        designacion_suplente=desig_temp,
                        designacion_cubierta=suplencia_form.cleaned_data.get("designacion_cubierta"),
                        motivo=suplencia_form.cleaned_data.get("motivo"),
                        fecha_desde=suplencia_form.cleaned_data.get("fecha_desde"),
                        fecha_hasta=suplencia_form.cleaned_data.get("fecha_hasta")
                    )
                    if not valido_supl:
                        suplencia_form.add_error(None, msg_supl)
                else:
                    valido_supl = False

            if form.is_valid() and horario_formset.is_valid() and (not es_suplente or valido_supl):
                with transaction.atomic():
                    if horarios_validos:
                        primera = horarios_validos[0]
                        desig_temp.dia_semana = primera["dia_semana"]
                        desig_temp.hora_inicio = primera["hora_inicio"].strftime("%H:%M") if hasattr(primera["hora_inicio"], "strftime") else str(primera["hora_inicio"])
                        desig_temp.hora_fin = primera["hora_fin"].strftime("%H:%M") if hasattr(primera["hora_fin"], "strftime") else str(primera["hora_fin"])
                        desig_temp.horas_catedra = sum(h["horas_catedra"] for h in horarios_validos)

                    desig_temp.save()
                    horario_formset.save()

                    if es_suplente and suplencia_form.is_valid():
                        supl = suplencia_form.save(commit=False)
                        supl.designacion_suplente = desig_temp
                        supl.save()
                    elif not es_suplente:
                        HorarioService.desactivar_suplencias_si_no_es_suplente(desig_temp)

                    registrar_auditoria(
                        usuario=request.user,
                        accion="MODIFICACION_DESIGNACION",
                        detalles=f"Designación ID {desig.id} actualizada para {desig.agente.nombre_completo} ({desig.materia.nombre}).",
                        ip=request.META.get("REMOTE_ADDR")
                    )

                messages.success(request, f"Designación de {desig.agente.nombre_completo} actualizada con éxito.")
                return redirect("designaciones_list")
    else:
        form = DesignacionForm(instance=desig)
        horario_formset = HorarioFormSet(instance=desig)
        suplencia_form = SuplenciaForm(
            instance=suplencia_actual,
            prefix="suplencia",
            materia_id=desig.materia_id,
            excluir_agente_id=desig.agente_id
        )

    return render(request, "gestion/designacion_form.html", {
        "form": form,
        "horario_formset": horario_formset,
        "suplencia_form": suplencia_form,
        "desig": desig,
        "titulo": f"Modificar Designación - {desig.materia.nombre}"
    })


@login_required
def designacion_detail_view(request, pk):
    desig = get_object_or_404(
        Designacion.objects.select_related("agente", "materia", "materia__carrera"),
        pk=pk
    )
    horarios = desig.horarios.all().order_by("dia_semana", "hora_inicio")
    suplencias_activas = desig.suplencias_como_suplente.filter(activo=True).select_related("designacion_cubierta__agente")
    historial_suplencias = desig.suplencias_como_suplente.all().select_related("designacion_cubierta__agente").order_by("-fecha_desde")
    coberturas_recibidas = desig.suplencias_recibidas.all().select_related("designacion_suplente__agente").order_by("-fecha_desde")

    auditorias = Auditoria.objects.filter(
        detalles__icontains=str(desig.agente.nombre_completo)
    ).order_by("-timestamp")[:10]

    return render(request, "gestion/designacion_detail.html", {
        "desig": desig,
        "horarios": horarios,
        "suplencias_activas": suplencias_activas,
        "historial_suplencias": historial_suplencias,
        "coberturas_recibidas": coberturas_recibidas,
        "auditorias": auditorias,
    })


@login_required
def designacion_baja_view(request, pk):
    desig = get_object_or_404(Designacion, pk=pk)
    desig.activo = False
    desig.vigencia_hasta = date.today().strftime("%d/%m/%Y")
    desig.save()

    # Desactivar también sus horarios y suplencias como histórico
    desig.horarios.update(activo=False)
    desig.suplencias_como_suplente.filter(activo=True).update(activo=False)

    registrar_auditoria(
        usuario=request.user,
        accion="BAJA_LOGICA_DESIGNACION",
        detalles=f"Baja lógica de designación ID {desig.id} ({desig.materia.nombre}) para {desig.agente.nombre_completo}.",
        ip=request.META.get("REMOTE_ADDR")
    )
    messages.warning(request, f"Se ha registrado la baja lógica (pase a histórico) de la cátedra de {desig.agente.nombre_completo}.")
    return redirect("designaciones_list")


@login_required
def carreras_list_view(request):
    carreras = Carrera.objects.all().prefetch_related("materias")
    return render(request, "gestion/carreras_list.html", {"carreras": carreras})


@login_required
def carrera_create_view(request):
    if request.method == "POST":
        form = CarreraForm(request.POST)
        if form.is_valid():
            c = form.save()
            messages.success(request, f"Carrera {c.nombre} creada.")
            return redirect("carreras_list")
    else:
        form = CarreraForm()
    return render(request, "gestion/carrera_form.html", {"form": form})


@login_required
def materias_list_view(request):
    materias = Materia.objects.select_related("carrera").all()
    return render(request, "gestion/materias_list.html", {"materias": materias})


@login_required
def materia_create_view(request):
    if request.method == "POST":
        form = MateriaForm(request.POST)
        if form.is_valid():
            m = form.save()
            messages.success(request, f"Materia {m.nombre} agregada.")
            return redirect("materias_list")
    else:
        form = MateriaForm()
    return render(request, "gestion/materia_form.html", {"form": form})


@login_required
def licencias_list_view(request):
    licencias = TipoLicencia.objects.all().order_by("hoja", "articulo")
    return render(request, "gestion/licencias_list.html", {"licencias": licencias})


@login_required
def importar_csv_view(request):
    if request.method == "POST":
        form = ImportarCSVForm(request.POST, request.FILES)
        if form.is_valid():
            archivo = form.cleaned_data["archivo_csv"]
            try:
                contenido = archivo.read().decode("utf-8")
            except UnicodeDecodeError:
                contenido = archivo.read().decode("latin-1")

            res = ImportadorCSVService.importar_agentes(contenido, usuario=request.user)
            messages.success(
                request,
                f"Importación completada: {res['creados']} docentes creados, {res['actualizados']} actualizados."
            )
            return render(request, "gestion/importar_csv.html", {"form": form, "resultado": res})
    else:
        form = ImportarCSVForm()
    return render(request, "gestion/importar_csv.html", {"form": form})


@login_required
def consultas_view(request):
    anio_actual = date.today().year
    mes = request.GET.get("mes")
    agente_id = request.GET.get("agente_id")
    estado = request.GET.get("estado")
    materia_id = request.GET.get("materia_id")

    qs = NovedadAsistencia.objects.select_related("agente", "tipo_licencia", "suplente").all()

    if mes:
        qs = qs.filter(fecha__month=int(mes))
    if agente_id:
        qs = qs.filter(agente_id=agente_id)
    if estado:
        qs = qs.filter(estado=estado)
    if materia_id:
        qs = qs.filter(agente__designaciones__materia_id=materia_id).distinct()

    paginator = Paginator(qs, 25)
    page_number = request.GET.get("page")
    page_obj = paginator.get_page(page_number)

    alertas = CalculadorAlertasService.obtener_alertas_docentes(anio_actual)

    agentes_select = Agente.objects.filter(activo=True).order_by("apellido", "nombre")
    materias_select = Materia.objects.filter(activo=True).order_by("nombre")

    meses_choices = [
        ("1", "Enero"), ("2", "Febrero"), ("3", "Marzo"), ("4", "Abril"),
        ("5", "Mayo"), ("6", "Junio"), ("7", "Julio"), ("8", "Agosto"),
        ("9", "Septiembre"), ("10", "Octubre"), ("11", "Noviembre"), ("12", "Diciembre")
    ]

    context = {
        "page_obj": page_obj,
        "alertas": alertas,
        "agentes_select": agentes_select,
        "materias_select": materias_select,
        "meses_choices": meses_choices,
        "filtro_mes": mes,
        "filtro_agente": agente_id,
        "filtro_estado": estado,
        "filtro_materia": materia_id,
    }
    return render(request, "gestion/consultas.html", context)


@login_required
def auditoria_view(request):
    qs = Auditoria.objects.all().order_by("-timestamp")
    q = request.GET.get("q", "").strip()
    if q:
        qs = qs.filter(Q(usuario_nombre__icontains=q) | Q(accion__icontains=q) | Q(detalles__icontains=q))

    paginator = Paginator(qs, 30)
    page_number = request.GET.get("page")
    page_obj = paginator.get_page(page_number)

    return render(request, "gestion/auditoria.html", {"page_obj": page_obj, "q": q})
