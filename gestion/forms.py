import os
from django import forms
from django.core.exceptions import ValidationError
from datetime import date
from .models import (
    Agente, Carrera, Materia, Designacion, HorarioDesignacion, Suplencia,
    TipoLicencia, NovedadAsistencia
)
from .services.horarios import HorarioService

class AgenteForm(forms.ModelForm):
    class Meta:
        model = Agente
        fields = [
            "dni", "legajo", "apellido", "nombre", "sexo",
            "cuil", "email", "telefono", "situacion_revista_defecto",
            "max_horas_semanales", "activo"
        ]
        widgets = {
            "dni": forms.TextInput(attrs={"class": "form-control", "placeholder": "Ej. 28456123 (Sin puntos)"}),
            "legajo": forms.TextInput(attrs={"class": "form-control", "placeholder": "Ej. LEG-0101"}),
            "apellido": forms.TextInput(attrs={"class": "form-control", "placeholder": "Apellido(s)"}),
            "nombre": forms.TextInput(attrs={"class": "form-control", "placeholder": "Nombre(s)"}),
            "sexo": forms.Select(attrs={"class": "form-select"}),
            "cuil": forms.TextInput(attrs={"class": "form-control", "placeholder": "20-xxxxxxxx-x"}),
            "email": forms.EmailInput(attrs={"class": "form-control", "placeholder": "correo@iesetyfp.edu.ar"}),
            "telefono": forms.TextInput(attrs={"class": "form-control", "placeholder": "3624-xxxxxx"}),
            "situacion_revista_defecto": forms.Select(attrs={"class": "form-select"}),
            "max_horas_semanales": forms.NumberInput(attrs={"class": "form-control", "value": 30}),
            "activo": forms.CheckboxInput(attrs={"class": "form-check-input"}),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["legajo"].required = False
        self.fields["sexo"].required = False
        self.fields["max_horas_semanales"].required = False
        self.fields["cuil"].required = False
        self.fields["email"].required = False
        self.fields["telefono"].required = False
        self.fields["activo"].required = False
        if not self.is_bound and (not self.instance or not self.instance.pk):
            self.initial.setdefault("activo", True)
            self.initial.setdefault("max_horas_semanales", 30)
            self.initial.setdefault("sexo", "M")

    def clean_dni(self):
        dni = str(self.cleaned_data.get("dni", "")).strip().replace(".", "").replace(" ", "")
        if not dni:
            raise ValidationError("El DNI es obligatorio y no puede quedar vacío.")
        if len(dni) > 8:
            raise ValidationError("El DNI no puede superar los 8 caracteres numéricos (RF-01).")
        qs = Agente.objects.filter(dni=dni)
        if self.instance and self.instance.pk:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise ValidationError(f"Ya existe un docente registrado con el DNI {dni}.")
        return dni

    def clean_cuil(self):
        cuil = str(self.cleaned_data.get("cuil", "") or "").strip()
        if cuil:
            if not (11 <= len(cuil) <= 13):
                raise ValidationError("El CUIL debe contener entre 11 y 13 caracteres (ej: 20-xxxxxxxx-x o 11 dígitos numéricos).")
        return cuil

    def clean_telefono(self):
        tel = str(self.cleaned_data.get("telefono", "") or "").strip()
        if tel:
            if not (10 <= len(tel) <= 14):
                raise ValidationError("El teléfono debe contener entre 10 y 14 caracteres (ej: 3624-xxxxxx).")
        return tel

    def clean_legajo(self):
        legajo = str(self.cleaned_data.get("legajo", "")).strip()
        if not legajo:
            if self.instance and self.instance.pk and self.instance.legajo:
                return self.instance.legajo
            dni = str(self.cleaned_data.get("dni", "")).strip().replace(".", "").replace(" ", "")
            legajo = f"LEG-{dni}" if dni else "S/L"
        qs = Agente.objects.filter(legajo=legajo)
        if self.instance and self.instance.pk:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise ValidationError(f"Ya existe un docente registrado con el Legajo {legajo}.")
        return legajo

    def clean_sexo(self):
        sexo = self.cleaned_data.get("sexo")
        if not sexo:
            if self.instance and self.instance.pk and self.instance.sexo:
                return self.instance.sexo
            return "M"
        return sexo

    def clean_max_horas_semanales(self):
        hs = self.cleaned_data.get("max_horas_semanales")
        if hs is None or hs == "":
            if self.instance and self.instance.pk and self.instance.max_horas_semanales:
                return self.instance.max_horas_semanales
            return 30
        try:
            val = int(hs)
            if val <= 0:
                raise ValidationError("El tope máximo semanal debe ser un número entero positivo.")
            return val
        except (ValueError, TypeError):
            raise ValidationError("El tope de horas debe ser un número entero válido.")


class DesignacionForm(forms.ModelForm):
    dia_semana = forms.ChoiceField(
        choices=[("", "-- Sin definir (especificado en franjas) --")] + list(Designacion.DIAS_SEMANA),
        required=False,
        widget=forms.Select(attrs={"class": "form-select"})
    )
    hora_inicio = forms.CharField(
        max_length=10,
        required=False,
        widget=forms.TextInput(attrs={"class": "form-control", "placeholder": "18:30"})
    )
    hora_fin = forms.CharField(
        max_length=10,
        required=False,
        widget=forms.TextInput(attrs={"class": "form-control", "placeholder": "21:00"})
    )
    horas_catedra = forms.IntegerField(
        required=False,
        widget=forms.NumberInput(attrs={"class": "form-control", "min": 1, "max": 10})
    )

    class Meta:
        model = Designacion
        fields = [
            "agente", "materia", "cargo_codigo", "situacion_revista",
            "instrumento_legal", "vigencia_desde", "vigencia_hasta",
            "activo", "observaciones",
            "dia_semana", "hora_inicio", "hora_fin", "horas_catedra"
        ]
        widgets = {
            "agente": forms.Select(attrs={"class": "form-select", "id": "id_agente"}),
            "materia": forms.Select(attrs={"class": "form-select", "id": "id_materia"}),
            "cargo_codigo": forms.TextInput(attrs={"class": "form-control", "placeholder": "Cátedra / Horas Cátedra"}),
            "situacion_revista": forms.Select(attrs={"class": "form-select", "id": "id_situacion_revista", "onchange": "actualizarVisibilidadSuplencia()"}),
            "instrumento_legal": forms.TextInput(attrs={"class": "form-control", "placeholder": "Res. N° ... / Disp. N° ..."}),
            "vigencia_desde": forms.TextInput(attrs={"class": "form-control", "value": "SIN INICIO"}),
            "vigencia_hasta": forms.TextInput(attrs={"class": "form-control", "value": "SIN TERMINO"}),
            "activo": forms.CheckboxInput(attrs={"class": "form-check-input"}),
            "observaciones": forms.Textarea(attrs={"class": "form-control", "rows": 2}),
        }

    def clean(self):
        cleaned_data = super().clean()
        agente = cleaned_data.get("agente")
        horas = cleaned_data.get("horas_catedra") or 0
        activo = cleaned_data.get("activo")

        if agente and activo and horas > 0:
            excluir_id = self.instance.pk if self.instance and self.instance.pk else None
            valido, msg = agente.validar_tope_horas(nuevas_horas=horas, excluir_designacion_id=excluir_id)
            if not valido:
                raise ValidationError(msg)
        return cleaned_data


class HorarioDesignacionForm(forms.ModelForm):
    class Meta:
        model = HorarioDesignacion
        fields = ["dia_semana", "hora_inicio", "hora_fin", "horas_catedra", "activo"]
        widgets = {
            "dia_semana": forms.Select(attrs={"class": "form-select form-select-sm"}),
            "hora_inicio": forms.TimeInput(attrs={"class": "form-control form-control-sm", "type": "time"}),
            "hora_fin": forms.TimeInput(attrs={"class": "form-control form-control-sm", "type": "time"}),
            "horas_catedra": forms.NumberInput(attrs={"class": "form-control form-control-sm text-center", "min": 1, "max": 10}),
            "activo": forms.CheckboxInput(attrs={"class": "form-check-input"}),
        }

    def clean(self):
        cleaned_data = super().clean()
        hi = cleaned_data.get("hora_inicio")
        hf = cleaned_data.get("hora_fin")
        horas = cleaned_data.get("horas_catedra")
        is_delete = cleaned_data.get("DELETE", False)

        if not is_delete:
            if hi and hf and hf <= hi:
                raise ValidationError("La hora de fin debe ser posterior a la hora de inicio.")
            if horas is not None and horas <= 0:
                raise ValidationError("Las horas cátedra deben ser un número positivo mayor a cero.")
        return cleaned_data


class BaseHorarioFormSet(forms.BaseInlineFormSet):
    def clean(self):
        super().clean()
        if any(self.errors):
            return

        horarios_activos = []
        for form in self.forms:
            if not form.cleaned_data or form.cleaned_data.get("DELETE", False):
                continue
            if form.cleaned_data.get("activo", True):
                horarios_activos.append(form.cleaned_data)

        # Validar superposición interna entre franjas
        valido, msg = HorarioService.validar_superposicion_franjas(horarios_activos)
        if not valido:
            raise ValidationError(msg)


HorarioFormSet = forms.inlineformset_factory(
    Designacion,
    HorarioDesignacion,
    form=HorarioDesignacionForm,
    formset=BaseHorarioFormSet,
    extra=1,
    can_delete=True
)


class SuplenciaForm(forms.ModelForm):
    class Meta:
        model = Suplencia
        fields = [
            "designacion_cubierta", "motivo", "fecha_desde", "fecha_hasta",
            "instrumento_legal", "observaciones", "activo"
        ]
        widgets = {
            "designacion_cubierta": forms.Select(attrs={"class": "form-select", "id": "id_designacion_cubierta"}),
            "motivo": forms.Select(attrs={"class": "form-select", "id": "id_suplencia_motivo", "onchange": "actualizarMotivoSuplencia()"}),
            "fecha_desde": forms.DateInput(attrs={"class": "form-control", "type": "date"}),
            "fecha_hasta": forms.DateInput(attrs={"class": "form-control", "type": "date"}),
            "instrumento_legal": forms.TextInput(attrs={"class": "form-control", "placeholder": "Disp. N° ... / Res. N° ..."}),
            "observaciones": forms.Textarea(attrs={"class": "form-control", "rows": 2}),
            "activo": forms.CheckboxInput(attrs={"class": "form-check-input"}),
        }

    def __init__(self, *args, **kwargs):
        materia_id = kwargs.pop("materia_id", None)
        excluir_agente_id = kwargs.pop("excluir_agente_id", None)
        super().__init__(*args, **kwargs)
        self.fields["designacion_cubierta"].required = False
        qs = Designacion.objects.filter(activo=True, situacion_revista__in=["TIT", "INT"]).select_related("agente", "materia")
        if materia_id:
            qs = qs.filter(materia_id=materia_id)
        if excluir_agente_id:
            qs = qs.exclude(agente_id=excluir_agente_id)
        self.fields["designacion_cubierta"].queryset = qs


class AsignarSuplenciaForm(forms.Form):
    docente_suplente = forms.ModelChoiceField(
        queryset=Agente.objects.filter(activo=True).order_by("apellido", "nombre"),
        label="Docente Suplente (Personal Activo)",
        empty_label="-- Seleccionar Docente que Asumirá la Suplencia --",
        widget=forms.Select(attrs={
            "class": "form-select fw-semibold",
            "id": "id_docente_suplente",
            "onchange": "actualizarPreviewSuplencia()"
        })
    )
    designacion_cubierta = forms.ModelChoiceField(
        queryset=Designacion.objects.filter(
            activo=True,
            situacion_revista__in=["TIT", "INT"]
        ).select_related("agente", "materia", "materia__carrera").prefetch_related("horarios").order_by("agente__apellido", "materia__nombre"),
        label="Cátedra / Docente a Suplantar (Titular o Interino)",
        empty_label="-- Seleccionar Cátedra Activa a Cubrir --",
        widget=forms.Select(attrs={
            "class": "form-select fw-semibold",
            "id": "id_designacion_cubierta",
            "onchange": "actualizarPreviewSuplencia()"
        })
    )
    motivo = forms.ChoiceField(
        choices=Suplencia.MOTIVO_CHOICES,
        initial="LICENCIA",
        label="Causal o Motivo de la Cobertura",
        widget=forms.Select(attrs={"class": "form-select", "id": "id_motivo"})
    )
    fecha_desde = forms.DateField(
        initial=date.today,
        label="Fecha Desde (Inicio de Suplencia)",
        widget=forms.DateInput(attrs={"class": "form-control", "type": "date", "id": "id_fecha_desde"})
    )
    fecha_hasta = forms.DateField(
        required=False,
        label="Fecha Hasta (Fin de Suplencia)",
        widget=forms.DateInput(attrs={"class": "form-control", "type": "date", "id": "id_fecha_hasta"})
    )
    sin_termino = forms.BooleanField(
        required=False,
        initial=True,
        label="Sin término fijado (vigencia SIN TERMINO)",
        widget=forms.CheckboxInput(attrs={
            "class": "form-check-input",
            "id": "id_sin_termino",
            "onchange": "toggleFechaHasta()"
        })
    )
    instrumento_legal = forms.CharField(
        required=False,
        label="Instrumento Legal de Designación",
        widget=forms.TextInput(attrs={
            "class": "form-control",
            "placeholder": "Ej: Disp. N° 045/26 o Res. Ministerial N° 1022/26"
        })
    )
    observaciones = forms.CharField(
        required=False,
        label="Observaciones Institucionales",
        widget=forms.Textarea(attrs={
            "class": "form-control",
            "rows": 3,
            "placeholder": "Detalle administrativo de la cobertura, reemplazo o motivo pedagógico..."
        })
    )

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["designacion_cubierta"].label_from_instance = lambda obj: (
            f"{obj.agente.nombre_completo} (DNI: {obj.agente.dni}) · {obj.materia.nombre} "
            f"({obj.materia.carrera.codigo}) · {obj.resumen_horarios} ({obj.total_horas_semanales} hs) [{obj.situacion_revista}]"
        )
        self.fields["docente_suplente"].label_from_instance = lambda ag: (
            f"{ag.nombre_completo} (DNI: {ag.dni}) · {ag.horas_activas_semanales} hs activas / {ag.max_horas_semanales} hs tope"
        )

    def clean(self):
        cleaned_data = super().clean()
        docente_suplente = cleaned_data.get("docente_suplente")
        designacion_cubierta = cleaned_data.get("designacion_cubierta")
        fecha_desde = cleaned_data.get("fecha_desde")
        fecha_hasta = cleaned_data.get("fecha_hasta")
        sin_termino = cleaned_data.get("sin_termino")

        if not docente_suplente:
            self.add_error("docente_suplente", "Debe seleccionar el docente suplente.")
            return cleaned_data

        if not designacion_cubierta:
            self.add_error("designacion_cubierta", "Debe seleccionar la cátedra titular o interina a suplantar.")
            return cleaned_data

        # 1. Bloqueo de auto-suplencia (el docente suplente no puede ser el mismo de la designación suplantada)
        if docente_suplente.id == designacion_cubierta.agente_id:
            self.add_error(
                "docente_suplente",
                f"Incompatibilidad institucional: El docente {docente_suplente.nombre_completo} es el titular/interino de esta cátedra y no puede auto-suplirse."
            )

        # 2. Coherencia de fechas
        if not sin_termino and fecha_desde and fecha_hasta:
            if fecha_hasta < fecha_desde:
                self.add_error("fecha_hasta", "La fecha 'Hasta' no puede ser anterior a la fecha 'Desde'.")

        # 3. Validar tope de 30 hs semanales y superposición horaria
        franjas = []
        horarios_activos = designacion_cubierta.horarios.filter(activo=True)
        if horarios_activos.exists():
            for h in horarios_activos:
                franjas.append({
                    "dia_semana": h.dia_semana,
                    "hora_inicio": h.hora_inicio,
                    "hora_fin": h.hora_fin,
                    "horas_catedra": h.horas_catedra,
                })
            total_horas_cubiertas = sum(h.horas_catedra for h in horarios_activos)
        else:
            franjas.append({
                "dia_semana": designacion_cubierta.dia_semana,
                "hora_inicio": designacion_cubierta.hora_inicio or "18:30",
                "hora_fin": designacion_cubierta.hora_fin or "21:00",
                "horas_catedra": designacion_cubierta.horas_catedra or 0,
            })
            total_horas_cubiertas = designacion_cubierta.horas_catedra or 0

        # Validar tope de 30 hs semanales
        valido_tope, msg_tope = HorarioService.validar_tope_semanal(docente_suplente, total_horas_cubiertas)
        if not valido_tope:
            self.add_error("docente_suplente", msg_tope)

        # Validar no superposición horaria con otras cátedras activas del suplente
        valido_superp, msg_superp = HorarioService.validar_superposicion_franjas(franjas, docente=docente_suplente)
        if not valido_superp:
            self.add_error("designacion_cubierta", msg_superp)

        return cleaned_data


class CarreraForm(forms.ModelForm):
    class Meta:
        model = Carrera
        fields = ["codigo", "nombre", "resolucion", "duracion_anios", "activo"]
        widgets = {
            "codigo": forms.TextInput(attrs={"class": "form-control", "placeholder": "TEC-DS"}),
            "nombre": forms.TextInput(attrs={"class": "form-control"}),
            "resolucion": forms.TextInput(attrs={"class": "form-control", "placeholder": "Res. Ministerial N° ..."}),
            "duracion_anios": forms.NumberInput(attrs={"class": "form-control", "min": 1, "max": 10}),
            "activo": forms.CheckboxInput(attrs={"class": "form-check-input"}),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["duracion_anios"].required = False
        if not self.is_bound and (not self.instance or not self.instance.pk):
            self.initial.setdefault("duracion_anios", 3)
            self.initial.setdefault("activo", True)

    def clean_duracion_anios(self):
        val = self.cleaned_data.get("duracion_anios")
        if val is None or val == "":
            return 3
        try:
            num = int(val)
            if num <= 0:
                raise ValidationError("La duración en años debe ser un número positivo.")
            return num
        except (ValueError, TypeError):
            raise ValidationError("La duración en años debe ser un número entero.")


class MateriaForm(forms.ModelForm):
    class Meta:
        model = Materia
        fields = ["carrera", "codigo", "nombre", "anio_cursada", "horas_semanales", "activo"]
        widgets = {
            "carrera": forms.Select(attrs={"class": "form-select"}),
            "codigo": forms.TextInput(attrs={"class": "form-control", "placeholder": "MAT-01"}),
            "nombre": forms.TextInput(attrs={"class": "form-control"}),
            "anio_cursada": forms.NumberInput(attrs={"class": "form-control"}),
            "horas_semanales": forms.NumberInput(attrs={"class": "form-control"}),
            "activo": forms.CheckboxInput(attrs={"class": "form-check-input"}),
        }


class RecepcionFormularioFisicoForm(forms.Form):
    ESTADO_CHOICES = [
        ("LIC", "Licencia Médica o Especial (LIC)"),
        ("P", "Permiso Particular o Asunto Propio (P)"),
        ("LT", "Largo Tratamiento (LT)"),
    ]

    formulario_numero = forms.CharField(
        max_length=50,
        required=True,
        label="N° Formulario Físico / Certificado",
        widget=forms.TextInput(attrs={"class": "form-control", "placeholder": "Ej. F-1049/2026"})
    )
    estado = forms.ChoiceField(
        choices=ESTADO_CHOICES,
        initial="LIC",
        label="Conversión de Estado",
        widget=forms.Select(attrs={"class": "form-select", "id": "id_estado"})
    )
    tipo_licencia = forms.ModelChoiceField(
        queryset=TipoLicencia.objects.filter(activo=True).order_by("hoja", "articulo"),
        required=True,
        label="Artículo / Tipo de Licencia Normativo",
        widget=forms.Select(attrs={"class": "form-select", "id": "id_tipo_licencia"})
    )
    suplente = forms.ModelChoiceField(
        queryset=Agente.objects.filter(activo=True).order_by("apellido", "nombre"),
        required=False,
        label="Docente Suplente que Cubrirá la Cátedra",
        empty_label="-- Sin Suplente Designado / Cátedra sin cobertura --",
        widget=forms.Select(attrs={"class": "form-select", "id": "id_suplente"})
    )
    adjunto_certificado = forms.FileField(
        required=False,
        label="Adjuntar Certificado / Formulario Escaneado (PDF o Imagen)",
        widget=forms.ClearableFileInput(attrs={"class": "form-control"})
    )
    observaciones = forms.CharField(
        required=False,
        label="Observaciones Institucionales",
        widget=forms.Textarea(attrs={"class": "form-control", "rows": 3, "placeholder": "Motivo, diagnóstico o constancia de recepción..."})
    )
    fecha_desde = forms.DateField(
        required=False,
        label="Fecha Desde",
        widget=forms.DateInput(attrs={"type": "date", "class": "form-control"})
    )
    fecha_hasta = forms.DateField(
        required=False,
        label="Fecha Hasta",
        widget=forms.DateInput(attrs={"type": "date", "class": "form-control"})
    )
    formulario_original = forms.CharField(
        required=False,
        widget=forms.HiddenInput()
    )

    def __init__(self, *args, titular_agente=None, **kwargs):
        super().__init__(*args, **kwargs)
        self.titular_agente = titular_agente
        if titular_agente:
            self.fields["suplente"].queryset = Agente.objects.filter(activo=True).exclude(pk=titular_agente.pk).order_by("apellido", "nombre")

    def clean_suplente(self):
        suplente = self.cleaned_data.get("suplente")
        if suplente and self.titular_agente and suplente.pk == self.titular_agente.pk:
            raise ValidationError("Un docente no puede suplirse a sí mismo en su propia cátedra.")
        return suplente

    def clean(self):
        cleaned_data = super().clean()
        f_desde = cleaned_data.get("fecha_desde")
        f_hasta = cleaned_data.get("fecha_hasta")
        if f_desde and f_hasta and f_desde > f_hasta:
            self.add_error("fecha_hasta", "La fecha 'Desde' no puede ser posterior a la fecha 'Hasta'.")
        return cleaned_data


class ImportarCSVForm(forms.Form):
    EXTENSIONES_VALIDAS = {".csv", ".txt"}
    MAX_TAMANIO_BYTES = 5 * 1024 * 1024  # 5 MB

    archivo_csv = forms.FileField(
        label="Seleccionar Archivo CSV / TXT",
        widget=forms.ClearableFileInput(attrs={
            "class": "form-control",
            "accept": ".csv,.txt,text/csv,text/plain"
        })
    )

    def clean_archivo_csv(self):
        archivo = self.cleaned_data.get("archivo_csv")
        if not archivo:
            raise ValidationError("Debe seleccionar un archivo para importar.")

        nombre_archivo = archivo.name
        ext = os.path.splitext(nombre_archivo)[1].lower()

        if ext not in self.EXTENSIONES_VALIDAS:
            raise ValidationError(
                f"Extensión '{ext or 'sin extensión'}' no permitida. "
                f"Solo se admiten archivos estructurados .csv o .txt delimitados. "
                f"Archivos ejecutables, binarios o documentos (.exe, .pdf, .doc, .docx, .ppt, .pptx) son rechazados."
            )

        if archivo.size > self.MAX_TAMANIO_BYTES:
            max_mb = self.MAX_TAMANIO_BYTES / (1024 * 1024)
            actual_mb = archivo.size / (1024 * 1024)
            raise ValidationError(
                f"El archivo supera el tamaño máximo permitido de {max_mb:.0f} MB (tamaño actual: {actual_mb:.1f} MB)."
            )

        # Inspección rápida de los primeros bytes para detectar archivos binarios o bytes nulos (\x00)
        try:
            primer_chunk = archivo.read(2048)
            archivo.seek(0)
            if b"\x00" in primer_chunk:
                raise ValidationError(
                    "El archivo contiene caracteres binarios no permitidos (bytes nulos). "
                    "Asegúrese de subir un archivo de texto plano delimitado (.csv o .txt)."
                )
        except ValidationError:
            raise
        except Exception as e:
            archivo.seek(0)
            raise ValidationError(f"Error al verificar la estructura del archivo: {e}")

        return archivo
