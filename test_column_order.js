/**
 * Test de Mapeo y Orden de Columnas en Carga Masiva y Planta Docente
 */
const assert = require('assert');
const { getDatabase, closeDatabase } = require('./src/database/db');
const { CsvImportService } = require('./src/services/csvImportService');
const { TeacherService } = require('./src/services/teacherService');

console.log('========================================================');
console.log('   TEST: MAPEO Y ORDEN DE COLUMNAS EN SIGET             ');
console.log('========================================================\n');

// 1. Verificar registros en base de datos siget.db
const db = getDatabase();
const teachers = TeacherService.getAll();

console.log(`1. Verificando orden alfabético y normalización en la tabla (${teachers.length} docentes):`);
teachers.forEach((t, i) => {
    console.log(`   [${i + 1}] Legajo: "${t.legajo}" | Docente: "${t.fullName}" | DNI: "${t.dni}"`);
    // Ningún docente debe tener un apellido puramente numérico
    assert(!/^\d+$/.test(t.lastName.trim()), `Docente ID ${t.id} no debe tener apellido numérico: "${t.lastName}"`);
    // Ningún docente debe tener un nombre numérico
    assert(!/^\d+$/.test(t.firstName.trim()), `Docente ID ${t.id} no debe tener nombre numérico: "${t.firstName}"`);
    // El legajo no debe ser un nombre de pila con letras y espacios sin dígitos
    assert(!(!/\d/.test(t.legajo) && t.legajo.includes(' ')), `Legajo no debe ser un nombre con espacios: "${t.legajo}"`);
});

// Verificar que la lista está ordenada alfabéticamente por apellido (collate nocase)
for (let i = 0; i < teachers.length - 1; i++) {
    const cmp = teachers[i].lastName.localeCompare(teachers[i + 1].lastName, 'es', { sensitivity: 'base' });
    assert(cmp <= 0, `Orden alfabético violado entre "${teachers[i].lastName}" y "${teachers[i + 1].lastName}"`);
}
console.log('   ✅ [PASS] Todos los docentes están ordenados alfabéticamente y sin campos desfasados.\n');

// 2. Probar parser con diferentes formatos sin encabezados (datos directos)
console.log('2. Probando parser con datos directos sin encabezados:');

// Caso A: DNI ; Legajo ; Apellido ; Nombre
const csvDirectA = `40111222;15001;Alvarez;Mariana;Titular
40222333;15002;Benitez;Roberto;Provisional`;

const prevA = CsvImportService.previewPersonnel(csvDirectA);
assert.strictEqual(prevA.success, true);
assert.strictEqual(prevA.validRows, 2);
assert.strictEqual(prevA.preview[0].legajo, '15001');
assert.strictEqual(prevA.preview[0].apellido, 'Alvarez');
assert.strictEqual(prevA.preview[0].nombre, 'Mariana');
assert.strictEqual(prevA.preview[0].fullName, 'Alvarez, Mariana');
console.log('   ✅ [PASS] Caso A (DNI; Legajo; Apellido; Nombre): Mapeo exacto verificado.');

// Caso B: DNI ; Apellido ; Nombre ; Legajo
const csvDirectB = `40333444;Castro;Patricia;15003;Titular`;
const prevB = CsvImportService.previewPersonnel(csvDirectB);
assert.strictEqual(prevB.success, true);
assert.strictEqual(prevB.validRows, 1);
assert.strictEqual(prevB.preview[0].legajo, '15003');
assert.strictEqual(prevB.preview[0].apellido, 'Castro');
assert.strictEqual(prevB.preview[0].nombre, 'Patricia');
assert.strictEqual(prevB.preview[0].fullName, 'Castro, Patricia');
console.log('   ✅ [PASS] Caso B (DNI; Apellido; Nombre; Legajo): Detección semántica de legajo numérico OK.');

// Caso C: DNI ; "Apellido, Nombre" ; Legajo
const csvDirectC = `40444555;"Diaz, Sebastian";15004;Titular`;
const prevC = CsvImportService.previewPersonnel(csvDirectC);
assert.strictEqual(prevC.success, true);
assert.strictEqual(prevC.validRows, 1);
assert.strictEqual(prevC.preview[0].legajo, '15004');
assert.strictEqual(prevC.preview[0].apellido, 'Diaz');
assert.strictEqual(prevC.preview[0].nombre, 'Sebastian');
assert.strictEqual(prevC.preview[0].fullName, 'Diaz, Sebastian');
console.log('   ✅ [PASS] Caso C (DNI; "Apellido, Nombre"; Legajo): Desglose y reasignación correcta.');

// Caso D: Encabezados explícitos institucionales
const csvDirectD = `DNI;Legajo;Apellido;Nombre;Revista;Horas;Catedra;Carrera;Dia;Horario;Resolucion
40555666;15005;Echeverria;Valeria;Titular;4;Física II;PES;Lunes;18:00 a 20:00;Disp. 301/2026`;
const prevD = CsvImportService.previewPersonnel(csvDirectD);
assert.strictEqual(prevD.success, true);
assert.strictEqual(prevD.validRows, 1);
assert.strictEqual(prevD.preview[0].legajo, '15005');
assert.strictEqual(prevD.preview[0].apellido, 'Echeverria');
assert.strictEqual(prevD.preview[0].nombre, 'Valeria');
console.log('   ✅ [PASS] Caso D (Encabezados explícitos): Mapeo verificado.');

// Caso E: Intento de desfasaje donde apellido trae un número
const csvCorrupt = `DNI;Apellido;Nombre;Revista
40666777;12099;Guzman;Titular`;
const prevE = CsvImportService.previewPersonnel(csvCorrupt);
assert.strictEqual(prevE.success, true);
// El número debe ser re-enrutado a legajo y no quedar como apellido
assert.strictEqual(prevE.preview[0].legajo, '12099');
assert.strictEqual(prevE.preview[0].apellido, 'Guzman');
console.log('   ✅ [PASS] Caso E (Protección estricta): Sanity check re-enruta números al legajo.');

console.log('\n========================================================');
console.log('   TODAS LAS PRUEBAS DE MAPEO Y ORDEN PASARON CON ÉXITO ');
console.log('========================================================');
closeDatabase();
