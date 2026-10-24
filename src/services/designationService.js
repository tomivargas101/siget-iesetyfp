/**
 * Servicio de Gestión de Cátedras, Designaciones y Suplencias Oficiales para SIGET
 * Implementa RN-02, RN-03 y vinculación titular-suplente.
 */

const { getDatabase } = require('../database/db');
const { ValidationService } = require('./validationService');
const { AuditService } = require('./auditService');
const { AuthService } = require('./authService');

const DAYS_OF_WEEK = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

class DesignationService {
    static getAll({ careerId = 0 } = {}) {
        const db = getDatabase();
        try {
            let sql = `
                SELECT 
                    d.id, d.subject_id, d.teacher_id, d.day_of_week, 
                    d.start_time, d.end_time, d.hours_count, d.resolution_number,
                    d.cargo, d.revista, d.notes, d.is_active,
                    s.name as subject_name, s.code as subject_code,
                    c.id as career_id, c.name as career_name, c.code as career_code,
                    t.first_name as teacher_first_name, t.last_name as teacher_last_name,
                    t.dni as teacher_dni, t.revista as teacher_revista,
                    sub.id as sub_id, sub.suplente_teacher_id, sub.license_reason as sub_reason,
                    sub.start_date as sub_start, sub.end_date as sub_end, sub.resolution_number as sub_res,
                    st.first_name as sup_first_name, st.last_name as sup_last_name
                FROM designations d
                JOIN subjects s ON d.subject_id = s.id
                JOIN careers c ON s.career_id = c.id
                JOIN teachers t ON d.teacher_id = t.id
                LEFT JOIN substitutions sub ON sub.designation_id = d.id AND sub.is_active = 1
                LEFT JOIN teachers st ON sub.suplente_teacher_id = st.id
                WHERE d.is_active = 1
            `;
            const params = [];

            if (careerId && Number(careerId) > 0) {
                sql += ' AND c.id = ?';
                params.push(Number(careerId));
            }

            sql += ' ORDER BY c.name, s.year_level, s.name, d.day_of_week';

            const rows = db.prepare(sql).all(...params);
            return rows.map(r => {
                const item = {
                    id: r.id,
                    subjectId: r.subject_id,
                    subjectName: r.subject_name,
                    subjectCode: r.subject_code,
                    careerId: r.career_id,
                    careerName: r.career_name,
                    careerCode: r.career_code,
                    teacherId: r.teacher_id,
                    teacherName: `${r.teacher_last_name}, ${r.teacher_first_name}`,
                    teacherDni: String(r.teacher_dni),
                    teacherRevista: r.teacher_revista,
                    dayOfWeek: r.day_of_week,
                    startTime: r.start_time,
                    endTime: r.end_time,
                    hoursCount: r.hours_count,
                    resolutionNumber: r.resolution_number || '',
                    cargo: r.cargo || '',
                    revista: r.revista || r.teacher_revista || 'Titular',
                    notes: r.notes || '',
                    isActive: Boolean(r.is_active),
                    activeSubstitution: null
                };

                if (r.sub_id) {
                    item.activeSubstitution = {
                        id: r.sub_id,
                        suplenteId: r.suplente_teacher_id,
                        suplenteName: `${r.sup_last_name}, ${r.sup_first_name}`,
                        reason: r.sub_reason,
                        startDate: r.sub_start,
                        endDate: r.sub_end,
                        resolution: r.sub_res
                    };
                }

                return item;
            });
        } catch (error) {
            console.error('[DesignationService] Error obteniendo designaciones:', error);
            return [];
        }
    }

    static saveDesignation(payload) {
        const db = getDatabase();
        try {
            const subjectId = Number(payload.subjectId);
            const teacherId = Number(payload.teacherId);
            const hoursCount = Number(payload.hoursCount);
            const dayOfWeek = payload.dayOfWeek;
            const startTime = payload.startTime;
            const endTime = payload.endTime;
            const desigId = payload.id ? Number(payload.id) : null;

            if (!subjectId || !teacherId) {
                return { success: false, message: 'Debe seleccionar una materia y un docente.' };
            }
            if (!hoursCount || hoursCount <= 0) {
                return { success: false, message: 'Las horas cátedra deben ser un número entero positivo.' };
            }

            // Validación de Tope de Horas (Regla Crítica)
            const hoursVal = ValidationService.validateHoursLimit(teacherId, hoursCount, desigId);
            if (!hoursVal.isValid) {
                return { success: false, message: hoursVal.message };
            }

            // Validación de Incompatibilidad Horaria (Regla Crítica)
            const schedVal = ValidationService.validateScheduleConflict(teacherId, dayOfWeek, startTime, endTime, desigId);
            if (!schedVal.isValid) {
                return { success: false, message: schedVal.message };
            }

            const currentUser = AuthService.getCurrentUser();
            const username = currentUser ? currentUser.username : 'SISTEMA';

            const cargo = payload.cargo ? payload.cargo.trim() : null;
            const revista = payload.revista ? payload.revista.trim() : null;

            if (desigId) {
                // Actualización
                db.prepare(`
                    UPDATE designations SET
                        subject_id = ?, teacher_id = ?, day_of_week = ?,
                        start_time = ?, end_time = ?, hours_count = ?,
                        cargo = ?, revista = ?,
                        resolution_number = ?, notes = ?, is_active = 1
                    WHERE id = ?
                `).run(
                    subjectId, teacherId, dayOfWeek,
                    startTime, endTime, hoursCount,
                    cargo, revista,
                    payload.resolutionNumber ? payload.resolutionNumber.trim() : null,
                    payload.notes ? payload.notes.trim() : null,
                    desigId
                );

                AuditService.log(
                    currentUser ? currentUser.id : null,
                    username,
                    'MODIFICAR_DESIGNACION',
                    `Designación ID ${desigId} modificada para docente ID ${teacherId} en materia ID ${subjectId}`
                );

                return { success: true, message: 'Designación de cátedra actualizada exitosamente.' };
            } else {
                // Alta
                const result = db.prepare(`
                    INSERT INTO designations (
                        subject_id, teacher_id, day_of_week, start_time, end_time,
                        hours_count, cargo, revista, resolution_number, notes, is_active
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
                `).run(
                    subjectId, teacherId, dayOfWeek,
                    startTime, endTime, hoursCount,
                    cargo, revista,
                    payload.resolutionNumber ? payload.resolutionNumber.trim() : null,
                    payload.notes ? payload.notes.trim() : null
                );

                AuditService.log(
                    currentUser ? currentUser.id : null,
                    username,
                    'ALTA_DESIGNACION',
                    `Nueva cátedra designada ID ${result.lastInsertRowid}: Docente ID ${teacherId}, Materia ID ${subjectId} (${hoursCount} hs)`
                );

                return { success: true, message: 'Cátedra designada exitosamente.', id: result.lastInsertRowid };
            }
        } catch (error) {
            console.error('[DesignationService] Error guardando designación:', error);
            return { success: false, message: `Error en base de datos: ${error.message}` };
        }
    }

    static getAllSubstitutions() {
        const db = getDatabase();
        try {
            const sql = `
                SELECT 
                    sub.id, sub.designation_id, sub.license_reason, sub.start_date, sub.end_date,
                    sub.resolution_number, sub.is_active,
                    s.name as subject_name, c.name as career_name,
                    t.first_name as titular_first, t.last_name as titular_last, t.dni as titular_dni,
                    sup.first_name as suplente_first, sup.last_name as suplente_last, sup.dni as suplente_dni
                FROM substitutions sub
                JOIN designations d ON sub.designation_id = d.id
                JOIN subjects s ON d.subject_id = s.id
                JOIN careers c ON s.career_id = c.id
                JOIN teachers t ON sub.titular_teacher_id = t.id
                JOIN teachers sup ON sub.suplente_teacher_id = sup.id
                ORDER BY sub.id DESC
            `;
            const rows = db.prepare(sql).all();
            return rows.map(r => ({
                id: r.id,
                designationId: r.designation_id,
                subjectName: r.subject_name,
                careerName: r.career_name,
                titularName: `${r.titular_last}, ${r.titular_first}`,
                titularDni: String(r.titular_dni),
                suplenteName: `${r.suplente_last}, ${r.suplente_first}`,
                suplenteDni: String(r.suplente_dni),
                licenseReason: r.license_reason,
                startDate: r.start_date,
                endDate: r.end_date,
                resolutionNumber: r.resolution_number,
                isActive: Boolean(r.is_active)
            }));
        } catch (error) {
            console.error('[DesignationService] Error obteniendo suplencias:', error);
            return [];
        }
    }

    static saveSubstitution(payload) {
        const db = getDatabase();
        try {
            const desigId = Number(payload.designationId);
            const suplenteId = Number(payload.suplenteTeacherId);
            const licenseReason = payload.licenseReason;
            const startDate = payload.startDate;
            const endDate = payload.endDate;
            const resolutionNumber = payload.resolutionNumber;

            if (!desigId || !suplenteId) {
                return { success: false, message: 'Debe especificar la cátedra y el docente suplente.' };
            }
            if (!resolutionNumber || !resolutionNumber.trim()) {
                return { success: false, message: 'El número de resolución ministerial es obligatorio.' };
            }

            const desig = db.prepare('SELECT teacher_id, hours_count FROM designations WHERE id = ?').get(desigId);
            if (!desig) {
                return { success: false, message: 'La cátedra seleccionada no existe.' };
            }

            const titularId = desig.teacher_id;
            if (titularId === suplenteId) {
                return { success: false, message: 'El docente suplente no puede ser el mismo titular de la cátedra.' };
            }

            // Validar tope de horas del suplente
            const hoursVal = ValidationService.validateHoursLimit(suplenteId, desig.hours_count);
            if (!hoursVal.isValid) {
                return { success: false, message: `No se puede asignar suplencia: ${hoursVal.message}` };
            }

            const now = AuditService.getArgentinaTimestamp();
            const currentUser = AuthService.getCurrentUser();

            const result = db.prepare(`
                INSERT INTO substitutions (
                    designation_id, titular_teacher_id, suplente_teacher_id,
                    license_reason, start_date, end_date, resolution_number,
                    is_active, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
            `).run(
                desigId, titularId, suplenteId,
                licenseReason ? licenseReason.trim() : 'Licencia Oficial',
                startDate, endDate, resolutionNumber.trim(),
                now
            );

            AuditService.log(
                currentUser ? currentUser.id : null,
                currentUser ? currentUser.username : 'SISTEMA',
                'ALTA_SUPLENCIA',
                `Asignada suplencia en designación ID ${desigId}: Suplente ID ${suplenteId} reemplaza a Titular ID ${titularId} (Res. ${resolutionNumber})`
            );

            return { success: true, message: 'Suplencia registrada exitosamente.', id: result.lastInsertRowid };
        } catch (error) {
            console.error('[DesignationService] Error guardando suplencia:', error);
            return { success: false, message: `Error en base de datos: ${error.message}` };
        }
    }

    static getCareers() {
        const db = getDatabase();
        try {
            return db.prepare('SELECT id, code, name, resolution_number, duration_years FROM careers ORDER BY name').all();
        } catch (e) {
            return [];
        }
    }

    /**
     * RF-05: Alta de Nueva Carrera Institucional (Catálogo Modificable)
     */
    static createCareer({ code, name, resolutionNumber = null, durationYears = 3 }) {
        const db = getDatabase();
        try {
            const cleanName = (name || '').trim();
            const cleanCode = (code || '').trim().toUpperCase();
            const cleanResolution = (resolutionNumber || '').trim() || null;
            const duration = parseInt(durationYears) || 3;

            if (!cleanName) {
                return { success: false, message: 'El nombre de la carrera es obligatorio.' };
            }
            if (!cleanCode) {
                return { success: false, message: 'El código identificador de la carrera es obligatorio.' };
            }
            if (cleanCode.length > 20) {
                return { success: false, message: 'El código de la carrera no puede exceder 20 caracteres.' };
            }

            // Validar unicidad del código
            const existing = db.prepare('SELECT id, name FROM careers WHERE UPPER(code) = ?').get(cleanCode);
            if (existing) {
                return {
                    success: false,
                    message: `Ya existe la carrera "${existing.name}" con el código "${cleanCode}".`
                };
            }

            const result = db.prepare(`
                INSERT INTO careers (code, name, resolution_number, duration_years)
                VALUES (?, ?, ?, ?)
            `).run(cleanCode, cleanName, cleanResolution, duration);

            const currentUser = AuthService.getCurrentUser();
            AuditService.log(
                currentUser ? currentUser.id : null,
                currentUser ? currentUser.username : 'RECTORIA',
                'ALTA_CARRERA',
                `Alta de carrera: ${cleanName} (${cleanCode}) - Res: ${cleanResolution || 'S/R'}`
            );

            return {
                success: true,
                message: 'Carrera creada exitosamente.',
                career: {
                    id: Number(result.lastInsertRowid),
                    code: cleanCode,
                    name: cleanName,
                    resolution_number: cleanResolution,
                    duration_years: duration
                }
            };
        } catch (error) {
            console.error('[DesignationService] Error creando carrera:', error);
            return { success: false, message: `Error en base de datos: ${error.message}` };
        }
    }

    static getSubjectsByCareer(careerId) {
        const db = getDatabase();
        try {
            return db.prepare('SELECT id, code, name, year_level, weekly_hours FROM subjects WHERE career_id = ? ORDER BY year_level, name').all(careerId);
        } catch (e) {
            return [];
        }
    }

    static getDesignationById(id) {
        const db = getDatabase();
        try {
            const row = db.prepare(`
                SELECT 
                    d.*,
                    s.name as subject_name, s.code as subject_code, s.career_id,
                    c.name as career_name, c.code as career_code,
                    t.first_name as teacher_first_name, t.last_name as teacher_last_name,
                    t.dni as teacher_dni, t.revista as teacher_revista
                FROM designations d
                JOIN subjects s ON d.subject_id = s.id
                JOIN careers c ON s.career_id = c.id
                JOIN teachers t ON d.teacher_id = t.id
                WHERE d.id = ?
            `).get(id);

            if (!row) return null;
            return {
                id: row.id,
                subjectId: row.subject_id,
                subjectName: row.subject_name,
                subjectCode: row.subject_code,
                careerId: row.career_id,
                careerName: row.career_name,
                careerCode: row.career_code,
                teacherId: row.teacher_id,
                teacherName: `${row.teacher_last_name}, ${row.teacher_first_name}`,
                teacherDni: String(row.teacher_dni),
                dayOfWeek: row.day_of_week,
                startTime: row.start_time,
                endTime: row.end_time,
                hoursCount: row.hours_count,
                resolutionNumber: row.resolution_number || '',
                cargo: row.cargo || '',
                revista: row.revista || row.teacher_revista || 'Titular',
                notes: row.notes || '',
                isActive: Boolean(row.is_active)
            };
        } catch (error) {
            console.error('[DesignationService] Error obteniendo designación por ID:', error);
            return null;
        }
    }

    static deleteDesignation(id) {
        const db = getDatabase();
        try {
            const desig = db.prepare(`
                SELECT d.id, d.teacher_id, d.subject_id, s.name as subject_name, t.last_name, t.first_name
                FROM designations d
                JOIN subjects s ON d.subject_id = s.id
                JOIN teachers t ON d.teacher_id = t.id
                WHERE d.id = ?
            `).get(id);

            if (!desig) {
                return { success: false, message: 'La designación no existe o ya fue eliminada.' };
            }

            // Verificar si existen asistencias asociadas
            const attCountRow = db.prepare('SELECT COUNT(*) as count FROM attendances WHERE designation_id = ?').get(id);
            const attCount = attCountRow ? attCountRow.count : 0;

            const currentUser = AuthService.getCurrentUser();
            const username = currentUser ? currentUser.username : 'SISTEMA';

            if (attCount > 0) {
                // Baja lógica estricta para preservar registros históricos (RN-03)
                db.prepare('UPDATE designations SET is_active = 0 WHERE id = ?').run(id);
                db.prepare('UPDATE substitutions SET is_active = 0 WHERE designation_id = ?').run(id);

                AuditService.log(
                    currentUser ? currentUser.id : null,
                    username,
                    'BAJA_LOGICA_DESIGNACION',
                    `Baja lógica de cátedra ID ${id} (${desig.subject_name} - ${desig.last_name}, ${desig.first_name}) preservando ${attCount} registros de asistencia (RN-03).`
                );

                return { 
                    success: true, 
                    isLogical: true,
                    message: `La cátedra ha sido dada de baja lógica preservando ${attCount} registros de asistencias históricas (RN-03).` 
                };
            } else {
                // Borrado definitivo seguro si fue creada por error sin asistencias
                db.prepare('DELETE FROM substitutions WHERE designation_id = ?').run(id);
                db.prepare('DELETE FROM designations WHERE id = ?').run(id);

                AuditService.log(
                    currentUser ? currentUser.id : null,
                    username,
                    'ELIMINAR_DESIGNACION',
                    `Eliminación definitiva de cátedra errónea ID ${id} (${desig.subject_name} - ${desig.last_name}, ${desig.first_name}) sin asistencias asociadas.`
                );

                return { 
                    success: true, 
                    isLogical: false,
                    message: 'La designación de cátedra ha sido eliminada exitosamente del sistema.' 
                };
            }
        } catch (error) {
            console.error('[DesignationService] Error eliminando designación:', error);
            return { success: false, message: `Error en base de datos: ${error.message}` };
        }
    }

    static getCareerById(careerId) {
        const db = getDatabase();
        try {
            const r = db.prepare('SELECT id, code, name, resolution_number, duration_years FROM careers WHERE id = ?').get(careerId);
            if (!r) return null;
            return {
                id: r.id,
                code: r.code,
                name: r.name,
                resolutionNumber: r.resolution_number,
                resolution_number: r.resolution_number,
                durationYears: r.duration_years,
                duration_years: r.duration_years
            };
        } catch (e) {
            return null;
        }
    }

    static updateCareer({ id, code, name, resolutionNumber = null, durationYears = 3 }) {
        const db = getDatabase();
        try {
            const careerId = Number(id);
            const cleanName = (name || '').trim();
            const cleanCode = (code || '').trim().toUpperCase();
            const cleanResolution = (resolutionNumber || '').trim() || null;
            const duration = parseInt(durationYears) || 3;

            if (!careerId) {
                return { success: false, message: 'ID de carrera inválido.' };
            }
            if (!cleanName) {
                return { success: false, message: 'El nombre de la carrera es obligatorio.' };
            }
            if (!cleanCode) {
                return { success: false, message: 'El código identificador de la carrera es obligatorio.' };
            }
            if (cleanCode.length > 20) {
                return { success: false, message: 'El código de la carrera no puede exceder 20 caracteres.' };
            }

            // Validar unicidad del código excluyendo la propia carrera
            const existing = db.prepare('SELECT id, name FROM careers WHERE UPPER(code) = ? AND id != ?').get(cleanCode, careerId);
            if (existing) {
                return {
                    success: false,
                    message: `Ya existe otra carrera ("${existing.name}") con el código "${cleanCode}".`
                };
            }

            db.prepare(`
                UPDATE careers 
                SET code = ?, name = ?, resolution_number = ?, duration_years = ?
                WHERE id = ?
            `).run(cleanCode, cleanName, cleanResolution, duration, careerId);

            const currentUser = AuthService.getCurrentUser();
            AuditService.log(
                currentUser ? currentUser.id : null,
                currentUser ? currentUser.username : 'RECTORIA',
                'MODIFICAR_CARRERA',
                `Modificada carrera ID ${careerId}: ${cleanName} (${cleanCode}) - Res: ${cleanResolution || 'S/R'}`
            );

            return {
                success: true,
                message: 'Carrera actualizada exitosamente.',
                career: {
                    id: careerId,
                    code: cleanCode,
                    name: cleanName,
                    resolution_number: cleanResolution,
                    duration_years: duration
                }
            };
        } catch (error) {
            console.error('[DesignationService] Error actualizando carrera:', error);
            return { success: false, message: `Error en base de datos: ${error.message}` };
        }
    }

    static deleteCareer(careerId) {
        const db = getDatabase();
        try {
            const cid = Number(careerId);
            const career = db.prepare('SELECT id, code, name FROM careers WHERE id = ?').get(cid);
            if (!career) {
                return { success: false, message: 'La carrera no existe o ya fue eliminada.' };
            }

            // 1. Validar si existen cátedras/designaciones activas asociadas
            const desigRow = db.prepare(`
                SELECT COUNT(*) as count 
                FROM designations d 
                JOIN subjects s ON d.subject_id = s.id 
                WHERE s.career_id = ? AND d.is_active = 1
            `).get(cid);
            const activeDesigs = desigRow ? desigRow.count : 0;
            if (activeDesigs > 0) {
                return {
                    success: false,
                    message: `No se puede eliminar la carrera "${career.name}": posee ${activeDesigs} cátedra(s) activa(s) asignadas. Dé de baja o reasigne las cátedras primero.`
                };
            }

            // 2. Validar si existen alumnos matriculados en esta carrera
            const studentRow = db.prepare('SELECT COUNT(*) as count FROM students WHERE career_id = ?').get(cid);
            const studentCount = studentRow ? studentRow.count : 0;
            if (studentCount > 0) {
                return {
                    success: false,
                    message: `No se puede eliminar la carrera "${career.name}": posee ${studentCount} alumno(s) matriculado(s). Reasigne a los alumnos antes de proceder.`
                };
            }

            // 3. Proceder al borrado seguro (eliminar materias asociadas huérfanas y la carrera)
            db.prepare('DELETE FROM subjects WHERE career_id = ?').run(cid);
            db.prepare('DELETE FROM careers WHERE id = ?').run(cid);

            const currentUser = AuthService.getCurrentUser();
            AuditService.log(
                currentUser ? currentUser.id : null,
                currentUser ? currentUser.username : 'RECTORIA',
                'ELIMINAR_CARRERA',
                `Eliminada carrera ID ${cid}: ${career.name} (${career.code}) y sus materias asociadas.`
            );

            return {
                success: true,
                message: `La carrera "${career.name}" (${career.code}) ha sido eliminada exitosamente.`
            };
        } catch (error) {
            console.error('[DesignationService] Error eliminando carrera:', error);
            return { success: false, message: `Error en base de datos: ${error.message}` };
        }
    }
}

module.exports = { DesignationService, DAYS_OF_WEEK };
