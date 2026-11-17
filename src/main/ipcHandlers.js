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
            let outputPath = typeof params === 'object' ? params?.outputPath : null;

            if (!outputPath) {
                const win = BrowserWindow.fromWebContents(event.sender);
                const targetDate = dateStr || new Date().toISOString().split('T')[0];
                const defaultName = `Parte_Diario_Docentes_${targetDate}.xlsx`;
                const saveRes = await dialog.showSaveDialog(win, {
                    title: 'Guardar Parte Diario de Asistencias (Excel)',
                    defaultPath: defaultName,
                    filters: [{ name: 'Libro de Excel (*.xlsx)', extensions: ['xlsx'] }]
                });
                if (saveRes.canceled || !saveRes.filePath) {
                    return { success: false, canceled: true, message: 'Exportación cancelada por el usuario.' };
                }
                outputPath = saveRes.filePath;
            }

            const res = await AttendanceService.exportDailyExcel({ dateStr, outputPath });
            return JSON.parse(JSON.stringify(res));
        } catch (err) {
            console.error('[IPC attendance:exportDailyExcel] Error:', err);
            return { success: false, message: err.message };
        }
    });

    ipcMain.handle('attendance:exportPrintablePdf', async (event, params) => {
        try {
            const dateStr = typeof params === 'string' ? params : (params?.dateStr || params?.date);
            let outputPath = typeof params === 'object' ? params?.outputPath : null;

            if (!outputPath) {
                const win = BrowserWindow.fromWebContents(event.sender);
                const targetDate = dateStr || new Date().toISOString().split('T')[0];
                const defaultName = `Planilla_Imprimible_Control_Diario_${targetDate}.pdf`;
                const saveRes = await dialog.showSaveDialog(win, {
                    title: 'Guardar Planilla Imprimible de Control Diario (PDF)',
                    defaultPath: defaultName,
                    filters: [{ name: 'Documento PDF (*.pdf)', extensions: ['pdf'] }]
                });
                if (saveRes.canceled || !saveRes.filePath) {
                    return { success: false, canceled: true, message: 'Exportación cancelada por el usuario.' };
                }
                outputPath = saveRes.filePath;
            }

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
            let outputPath = typeof params === 'object' ? params?.outputPath : null;

            if (!outputPath) {
                const win = BrowserWindow.fromWebContents(event.sender);
                const targetDate = dateStr || new Date().toISOString().split('T')[0];
                const defaultName = `Planilla_Imprimible_Control_Diario_${targetDate}.xlsx`;
                const saveRes = await dialog.showSaveDialog(win, {
                    title: 'Guardar Planilla Imprimible de Control Diario (Excel)',
                    defaultPath: defaultName,
                    filters: [{ name: 'Libro de Excel (*.xlsx)', extensions: ['xlsx'] }]
                });
                if (saveRes.canceled || !saveRes.filePath) {
                    return { success: false, canceled: true, message: 'Exportación cancelada por el usuario.' };
                }
                outputPath = saveRes.filePath;
            }

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
        try {
            let outputPath = params?.outputPath;
            if (!outputPath) {
                const win = BrowserWindow.fromWebContents(event.sender);
                const y = params?.year || new Date().getFullYear();
                const m = String(params?.month || (new Date().getMonth() + 1)).padStart(2, '0');
                const defaultName = `Planilla_Mensual_Docentes_${y}_${m}.xlsx`;
                const saveRes = await dialog.showSaveDialog(win, {
                    title: 'Guardar Planilla Mensual Oficial (Excel)',
                    defaultPath: defaultName,
                    filters: [{ name: 'Libro de Excel (*.xlsx)', extensions: ['xlsx'] }]
                });
                if (saveRes.canceled || !saveRes.filePath) {
                    return { success: false, canceled: true, message: 'Exportación cancelada por el usuario.' };
                }
                outputPath = saveRes.filePath;
            }
            return await TeacherCalendarService.exportMonthExcel({ ...params, outputPath });
        } catch (err) {
            console.error('[IPC calendar:exportMonthExcel] Error:', err);
            return { success: false, message: err.message };
        }
    });

    ipcMain.handle('calendar:exportMonthPdf', async (event, params) => {
        try {
            let outputPath = params?.outputPath;
            if (!outputPath) {
                const win = BrowserWindow.fromWebContents(event.sender);
                const y = params?.year || new Date().getFullYear();
                const m = String(params?.month || (new Date().getMonth() + 1)).padStart(2, '0');
                const defaultName = `Calendario_Academico_${y}_${m}.pdf`;
                const saveRes = await dialog.showSaveDialog(win, {
                    title: 'Guardar Calendario Institucional (PDF)',
                    defaultPath: defaultName,
                    filters: [{ name: 'Documento PDF (*.pdf)', extensions: ['pdf'] }]
                });
                if (saveRes.canceled || !saveRes.filePath) {
                    return { success: false, canceled: true, message: 'Exportación cancelada por el usuario.' };
                }
                outputPath = saveRes.filePath;
            }
            return await TeacherCalendarService.exportMonthPdf({ ...params, outputPath });
        } catch (err) {
            console.error('[IPC calendar:exportMonthPdf] Error:', err);
            return { success: false, message: err.message };
        }
    });

    ipcMain.handle('calendar:exportTeacherPdf', async (event, params) => {
        try {
            let outputPath = params?.outputPath;
            if (!outputPath) {
                const win = BrowserWindow.fromWebContents(event.sender);
                const defaultName = `Ficha_Docente_${params?.teacherId || 'ID'}_${params?.startDate || 'INI'}_${params?.endDate || 'FIN'}.pdf`;
                const saveRes = await dialog.showSaveDialog(win, {
                    title: 'Guardar Ficha Docente Oficial (PDF)',
                    defaultPath: defaultName,
                    filters: [{ name: 'Documento PDF (*.pdf)', extensions: ['pdf'] }]
                });
                if (saveRes.canceled || !saveRes.filePath) {
                    return { success: false, canceled: true, message: 'Exportación cancelada por el usuario.' };
                }
                outputPath = saveRes.filePath;
            }
            const currentUser = AuthService.getCurrentUser();
            const res = await TeacherCalendarService.exportTeacherRecordPdf({
                ...params,
                outputPath,
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
            let outputPath = params?.outputPath;
            if (!outputPath) {
                const win = BrowserWindow.fromWebContents(event.sender);
                const defaultName = `Ficha_Docente_${params?.teacherId || 'ID'}_${params?.startDate || 'INI'}_${params?.endDate || 'FIN'}.xlsx`;
                const saveRes = await dialog.showSaveDialog(win, {
                    title: 'Guardar Ficha Docente Oficial (Excel)',
                    defaultPath: defaultName,
                    filters: [{ name: 'Libro de Excel (*.xlsx)', extensions: ['xlsx'] }]
                });
                if (saveRes.canceled || !saveRes.filePath) {
                    return { success: false, canceled: true, message: 'Exportación cancelada por el usuario.' };
                }
                outputPath = saveRes.filePath;
            }
            const res = await TeacherCalendarService.exportTeacherRecordExcel({ ...params, outputPath });
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
        try {
            let outputPath = params?.outputPath;
            if (!outputPath) {
                const win = BrowserWindow.fromWebContents(event.sender);
                const now = new Date();
                const yyyy = now.getFullYear();
                const mm = String(now.getMonth() + 1).padStart(2, '0');
                const dd = String(now.getDate()).padStart(2, '0');
                const defaultName = `Registro_Auditoria_SIGET_${yyyy}${mm}${dd}.pdf`;
                const saveRes = await dialog.showSaveDialog(win, {
                    title: 'Guardar Registro Oficial de Acciones (PDF)',
                    defaultPath: defaultName,
                    filters: [{ name: 'Documento PDF (*.pdf)', extensions: ['pdf'] }]
                });
                if (saveRes.canceled || !saveRes.filePath) {
                    return { success: false, canceled: true, message: 'Exportación cancelada por el usuario.' };
                }
                outputPath = saveRes.filePath;
            }
            const res = await AuditService.generateAuditPdf({ ...params, outputPath });
            return JSON.parse(JSON.stringify(res));
        } catch (err) {
            console.error('[IPC audit:exportPdf] Error:', err);
            return { success: false, message: err.message };
        }
    });

    ipcMain.handle('dashboard:getStats', () => {
        return DashboardService.getStats();
    });

    ipcMain.handle('reports:getPreview', async (event, { year, month }) => {
        const { AttendanceProcessor } = require('../services/attendanceProcessor');
        return AttendanceProcessor.processMonthlyRecords(Number(year), Number(month));
    });

    ipcMain.handle('reports:generateMonthly', async (event, params) => {
        try {
            const year = params?.year;
            const month = params?.month;
            let outputPath = params?.outputPath;
            if (!outputPath) {
                const win = BrowserWindow.fromWebContents(event.sender);
                const defaultName = `Planilla_Estadistica_Mensual_${year}_${String(month).padStart(2, '0')}.xlsx`;
                const saveRes = await dialog.showSaveDialog(win, {
                    title: 'Guardar Planilla Estadística Mensual (Excel)',
                    defaultPath: defaultName,
                    filters: [{ name: 'Libro de Excel (*.xlsx)', extensions: ['xlsx'] }]
                });
                if (saveRes.canceled || !saveRes.filePath) {
                    return { success: false, canceled: true, message: 'Exportación cancelada por el usuario.' };
                }
                outputPath = saveRes.filePath;
            }
            return await ReportService.generateMonthlyWorkbook(year, month, null, outputPath);
        } catch (err) {
            console.error('[IPC reports:generateMonthly] Error:', err);
            return { success: false, message: err.message };
        }
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
