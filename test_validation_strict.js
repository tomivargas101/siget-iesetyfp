const assert = require('assert');
const { ValidationService } = require('./src/services/validationService');
const { TeacherService } = require('./src/services/teacherService');
const { DesignationService } = require('./src/services/designationService');
const { UserService } = require('./src/services/userService');
const { AuthService } = require('./src/services/authService');
const { AttendanceService } = require('./src/services/attendanceService');
const { CsvImportService } = require('./src/services/csvImportService');

console.log('========================================================');
console.log('   SUITE DE PRUEBAS DE VALIDACIÓN ESTRICTA SIGET       ');
console.log('========================================================\n');

// 1. VALIDACIÓN DE DNI
console.log('1. Verificando validaciones estrictas de DNI:');
{
    // DNI incompleto "47"
    const res47 = ValidationService.validateDni('47');
    assert.strictEqual(res47.isValid, false, 'DNI "47" debe ser rechazado');
    assert(res47.message.includes('7 u 8 dígitos'), 'El mensaje debe indicar 7 u 8 dígitos');
    console.log(`   ✅ [PASS] DNI incompleto "47" rechazado: "${res47.message}"`);

    // DNI con caracteres alfabéticos
    const resAbc = ValidationService.validateDni('28abc123');
    assert.strictEqual(resAbc.isValid, false, 'DNI con letras debe ser rechazado');
    console.log(`   ✅ [PASS] DNI con letras rechazado: "${resAbc.message}"`);

    // DNI vacío o solo espacios
    const resEmpty = ValidationService.validateDni('   ');
    assert.strictEqual(resEmpty.isValid, false, 'DNI vacío debe ser rechazado');
    console.log(`   ✅ [PASS] DNI vacío rechazado: "${resEmpty.message}"`);

    // DNI válido estándar (8 dígitos)
    const res8 = ValidationService.validateDni('28456123');
    assert.strictEqual(res8.isValid, true, 'DNI de 8 dígitos debe ser válido');
    assert.strictEqual(res8.cleanDni, '28456123');
    console.log(`   ✅ [PASS] DNI válido estándar 28456123 aceptado`);

    // DNI formateado con puntos (se normaliza y acepta)
    const resDots = ValidationService.validateDni('28.456.123');
    assert.strictEqual(resDots.isValid, true, 'DNI con puntos debe limpiarse');
    assert.strictEqual(resDots.cleanDni, '28456123');
    console.log(`   ✅ [PASS] DNI con puntos "28.456.123" normalizado a "28456123"`);

    // DNI con cero a la izquierda (preserva ceros)
    const resZero = ValidationService.validateDni('08456123');
    assert.strictEqual(resZero.isValid, true);
    assert.strictEqual(resZero.cleanDni, '08456123');
    console.log(`   ✅ [PASS] DNI con cero inicial "08456123" preservado`);
}

// 2. VALIDACIÓN DE CUIL / CUIT
console.log('\n2. Verificando validaciones de CUIL / CUIT y coincidencia con DNI:');
{
    // CUIL incompleto
    const resCuilIncomplete = ValidationService.validateCuil('20-284561-7', '28456123');
    assert.strictEqual(resCuilIncomplete.isValid, false, 'CUIL incompleto debe ser rechazado');
    console.log(`   ✅ [PASS] CUIL incompleto rechazado: "${resCuilIncomplete.message}"`);

    // CUIL que no coincide con el DNI
    const resCuilMismatch = ValidationService.validateCuil('20-99999999-7', '28456123');
    assert.strictEqual(resCuilMismatch.isValid, false, 'CUIL discrepante con DNI debe ser rechazado');
    console.log(`   ✅ [PASS] CUIL discrepante con DNI rechazado: "${resCuilMismatch.message}"`);

    // CUIL válido coincidente con DNI
    const resCuilOk = ValidationService.validateCuil('20284561237', '28456123');
    assert.strictEqual(resCuilOk.isValid, true, 'CUIL válido debe ser aceptado');
    assert.strictEqual(resCuilOk.cleanCuil, '20-28456123-7');
    console.log(`   ✅ [PASS] CUIL válido "20284561237" formateado a "${resCuilOk.cleanCuil}"`);
}

// 3. VALIDACIÓN DE NOMBRES, APELLIDOS Y STRINGS ABSURDOS
console.log('\n3. Verificando validaciones de nombres y apellidos:');
{
    // Rechazo de cadena absurda "gg"
    const resGg = ValidationService.validatePersonName('gg', 'Apellido');
    assert.strictEqual(resGg.isValid, false, 'Cadena "gg" debe ser rechazada');
    console.log(`   ✅ [PASS] Cadena repetitiva "gg" rechazada: "${resGg.message}"`);

    // Rechazo de cadena sin vocales "fs"
    const resFs = ValidationService.validatePersonName('fs', 'Nombre');
    assert.strictEqual(resFs.isValid, false, 'Cadena "fs" debe ser rechazada');
    console.log(`   ✅ [PASS] Cadena sin vocales "fs" rechazada: "${resFs.message}"`);

    // Rechazo de números en nombres
    const resNum = ValidationService.validatePersonName('Juan Carlos 2', 'Nombre');
    assert.strictEqual(resNum.isValid, false, 'Nombre con números debe ser rechazado');
    console.log(`   ✅ [PASS] Nombre con números rechazado: "${resNum.message}"`);

    // Aceptación de nombres válidos con tildes y caracteres compuestos
    const resValidName = ValidationService.validatePersonName('María de los Ángeles', 'Nombre');
    assert.strictEqual(resValidName.isValid, true);
    console.log(`   ✅ [PASS] Nombre compuesto con acentos "${resValidName.cleanName}" aceptado`);
}

// 4. VALIDACIÓN DE EMAIL Y TELÉFONO
console.log('\n4. Verificando formato de Email y Teléfono:');
{
    const resEmailBad = ValidationService.validateEmail('no-es-un-email', false);
    assert.strictEqual(resEmailBad.isValid, false, 'Email inválido debe ser rechazado');
    console.log(`   ✅ [PASS] Email inválido rechazado: "${resEmailBad.message}"`);

    const resEmailOk = ValidationService.validateEmail('Profesor.Silva@instituto.edu.ar', false);
    assert.strictEqual(resEmailOk.isValid, true);
    assert.strictEqual(resEmailOk.cleanEmail, 'profesor.silva@instituto.edu.ar');
    console.log(`   ✅ [PASS] Email válido normalizado a minúsculas: "${resEmailOk.cleanEmail}"`);

    const resPhoneBad = ValidationService.validatePhone('123', false);
    assert.strictEqual(resPhoneBad.isValid, false);
    console.log(`   ✅ [PASS] Teléfono con menos de 6 dígitos rechazado: "${resPhoneBad.message}"`);
}

// 5. VALIDACIÓN DE HORARIOS Y FRANJAS HORARIAS
console.log('\n5. Verificando validaciones de horarios en Cátedras:');
{
    // Formato inválido "25:99"
    const resTimeBad = ValidationService.validateTime('25:99', 'Horario');
    assert.strictEqual(resTimeBad.isValid, false);
    console.log(`   ✅ [PASS] Horario "25:99" rechazado: "${resTimeBad.message}"`);

    // Hora fin anterior a hora inicio
    const resRangeBad = ValidationService.validateTimeRange('20:00', '18:00');
    assert.strictEqual(resRangeBad.isValid, false);
    console.log(`   ✅ [PASS] Hora fin anterior a inicio rechazada: "${resRangeBad.message}"`);

    // Duración menor a 15 minutos
    const resShort = ValidationService.validateTimeRange('18:00', '18:10');
    assert.strictEqual(resShort.isValid, false);
    console.log(`   ✅ [PASS] Duración de clase insuficiente rechazada: "${resShort.message}"`);

    // Rango horario válido
    const resRangeOk = ValidationService.validateTimeRange('18:30', '21:30');
    assert.strictEqual(resRangeOk.isValid, true);
    console.log(`   ✅ [PASS] Rango válido 18:30 a 21:30 (${resRangeOk.durationMinutes} mins) aceptado`);
}

// 6. BLOQUEO EN SERVICIO TEACHERSERVICE ANTE PAYLOAD INVÁLIDO
console.log('\n6. Verificando protección en TeacherService.save:');
{
    // Intento de guardar docente con DNI "47"
    const saveRes47 = TeacherService.save({
        dni: '47',
        legajo: 'DOC-TEST-47',
        lastName: 'GÓMEZ',
        firstName: 'Carlos'
    });
    assert.strictEqual(saveRes47.success, false, 'TeacherService debe rechazar DNI "47"');
    console.log(`   ✅ [PASS] TeacherService bloqueó guardado con DNI "47": "${saveRes47.message}"`);

    // Intento de guardar docente con nombre "fs"
    const saveResFs = TeacherService.save({
        dni: '35123999',
        legajo: 'DOC-TEST-FS',
        lastName: 'GÓMEZ',
        firstName: 'fs'
    });
    assert.strictEqual(saveResFs.success, false, 'TeacherService debe rechazar nombre "fs"');
    console.log(`   ✅ [PASS] TeacherService bloqueó guardado con nombre "fs": "${saveResFs.message}"`);

    // Intento de guardar docente con tope semanal superior a 30 horas (ej. 60 o 35)
    const saveRes60 = TeacherService.save({
        dni: '35123998',
        legajo: 'DOC-TEST-60',
        lastName: 'LÓPEZ',
        firstName: 'María Elena',
        maxWeeklyHours: 60
    });
    assert.strictEqual(saveRes60.success, false, 'TeacherService debe rechazar tope > 30 hs');
    assert(saveRes60.message.includes('30 horas'), 'El mensaje debe indicar tope de 30 horas');
    console.log(`   ✅ [PASS] TeacherService bloqueó tope semanal excesivo (60 hs): "${saveRes60.message}"`);

    const saveRes35 = TeacherService.save({
        dni: '35123997',
        legajo: 'DOC-TEST-35',
        lastName: 'LÓPEZ',
        firstName: 'María Elena',
        maxWeeklyHours: 35
    });
    assert.strictEqual(saveRes35.success, false, 'TeacherService debe rechazar 35 hs');
    console.log(`   ✅ [PASS] TeacherService bloqueó tope semanal de 35 hs: "${saveRes35.message}"`);

    const saveResNegative = TeacherService.save({
        dni: '35123996',
        legajo: 'DOC-TEST-NEG',
        lastName: 'LÓPEZ',
        firstName: 'María Elena',
        maxWeeklyHours: 0
    });
    assert.strictEqual(saveResNegative.success, false, 'TeacherService debe rechazar 0 horas');
    console.log(`   ✅ [PASS] TeacherService bloqueó tope semanal de 0 hs: "${saveResNegative.message}"`);
}

// 7. BLOQUEO EN DESIGNATIONSERVICE ANTE HORARIOS INVÁLIDOS
console.log('\n7. Verificando protección en DesignationService.saveDesignation:');
{
    const desigBadRange = DesignationService.saveDesignation({
        subjectId: 1,
        teacherId: 1,
        schedules: [
            { dayOfWeek: 'Lunes', startTime: '21:00', endTime: '18:00', hoursCount: 4 }
        ]
    });
    assert.strictEqual(desigBadRange.success, false, 'DesignationService debe rechazar hora fin < hora inicio');
    console.log(`   ✅ [PASS] DesignationService bloqueó horario invertido: "${desigBadRange.message}"`);

    const desigBadHours = DesignationService.saveDesignation({
        subjectId: 1,
        teacherId: 1,
        schedules: [
            { dayOfWeek: 'Lunes', startTime: '18:00', endTime: '20:00', hoursCount: 0 }
        ]
    });
    assert.strictEqual(desigBadHours.success, false, 'DesignationService debe rechazar 0 horas');
    console.log(`   ✅ [PASS] DesignationService bloqueó 0 horas cátedra: "${desigBadHours.message}"`);
}

// 8. BLOQUEO EN CSV IMPORT ANTE FILAS CON DNI INCOMPLETO
console.log('\n8. Verificando detección y rechazo en CsvImportService:');
{
    const csvWithDni47 = `DNI;Legajo;Apellido;Nombre;Revista;Horas;Catedra\n47;DOC-99;Perez;Juan;Titular;4;Química\n35123456;DOC-100;López;Ana;Titular;4;Física`;
    const previewRes = CsvImportService.previewPersonnel(csvWithDni47);
    assert.strictEqual(previewRes.success, true);
    assert.strictEqual(previewRes.validRows, 1);
    assert.strictEqual(previewRes.invalidRows, 1);
    const badRow = previewRes.preview.find(r => r.dni === '47');
    assert(badRow, 'Debe existir la fila con DNI 47');
    assert.strictEqual(badRow.status, 'OBSERVADO');
    assert(badRow.errorMessages.includes('7 u 8 dígitos'), 'El mensaje debe indicar 7 u 8 dígitos');
    console.log(`   ✅ [PASS] CSV Import marcó DNI 47 como OBSERVADO: "${badRow.errorMessages}"`);
}

console.log('\n========================================================');
console.log('   TODAS LAS PRUEBAS DE VALIDACIÓN ESTRICTA PASARON CON ÉXITO');
console.log('========================================================\n');
