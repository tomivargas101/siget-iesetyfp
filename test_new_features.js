const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { getDatabase, closeDatabase } = require('./src/database/db');
const { AttendanceService } = require('./src/services/attendanceService');
const { AuditService } = require('./src/services/auditService');
const { NormativeService } = require('./src/services/normativeService');
const { TeacherCalendarService } = require('./src/services/teacherCalendarService');
const { DesignationService } = require('./src/services/designationService');
const { AuthService } = require('./src/services/authService');

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

    console.log('\n5. Test: Ficha Docente Individual (Exportación PDF y Excel)');
    const db = getDatabase();
    const tRow = db.prepare("SELECT id, last_name, first_name, legajo FROM teachers LIMIT 1").get();
    if (tRow) {
        const teacherExcelRes = await TeacherCalendarService.exportTeacherRecordExcel({
            teacherId: tRow.id,
            startDate: '2026-11-01',
            endDate: '2026-11-30'
        });
        assert.strictEqual(teacherExcelRes.success, true, 'Debe exportar la Ficha Docente a Excel');
        assert(fs.existsSync(teacherExcelRes.filePath), 'El archivo Excel de Ficha Docente debe existir en disco');
        console.log(`  ✅ [PASS] Exportar Ficha Docente a Excel exitoso: ${teacherExcelRes.fileName}`);

        const teacherPdfRes = await TeacherCalendarService.exportTeacherRecordPdf({
            teacherId: tRow.id,
            startDate: '2026-11-01',
            endDate: '2026-11-30',
            exportedBy: 'Secretaría / Bedelía QA'
        });
        assert.strictEqual(teacherPdfRes.success, true, 'Debe exportar la Ficha Docente a PDF');
        assert(fs.existsSync(teacherPdfRes.filePath), 'El archivo PDF de Ficha Docente debe existir en disco');
        console.log(`  ✅ [PASS] Exportar Ficha Docente a PDF exitoso: ${teacherPdfRes.fileName}`);
    }

    console.log('\n6. Test: Planilla Imprimible de Control Diario (PDF y Excel)');
    const printData = AttendanceService.getPrintableDailyData({ dateStr: '2026-11-14' });
    assert(printData.rows.length > 0, 'Debe retornar docentes para control diario');
    assert(printData.rows[0].legajo, 'Debe incluir legajo en cada fila');
    assert(printData.rows[0].fullName, 'Debe incluir nombre completo en cada fila');
    assert(printData.rows[0].revista, 'Debe incluir situación de revista');
    assert(printData.rows[0].chairsText, 'Debe incluir cátedras con desglose de días');
    console.log(`  ✅ [PASS] Estructura nominal de control diario verificada (${printData.rows.length} docentes)`);

    const printExcelRes = await AttendanceService.exportPrintableDailyExcel({ dateStr: '2026-11-14' });
    assert.strictEqual(printExcelRes.success, true, 'Debe exportar Planilla Imprimible a Excel');
    assert(fs.existsSync(printExcelRes.filePath), 'El archivo Excel de control diario debe existir en disco');
    console.log(`  ✅ [PASS] Planilla Imprimible en Excel generada: ${printExcelRes.fileName}`);

    const printPdfRes = await AttendanceService.exportPrintableDailyPdf({ dateStr: '2026-11-14', exportedBy: 'Bedelía de Turno' });
    assert.strictEqual(printPdfRes.success, true, 'Debe exportar Planilla Imprimible a PDF');
    assert(fs.existsSync(printPdfRes.filePath), 'El archivo PDF de control diario debe existir en disco');
    console.log(`  ✅ [PASS] Planilla Imprimible en PDF generada: ${printPdfRes.fileName}`);

    // 7. Verificación de Cátedras con Días Múltiples y Horarios Variables
    console.log('\n7. Test: DesignationService (Cátedras Multi-Día con Horas y Horarios Variables)');
    const tMulti = db.prepare("SELECT id, first_name, last_name FROM teachers LIMIT 1").get();
    const sMulti = db.prepare("SELECT id, name, career_id FROM subjects LIMIT 1").get();
    assert(tMulti && sMulti, 'Se requieren docente y materia en base de datos para prueba');

    // 7.1 Validación: Rechazar días duplicados en el mismo payload
    const dupRes = await DesignationService.saveDesignation({
        teacherId: tMulti.id,
        subjectId: sMulti.id,
        schedules: [
            { dayOfWeek: 'Lunes', startTime: '18:00', endTime: '19:30', hoursCount: 2 },
            { dayOfWeek: 'Lunes', startTime: '19:30', endTime: '21:00', hoursCount: 2 }
        ]
    });
    assert.strictEqual(dupRes.success, false, 'Debe rechazar días duplicados en la misma cátedra');
    assert(dupRes.message.includes('mismo día'), 'Mensaje debe advertir sobre día duplicado');
    console.log('  ✅ [PASS] Rechazo de días duplicados validado correctamente');

    // 7.2 Creación de Cátedra Multi-Día con Horas Variables (ej. Lunes 3hs, Jueves 1h)
    const saveMultiRes = await DesignationService.saveDesignation({
        teacherId: tMulti.id,
        subjectId: sMulti.id,
        schedules: [
            { dayOfWeek: 'Lunes', startTime: '18:00', endTime: '20:15', hoursCount: 3 },
            { dayOfWeek: 'Jueves', startTime: '18:00', endTime: '18:40', hoursCount: 1 }
        ],
        revista: 'Titular',
        cargo: 'Profesor',
        resolutionNumber: 'RES-TEST-2026'
    });
    assert.strictEqual(saveMultiRes.success, true, `Debe guardar la designación multi-día: ${saveMultiRes.message}`);
    const createdDesigId = saveMultiRes.designationId;
    assert(createdDesigId, 'Debe retornar el ID de la designación');
    console.log(`  ✅ [PASS] Cátedra multi-día creada (ID: ${createdDesigId}) con Lunes 3hs y Jueves 1h`);

    // 7.3 Recuperación por ID y Agrupamiento
    const desigDetail = DesignationService.getDesignationById(createdDesigId);
    assert(desigDetail, 'Debe encontrar la designación por ID');
    assert.strictEqual(desigDetail.schedules.length, 2, 'Debe contener los 2 días configurados');
    assert.strictEqual(desigDetail.totalHours, 4, 'Total de horas debe ser 4 (3 + 1)');
    assert.strictEqual(desigDetail.hoursCount, 4, 'hoursCount compatible debe ser 4');
    assert(desigDetail.schedules.some(s => s.dayOfWeek === 'Lunes' && s.hoursCount === 3), 'Lunes debe tener 3hs');
    assert(desigDetail.schedules.some(s => s.dayOfWeek === 'Jueves' && s.hoursCount === 1), 'Jueves debe tener 1h');
    console.log('  ✅ [PASS] Recuperación por ID desglosa correctamente cada día con su carga horaria');

    // 7.4 Listado general agrupado
    const allDesigs = await DesignationService.getAll({ careerId: sMulti.career_id });
    const targetDesig = allDesigs.find(d => d.teacherId === tMulti.id && d.subjectId === sMulti.id);
    assert(targetDesig, 'Debe listar la cátedra en getAll');
    assert.strictEqual(targetDesig.hoursCount, 4, 'El total semanal acumulado debe ser 4 hs');
    assert(targetDesig.dayOfWeek.includes('Lunes') && targetDesig.dayOfWeek.includes('Jueves'), 'Debe resumir los días');
    assert(targetDesig.schedules.length === 2, 'Debe incluir el array de schedules desglosados');
    console.log('  ✅ [PASS] Listado getAll consolida la cátedra en una única fila inteligente');

    // 7.5 Formato en Planilla Imprimible de Control Diario
    const printDaily = AttendanceService.getPrintableDailyData({ dateStr: '2026-11-16' });
    const targetDailyTeacher = printDaily.rows.find(r => r.id === tMulti.id);
    assert(targetDailyTeacher, 'El docente debe figurar en la planilla imprimible');
    const chairsFormatted = targetDailyTeacher.chairsText;
    assert(chairsFormatted.includes('Lunes') && chairsFormatted.includes('Jueves'), 'El formato imprimible debe detallar los días');
    assert(chairsFormatted.includes('Total: 4 hs'), 'El formato imprimible debe indicar el total de horas');
    console.log(`  ✅ [PASS] Formato de control imprimible: "${chairsFormatted}"`);

    // 7.6 Modificación: Cambiar horarios y agregar un tercer día (Miércoles 2hs)
    const updateMultiRes = await DesignationService.saveDesignation({
        id: createdDesigId,
        teacherId: tMulti.id,
        subjectId: sMulti.id,
        schedules: [
            { dayOfWeek: 'Lunes', startTime: '18:00', endTime: '20:15', hoursCount: 3 },
            { dayOfWeek: 'Miércoles', startTime: '19:00', endTime: '20:30', hoursCount: 2 },
            { dayOfWeek: 'Jueves', startTime: '18:00', endTime: '18:40', hoursCount: 1 }
        ],
        revista: 'Titular'
    });
    assert.strictEqual(updateMultiRes.success, true, 'Debe actualizar cátedra agregando un día');
    const updatedDetail = DesignationService.getDesignationById(createdDesigId);
    assert.strictEqual(updatedDetail.schedules.length, 3, 'Ahora debe tener 3 días');
    assert.strictEqual(updatedDetail.totalHours, 6, 'Total de horas debe ser 6 (3 + 2 + 1)');
    console.log('  ✅ [PASS] Actualización dinámica de días y horas comprobada (ahora 6 hs semanales)');

    // 7.7 Limpieza de la designación de prueba
    const delRes = await DesignationService.deleteDesignation(createdDesigId);
    assert.strictEqual(delRes.success, true, 'Debe eliminar la designación');
    console.log('  ✅ [PASS] Limpieza de cátedra multi-día efectuada');

    console.log('\n========================================================');
    console.log('   TODAS LAS PRUEBAS DE LAS 7 MEJORAS HAN PASADO CON ÉXITO');
    console.log('========================================================\n');
}

runTests().catch(err => {
    console.error('❌ Error en pruebas:', err);
    process.exit(1);
});
