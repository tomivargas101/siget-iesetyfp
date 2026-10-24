/**
 * Servicio de Auditoría y Trazabilidad Institucional para SIGET
 * Garantiza marcas de tiempo explícitas en Hora Local de Argentina (GMT-3, America/Argentina/Buenos_Aires).
 */

const { getDatabase } = require('../database/db');

class AuditService {
    static getArgentinaTimestamp() {
        const d = new Date();
        // Usar formato ISO local para America/Argentina/Buenos_Aires
        const formatter = new Intl.DateTimeFormat('sv-SE', {
            timeZone: 'America/Argentina/Buenos_Aires',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
        // sv-SE devuelve YYYY-MM-DD HH:mm:ss
        return formatter.format(d).replace(' ', 'T');
    }

    static log(userId, username, action, details = '') {
        try {
            const db = getDatabase();
            const timestamp = this.getArgentinaTimestamp();
            db.prepare(`
                INSERT INTO audit_logs (user_id, username, action, details, timestamp)
                VALUES (?, ?, ?, ?, ?)
            `).run(userId || null, username || 'SISTEMA', action, details, timestamp);
        } catch (error) {
            console.error('[AuditService] Error registrando auditoría:', error.message);
        }
    }

    static getRecent(limit = 15) {
        try {
            const db = getDatabase();
            return db.prepare(`
                SELECT id, user_id, username, action, details, timestamp
                FROM audit_logs
                ORDER BY timestamp DESC
                LIMIT ?
            `).all(limit);
        } catch (error) {
            console.error('[AuditService] Error consultando auditoría:', error.message);
            return [];
        }
    }
}

module.exports = { AuditService };
