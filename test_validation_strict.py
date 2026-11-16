from database.connection import init_db, get_db_session
from models.validation import validate_dni, validate_cuil, validate_name, validate_legajo, validate_email
from models.teacher import TeacherService

def test_strict_validations():
    print("========================================================")
    print("   SUITE DE PRUEBAS DE VALIDACIÓN ESTRICTA PYTHON       ")
    print("========================================================")

    # 1. DNI
    val47, clean47, err47 = validate_dni("47")
    assert not val47, "DNI 47 debe fallar"
    assert "7 u 8 dígitos" in err47
    print(f"  [OK] Python DNI '47' rechazado: {err47}")

    val_ok, clean_ok, _ = validate_dni("28456123")
    assert val_ok and clean_ok == "28456123"
    print(f"  [OK] Python DNI '28456123' aceptado")

    # 2. CUIL
    val_cuil_bad, _, err_cuil = validate_cuil("20-284561-7", "28456123")
    assert not val_cuil_bad
    print(f"  [OK] Python CUIL incompleto rechazado: {err_cuil}")

    val_cuil_diff, _, err_diff = validate_cuil("20-99999999-7", "28456123")
    assert not val_cuil_diff
    print(f"  [OK] Python CUIL discrepante rechazado: {err_diff}")

    val_cuil_ok, clean_cuil, _ = validate_cuil("20284561237", "28456123")
    assert val_cuil_ok and clean_cuil == "20-28456123-7"
    print(f"  [OK] Python CUIL válido formateado: {clean_cuil}")

    # 3. Nombres
    val_gg, _, err_gg = validate_name("gg", "Apellido")
    assert not val_gg
    print(f"  [OK] Python Apellido 'gg' rechazado: {err_gg}")

    val_fs, _, err_fs = validate_name("fs", "Nombre")
    assert not val_fs
    print(f"  [OK] Python Nombre 'fs' rechazado: {err_fs}")

    val_valid_name, clean_name, _ = validate_name("María del Carmen", "Nombre")
    assert val_valid_name and clean_name == "María del Carmen"
    print(f"  [OK] Python Nombre compuesto aceptado: {clean_name}")

    # 4. TeacherService.save en Python
    init_db()
    save_res_47, msg_47 = TeacherService.save({
        "dni": "47",
        "legajo": "DOC-PY-47",
        "last_name": "Gómez",
        "first_name": "Carlos"
    })
    assert not save_res_47
    print(f"  [OK] Python TeacherService.save bloqueó DNI '47': {msg_47}")

    save_res_fs, msg_fs = TeacherService.save({
        "dni": "28123999",
        "legajo": "DOC-PY-FS",
        "last_name": "Gómez",
        "first_name": "fs"
    })
    assert not save_res_fs
    print(f"  [OK] Python TeacherService.save bloqueó nombre 'fs': {msg_fs}")

    print("========================================================")
    print("   TODAS LAS PRUEBAS DE VALIDACIÓN PYTHON PASARON")
    print("========================================================")

if __name__ == "__main__":
    test_strict_validations()
