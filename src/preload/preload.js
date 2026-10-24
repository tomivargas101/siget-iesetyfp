/**
 * Preload Script seguro para SIGET (Electron)
 * Expone la API tipada en window.sigetApi mediante contextBridge sin comprometer la seguridad.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sigetApi', {
    // Autenticación, Configuración Inicial y Recuperación Offline
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

    // Gestión de Usuarios y Roles Secundarios (Rector)
    users: {
        getAll: () => ipcRenderer.invoke('users:getAll'),
        getById: (id) => ipcRenderer.invoke('users:getById', id),
        create: (payload) => ipcRenderer.invoke('users:create', payload),
        update: (id, payload) => ipcRenderer.invoke('users:update', { id, payload }),
        resetPassword: (userId, newPassword) => ipcRenderer.invoke('users:resetPassword', { userId, newPassword }),
        toggleActive: (id) => ipcRenderer.invoke('users:toggleActive', id)
    },

    // Docentes y Legajos
    teachers: {
        getAll: (filters) => ipcRenderer.invoke('teachers:getAll', filters),
        getById: (id) => ipcRenderer.invoke('teachers:getById', id),
        save: (payload) => ipcRenderer.invoke('teachers:save', payload),
        toggleActive: (id) => ipcRenderer.invoke('teachers:toggleActive', id),
        delete: (id) => ipcRenderer.invoke('teachers:delete', id)
    },

    // Cátedras, Designaciones y Suplencias
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

    // Asistencias y Novedades Diarias
    attendance: {
        getDaily: (dateStr) => ipcRenderer.invoke('attendance:getDaily', dateStr),
        save: (payload) => ipcRenderer.invoke('attendance:save', payload),
        saveBatch: (dateStr, records) => ipcRenderer.invoke('attendance:saveBatch', { dateStr, records }),
        receivePhysicalForm: (payload) => ipcRenderer.invoke('attendance:receivePhysicalForm', payload),
        getSummary: (dateStr) => ipcRenderer.invoke('attendance:getSummary', dateStr)
    },

    // Catálogo Maestro Normativo (IL-01 / IL-02)
    normative: {
        getMasterCatalog: () => ipcRenderer.invoke('normative:getMasterCatalog'),
        getArticleDetails: (key) => ipcRenderer.invoke('normative:getArticleDetails', key)
    },

    // Alumnos e Inscripciones
    students: {
        getAll: (filters) => ipcRenderer.invoke('students:getAll', filters),
        getById: (id) => ipcRenderer.invoke('students:getById', id),
        save: (payload) => ipcRenderer.invoke('students:save', payload),
        toggleActive: (id) => ipcRenderer.invoke('students:toggleActive', id),
        delete: (id) => ipcRenderer.invoke('students:delete', id)
    },

    // Dashboard y Estadísticas
    dashboard: {
        getStats: () => ipcRenderer.invoke('dashboard:getStats')
    },

    // Reportes Oficiales Excel
    reports: {
        getPreview: (year, month) => ipcRenderer.invoke('reports:getPreview', { year, month }),
        generateMonthly: (year, month) => ipcRenderer.invoke('reports:generateMonthly', { year, month }),
        openFile: (filePath) => ipcRenderer.invoke('reports:openFile', filePath)
    },

    // Diálogos del sistema
    dialog: {
        showMessage: (options) => ipcRenderer.invoke('dialog:showMessage', options)
    }
});
