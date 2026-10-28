import sys
from pathlib import Path
BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from database.config import load_config
from database.connection import init_db, get_db_session
from database.schema import User, Teacher, Subject, Designation, Substitution, Student
from models.auth import AuthService, CurrentSession
from models.validation import BusinessValidationService
from models.reports import ReportService

def test_full_system():
    print("=== TEST 1: Inicialización de Base de Datos y Semillas ===")
    cfg = load_config()
    init_db(cfg)
    session = get_db_session()
    
    user_count = session.query(User).count()
    teacher_count = session.query(Teacher).count()
    subject_count = session.query(Subject).count()
    student_count = session.query(Student).count()
    desig_count = session.query(Designation).count()
    subst_count = session.query(Substitution).count()
    
    print(f"Usuarios: {user_count}, Docentes: {teacher_count}, Materias: {subject_count}")
    print(f"Alumnos: {student_count}, Designaciones: {desig_count}, Suplencias: {subst_count}")
    assert user_count >= 2, "Faltan usuarios iniciales"
    assert teacher_count >= 4, "Faltan docentes iniciales"
    print(">> Base de Datos OK\n")

    print("=== TEST 2: Autenticación y Roles con Bcrypt ===")
    # Login exitoso Rector
    ok, res = AuthService.login("rector", "rector123")
    assert ok, f"Error login rector: {res}"
    assert CurrentSession.is_rector(), "Rol no coincide con RECTOR"
    print(f">> Login Rector OK: {res.full_name} ({res.role})")
    AuthService.logout()

    # Login exitoso Bedel
    ok, res = AuthService.login("bedel", "bedel123")
    assert ok, f"Error login bedel: {res}"
    assert CurrentSession.is_bedel(), "Rol no coincide con BEDEL"
    print(f">> Login Bedel OK: {res.full_name} ({res.role})")
    AuthService.logout()

    # Login fallido credencial incorrecta
    ok, res = AuthService.login("rector", "password_invalida")
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

    session.close()
    print("==================================================")
    print("[OK] TODOS LOS TESTS Y VALIDACIONES PASARON EXITOSAMENTE")
    print("==================================================")

if __name__ == "__main__":
    test_full_system()
