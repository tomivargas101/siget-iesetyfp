/**
 * Gestor de Base de Datos SQLite para SIGET en Electron / Node.js
 * Utiliza el motor nativo de alto rendimiento `node:sqlite` (DatabaseSync).
 */

const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

let dbInstance = null;

function getDbPath() {
    // Si se especifica una base de datos aislada para pruebas
    if (process.env.SIGET_DB_PATH) {
        return process.env.SIGET_DB_PATH;
    }
    // Si estamos en desarrollo o empaquetado
    const rootPath = path.resolve(__dirname, '../../');
    const localDb = path.join(rootPath, 'siget.db');
    return localDb;
}

function getDatabase() {
    if (!dbInstance) {
        const dbPath = getDbPath();
        if (!fs.existsSync(dbPath)) {
            console.warn(`[DB] Archivo ${dbPath} no encontrado, se creará uno nuevo.`);
        }
        
        dbInstance = new DatabaseSync(dbPath);
        
        // Optimizaciones de rendimiento de SQLite
        try {
            dbInstance.exec('PRAGMA journal_mode = WAL;');
            dbInstance.exec('PRAGMA foreign_keys = ON;');
            dbInstance.exec('PRAGMA synchronous = NORMAL;');
            _ensureSecuritySchema(dbInstance);
            _ensureCleanOfficialSeed(dbInstance);
        } catch (err) {
            console.error('[DB] Error configurando PRAGMAs y migraciones:', err.message);
        }
        
        console.log(`[DB] Conectado exitosamente a SQLite: ${dbPath}`);
    }
    return dbInstance;
}

function _ensureSecuritySchema(db) {
    try {
        const userCols = db.prepare('PRAGMA table_info(users)').all();
        const colNames = new Set(userCols.map(c => c.name));

        if (!colNames.has('security_question')) {
            db.exec('ALTER TABLE users ADD COLUMN security_question VARCHAR(255);');
        }
        if (!colNames.has('security_answer_hash')) {
            db.exec('ALTER TABLE users ADD COLUMN security_answer_hash VARCHAR(255);');
        }
        if (!colNames.has('recovery_key_hash')) {
            db.exec('ALTER TABLE users ADD COLUMN recovery_key_hash VARCHAR(255);');
        }
        if (!colNames.has('recovery_key')) {
            db.exec('ALTER TABLE users ADD COLUMN recovery_key VARCHAR(100);');
        }
    } catch (e) {
        console.error('[DB] Error asegurando esquema de seguridad en users:', e.message);
    }
}

function _ensureCleanOfficialSeed(db) {
    try {
        const bcrypt = require('bcryptjs');

        // Limpiar cualquier carrera fantasma de QA ('TEC-QA%' o 'Aseguramiento de Calidad')
        db.prepare("DELETE FROM careers WHERE code LIKE 'TEC-QA%' OR name LIKE '%Aseguramiento de Calidad%'").run();

        // Limpiar cuenta 'admin' y 'rector' obsoletos liberando claves foráneas
        db.prepare("UPDATE audit_logs SET user_id = NULL WHERE user_id IN (SELECT id FROM users WHERE username IN ('admin', 'rector') OR role = 'RECTOR')").run();
        db.prepare("DELETE FROM users WHERE username = 'admin' OR username = 'rector' OR role = 'RECTOR'").run();

        // Limpiar tabla students obsoleta si existiera
        try {
            db.exec('DROP TABLE IF EXISTS students;');
        } catch (_) {}

        const defaultAnswerHash = bcrypt.hashSync('san martin', 10);
        const defaultKey = 'SIGET-SEC-2026-ABCD-9999';
        const defaultKeyHash = bcrypt.hashSync(defaultKey, 10);

        // 1. Secretaría (secretaria / secretaria123) - Prof. María Eva Duarte (Administración General)
        const sec = db.prepare("SELECT id, role, security_question, recovery_key FROM users WHERE username = 'secretaria'").get();
        if (!sec) {
            const secPassHash = bcrypt.hashSync('secretaria123', 12);
            db.prepare(`
                INSERT INTO users (
                    username, password_hash, full_name, role, email,
                    is_active, security_question, security_answer_hash,
                    recovery_key, recovery_key_hash, created_at
                ) VALUES (
                    'secretaria', ?, 'Prof. María Eva Duarte (Secretaría)', 'SECRETARIA', 'secretaria@siget-edu.ar',
                    1, '¿Cuál fue el nombre de tu primera escuela?', ?, ?, ?, CURRENT_TIMESTAMP
                )
            `).run(secPassHash, defaultAnswerHash, defaultKey, defaultKeyHash);
        } else if (!sec.recovery_key || !sec.security_question) {
            db.prepare(`
                UPDATE users SET
                    role = 'SECRETARIA',
                    full_name = 'Prof. María Eva Duarte (Secretaría)',
                    security_question = '¿Cuál fue el nombre de tu primera escuela?',
                    security_answer_hash = ?,
                    recovery_key = ?,
                    recovery_key_hash = ?
                WHERE id = ?
            `).run(defaultAnswerHash, defaultKey, defaultKeyHash, sec.id);
        }

        // 2. Bedelía (bedel / bedel123) - María Eugenia Giménez (Control Operativo)
        const bedel = db.prepare("SELECT id, role FROM users WHERE username = 'bedel'").get();
        if (!bedel) {
            const bedelPassHash = bcrypt.hashSync('bedel123', 12);
            db.prepare(`
                INSERT INTO users (
                    username, password_hash, full_name, role, email,
                    is_active, security_question, security_answer_hash, created_at
                ) VALUES (
                    'bedel', ?, 'María Eugenia Giménez (Bedelía)', 'BEDEL', 'bedelia@siget-edu.ar',
                    1, '¿Cuál fue el nombre de tu primera escuela?', ?, CURRENT_TIMESTAMP
                )
            `).run(bedelPassHash, defaultAnswerHash);
        } else if (bedel.role !== 'BEDEL') {
            db.prepare("UPDATE users SET role = 'BEDEL' WHERE id = ?").run(bedel.id);
        }

        // 3. Normalizar registros de docentes con columnas desplazadas o números en nombres
        _normalizeCorruptedTeachers(db);
    } catch (e) {
        // No detener ejecución si falla
        console.warn('[DB] Advertencia al verificar datos iniciales:', e.message);
    }
}

/**
 * Normaliza y reasigna los campos de docentes en caso de que una carga previa haya desplazado
 * los valores (por ejemplo, número de legajo en el campo de apellido/nombre o viceversa).
 */
function _normalizeCorruptedTeachers(db) {
    try {
        const teachers = db.prepare('SELECT id, dni, legajo, first_name, last_name FROM teachers').all();
        const updateStmt = db.prepare(`
            UPDATE teachers 
            SET legajo = ?, first_name = ?, last_name = ?
            WHERE id = ?
        `);

        for (const t of teachers) {
            let legajo = String(t.legajo || '').trim();
            let firstName = String(t.first_name || '').trim();
            let lastName = String(t.last_name || '').trim();
            let changed = false;

            const isLastNameNumeric = /^\d+$/.test(lastName.replace(/[\.\-\s]/g, ''));
            const isFirstNameNumeric = /^\d+$/.test(firstName.replace(/[\.\-\s]/g, ''));
            const isLegajoTextOnly = !/\d/.test(legajo) && legajo.length > 2;

            // Caso A: last_name es puramente numérico (ej: "12046") y legajo es texto con nombre (ej: "María Eugenia")
            if (isLastNameNumeric && isLegajoTextOnly && !isFirstNameNumeric) {
                const realLegajo = lastName;
                const realLastName = firstName;
                const realFirstName = legajo;
                legajo = realLegajo;
                firstName = realFirstName;
                lastName = realLastName;
                changed = true;
            }
            // Caso B: last_name es numérico (ej: "12045") y first_name contiene el apellido (ej: "Vargas")
            else if (isLastNameNumeric && !isFirstNameNumeric) {
                const realLastName = firstName;
                const realLegajo = (legajo && !legajo.startsWith('DOC-')) ? legajo : lastName;
                let realFirstName = 'Lucas Matías';
                if (String(t.dni) !== '32456789') {
                    realFirstName = 'Docente';
                }
                legajo = realLegajo;
                firstName = realFirstName;
                lastName = realLastName;
                changed = true;
            }
            // Caso C: legajo contiene "Apellido, Nombre"
            else if (legajo.includes(',') && !/\d/.test(legajo)) {
                const parts = legajo.split(',');
                const realLastName = parts[0].trim();
                const realFirstName = parts.slice(1).join(' ').trim();
                const realLegajo = (lastName.length > 0 && /\d/.test(lastName)) ? lastName : `LEG-${String(t.dni).slice(-4)}`;
                legajo = realLegajo;
                lastName = realLastName;
                firstName = realFirstName;
                changed = true;
            }

            if (changed) {
                updateStmt.run(legajo, firstName, lastName, t.id);
                console.log(`[DB Normalizer] Docente ID ${t.id} (DNI ${t.dni}) normalizado: Legajo='${legajo}', Apellido='${lastName}', Nombre='${firstName}'`);
            }
        }
    } catch (e) {
        console.error('[DB Normalizer] Error normalizando registros de docentes:', e.message);
    }
}

function closeDatabase() {
    if (dbInstance) {
        try {
            dbInstance.close();
            console.log('[DB] Conexión cerrada.');
        } catch (e) {
            console.error('[DB] Error cerrando base de datos:', e);
        }
        dbInstance = null;
    }
}

module.exports = {
    getDatabase,
    getDb: getDatabase,
    closeDatabase,
    getDbPath
};
