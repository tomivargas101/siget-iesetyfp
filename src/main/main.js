/**
 * Proceso Principal de Electron para SIGET
 * Sistema Integral de Gestión Educativa Terciaria
 */

// Supresión de advertencias experimentales de Node.js / SQLite al inicio y cierre
if (process && typeof process.emitWarning === 'function') {
    const originalEmitWarning = process.emitWarning;
    process.emitWarning = function(warning, ...args) {
        if (typeof warning === 'string' && warning.includes('SQLite is an experimental feature')) {
            return;
        }
        if (warning && typeof warning === 'object') {
            const msg = String(warning.message || '');
            if (msg.includes('SQLite is an experimental feature') || (warning.name === 'ExperimentalWarning' && msg.includes('SQLite'))) {
                return;
            }
        }
        return originalEmitWarning.apply(process, [warning, ...args]);
    };
}

const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');
const { registerIpcHandlers } = require('./ipcHandlers');
const { closeDatabase } = require('../database/db');

let mainWindow = null;

function createWindow() {
    const iconPath = path.join(__dirname, '../../assets/logo_transparent.png');

    mainWindow = new BrowserWindow({
        width: 1280,
        height: 820,
        minWidth: 1050,
        minHeight: 700,
        center: true,
        title: 'SIGET - Sistema Integral de Gestión Educativa Terciaria',
        icon: iconPath,
        backgroundColor: '#F8FAFC',
        show: false, // Mostrar cuando esté listo para evitar flash blanco
        webPreferences: {
            preload: path.join(__dirname, '../preload/preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
            spellcheck: false
        }
    });

    // Menú de aplicación minimalista institucional
    Menu.setApplicationMenu(null);

    // Cargar interfaz principal
    const indexPath = path.join(__dirname, '../renderer/index.html');
    mainWindow.loadFile(indexPath);

    // Mostrar ventana suavemente
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        if (process.env.SIGET_TEST === '1' || process.argv.includes('--test')) {
            console.log('[TEST] Window ready to show. Electron startup verified successfully!');
            setTimeout(() => {
                app.quit();
            }, 1000);
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// Bloqueo de instancia única
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });

    app.whenReady().then(() => {
        registerIpcHandlers();
        createWindow();

        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) {
                createWindow();
            }
        });
    });
}

app.on('window-all-closed', () => {
    closeDatabase();
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', () => {
    closeDatabase();
});
