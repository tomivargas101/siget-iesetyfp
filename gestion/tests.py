from django.test import TestCase
from django.core.exceptions import ValidationError
from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
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
    CalculadorAlertasService, ImportadorCSVService, HorarioService,
    JustificacionService
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
        self.assertContains(resp_get, "Designar Suplencia Institucional")
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

    def test_edicion_justificacion_rango_acortado_desvincula_y_actualiza_grilla(self):
        """
        Verifica que al acortar el rango de una justificación/formulario (ej. de 10d a 5d):
        1. Los 5 días vigentes conserven el formulario, estado y tipo de licencia.
        2. Los 5 días fuera del rango queden desvinculados del formulario y restaurados a Inasistencia (I).
        3. La grilla diaria muestre 5d (no 10d) y el nuevo rango vigente.
        4. Se registre la acción en Auditoría.
        5. Los días desvinculados puedan editarse manualmente en la grilla diaria.
        """
        self.client.login(username="testadmin", password="password123")
        docente = Agente.objects.create(
            dni="32888999",
            legajo="LEG-328",
            apellido="Valenzuela",
            nombre="Marcos",
            activo=True
        )

        # 1. Registrar justificación inicial de 10 días (10/11/2026 al 19/11/2026)
        f_desde_orig = date(2026, 11, 10)
        f_hasta_orig = date(2026, 11, 19)
        form_num = "F-1042/26"

        res_inicial = JustificacionService.aplicar_justificacion(
            agente=docente,
            fecha_desde=f_desde_orig,
            fecha_hasta=f_hasta_orig,
            formulario_numero=form_num,
            estado="LIC",
            tipo_licencia=self.lic_medica,
            usuario=self.user,
            observaciones="Reposo por faringitis"
        )
        self.assertEqual(res_inicial["dias_procesados"], 10)
        self.assertEqual(res_inicial["dias_desvinculados"], 0)

        # Verificar que existen 10 registros asociados al formulario
        self.assertEqual(
            NovedadAsistencia.objects.filter(agente=docente, formulario_numero=form_num).count(),
            10
        )

        # Verificar que la grilla del 10/11/2026 refleja 10 días
        res_grid_10d = self.client.get(f"/asistencia/?fecha={f_desde_orig.strftime('%Y-%m-%d')}")
        self.assertEqual(res_grid_10d.status_code, 200)
        fila_doc = next(f for f in res_grid_10d.context["filas"] if f["agente"].id == docente.id)
        self.assertEqual(fila_doc["dias_periodo"], 10)
        self.assertContains(res_grid_10d, "10d")

        # 2. Simular edición en modal: acortar período de 10d a 5d (10/11/2026 al 14/11/2026)
        f_hasta_nueva = date(2026, 11, 14)
        resp_post = self.client.post(f"/asistencia/?fecha={f_desde_orig.strftime('%Y-%m-%d')}", data={
            "accion": "justificar_modal",
            "agente_id": docente.id,
            "formulario_numero": form_num,
            "formulario_original": form_num,
            "fecha": f_desde_orig.strftime("%Y-%m-%d"),
            "fecha_desde": f_desde_orig.strftime("%Y-%m-%d"),
            "fecha_hasta": f_hasta_nueva.strftime("%Y-%m-%d"),
            "fecha_desde_original": f_desde_orig.strftime("%Y-%m-%d"),
            "fecha_hasta_original": f_hasta_orig.strftime("%Y-%m-%d"),
            "estado": "LIC",
            "tipo_licencia_id": self.lic_medica.id,
            "observaciones": "Reposo acortado con alta médica anticipada"
        })
        self.assertRedirects(resp_post, f"/asistencia/?fecha={f_desde_orig.strftime('%Y-%m-%d')}")

        # 3. Comprobar registros vigentes en base de datos: solo 5 días conservan el formulario
        qs_form_5d = NovedadAsistencia.objects.filter(agente=docente, formulario_numero=form_num)
        self.assertEqual(qs_form_5d.count(), 5)
        for nov in qs_form_5d:
            self.assertEqual(nov.estado, "LIC")
            self.assertEqual(nov.tipo_licencia, self.lic_medica)
            self.assertGreaterEqual(nov.fecha, f_desde_orig)
            self.assertLessEqual(nov.fecha, f_hasta_nueva)

        # 4. Comprobar días que salieron del rango (15/11/2026 al 19/11/2026): desvinculados y con estado 'I'
        qs_desvinculados = NovedadAsistencia.objects.filter(
            agente=docente,
            fecha__range=(date(2026, 11, 15), date(2026, 11, 19))
        )
        self.assertEqual(qs_desvinculados.count(), 5)
        for nov_desv in qs_desvinculados:
            self.assertIsNone(nov_desv.formulario_numero)
            self.assertIsNone(nov_desv.tipo_licencia)
            self.assertIsNone(nov_desv.suplente)
            self.assertEqual(nov_desv.estado, "I")

        # 5. Comprobar que en la grilla diaria se refleja coherentemente '5d' (y ya no '10d')
        res_grid_5d = self.client.get(f"/asistencia/?fecha={f_desde_orig.strftime('%Y-%m-%d')}")
        self.assertEqual(res_grid_5d.status_code, 200)
        fila_editada = next(f for f in res_grid_5d.context["filas"] if f["agente"].id == docente.id)
        self.assertEqual(fila_editada["dias_periodo"], 5)
        self.assertContains(res_grid_5d, "5d")
        self.assertNotContains(res_grid_5d, "10d")

        # 6. Comprobar que en la fecha 16/11/2026 (día desvinculado) aparece con 'Pendiente F.'
        res_grid_dia_fuera = self.client.get("/asistencia/?fecha=2026-11-16")
        self.assertEqual(res_grid_dia_fuera.status_code, 200)
        fila_fuera = next(f for f in res_grid_dia_fuera.context["filas"] if f["agente"].id == docente.id)
        self.assertEqual(fila_fuera["estado"], "I")
        self.assertIsNone(fila_fuera["novedad"].formulario_numero)

        # 7. Comprobar Auditoría
        audit_mod = Auditoria.objects.filter(accion="MODIFICACION_JUSTIFICACION").first()
        self.assertIsNotNone(audit_mod)
        self.assertIn("F-1042/26", audit_mod.detalles)
        self.assertIn("Valenzuela, Marcos", audit_mod.detalles)
        self.assertIn("Días desvinculados fuera de rango restaurados a Inasistencia (I): 5", audit_mod.detalles)

    def test_importar_csv_valido_preserva_ceros_y_crea_agentes(self):
        """Valida que un CSV bien formateado cree docentes, preserve ceros a la izquierda (RN-01) y registre auditoría."""
        self.client.login(username="testadmin", password="password123")
        csv_content = (
            "dni,apellido,nombre,legajo,condicion_revista,email,telefono\n"
            "04812345,Gómez,Laura,LEG-048,TITULAR,laura@ies.edu.ar,3624123456\n"
            "28999888,Pérez,Carlos,LEG-289,INTERINO,carlos@ies.edu.ar,3624999888\n"
        ).encode("utf-8")

        archivo = SimpleUploadedFile("docentes_validos.csv", csv_content, content_type="text/csv")
        resp = self.client.post("/importar-csv/", data={"archivo_csv": archivo})

        self.assertEqual(resp.status_code, 200)
        self.assertContains(resp, "Importación completada")

        # Verificar RN-01: preservación estricta de ceros a la izquierda en DNI
        agente_cero = Agente.objects.filter(dni="04812345").first()
        self.assertIsNotNone(agente_cero)
        self.assertEqual(agente_cero.dni, "04812345")
        self.assertEqual(agente_cero.apellido, "Gómez")
        self.assertEqual(agente_cero.situacion_revista_defecto, "TIT")

        agente_dos = Agente.objects.filter(dni="28999888").first()
        self.assertIsNotNone(agente_dos)
        self.assertEqual(agente_dos.situacion_revista_defecto, "INT")

        # Verificar Auditoría
        audit = Auditoria.objects.filter(accion="IMPORTACION_CSV_AGENTES").first()
        self.assertIsNotNone(audit)
        self.assertIn("Se importaron 2 agentes nuevos", audit.detalles)

    def test_importar_csv_rechaza_extensiones_invalidas(self):
        """Valida que archivos ejecutables o documentos no aptos (.exe, .pdf, .docx, .pptx) sean rechazados limpiamente sin error 500."""
        self.client.login(username="testadmin", password="password123")

        archivos_invalidos = [
            ("malicioso.exe", b"MZ\x90\x00BinaryExeContent", "application/x-msdownload"),
            ("documento.pdf", b"%PDF-1.4 Fake PDF Content", "application/pdf"),
            ("informe.docx", b"PK\x03\x04WordDocumentFakeContent", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
            ("presentacion.pptx", b"PK\x03\x04PowerPointFakeContent", "application/vnd.openxmlformats-officedocument.presentationml.presentation"),
        ]

        total_agentes_antes = Agente.objects.count()

        for nombre_archivo, bytes_contenido, mime in archivos_invalidos:
            archivo = SimpleUploadedFile(nombre_archivo, bytes_contenido, content_type=mime)
            resp = self.client.post("/importar-csv/", data={"archivo_csv": archivo})

            # Nunca debe arrojar error 500 ni romperse
            self.assertEqual(resp.status_code, 200)
            self.assertContains(resp, "no permitida")
            # Ningún agente debe ser creado
            self.assertEqual(Agente.objects.count(), total_agentes_antes)

    def test_importar_csv_rechaza_contenido_binario_en_archivo_csv(self):
        """Valida que un archivo con extensión .csv pero contenido binario (bytes nulos) sea rechazado sin error 500."""
        self.client.login(username="testadmin", password="password123")
        archivo_binario = SimpleUploadedFile(
            "trampa.csv",
            b"dni,apellido,nombre\n\x00\x01\x02\x03\x04",
            content_type="text/csv"
        )

        total_agentes_antes = Agente.objects.count()
        resp = self.client.post("/importar-csv/", data={"archivo_csv": archivo_binario})

        self.assertEqual(resp.status_code, 200)
        self.assertContains(resp, "binario")
        self.assertEqual(Agente.objects.count(), total_agentes_antes)

    def test_importar_csv_rechaza_archivo_sin_columna_dni(self):
        """Valida que un CSV sin columna obligatoria de DNI/documento sea rechazado con mensaje descriptivo sin error 500."""
        self.client.login(username="testadmin", password="password123")
        csv_invalido = (
            "nombre,apellido,email,telefono\n"
            "Juan,Perez,juan@mail.com,123456\n"
        ).encode("utf-8")

        archivo = SimpleUploadedFile("sin_dni.csv", csv_invalido, content_type="text/csv")
        total_agentes_antes = Agente.objects.count()

        resp = self.client.post("/importar-csv/", data={"archivo_csv": archivo})

        self.assertEqual(resp.status_code, 200)
        self.assertContains(resp, "columna obligatoria")
        self.assertEqual(Agente.objects.count(), total_agentes_antes)

    def test_rol_bedelia_unificado_y_credenciales_demostracion_login(self):
        """
        Valida que el rol de Bedelía esté unificado (sin diferenciar Bedelía Tarde / Noche):
        1. login.html muestra 'Bedelía' de forma unificada (no muestra 'Bedelía Tarde' ni 'Bedelía Noche').
        2. El comando cargar_datos_iniciales crea o actualiza los usuarios con su rol unificado.
        3. El inicio de sesión con las credenciales mostradas (meduarte / meduarte123) funciona y permite operar.
        """
        from django.core.management import call_command
        from django.contrib.auth.models import Group

        # Ejecutar carga de datos iniciales
        call_command("cargar_datos_iniciales")

        # 1. Verificar grupos en BD: 'Bedelía' existe, no existen grupos divididos por turno
        self.assertTrue(Group.objects.filter(name="Bedelía").exists())
        self.assertFalse(Group.objects.filter(name="Bedelía Tarde").exists())
        self.assertFalse(Group.objects.filter(name="Bedelía Noche").exists())

        # 2. Verificar que los usuarios de prueba tengan asignado el rol unificado
        user_bedel = User.objects.get(username="meduarte")
        self.assertTrue(user_bedel.groups.filter(name="Bedelía").exists())

        user_sosa = User.objects.get(username="msosa")
        self.assertTrue(user_sosa.groups.filter(name="Bedelía").exists())

        user_sec = User.objects.get(username="zaquino")
        self.assertTrue(user_sec.groups.filter(name="Secretaría").exists())

        # 3. Comprobar que en la pantalla de login figura 'Bedelía' y no 'Bedelía Tarde' / 'Bedelía Noche'
        resp_login_page = self.client.get("/login/")
        self.assertEqual(resp_login_page.status_code, 200)
        self.assertContains(resp_login_page, "Bedelía:")
        self.assertContains(resp_login_page, "meduarte")
        self.assertNotContains(resp_login_page, "Bedelía Tarde")
        self.assertNotContains(resp_login_page, "Bedelía Noche")

        # 4. Comprobar autenticación funcional con credenciales de Bedelía
        login_success = self.client.login(username="meduarte", password="meduarte123")
        self.assertTrue(login_success)

        # Acceso a vistas operativas de bedelía
        resp_asistencia = self.client.get("/asistencia/")
        self.assertEqual(resp_asistencia.status_code, 200)
        self.assertContains(resp_asistencia, "Asistencia Diaria")

    def test_agente_alta_baja_logica_rn03_reactivacion_y_mensajes(self):
        """
        Valida el flujo integral de gestión de docentes (RN-03 y requerimientos de usuario):
        1. Alta exitosa con redirección al Padrón de Agentes (/agentes/) y mensaje de éxito.
        2. Baja lógica (RN-03) al desmarcar 'Docente Activo', sin eliminar de BD, con mensaje de aviso y redirección.
        3. Reactivación al volver a marcar 'Docente Activo' y guardar, con mensaje de éxito y redirección.
        """
        self.client.login(username="testadmin", password="password123")
        total_inicial = Agente.objects.count()

        # 1. Alta de docente
        datos_alta = {
            "dni": "04999888",  # Preserva cero a la izquierda (RN-01)
            "legajo": "LEG-499",
            "apellido": "Castillo",
            "nombre": "Esteban",
            "situacion_revista_defecto": "TIT",
            "activo": "on",
            "email": "ecastillo@iesetyfp.edu.ar",
            "telefono": "3624-998877",
        }
        resp_alta = self.client.post("/agentes/nuevo/", data=datos_alta, follow=True)
        self.assertRedirects(resp_alta, "/agentes/")
        self.assertEqual(Agente.objects.count(), total_inicial + 1)
        agente = Agente.objects.get(dni="04999888")
        self.assertTrue(agente.activo)
        self.assertContains(resp_alta, "registrado con éxito")

        # 2. Baja lógica (RN-03): desmarcar 'activo' (no se envía 'activo' en POST)
        datos_baja = {
            "dni": agente.dni,
            "legajo": agente.legajo,
            "apellido": agente.apellido,
            "nombre": agente.nombre,
            "situacion_revista_defecto": agente.situacion_revista_defecto,
            # 'activo' ausente -> equivale a checkbox desmarcado
        }
        resp_baja = self.client.post(f"/agentes/{agente.pk}/editar/", data=datos_baja, follow=True)
        self.assertRedirects(resp_baja, "/agentes/")
        self.assertEqual(Agente.objects.count(), total_inicial + 1)  # No se borró el registro de la BD
        agente.refresh_from_db()
        self.assertFalse(agente.activo)  # En estado histórico / baja lógica
        self.assertContains(resp_baja, "archivo histórico")

        # 3. Reactivación: volver a marcar 'activo'
        datos_reactivacion = {
            "dni": agente.dni,
            "legajo": agente.legajo,
            "apellido": agente.apellido,
            "nombre": agente.nombre,
            "situacion_revista_defecto": agente.situacion_revista_defecto,
            "activo": "on",
        }
        resp_react = self.client.post(f"/agentes/{agente.pk}/editar/", data=datos_reactivacion, follow=True)
        self.assertRedirects(resp_react, "/agentes/")
        self.assertEqual(Agente.objects.count(), total_inicial + 1)
        agente.refresh_from_db()
        self.assertTrue(agente.activo)  # Reactivado
        self.assertContains(resp_react, "actualizado correctamente")

    def test_agente_errores_formulario_visibles_sin_fallo_silencioso(self):
        """
        Valida que si ocurre un error de validación en el formulario de agente (alta o edición),
        los errores se muestren de forma clara y visible en pantalla (código 200) sin fallar silenciosamente.
        """
        self.client.login(username="testadmin", password="password123")
        docente_existente = Agente.objects.create(
            dni="28111222",
            legajo="LEG-281",
            apellido="Prueba",
            nombre="Existente",
            situacion_revista_defecto="TIT",
            activo=True
        )

        # Intento de alta con DNI duplicado
        datos_invalidos = {
            "dni": docente_existente.dni,
            "legajo": "LEG-DUP",
            "apellido": "Duplicado",
            "nombre": "Prueba",
            "situacion_revista_defecto": "INT",
            "activo": "on",
        }
        resp = self.client.post("/agentes/nuevo/", data=datos_invalidos)
        self.assertEqual(resp.status_code, 200)
        self.assertContains(resp, "Por favor corrija los siguientes errores")
        self.assertContains(resp, f"Ya existe un docente registrado con el DNI {docente_existente.dni}")

    def test_edicion_designacion_baja_logica_conserva_horarios_sin_error_fila_extra(self):
        """
        Verifica que al editar una designación existente para desactivarla (baja lógica activo=False):
        1. En GET, el formset no renderiza filas extras vacías (extra=0 cuando ya tiene horarios).
        2. Al enviar el POST desactivando la designación y manteniendo las franjas horarias existentes:
           - No falle por validación de fila extra vacía (empty_permitted=True / has_changed).
           - Se guarde correctamente en la base de datos con activo=False.
           - Conserve sus franjas horarias intactas.
           - Registre la auditoría (MODIFICACION_DESIGNACION).
           - Emita mensaje de éxito y redirija a /designaciones/.
        """
        self.client.login(username="testadmin", password="password123")
        docente = Agente.objects.create(
            dni="29999000",
            legajo="LEG-299",
            apellido="Suárez",
            nombre="Claudio",
            activo=True
        )
        desig = Designacion.objects.create(
            agente=docente,
            materia=self.materia1,
            cargo_codigo="Cátedra",
            situacion_revista="TIT",
            activo=True
        )
        h1 = HorarioDesignacion.objects.create(
            designacion=desig,
            dia_semana="Martes",
            hora_inicio=time(18, 30),
            hora_fin=time(20, 0),
            horas_catedra=2,
            activo=True
        )
        h2 = HorarioDesignacion.objects.create(
            designacion=desig,
            dia_semana="Jueves",
            hora_inicio=time(18, 30),
            hora_fin=time(21, 30),
            horas_catedra=4,
            activo=True
        )

        # 1. GET: Debe renderizar exactamente las 2 franjas existentes sin fila extra vacía
        resp_get = self.client.get(f"/designaciones/{desig.pk}/editar/")
        self.assertEqual(resp_get.status_code, 200)
        formset_get = resp_get.context["horario_formset"]
        self.assertEqual(len(formset_get.forms), 2)

        # 2. POST: Desactivar designación (sin switch 'activo') enviando las 2 franjas existentes
        # más un formulario extra vacío para verificar que no sea obligatorio ni impida guardar
        post_data = {
            "agente": docente.pk,
            "materia": self.materia1.pk,
            "cargo_codigo": "Cátedra",
            "situacion_revista": "TIT",
            "instrumento_legal": "Res. 101/26",
            "vigencia_desde": "SIN INICIO",
            "vigencia_hasta": "SIN TERMINO",
            # 'activo' omitido para pasar de activa a inactiva
            "observaciones": "Baja lógica por adecuación de planta",
            "horarios-TOTAL_FORMS": "3",
            "horarios-INITIAL_FORMS": "2",
            "horarios-MIN_NUM_FORMS": "0",
            "horarios-MAX_NUM_FORMS": "1000",
            "horarios-0-id": h1.id,
            "horarios-0-dia_semana": h1.dia_semana,
            "horarios-0-hora_inicio": "18:30",
            "horarios-0-hora_fin": "20:00",
            "horarios-0-horas_catedra": "2",
            "horarios-0-activo": "on",
            "horarios-1-id": h2.id,
            "horarios-1-dia_semana": h2.dia_semana,
            "horarios-1-hora_inicio": "18:30",
            "horarios-1-hora_fin": "21:30",
            "horarios-1-horas_catedra": "4",
            "horarios-1-activo": "on",
            # Fila extra vacía (no debe bloquear con 'Este campo es obligatorio')
            "horarios-2-id": "",
            "horarios-2-dia_semana": "",
            "horarios-2-hora_inicio": "",
            "horarios-2-hora_fin": "",
            "horarios-2-horas_catedra": "",
            "horarios-2-activo": "on",
        }
        resp_post = self.client.post(f"/designaciones/{desig.pk}/editar/", data=post_data, follow=True)
        self.assertRedirects(resp_post, "/designaciones/")

        # 3. Validar estado en base de datos
        desig.refresh_from_db()
        self.assertFalse(desig.activo)
        self.assertEqual(desig.horarios.count(), 2)
        dias_horarios = list(desig.horarios.values_list("dia_semana", flat=True))
        self.assertIn("Martes", dias_horarios)
        self.assertIn("Jueves", dias_horarios)

        # 4. Validar mensaje de éxito
        self.assertContains(resp_post, "actualizada con éxito")

        # 5. Validar auditoría registrada
        audit = Auditoria.objects.filter(
            accion="MODIFICACION_DESIGNACION",
            detalles__contains=f"Designación ID {desig.id}"
        ).first()
        self.assertIsNotNone(audit)

    def test_asociacion_designacion_carrera_plan_estudio_rf03_rf05_rn02(self):
        """Verifica la asociación directa de designaciones a su Carrera, Plan de estudio y Situación de revista (RF-03, RF-05, RN-02)."""
        self.carrera.resolucion = "Res. 1045/18 MECCyT"
        self.carrera.save()
        docente = Agente.objects.create(dni="25999111", legajo="LEG-259", apellido="Sosa", nombre="Mariana")
        desig = Designacion.objects.create(
            agente=docente,
            materia=self.materia1,
            situacion_revista="INT",
            activo=True
        )
        self.assertEqual(desig.carrera, self.carrera)
        self.assertEqual(desig.plan_estudio, "Res. 1045/18 MECCyT")
        self.assertEqual(desig.situacion_revista, "INT")

        # Verificar formulario DesignacionForm
        from gestion.forms import DesignacionForm
        form = DesignacionForm()
        label = form.fields["materia"].label_from_instance(self.materia1)
        self.assertIn(self.materia1.nombre, label)
        self.assertIn(self.carrera.codigo, label)
        self.assertIn("Res. 1045/18 MECCyT", label)

    def test_asignacion_automatica_disposicion_mensual_rn11_rf16(self):
        """Verifica que el procesamiento mensual asigne disposiciones correlativas agrupadas alfabéticamente
        y que todas las materias/días del mismo formulario compartan la misma Disposición (RN-11, RF-16)."""
        docente_b = Agente.objects.create(dni="22111222", legajo="LEG-221", apellido="Barrios", nombre="Carlos")
        docente_z = Agente.objects.create(dni="22333444", legajo="LEG-223", apellido="Zárate", nombre="Ana")

        # Materias con horarios en viernes y lunes
        desig_b1 = Designacion.objects.create(agente=docente_b, materia=self.materia1, situacion_revista="TIT", activo=True)
        HorarioDesignacion.objects.create(designacion=desig_b1, dia_semana="Viernes", hora_inicio=time(18, 30), hora_fin=time(21, 30), horas_catedra=4, activo=True)
        HorarioDesignacion.objects.create(designacion=desig_b1, dia_semana="Lunes", hora_inicio=time(18, 30), hora_fin=time(21, 30), horas_catedra=4, activo=True)

        desig_z1 = Designacion.objects.create(agente=docente_z, materia=self.materia2, situacion_revista="TIT", activo=True)
        HorarioDesignacion.objects.create(designacion=desig_z1, dia_semana="Lunes", hora_inicio=time(18, 30), hora_fin=time(21, 30), horas_catedra=4, activo=True)

        # Licencia que cruza fin de semana (Viernes 06/11/2026 y Lunes 09/11/2026) con el mismo formulario
        NovedadAsistencia.objects.create(
            agente=docente_b, fecha=date(2026, 11, 6), estado="LIC",
            formulario_numero="F-777/2026", tipo_licencia=self.lic_medica
        )
        NovedadAsistencia.objects.create(
            agente=docente_b, fecha=date(2026, 11, 9), estado="LIC",
            formulario_numero="F-777/2026", tipo_licencia=self.lic_medica
        )

        # Inasistencia para Zárate (Lunes 09/11/2026)
        NovedadAsistencia.objects.create(
            agente=docente_z, fecha=date(2026, 11, 9), estado="I"
        )

        # Procesar mes
        res = ProcesadorMensualService.procesar_mes(mes=11, anio=2026, usuario_responsable=self.user)
        self.assertTrue(res["success"])

        # Verificar renglones de Barrios: viernes y lunes deben compartir la misma disposición (RN-11)
        renglones_b = RenglonMensual.objects.filter(agente=docente_b, mes=11, anio=2026)
        self.assertEqual(renglones_b.count(), 2)
        disp_ids = {r.disposicion_id for r in renglones_b}
        self.assertEqual(len(disp_ids), 1)  # Exactamente 1 disposición compartida

        # Barrios (B) debe tener número menor que Zárate (Z) por orden alfabético de apellido (RF-16)
        disp_b = renglones_b.first().disposicion
        renglones_z = RenglonMensual.objects.filter(agente=docente_z, mes=11, anio=2026)
        disp_z = renglones_z.first().disposicion
        self.assertLess(disp_b.numero, disp_z.numero)

        # Re-procesar mes: no debe dejar disposiciones huérfanas ni inflar números
        ProcesadorMensualService.procesar_mes(mes=11, anio=2026, usuario_responsable=self.user)
        self.assertEqual(Disposicion.objects.filter(anio=2026, renglones__isnull=True).count(), 0)

    def test_asistencia_diaria_flujo_rf07_rf08_rf09_rf11_rf18(self):
        """Verifica la carga ágil por planilla, transición I -> LIC, alerta preventiva y limpieza al volver a PR (RF-07, RF-08, RF-09, RF-11, RF-18)."""
        self.client.login(username="testadmin", password="password123")
        docente = Agente.objects.create(dni="29111333", legajo="LEG-291", apellido="Méndez", nombre="Lucas")
        fecha_test = date(2026, 11, 10)

        # 1. Carga inicial: Inasistencia (I) (RF-07, RF-08)
        resp = self.client.post("/asistencia/", data={
            "agente_id": docente.pk,
            "estado": "I",
            "dias": "1",
            "fecha": fecha_test.strftime("%Y-%m-%d")
        }, HTTP_X_REQUESTED_WITH="XMLHttpRequest")
        self.assertEqual(resp.status_code, 200)

        nov = NovedadAsistencia.objects.get(agente=docente, fecha=fecha_test)
        self.assertEqual(nov.estado, "I")
        self.assertIsNone(nov.formulario_numero)

        # 2. Transición a LIC con formulario físico (RF-09, RF-11)
        res_justif = JustificacionService.aplicar_justificacion(
            agente=docente,
            fecha_desde=fecha_test,
            fecha_hasta=fecha_test,
            formulario_numero="F-888/2026",
            estado="LIC",
            tipo_licencia=self.lic_medica,
            usuario=self.user
        )
        self.assertTrue(res_justif["success"])
        nov.refresh_from_db()
        self.assertEqual(nov.estado, "LIC")
        self.assertEqual(nov.formulario_numero, "F-888/2026")

        # 3. Consultar planilla diaria: verificar advertencia preventiva disponible (RF-18)
        resp_get = self.client.get(f"/asistencia/?fecha={fecha_test.strftime('%Y-%m-%d')}")
        self.assertEqual(resp_get.status_code, 200)
        self.assertContains(resp_get, "Licencia Activa")

        # 4. Corrección manual a Presente (PR): debe limpiar formulario_numero y tipo_licencia
        resp_pr = self.client.post("/asistencia/", data={
            "agente_id": docente.pk,
            "estado": "PR",
            "dias": "1",
            "fecha": fecha_test.strftime("%Y-%m-%d")
        }, HTTP_X_REQUESTED_WITH="XMLHttpRequest")
        self.assertEqual(resp_pr.status_code, 200)

        nov.refresh_from_db()
        self.assertEqual(nov.estado, "PR")
        self.assertIsNone(nov.formulario_numero)
        self.assertIsNone(nov.tipo_licencia)
        self.assertIsNone(nov.suplente)

    def test_carrera_create_edit_baja_auditoria_sin_typeerror(self):
        """Verifica que el alta, edición y baja lógica de Carrera funcionen sin TypeError en registrar_auditoria (RF-05, RN-03)."""
        self.client.login(username="testadmin", password="password123")

        # 1. Alta de Carrera
        resp_alta = self.client.post("/carreras/nueva/", data={
            "codigo": "TEC-RED",
            "nombre": "Tecnicatura Superior en Redes",
            "resolucion": "Res. 555/20 MECCyT",
            "duracion_anios": 3,
            "activo": "on",
        }, follow=True)
        self.assertEqual(resp_alta.status_code, 200)
        carrera = Carrera.objects.filter(codigo="TEC-RED").first()
        self.assertIsNotNone(carrera)
        self.assertEqual(carrera.nombre, "Tecnicatura Superior en Redes")

        # Validar auditoría de alta
        audit_alta = Auditoria.objects.filter(accion="ALTA_CARRERA", detalles__contains="TEC-RED").first()
        self.assertIsNotNone(audit_alta)

        # 2. Edición de Carrera
        resp_edit = self.client.post(f"/carreras/{carrera.pk}/editar/", data={
            "codigo": "TEC-RED",
            "nombre": "Tecnicatura Superior en Redes e Infraestructura",
            "resolucion": "Res. 555/20 MECCyT",
            "duracion_anios": 3,
            "activo": "on",
        }, follow=True)
        self.assertEqual(resp_edit.status_code, 200)
        carrera.refresh_from_db()
        self.assertEqual(carrera.nombre, "Tecnicatura Superior en Redes e Infraestructura")

        # Validar auditoría de modificación
        audit_edit = Auditoria.objects.filter(accion="MODIFICACION_CARRERA", detalles__contains="TEC-RED").first()
        self.assertIsNotNone(audit_edit)

        # 3. Baja Lógica de Carrera
        resp_baja = self.client.get(f"/carreras/{carrera.pk}/baja/", follow=True)
        self.assertEqual(resp_baja.status_code, 200)
        carrera.refresh_from_db()
        self.assertFalse(carrera.activo)

        # Validar auditoría de baja
        audit_baja = Auditoria.objects.filter(accion="BAJA_LOGICA_CARRERA", detalles__contains="TEC-RED").first()
        self.assertIsNotNone(audit_baja)

    def test_designacion_baja_logica_rf04_rn03(self):
        """Verifica que la baja de designaciones sea estrictamente lógica, preservando el registro y sus planillas históricas (RF-04, RN-03)."""
        self.client.login(username="testadmin", password="password123")
        docente = Agente.objects.create(dni="27444333", legajo="LEG-274", apellido="Flores", nombre="Gonzalo")
        desig = Designacion.objects.create(
            agente=docente,
            materia=self.materia1,
            situacion_revista="TIT",
            activo=True
        )
        HorarioDesignacion.objects.create(
            designacion=desig,
            dia_semana="Miércoles",
            hora_inicio=time(18, 30),
            hora_fin=time(21, 30),
            horas_catedra=4,
            activo=True
        )

        # Asociar un renglón mensual histórico que no debe eliminarse jamás
        renglon = RenglonMensual.objects.create(
            mes=10,
            anio=2026,
            cuadro="IL-01",
            agente=docente,
            designacion=desig,
            materia_nombre=desig.materia.nombre,
            carrera_nombre=desig.materia.carrera.nombre,
            situacion_revista=desig.situacion_revista,
            horas_afectadas=4,
            desde=date(2026, 10, 5),
            hasta=date(2026, 10, 5),
            tipo_licencia=self.lic_medica,
            articulo=self.lic_medica.articulo,
            codigo_licencia=self.lic_medica.codigo
        )

        # 1. Ejecutar baja lógica desde la vista /designaciones/<pk>/baja/
        resp = self.client.get(f"/designaciones/{desig.pk}/baja/", follow=True)
        self.assertEqual(resp.status_code, 200)

        # 2. La designación DEBE seguir existiendo en la base de datos (RN-03: no borrado físico)
        self.assertTrue(Designacion.objects.filter(pk=desig.pk).exists())
        desig.refresh_from_db()
        self.assertFalse(desig.activo)
        self.assertNotEqual(desig.vigencia_hasta, "SIN TERMINO")

        # 3. Los horarios deben pasar a inactivos
        self.assertEqual(desig.horarios.filter(activo=True).count(), 0)

        # 4. El renglón mensual histórico de la planilla NO debe haberse borrado
        self.assertTrue(RenglonMensual.objects.filter(pk=renglon.pk).exists())

        # 5. Auditoría registrada
        audit = Auditoria.objects.filter(
            accion="BAJA_LOGICA_DESIGNACION",
            detalles__contains=f"Designación ID {desig.id}"
        ).first()
        self.assertIsNotNone(audit)

        # 6. Método desig.delete() directo también ejecuta baja lógica sin borrar fila
        desig.activo = True
        desig.save()
        desig.delete()
        self.assertTrue(Designacion.objects.filter(pk=desig.pk).exists())
        desig.refresh_from_db()
        self.assertFalse(desig.activo)







