import sys
from pathlib import Path
BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from database.config import load_config
from database.connection import init_db, get_db_session
from database.schema import User, Teacher, Subject, Designation, Substitution, Attendance
from models.auth import AuthService, CurrentSession
from models.validation import BusinessValidationService
from models.reports import ReportService
from models.csv_import import CsvImportServicePy
from models.calendar_service import TeacherCalendarServicePy

def test_full_system():
    print("=== TEST 1: Inicialización de Base de Datos y Semillas ===")
    cfg = load_config()
    init_db(cfg)
    session = get_db_session()
    
    user_count = session.query(User).count()
    teacher_count = session.query(Teacher).count()
    subject_count = session.query(Subject).count()
    att_count = session.query(Attendance).count()
    desig_count = session.query(Designation).count()
    subst_count = session.query(Substitution).count()
    
    print(f"Usuarios: {user_count}, Docentes: {teacher_count}, Materias: {subject_count}")
    print(f"Asistencias: {att_count}, Designaciones: {desig_count}, Suplencias: {subst_count}")
    assert user_count >= 2, "Faltan usuarios iniciales"
    assert teacher_count >= 4, "Faltan docentes iniciales"
    print(">> Base de Datos OK\n")

    print("=== TEST 2: Autenticación y Roles con Bcrypt (Secretaría y Bedel) ===")
    # Login exitoso Secretaría
    ok, res = AuthService.login("secretaria", "secretaria123")
    assert ok, f"Error login secretaria: {res}"
    assert CurrentSession.is_secretaria(), "Rol no coincide con SECRETARIA"
    print(f">> Login Secretaría OK: {res.full_name} ({res.role})")
    AuthService.logout()

    # Login exitoso Bedel
    ok, res = AuthService.login("bedel", "bedel123")
    assert ok, f"Error login bedel: {res}"
    assert CurrentSession.is_bedel(), "Rol no coincide con BEDEL"
    print(f">> Login Bedel OK: {res.full_name} ({res.role})")
    AuthService.logout()

    # Login fallido credencial incorrecta
    ok, res = AuthService.login("secretaria", "password_invalida")
    assert not ok, "Login debería haber fallado con contraseña inválida"
    print(f">> Login Rechazado correctamente: {res}\n")

    print("=== TEST 3: Validación de Reglas Críticas de Negocio ===")
    t1 = session.query(Teacher).filter(Teacher.legajo == "DOC-00101").first()
    assert t1 is not None

    # Test 3.1: Validación de Tope de Horas Cátedra (max 30 hs)
    # t1 ya tiene 5 hs asignadas. Si intentamos asignarle 26 hs más (5 + 26 = 31 hs > 30 hs tope)
    is_valid, curr, max_h, msg = BusinessValidationService.validate_hours_cap(
        teacher_id=t1.id,
        new_hours=26,
        session=session
    )
    assert not is_valid, "Debería haber rechazado la designación por superar el tope de 30 horas"
    print(f">> Rechazo por exceso de horas verificado: {msg.splitlines()[0]}")

    # Test 3.2: Asignación válida dentro del tope (ej. 4 hs -> 5 + 4 = 9 hs <= 30 hs)
    is_valid, curr, max_h, msg = BusinessValidationService.validate_hours_cap(
        teacher_id=t1.id,
        new_hours=4,
        session=session
    )
    assert is_valid, "Debería haber aceptado 4 horas"
    print(f">> Aprobación de horas válida verificada: {msg}")

    # Test 3.3: Superposición Horaria
    t1_desig = next((d for d in t1.designations if d.is_active), None)
    test_day = t1_desig.day_of_week if t1_desig else "Lunes"
    # Intento 1 con conflicto de horario
    is_time_ok, time_msg = BusinessValidationService.validate_schedule_compatibility(
        teacher_id=t1.id,
        day_of_week=test_day,
        start_time="19:00",
        end_time="21:00",
        session=session
    )
    assert not is_time_ok, f"Debería haber detectado superposición horaria los {test_day}"
    print(f">> Detección de incompatibilidad horaria OK: {time_msg.splitlines()[0]}")

    # Intento 2 sin conflicto: Domingo o franja horaria matutina distinta
    is_time_ok, time_msg = BusinessValidationService.validate_schedule_compatibility(
        teacher_id=t1.id,
        day_of_week=test_day,
        start_time="08:00",
        end_time="11:00",
        session=session
    )
    assert is_time_ok, "Horario sin superposición debería ser válido"
    print(f">> Compatibilidad horaria aprobada: {time_msg}\n")


    print("=== TEST 4: Generación de Planilla Oficial Excel con openpyxl y pandas ===")
    excel_path = ReportService.generate_monthly_statistics_excel(month=10, year=2026)
    assert Path(excel_path).exists(), "El archivo Excel no fue creado"
    print(f">> Planilla Excel generada exitosamente en: {excel_path}\n")

    print("=== TEST 5: Carga Masiva por Archivos CSV (Personal y Asistencias) ===")
    sample_csv_personnel = (
        "DNI;Legajo;Apellido;Nombre;Revista;Horas;Catedra;Carrera;Dia;Horario;Resolucion\n"
        "28111222;LEG-8001;HERRERA;Carlos Alberto;Titular;4;Algoritmos I;Tecnicatura;Martes;18:00 a 20:00;Disp. 101/2026\n"
        "29333444;LEG-8002;ROMERO;Luciana;Provisional;4;Física I;PES;Miércoles;19:00 a 21:00;Disp. 102/2026\n"
    )
    prev_pers = CsvImportServicePy.preview_personnel(sample_csv_personnel)
    assert prev_pers["success"], f"Error preview personal: {prev_pers}"
    assert prev_pers["valid_rows"] == 2, f"Deben ser 2 filas válidas: {prev_pers}"
    print(f">> Previsualización CSV Personal OK: {prev_pers['valid_rows']} válidos, {prev_pers['invalid_rows']} observados")

    imp_pers = CsvImportServicePy.import_personnel(sample_csv_personnel)
    assert imp_pers["success"], f"Error import personal: {imp_pers}"
    print(f">> Importación CSV Personal OK: {imp_pers['message']}")

    # Importación CSV de Asistencias para docente recién importado
    sample_csv_att = (
        "DNI,Fecha,Estado,Horas,Observaciones\n"
        "28111222,2026-07-02,PR,4,Presente normal\n"
        "28111222,2026-07-03,I,4,Inasistencia injustificada\n"
        "28111222,2026-07-04,P,4,Art. 115 permiso\n"
    )
    prev_att = CsvImportServicePy.preview_attendance(sample_csv_att)
    assert prev_att["success"], f"Error preview asistencias: {prev_att}"
    assert prev_att["valid_rows"] == 3, f"Deben ser 3 filas válidas: {prev_att}"
    print(f">> Previsualización CSV Asistencias OK: {prev_att['valid_rows']} válidos")

    imp_att = CsvImportServicePy.import_attendance(sample_csv_att)
    assert imp_att["success"], f"Error import asistencias: {imp_att}"
    print(f">> Importación CSV Asistencias OK: {imp_att['message']}\n")

    print("=== TEST 6: Módulo de Calendario de Docentes (Licencias y Suplencias) ===")
    t_imported = session.query(Teacher).filter(Teacher.dni == "28111222").first()
    assert t_imported is not None, "Docente importado debe existir en la BD"
    timeline = TeacherCalendarServicePy.get_teacher_timeline(t_imported.id, "2026-07-01", "2026-07-31")
    assert timeline["success"], f"Error timeline: {timeline}"
    assert len(timeline["events"]) == 3, f"Deben existir 3 eventos en julio: {len(timeline['events'])}"
    assert timeline["annualMetrics"]["inasistencias"]["count"] >= 1, "Debe registrar al menos 1 inasistencia acumulada"
    assert timeline["annualMetrics"]["permisos"]["count"] >= 1, "Debe registrar al menos 1 permiso acumulado"
    print(f">> Calendario Docente OK: {timeline['teacher']['fullName']} - Horas: {timeline['teacher']['activeHours']}/30 hs - Estado: {timeline['teacher']['availabilityStatus']}")
    print(f">> Métricas acumuladas: Faltas={timeline['annualMetrics']['inasistencias']['count']}/5, Permisos={timeline['annualMetrics']['permisos']['count']}/6\n")

    session.close()
    print("==================================================")
    print("[OK] TODOS LOS TESTS Y VALIDACIONES PASARON EXITOSAMENTE")
    print("==================================================")

if __name__ == "__main__":
    test_full_system()
