from django.test import TestCase
from django.core.exceptions import ValidationError
from django.contrib.auth.models import User
from datetime import date, time
from io import BytesIO
import openpyxl

from .models import (
    Agente, Carrera, Materia, Designacion, HorarioDesignacion, Suplencia, TipoLicencia,
    Feriado, NovedadAsistencia, Disposicion, RenglonMensual, Auditoria
)
from .forms import RecepcionFormularioFisicoForm, DesignacionForm
from .services import (
    ProcesadorMensualService, ExportadorExcelService,
    CalculadorAlertasService, ImportadorCSVService, HorarioService
)

class ReglasNegocioSIGETTests(TestCase):
    def setUp(self):
        # Crear usuario de prueba
        self.user = User.objects.create_user(username="testadmin", password="password123")

        # Crear Carrera y Materias
        self.carrera = Carrera.objects.create(codigo="TEC-DS", nombre="Tecnicatura Superior en Desarrollo de Software")
        self.materia1 = Materia.objects.create(carrera=self.carrera, nombre="Programación III", anio_cursada=3, horas_semanales=4)
        self.materia2 = Materia.objects.create(carrera=self.carrera, nombre="Bases de Datos II", anio_cursada=2, horas_semanales=5)

        # Crear Tipos de Licencia oficiales (Hojas 1 y 2)
        self.lic_injustificada = TipoLicencia.objects.create(
            hoja=1,
            hoja_nombre="Inasistencias",
            codigo="I",
            articulo="Inasistencia Injustificada",
            nombre="Falta injustificada sin aviso",
            cuadro_destino="IL-01",
            es_medica=False,
            tope_anual_dias=10,
            activo=True
        )
        self.lic_medica = TipoLicencia.objects.create(
            hoja=1,
            hoja_nombre="Licencias Médicas",
            codigo="114A",
            articulo="Art. 44 Inc. a",
            nombre="Enfermedad de Corto Tratamiento",
            cuadro_destino="IL-02",
            es_medica=True,
            tope_anual_dias=30,
            activo=True
        )

    def test_rn01_dni_texto_preserva_ceros(self):
        """RN-01: El DNI debe almacenarse como TEXT y preservar ceros a la izquierda estrictamente."""
        agente = Agente.objects.create(
            dni="04812345",
            legajo="LEG-048",
            apellido="Gómez",
            nombre="Laura",
            situacion_revista_defecto="TIT"
        )
        agente.refresh_from_db()
        self.assertEqual(agente.dni, "04812345")
        self.assertTrue(agente.dni.startswith("0"))
        self.assertIsInstance(agente.dni, str)

    def test_tope_30_horas_semanales_validacion(self):
        """Valida que no se pueda asignar una designación que supere el tope institucional de 30 hs semanales."""
        agente = Agente.objects.create(dni="25111222", legajo="LEG-251", apellido="Pérez", nombre="Juan")
        
        # Asignar 20 horas en materia 1
        Designacion.objects.create(
            agente=agente,
            materia=self.materia1,
            dia_semana="Lunes",
            horas_catedra=20,
            activo=True
        )

        # Intentar asignar 15 horas más (20 + 15 = 35 > 30) mediante formulario
        form = DesignacionForm(data={
            "agente": agente.id,
            "materia": self.materia2.id,
            "cargo_codigo": "Cátedra",
            "situacion_revista": "TIT",
            "dia_semana": "Miércoles",
            "hora_inicio": "18:30",
            "hora_fin": "21:30",
            "horas_catedra": 15,
            "vigencia_desde": "SIN INICIO",
            "vigencia_hasta": "SIN TERMINO",
            "activo": True
        })
        self.assertFalse(form.is_valid())
        errors_str = str(form.errors)
        self.assertTrue("tope" in errors_str.lower() or "30" in errors_str)

    def test_rn06_asistencia_diaria_unicidad(self):
        """RN-06: Un agente no puede tener más de una novedad de asistencia para el mismo día."""
        agente = Agente.objects.create(dni="30111222", legajo="LEG-301", apellido="López", nombre="Ana")
        fecha_test = date(2026, 10, 14)

        NovedadAsistencia.objects.create(
            agente=agente,
            fecha=fecha_test,
            estado="PR",
            registrado_por=self.user
        )

        # Intentar duplicar la asistencia en la misma fecha debe fallar por unicidad
        with self.assertRaises(Exception):
            NovedadAsistencia.objects.create(
                agente=agente,
                fecha=fecha_test,
                estado="I",
                registrado_por=self.user
            )

    def test_validacion_anti_auto_suplencia(self):
        """Verifica que el titular no pueda ser seleccionado como su propio suplente."""
        titular = Agente.objects.create(dni="28444555", legajo="LEG-284", apellido="Benítez", nombre="Carlos")

        form = RecepcionFormularioFisicoForm(
            data={
                "estado": "LIC",
                "formulario_numero": "999",
                "tipo_licencia": self.lic_medica.id,
                "suplente": titular.id,  # Incompatible: mismo titular
            },
            titular_agente=titular
        )
        self.assertFalse(form.is_valid())
        self.assertIn("suplente", form.errors)

    def test_procesamiento_mensual_desagregacion_y_cuadros(self):
        """
        RN-04, RN-05, RN-07, RN-10, RN-11:
        Prueba el servicio de procesamiento mensual:
        - Desagregación por cátedra y día de la semana.
        - Rango continuo Desde / Hasta.
        - Asignación de Oficina 1452.
        - Separación estricta entre IL-01 e IL-02.
        - Asignación de Disposición oficial única numerada alfabéticamente.
        """
        # Crear docente titular con cátedra los miércoles (ej: 21 de Octubre de 2026 fue miércoles)
        titular = Agente.objects.create(dni="27888999", legajo="LEG-278", apellido="Álvarez", nombre="Martín", situacion_revista_defecto="TIT")
        suplente = Agente.objects.create(dni="33444555", legajo="LEG-334", apellido="Zalazar", nombre="Beatriz", situacion_revista_defecto="INT")

        # Cátedra de Martín los miércoles: Programación III con 4 horas
        Designacion.objects.create(
            agente=titular,
            materia=self.materia1,
            dia_semana="Miércoles",
            horas_catedra=4,
            activo=True
        )

        # Cátedra de Martín los jueves: Bases de Datos II con 5 horas
        Designacion.objects.create(
            agente=titular,
            materia=self.materia2,
            dia_semana="Jueves",
            horas_catedra=5,
            activo=True
        )

        # Registrar inasistencia justificada (Licencia Médica) del miércoles 21 al jueves 22 de Octubre de 2026
        dia_miercoles = date(2026, 10, 21)
        dia_jueves = date(2026, 10, 22)

        NovedadAsistencia.objects.create(
            agente=titular,
            fecha=dia_miercoles,
            estado="LIC",
            formulario_numero="F-101",
            tipo_licencia=self.lic_medica,
            suplente=suplente,
            registrado_por=self.user
        )
        NovedadAsistencia.objects.create(
            agente=titular,
            fecha=dia_jueves,
            estado="LIC",
            formulario_numero="F-101",
            tipo_licencia=self.lic_medica,
            suplente=suplente,
            registrado_por=self.user
        )

        # Ejecutar procesamiento mensual para Octubre 2026
        res = ProcesadorMensualService.procesar_mes(mes=10, anio=2026, usuario_responsable=self.user)
        self.assertTrue(res["success"])

        # Verificar renglones generados
        renglones_il02 = RenglonMensual.objects.filter(mes=10, anio=2026, cuadro="IL-02")
        self.assertEqual(renglones_il02.count(), 2)  # 1 fila para Miércoles (Prog III), 1 fila para Jueves (BD II)

        r_prog = renglones_il02.filter(materia_nombre=self.materia1.nombre).first()
        self.assertIsNotNone(r_prog)
        self.assertEqual(r_prog.horas_afectadas, 4)
        self.assertEqual(r_prog.desde, dia_miercoles)
        self.assertEqual(r_prog.hasta, dia_jueves)
        self.assertEqual(r_prog.oficina, 1452)
        self.assertEqual(r_prog.suplente, suplente)

        r_bd = renglones_il02.filter(materia_nombre=self.materia2.nombre).first()
        self.assertIsNotNone(r_bd)
        self.assertEqual(r_bd.horas_afectadas, 5)
        self.assertEqual(r_bd.desde, dia_miercoles)
        self.assertEqual(r_bd.hasta, dia_jueves)

        # Ambos renglones comparten la misma Disposición Oficial única para el docente y período
        self.assertIsNotNone(r_prog.disposicion)
        self.assertEqual(r_prog.disposicion, r_bd.disposicion)
        self.assertEqual(r_prog.disposicion.numero, 1)

    def test_exportador_excel_generacion(self):
        """Verifica que el servicio de exportación a Excel genere un archivo openpyxl válido con las pestañas requeridas."""
        buffer = ExportadorExcelService.generar_reporte_mensual(mes=10, anio=2026)
        self.assertIsInstance(buffer, BytesIO)
        self.assertGreater(buffer.getbuffer().nbytes, 1000)

        # Validar hojas del workbook
        wb = openpyxl.load_workbook(buffer)
        sheet_names = wb.sheetnames
        self.assertTrue(any("Resumen" in s for s in sheet_names))
        self.assertTrue(any("Cuadro IL-01" in s for s in sheet_names))
        self.assertTrue(any("Cuadro IL-02" in s for s in sheet_names))

    def test_calculador_alertas(self):
        """Verifica el cálculo de alertas preventivas de inasistencias acumuladas."""
        docente = Agente.objects.create(dni="11222333", legajo="LEG-112", apellido="Ramírez", nombre="Estela")
        
        # Registrar 9 inasistencias (debería disparar Advertencia o Crítico)
        for d in range(1, 10):
            NovedadAsistencia.objects.create(
                agente=docente,
                fecha=date(2026, 5, d),
                estado="I",
                registrado_por=self.user
            )

        alertas = CalculadorAlertasService.obtener_alertas_docentes(2026)
        alerta_doc = next((a for a in alertas if a["agente"].id == docente.id), None)
        self.assertIsNotNone(alerta_doc)
        self.assertEqual(alerta_doc["faltas"], 9)
        self.assertEqual(alerta_doc["restantes"], 1)
        self.assertIn(alerta_doc["nivel"], ["ADVERTENCIA", "CRITICO"])

    def test_cambio_estado_combo_box_y_dias(self):
        """Verifica la actualización de estado vía combo box y la propagación de días de suplencia/licencia."""
        self.client.login(username="testadmin", password="password123")
        docente = Agente.objects.create(dni="18555666", legajo="LEG-185", apellido="Medina", nombre="Hugo")

        # 1. Enviar cambio de estado a Inasistencia (I) sin especificar 'dias' (default 1 jornada) vía AJAX
        resp_directo = self.client.post(
            "/asistencia/?fecha=2026-11-09",
            data={
                "agente_id": docente.id,
                "estado": "I",
                "ajax": "1"
            },
            HTTP_X_REQUESTED_WITH="XMLHttpRequest"
        )
        self.assertEqual(resp_directo.status_code, 200)
        json_directo = resp_directo.json()
        self.assertEqual(json_directo["status"], "ok")
        self.assertEqual(json_directo["estado"], "I")
        self.assertEqual(json_directo["dias"], 1)

        # 2. Enviar cambio de estado a Licencia Médica (LIC) por 3 días vía AJAX
        response = self.client.post(
            "/asistencia/?fecha=2026-11-10",
            data={
                "agente_id": docente.id,
                "estado": "LIC",
                "dias": 3,
                "ajax": "1"
            },
            HTTP_X_REQUESTED_WITH="XMLHttpRequest"
        )
        self.assertEqual(response.status_code, 200)
        json_data = response.json()
        self.assertEqual(json_data["status"], "ok")
        self.assertEqual(json_data["estado"], "LIC")
        self.assertEqual(json_data["dias"], 3)
        self.assertIn("resumen", json_data)

        # 3. Verificar que se crearon los 3 días continuos en NovedadAsistencia
        novs = NovedadAsistencia.objects.filter(agente=docente, fecha__gte=date(2026, 11, 10)).order_by("fecha")
        self.assertEqual(novs.count(), 3)
        self.assertEqual(novs[0].fecha, date(2026, 11, 10))
        self.assertEqual(novs[1].fecha, date(2026, 11, 11))
        self.assertEqual(novs[2].fecha, date(2026, 11, 12))
        for n in novs:
            self.assertEqual(n.estado, "LIC")

        # 4. Verificar registros en Auditoría (el modelo ordena por -timestamp: first() es el más reciente)
        auditoria_lic = Auditoria.objects.filter(accion="CAMBIO_ESTADO_ASISTENCIA").first()
        self.assertIsNotNone(auditoria_lic)
        self.assertIn("Hugo", auditoria_lic.detalles)
        self.assertIn("LIC", auditoria_lic.detalles)

        auditoria_i = Auditoria.objects.filter(accion="CAMBIO_ESTADO_ASISTENCIA").last()
        self.assertIsNotNone(auditoria_i)
        self.assertIn("Hugo", auditoria_i.detalles)
        self.assertIn("Estado: I", auditoria_i.detalles)

        # 5. Verificar que la pantalla GET renderiza la columna 'Formulario / Cobertura' y no tiene inputs editables de días
        resp_get = self.client.get("/asistencia/?fecha=2026-11-10")
        self.assertEqual(resp_get.status_code, 200)
        contenido = resp_get.content.decode("utf-8")
        self.assertIn("Formulario / Cobertura", contenido)
        self.assertNotIn("input_dias_", contenido)
        self.assertNotIn("modificarDias", contenido)

    def test_horario_designacion_franjas_multiples_y_calculo_fecha(self):
        """Verifica que una designación pueda tener múltiples franjas horarias y su cálculo por fecha exacta."""
        docente = Agente.objects.create(dni="35123456", legajo="LEG-351", apellido="Navarro", nombre="Sofía")
        
        # Designación con 2 franjas (Martes 2hs y Jueves 4hs = 6hs semanales)
        desig = Designacion.objects.create(
            agente=docente,
            materia=self.materia1,
            situacion_revista="TIT",
            activo=True
        )
        HorarioDesignacion.objects.create(
            designacion=desig,
            dia_semana="Martes",
            hora_inicio=time(18, 30),
            hora_fin=time(20, 0),
            horas_catedra=2,
            activo=True
        )
        HorarioDesignacion.objects.create(
            designacion=desig,
            dia_semana="Jueves",
            hora_inicio=time(18, 30),
            hora_fin=time(21, 30),
            horas_catedra=4,
            activo=True
        )

        # Total horas semanales
        self.assertEqual(desig.total_horas_semanales, 6)

        # 17/11/2026 fue Martes -> debe devolver 2 hs
        fecha_martes = date(2026, 11, 17)
        franjas_martes = HorarioService.obtener_franjas_docente_en_fecha(docente, fecha_martes)
        self.assertEqual(len(franjas_martes), 1)
        self.assertEqual(franjas_martes[0]["horas_catedra"], 2)
        self.assertEqual(HorarioService.calcular_horas_docente_en_fecha(docente, fecha_martes), 2)

        # 19/11/2026 es Jueves -> debe devolver 4 hs
        fecha_jueves = date(2026, 11, 19)
        franjas_jueves = HorarioService.obtener_franjas_docente_en_fecha(docente, fecha_jueves)
        self.assertEqual(len(franjas_jueves), 1)
        self.assertEqual(franjas_jueves[0]["horas_catedra"], 4)

        # 18/11/2026 fue Miércoles (sin cátedra) -> debe devolver 0 hs
        fecha_miercoles = date(2026, 11, 18)
        self.assertEqual(HorarioService.calcular_horas_docente_en_fecha(docente, fecha_miercoles), 0)

    def test_superposicion_horaria_validacion(self):
        """Verifica la detección de franjas horarias superpuestas y la admisión de clases consecutivas."""
        # 1. Superposición interna (mismo día con solape 18:30-20:30 y 19:30-21:30)
        franjas_solapadas = [
            {"dia_semana": "Lunes", "hora_inicio": time(18, 30), "hora_fin": time(20, 30), "horas_catedra": 2},
            {"dia_semana": "Lunes", "hora_inicio": time(19, 30), "hora_fin": time(21, 30), "horas_catedra": 2},
        ]
        valido_int, msg_int = HorarioService.validar_superposicion_franjas(franjas_solapadas)
        self.assertFalse(valido_int)
        self.assertIn("Superposición", msg_int)

        # 2. Clases consecutivas válidas (18:30 a 20:00 y 20:00 a 21:30)
        franjas_consecutivas = [
            {"dia_semana": "Lunes", "hora_inicio": time(18, 30), "hora_fin": time(20, 0), "horas_catedra": 2},
            {"dia_semana": "Lunes", "hora_inicio": time(20, 0), "hora_fin": time(21, 30), "horas_catedra": 2},
        ]
        valido_cons, _ = HorarioService.validar_superposicion_franjas(franjas_consecutivas)
        self.assertTrue(valido_cons)

        # 3. Superposición externa con otra cátedra del mismo docente
        docente = Agente.objects.create(dni="39999888", legajo="LEG-399", apellido="Ríos", nombre="Lucas")
        desig1 = Designacion.objects.create(agente=docente, materia=self.materia1, situacion_revista="TIT", activo=True)
        HorarioDesignacion.objects.create(designacion=desig1, dia_semana="Viernes", hora_inicio=time(18, 30), hora_fin=time(21, 30), horas_catedra=4, activo=True)

        nuevas_franjas_viernes = [
            {"dia_semana": "Viernes", "hora_inicio": time(19, 0), "hora_fin": time(22, 0), "horas_catedra": 4}
        ]
        valido_ext, msg_ext = HorarioService.validar_superposicion_franjas(nuevas_franjas_viernes, docente=docente)
        self.assertFalse(valido_ext)
        self.assertIn("Conflicto de horarios del docente", msg_ext)

    def test_suplencia_validaciones_dominio(self):
        """Verifica las reglas de negocio de Suplencia (anti auto-suplencia, coincidencia de materia, revista y baja histórica)."""
        titular = Agente.objects.create(dni="24111222", legajo="LEG-241", apellido="Valdez", nombre="Jorge")
        suplente = Agente.objects.create(dni="37333444", legajo="LEG-373", apellido="Romero", nombre="Mariana")

        desig_titular = Designacion.objects.create(agente=titular, materia=self.materia1, situacion_revista="TIT", activo=True)
        desig_suplente = Designacion.objects.create(agente=suplente, materia=self.materia1, situacion_revista="SUP", activo=True)

        # 1. Suplencia válida
        valido, msg = HorarioService.validar_suplencia(
            designacion_suplente=desig_suplente,
            designacion_cubierta=desig_titular,
            motivo="LICENCIA"
        )
        self.assertTrue(valido)

        suplencia = Suplencia.objects.create(
            designacion_suplente=desig_suplente,
            designacion_cubierta=desig_titular,
            motivo="LICENCIA",
            fecha_desde=date(2026, 10, 1),
            fecha_hasta=date(2026, 10, 31),
            activo=True
        )
        self.assertEqual(desig_suplente.suplencia_activa, suplencia)
        self.assertEqual(desig_titular.cobertura_activa, suplencia)

        # 2. Anti auto-suplencia (titular supliéndose a sí mismo)
        desig_auto = Designacion.objects.create(agente=titular, materia=self.materia1, situacion_revista="SUP", activo=True)
        valido_auto, msg_auto = HorarioService.validar_suplencia(
            designacion_suplente=desig_auto,
            designacion_cubierta=desig_titular
        )
        self.assertFalse(valido_auto)
        self.assertIn("auto-suplirse", msg_auto)

        # 3. Mismatch de materias
        desig_otra_mat = Designacion.objects.create(agente=suplente, materia=self.materia2, situacion_revista="SUP", activo=True)
        valido_mat, msg_mat = HorarioService.validar_suplencia(
            designacion_suplente=desig_otra_mat,
            designacion_cubierta=desig_titular
        )
        self.assertFalse(valido_mat)
        self.assertIn("no coincide", msg_mat)

        # 4. Desactivación histórica sin borrar al cambiar revista
        desig_suplente.situacion_revista = "TIT"
        desig_suplente.save()
        suplencia.refresh_from_db()
        self.assertFalse(suplencia.activo)  # Marcada inactiva/histórica
        self.assertEqual(Suplencia.objects.filter(designacion_suplente=desig_suplente).count(), 1)  # No se borró el registro

    def test_vistas_designaciones_list_y_detail(self):
        """Verifica que las vistas de listado y detalle de designación respondan exitosamente."""
        self.client.login(username="testadmin", password="password123")
        docente = Agente.objects.create(dni="31555444", legajo="LEG-315", apellido="Acosta", nombre="Silvia")
        desig = Designacion.objects.create(agente=docente, materia=self.materia1, situacion_revista="TIT", activo=True)
        HorarioDesignacion.objects.create(designacion=desig, dia_semana="Lunes", hora_inicio=time(18, 30), hora_fin=time(21, 30), horas_catedra=4, activo=True)

        # Listado
        res_list = self.client.get("/designaciones/")
        self.assertEqual(res_list.status_code, 200)
        self.assertContains(res_list, "Acosta")

        # Detalle
        res_det = self.client.get(f"/designaciones/{desig.pk}/")
        self.assertEqual(res_det.status_code, 200)
        self.assertContains(res_det, "Ficha Oficial de Designación")
        self.assertContains(res_det, "Franjas Horarias Semanales")

    def test_agente_detail_selector_periodo_resumen_anual_y_referencia_temporal(self):
        """Verifica la consulta y presentación mensual en la Ficha del Docente (RF-14, RF-17, RF-18):
        - Filtro mensual sin alteración de datos de otros meses.
        - Preservación de bloques que cruzan meses (Nov a Dic) vinculados al mismo formulario.
        - Resumen anual independiente del filtro de mes.
        - Referencias temporales y estados RF-08.
        """
        self.client.login(username="testadmin", password="password123")
        docente = Agente.objects.create(dni="28444555", legajo="LEG-284", apellido="Benítez", nombre="Clara")
        suplente = Agente.objects.create(dni="33888999", legajo="LEG-338", apellido="Paredes", nombre="Ramiro")
        tipo_lic = self.lic_medica

        # 1. Crear inasistencias en Octubre 2026
        NovedadAsistencia.objects.create(agente=docente, fecha=date(2026, 10, 5), estado="I")
        NovedadAsistencia.objects.create(agente=docente, fecha=date(2026, 10, 6), estado="I")

        # 2. Crear bloque justificado continuo que cruza de Noviembre a Diciembre (28/11/2026 a 02/12/2026 = 5 días) (RF-14)
        fechas_bloque = [
            date(2026, 11, 28), date(2026, 11, 29), date(2026, 11, 30),
            date(2026, 12, 1), date(2026, 12, 2)
        ]
        for f in fechas_bloque:
            NovedadAsistencia.objects.create(
                agente=docente,
                fecha=f,
                estado="LIC",
                formulario_numero="F-9900/26",
                tipo_licencia=tipo_lic,
                suplente=suplente,
                observaciones="Reposo domiciliario"
            )

        total_esperado = 2 + 5
        self.assertEqual(NovedadAsistencia.objects.filter(agente=docente).count(), total_esperado)

        # 3. Consulta de NOVIEMBRE 2026 (?mes=11&anio=2026)
        res_nov = self.client.get(f"/agentes/{docente.pk}/?mes=11&anio=2026")
        self.assertEqual(res_nov.status_code, 200)

        # Debe mostrar únicamente los 3 días de noviembre en la tabla del período
        novedades_mes_nov = res_nov.context["novedades_mes"]
        self.assertEqual(novedades_mes_nov.count(), 3)
        self.assertEqual(novedades_mes_nov[0].fecha, date(2026, 11, 28))
        self.assertEqual(novedades_mes_nov[2].fecha, date(2026, 11, 30))

        # El resumen anual (RF-18) debe reflejar todo el año 2026 (2 faltas en octubre + 5 licencias totales)
        resumen_anual_nov = res_nov.context["resumen_anual"]
        self.assertEqual(resumen_anual_nov["faltas"], 2)
        self.assertEqual(resumen_anual_nov["licencias"], 5)
        self.assertEqual(resumen_anual_nov["restantes_faltas"], 8)
        self.assertEqual(resumen_anual_nov["cuadro_il02_count"], 5)

        # En la plantilla de noviembre se visualiza el formulario y suplente
        self.assertContains(res_nov, "F-9900/26")
        self.assertContains(res_nov, "Paredes")
        self.assertContains(res_nov, "Noviembre")

        # 4. Consulta de DICIEMBRE 2026 (?mes=12&anio=2026)
        res_dic = self.client.get(f"/agentes/{docente.pk}/?mes=12&anio=2026")
        self.assertEqual(res_dic.status_code, 200)

        # Debe mostrar únicamente los 2 días de diciembre en la tabla del período
        novedades_mes_dic = res_dic.context["novedades_mes"]
        self.assertEqual(novedades_mes_dic.count(), 2)
        self.assertEqual(novedades_mes_dic[0].fecha, date(2026, 12, 1))
        self.assertEqual(novedades_mes_dic[1].fecha, date(2026, 12, 2))

        # El resumen anual (RF-18) permanece IDÉNTICO e INDEPENDIENTE del cambio de mes
        resumen_anual_dic = res_dic.context["resumen_anual"]
        self.assertEqual(resumen_anual_dic["faltas"], 2)
        self.assertEqual(resumen_anual_dic["licencias"], 5)
        self.assertEqual(resumen_anual_dic["restantes_faltas"], 8)
        self.assertEqual(resumen_anual_dic["cuadro_il02_count"], 5)

        # En la plantilla de diciembre también se conserva el vínculo con el formulario y suplente
        self.assertContains(res_dic, "F-9900/26")
        self.assertContains(res_dic, "Paredes")
        self.assertContains(res_dic, "Diciembre")

        # 5. Comprobar que ningún registro fue modificado ni eliminado
        self.assertEqual(NovedadAsistencia.objects.filter(agente=docente).count(), total_esperado)

        # 6. Comprobar referencias temporales en el HTML
        self.assertContains(res_nov, "Ref. temporal")
        self.assertContains(res_nov, "Futura")

        # Octubre contiene fechas transcurridas
        res_oct = self.client.get(f"/agentes/{docente.pk}/?mes=10&anio=2026")
        self.assertEqual(res_oct.status_code, 200)
        self.assertContains(res_oct, "Transcurrida")
        self.assertEqual(res_oct.context["novedades_mes"].count(), 2)

    def test_asignar_suplencia_vista_formulario_y_reglas_negocio(self):
        """Verifica la pantalla y flujo completo de Asignar Suplencia:
        - Renderizado del formulario y metadata reactiva.
        - Bloqueo de auto-suplencia institucional.
        - Creación de Designación en revista 'SUP' con herencia de materia, carrera y horarios (1:N).
        - Vinculación de Suplencia y registro en Auditoría (RF-20).
        - Reflejo en la tabla de Cátedras y Horarios.
        """
        self.client.login(username="testadmin", password="password123")
        titular = Agente.objects.create(dni="27111222", legajo="LEG-271", apellido="Gómez", nombre="Carlos")
        suplente = Agente.objects.create(dni="34333444", legajo="LEG-343", apellido="Fernández", nombre="Laura")

        desig_titular = Designacion.objects.create(
            agente=titular,
            materia=self.materia1,
            situacion_revista="TIT",
            activo=True
        )
        HorarioDesignacion.objects.create(
            designacion=desig_titular,
            dia_semana="Lunes",
            hora_inicio=time(18, 30),
            hora_fin=time(21, 30),
            horas_catedra=4,
            activo=True
        )

        # 1. GET /designaciones/suplencia/nueva/
        resp_get = self.client.get("/designaciones/suplencia/nueva/")
        self.assertEqual(resp_get.status_code, 200)
        self.assertContains(resp_get, "Asignar Suplencia Institucional")
        self.assertContains(resp_get, "Docente Suplente")
        self.assertContains(resp_get, "Cátedra y Docente Titular o Interino a Suplantar")

        # 2. Intento de Auto-Suplencia (titular intenta suplirse a sí mismo)
        resp_auto = self.client.post("/designaciones/suplencia/nueva/", data={
            "docente_suplente": titular.id,
            "designacion_cubierta": desig_titular.id,
            "motivo": "LICENCIA",
            "fecha_desde": "2026-11-20",
            "sin_termino": "on"
        })
        self.assertEqual(resp_auto.status_code, 200)
        self.assertIn("docente_suplente", resp_auto.context["form"].errors)
        self.assertIn("no puede auto-suplirse", resp_auto.context["form"].errors["docente_suplente"][0])
        self.assertContains(resp_auto, "no puede auto-suplirse")

        # 3. Asignación válida de Suplencia
        resp_post = self.client.post("/designaciones/suplencia/nueva/", data={
            "docente_suplente": suplente.id,
            "designacion_cubierta": desig_titular.id,
            "motivo": "LICENCIA",
            "fecha_desde": "2026-11-20",
            "sin_termino": "on",
            "instrumento_legal": "Disp. N° 099/26",
            "observaciones": "Cobertura por licencia médica del titular"
        })
        self.assertRedirects(resp_post, "/designaciones/")

        # 4. Verificar creación de la Designación Suplente (revista SUP y herencia de horarios)
        desig_sup = Designacion.objects.filter(agente=suplente, materia=self.materia1).first()
        self.assertIsNotNone(desig_sup)
        self.assertEqual(desig_sup.situacion_revista, "SUP")
        self.assertEqual(desig_sup.total_horas_semanales, 4)

        # Franja horaria replicada
        franjas_sup = desig_sup.horarios.filter(activo=True)
        self.assertEqual(franjas_sup.count(), 1)
        self.assertEqual(franjas_sup[0].dia_semana, "Lunes")
        self.assertEqual(franjas_sup[0].horas_catedra, 4)

        # 5. Verificar creación del registro Suplencia
        suplencia = Suplencia.objects.filter(designacion_suplente=desig_sup).first()
        self.assertIsNotNone(suplencia)
        self.assertEqual(suplencia.designacion_cubierta, desig_titular)
        self.assertEqual(suplencia.motivo, "LICENCIA")
        self.assertEqual(suplencia.instrumento_legal, "Disp. N° 099/26")
        self.assertTrue(suplencia.activo)

        # 6. Verificar Auditoría inmutable (RF-20)
        audit = Auditoria.objects.filter(accion="ASIGNAR_SUPLENCIA").first()
        self.assertIsNotNone(audit)
        self.assertIn("Laura", audit.detalles)
        self.assertIn("Carlos", audit.detalles)
        self.assertIn("Disp. N° 099/26", audit.detalles)

        # 7. Verificar reflejo en la tabla de Cátedras y Horarios
        res_list = self.client.get("/designaciones/")
        self.assertEqual(res_list.status_code, 200)
        self.assertContains(res_list, "Suple a:")
        self.assertContains(res_list, "Gómez, Carlos")


