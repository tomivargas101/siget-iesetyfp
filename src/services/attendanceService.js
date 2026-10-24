/**
 * Servicio de Control Diario de Asistencias Docentes para SIGET
 * Gestiona registros operativos para Bedelía y novedades de planta.
 * Estados cerrados acordados (Requerimientos v2.0):
 * - PR: Presente
 * - I: Inasistencia (estado por defecto)
 * - P: Permiso (Art. 115 / Razones Particulares)
 * - LIC: Licencia Médica / Ordinaria
 * - LT: Largo Tratamiento de Salud
 */

const { getDatabase } = require('../database/db');
const { AuditService } = require('./auditService');
const { AuthService } = require('./authService');
const { NormativeService } = require('./normativeService');

class AttendanceService {
    /**
     * Normaliza cualquier estado histórico o texto libre al conjunto cerrado v2.0:
     * 'PR', 'I', 'P', 'LIC', 'LT'
     */
    static normalizeStatusCode(status) {
        if (!status) return 'I'; // Inasistencia por defecto
        const s = String(status).trim().toUpperCase();

        if (s === 'PR' || s === 'PRESENTE') return 'PR';
        if (s === 'P' || s.includes('PERMISO') || s.includes('115')) return 'P';
        if (s === 'LT' || s.includes('LARGO TRATAMIENTO') || s.includes('48')) return 'LT';
        if (s === 'LIC' || s.includes('LICENCIA')) return 'LIC';
        if (s === 'I' || s.includes('AUSENTE') || s.includes('FALTA') || s.includes('INASISTENCIA')) return 'I';

        return 'I';
    }

    static getDailyRecords(dateStr) {
        const db = getDatabase();
        try {
            // Obtener todos los docentes activos
            const teachers = db.prepare(`
                SELECT id, legajo, dni, first_name, last_name, revista,
                       (SELECT COALESCE(SUM(hours_count), 0) FROM designations WHERE teacher_id = teachers.id AND is_active = 1) as hours
                FROM teachers
                WHERE is_active = 1
                ORDER BY last_name, first_name
            `).all();

            // Obtener asistencias registradas para la fecha
            const attendances = db.prepare(`
                SELECT id, teacher_id, status, hours, observations, registered_by, designation_id
                FROM attendances
                WHERE date = ? AND is_active = 1
            `).all(dateStr);

            const attMap = new Map();
            for (const a of attendances) {
                attMap.set(a.teacher_id, a);
            }

            return teachers.map(t => {
                const att = attMap.get(t.id);
                // Si ya fue registrado, normalizamos al conjunto cerrado; si no, estado por defecto 'I' (Inasistencia)
                const currentStatus = att ? this.normalizeStatusCode(att.status) : 'I';

                return {
                    teacherId: t.id,
                    attendanceId: att ? att.id : null,
                    legajo: t.legajo,
                    dni: String(t.dni),
                    fullName: `${t.last_name}, ${t.first_name}`,
                    revista: t.revista,
                    hours: att ? (att.hours || t.hours) : t.hours,
                    status: currentStatus,
                    rawStatus: att ? att.status : 'I',
                    observations: att ? (att.observations || '') : '',
                    registeredBy: att ? (att.registered_by || '') : '',
                    hasPhysicalForm: Boolean(att && att.observations && (att.observations.includes('Form:') || att.observations.includes('Formulario')))
                };
            });
        } catch (error) {
            console.error('[AttendanceService] Error obteniendo registros diarios:', error);
            return [];
        }
    }

    static saveDailyRecord({ teacherId, dateStr, status, hours = null, observations = '', designationId = null }) {
        const db = getDatabase();
        try {
            const currentUser = AuthService.getCurrentUser();
            const username = currentUser ? currentUser.username : 'BEDELIA';
            const now = AuditService.getArgentinaTimestamp();
            const normalizedStatus = this.normalizeStatusCode(status);

            // Verificar si ya existe para esa fecha
            const existing = db.prepare('SELECT id FROM attendances WHERE teacher_id = ? AND date = ?').get(teacherId, dateStr);

            if (existing) {
                db.prepare(`
                    UPDATE attendances SET
                        status = ?, hours = ?, observations = ?,
                        registered_by = ?, is_active = 1
                    WHERE id = ?
                `).run(
                    normalizedStatus,
                    hours !== null ? Number(hours) : null,
                    observations ? observations.trim() : null,
                    username,
                    existing.id
                );
            } else {
                db.prepare(`
                    INSERT INTO attendances (
                        teacher_id, date, status, hours, observations,
                        registered_by, created_at, designation_id, is_active
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
                `).run(
                    teacherId,
                    dateStr,
                    normalizedStatus,
                    hours !== null ? Number(hours) : null,
                    observations ? observations.trim() : null,
                    username,
                    now,
                    designationId
                );
            }

            return { success: true };
        } catch (error) {
            console.error('[AttendanceService] Error guardando asistencia:', error);
            return { success: false, message: error.message };
        }
    }

    /**
     * Recepción de Formulario Físico:
     * Ante una inasistencia ('I'), el operador edita el registro al recibir el formulario en papel
     * y lo reconvierte a 'LIC' (Licencia médica/ordinaria) o 'P' (Permiso).
     */
    static receivePhysicalForm({ teacherId, date, dateStr, newStatus, articleCode = '', formNumber = '', observations = '' }) {
        const db = getDatabase();
        try {
            const dStr = String(date || dateStr || '').trim();
            if (!dStr) throw new Error('Fecha no especificada');

            const validStatus = (newStatus === 'LIC' || newStatus === 'LT' || newStatus === 'P') ? newStatus : 'LIC';
            const currentUser = AuthService.getCurrentUser();
            const username = currentUser ? currentUser.username : 'BEDELIA';

            // Armar detalle de observación institucional
            const articleDetails = NormativeService.getArticleDetails(articleCode);
            const articleName = articleDetails ? `${articleDetails.article} (${articleDetails.code})` : (articleCode || 'Justificado');
            const formTag = formNumber ? `Formulario Físico N°: ${formNumber}` : 'Formulario Físico Recibido';
            const fullObs = `[${formTag}] Art: ${articleName}. ${observations ? observations.trim() : ''}`.trim();

            const existing = db.prepare('SELECT id FROM attendances WHERE teacher_id = ? AND date = ?').get(teacherId, dStr);
            const now = AuditService.getArgentinaTimestamp();

            if (existing) {
                db.prepare(`
                    UPDATE attendances SET
                        status = ?, observations = ?, registered_by = ?, is_active = 1
                    WHERE id = ?
                `).run(validStatus, fullObs, username, existing.id);
            } else {
                db.prepare(`
                    INSERT INTO attendances (
                        teacher_id, date, status, observations, registered_by, created_at, is_active
                    ) VALUES (?, ?, ?, ?, ?, ?, 1)
                `).run(teacherId, dStr, validStatus, fullObs, username, now);
            }

            // Auditoría
            const teacher = db.prepare('SELECT first_name, last_name, dni FROM teachers WHERE id = ?').get(teacherId);
            const teacherName = teacher ? `${teacher.last_name}, ${teacher.first_name}` : `Docente ID ${teacherId}`;

            AuditService.log(
                currentUser ? currentUser.id : null,
                username,
                'RECEPCION_FORMULARIO_FISICO',
                `Recepción de formulario para ${teacherName} fecha ${dateStr}: Inasistencia convertida a ${validStatus} (${formTag}, ${articleName})`
            );

            return {
                success: true,
                message: `Formulario registrado con éxito. Estado actualizado a ${validStatus}.`,
                status: validStatus,
                observations: fullObs
            };
        } catch (error) {
            console.error('[AttendanceService] Error en recepción de formulario físico:', error);
            return { success: false, message: error.message };
        }
    }

    static saveBatch(dateStr, records) {
        const db = getDatabase();
        try {
            db.exec('BEGIN TRANSACTION');
            for (const r of records) {
                this.saveDailyRecord({
                    teacherId: r.teacherId,
                    dateStr: dateStr,
                    status: r.status,
                    hours: r.hours,
                    observations: r.observations
                });
            }
            db.exec('COMMIT');

            const currentUser = AuthService.getCurrentUser();
            AuditService.log(
                currentUser ? currentUser.id : null,
                currentUser ? currentUser.username : 'BEDELIA',
                'REGISTRO_ASISTENCIA_LOTE',
                `Guardado parte diario de asistencia para fecha ${dateStr} (${records.length} docentes)`
            );

            return { success: true, message: 'Parte diario guardado exitosamente.' };
        } catch (error) {
            db.exec('ROLLBACK');
            console.error('[AttendanceService] Error guardando lote:', error);
            return { success: false, message: `Error guardando lote: ${error.message}` };
        }
    }

    static getSummary(dateStr) {
        const db = getDatabase();
        try {
            const totalTeachers = db.prepare('SELECT COUNT(*) as count FROM teachers WHERE is_active = 1').get().count;
            const records = db.prepare('SELECT status FROM attendances WHERE date = ? AND is_active = 1').all(dateStr);

            let presentes = 0;
            let inasistencias = 0;
            let permisos = 0;
            let licencias = 0;

            for (const r of records) {
                const norm = this.normalizeStatusCode(r.status);
                if (norm === 'PR') presentes++;
                else if (norm === 'I') inasistencias++;
                else if (norm === 'P') permisos++;
                else if (norm === 'LIC' || norm === 'LT') licencias++;
            }

            const sinRegistrar = Math.max(0, totalTeachers - records.length);

            return {
                totalTeachers,
                presentes,
                inasistencias,
                ausentes: inasistencias, // Compatibilidad con vistas previas
                permisos,
                licencias,
                sinRegistrar
            };
        } catch (error) {
            console.error('[AttendanceService] Error obteniendo resumen:', error);
            return { totalTeachers: 0, presentes: 0, inasistencias: 0, ausentes: 0, permisos: 0, licencias: 0, sinRegistrar: 0 };
        }
    }
}

module.exports = { AttendanceService };
