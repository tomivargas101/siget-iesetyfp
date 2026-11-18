const { getDatabase } = require('../database/db');
const { NormativeService } = require('./normativeService');
const { ValidationService } = require('./validationService');
const { AuditService } = require('./auditService');
const { AuthService } = require('./authService');

const REVISTAS = ['Titular', 'Provisional', 'Interino', 'Suplente'];

class TeacherService {
    static getAll({ searchTerm = '', revistaFilter = 'Todos', activeOnly = false } = {}) {
        const db = getDatabase();
        try {
            let sql = `
                SELECT
                    t.id, t.legajo, t.dni, t.cuil, t.first_name, t.last_name,
                    t.email, t.phone, t.revista, t.max_weekly_hours, t.is_active,
                    (SELECT COALESCE(SUM(d.hours_count), 0)
                     FROM designations d
                     WHERE d.teacher_id = t.id AND d.is_active = 1) as active_hours
                FROM teachers t
                WHERE 1=1
            `;
            const params = [];

            if (activeOnly) {
                sql += ' AND t.is_active = 1';
            }

            if (revistaFilter && revistaFilter !== 'Todos') {
                sql += ' AND t.revista = ?';
                params.push(revistaFilter);
            }

            if (searchTerm && searchTerm.trim() !== '') {
                const term = `%${searchTerm.trim()}%`;
                sql += ` AND (
                    t.last_name LIKE ? OR
                    t.first_name LIKE ? OR
                    t.dni LIKE ? OR
                    t.legajo LIKE ?
                )`;
                params.push(term, term, term, term);
            }

            sql += ' ORDER BY t.last_name COLLATE NOCASE ASC, t.first_name COLLATE NOCASE ASC';

            const rows = db.prepare(sql).all(...params);
            return rows.map(r => ({
                id: r.id,
                legajo: r.legajo,
                dni: String(r.dni),
                cuil: r.cuil,
                firstName: r.first_name,
                lastName: r.last_name,
                fullName: `${r.last_name}, ${r.first_name}`,
                email: r.email,
                phone: r.phone,
                revista: r.revista,
                maxWeeklyHours: r.max_weekly_hours || 30,
                activeHours: r.active_hours || 0,
                isActive: Boolean(r.is_active)
            }));
        } catch (error) {
            console.error('[TeacherService] Error obteniendo docentes:', error);
            return [];
        }
    }

    static getById(id) {
        const db = getDatabase();
        const r = db.prepare(`
            SELECT
                t.*,
                (SELECT COALESCE(SUM(d.hours_count), 0)
                 FROM designations d
                 WHERE d.teacher_id = t.id AND d.is_active = 1) as active_hours
            FROM teachers t
            WHERE t.id = ?
        `).get(id);

        if (!r) return null;
        return {
            id: r.id,
            legajo: r.legajo,
            dni: String(r.dni),
            cuil: r.cuil,
            firstName: r.first_name,
            lastName: r.last_name,
            fullName: `${r.last_name}, ${r.first_name}`,
            email: r.email,
            phone: r.phone,
            revista: r.revista,
            maxWeeklyHours: r.max_weekly_hours || 30,
            activeHours: r.active_hours || 0,
            isActive: Boolean(r.is_active)
        };
    }

    static save(payload) {
        const db = getDatabase();
        try {
            const validation = ValidationService.validateTeacherPayload(payload);
            if (!validation.isValid) {
                return {
                    success: false,
                    message: validation.message,
                    fieldErrors: validation.fieldErrors
                };
            }

            const { cleanData } = validation;
            const cleanDni = cleanData.dni;
            const cleanLegajo = cleanData.legajo;
            const targetId = cleanData.id;

            const existingWithDni = targetId
                ? db.prepare('SELECT id FROM teachers WHERE dni = ? AND id != ?').get(cleanDni, targetId)
                : db.prepare('SELECT id FROM teachers WHERE dni = ?').get(cleanDni);

            if (existingWithDni) {
                return {
                    success: false,
                    message: `Ya existe un docente registrado con el DNI ${cleanDni} (RN-01: datos comunes únicos).`
                };
            }

            const existingWithLegajo = targetId
                ? db.prepare('SELECT id FROM teachers WHERE legajo = ? AND id != ?').get(cleanLegajo, targetId)
                : db.prepare('SELECT id FROM teachers WHERE legajo = ?').get(cleanLegajo);

            if (existingWithLegajo) {
                return {
                    success: false,
                    message: `Ya existe un docente registrado con el Legajo ${cleanLegajo}.`
                };
            }

            const now = AuditService.getArgentinaTimestamp();
            const currentUser = AuthService.getCurrentUser();
            const username = currentUser ? currentUser.username : 'SISTEMA';

            if (targetId) {
                const currentTeacher = db.prepare('SELECT id, is_active, max_weekly_hours FROM teachers WHERE id = ?').get(targetId);
                if (!currentTeacher) {
                    return { success: false, message: 'Docente no encontrado para actualizar.' };
                }

                db.prepare(`
                    UPDATE teachers SET
                        legajo = ?, dni = ?, cuil = ?, first_name = ?, last_name = ?,
                        email = ?, phone = ?, revista = ?, max_weekly_hours = ?, is_active = ?
                    WHERE id = ?
                `).run(
                    cleanLegajo,
                    cleanDni,
                    cleanData.cuil,
                    cleanData.firstName,
                    cleanData.lastName,
                    cleanData.email,
                    cleanData.phone,
                    cleanData.revista,
                    cleanData.maxWeeklyHours,
                    cleanData.isActive ? 1 : 0,
                    targetId
                );

                AuditService.log(
                    currentUser ? currentUser.id : null,
                    username,
                    'MODIFICAR_DOCENTE',
                    `Modificado docente ID ${targetId}: ${cleanData.lastName}, ${cleanData.firstName} (DNI ${cleanDni})`
                );

                return { success: true, message: 'Datos del docente actualizados correctamente.' };
            } else {
                const result = db.prepare(`
                    INSERT INTO teachers (
                        legajo, dni, cuil, first_name, last_name,
                        email, phone, revista, max_weekly_hours, is_active, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).run(
                    cleanLegajo,
                    cleanDni,
                    cleanData.cuil,
                    cleanData.firstName,
                    cleanData.lastName,
                    cleanData.email,
                    cleanData.phone,
                    cleanData.revista,
                    cleanData.maxWeeklyHours,
                    1,
                    now
                );

                AuditService.log(
                    currentUser ? currentUser.id : null,
                    username,
                    'ALTA_DOCENTE',
                    `Registrado nuevo docente: ${cleanData.lastName}, ${cleanData.firstName} (DNI ${cleanDni}, Legajo ${cleanLegajo})`
                );

                return { success: true, message: 'Docente registrado exitosamente.', id: result.lastInsertRowid };
            }

        } catch (error) {
            console.error('[TeacherService] Error guardando docente:', error);
            return { success: false, message: `Error en base de datos: ${error.message}` };
        }
    }

    static toggleActive(teacherId) {
        const db = getDatabase();
        try {
            const teacher = db.prepare('SELECT id, is_active, first_name, last_name FROM teachers WHERE id = ?').get(teacherId);
            if (!teacher) {
                return { success: false, message: 'Docente no encontrado.' };
            }

            const newStatus = teacher.is_active ? 0 : 1;
            db.prepare('UPDATE teachers SET is_active = ? WHERE id = ?').run(newStatus, teacherId);

            const currentUser = AuthService.getCurrentUser();
            const actionText = newStatus ? 'ALTA_LOGICA_DOCENTE' : 'BAJA_LOGICA_DOCENTE';
            AuditService.log(
                currentUser ? currentUser.id : null,
                currentUser ? currentUser.username : 'SISTEMA',
                actionText,
                `${newStatus ? 'Reactivado' : 'Dado de baja lógica'} docente: ${teacher.last_name}, ${teacher.first_name}`
            );

            return {
                success: true,
                message: `El docente ha sido ${newStatus ? 'reactivado' : 'dado de baja lógica'} correctamente.`
            };
        } catch (error) {
            console.error('[TeacherService] Error cambiando estado:', error);
            return { success: false, message: `Error: ${error.message}` };
        }
    }

    static delete(teacherId) {
        const db = getDatabase();
        try {
            const tid = Number(teacherId);
            const teacher = db.prepare('SELECT id, first_name, last_name, dni FROM teachers WHERE id = ?').get(tid);
            if (!teacher) {
                return { success: false, message: 'Docente no encontrado.' };
            }

            const desigRow = db.prepare('SELECT COUNT(*) as count FROM designations WHERE teacher_id = ?').get(tid);
            if (desigRow && desigRow.count > 0) {
                return {
                    success: false,
                    message: `No se puede eliminar definitivamente al docente: registra ${desigRow.count} cátedra(s) vinculadas. Utilice la Baja Lógica para preservar la integridad.`
                };
            }

            const subRow = db.prepare('SELECT COUNT(*) as count FROM substitutions WHERE titular_teacher_id = ? OR suplente_teacher_id = ?').get(tid, tid);
            if (subRow && subRow.count > 0) {
                return {
                    success: false,
                    message: `No se puede eliminar definitivamente al docente: registra ${subRow.count} registro(s) de suplencia. Utilice la Baja Lógica.`
                };
            }

            const attRow = db.prepare('SELECT COUNT(*) as count FROM attendances WHERE teacher_id = ?').get(tid);
            if (attRow && attRow.count > 0) {
                return {
                    success: false,
                    message: `No se puede eliminar definitivamente al docente: registra ${attRow.count} día(s) de asistencia histórica. Utilice la Baja Lógica (RN-03).`
                };
            }

            db.prepare('DELETE FROM teachers WHERE id = ?').run(tid);

            const currentUser = AuthService.getCurrentUser();
            AuditService.log(
                currentUser ? currentUser.id : null,
                currentUser ? currentUser.username : 'SISTEMA',
                'ELIMINAR_DOCENTE',
                `Eliminado docente erróneo/duplicado ID ${tid}: ${teacher.last_name}, ${teacher.first_name} (DNI ${teacher.dni})`
            );

            return {
                success: true,
                message: `El docente ${teacher.last_name}, ${teacher.first_name} ha sido eliminado definitivamente del sistema.`
            };
        } catch (error) {
            console.error('[TeacherService] Error eliminando docente:', error);
            return { success: false, message: `Error en base de datos: ${error.message}` };
        }
    }
}

module.exports = { TeacherService, REVISTAS };
