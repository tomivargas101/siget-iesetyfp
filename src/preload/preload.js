const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sigetApi', {
    auth: {
        checkFirstRun: () => ipcRenderer.invoke('auth:checkFirstRun'),
        firstRunSetup: (payload) => ipcRenderer.invoke('auth:firstRunSetup', payload),
        register: (payload) => ipcRenderer.invoke('auth:register', payload),
        login: (username, password) => ipcRenderer.invoke('auth:login', { username, password }),
        logout: () => ipcRenderer.invoke('auth:logout'),
        getCurrentUser: () => ipcRenderer.invoke('auth:getCurrentUser'),
        getSecurityQuestion: (username) => ipcRenderer.invoke('auth:getSecurityQuestion', username),
        recoverBySecurityAnswer: (payload) => ipcRenderer.invoke('auth:recoverBySecurityAnswer', payload),
        recoverByMasterKey: (payload) => ipcRenderer.invoke('auth:recoverByMasterKey', payload)
    },

    users: {
        getAll: () => ipcRenderer.invoke('users:getAll'),
        getById: (id) => ipcRenderer.invoke('users:getById', id),
        create: (payload) => ipcRenderer.invoke('users:create', payload),
        update: (id, payload) => ipcRenderer.invoke('users:update', { id, payload }),
        resetPassword: (userId, newPassword) => ipcRenderer.invoke('users:resetPassword', { userId, newPassword }),
        toggleActive: (id) => ipcRenderer.invoke('users:toggleActive', id)
    },

    teachers: {
        getAll: (filters) => ipcRenderer.invoke('teachers:getAll', filters),
        getById: (id) => ipcRenderer.invoke('teachers:getById', id),
        save: (payload) => ipcRenderer.invoke('teachers:save', payload),
        toggleActive: (id) => ipcRenderer.invoke('teachers:toggleActive', id),
        delete: (id) => ipcRenderer.invoke('teachers:delete', id)
    },

    designations: {
        getAll: (filters) => ipcRenderer.invoke('designations:getAll', filters),
        getById: (id) => ipcRenderer.invoke('designations:getById', id),
        save: (payload) => ipcRenderer.invoke('designations:save', payload),
        delete: (id) => ipcRenderer.invoke('designations:delete', id),
        getSubstitutions: () => ipcRenderer.invoke('designations:getSubstitutions'),
        saveSubstitution: (payload) => ipcRenderer.invoke('designations:saveSubstitution', payload),
        getCareers: () => ipcRenderer.invoke('designations:getCareers'),
        getCareerById: (id) => ipcRenderer.invoke('designations:getCareerById', id),
        getSubjects: (careerId) => ipcRenderer.invoke('designations:getSubjects', careerId),
        createCareer: (payload) => ipcRenderer.invoke('designations:createCareer', payload),
        updateCareer: (payload) => ipcRenderer.invoke('designations:updateCareer', payload),
        deleteCareer: (id) => ipcRenderer.invoke('designations:deleteCareer', id)
    },

    attendance: {
        getDaily: (dateStr) => ipcRenderer.invoke('attendance:getDaily', dateStr),
        save: (payload) => ipcRenderer.invoke('attendance:save', payload),
        saveDailyRecord: (payload) => ipcRenderer.invoke('attendance:save', payload),
        saveBatch: (dateStr, records) => ipcRenderer.invoke('attendance:saveBatch', { dateStr, records }),
        receivePhysicalForm: (payload) => ipcRenderer.invoke('attendance:receivePhysicalForm', payload),
        parseJustificationFile: (payload) => ipcRenderer.invoke('attendance:parseJustificationFile', payload),
        getSummary: (dateStr) => ipcRenderer.invoke('attendance:getSummary', dateStr),
        exportDailyExcel: (dateStr) => ipcRenderer.invoke('attendance:exportDailyExcel', dateStr),
        exportPrintablePdf: (params) => ipcRenderer.invoke('attendance:exportPrintablePdf', params),
        exportPrintableExcel: (params) => ipcRenderer.invoke('attendance:exportPrintableExcel', params)
    },

    normative: {
        getMasterCatalog: () => ipcRenderer.invoke('normative:getMasterCatalog'),
        getArticleDetails: (key) => ipcRenderer.invoke('normative:getArticleDetails', key),
        getCalendarDayInfo: (dateStr) => ipcRenderer.invoke('normative:getCalendarDayInfo', dateStr)
    },

    csv: {
        parseUniversalFile: (payload) => ipcRenderer.invoke('csv:parseUniversalFile', payload),
        previewPersonnel: (csvText) => ipcRenderer.invoke('csv:previewPersonnel', csvText),
        importPersonnel: (payload) => ipcRenderer.invoke('csv:importPersonnel', payload),
        previewAttendance: (csvText) => ipcRenderer.invoke('csv:previewAttendance', csvText),
        importAttendance: (csvText) => ipcRenderer.invoke('csv:importAttendance', csvText)
    },

    calendar: {
        getTeacherTimeline: (params) => ipcRenderer.invoke('calendar:getTeacherTimeline', params),
        getInstitutionalOverview: (params) => ipcRenderer.invoke('calendar:getInstitutionalOverview', params),
        getMonthMatrix: (params) => ipcRenderer.invoke('calendar:getMonthMatrix', params),
        getInstitutionalDays: (params) => ipcRenderer.invoke('calendar:getInstitutionalDays', params),
        saveInstitutionalDay: (payload) => ipcRenderer.invoke('calendar:saveInstitutionalDay', payload),
        deleteInstitutionalDay: (date) => ipcRenderer.invoke('calendar:deleteInstitutionalDay', date),
        exportMonthExcel: (params) => ipcRenderer.invoke('calendar:exportMonthExcel', params),
        exportMonthPdf: (params) => ipcRenderer.invoke('calendar:exportMonthPdf', params),
        exportTeacherPdf: (params) => ipcRenderer.invoke('calendar:exportTeacherPdf', params),
        exportTeacherExcel: (params) => ipcRenderer.invoke('calendar:exportTeacherExcel', params)
    },

    audit: {
        getAll: (params) => ipcRenderer.invoke('audit:getAll', params),
        exportPdf: (params) => ipcRenderer.invoke('audit:exportPdf', params)
    },

    dashboard: {
        getStats: () => ipcRenderer.invoke('dashboard:getStats')
    },

    reports: {
        getPreview: (year, month) => ipcRenderer.invoke('reports:getPreview', { year, month }),
        generateMonthly: (year, month) => ipcRenderer.invoke('reports:generateMonthly', { year, month }),
        openFile: (filePath) => ipcRenderer.invoke('reports:openFile', filePath)
    },

    dialog: {
        showMessage: (options) => ipcRenderer.invoke('dialog:showMessage', options),
        showSaveDialog: (options) => ipcRenderer.invoke('dialog:showSaveDialog', options)
    }
});
