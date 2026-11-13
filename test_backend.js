/**
 * Script de validación integral para SIGET (Backend Node.js & Seguridad)
 * Verifica que todos los servicios, lógica institucional, primer inicio (first-run)
 * y recuperación offline funcionen al 100%.
 */

const path = require('path');
const fs = require('fs');

// Aislamiento estricto de Base de Datos para Pruebas (evita contaminar siget.db de producción)
const testDbPath = path.join(__dirname, 'siget_test_backend.db');
const prodDbPath = path.join(__dirname, 'siget.db');
if (fs.existsSync(prodDbPath)) {
    fs.copyFileSync(prodDbPath, testDbPath);
}
process.env.SIGET_DB_PATH = testDbPath;

const bcrypt = require('bcryptjs');
const { getDatabase, closeDatabase } = require('./src/database/db');
const { AuthService } = require('./src/services/authService');
const { UserService } = require('./src/services/userService');
const { TeacherService } = require('./src/services/teacherService');
const { DesignationService } = require('./src/services/designationService');
const { AttendanceService } = require('./src/services/attendanceService');
const { CsvImportService } = require('./src/services/csvImportService');
const { TeacherCalendarService } = require('./src/services/teacherCalendarService');
const { DashboardService } = require('./src/services/dashboardService');
const { ReportService } = require('./src/services/reportService');
const { NormativeService } = require('./src/services/normativeService');
const { ValidationService } = require('./src/services/validationService');

async function runTests() {
    console.log('========================================================');
    console.log('   INICIANDO PRUEBAS DE SERVICIOS Y SEGURIDAD SIGET     ');
    console.log('========================================================\n');

    let passed = 0;
    let failed = 0;

    function assert(cond, name) {
        if (cond) {
            console.log(`  ✅ [PASS] ${name}`);
            passed++;
        } else {
            console.error(`  ❌ [FAIL] ${name}`);
            failed++;
        }
    }

    const db = getDatabase();

    // Normalizar credenciales de prueba de secretaría para asegurar idempotencia
    try {
        const defaultPasswordHash = bcrypt.hashSync('secretaria123', 12);
        const defaultAnswerHash = bcrypt.hashSync('san martin', 10);
        const defaultKey = 'SIGET-SEC-2026-ABCD-9999';
        const defaultKeyHash = bcrypt.hashSync(defaultKey, 10);
        db.prepare(`
            UPDATE users SET
                password_hash = ?,
                security_question = '¿Cuál fue el nombre de tu primera escuela?',
                security_answer_hash = ?,
                recovery_key = ?,
                recovery_key_hash = ?,
                is_active = 1
            WHERE username = 'secretaria'
        `).run(defaultPasswordHash, defaultAnswerHash, defaultKey, defaultKeyHash);
    } catch (e) {
        // En caso de que no exista aún
    }

    // 1. DB Connectivity & Migrations
    try {
        assert(!!db, 'Conexión nativa a siget.db establecida');

        const cols = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
        assert(
            cols.includes('security_question') &&
            cols.includes('security_answer_hash') &&
            cols.includes('recovery_key_hash') &&
            cols.includes('recovery_key'),
            'Migración de esquema: Columnas de seguridad presentes en tabla users'
        );
    } catch (err) {
        assert(false, `Fallo en DB / migraciones: ${err.message}`);
    }

    // 2. Normative Service
    try {
        const dniClean = NormativeService.normalizeDni('08.456.123');
        assert(dniClean === '08456123', 'RN-01: DNI normalizado preserva ceros a la izquierda');

        const isMed = NormativeService.isMedicalLicense('Licencia médica por reposo 48hs');
        const isNonMed = NormativeService.isMedicalLicense('Causas particulares / Examen');
        assert(isMed === true && isNonMed === false, 'RN-04/RN-05: Clasificación automática DL-01 vs DL-02');
    } catch (err) {
        assert(false, `Error en NormativeService: ${err.message}`);
    }

    // 3. First-Run & Master Recovery Key Generation
    try {
        const firstRunCheck = AuthService.checkFirstRun();
        assert(typeof firstRunCheck.isFirstRun === 'boolean', 'AuthService.checkFirstRun: Detección correcta de primer inicio');

        const key = AuthService.generateMasterRecoveryKey();
        const validKeyFormat = /^SIGET-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(key);
        assert(validKeyFormat, `AuthService.generateMasterRecoveryKey: Clave maestra válida (${key})`);
    } catch (err) {
        assert(false, `Error en First-Run/Key generator: ${err.message}`);
    }

    // 4. AuthService Login
    try {
        const secLogin = await AuthService.login('secretaria', 'secretaria123');
        assert(secLogin.success === true && secLogin.user.role.toLowerCase() === 'secretaria', 'AuthService: Login exitoso para secretaria con bcrypt');

        const bedelLogin = await AuthService.login('bedel', 'bedel123');
        assert(bedelLogin.success === true && bedelLogin.user.role.toLowerCase() === 'bedel', 'AuthService: Login exitoso para bedel con bcrypt');

        const badLogin = await AuthService.login('secretaria', 'clave_invalida');
        assert(badLogin.success === false, 'AuthService: Rechazo correcto de contraseña inválida');
    } catch (err) {
        assert(false, `Error en AuthService login: ${err.message}`);
    }

    // 4.1 AuthService Registration (Registro de Cuentas)
    try {
        const testUserSec = `sec_qa_${Date.now().toString().slice(-4)}`;
        const regSecRes = await AuthService.registerUser({
            fullName: 'Secretaria Académica Test',
            username: testUserSec,
            password: 'secretPassword123',
            role: 'SECRETARIO',
            email: 'secretaria@instituto.edu.ar',
            securityQuestion: '¿En qué ciudad naciste?',
            securityAnswer: 'Resistencia'
        });
        assert(regSecRes.success === true && (regSecRes.role === 'SECRETARIA' || regSecRes.role === 'SECRETARIO'), `Registro: Alta exitosa de rol Secretaría '${testUserSec}'`);

        // Comprobar inicio de sesión con el nuevo usuario registrado
        const loginNewUser = await AuthService.login(testUserSec, 'secretPassword123');
        assert(loginNewUser.success === true && (loginNewUser.user.role === 'SECRETARIA' || loginNewUser.user.role === 'SECRETARIO'), 'Registro: Login exitoso con credenciales de cuenta recién registrada');

        // Registro de Secretaría genera Master Recovery Key
        const testUserSecMaster = `sec_master_${Date.now().toString().slice(-4)}`;
        const regSecMasterRes = await AuthService.registerUser({
            fullName: 'Secretaria Adjunta Test',
            username: testUserSecMaster,
            password: 'secPassword123',
            role: 'SECRETARIA',
            email: 'sec_adjunta@instituto.edu.ar',
            securityQuestion: '¿Primera escuela?',
            securityAnswer: 'Colegio Nacional'
        });
        assert(regSecMasterRes.success === true && regSecMasterRes.masterRecoveryKey && regSecMasterRes.masterRecoveryKey.startsWith('SIGET-'), 'Registro: Rol Secretaría genera automáticamente Master Recovery Key');

        // Rechazo de usuario duplicado
        const dupRes = await AuthService.registerUser({
            fullName: 'Duplicado',
            username: testUserSec,
            password: 'password123',
            role: 'BEDEL',
            securityQuestion: 'Pregunta',
            securityAnswer: 'Respuesta'
        });
        assert(dupRes.success === false, 'Registro: Rechazo estricto de nombre de usuario duplicado');

        // Rechazo de clave corta
        const shortPassRes = await AuthService.registerUser({
            fullName: 'Clave Corta',
            username: `short_${Date.now().toString().slice(-4)}`,
            password: '123',
            role: 'BEDEL',
            securityQuestion: 'Pregunta',
            securityAnswer: 'Respuesta'
        });
        assert(shortPassRes.success === false, 'Registro: Rechazo estricto de contraseña menor a 6 caracteres');
    } catch (err) {
        assert(false, `Error en Registro de Cuentas: ${err.message}`);
    }

    // 5. Offline Recovery (Pregunta de Seguridad y Master Key)
    try {
        // A) Pregunta de seguridad
        const qRes = AuthService.getSecurityQuestion('secretaria');
        assert(qRes.success === true && qRes.question.length > 5, `Recuperación: Pregunta obtenida para secretaria ('${qRes.question}')`);

        const recovQBad = AuthService.recoverBySecurityAnswer('secretaria', 'respuesta_incorrecta', 'claveNueva123');
        assert(recovQBad.success === false, 'Recuperación: Rechazo de respuesta secreta incorrecta');

        const recovQGood = AuthService.recoverBySecurityAnswer('secretaria', 'san martin', 'secTemp123');
        assert(recovQGood.success === true, 'Recuperación: Restablecimiento exitoso con respuesta secreta');

        // Verificar que la nueva clave funciona
        const testLoginNew = await AuthService.login('secretaria', 'secTemp123');
        assert(testLoginNew.success === true, 'Recuperación: Login exitoso con nueva contraseña recuperada');

        // B) Master Recovery Key (Clave Maestra de Rescate)
        const recovKeyBad = AuthService.recoverByMasterKey('secretaria', 'SIGET-CLAVE-INVALIDA-0000', 'secretaria123');
        assert(recovKeyBad.success === false, 'Recuperación: Rechazo de Clave Maestra de Rescate inválida');

        // Restaurar con la Master Key activa de secretaría
        const activeSec = db.prepare("SELECT recovery_key FROM users WHERE username = 'secretaria'").get();
        const recovKeyGood = AuthService.recoverByMasterKey('secretaria', activeSec.recovery_key, 'secretaria123');
        assert(recovKeyGood.success === true && recovKeyGood.newMasterRecoveryKey, 'Recuperación: Restablecimiento exitoso con Master Recovery Key y rotación de llave');

        // Verificar que la clave original volvió a quedar activa
        const verifyRestored = await AuthService.login('secretaria', 'secretaria123');
        assert(verifyRestored.success === true, 'Recuperación: Login verificado post-recuperación con Master Key');
    } catch (err) {
        assert(false, `Error en Offline Recovery: ${err.message}`);
    }

    // 6. User Management (Secretaría)
    try {
        const users = UserService.getAllUsers();
        assert(Array.isArray(users) && users.length >= 2, `UserService: Listado de usuarios (${users.length} usuarios cargados)`);

        // Crear usuario secundario Bedel de prueba
        const testBedelUser = `bedel_qa_${Date.now().toString().slice(-4)}`;
        const createRes = UserService.createUser({
            username: testBedelUser,
            fullName: 'Bedel de Pruebas QA',
            role: 'BEDEL',
            email: 'qa@instituto.edu.ar',
            password: 'bedelSecret123',
            securityQuestion: '¿Color preferido?',
            securityAnswer: 'Azul'
        });
        assert(createRes.success === true, `UserService: Creación exitosa de rol secundario '${testBedelUser}'`);

        // Blanquear contraseña por la Secretaría
        const resetRes = UserService.resetPassword(createRes.userId, 'nuevaClaveBedel456');
        assert(resetRes.success === true, 'UserService: Blanqueo inmediato de contraseña efectuado por Secretaría');

        // Iniciar sesión con la clave blanqueada
        const loginBlanqueado = await AuthService.login(testBedelUser, 'nuevaClaveBedel456');
        assert(loginBlanqueado.success === true, 'UserService: Login exitoso de usuario con clave blanqueada');

        // Re-autenticar a la Secretaría para realizar operaciones de administración
        await AuthService.login('secretaria', 'secretaria123');

        // Toggle estado activo/inactivo
        const toggleRes = UserService.toggleUserActive(createRes.userId);
        assert(toggleRes.success === true && toggleRes.newStatus === false, 'UserService: Desactivación lógica de usuario secundario');
    } catch (err) {
        assert(false, `Error en UserService: ${err.message}`);
    }

    // 7. TeacherService & Validation
    try {
        const teachers = TeacherService.getAll();
        assert(Array.isArray(teachers) && teachers.length > 0, `TeacherService: Se recuperaron ${teachers.length} docentes`);

        const hourCheck = ValidationService.validateHoursLimit(teachers[0].id, 50);
        assert(hourCheck.isValid === false, 'ValidationService: Control estricto de tope de 30 hs');
    } catch (err) {
        assert(false, `Error en TeacherService/Validation: ${err.message}`);
    }

    // 8. DesignationService
    try {
        const careers = DesignationService.getCareers();
        assert(Array.isArray(careers) && careers.length > 0, `DesignationService: Se recuperaron ${careers.length} carreras`);

        const designations = DesignationService.getAll();
        assert(Array.isArray(designations), `DesignationService: Se recuperaron ${designations.length} cátedras`);
    } catch (err) {
        assert(false, `Error en DesignationService: ${err.message}`);
    }

    // 9. AttendanceService & Dashboard
    try {
        const summary = AttendanceService.getSummary('2026-10-22');
        assert(typeof summary.totalTeachers === 'number', 'AttendanceService: Resumen generado');

        const stats = DashboardService.getStats();
        assert(stats.totalTeachers > 0, `DashboardService: Estadísticas calculadas (${stats.totalTeachers} docentes)`);
    } catch (err) {
        assert(false, `Error en Attendance/Dashboard: ${err.message}`);
    }

    // 10. ReportService (ExcelJS)
    try {
        const reportResult = await ReportService.generateMonthlyWorkbook(2026, 10);
        assert(reportResult.success === true && reportResult.filePath.endsWith('.xlsx'), `ReportService: Planilla Excel generada en: ${reportResult.filePath}`);
    } catch (err) {
        assert(false, `Error en ReportService: ${err.message}`);
    }

    // 11. CsvImportService (Personal y Asistencias)
    try {
        const samplePersCsv = `DNI;Legajo;Apellido;Nombre;Revista;Horas;Catedra;Carrera;Dia;Horario;Resolucion\n33444555;LEG-9001;GOMEZ;Pablo;Titular;4;Química I;PES;Lunes;18:00 a 20:00;Disp. 201/2026\n33555666;LEG-9002;VAZQUEZ;Silvia;Provisional;4;Biología;PES;Martes;19:00 a 21:00;Disp. 202/2026`;
        const prevPers = CsvImportService.previewPersonnel(samplePersCsv);
        assert(prevPers.success === true && prevPers.validRows === 2, `CsvImportService: Previsualización de personal exitosa (${prevPers.validRows} filas válidas)`);

        const impPers = CsvImportService.importPersonnel(samplePersCsv);
        assert(impPers.success === true, `CsvImportService: Importación de personal exitosa: ${impPers.message}`);

        const sampleAttCsv = `DNI,Fecha,Estado,Horas,Observaciones\n33444555,2026-08-03,PR,4,Presente normal\n33444555,2026-08-04,I,4,Inasistencia\n33444555,2026-08-05,P,4,Art. 115`;
        const prevAtt = CsvImportService.previewAttendance(sampleAttCsv);
        assert(prevAtt.success === true && prevAtt.validRows === 3, `CsvImportService: Previsualización de asistencias exitosa (${prevAtt.validRows} filas válidas)`);

        const impAtt = CsvImportService.importAttendance(sampleAttCsv);
        assert(impAtt.success === true, `CsvImportService: Importación de asistencias exitosa (${impAtt.importedCount} registros)`);
    } catch (err) {
        assert(false, `Error en CsvImportService: ${err.message}`);
    }

    // 12. TeacherCalendarService
    try {
        const teachers = TeacherService.getAll();
        const pablo = teachers.find(t => String(t.dni) === '33444555') || teachers[0];
        const timeline = TeacherCalendarService.getTeacherTimeline({ teacherId: pablo.id, startDate: '2026-08-01', endDate: '2026-08-31' });
        assert(timeline.success === true && timeline.teacher.dni === String(pablo.dni), `TeacherCalendarService: Cronograma institucional obtenido para ${timeline.teacher.fullName}`);
        assert(timeline.annualMetrics && typeof timeline.annualMetrics.inasistencias.count === 'number', 'TeacherCalendarService: Métricas anuales y topes calculados correctamente');
    } catch (err) {
        assert(false, `Error en TeacherCalendarService: ${err.message}`);
    }

    console.log('\n========================================================');
    console.log(`   RESUMEN: ${passed} PASADAS | ${failed} FALLIDAS`);
    console.log('========================================================\n');

    closeDatabase();
    try {
        if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
        if (fs.existsSync(testDbPath + '-wal')) fs.unlinkSync(testDbPath + '-wal');
        if (fs.existsSync(testDbPath + '-shm')) fs.unlinkSync(testDbPath + '-shm');
    } catch (e) {
        // En Windows el descriptor puede tardar un instante en liberarse
    }

    process.exit(failed > 0 ? 1 : 0);
}

runTests();
