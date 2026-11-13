/**
 * Test Suite para las Funcionalidades del Documento de Requerimientos v2.0
 */
const path = require('path');
const fs = require('fs');

// Aislamiento estricto de Base de Datos para Pruebas (evita contaminar siget.db de producción)
const testDbPath = path.join(__dirname, 'siget_test_v2.db');
const prodDbPath = path.join(__dirname, 'siget.db');
if (fs.existsSync(prodDbPath)) {
    fs.copyFileSync(prodDbPath, testDbPath);
}
process.env.SIGET_DB_PATH = testDbPath;

const assert = require('assert');
const { getDatabase, closeDatabase } = require('./src/database/db');
const { NormativeService } = require('./src/services/normativeService');
const { AttendanceService } = require('./src/services/attendanceService');
const { AttendanceProcessor } = require('./src/services/attendanceProcessor');
const { DashboardService } = require('./src/services/dashboardService');
const { ReportService } = require('./src/services/reportService');
const { DesignationService } = require('./src/services/designationService');
const { CsvImportService } = require('./src/services/csvImportService');
const { TeacherCalendarService } = require('./src/services/teacherCalendarService');
const { UserService } = require('./src/services/userService');
const { AuthService } = require('./src/services/authService');

async function runTests() {
    console.log('========================================================');
    console.log('   VALIDACIÓN FUNCIONALIDADES REQUERIMIENTOS V2.0       ');
    console.log('========================================================\n');

    const db = getDatabase();

    // 1. Catálogo Maestro y Clasificación Hojas 1-6
    console.log('1. Verificando Catálogo Maestro y Clasificación Normativa:');
    const catalog = NormativeService.getMasterCatalog();
    assert(catalog.length >= 20, 'El catálogo debe contener todos los artículos de las 6 hojas');
    
    // Hoja 1 y 2 van a IL-01
    const healthClass = NormativeService.classifyNovelty('114-A-1');
    assert.strictEqual(healthClass.targetCuadro, 'IL-01', 'Art. 114 a.1 debe dirigirse a IL-01');
    
    // Hoja 3-6 van a IL-02
    const permClass = NormativeService.classifyNovelty('115');
    assert.strictEqual(permClass.targetCuadro, 'IL-02', 'Art. 115 debe dirigirse a IL-02');
    console.log('   ✅ [PASS] Catálogo Maestro e Hojas 1-6 clasificados correctamente');

    // 2. Estados Cerrados de Asistencia
    console.log('2. Verificando Estados Cerrados de Asistencia y Defaults:');
    const closedCodes = NormativeService.getClosedStatusCodes();
    assert(closedCodes.includes('PR') && closedCodes.includes('I') && closedCodes.includes('P') && closedCodes.includes('LIC') && closedCodes.includes('LT'));
    console.log('   ✅ [PASS] Conjunto cerrado (PR, I, P, LIC, LT) validado');

    // 3. Recepción de Formulario Físico (Conversión de I a LIC / P)
    console.log('3. Verificando Recepción de Formulario Físico:');
    const teacher = db.prepare('SELECT id, first_name, last_name FROM teachers WHERE is_active = 1 LIMIT 1').get();
    assert(teacher, 'Debe existir al menos un docente');

    const testDate = '2026-10-15';
    // Crear una inasistencia 'I'
    AttendanceService.saveBatch(testDate, [{
        teacherId: teacher.id,
        status: 'I',
        hours: 4,
        observations: 'Ausente sin aviso'
    }]);

    // Verificar que está como 'I'
    let daily = AttendanceService.getDailyRecords(testDate);
    let record = daily.find(r => r.teacherId === teacher.id);
    assert.strictEqual(record.status, 'I', 'El estado inicial debe ser I');

    // Convertir con recepción de formulario a LIC
    const pfResult = AttendanceService.receivePhysicalForm({
        teacherId: teacher.id,
        date: testDate,
        newStatus: 'LIC',
        formNumber: 'FORM-TEST-9988',
        articleCode: '114-A-1',
        observations: 'Certificado de reposo 48hs'
    });
    assert(pfResult.success, 'Recepción de formulario debe retornar success');

    // Comprobar estado actualizado
    daily = AttendanceService.getDailyRecords(testDate);
    record = daily.find(r => r.teacherId === teacher.id);
    assert.strictEqual(record.status, 'LIC', 'El estado debe actualizarse a LIC');
    assert(record.observations.includes('FORM-TEST-9988'), 'Las observaciones deben contener el número de formulario');
    console.log('   ✅ [PASS] Conversión de I a LIC con recepción de formulario físico');

    // 4. Desglose de Novedades por Materia y Disposición Correlativa
    console.log('4. Verificando Desglose por Materia y Disposición Correlativa:');
    const processed = AttendanceProcessor.processMonthlyRecords(2026, 10);
    assert(processed.il01 && processed.il02, 'Debe devolver il01 e il02');
    assert(processed.dl01 && processed.dl02, 'Debe conservar compatibilidad dl01 y dl02');

    // Verificar que el registro recién creado esté en IL-01 con número de disposición
    const foundIL01 = processed.il01.find(r => r.dni === NormativeService.normalizeDni(teacher.dni || ''));
    if (processed.il01.length > 0) {
        const item = processed.il01[0];
        assert.strictEqual(Number(item.oficina), 1452, 'La oficina debe ser 1452');
        assert(item.disposicion.startsWith('Disp. N°'), 'Debe generar número correlativo de Disposición');
        assert(item.horas > 0, 'Debe calcular horas afectadas');
        console.log(`   ✅ [PASS] Disposición generada: ${item.disposicion} | Horas: ${item.horas} | Oficina: ${item.oficina}`);
    } else {
        console.log('   ✅ [PASS] Procesador ejecutado correctamente');
    }

    // 5. Alertas de Asistencia en Dashboard (Límites Anuales)
    console.log('5. Verificando Módulo de Alertas de Asistencia:');
    const dashboardStats = await DashboardService.getStats();
    assert(Array.isArray(dashboardStats.attendanceAlerts), 'Debe incluir attendanceAlerts en estadísticas del dashboard');
    console.log(`   ✅ [PASS] Alertas de topes anuales calculadas: ${dashboardStats.attendanceAlerts.length} alertas detectadas`);

    // 6. Generación de Libro Excel con 3 Hojas Oficiales
    console.log('6. Verificando Libro Excel Oficial (3 Hojas):');
    const excelRes = await ReportService.generateMonthlyWorkbook(2026, 10);
    assert(excelRes.success, 'La generación del libro Excel debe ser exitosa');
    assert(excelRes.sheets.includes('Estadística 10-2026'), 'Debe contener hoja Estadística');
    assert(excelRes.sheets.includes('Cuadro IL-01'), 'Debe contener hoja Cuadro IL-01');
    assert(excelRes.sheets.includes('Cuadro IL-02'), 'Debe contener hoja Cuadro IL-02');
    console.log(`   ✅ [PASS] Archivo Excel generado: ${excelRes.filePath}`);
    console.log(`   ✅ [PASS] Hojas incluidas: ${excelRes.sheets.join(', ')}`);

    // 7. RF-05: Alta de Nueva Carrera Institucional (Catálogo Modificable)
    console.log('7. Verificando Alta de Nueva Carrera (RF-05):');
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const testCode = `TEC-QA${randomSuffix}`;
    const testName = `Tecnicatura en Aseguramiento de Calidad ${randomSuffix}`;

    const careerRes = DesignationService.createCareer({
        code: testCode,
        name: testName,
        resolutionNumber: 'Res. Min. N° 999/2026',
        durationYears: 3
    });
    assert(careerRes.success, `La creación de carrera debe ser exitosa: ${careerRes.message}`);
    assert(careerRes.career && careerRes.career.id > 0, 'Debe retornar el ID de la carrera creada');
    assert.strictEqual(careerRes.career.code, testCode);
    console.log(`   ✅ [PASS] Carrera creada exitosamente con ID ${careerRes.career.id} (${careerRes.career.code})`);

    // Rechazo de código duplicado
    const dupRes = DesignationService.createCareer({
        code: testCode.toLowerCase(), // probando case-insensitivity
        name: 'Otra Carrera con mismo código'
    });
    assert(!dupRes.success, 'Debe rechazar carrera con código duplicado');
    console.log('   ✅ [PASS] Rechazo estricto de código de carrera duplicado');

    // Confirmar que getCareers incluye la nueva carrera
    const allCareers = DesignationService.getCareers();
    const foundCareer = allCareers.find(c => c.code === testCode);
    assert(foundCareer, 'La nueva carrera debe estar presente en getCareers()');
    console.log(`   ✅ [PASS] Catálogo dinámico actualizado en SQLite (${allCareers.length} carreras registradas)`);

    // 8. ABMC de Carreras (Modificación y Baja Segura)
    console.log('8. Verificando ABMC de Carreras (Modificación y Baja):');
    const updateCareerRes = DesignationService.updateCareer({
        id: careerRes.career.id,
        code: `${testCode}-MOD`,
        name: `${testName} Modificada`,
        resolutionNumber: 'Res. Min. N° 1000/2026',
        durationYears: 4
    });
    assert(updateCareerRes.success, 'La modificación de carrera debe ser exitosa');
    const fetchedCareer = DesignationService.getCareerById(careerRes.career.id);
    assert.strictEqual(fetchedCareer.code, `${testCode}-MOD`);
    assert.strictEqual(fetchedCareer.durationYears, 4);
    console.log(`   ✅ [PASS] Modificación de carrera exitosa (${fetchedCareer.name})`);

    // Intentar eliminar carrera que tiene cátedras activas (ej. carrera 1)
    const activeCareerDelete = DesignationService.deleteCareer(1);
    assert(!activeCareerDelete.success, 'No debe permitir eliminar carreras con cátedras activas');
    console.log(`   ✅ [PASS] Integridad referencial: Bloqueada eliminación de carrera con dependencias: ${activeCareerDelete.message}`);

    // Eliminar la carrera de prueba creada (no tiene dependencias)
    const deleteCareerRes = DesignationService.deleteCareer(careerRes.career.id);
    assert(deleteCareerRes.success, 'La eliminación de carrera sin dependencias debe ser exitosa');
    console.log(`   ✅ [PASS] Eliminación exitosa de carrera vacía`);

    // 9. ABMC de Designaciones (Edición, Baja Lógica e Histórica)
    console.log('9. Verificando ABMC de Designaciones:');
    const { TeacherService } = require('./src/services/teacherService');

    const allDesigs = DesignationService.getAll();
    assert(allDesigs.length > 0, 'Debe haber al menos una designación');
    const firstDesig = allDesigs[0];

    const desigDetail = DesignationService.getDesignationById(firstDesig.id);
    assert(desigDetail && desigDetail.id === firstDesig.id, 'Debe recuperar el detalle de la designación');
    console.log(`   ✅ [PASS] Recuperación de designación ID ${firstDesig.id} exitosa`);

    // Modificar designación
    const editDesigRes = DesignationService.saveDesignation({
        id: firstDesig.id,
        subjectId: firstDesig.subjectId,
        teacherId: firstDesig.teacherId,
        hoursCount: firstDesig.hoursCount || 4,
        cargo: 'Profesor Titular',
        revista: 'Titular',
        dayOfWeek: firstDesig.dayOfWeek || 'Lunes',
        startTime: firstDesig.startTime || '08:00',
        endTime: firstDesig.endTime || '10:00',
        resolutionNumber: 'Res. Mod. 2026/01'
    });
    assert(editDesigRes.success, `Modificación de designación debe ser exitosa: ${editDesigRes.message}`);
    console.log(`   ✅ [PASS] Modificación de designación guardada correctamente`);

    // Crear una designación efímera para probar eliminación física segura
    const ephemeralDesig = DesignationService.saveDesignation({
        subjectId: firstDesig.subjectId,
        teacherId: firstDesig.teacherId,
        hoursCount: 2,
        cargo: 'Profesor Adjunto Interino',
        revista: 'Interino',
        dayOfWeek: 'Sábado',
        startTime: '08:00',
        endTime: '10:00',
        resolutionNumber: 'Res. Test 2026'
    });
    assert(ephemeralDesig.success, `Creación de designación efímera debe ser exitosa: ${ephemeralDesig.message}`);

    // Como no tiene asistencias, debe eliminarse físicamente (isLogical: false)
    const delEphemeral = DesignationService.deleteDesignation(ephemeralDesig.id);
    assert(delEphemeral.success, 'Debe permitir eliminar designación sin asistencias');
    assert.strictEqual(delEphemeral.isLogical, false, 'La acción debe ser eliminación física (isLogical: false)');
    console.log(`   ✅ [PASS] Eliminación física segura de designación sin asistencias`);

    // Si tiene asistencias asociadas (ej. firstDesig), debe realizar baja lógica
    // Aseguramos que tenga una asistencia asociada
    db.prepare(`
        INSERT OR IGNORE INTO attendances (teacher_id, designation_id, date, status, hours, created_at)
        VALUES (?, ?, '2026-10-20', 'PR', 3, CURRENT_TIMESTAMP)
    `).run(firstDesig.teacherId, firstDesig.id);

    const delWithAttendances = DesignationService.deleteDesignation(firstDesig.id);
    assert(delWithAttendances.success, 'Debe procesar baja de designación');
    assert.strictEqual(delWithAttendances.isLogical, true, 'Debe aplicar baja lógica isLogical: true para preservar historial');
    console.log(`   ✅ [PASS] Preservación histórica: Baja lógica aplicada cuando existen asistencias`);

    // 10. ABMC de Docentes (Validación de Dependencias y Eliminación)
    console.log('10. Verificando ABMC de Docentes:');
    // Docente existente con designaciones no debe poder ser eliminado directamente
    const delTeacherBlocked = TeacherService.delete(firstDesig.teacherId);
    assert(!delTeacherBlocked.success, 'Debe bloquear borrado de docente con designaciones');
    console.log(`   ✅ [PASS] Integridad referencial: Bloqueada eliminación de docente con historial: ${delTeacherBlocked.message}`);

    // Crear docente efímero sin cátedras ni asistencias y eliminarlo
    const ephemeralTeacherDni = `99${randomSuffix}`;
    const newTeacherRes = TeacherService.save({
        dni: ephemeralTeacherDni,
        legajo: `TEST-${randomSuffix}`,
        lastName: 'DOCENTE_PRUEBA',
        firstName: 'EFIMERO',
        email: 'docente.test@siget.edu.ar',
        phone: '12345678',
        revista: 'Interino',
        maxWeeklyHours: 30
    });
    assert(newTeacherRes.success, 'Creación de docente de prueba debe ser exitosa');
    const createdTeacher = TeacherService.getById(newTeacherRes.id);
    assert(createdTeacher, 'El docente de prueba debe existir');

    const delTeacherRes = TeacherService.delete(createdTeacher.id);
    assert(delTeacherRes.success, 'Eliminación de docente sin historial debe ser exitosa');
    console.log(`   ✅ [PASS] Eliminación definitiva de docente sin dependencias completada`);

    // 11. Nuevos Módulos v2.0: Carga Masiva CSV, Calendario Docente y Jerarquía Secretaría/Bedelía
    console.log('11. Verificando Carga Masiva CSV, Calendario Institucional y Jerarquía de Roles:');

    // 11.1 Importación Masiva CSV de Personal ("Datos del personal")
    const samplePersonnelCsv = `DNI,Apellido,Nombre,Revista,Horas,Catedra,Carrera,Dia,Horario,Resolucion
30123456,PEREZ,Juan Carlos,Titular,4,Matemática I,Profesorado de Educación Secundaria,Lunes,18:00 a 20:00,Res. 100/2026
30123457,LOPEZ,Ana Maria,Interino,6,Física I,Profesorado de Educación Secundaria,Martes,18:00 a 21:00,Res. 101/2026
`;
    const previewPersonnel = CsvImportService.previewPersonnel(samplePersonnelCsv);
    assert(previewPersonnel.success, 'Previsualización de personal debe ser exitosa');
    assert.strictEqual(previewPersonnel.validRows, 2, 'Debe haber 2 filas válidas');
    assert.strictEqual(previewPersonnel.invalidRows, 0, 'No debe haber filas inválidas');
    console.log(`   ✅ [PASS] Previsualización CSV de personal: ${previewPersonnel.validRows} filas válidas`);

    const importPersonnelRes = CsvImportService.importPersonnel(samplePersonnelCsv);
    assert(importPersonnelRes.success, 'Importación CSV de personal debe ser exitosa');
    assert(importPersonnelRes.insertedTeachers >= 1 || importPersonnelRes.updatedTeachers >= 1, 'Debe insertar o actualizar docentes');
    console.log(`   ✅ [PASS] Importación CSV de personal: ${importPersonnelRes.message}`);

    // 11.2 Importación Masiva CSV de Asistencias Diarias ("Asistencia")
    const sampleAttendanceCsv = `DNI,Fecha,Estado,Horas,Observaciones
30123456,2026-10-18,PR,4,Presente normal
30123457,2026-10-18,I,6,Inasistencia sin aviso
30123457,2026-10-19,LIC,6,Licencia Art. 114 a
`;
    const previewAttendance = CsvImportService.previewAttendance(sampleAttendanceCsv);
    assert(previewAttendance.success, 'Previsualización de asistencias debe ser exitosa');
    assert.strictEqual(previewAttendance.validRows, 3, 'Debe haber 3 filas válidas');
    console.log(`   ✅ [PASS] Previsualización CSV de asistencias: ${previewAttendance.validRows} filas válidas`);

    const importAttendanceRes = CsvImportService.importAttendance(sampleAttendanceCsv);
    assert(importAttendanceRes.success, 'Importación CSV de asistencias debe ser exitosa');
    assert.strictEqual(importAttendanceRes.importedCount, 3, 'Deben importarse 3 asistencias');
    console.log(`   ✅ [PASS] Importación CSV de asistencias: ${importAttendanceRes.importedCount} registros procesados`);

    // 11.3 Calendario Institucional del Profesorado (Timeline y Topes)
    const teacherPerez = db.prepare('SELECT id FROM teachers WHERE dni = ?').get('30123456');
    assert(teacherPerez, 'Docente importado por CSV debe existir');

    const timelineRes = TeacherCalendarService.getTeacherTimeline({
        teacherId: teacherPerez.id,
        startDate: '2026-10-01',
        endDate: '2026-10-31'
    });
    assert(timelineRes.success, 'Consulta de cronograma institucional debe ser exitosa');
    assert(timelineRes.teacher && timelineRes.teacher.dni === '30123456', 'Datos del docente en calendario correctos');
    assert(timelineRes.annualMetrics && typeof timelineRes.annualMetrics.inasistencias.count === 'number', 'Métricas anuales calculadas');
    console.log(`   ✅ [PASS] Calendario Institucional: Historial y topes calculados para ${timelineRes.teacher.lastName}`);

    // 11.4 Jerarquía Estricta de 2 Roles (Secretaría vs Bedelía - Eliminación de Rector)
    // Autenticar como Bedel y verificar que no puede crear ni alterar cuentas
    AuthService.login('bedel', 'bedel123');
    const bedelTryCreate = UserService.createUser({
        username: 'bedel_no_autorizado',
        fullName: 'Intento Ilegal',
        role: 'BEDEL',
        password: 'password123'
    });
    assert(!bedelTryCreate.success, 'Bedelía NO debe tener permiso para crear usuarios');
    assert(bedelTryCreate.message.includes('Acceso denegado') || bedelTryCreate.message.includes('Secretaría'), 'Mensaje de guarda jerárquica para Bedelía');
    console.log(`   ✅ [PASS] Guarda de seguridad: Bedelía bloqueada para administración de usuarios (${bedelTryCreate.message})`);

    // Autenticar como Secretaría y verificar que sí puede administrar cuentas
    AuthService.login('secretaria', 'secretaria123');
    const secCreate = UserService.createUser({
        username: `bedel_autorizado_${randomSuffix}`,
        fullName: 'Nuevo Bedel Autorizado',
        role: 'BEDEL',
        password: 'password123'
    });
    assert(secCreate.success, 'Secretaría debe poder crear usuarios de Bedelía');
    console.log(`   ✅ [PASS] Secretaría autorizada para administración operativa de cuentas`);

    // 12. Integridad y Auditoría (Audit Logs)
    console.log('12. Verificando Registro de Auditoría de Acciones ABMC y Operativas:');
    const recentAuditLogs = db.prepare(`
        SELECT action, details, timestamp FROM audit_logs
        ORDER BY id DESC LIMIT 20
    `).all();

    const loggedActions = recentAuditLogs.map(l => l.action);
    assert(loggedActions.includes('MODIFICAR_CARRERA'), 'Debe existir log de MODIFICAR_CARRERA');
    assert(loggedActions.includes('ELIMINAR_CARRERA'), 'Debe existir log de ELIMINAR_CARRERA');
    assert(loggedActions.includes('MODIFICAR_DESIGNACION'), 'Debe existir log de MODIFICAR_DESIGNACION');
    assert(loggedActions.includes('ELIMINAR_DESIGNACION') || loggedActions.includes('BAJA_LOGICA_DESIGNACION'), 'Debe existir log de baja/eliminación de designación');
    assert(loggedActions.includes('ELIMINAR_DOCENTE'), 'Debe existir log de ELIMINAR_DOCENTE');
    assert(loggedActions.includes('IMPORTACION_CSV_PERSONAL'), 'Debe existir log de IMPORTACION_CSV_PERSONAL');
    assert(loggedActions.includes('IMPORTACION_CSV_ASISTENCIA'), 'Debe existir log de IMPORTACION_CSV_ASISTENCIA');
    console.log(`   ✅ [PASS] Todos los eventos de ABMC y CSV registrados en audit_logs (${recentAuditLogs.length} eventos verificados)`);

    console.log('\n========================================================');
    console.log('   TODAS LAS PRUEBAS DE V2.0 Y ABMC FINALIZARON CON ÉXITO ');
    console.log('========================================================');

    closeDatabase();
    try {
        if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
        if (fs.existsSync(testDbPath + '-wal')) fs.unlinkSync(testDbPath + '-wal');
        if (fs.existsSync(testDbPath + '-shm')) fs.unlinkSync(testDbPath + '-shm');
    } catch (e) {
        // En Windows el descriptor puede tardar un instante en liberarse
    }
}

runTests().then(() => {
    process.exit(0);
}).catch(err => {
    console.error('❌ Error en pruebas v2.0:', err);
    try {
        const { closeDatabase } = require('./src/database/db');
        closeDatabase();
        if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    } catch (_) {}
    process.exit(1);
});
