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

const { app, BrowserWindow, Menu, nativeTheme } = require('electron');
const path = require('path');
const { registerIpcHandlers } = require('./ipcHandlers');
const { closeDatabase } = require('../database/db');

let mainWindow = null;

function createWindow() {
    nativeTheme.themeSource = 'dark';
    const iconPath = path.join(__dirname, '../../assets/logo_transparent.png');

    mainWindow = new BrowserWindow({
        width: 1280,
        height: 820,
        minWidth: 1050,
        minHeight: 700,
        center: true,
        title: 'SIGET - Sistema Integral de Gestión Educativa Terciaria',
        icon: iconPath,
        backgroundColor: '#18181B',
        show: false,
        webPreferences: {
            preload: path.join(__dirname, '../preload/preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
            spellcheck: false
        }
    });

    Menu.setApplicationMenu(null);

    const indexPath = path.join(__dirname, '../renderer/index.html');
    mainWindow.loadFile(indexPath);

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

    app.whenReady().then(async () => {
        registerIpcHandlers();

        if (process.argv.includes('--export-schema-pdf')) {
            const { SchemaPdfService } = require('../services/schemaPdfService');
            try {
                const res = await SchemaPdfService.generateSchemaPdf();
                console.log(`[SCHEMA_PDF_SUCCESS] ${res.filePath}`);
                app.exit(0);
            } catch (err) {
                console.error('[SCHEMA_PDF_ERROR]', err);
                app.exit(1);
            }
            return;
        }

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
