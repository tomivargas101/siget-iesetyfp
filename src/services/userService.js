/**
 * Servicio de Gestión de Usuarios y Roles Secundarios para SIGET
 * Permite a Rector administrar perfiles (Bedeles, Secretarios) y blanquear contraseñas.
 */

const bcrypt = require('bcryptjs');
const { getDatabase } = require('../database/db');
const { AuditService } = require('./auditService');
const { AuthService } = require('./authService');

const VALID_ROLES = ['RECTOR', 'SECRETARIA', 'BEDEL'];

function normalizeRole(role) {
    if (!role) return 'BEDEL';
    const r = String(role).trim().toUpperCase();
    if (r === 'RECTOR' || r === 'RECTORA') return 'RECTOR';
    if (r === 'SECRETARIA' || r === 'SECRETARIO' || r === 'SECRETARÍA') return 'SECRETARIA';
    if (r === 'BEDEL' || r === 'BEDELIA' || r === 'BEDELÍA') return 'BEDEL';
    return r;
}

class UserService {
    static getAllUsers() {
        const db = getDatabase();
        try {
            const rows = db.prepare(`
                SELECT 
                    id, username, full_name, role, email, is_active,
                    created_at, last_login, security_question,
                    (recovery_key IS NOT NULL OR recovery_key_hash IS NOT NULL) as has_recovery_key
                FROM users
                ORDER BY 
                    CASE role 
                        WHEN 'RECTOR' THEN 1 
                        WHEN 'SECRETARIA' THEN 2 
                        WHEN 'SECRETARIO' THEN 2 
                        WHEN 'BEDEL' THEN 3 
                        ELSE 4 
                    END, 
                    full_name ASC
            `).all();

            return rows.map(r => ({
                id: r.id,
                username: r.username,
                fullName: r.full_name,
                role: normalizeRole(r.role),
                email: r.email || '',
                isActive: Boolean(r.is_active),
                createdAt: r.created_at || '',
                lastLogin: r.last_login ? r.last_login.replace('T', ' ').substring(0, 16) : 'Nunca',
                hasSecurityQuestion: Boolean(r.security_question),
                securityQuestion: r.security_question || 'No configurada',
                hasRecoveryKey: Boolean(r.has_recovery_key)
            }));
        } catch (error) {
            console.error('[UserService] Error obteniendo usuarios:', error);
            return [];
        }
    }

    static getUserById(id) {
        const db = getDatabase();
        try {
            const user = db.prepare(`
                SELECT id, username, full_name, role, email, is_active, security_question
                FROM users
                WHERE id = ?
            `).get(id);

            if (!user) return null;
            return {
                id: user.id,
                username: user.username,
                fullName: user.full_name,
                role: user.role,
                email: user.email || '',
                isActive: Boolean(user.is_active),
                securityQuestion: user.security_question || ''
            };
        } catch (error) {
            console.error('[UserService] Error obteniendo usuario por ID:', error);
            return null;
        }
    }

    static createUser({ username, fullName, role, email = '', password, securityQuestion = '', securityAnswer = '' }) {
        const db = getDatabase();
        try {
            if (!username || !fullName || !password) {
                return { success: false, message: 'Usuario, Nombre Completo y Contraseña son obligatorios.' };
            }

            const cleanUsername = username.trim().toLowerCase();
            const normalizedRole = normalizeRole(role);

            if (!VALID_ROLES.includes(normalizedRole)) {
                return { success: false, message: `Rol no válido. La estructura institucional admite únicamente: Rector, Secretaría o Bedelía.` };
            }

            if (password.length < 6) {
                return { success: false, message: 'La contraseña debe tener al menos 6 caracteres.' };
            }

            // Comprobar si el nombre de usuario ya existe
            const exists = db.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE').get(cleanUsername);
            if (exists) {
                return { success: false, message: `El usuario '${cleanUsername}' ya se encuentra registrado.` };
            }

            const passwordHash = bcrypt.hashSync(password, 12);
            let answerHash = null;
            if (securityQuestion && securityAnswer) {
                answerHash = bcrypt.hashSync(securityAnswer.trim().toLowerCase(), 10);
            }

            const now = AuditService.getArgentinaTimestamp();
            const result = db.prepare(`
                INSERT INTO users (
                    username, password_hash, full_name, role, email,
                    is_active, security_question, security_answer_hash,
                    created_at
                ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)
            `).run(
                cleanUsername,
                passwordHash,
                fullName.trim(),
                normalizedRole,
                email ? email.trim() : null,
                securityQuestion ? securityQuestion.trim() : null,
                answerHash,
                now
            );

            const currentUser = AuthService.getCurrentUser();
            AuditService.log(
                currentUser ? currentUser.id : null,
                currentUser ? currentUser.username : 'RECTOR',
                'ALTA_USUARIO',
                `Creación de nuevo usuario '${cleanUsername}' con rol '${normalizedRole}'`
            );

            return {
                success: true,
                message: `Usuario '${cleanUsername}' creado exitosamente con rol ${normalizedRole}.`,
                userId: result.lastInsertRowid
            };
        } catch (error) {
            console.error('[UserService] Error creando usuario:', error);
            return { success: false, message: `Error al crear usuario: ${error.message}` };
        }
    }

    static updateUser(id, { fullName, role, email = '', isActive = true }) {
        const db = getDatabase();
        try {
            const user = db.prepare('SELECT id, username, role FROM users WHERE id = ?').get(id);
            if (!user) {
                return { success: false, message: 'Usuario no encontrado.' };
            }

            const currentUser = AuthService.getCurrentUser();
            // Evitar que el rector se deshabilite a sí mismo
            if (currentUser && currentUser.id === id && !isActive) {
                return { success: false, message: 'No puede desactivar su propia cuenta activa de Rector.' };
            }

            const normalizedRole = normalizeRole(role || user.role);
            if (!VALID_ROLES.includes(normalizedRole)) {
                return { success: false, message: `Rol no válido. La estructura institucional admite únicamente: Rector, Secretaría o Bedelía.` };
            }

            db.prepare(`
                UPDATE users SET
                    full_name = ?,
                    role = ?,
                    email = ?,
                    is_active = ?
                WHERE id = ?
            `).run(
                fullName.trim(),
                normalizedRole,
                email ? email.trim() : null,
                isActive ? 1 : 0,
                id
            );

            AuditService.log(
                currentUser ? currentUser.id : null,
                currentUser ? currentUser.username : 'RECTOR',
                'MODIFICACION_USUARIO',
                `Actualizados datos del usuario '${user.username}' (Rol: ${normalizedRole}, Activo: ${isActive})`
            );

            return { success: true, message: `Usuario '${user.username}' actualizado exitosamente.` };
        } catch (error) {
            console.error('[UserService] Error actualizando usuario:', error);
            return { success: false, message: `Error al actualizar usuario: ${error.message}` };
        }
    }

    /**
     * Blanqueo / Restablecimiento inmediato de contraseña por parte del Rector
     */
    static resetPassword(userId, newPassword) {
        const db = getDatabase();
        try {
            if (!newPassword || newPassword.length < 6) {
                return { success: false, message: 'La nueva contraseña debe tener al menos 6 caracteres.' };
            }

            const user = db.prepare('SELECT id, username, role FROM users WHERE id = ?').get(userId);
            if (!user) {
                return { success: false, message: 'Usuario no encontrado.' };
            }

            const passwordHash = bcrypt.hashSync(newPassword, 12);
            db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, userId);

            const currentUser = AuthService.getCurrentUser();
            AuditService.log(
                currentUser ? currentUser.id : null,
                currentUser ? currentUser.username : 'RECTOR',
                'BLANQUEO_CONTRASENA',
                `Blanqueo de contraseña efectuado para el usuario '${user.username}' (${user.role})`
            );

            return {
                success: true,
                message: `Contraseña blanqueada correctamente para el usuario '${user.username}'.`
            };
        } catch (error) {
            console.error('[UserService] Error al blanquear contraseña:', error);
            return { success: false, message: `Error al blanquear contraseña: ${error.message}` };
        }
    }

    static toggleUserActive(id) {
        const db = getDatabase();
        try {
            const user = db.prepare('SELECT id, username, is_active FROM users WHERE id = ?').get(id);
            if (!user) {
                return { success: false, message: 'Usuario no encontrado.' };
            }

            const currentUser = AuthService.getCurrentUser();
            if (currentUser && currentUser.id === id) {
                return { success: false, message: 'No puede alterar el estado de su propia cuenta de sesión actual.' };
            }

            const newStatus = user.is_active ? 0 : 1;
            db.prepare('UPDATE users SET is_active = ? WHERE id = ?').run(newStatus, id);

            AuditService.log(
                currentUser ? currentUser.id : null,
                currentUser ? currentUser.username : 'RECTOR',
                newStatus ? 'REACTIVACION_USUARIO' : 'BAJA_USUARIO',
                `Usuario '${user.username}' ${newStatus ? 'reactivado' : 'dado de baja lógica'}`
            );

            return {
                success: true,
                newStatus: Boolean(newStatus),
                message: `El usuario '${user.username}' fue ${newStatus ? 'activado' : 'desactivado'}.`
            };
        } catch (error) {
            console.error('[UserService] Error al cambiar estado de usuario:', error);
            return { success: false, message: error.message };
        }
    }
}

module.exports = { UserService, VALID_ROLES };
