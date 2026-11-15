const { ipcMain, dialog, shell, BrowserWindow } = require('electron');
const { AuthService } = require('../services/authService');
const { UserService } = require('../services/userService');
const { TeacherService } = require('../services/teacherService');
const { DesignationService } = require('../services/designationService');
const { AttendanceService } = require('../services/attendanceService');
const { CsvImportService } = require('../services/csvImportService');
const { TeacherCalendarService } = require('../services/teacherCalendarService');
const { DashboardService } = require('../services/dashboardService');
const { ReportService } = require('../services/reportService');
const { AuditService } = require('../services/auditService');

function registerIpcHandlers() {
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

    ipcMain.handle('attendance:parseJustificationFile', async (event, { fileBufferBase64, fileName }) => {
        const fileBuffer = fileBufferBase64 ? Buffer.from(fileBufferBase64, 'base64') : Buffer.alloc(0);
        return await AttendanceService.parseJustificationFile({ fileBuffer, fileName });
    });

    ipcMain.handle('attendance:getSummary', (event, dateStr) => {
        return AttendanceService.getSummary(dateStr);
    });

    ipcMain.handle('attendance:exportDailyExcel', async (event, params) => {
        try {
            const dateStr = typeof params === 'string' ? params : (params?.dateStr || params?.date);
            const res = await AttendanceService.exportDailyExcel({ dateStr });
            return JSON.parse(JSON.stringify(res));
        } catch (err) {
            console.error('[IPC attendance:exportDailyExcel] Error:', err);
            return { success: false, message: err.message };
        }
    });

    ipcMain.handle('attendance:exportPrintablePdf', async (event, params) => {
        try {
            const dateStr = typeof params === 'string' ? params : (params?.dateStr || params?.date);
            const outputPath = typeof params === 'object' ? params?.outputPath : null;
            const currentUser = AuthService.getCurrentUser();
            const res = await AttendanceService.exportPrintableDailyPdf({
                dateStr,
                outputPath,
                exportedBy: currentUser ? `${currentUser.first_name || ''} ${currentUser.last_name || ''}`.trim() : 'Bedelía'
            });
            return JSON.parse(JSON.stringify(res));
        } catch (err) {
            console.error('[IPC attendance:exportPrintablePdf] Error:', err);
            return { success: false, message: err.message };
        }
    });

    ipcMain.handle('attendance:exportPrintableExcel', async (event, params) => {
        try {
            const dateStr = typeof params === 'string' ? params : (params?.dateStr || params?.date);
            const outputPath = typeof params === 'object' ? params?.outputPath : null;
            const res = await AttendanceService.exportPrintableDailyExcel({ dateStr, outputPath });
            return JSON.parse(JSON.stringify(res));
        } catch (err) {
            console.error('[IPC attendance:exportPrintableExcel] Error:', err);
            return { success: false, message: err.message };
        }
    });

    ipcMain.handle('normative:getMasterCatalog', () => {
        const { NormativeService } = require('../services/normativeService');
        return NormativeService.getMasterCatalog();
    });

    ipcMain.handle('normative:getArticleDetails', (event, key) => {
        const { NormativeService } = require('../services/normativeService');
        return NormativeService.getArticleDetails(key);
    });

    ipcMain.handle('normative:getCalendarDayInfo', (event, dateStr) => {
        const { NormativeService } = require('../services/normativeService');
        return NormativeService.getCalendarDayInfo(dateStr);
    });

    ipcMain.handle('csv:parseUniversalFile', async (event, { fileBufferBase64, fileName, explicitType }) => {
        const fileBuffer = fileBufferBase64 ? Buffer.from(fileBufferBase64, 'base64') : Buffer.alloc(0);
        return await CsvImportService.parseUniversalFile({ fileBuffer, fileName, explicitType });
    });

    ipcMain.handle('csv:previewPersonnel', (event, csvText) => {
        return CsvImportService.previewPersonnel(csvText);
    });

    ipcMain.handle('csv:importPersonnel', (event, { csvText, updateExisting, createDesignations }) => {
        return CsvImportService.importPersonnel(csvText, { updateExisting, createDesignations });
    });

    ipcMain.handle('csv:previewAttendance', (event, csvText) => {
        return CsvImportService.previewAttendance(csvText);
    });

    ipcMain.handle('csv:importAttendance', (event, csvText) => {
        return CsvImportService.importAttendance(csvText);
    });

    ipcMain.handle('calendar:getTeacherTimeline', (event, params) => {
        const res = TeacherCalendarService.getTeacherTimeline(params);
        return JSON.parse(JSON.stringify(res));
    });

    ipcMain.handle('calendar:getInstitutionalOverview', (event, params) => {
        const res = TeacherCalendarService.getInstitutionalOverview(params);
        return JSON.parse(JSON.stringify(res));
    });

    ipcMain.handle('calendar:getMonthMatrix', async (event, params) => {
        try {
            const matrix = await TeacherCalendarService.getMonthMatrix(params);
            return JSON.parse(JSON.stringify(matrix));
        } catch (err) {
            console.error('[IPC calendar:getMonthMatrix] Error serializando matriz del mes:', err);
            return { success: false, message: err.message, days: [] };
        }
    });

    ipcMain.handle('calendar:getInstitutionalDays', (event, params) => {
        const { NormativeService } = require('../services/normativeService');
        return NormativeService.getInstitutionalDays(params?.year, params?.month);
    });

    ipcMain.handle('calendar:saveInstitutionalDay', (event, payload) => {
        const { NormativeService } = require('../services/normativeService');
        return NormativeService.saveInstitutionalDay(payload);
    });

    ipcMain.handle('calendar:deleteInstitutionalDay', (event, date) => {
        const { NormativeService } = require('../services/normativeService');
        return NormativeService.deleteInstitutionalDay(date);
    });

    ipcMain.handle('calendar:exportMonthExcel', async (event, params) => {
        return await TeacherCalendarService.exportMonthExcel(params);
    });

    ipcMain.handle('calendar:exportMonthPdf', async (event, params) => {
        return await TeacherCalendarService.exportMonthPdf(params);
    });

    ipcMain.handle('calendar:exportTeacherPdf', async (event, params) => {
        try {
            const currentUser = AuthService.getCurrentUser();
            const res = await TeacherCalendarService.exportTeacherRecordPdf({
                ...params,
                exportedBy: currentUser ? `${currentUser.first_name || ''} ${currentUser.last_name || ''}`.trim() : 'Bedelía'
            });
            return JSON.parse(JSON.stringify(res));
        } catch (err) {
            console.error('[IPC calendar:exportTeacherPdf] Error:', err);
            return { success: false, message: err.message };
        }
    });

    ipcMain.handle('calendar:exportTeacherExcel', async (event, params) => {
        try {
            const res = await TeacherCalendarService.exportTeacherRecordExcel(params);
            return JSON.parse(JSON.stringify(res));
        } catch (err) {
            console.error('[IPC calendar:exportTeacherExcel] Error:', err);
            return { success: false, message: err.message };
        }
    });

    ipcMain.handle('audit:getAll', (event, params) => {
        return AuditService.getAllLogs(params);
    });

    ipcMain.handle('audit:exportPdf', async (event, params) => {
        return await AuditService.generateAuditPdf(params);
    });

    ipcMain.handle('dashboard:getStats', () => {
        return DashboardService.getStats();
    });

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

    ipcMain.handle('dialog:showMessage', async (event, options) => {
        return await dialog.showMessageBox(options);
    });

    ipcMain.handle('dialog:showSaveDialog', async (event, options) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        return await dialog.showSaveDialog(win, options);
    });
}

module.exports = { registerIpcHandlers };
