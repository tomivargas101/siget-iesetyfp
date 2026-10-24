/**
 * Registro Centralizado de Handlers IPC para Electron (Main Process)
 * Provee comunicación segura y no bloqueante para el proceso Renderer.
 */

const { ipcMain, dialog, shell } = require('electron');
const { AuthService } = require('../services/authService');
const { UserService } = require('../services/userService');
const { TeacherService } = require('../services/teacherService');
const { DesignationService } = require('../services/designationService');
const { AttendanceService } = require('../services/attendanceService');
const { StudentService } = require('../services/studentService');
const { DashboardService } = require('../services/dashboardService');
const { ReportService } = require('../services/reportService');
const { AuditService } = require('../services/auditService');

function registerIpcHandlers() {
    // -------------------------------------------------------------
    // AUTENTICACIÓN, REGISTRO INICIAL Y RECUPERACIÓN OFFLINE
    // -------------------------------------------------------------
    ipcMain.handle('auth:checkFirstRun', () => {
        return AuthService.checkFirstRun();
    });

    ipcMain.handle('auth:firstRunSetup', async (event, payload) => {
        return await AuthService.firstRunSetup(payload);
    });

    ipcMain.handle('auth:register', async (event, payload) => {
        return await AuthService.registerUser(payload);
    });

    ipcMain.handle('auth:login', async (event, { username, password }) => {
        return await AuthService.login(username, password);
    });

    ipcMain.handle('auth:logout', () => {
        return AuthService.logout();
    });

    ipcMain.handle('auth:getCurrentUser', () => {
        return AuthService.getCurrentUser();
    });

    ipcMain.handle('auth:getSecurityQuestion', (event, username) => {
        return AuthService.getSecurityQuestion(username);
    });

    ipcMain.handle('auth:recoverBySecurityAnswer', (event, { username, answer, newPassword }) => {
        return AuthService.recoverBySecurityAnswer(username, answer, newPassword);
    });

    ipcMain.handle('auth:recoverByMasterKey', (event, { username, masterKey, newPassword }) => {
        return AuthService.recoverByMasterKey(username, masterKey, newPassword);
    });

    // -------------------------------------------------------------
    // GESTIÓN DE USUARIOS Y ROLES SECUNDARIOS (RECTOR)
    // -------------------------------------------------------------
    ipcMain.handle('users:getAll', () => {
        return UserService.getAllUsers();
    });

    ipcMain.handle('users:getById', (event, id) => {
        return UserService.getUserById(id);
    });

    ipcMain.handle('users:create', (event, payload) => {
        return UserService.createUser(payload);
    });

    ipcMain.handle('users:update', (event, { id, payload }) => {
        return UserService.updateUser(id, payload);
    });

    ipcMain.handle('users:resetPassword', (event, { userId, newPassword }) => {
        return UserService.resetPassword(userId, newPassword);
    });

    ipcMain.handle('users:toggleActive', (event, id) => {
        return UserService.toggleUserActive(id);
    });

    // -------------------------------------------------------------
    // DOCENTES Y LEGAJOS (RN-01, RN-02)
    // -------------------------------------------------------------
    ipcMain.handle('teachers:getAll', (event, filters) => {
        return TeacherService.getAll(filters);
    });

    ipcMain.handle('teachers:getById', (event, id) => {
        return TeacherService.getById(id);
    });

    ipcMain.handle('teachers:save', (event, payload) => {
        return TeacherService.save(payload);
    });

    ipcMain.handle('teachers:toggleActive', (event, id) => {
        return TeacherService.toggleActive(id);
    });

    ipcMain.handle('teachers:delete', (event, id) => {
        return TeacherService.delete(id);
    });

    // -------------------------------------------------------------
    // CÁTEDRAS, DESIGNACIONES Y SUPLENCIAS (RN-02, RN-03)
    // -------------------------------------------------------------
    ipcMain.handle('designations:getAll', (event, filters) => {
        return DesignationService.getAll(filters);
    });

    ipcMain.handle('designations:getById', (event, id) => {
        return DesignationService.getDesignationById(id);
    });

    ipcMain.handle('designations:save', (event, payload) => {
        return DesignationService.saveDesignation(payload);
    });

    ipcMain.handle('designations:delete', (event, id) => {
        return DesignationService.deleteDesignation(id);
    });

    ipcMain.handle('designations:getSubstitutions', () => {
        return DesignationService.getAllSubstitutions();
    });

    ipcMain.handle('designations:saveSubstitution', (event, payload) => {
        return DesignationService.saveSubstitution(payload);
    });

    ipcMain.handle('designations:getCareers', () => {
        return DesignationService.getCareers();
    });

    ipcMain.handle('designations:getCareerById', (event, id) => {
        return DesignationService.getCareerById(id);
    });

    ipcMain.handle('designations:createCareer', async (event, data) => {
        return DesignationService.createCareer(data);
    });

    ipcMain.handle('designations:updateCareer', async (event, data) => {
        return DesignationService.updateCareer(data);
    });

    ipcMain.handle('designations:deleteCareer', async (event, id) => {
        return DesignationService.deleteCareer(id);
    });

    ipcMain.handle('designations:getSubjects', (event, careerId) => {
        return DesignationService.getSubjectsByCareer(careerId);
    });

    // -------------------------------------------------------------
    // CONTROL DIARIO DE ASISTENCIAS
    // -------------------------------------------------------------
    ipcMain.handle('attendance:getDaily', (event, dateStr) => {
        return AttendanceService.getDailyRecords(dateStr);
    });

    ipcMain.handle('attendance:save', (event, payload) => {
        return AttendanceService.saveDailyRecord(payload);
    });

    ipcMain.handle('attendance:saveBatch', (event, { dateStr, records }) => {
        return AttendanceService.saveBatch(dateStr, records);
    });

    ipcMain.handle('attendance:receivePhysicalForm', (event, payload) => {
        return AttendanceService.receivePhysicalForm(payload);
    });

    ipcMain.handle('attendance:getSummary', (event, dateStr) => {
        return AttendanceService.getSummary(dateStr);
    });

    // -------------------------------------------------------------
    // CATÁLOGO MAESTRO NORMATIVO (IL-01 / IL-02)
    // -------------------------------------------------------------
    ipcMain.handle('normative:getMasterCatalog', () => {
        const { NormativeService } = require('../services/normativeService');
        return NormativeService.getMasterCatalog();
    });

    ipcMain.handle('normative:getArticleDetails', (event, key) => {
        const { NormativeService } = require('../services/normativeService');
        return NormativeService.getArticleDetails(key);
    });

    // -------------------------------------------------------------
    // ALUMNOS E INSCRIPCIONES
    // -------------------------------------------------------------
    ipcMain.handle('students:getAll', (event, filters) => {
        return StudentService.getAll(filters);
    });

    ipcMain.handle('students:getById', (event, id) => {
        return StudentService.getById(id);
    });

    ipcMain.handle('students:save', (event, payload) => {
        return StudentService.save(payload);
    });

    ipcMain.handle('students:toggleActive', (event, id) => {
        return StudentService.toggleActive(id);
    });

    ipcMain.handle('students:delete', (event, id) => {
        return StudentService.delete(id);
    });

    // -------------------------------------------------------------
    // DASHBOARD Y ESTADÍSTICAS
    // -------------------------------------------------------------
    ipcMain.handle('dashboard:getStats', () => {
        return DashboardService.getStats();
    });

    // -------------------------------------------------------------
    // REPORTES Y PLANILLAS OFICIALES (EXCEL)
    // -------------------------------------------------------------
    ipcMain.handle('reports:getPreview', async (event, { year, month }) => {
        const { AttendanceProcessor } = require('../services/attendanceProcessor');
        return AttendanceProcessor.processMonthlyRecords(Number(year), Number(month));
    });

    ipcMain.handle('reports:generateMonthly', async (event, { year, month }) => {
        return await ReportService.generateMonthlyWorkbook(year, month);
    });

    ipcMain.handle('reports:openFile', async (event, filePath) => {
        if (filePath) {
            await shell.openPath(filePath);
            return { success: true };
        }
        return { success: false, message: 'Ruta no válida' };
    });

    // -------------------------------------------------------------
    // DIÁLOGOS NATIVOS
    // -------------------------------------------------------------
    ipcMain.handle('dialog:showMessage', async (event, options) => {
        return await dialog.showMessageBox(options);
    });
}

module.exports = { registerIpcHandlers };
