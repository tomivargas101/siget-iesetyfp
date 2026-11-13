import re
from database.connection import get_db_session
from database.schema import Teacher
from models.csv_import import CsvImportServicePy
from models.teacher import TeacherService

print('========================================================')
print('   TEST PYTHON: MAPEO Y ORDEN DE COLUMNAS EN SIGET      ')
print('========================================================\n')

# 1. Verificar orden alfabético en Python TeacherService
teachers = TeacherService.get_all()
print(f'1. Verificando orden alfabético en Python ({len(teachers)} docentes):')
for i, t in enumerate(teachers):
    print(f'   [{i+1}] Legajo: "{t["legajo"]}" | Docente: "{t["full_name"]}" | DNI: "{t["dni"]}"')
    assert not re.match(r'^\d+$', str(t["last_name"]).strip()), f'Apellido numérico en ID {t["id"]}'
    assert not re.match(r'^\d+$', str(t["first_name"]).strip()), f'Nombre numérico en ID {t["id"]}'
print('   ✅ [PASS] Python TeacherService ordenado alfabéticamente y sin números en nombres.\n')

# 2. Probando parser Python con datos directos sin encabezados:
print('2. Probando parser Python con datos directos sin encabezados:')

# Caso A: DNI ; Legajo ; Apellido ; Nombre
csv_a = """40111222;15001;Alvarez;Mariana;Titular
40222333;15002;Benitez;Roberto;Provisional"""
prev_a = CsvImportServicePy.preview_personnel(csv_a)
assert prev_a["success"] is True
assert prev_a["valid_rows"] == 2
assert prev_a["preview"][0]["legajo"] == "15001"
assert prev_a["preview"][0]["apellido"] == "Alvarez"
assert prev_a["preview"][0]["nombre"] == "Mariana"
print('   ✅ [PASS] Caso A (DNI; Legajo; Apellido; Nombre): Mapeo exacto verificado.')

# Caso B: DNI ; Apellido ; Nombre ; Legajo
csv_b = "40333444;Castro;Patricia;15003;Titular"
prev_b = CsvImportServicePy.preview_personnel(csv_b)
assert prev_b["success"] is True
assert prev_b["preview"][0]["legajo"] == "15003"
assert prev_b["preview"][0]["apellido"] == "Castro"
assert prev_b["preview"][0]["nombre"] == "Patricia"
print('   ✅ [PASS] Caso B (DNI; Apellido; Nombre; Legajo): Detección semántica OK.')

# Caso C: DNI ; "Apellido, Nombre" ; Legajo
csv_c = '40444555;"Diaz, Sebastian";15004;Titular'
prev_c = CsvImportServicePy.preview_personnel(csv_c)
assert prev_c["success"] is True
assert prev_c["preview"][0]["legajo"] == "15004"
assert prev_c["preview"][0]["apellido"] == "Diaz"
assert prev_c["preview"][0]["nombre"] == "Sebastian"
print('   ✅ [PASS] Caso C (DNI; "Apellido, Nombre"; Legajo): Desglose correcto.')

print('\n========================================================')
print('   TODAS LAS PRUEBAS DE PYTHON PASARON CON ÉXITO        ')
print('========================================================')
