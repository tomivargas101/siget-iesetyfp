const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { getDatabase, closeDatabase } = require('./src/database/db');
const { AttendanceService } = require('./src/services/attendanceService');
const { AuditService } = require('./src/services/auditService');
const { NormativeService } = require('./src/services/normativeService');
const { TeacherCalendarService } = require('./src/services/teacherCalendarService');

async function runTests() {
    console.log('=== TEST SUITE: NUEVAS FUNCIONALIDADES SIGET ===');

    // 1. Verificación de Parseo Multiformato de Justificaciones
    console.log('\n1. Test: AttendanceService.parseJustificationFile');
    const sampleCertText = `
        CERTIFICADO MÉDICO OFICIAL
        Formulario Físico N°: MED-99412
        Causal / Diagnóstico: Cuadro gripal con reposo laboral por 48 horas (Art. 114 a.1)
        Médico: Dr. Juan Pérez - Mat. Prov. 8831
        Observaciones: Se indica reposo estricto del 10 al 12 de noviembre.
    `;
    const textBuffer = Buffer.from(sampleCertText, 'utf-8');
    const parsedText = await AttendanceService.parseJustificationFile({
        fileBuffer: textBuffer,
        fileName: 'certificado_gomez.txt'
    });

    assert.strictEqual(parsedText.success, true, 'Debe parsear exitosamente el archivo de texto');
    assert(parsedText.formNumber.includes('MED-99412'), 'Debe extraer el número de certificado');
    assert.strictEqual(parsedText.status, 'LIC', 'Debe detectar estado LIC por certificado médico');
    assert.strictEqual(parsedText.articleCode, '114-A-1', 'Debe identificar el Art. 114 a.1');
    assert(parsedText.observations.includes('Cuadro gripal'), 'Debe extraer observaciones y diagnóstico');
    console.log('  ✅ [PASS] Parseo de justificación .txt con autocompletado exitoso');

    // Test con CSV de justificación
    const sampleCsv = `NUM_FORMULARIO;ARTICULO;ESTADO;OBSERVACIONES\nFORM-8821;115;P;Permiso particular por tramite bancario`;
    const csvBuffer = Buffer.from(sampleCsv, 'utf-8');
    const parsedCsv = await AttendanceService.parseJustificationFile({
        fileBuffer: csvBuffer,
        fileName: 'justificaciones.csv'
    });
    assert.strictEqual(parsedCsv.success, true);
    assert.strictEqual(parsedCsv.formNumber, 'FORM-8821');
    assert.strictEqual(parsedCsv.articleCode, '115');
    assert.strictEqual(parsedCsv.status, 'P');
    console.log('  ✅ [PASS] Parseo de justificación .csv con autocompletado exitoso');

    // 2. Verificación de Auditoría y Exportación PDF
    console.log('\n2. Test: AuditService y Exportación Oficial de Acciones PDF');
    AuditService.logAction({
        username: 'bedelia_test',
        action: 'TEST_ACTION',
        details: 'Registro de prueba para trazabilidad y exportación PDF',
        category: 'ASISTENCIA'
    });

    const logs = AuditService.getAllLogs({ category: 'ASISTENCIA', limit: 10 });
    assert(Array.isArray(logs) && logs.length > 0, 'Debe retornar lista de logs');
    const testLog = logs.find(l => l.action === 'TEST_ACTION');
    assert(testLog, 'El log recién creado debe estar presente en los resultados');
    console.log('  ✅ [PASS] Registro de auditoría y filtrado por categoría exitoso');

    const pdfRes = await AuditService.generateAuditPdf({
        exportedBy: 'Bedelía de Turno',
        category: 'ALL'
    });
    assert.strictEqual(pdfRes.success, true, 'Debe generar el documento PDF institucional');
    assert(fs.existsSync(pdfRes.filePath), 'El archivo PDF de auditoría debe existir en disco');
    assert(pdfRes.totalLogs >= 1, 'Debe incluir los registros en el PDF');
    console.log(`  ✅ [PASS] PDF Oficial de Auditoría generado exitosamente en: ${pdfRes.filePath}`);

    // 3. Verificación de Jornadas Institucionales en SQLite y Normativa
    console.log('\n3. Test: Jornadas Institucionales (Persistencia y Detección)');
    const testDate = '2026-11-25';
    const saveRes = NormativeService.saveInstitutionalDay({
        date: testDate,
        name: 'Jornada Pedagógica Institucional Extraordinaria',
        type: 'jornada',
        username: 'secretaria_qa'
    });
    assert.strictEqual(saveRes.success, true, 'Debe guardar la jornada institucional en SQLite');

    const instDays = NormativeService.getInstitutionalDays(2026, 11);
    assert(instDays.some(d => d.date === testDate), 'La fecha configurada debe listarse en las jornadas del mes');

    const dayInfo = NormativeService.getCalendarDayInfo(testDate);
    assert.strictEqual(dayInfo.isInstitutionalDay, true, 'Debe reconocer la fecha como jornada institucional');
    assert.strictEqual(dayInfo.isHoliday, false, 'No debe ser feriado nacional');
    console.log('  ✅ [PASS] Jornada Institucional persistida y reconocida en calendario escolar');

    // 4. Verificación de Matriz del Calendario Mensual (1..31) y Exportaciones
    console.log('\n4. Test: TeacherCalendarService (Matriz del Mes, Export Excel y Export PDF)');
    const matrixRes = await TeacherCalendarService.getMonthMatrix({ year: 2026, month: 11 });
    assert.strictEqual(matrixRes.success, true, 'Debe generar la matriz mensual');
    assert.strictEqual(matrixRes.daysInMonth, 30, 'Noviembre debe tener 30 días');
    assert.strictEqual(matrixRes.days.length, 30, 'Debe tener metadatos para cada uno de los 30 días');
    assert(matrixRes.stats.workdays > 0, 'Debe calcular días hábiles');
    assert(matrixRes.stats.institutionalDays >= 1, 'Debe contabilizar la jornada institucional configurada');
    assert(Array.isArray(matrixRes.teachersMatrix), 'Debe incluir matriz de docentes');
    console.log(`  ✅ [PASS] Matriz del mes calculada: ${matrixRes.stats.workdays} días hábiles, ${matrixRes.stats.holidays} feriados, ${matrixRes.stats.institutionalDays} jornadas`);

    const excelRes = await TeacherCalendarService.exportMonthExcel({ year: 2026, month: 11 });
    assert.strictEqual(excelRes.success, true, 'Debe exportar el mes en Excel');
    assert(fs.existsSync(excelRes.filePath), 'El archivo Excel mensual debe existir en disco');
    console.log(`  ✅ [PASS] Guardar Mes en Excel exitoso: ${excelRes.fileName}`);

    const calPdfRes = await TeacherCalendarService.exportMonthPdf({
        year: 2026,
        month: 11,
        exportedBy: 'Secretaría Académica'
    });
    assert.strictEqual(calPdfRes.success, true, 'Debe exportar el mes en PDF');
    assert(fs.existsSync(calPdfRes.filePath), 'El archivo PDF mensual debe existir en disco');
    console.log(`  ✅ [PASS] Guardar Mes en PDF exitoso: ${calPdfRes.fileName}`);

    // Limpieza de jornada de prueba
    NormativeService.deleteInstitutionalDay(testDate);
    console.log('  ✅ [PASS] Limpieza de jornada de prueba efectuada');

    console.log('\n========================================================');
    console.log('   TODAS LAS PRUEBAS DE LAS 4 MEJORAS HAN PASADO CON ÉXITO');
    console.log('========================================================\n');
}

runTests().catch(err => {
    console.error('❌ Error en pruebas:', err);
    process.exit(1);
});
