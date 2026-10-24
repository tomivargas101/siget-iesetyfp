/**
 * Servicio de Gestión de Alumnos e Inscripciones para SIGET
 */

const { getDatabase } = require('../database/db');
const { NormativeService } = require('./normativeService');
const { AuditService } = require('./auditService');
const { AuthService } = require('./authService');

class StudentService {
    static getAll({ searchTerm = '', careerId = 0 } = {}) {
        const db = getDatabase();
        try {
            let sql = `
                SELECT 
                    s.id, s.legajo, s.dni, s.cuil, s.first_name, s.last_name,
                    s.email, s.phone, s.career_id, s.year_enrolled, s.is_active,
                    c.name as career_name, c.code as career_code
                FROM students s
                LEFT JOIN careers c ON s.career_id = c.id
                WHERE 1=1
            `;
            const params = [];

            if (careerId && Number(careerId) > 0) {
                sql += ' AND s.career_id = ?';
                params.push(Number(careerId));
            }

            if (searchTerm && searchTerm.trim() !== '') {
                const term = `%${searchTerm.trim()}%`;
                sql += ` AND (
                    s.last_name LIKE ? OR 
                    s.first_name LIKE ? OR 
                    s.dni LIKE ? OR 
                    s.legajo LIKE ?
                )`;
                params.push(term, term, term, term);
            }

            sql += ' ORDER BY s.last_name ASC, s.first_name ASC';

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
                careerId: r.career_id,
                careerName: r.career_name || 'Sin Carrera Asignada',
                careerCode: r.career_code || '',
                yearEnrolled: r.year_enrolled,
                isActive: Boolean(r.is_active)
            }));
        } catch (error) {
            console.error('[StudentService] Error obteniendo alumnos:', error);
            return [];
        }
    }

    static save(payload) {
        const db = getDatabase();
        try {
            const cleanDni = NormativeService.normalizeDni(payload.dni);
            if (!cleanDni) {
                return { success: false, message: 'El DNI del alumno es obligatorio.' };
            }
            if (!payload.legajo || !payload.lastName || !payload.firstName) {
                return { success: false, message: 'Legajo, Apellido y Nombre son campos requeridos.' };
            }

            const existingWithDni = db.prepare('SELECT id FROM students WHERE dni = ?').get(cleanDni);
            if (existingWithDni && (!payload.id || existingWithDni.id !== payload.id)) {
                return { success: false, message: `Ya existe un alumno registrado con el DNI ${cleanDni}.` };
            }

            const now = AuditService.getArgentinaTimestamp();
            const currentUser = AuthService.getCurrentUser();
            const username = currentUser ? currentUser.username : 'SISTEMA';

            if (payload.id) {
                // Actualización
                db.prepare(`
                    UPDATE students SET
                        legajo = ?, dni = ?, cuil = ?, first_name = ?, last_name = ?,
                        email = ?, phone = ?, career_id = ?, year_enrolled = ?, is_active = ?
                    WHERE id = ?
                `).run(
                    payload.legajo.trim(),
                    cleanDni,
                    payload.cuil ? payload.cuil.trim() : null,
                    payload.firstName.trim(),
                    payload.lastName.trim(),
                    payload.email ? payload.email.trim() : null,
                    payload.phone ? payload.phone.trim() : null,
                    payload.careerId ? Number(payload.careerId) : null,
                    payload.yearEnrolled ? Number(payload.yearEnrolled) : new Date().getFullYear(),
                    payload.isActive !== false ? 1 : 0,
                    payload.id
                );

                AuditService.log(
                    currentUser ? currentUser.id : null,
                    username,
                    'MODIFICAR_ALUMNO',
                    `Modificado alumno ID ${payload.id}: ${payload.lastName}, ${payload.firstName}`
                );

                return { success: true, message: 'Datos del alumno actualizados correctamente.' };
            } else {
                // Alta
                const result = db.prepare(`
                    INSERT INTO students (
                        legajo, dni, cuil, first_name, last_name,
                        email, phone, career_id, year_enrolled, is_active, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
                `).run(
                    payload.legajo.trim(),
                    cleanDni,
                    payload.cuil ? payload.cuil.trim() : null,
                    payload.firstName.trim(),
                    payload.lastName.trim(),
                    payload.email ? payload.email.trim() : null,
                    payload.phone ? payload.phone.trim() : null,
                    payload.careerId ? Number(payload.careerId) : null,
                    payload.yearEnrolled ? Number(payload.yearEnrolled) : new Date().getFullYear(),
                    now
                );

                AuditService.log(
                    currentUser ? currentUser.id : null,
                    username,
                    'ALTA_ALUMNO',
                    `Registrado nuevo alumno: ${payload.lastName}, ${payload.firstName} (DNI ${cleanDni}, Legajo ${payload.legajo})`
                );

                return { success: true, message: 'Alumno registrado exitosamente.', id: result.lastInsertRowid };
            }
        } catch (error) {
            console.error('[StudentService] Error guardando alumno:', error);
            return { success: false, message: `Error en base de datos: ${error.message}` };
        }
    }

    static toggleActive(studentId) {
        const db = getDatabase();
        try {
            const student = db.prepare('SELECT id, is_active, first_name, last_name FROM students WHERE id = ?').get(studentId);
            if (!student) {
                return { success: false, message: 'Alumno no encontrado.' };
            }

            const newStatus = student.is_active ? 0 : 1;
            db.prepare('UPDATE students SET is_active = ? WHERE id = ?').run(newStatus, studentId);

            const currentUser = AuthService.getCurrentUser();
            AuditService.log(
                currentUser ? currentUser.id : null,
                currentUser ? currentUser.username : 'SISTEMA',
                newStatus ? 'ALTA_LOGICA_ALUMNO' : 'BAJA_LOGICA_ALUMNO',
                `${newStatus ? 'Reactivado' : 'Dado de baja lógica'} alumno: ${student.last_name}, ${student.first_name}`
            );

            return { 
                success: true, 
                message: `El alumno ha sido ${newStatus ? 'reactivado' : 'dado de baja lógica'} correctamente.` 
            };
        } catch (error) {
            console.error('[StudentService] Error cambiando estado del alumno:', error);
            return { success: false, message: `Error: ${error.message}` };
        }
    }

    static getById(studentId) {
        const db = getDatabase();
        try {
            const r = db.prepare(`
                SELECT 
                    s.id, s.legajo, s.dni, s.cuil, s.first_name, s.last_name,
                    s.email, s.phone, s.career_id, s.year_enrolled, s.is_active,
                    c.name as career_name, c.code as career_code
                FROM students s
                LEFT JOIN careers c ON s.career_id = c.id
                WHERE s.id = ?
            `).get(studentId);

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
                careerId: r.career_id,
                careerName: r.career_name || 'Sin Carrera Asignada',
                careerCode: r.career_code || '',
                yearEnrolled: r.year_enrolled,
                isActive: Boolean(r.is_active)
            };
        } catch (error) {
            console.error('[StudentService] Error obteniendo alumno por ID:', error);
            return null;
        }
    }

    static delete(studentId) {
        const db = getDatabase();
        try {
            const sid = Number(studentId);
            const student = db.prepare('SELECT id, first_name, last_name, dni FROM students WHERE id = ?').get(sid);
            if (!student) {
                return { success: false, message: 'Alumno no encontrado.' };
            }

            db.prepare('DELETE FROM students WHERE id = ?').run(sid);

            const currentUser = AuthService.getCurrentUser();
            AuditService.log(
                currentUser ? currentUser.id : null,
                currentUser ? currentUser.username : 'SISTEMA',
                'ELIMINAR_ALUMNO',
                `Eliminado alumno erróneo/duplicado ID ${sid}: ${student.last_name}, ${student.first_name} (DNI ${student.dni})`
            );

            return {
                success: true,
                message: `El alumno ${student.last_name}, ${student.first_name} ha sido eliminado correctamente del sistema.`
            };
        } catch (error) {
            console.error('[StudentService] Error eliminando alumno:', error);
            return { success: false, message: `Error en base de datos: ${error.message}` };
        }
    }
}

module.exports = { StudentService };
