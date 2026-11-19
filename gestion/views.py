from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.http import HttpResponse, JsonResponse
from django.core.paginator import Paginator
from django.db import transaction
from django.db.models import Count, Q
from datetime import date, datetime, timedelta

from .models import (
    Agente, Carrera, Materia, Designacion, TipoLicencia,
    Feriado, NovedadAsistencia, Disposicion, RenglonMensual, Auditoria
)
from .forms import (
    AgenteForm, DesignacionForm, CarreraForm, MateriaForm,
    RecepcionFormularioFisicoForm, ImportarCSVForm
)
from .services import (
    ProcesadorMensualService, ExportadorExcelService,
    ImportadorCSVService, CalculadorAlertasService, registrar_auditoria,
    DIAS_MAP
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
    designaciones = agente.designaciones.filter(activo=True).select_related("materia", "materia__carrera")
    designaciones_hist = agente.designaciones.filter(activo=False).select_related("materia", "materia__carrera")
    novedades_recientes = agente.novedades_asistencia.all()[:15]

    return render(request, "gestion/agente_detail.html", {
        "agente": agente,
        "designaciones": designaciones,
        "designaciones_hist": designaciones_hist,
        "novedades_recientes": novedades_recientes,
    })


@login_required
def designaciones_list_view(request):
    q = request.GET.get("q", "").strip()
    qs = Designacion.objects.select_related("agente", "materia", "materia__carrera").all()
    if q:
        qs = qs.filter(Q(agente__apellido__icontains=q) | Q(materia__nombre__icontains=q) | Q(dia_semana__icontains=q))

    paginator = Paginator(qs, 20)
    page_number = request.GET.get("page")
    page_obj = paginator.get_page(page_number)

    return render(request, "gestion/designaciones_list.html", {"page_obj": page_obj, "q": q})


@login_required
def designacion_create_view(request):
    agente_id = request.GET.get("agente_id")
    initial = {}
    if agente_id:
        initial["agente"] = agente_id

    if request.method == "POST":
        form = DesignacionForm(request.POST)
        if form.is_valid():
            desig = form.save()
            registrar_auditoria(
                usuario=request.user,
                accion="ALTA_DESIGNACION",
                detalles=f"Cátedra asignada a {desig.agente.nombre_completo}: {desig.materia.nombre} ({desig.dia_semana} {desig.horas_catedra} hs).",
                ip=request.META.get("REMOTE_ADDR")
            )
            messages.success(request, f"Cátedra asignada exitosamente a {desig.agente.nombre_completo}.")
            return redirect("designaciones_list")
    else:
        form = DesignacionForm(initial=initial)
    return render(request, "gestion/designacion_form.html", {"form": form, "titulo": "Nueva Designación de Cátedra"})


@login_required
def designacion_edit_view(request, pk):
    desig = get_object_or_404(Designacion, pk=pk)
    if request.method == "POST":
        form = DesignacionForm(request.POST, instance=desig)
        if form.is_valid():
            desig = form.save()
            registrar_auditoria(
                usuario=request.user,
                accion="MODIFICACION_DESIGNACION",
                detalles=f"Cátedra actualizada {desig.materia.nombre} para {desig.agente.nombre_completo}.",
                ip=request.META.get("REMOTE_ADDR")
            )
            messages.success(request, f"Designación de {desig.agente.nombre_completo} actualizada.")
            return redirect("designaciones_list")
    else:
        form = DesignacionForm(instance=desig)
    return render(request, "gestion/designacion_form.html", {"form": form, "titulo": "Modificar Designación"})


@login_required
def designacion_baja_view(request, pk):
    desig = get_object_or_404(Designacion, pk=pk)
    desig.activo = False
    desig.vigencia_hasta = date.today().strftime("%d/%m/%Y")
    desig.save()

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
