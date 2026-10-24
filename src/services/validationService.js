/**
 * Servicio de Validación de Reglas Críticas de Negocio Institucional
 * - Límite de carga horaria semanal (tope institucional)
 * - Incompatibilidad horaria y detección de superposiciones
 */

const { getDatabase } = require('../database/db');

class ValidationService {
    static calculateTeacherActiveHours(teacherId, excludeDesignationId = null) {
        const db = getDatabase();
        let sql = `
            SELECT COALESCE(SUM(hours_count), 0) as total 
            FROM designations 
            WHERE teacher_id = ? AND is_active = 1
        `;
        const params = [teacherId];
        if (excludeDesignationId) {
            sql += ' AND id != ?';
            params.push(excludeDesignationId);
        }
        const row = db.prepare(sql).get(...params);
        return row ? Number(row.total) : 0;
    }

    static validateHoursLimit(teacherId, newHours, excludeDesignationId = null) {
        const db = getDatabase();
        const teacher = db.prepare('SELECT last_name, first_name, max_weekly_hours FROM teachers WHERE id = ?').get(teacherId);
        if (!teacher) {
            return { isValid: false, message: 'Docente no encontrado para validar carga horaria.' };
        }

        const maxHours = teacher.max_weekly_hours || 30;
        const currentHours = this.calculateTeacherActiveHours(teacherId, excludeDesignationId);
        const projectedHours = currentHours + Number(newHours);

        if (projectedHours > maxHours) {
            return {
                isValid: false,
                message: `LÍMITE EXCEDIDO: El docente ${teacher.last_name}, ${teacher.first_name} posee actualmente ${currentHours} hs cátedra activas. Asignar ${newHours} hs superaría el tope institucional de ${maxHours} hs semanales (Proyección: ${projectedHours} hs).`,
                currentHours,
                maxHours,
                projectedHours
            };
        }

        return {
            isValid: true,
            message: `Horas válidas (${projectedHours}/${maxHours} hs semanales).`,
            currentHours,
            maxHours,
            projectedHours
        };
    }

    /**
     * Valida solapamiento de horarios (start_time a end_time) en el mismo day_of_week
     * Dos intervalos [A, B] y [C, D] se superponen si max(A, C) < min(B, D)
     */
    static validateScheduleConflict(teacherId, dayOfWeek, startTime, endTime, excludeDesignationId = null) {
        const db = getDatabase();
        let sql = `
            SELECT d.id, d.start_time, d.end_time, s.name as subject_name
            FROM designations d
            JOIN subjects s ON d.subject_id = s.id
            WHERE d.teacher_id = ? 
              AND d.day_of_week = ? 
              AND d.is_active = 1
        `;
        const params = [teacherId, dayOfWeek];
        if (excludeDesignationId) {
            sql += ' AND d.id != ?';
            params.push(excludeDesignationId);
        }

        const designations = db.prepare(sql).all(...params);

        const toMinutes = (timeStr) => {
            if (!timeStr) return 0;
            const parts = timeStr.split(':').map(Number);
            return (parts[0] * 60) + (parts[1] || 0);
        };

        const newStart = toMinutes(startTime);
        const newEnd = toMinutes(endTime);

        for (const des of designations) {
            const existStart = toMinutes(des.start_time);
            const existEnd = toMinutes(des.end_time);

            // Verificación de solapamiento
            if (Math.max(newStart, existStart) < Math.min(newEnd, existEnd)) {
                return {
                    isValid: false,
                    message: `INCOMPATIBILIDAD HORARIA: Existe superposición el día ${dayOfWeek}. El docente ya dicta "${des.subject_name}" de ${des.start_time} a ${des.end_time}.`,
                    conflictingSubject: des.subject_name
                };
            }
        }

        return { isValid: true, message: 'Horario compatible sin superposición.' };
    }
}

module.exports = { ValidationService };
