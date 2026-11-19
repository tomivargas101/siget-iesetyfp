from django.db import models
from django.contrib.auth.models import User
from django.core.exceptions import ValidationError
from datetime import date, datetime

DEFAULT_OFFICE_CODE = 1452

class Carrera(models.Model):
    codigo = models.CharField(max_length=30, unique=True, verbose_name="Código de Carrera")
    nombre = models.CharField(max_length=200, verbose_name="Nombre de Carrera")
    resolucion = models.CharField(max_length=150, blank=True, null=True, verbose_name="Resolución Ministerial")
    duracion_anios = models.IntegerField(default=3, verbose_name="Duración (Años)")
    activo = models.BooleanField(default=True, verbose_name="Activa")
    creado_en = models.DateTimeField(auto_now_add=True)
    modificado_en = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Carrera"
        verbose_name_plural = "Carreras"
        ordering = ["nombre"]

    def __str__(self):
        return f"{self.nombre} ({self.codigo})"


class Materia(models.Model):
    carrera = models.ForeignKey(Carrera, on_delete=models.CASCADE, related_name="materias", verbose_name="Carrera")
    codigo = models.CharField(max_length=30, verbose_name="Código de Materia")
    nombre = models.CharField(max_length=200, verbose_name="Espacio Curricular / Materia")
    anio_cursada = models.IntegerField(default=1, verbose_name="Año de Cursada")
    horas_semanales = models.IntegerField(default=4, verbose_name="Horas Cátedra Semanales")
    activo = models.BooleanField(default=True, verbose_name="Activa")
    creado_en = models.DateTimeField(auto_now_add=True)
    modificado_en = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Materia"
        verbose_name_plural = "Materias"
        ordering = ["carrera", "anio_cursada", "nombre"]

    def __str__(self):
        return f"{self.nombre} - {self.carrera.codigo} (Año {self.anio_cursada})"


class Agente(models.Model):
    SEXO_CHOICES = [
        ("M", "Masculino"),
        ("F", "Femenino"),
        ("X", "No Binario / Otro"),
    ]
    REVISTA_CHOICES = [
        ("TIT", "Titular (TIT)"),
        ("INT", "Interino (INT)"),
        ("SUP", "Suplente (SUP)"),
    ]

    dni = models.CharField(max_length=20, unique=True, db_index=True, verbose_name="DNI (Texto)")
    legajo = models.CharField(max_length=30, unique=True, db_index=True, verbose_name="N° de Legajo")
    apellido = models.CharField(max_length=100, verbose_name="Apellido(s)")
    nombre = models.CharField(max_length=100, verbose_name="Nombre(s)")
    sexo = models.CharField(max_length=10, choices=SEXO_CHOICES, default="M", verbose_name="Sexo")
    cuil = models.CharField(max_length=25, blank=True, null=True, verbose_name="CUIL")
    email = models.EmailField(max_length=120, blank=True, null=True, verbose_name="Correo Electrónico")
    telefono = models.CharField(max_length=50, blank=True, null=True, verbose_name="Teléfono")
    situacion_revista_defecto = models.CharField(max_length=10, choices=REVISTA_CHOICES, default="TIT", verbose_name="Revista por Defecto")
    max_horas_semanales = models.IntegerField(default=30, verbose_name="Tope Máximo Semanal (Hs)")
    activo = models.BooleanField(default=True, verbose_name="Activo en Planta")
    creado_en = models.DateTimeField(auto_now_add=True)
    modificado_en = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Agente Docente"
        verbose_name_plural = "Agentes Docentes"
        ordering = ["apellido", "nombre"]

    def __str__(self):
        return f"{self.apellido}, {self.nombre} (DNI: {self.dni})"

    @property
    def nombre_completo(self):
        return f"{self.apellido}, {self.nombre}"

    @property
    def horas_activas_semanales(self):
        return sum(d.horas_catedra for d in self.designaciones.filter(activo=True))

    def validar_tope_horas(self, nuevas_horas: int = 0, excluir_designacion_id: int = None) -> tuple[bool, str]:
        qs = self.designaciones.filter(activo=True)
        if excluir_designacion_id:
            qs = qs.exclude(id=excluir_designacion_id)
        horas_actuales = sum(d.horas_catedra for d in qs)
        total = horas_actuales + nuevas_horas
        if total > self.max_horas_semanales:
            return False, f"El agente posee actualmente {horas_actuales} hs activas. Sumar {nuevas_horas} hs excedería el tope legal institucional de {self.max_horas_semanales} hs semanales (Total: {total} hs)."
        return True, f"Horas válidas ({total}/{self.max_horas_semanales} hs)."


class Designacion(models.Model):
    REVISTA_CHOICES = [
        ("TIT", "Titular (TIT)"),
        ("INT", "Interino (INT)"),
        ("SUP", "Suplente (SUP)"),
    ]
    DIAS_SEMANA = [
        ("Lunes", "Lunes"),
        ("Martes", "Martes"),
        ("Miércoles", "Miércoles"),
        ("Jueves", "Jueves"),
        ("Viernes", "Viernes"),
        ("Sábado", "Sábado"),
    ]

    agente = models.ForeignKey(Agente, on_delete=models.CASCADE, related_name="designaciones", verbose_name="Docente / Agente")
    materia = models.ForeignKey(Materia, on_delete=models.CASCADE, related_name="designaciones", verbose_name="Espacio Curricular")
    cargo_codigo = models.CharField(max_length=150, default="Cátedra / Horas Cátedra", verbose_name="Cargo o Código")
    situacion_revista = models.CharField(max_length=10, choices=REVISTA_CHOICES, default="TIT", verbose_name="Situación de Revista")
    dia_semana = models.CharField(max_length=20, choices=DIAS_SEMANA, verbose_name="Día de Cursada")
    hora_inicio = models.CharField(max_length=10, default="18:30", verbose_name="Hora Inicio (HH:MM)")
    hora_fin = models.CharField(max_length=10, default="21:00", verbose_name="Hora Fin (HH:MM)")
    horas_catedra = models.IntegerField(default=4, verbose_name="Horas Cátedra ese Día")
    instrumento_legal = models.CharField(max_length=150, blank=True, null=True, verbose_name="Instrumento Legal")
    vigencia_desde = models.CharField(max_length=30, default="SIN INICIO", verbose_name="Vigencia Desde")
    vigencia_hasta = models.CharField(max_length=30, default="SIN TERMINO", verbose_name="Vigencia Hasta")
    activo = models.BooleanField(default=True, verbose_name="Designación Activa")
    observaciones = models.TextField(blank=True, null=True, verbose_name="Observaciones")
    creado_en = models.DateTimeField(auto_now_add=True)
    modificado_en = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Designación de Cátedra"
        verbose_name_plural = "Designaciones de Cátedras"
        ordering = ["agente", "dia_semana", "hora_inicio"]

    def __str__(self):
        return f"{self.agente.apellido} - {self.materia.nombre} ({self.dia_semana} {self.hora_inicio}-{self.hora_fin}, {self.horas_catedra} hs)"

    def clean(self):
        if self.activo and self.agente_id:
            valido, msg = self.agente.validar_tope_horas(self.horas_catedra, excluir_designacion_id=self.id)
            if not valido:
                raise ValidationError(msg)


class TipoLicencia(models.Model):
    CUADRO_CHOICES = [
        ("IL-01", "Cuadro IL-01 (Licencias Médicas / Salud)"),
        ("IL-02", "Cuadro IL-02 (Inasistencias, Permisos y Otras)"),
    ]

    hoja = models.IntegerField(verbose_name="Hoja en PDF Oficial", default=1)
    hoja_nombre = models.CharField(max_length=120, verbose_name="Sección Oficial")
    articulo = models.CharField(max_length=100, verbose_name="Artículo Normativo")
    codigo = models.CharField(max_length=30, unique=True, verbose_name="Código de Licencia (COD.LIC.)")
    nombre = models.CharField(max_length=255, verbose_name="Descripción / Motivo")
    cuadro_destino = models.CharField(max_length=10, choices=CUADRO_CHOICES, verbose_name="Cuadro Oficial Destino")
    es_medica = models.BooleanField(default=False, verbose_name="Es Médica / Salud")
    tope_anual_dias = models.IntegerField(null=True, blank=True, verbose_name="Tope Anual en Días")
    activo = models.BooleanField(default=True, verbose_name="Activa")

    class Meta:
        verbose_name = "Tipo de Licencia"
        verbose_name_plural = "Catálogo de Licencias"
        ordering = ["hoja", "articulo"]

    def __str__(self):
        return f"{self.articulo} ({self.codigo}) - {self.nombre} [{self.cuadro_destino}]"


class Feriado(models.Model):
    TIPO_CHOICES = [
        ("FERIADO", "Feriado Nacional / Provincial"),
        ("ASUETO", "Asueto Institucional"),
        ("JORNADA", "Jornada Pedagógica / Institucional"),
        ("MESA", "Mesa de Exámenes"),
    ]

    fecha = models.DateField(unique=True, verbose_name="Fecha Inhábil")
    descripcion = models.CharField(max_length=200, verbose_name="Motivo / Descripción")
    tipo = models.CharField(max_length=30, choices=TIPO_CHOICES, default="FERIADO", verbose_name="Tipo de Día")

    class Meta:
        verbose_name = "Feriado / Día Inhábil"
        verbose_name_plural = "Calendario Escolar e Inhábiles"
        ordering = ["fecha"]

    def __str__(self):
        return f"{self.fecha.strftime('%d/%m/%Y')} - {self.descripcion} ({self.get_tipo_display()})"


class NovedadAsistencia(models.Model):
    ESTADOS = [
        ("P", "Permiso (P)"),
        ("I", "Inasistencia (I)"),
        ("LIC", "Licencia Médica o Especial (LIC)"),
        ("LT", "Largo Tratamiento (LT)"),
        ("PR", "Presente (PR)"),
    ]

    agente = models.ForeignKey(Agente, on_delete=models.CASCADE, related_name="novedades_asistencia", verbose_name="Docente / Agente")
    fecha = models.DateField(db_index=True, verbose_name="Fecha")
    estado = models.CharField(max_length=10, choices=ESTADOS, default="PR", verbose_name="Estado de Asistencia")
    formulario_numero = models.CharField(max_length=50, blank=True, null=True, verbose_name="N° Formulario Físico / Certificado")
    tipo_licencia = models.ForeignKey(TipoLicencia, null=True, blank=True, on_delete=models.SET_NULL, related_name="novedades", verbose_name="Artículo / Tipo de Licencia")
    suplente = models.ForeignKey(Agente, null=True, blank=True, on_delete=models.SET_NULL, related_name="suplencias_asistencias", verbose_name="Docente Suplente que Cubre")
    adjunto_certificado = models.FileField(upload_to="certificados/", blank=True, null=True, verbose_name="Archivo Digital Adjunto")
    observaciones = models.TextField(blank=True, null=True, verbose_name="Observaciones")
    registrado_por = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="novedades_registradas", verbose_name="Registrado por")
    creado_en = models.DateTimeField(auto_now_add=True)
    modificado_en = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Novedad Diaria de Asistencia"
        verbose_name_plural = "Asistencia Diaria del Personal"
        unique_together = ("agente", "fecha")
        ordering = ["-fecha", "agente__apellido", "agente__nombre"]

    def __str__(self):
        return f"{self.fecha.strftime('%d/%m/%Y')} - {self.agente.apellido}: {self.get_estado_display()}"

    def clean(self):
        if self.suplente_id and self.agente_id and self.suplente_id == self.agente_id:
            raise ValidationError("Un docente no puede suplirse a sí mismo en su propia cátedra.")


class Disposicion(models.Model):
    anio = models.IntegerField(default=date.today().year, verbose_name="Año Calendario")
    numero = models.IntegerField(verbose_name="Número Correlativo")
    numero_formateado = models.CharField(max_length=50, verbose_name="Formato Oficial (ej. Disp. N° 001/2026)")
    fecha_emision = models.DateField(default=date.today, verbose_name="Fecha de Emisión")
    observaciones = models.TextField(blank=True, null=True, verbose_name="Observaciones")
    creado_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Disposición Interna"
        verbose_name_plural = "Disposiciones Internas"
        unique_together = ("anio", "numero")
        ordering = ["anio", "numero"]

    def __str__(self):
        return self.numero_formateado


class RenglonMensual(models.Model):
    CUADRO_CHOICES = [
        ("IL-01", "Cuadro IL-01 (Salud)"),
        ("IL-02", "Cuadro IL-02 (Otras causales)"),
    ]

    mes = models.IntegerField(verbose_name="Mes Procesado (1-12)")
    anio = models.IntegerField(default=date.today().year, verbose_name="Año Procesado")
    cuadro = models.CharField(max_length=10, choices=CUADRO_CHOICES, verbose_name="Cuadro Destino")
    oficina = models.IntegerField(default=DEFAULT_OFFICE_CODE, verbose_name="Código de Oficina (1452)")
    agente = models.ForeignKey(Agente, on_delete=models.CASCADE, related_name="renglones_mensuales", verbose_name="Agente")
    designacion = models.ForeignKey(Designacion, on_delete=models.CASCADE, related_name="renglones_mensuales", verbose_name="Designación")
    materia_nombre = models.CharField(max_length=200, verbose_name="Espacio Curricular")
    carrera_nombre = models.CharField(max_length=200, verbose_name="Carrera")
    situacion_revista = models.CharField(max_length=20, verbose_name="Situación de Revista")
    horas_afectadas = models.IntegerField(default=4, verbose_name="Horas Afectadas ese Día")
    desde = models.DateField(verbose_name="Período Desde")
    hasta = models.DateField(verbose_name="Período Hasta")
    tipo_licencia = models.ForeignKey(TipoLicencia, on_delete=models.PROTECT, related_name="renglones_mensuales", verbose_name="Artículo / Licencia")
    articulo = models.CharField(max_length=100, verbose_name="Artículo Normativo")
    codigo_licencia = models.CharField(max_length=30, verbose_name="Código de Licencia")
    disposicion = models.ForeignKey(Disposicion, on_delete=models.SET_NULL, null=True, blank=True, related_name="renglones", verbose_name="Disposición Interna")
    formulario_numero = models.CharField(max_length=50, blank=True, null=True, verbose_name="N° de Formulario Físico")
    suplente = models.ForeignKey(Agente, null=True, blank=True, on_delete=models.SET_NULL, related_name="renglones_suplente", verbose_name="Docente Suplente")
    observaciones = models.TextField(blank=True, null=True, verbose_name="Observaciones / Reemplazado por")
    creado_por = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="renglones_creados", verbose_name="Procesado por")
    creado_en = models.DateTimeField(auto_now_add=True)
    modificado_en = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Renglón Mensual de Planilla"
        verbose_name_plural = "Planillas Mensuales (IL-01 / IL-02)"
        ordering = ["cuadro", "agente__apellido", "agente__nombre", "desde", "materia_nombre"]

    def __str__(self):
        return f"[{self.cuadro}] {self.agente.apellido} - {self.materia_nombre} ({self.desde} al {self.hasta}) {self.horas_afectadas} hs"


class Auditoria(models.Model):
    usuario = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="auditorias", verbose_name="Usuario")
    usuario_nombre = models.CharField(max_length=100, verbose_name="Nombre de Usuario")
    accion = models.CharField(max_length=100, verbose_name="Acción Realizada")
    detalles = models.TextField(blank=True, null=True, verbose_name="Detalles Técnicos")
    ip = models.GenericIPAddressField(null=True, blank=True, verbose_name="Dirección IP")
    timestamp = models.DateTimeField(auto_now_add=True, db_index=True, verbose_name="Fecha y Hora")

    class Meta:
        verbose_name = "Registro de Auditoría"
        verbose_name_plural = "Bitácora de Auditoría Inmutable"
        ordering = ["-timestamp"]

    def __str__(self):
        return f"{self.timestamp.strftime('%d/%m/%Y %H:%M')} | {self.usuario_nombre} | {self.accion}"
