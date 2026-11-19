from django.test import TestCase
from django.core.exceptions import ValidationError
from django.contrib.auth.models import User
from datetime import date
from io import BytesIO
import openpyxl

from .models import (
    Agente, Carrera, Materia, Designacion, TipoLicencia,
    Feriado, NovedadAsistencia, Disposicion, RenglonMensual, Auditoria
)
from .forms import RecepcionFormularioFisicoForm, DesignacionForm
from .services import (
    ProcesadorMensualService, ExportadorExcelService,
    CalculadorAlertasService, ImportadorCSVService
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
