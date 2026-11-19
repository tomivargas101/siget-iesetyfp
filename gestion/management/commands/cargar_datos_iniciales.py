from django.core.management.base import BaseCommand
from django.contrib.auth.models import User, Group, Permission
from datetime import date, timedelta
from gestion.models import (
    Carrera, Materia, Agente, Designacion, TipoLicencia, Feriado, NovedadAsistencia, Auditoria
)

MASTER_LICENSES = [
    # Hoja 1: Enfermedad Corto Tratamiento -> IL-01
    {"hoja": 1, "hoja_nombre": "Hoja 1: Enfermedad Corto Tratamiento", "articulo": "Art. 114 a", "codigo": "114A", "nombre": "Afección Común / Corto Tratamiento de Salud", "cuadro_destino": "IL-01", "es_medica": True, "tope_anual_dias": 25},
    {"hoja": 1, "hoja_nombre": "Hoja 1: Enfermedad Corto Tratamiento", "articulo": "Art. 47", "codigo": "ART-47", "nombre": "Enfermedad Personal Común / Reposo Médico", "cuadro_destino": "IL-01", "es_medica": True, "tope_anual_dias": 30},
    {"hoja": 1, "hoja_nombre": "Hoja 1: Enfermedad Corto Tratamiento", "articulo": "Art. 114 c", "codigo": "114C", "nombre": "Atención Familiar Enfermo", "cuadro_destino": "IL-01", "es_medica": True, "tope_anual_dias": 20},
    # Hoja 2: Largo Tratamiento y ART -> IL-01
    {"hoja": 2, "hoja_nombre": "Hoja 2: Largo Tratamiento y ART", "articulo": "Art. 114 b", "codigo": "114B", "nombre": "Largo Tratamiento de Salud (LT)", "cuadro_destino": "IL-01", "es_medica": True, "tope_anual_dias": 730},
    {"hoja": 2, "hoja_nombre": "Hoja 2: Largo Tratamiento y ART", "articulo": "Art. 48", "codigo": "ART-48", "nombre": "Tratamiento Médico Prolongado / Junta Médica", "cuadro_destino": "IL-01", "es_medica": True, "tope_anual_dias": 730},
    {"hoja": 2, "hoja_nombre": "Hoja 2: Largo Tratamiento y ART", "articulo": "Art. 70", "codigo": "ART-70", "nombre": "Accidente de Trabajo / ART", "cuadro_destino": "IL-01", "es_medica": True, "tope_anual_dias": None},
    # Hoja 3: Inasistencias y Permisos -> IL-02
    {"hoja": 3, "hoja_nombre": "Hoja 3: Inasistencias y Permisos", "articulo": "Inasistencia Injustificada", "codigo": "I", "nombre": "Inasistencia sin Aviso / Injustificada", "cuadro_destino": "IL-02", "es_medica": False, "tope_anual_dias": 10},
    {"hoja": 3, "hoja_nombre": "Hoja 3: Inasistencias y Permisos", "articulo": "Inasistencia Justificada", "codigo": "IJ", "nombre": "Inasistencia Justificada con Aviso", "cuadro_destino": "IL-02", "es_medica": False, "tope_anual_dias": 10},
    {"hoja": 3, "hoja_nombre": "Hoja 3: Inasistencias y Permisos", "articulo": "Art. 115", "codigo": "115", "nombre": "Asuntos o Razones Particulares (P)", "cuadro_destino": "IL-02", "es_medica": False, "tope_anual_dias": 6},
    # Hoja 4: Maternidad y Familiares -> IL-02
    {"hoja": 4, "hoja_nombre": "Hoja 4: Maternidad y Familiares", "articulo": "Art. 114 d", "codigo": "114D", "nombre": "Maternidad / Embarazo", "cuadro_destino": "IL-02", "es_medica": False, "tope_anual_dias": 135},
    {"hoja": 4, "hoja_nombre": "Hoja 4: Maternidad y Familiares", "articulo": "Art. 114 e", "codigo": "114E", "nombre": "Nacimiento de Hijo / Paternidad", "cuadro_destino": "IL-02", "es_medica": False, "tope_anual_dias": 15},
    {"hoja": 4, "hoja_nombre": "Hoja 4: Maternidad y Familiares", "articulo": "Art. 114 f", "codigo": "114F", "nombre": "Adopción de Menores", "cuadro_destino": "IL-02", "es_medica": False, "tope_anual_dias": 90},
    # Hoja 5: Matrimonio y Duelo -> IL-02
    {"hoja": 5, "hoja_nombre": "Hoja 5: Matrimonio y Duelo", "articulo": "Art. 114 g", "codigo": "114G", "nombre": "Matrimonio del Agente", "cuadro_destino": "IL-02", "es_medica": False, "tope_anual_dias": 12},
    {"hoja": 5, "hoja_nombre": "Hoja 5: Matrimonio y Duelo", "articulo": "Art. 114 h", "codigo": "114H", "nombre": "Matrimonio de Hijo", "cuadro_destino": "IL-02", "es_medica": False, "tope_anual_dias": 2},
    {"hoja": 5, "hoja_nombre": "Hoja 5: Matrimonio y Duelo", "articulo": "Art. 114 i", "codigo": "114I", "nombre": "Fallecimiento Cónyuge, Padres o Hijos", "cuadro_destino": "IL-02", "es_medica": False, "tope_anual_dias": 5},
    {"hoja": 5, "hoja_nombre": "Hoja 5: Matrimonio y Duelo", "articulo": "Art. 114 j", "codigo": "114J", "nombre": "Fallecimiento Hermanos o Parientes Segundo Grado", "cuadro_destino": "IL-02", "es_medica": False, "tope_anual_dias": 3},
    # Hoja 6: Exámenes y Licencias Especiales -> IL-02
    {"hoja": 6, "hoja_nombre": "Hoja 6: Exámenes y Licencias Especiales", "articulo": "Art. 114 l", "codigo": "114L", "nombre": "Mesa de Examen / Estudio y Perfeccionamiento", "cuadro_destino": "IL-02", "es_medica": False, "tope_anual_dias": 28},
    {"hoja": 6, "hoja_nombre": "Hoja 6: Exámenes y Licencias Especiales", "articulo": "Art. 114 m", "codigo": "114M", "nombre": "Donación de Sangre", "cuadro_destino": "IL-02", "es_medica": False, "tope_anual_dias": 2},
    {"hoja": 6, "hoja_nombre": "Hoja 6: Exámenes y Licencias Especiales", "articulo": "Art. 114 n", "codigo": "114N", "nombre": "Actividad Gremial y Representación", "cuadro_destino": "IL-02", "es_medica": False, "tope_anual_dias": None},
    {"hoja": 6, "hoja_nombre": "Hoja 6: Exámenes y Licencias Especiales", "articulo": "Art. 114 o", "codigo": "114O", "nombre": "Razones Deportivas o Científicas", "cuadro_destino": "IL-02", "es_medica": False, "tope_anual_dias": 30},
]

class Command(BaseCommand):
    help = "Carga inicial de datos institucionales según Requerimientos v2.0 (IESETyFP)"

    def handle(self, *args, **options):
        self.stdout.write(self.style.NOTICE("=== Iniciando carga inicial de datos institucionales SIGET ==="))

        # 1. Usuarios del relevamiento (RF-19)
        usuarios_datos = [
            ("zaquino", "Zunilda", "Aquino", "zaquino@iesetyfp.edu.ar", "zaquino123", "Bedel Principal"),
            ("meduarte", "María Eva", "Duarte", "meduarte@iesetyfp.edu.ar", "meduarte123", "Secretaria Académica"),
            ("msosa", "Mirtha", "Sosa", "msosa@iesetyfp.edu.ar", "msosa123", "Subsecretaria"),
            ("admin", "Administrador", "SIGET", "admin@iesetyfp.edu.ar", "admin123", "Superusuario del Sistema"),
        ]

        for username, fname, lname, email, pwd, cargo in usuarios_datos:
            user, created = User.objects.get_or_create(
                username=username,
                defaults={
                    "first_name": fname,
                    "last_name": lname,
                    "email": email,
                    "is_staff": True,
                    "is_superuser": True
                }
            )
            if created:
                user.set_password(pwd)
                user.save()
                self.stdout.write(self.style.SUCCESS(f"  [+] Usuario creado: {username} ({cargo}) - Contraseña: {pwd}"))
            else:
                user.set_password(pwd)
                user.is_staff = True
                user.is_superuser = True
                user.save()
                self.stdout.write(self.style.WARNING(f"  [*] Usuario existente actualizado: {username}"))

        # 2. Catálogo Oficial de Tipos de Licencia (Hojas 1-6)
        c_lic = 0
        for lic in MASTER_LICENSES:
            obj, created = TipoLicencia.objects.update_or_create(
                codigo=lic["codigo"],
                defaults=lic
            )
            if created:
                c_lic += 1
        self.stdout.write(self.style.SUCCESS(f"  [+] Catálogo de Licencias (Hojas 1 a 6) configurado: {len(MASTER_LICENSES)} tipos de licencia."))

        # 3. Carreras Institucionales
        carreras_data = [
            ("TEC-DS", "Tecnicatura Superior en Desarrollo de Software", "Res. Ministerial N° 1953/19", 3),
            ("TEC-REDES", "Tecnicatura Superior en Redes y Telecomunicaciones", "Res. Ministerial N° 1024/20", 3),
        ]
        carreras_dict = {}
        for code, name, res, dur in carreras_data:
            c, _ = Carrera.objects.get_or_create(
                codigo=code,
                defaults={"nombre": name, "resolucion": res, "duracion_anios": dur, "activo": True}
            )
            carreras_dict[code] = c
        self.stdout.write(self.style.SUCCESS(f"  [+] Carreras institucionales cargadas: {len(carreras_dict)}."))

        # 4. Materias
        ds = carreras_dict["TEC-DS"]
        materias_data = [
            (ds, "MAT-01", "Programación I", 1, 5),
            (ds, "MAT-02", "Bases de Datos", 1, 4),
            (ds, "MAT-03", "Ingeniería de Software", 2, 4),
            (ds, "MAT-04", "Práctica Profesionalizante I", 2, 6),
            (ds, "MAT-05", "Arquitectura y Sistemas Operativos", 1, 4),
            (ds, "MAT-06", "Desarrollo Web y Móvil", 3, 5),
        ]
        materias_dict = {}
        for car, cod, nom, anio, hs in materias_data:
            m, _ = Materia.objects.get_or_create(
                codigo=cod,
                defaults={"carrera": car, "nombre": nom, "anio_cursada": anio, "horas_semanales": hs, "activo": True}
            )
            materias_dict[cod] = m
        self.stdout.write(self.style.SUCCESS(f"  [+] Espacios curriculares / materias cargadas: {len(materias_dict)}."))

        # 5. Agentes Docentes
        agentes_data = [
            ("28456123", "LEG-0101", "Duarte", "María Eva", "F", "27-28456123-4", "meduarte@iesetyfp.edu.ar", "3624-111222", "TIT", 30),
            ("31890456", "LEG-0102", "Gómez", "Pablo", "M", "20-31890456-8", "pgomez@iesetyfp.edu.ar", "3624-333444", "TIT", 30),
            ("25789123", "LEG-0103", "Herrera", "Carlos Alberto", "M", "20-25789123-2", "cherrera@iesetyfp.edu.ar", "3624-555666", "INT", 30),
            ("34123789", "LEG-0104", "Fernández", "Laura Beatriz", "F", "27-34123789-3", "lfernandez@iesetyfp.edu.ar", "3624-777888", "TIT", 30),
            ("29654987", "LEG-0105", "Pérez", "Juan Carlos", "M", "20-29654987-1", "jperez@iesetyfp.edu.ar", "3624-999000", "SUP", 30),
            ("04812345", "LEG-0106", "Benítez", "Norma Graciela", "F", "27-04812345-6", "nbenitez@iesetyfp.edu.ar", "3624-123789", "TIT", 30), # DNI con cero a la izquierda (RN-01)
        ]
        agentes_dict = {}
        for dni, leg, ape, nom, sex, cuil, mail, tel, rev, max_h in agentes_data:
            ag, _ = Agente.objects.get_or_create(
                dni=dni,
                defaults={
                    "legajo": leg, "apellido": ape, "nombre": nom, "sexo": sex,
                    "cuil": cuil, "email": mail, "telefono": tel,
                    "situacion_revista_defecto": rev, "max_horas_semanales": max_h, "activo": True
                }
            )
            agentes_dict[dni] = ag
        self.stdout.write(self.style.SUCCESS(f"  [+] Agentes docentes cargados: {len(agentes_dict)} (incluyendo DNI con cero a la izquierda RN-01)."))

        # 6. Designaciones de Cátedras
        designaciones_data = [
            (agentes_dict["28456123"], materias_dict["MAT-01"], "Lunes", "18:30", "22:00", 5, "TIT"),
            (agentes_dict["28456123"], materias_dict["MAT-02"], "Miércoles", "18:30", "21:30", 4, "TIT"),
            (agentes_dict["31890456"], materias_dict["MAT-03"], "Martes", "18:30", "21:30", 4, "TIT"),
            (agentes_dict["31890456"], materias_dict["MAT-04"], "Jueves", "18:30", "22:45", 6, "TIT"),
            (agentes_dict["25789123"], materias_dict["MAT-05"], "Miércoles", "18:30", "21:30", 4, "INT"),
            (agentes_dict["25789123"], materias_dict["MAT-06"], "Viernes", "18:30", "22:00", 5, "INT"),
            (agentes_dict["34123789"], materias_dict["MAT-02"], "Viernes", "18:30", "21:30", 4, "TIT"),
            (agentes_dict["04812345"], materias_dict["MAT-01"], "Jueves", "18:30", "22:00", 5, "TIT"),
        ]
        for ag, mat, dia, hi, hf, hs, rev in designaciones_data:
            Designacion.objects.get_or_create(
                agente=ag,
                materia=mat,
                dia_semana=dia,
                defaults={
                    "hora_inicio": hi, "hora_fin": hf, "horas_catedra": hs,
                    "situacion_revista": rev, "activo": True, "vigencia_desde": "SIN INICIO", "vigencia_hasta": "SIN TERMINO"
                }
            )
        self.stdout.write(self.style.SUCCESS("  [+] Designaciones horarias registradas."))

        # 7. Feriados Institucionales 2026
        feriados_data = [
            (date(2026, 10, 12), "Día del Respeto a la Diversidad Cultural", "FERIADO"),
            (date(2026, 10, 16), "Jornada Institucional y Evaluación Pedagógica", "JORNADA"),
            (date(2026, 11, 20), "Día de la Soberanía Nacional", "FERIADO"),
        ]
        for f_dia, desc, tip in feriados_data:
            Feriado.objects.get_or_create(fecha=f_dia, defaults={"descripcion": desc, "tipo": tip})
        self.stdout.write(self.style.SUCCESS("  [+] Calendario escolar y feriados 2026 configurados."))

        # 8. Novedades de Asistencia de prueba para Octubre 2026
        # Bloque médico: Duarte María Eva (Enfermedad Art. 114 a -> IL-01) del 21/10/2026 al 22/10/2026 con Formulario N° 8492
        lic_114a = TipoLicencia.objects.get(codigo="114A")
        suplente_perez = agentes_dict["29654987"]
        doc_duarte = agentes_dict["28456123"]

        NovedadAsistencia.objects.get_or_create(
            agente=doc_duarte, fecha=date(2026, 10, 21),
            defaults={
                "estado": "LIC", "formulario_numero": "F-8492/26",
                "tipo_licencia": lic_114a, "suplente": suplente_perez,
                "observaciones": "Certificado médico de reposo por 48 hs."
            }
        )
        NovedadAsistencia.objects.get_or_create(
            agente=doc_duarte, fecha=date(2026, 10, 22),
            defaults={
                "estado": "LIC", "formulario_numero": "F-8492/26",
                "tipo_licencia": lic_114a, "suplente": suplente_perez,
                "observaciones": "Continuidad certificado médico reposo."
            }
        )

        # Inasistencia simple: Herrera Carlos (Falta Injustificada I -> IL-02) el 21/10/2026
        lic_i = TipoLicencia.objects.get(codigo="I")
        doc_herrera = agentes_dict["25789123"]
        NovedadAsistencia.objects.get_or_create(
            agente=doc_herrera, fecha=date(2026, 10, 21),
            defaults={
                "estado": "I", "tipo_licencia": lic_i,
                "observaciones": "Ausente sin aviso en horario de cátedra."
            }
        )

        # Permiso particular: Gómez Pablo (Art. 115 P -> IL-02) el 20/10/2026 con Formulario N° 3120
        lic_115 = TipoLicencia.objects.get(codigo="115")
        doc_gomez = agentes_dict["31890456"]
        NovedadAsistencia.objects.get_or_create(
            agente=doc_gomez, fecha=date(2026, 10, 20),
            defaults={
                "estado": "P", "formulario_numero": "F-3120/26",
                "tipo_licencia": lic_115,
                "observaciones": "Razones particulares de urgencia familiar."
            }
        )

        Auditoria.objects.create(
            usuario=User.objects.filter(username="admin").first(),
            usuario_nombre="admin",
            accion="INICIALIZACION_SISTEMA",
            detalles="Carga inicial completa de catálogos, agentes, designaciones y novedades del relevamiento."
        )

        self.stdout.write(self.style.SUCCESS("=== ¡Carga inicial de datos completada exitosamente! ==="))
        self.stdout.write(self.style.NOTICE("Puede iniciar el servidor con: python manage.py runserver"))
