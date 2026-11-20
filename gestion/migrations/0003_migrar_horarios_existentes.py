from django.db import migrations
from datetime import time

def migrar_horarios_existentes(apps, schema_editor):
    Designacion = apps.get_model('gestion', 'Designacion')
    HorarioDesignacion = apps.get_model('gestion', 'HorarioDesignacion')
    
    total_desigs = Designacion.objects.count()
    horarios_creados = 0
    
    for desig in Designacion.objects.all():
        def parse_hora(hora_str, default_time):
            if not hora_str:
                return default_time
            try:
                partes = str(hora_str).strip().split(":")
                return time(int(partes[0]), int(partes[1]))
            except Exception:
                return default_time

        hi = parse_hora(desig.hora_inicio, time(18, 30))
        hf = parse_hora(desig.hora_fin, time(21, 0))
        dia = desig.dia_semana or "Lunes"
        hs = desig.horas_catedra or 4

        HorarioDesignacion.objects.create(
            designacion=desig,
            dia_semana=dia,
            hora_inicio=hi,
            hora_fin=hf,
            horas_catedra=hs,
            activo=desig.activo
        )
        horarios_creados += 1

    print(f"\n[MIGRACION DATOS] Designaciones existentes: {total_desigs} | Franjas de horario creadas: {horarios_creados}")
    assert total_desigs == horarios_creados, f"Error de paridad: {total_desigs} designaciones vs {horarios_creados} franjas."

def revertir_migracion_horarios(apps, schema_editor):
    HorarioDesignacion = apps.get_model('gestion', 'HorarioDesignacion')
    HorarioDesignacion.objects.all().delete()

class Migration(migrations.Migration):
    dependencies = [
        ('gestion', '0002_add_horario_and_suplencia'),
    ]

    operations = [
        migrations.RunPython(migrar_horarios_existentes, revertir_migracion_horarios),
    ]
