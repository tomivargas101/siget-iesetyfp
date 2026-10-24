/**
 * Servicio de Autenticación, Registro Inicial y Recuperación Offline para SIGET
 * Implementa:
 * - First-Run Setup (Configuración inicial de cuenta maestra Rector)
 * - Generación de Master Recovery Key de rescate
 * - Pregunta de seguridad con respuesta hasheada
 * - Recuperación offline por pregunta o clave maestra
 * - Autenticación segura con bcryptjs
 */

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { getDatabase } = require('../database/db');
const { AuditService } = require('./auditService');

let currentUser = null;

class AuthService {
    /**
     * Genera una Clave Maestra de Rescate con formato institucional:
     * SIGET-XXXX-XXXX-XXXX-XXXX (alfanumérico de alta entropía)
     */
    static generateMasterRecoveryKey() {
        const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // Excluye 0, O, 1, I para evitar ambigüedades
        const generateChunk = (len = 4) => {
            const bytes = crypto.randomBytes(len);
            let chunk = '';
            for (let i = 0; i < len; i++) {
                chunk += chars[bytes[i] % chars.length];
            }
            return chunk;
        };

        return `SIGET-${generateChunk(4)}-${generateChunk(4)}-${generateChunk(4)}-${generateChunk(4)}`;
    }

    /**
     * Comprueba si la aplicación se ejecuta por primera vez
     * (sin usuarios o sin cuenta activa de Rector)
     */
    static checkFirstRun() {
        const db = getDatabase();
        try {
            const userCount = db.prepare('SELECT COUNT(*) as count FROM users WHERE is_active = 1').get().count;
            if (userCount === 0) {
                return { isFirstRun: true, reason: 'NO_USERS' };
            }

            const rectorCount = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'RECTOR' AND is_active = 1").get().count;
            if (rectorCount === 0) {
                return { isFirstRun: true, reason: 'NO_ACTIVE_RECTOR' };
            }

            // Asegurar que el rector semilla tenga pregunta y clave maestra si es base previa
            this.ensureDefaultSecurityForSeededRector();

            return { isFirstRun: false, count: userCount };
        } catch (error) {
            console.error('[AuthService] Error comprobando first-run:', error);
            return { isFirstRun: false, error: error.message };
        }
    }

    /**
     * Configuración Inicial Obligatoria (First-Run Setup)
     * Crea la cuenta maestra de Rector con contraseña, pregunta de seguridad y Master Key.
     */
    static async firstRunSetup({ fullName, username, password, securityQuestion, securityAnswer, email = '' }) {
        const db = getDatabase();
        try {
            if (!fullName || !username || !password || !securityQuestion || !securityAnswer) {
                return {
                    success: false,
                    message: 'Todos los campos marcados con (*) son obligatorios para la configuración inicial.'
                };
            }

            if (password.length < 6) {
                return { success: false, message: 'La contraseña del Rector debe tener al menos 6 caracteres.' };
            }

            const cleanUsername = username.trim().toLowerCase();
            const passwordHash = bcrypt.hashSync(password, 12);
            const answerHash = bcrypt.hashSync(securityAnswer.trim().toLowerCase(), 10);

            // Generar Master Recovery Key
            const masterRecoveryKey = this.generateMasterRecoveryKey();
            const recoveryKeyHash = bcrypt.hashSync(masterRecoveryKey, 10);

            const now = AuditService.getArgentinaTimestamp();

            const result = db.prepare(`
                INSERT INTO users (
                    username, password_hash, full_name, role, email,
                    is_active, security_question, security_answer_hash,
                    recovery_key, recovery_key_hash, created_at, last_login
                ) VALUES (?, ?, ?, 'RECTOR', ?, 1, ?, ?, ?, ?, ?, ?)
            `).run(
                cleanUsername,
                passwordHash,
                fullName.trim(),
                email ? email.trim() : null,
                securityQuestion.trim(),
                answerHash,
                masterRecoveryKey,
                recoveryKeyHash,
                now,
                now
            );

            currentUser = {
                id: result.lastInsertRowid,
                username: cleanUsername,
                fullName: fullName.trim(),
                role: 'RECTOR',
                email: email ? email.trim() : ''
            };

            AuditService.log(
                currentUser.id,
                cleanUsername,
                'CONFIGURACION_INICIAL',
                'Instalación y configuración inicial de SIGET: Cuenta maestra de Rector creada'
            );

            return {
                success: true,
                message: 'Cuenta maestra de Rector configurada exitosamente.',
                user: currentUser,
                masterRecoveryKey
            };
        } catch (error) {
            console.error('[AuthService] Error en firstRunSetup:', error);
            return { success: false, message: `Error en configuración inicial: ${error.message}` };
        }
    }

    /**
     * Registro institucional de nueva cuenta de usuario
     * Permite alta desde la pantalla de login con selección de rol (RECTOR, BEDEL, SECRETARIO)
     */
    static async registerUser({
        fullName,
        username,
        password,
        role = 'BEDEL',
        email = '',
        securityQuestion,
        securityAnswer
    }) {
        if (!fullName || !username || !password || !securityQuestion || !securityAnswer) {
            return { success: false, message: 'Todos los campos obligatorios deben ser completados.' };
        }

        if (password.length < 6) {
            return { success: false, message: 'La contraseña debe tener al menos 6 caracteres.' };
        }

        const VALID_ROLES = ['RECTOR', 'SECRETARIA', 'BEDEL'];
        const normalizedRole = AuthService.normalizeRole(role);
        if (!VALID_ROLES.includes(normalizedRole)) {
            return { success: false, message: `Rol no válido. La estructura institucional admite únicamente: Rector, Secretaría o Bedelía.` };
        }

        const db = getDatabase();
        try {
            const cleanUsername = username.trim().toLowerCase();
            const existing = db.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE').get(cleanUsername);
            if (existing) {
                return { success: false, message: `El nombre de usuario '${cleanUsername}' ya está registrado.` };
            }

            const passwordHash = bcrypt.hashSync(password, 12);
            const answerHash = bcrypt.hashSync(securityAnswer.trim().toLowerCase(), 10);
            const now = AuditService.getArgentinaTimestamp();

            let masterRecoveryKey = null;
            let recoveryKeyHash = null;

            if (normalizedRole === 'RECTOR') {
                masterRecoveryKey = this.generateMasterRecoveryKey();
                recoveryKeyHash = bcrypt.hashSync(masterRecoveryKey, 10);
            }

            const result = db.prepare(`
                INSERT INTO users (
                    username, password_hash, full_name, role, email,
                    is_active, security_question, security_answer_hash,
                    recovery_key, recovery_key_hash, created_at
                ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
            `).run(
                cleanUsername,
                passwordHash,
                fullName.trim(),
                normalizedRole,
                email ? email.trim() : null,
                securityQuestion.trim(),
                answerHash,
                masterRecoveryKey,
                recoveryKeyHash,
                now
            );

            AuditService.log(
                result.lastInsertRowid,
                cleanUsername,
                'REGISTRO_CUENTA',
                `Nuevo registro de usuario '${cleanUsername}' con rol '${normalizedRole}'`
            );

            return {
                success: true,
                message: `Cuenta de usuario '${cleanUsername}' registrada correctamente con rol ${normalizedRole}.`,
                userId: result.lastInsertRowid,
                username: cleanUsername,
                role: normalizedRole,
                masterRecoveryKey
            };
        } catch (error) {
            console.error('[AuthService] Error en registerUser:', error);
            return { success: false, message: `Error al registrar usuario: ${error.message}` };
        }
    }

    /**
     * Garantiza que el usuario rector existente en la base tenga pregunta y Master Key configurada
     */
    static ensureDefaultSecurityForSeededRector() {
        const db = getDatabase();
        try {
            const rector = db.prepare("SELECT id, security_question, recovery_key FROM users WHERE username = 'rector'").get();
            if (rector && (!rector.security_question || !rector.recovery_key)) {
                const defaultKey = 'SIGET-RECT-2026-ABCD-9999';
                const keyHash = bcrypt.hashSync(defaultKey, 10);
                const answerHash = bcrypt.hashSync('san martin', 10);

                db.prepare(`
                    UPDATE users SET
                        security_question = '¿Cuál fue el nombre de tu primera escuela?',
                        security_answer_hash = ?,
                        recovery_key = ?,
                        recovery_key_hash = ?
                    WHERE id = ?
                `).run(answerHash, defaultKey, keyHash, rector.id);
            }
        } catch (e) {
            // No interrumpir si falla
        }
    }

    static normalizeRole(role) {
        if (!role) return 'BEDEL';
        const r = String(role).trim().toUpperCase();
        if (r === 'RECTOR' || r === 'RECTORA') return 'RECTOR';
        if (r === 'SECRETARIA' || r === 'SECRETARIO' || r === 'SECRETARÍA') return 'SECRETARIA';
        if (r === 'BEDEL' || r === 'BEDELIA' || r === 'BEDELÍA') return 'BEDEL';
        return r;
    }

    /**
     * Inicio de Sesión Institucional
     */
    static async login(username, password) {
        if (!username || !password) {
            return { success: false, message: 'Ingrese usuario y contraseña.' };
        }

        const db = getDatabase();
        try {
            const cleanUser = username.trim();
            let user = db.prepare(`
                SELECT id, username, password_hash, full_name, role, email, is_active 
                FROM users 
                WHERE username = ? COLLATE NOCASE
            `).get(cleanUser);

            // Flexibilidad institucional: si ingresan 'secretario', buscar 'secretaria'
            if (!user && cleanUser.toLowerCase() === 'secretario') {
                user = db.prepare(`
                    SELECT id, username, password_hash, full_name, role, email, is_active 
                    FROM users 
                    WHERE username = 'secretaria' COLLATE NOCASE
                `).get();
            }

            if (!user) {
                return { success: false, message: 'Usuario o contraseña incorrectos.' };
            }

            if (!user.is_active) {
                return { success: false, message: 'El usuario se encuentra inhabilitado. Consulte al Rector.' };
            }

            const match = bcrypt.compareSync(password, user.password_hash);
            if (!match) {
                return { success: false, message: 'Usuario o contraseña incorrectos.' };
            }

            // Actualizar último inicio de sesión
            const now = AuditService.getArgentinaTimestamp();
            db.prepare('UPDATE users SET last_login = ? WHERE id = ?').run(now, user.id);

            const userRole = AuthService.normalizeRole(user.role);
            currentUser = {
                id: user.id,
                username: user.username,
                fullName: user.full_name,
                role: userRole,
                email: user.email || ''
            };

            AuditService.log(user.id, user.username, 'INICIO_SESION', 'Inicio de sesión exitoso en SIGET');

            return {
                success: true,
                message: `Bienvenido/a, ${user.full_name}`,
                user: currentUser
            };
        } catch (error) {
            console.error('[AuthService] Error en login:', error);
            return { success: false, message: `Error en autenticación: ${error.message}` };
        }
    }

    static logout() {
        if (currentUser) {
            AuditService.log(currentUser.id, currentUser.username, 'CIERRE_SESION', 'Sesión cerrada por el usuario');
            currentUser = null;
        }
        return { success: true };
    }

    static getCurrentUser() {
        return currentUser;
    }

    static isRector() {
        return currentUser && currentUser.role === 'RECTOR';
    }

    static isSecretaria() {
        return currentUser && currentUser.role === 'SECRETARIA';
    }

    static isBedel() {
        return currentUser && currentUser.role === 'BEDEL';
    }

    /**
     * Obtiene la pregunta de seguridad configurada para un usuario
     */
    static getSecurityQuestion(username) {
        if (!username || !username.trim()) {
            return { success: false, message: 'Ingrese el nombre de usuario.' };
        }

        const db = getDatabase();
        try {
            const user = db.prepare(`
                SELECT id, username, security_question, role 
                FROM users 
                WHERE username = ? COLLATE NOCASE AND is_active = 1
            `).get(username.trim());

            if (!user) {
                return { success: false, message: 'Usuario no encontrado o inactivo.' };
            }

            if (!user.security_question) {
                return {
                    success: false,
                    message: 'El usuario no tiene una pregunta de seguridad configurada. Utilice la Clave Maestra de Rescate o consulte al Rector.'
                };
            }

            return {
                success: true,
                username: user.username,
                question: user.security_question,
                role: user.role
            };
        } catch (error) {
            console.error('[AuthService] Error obteniendo pregunta de seguridad:', error);
            return { success: false, message: error.message };
        }
    }

    /**
     * Recuperación Offline mediante Respuesta a la Pregunta de Seguridad
     */
    static recoverBySecurityAnswer(username, answer, newPassword) {
        if (!username || !answer || !newPassword) {
            return { success: false, message: 'Complete todos los campos requeridos.' };
        }

        if (newPassword.length < 6) {
            return { success: false, message: 'La nueva contraseña debe tener al menos 6 caracteres.' };
        }

        const db = getDatabase();
        try {
            const user = db.prepare(`
                SELECT id, username, security_answer_hash 
                FROM users 
                WHERE username = ? COLLATE NOCASE AND is_active = 1
            `).get(username.trim());

            if (!user || !user.security_answer_hash) {
                return { success: false, message: 'No es posible verificar la respuesta para este usuario.' };
            }

            const cleanAnswer = answer.trim().toLowerCase();
            const match = bcrypt.compareSync(cleanAnswer, user.security_answer_hash);

            if (!match) {
                return { success: false, message: 'Respuesta de seguridad incorrecta.' };
            }

            const newPasswordHash = bcrypt.hashSync(newPassword, 12);
            db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newPasswordHash, user.id);

            AuditService.log(
                user.id,
                user.username,
                'RECUPERACION_PASSWORD_PREGUNTA',
                `Contraseña restablecida exitosamente mediante pregunta de seguridad`
            );

            return {
                success: true,
                message: 'Contraseña restablecida con éxito. Ya puede iniciar sesión con su nueva clave.'
            };
        } catch (error) {
            console.error('[AuthService] Error recuperando por pregunta:', error);
            return { success: false, message: error.message };
        }
    }

    /**
     * Recuperación Offline mediante Clave Maestra de Rescate (Master Recovery Key)
     */
    static recoverByMasterKey(username, masterKey, newPassword) {
        if (!username || !masterKey || !newPassword) {
            return { success: false, message: 'Complete todos los campos requeridos.' };
        }

        if (newPassword.length < 6) {
            return { success: false, message: 'La nueva contraseña debe tener al menos 6 caracteres.' };
        }

        const db = getDatabase();
        try {
            const user = db.prepare(`
                SELECT id, username, role, recovery_key, recovery_key_hash 
                FROM users 
                WHERE username = ? COLLATE NOCASE AND is_active = 1
            `).get(username.trim());

            if (!user) {
                return { success: false, message: 'Usuario no encontrado o inactivo.' };
            }

            const cleanKeyInput = masterKey.trim().toUpperCase();
            let isValidKey = false;

            // Comparar contra recovery_key_hash o recovery_key plano
            if (user.recovery_key && cleanKeyInput === user.recovery_key.toUpperCase()) {
                isValidKey = true;
            } else if (user.recovery_key_hash && bcrypt.compareSync(cleanKeyInput, user.recovery_key_hash)) {
                isValidKey = true;
            }

            if (!isValidKey) {
                return {
                    success: false,
                    message: 'La Clave Maestra de Rescate ingresada es incorrecta o no válida.'
                };
            }

            // Rotar automáticamente la Clave Maestra de Rescate por seguridad
            const newMasterRecoveryKey = this.generateMasterRecoveryKey();
            const newKeyHash = bcrypt.hashSync(newMasterRecoveryKey, 10);
            const newPasswordHash = bcrypt.hashSync(newPassword, 12);

            db.prepare(`
                UPDATE users SET
                    password_hash = ?,
                    recovery_key = ?,
                    recovery_key_hash = ?
                WHERE id = ?
            `).run(newPasswordHash, newMasterRecoveryKey, newKeyHash, user.id);

            AuditService.log(
                user.id,
                user.username,
                'RECUPERACION_PASSWORD_MASTER_KEY',
                `Acceso maestro restablecido mediante Clave Maestra de Rescate. Se emitió nueva clave de emergencia.`
            );

            return {
                success: true,
                message: 'Acceso restablecido con éxito mediante la Clave Maestra de Rescate.',
                newMasterRecoveryKey
            };
        } catch (error) {
            console.error('[AuthService] Error recuperando por Master Key:', error);
            return { success: false, message: error.message };
        }
    }
}

module.exports = { AuthService };
