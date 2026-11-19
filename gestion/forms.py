from django import forms
from django.core.exceptions import ValidationError
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

    def clean_dni(self):
        dni = str(self.cleaned_data.get("dni", "")).strip().replace(".", "").replace(" ", "")
        if not dni:
            raise ValidationError("El DNI es obligatorio y no puede quedar vacío.")
        qs = Agente.objects.filter(dni=dni)
        if self.instance and self.instance.pk:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise ValidationError(f"Ya existe un docente registrado con el DNI {dni}.")
        return dni


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


class CarreraForm(forms.ModelForm):
    class Meta:
        model = Carrera
        fields = ["codigo", "nombre", "resolucion", "duracion_anios", "activo"]
        widgets = {
            "codigo": forms.TextInput(attrs={"class": "form-control", "placeholder": "TEC-DS"}),
            "nombre": forms.TextInput(attrs={"class": "form-control"}),
            "resolucion": forms.TextInput(attrs={"class": "form-control"}),
            "duracion_anios": forms.NumberInput(attrs={"class": "form-control"}),
            "activo": forms.CheckboxInput(attrs={"class": "form-check-input"}),
        }


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


class ImportarCSVForm(forms.Form):
    archivo_csv = forms.FileField(
        label="Seleccionar Archivo CSV",
        widget=forms.ClearableFileInput(attrs={"class": "form-control", "accept": ".csv,.txt"})
    )
