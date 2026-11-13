/**
 * Servicio de Calendario Institucional del Profesorado para SIGET
 * Permite visualizar de fecha a fecha el historial cronológico y la disponibilidad
 * completa de cada docente:
 * - Períodos de licencias médicas (Art. 114 a, 114 b, etc.)
 * - Inasistencias injustificadas y permisos particulares (Art. 115)
 * - Cátedras y designaciones activas (con control de 30 horas semanales)
 * - Suplencias vigentes (tanto cuando actúa como titular sustituido como cuando es suplente)
 * - Métricas acumuladas del ciclo lectivo y alertas de proximidad a topes estatutarios.
 */

const { getDatabase } = require('../database/db');
const { AttendanceService } = require('./attendanceService');
const { NormativeService } = require('./normativeService');

class TeacherCalendarService {
    /**
     * Obtiene el cronograma y estado institucional detallado de un docente en un rango de fechas.
     */
    static getTeacherTimeline({ teacherId, startDate = null, endDate = null }) {
        const db = getDatabase();
        const tid = Number(teacherId);

        if (!tid || isNaN(tid)) {
            return { success: false, message: 'ID de docente inválido.' };
        }

        try {
            // 1. Docente y carga horaria
            const teacher = db.prepare(`
                SELECT 
                    t.id, t.legajo, t.dni, t.cuil, t.first_name, t.last_name,
                    t.email, t.phone, t.revista, t.max_weekly_hours, t.is_active,
                    (SELECT COALESCE(SUM(hours_count), 0) FROM designations WHERE teacher_id = t.id AND is_active = 1) as active_hours
                FROM teachers t
                WHERE t.id = ?
            `).get(tid);

            if (!teacher) {
                return { success: false, message: 'Docente no encontrado.' };
            }

            // Fechas por defecto: mes corriente si no se especifican
            const now = new Date();
            const currentYear = now.getFullYear();
            const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
            const defaultStart = `${currentYear}-${currentMonth}-01`;
            const lastDay = new Date(currentYear, now.getMonth() + 1, 0).getDate();
            const defaultEnd = `${currentYear}-${currentMonth}-${String(lastDay).padStart(2, '0')}`;

            const start = startDate || defaultStart;
            const end = endDate || defaultEnd;

            // 2. Cátedras y Designaciones Activas
            const designations = db.prepare(`
                SELECT 
                    d.id, d.day_of_week, d.start_time, d.end_time, d.hours_count,
                    d.resolution_number, d.cargo, d.revista,
                    s.id as subject_id, s.name as subject_name, s.code as subject_code,
                    c.id as career_id, c.name as career_name
                FROM designations d
                JOIN subjects s ON d.subject_id = s.id
                JOIN careers c ON s.career_id = c.id
                WHERE d.teacher_id = ? AND d.is_active = 1
                ORDER BY d.day_of_week, d.start_time
            `).all(tid);

            // 3. Suplencias como Titular (donde este docente está de licencia y otro lo reemplaza)
            const titularSubstitutions = db.prepare(`
                SELECT 
                    sub.id, sub.license_reason, sub.start_date, sub.end_date, sub.resolution_number, sub.is_active,
                    s.name as subject_name,
                    sup.first_name as sup_first, sup.last_name as sup_last, sup.dni as sup_dni
                FROM substitutions sub
                JOIN designations d ON sub.designation_id = d.id
                JOIN subjects s ON d.subject_id = s.id
                JOIN teachers sup ON sub.suplente_teacher_id = sup.id
                WHERE sub.titular_teacher_id = ?
                ORDER BY sub.start_date DESC
            `).all(tid).map(s => ({
                id: s.id,
                rol: 'Titular Sustituido',
                suplenteName: `${s.sup_last}, ${s.sup_first}`,
                suplenteDni: String(s.sup_dni),
                subjectName: s.subject_name,
                reason: s.license_reason,
                startDate: s.start_date,
                endDate: s.end_date || 'Abierta',
                resolution: s.resolution_number,
                isActive: Boolean(s.is_active)
            }));

            // 4. Suplencias como Suplente (donde este docente cubre a otro)
            const suplenteSubstitutions = db.prepare(`
                SELECT 
                    sub.id, sub.license_reason, sub.start_date, sub.end_date, sub.resolution_number, sub.is_active,
                    s.name as subject_name,
                    tit.first_name as tit_first, tit.last_name as tit_last, tit.dni as tit_dni
                FROM substitutions sub
                JOIN designations d ON sub.designation_id = d.id
                JOIN subjects s ON d.subject_id = s.id
                JOIN teachers tit ON sub.titular_teacher_id = tit.id
                WHERE sub.suplente_teacher_id = ?
                ORDER BY sub.start_date DESC
            `).all(tid).map(s => ({
                id: s.id,
                rol: 'Suplente Asignado',
                titularName: `${s.tit_last}, ${s.tit_first}`,
                titularDni: String(s.tit_dni),
                subjectName: s.subject_name,
                reason: s.license_reason,
                startDate: s.start_date,
                endDate: s.end_date || 'Abierta',
                resolution: s.resolution_number,
                isActive: Boolean(s.is_active)
            }));

            // 5. Registros de Asistencia dentro del rango seleccionado
            const rawAttendances = db.prepare(`
                SELECT 
                    a.id, a.date, a.status, a.hours, a.observations,
                    d.id as designation_id, s.name as subject_name
                FROM attendances a
                LEFT JOIN designations d ON a.designation_id = d.id
                LEFT JOIN subjects s ON d.subject_id = s.id
                WHERE a.teacher_id = ? AND a.date >= ? AND a.date <= ? AND a.is_active = 1
                ORDER BY a.date ASC, a.id ASC
            `).all(tid, start, end);

            const events = rawAttendances.map(a => {
                const c = AttendanceService.classifyRecord(a.status, a.observations);
                let badgeClass = 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40';
                let eventType = 'Presente';

                if (c.isUnexcusedAbsence) {
                    badgeClass = 'bg-rose-500/20 text-rose-400 border-rose-500/40';
                    eventType = 'Inasistencia';
                } else if (c.isPermit) {
                    badgeClass = 'bg-amber-500/20 text-amber-400 border-amber-500/40';
                    eventType = 'Permiso Particular';
                } else if (c.isLicense) {
                    badgeClass = 'bg-purple-500/20 text-purple-400 border-purple-500/40';
                    eventType = 'Licencia Médica';
                } else if (c.isLongTreatment) {
                    badgeClass = 'bg-indigo-500/20 text-indigo-400 border-indigo-500/40';
                    eventType = 'Largo Tratamiento';
                }

                return {
                    id: a.id,
                    date: a.date,
                    status: a.status,
                    hours: a.hours,
                    subjectName: a.subject_name || 'Planta General',
                    observations: a.observations || '',
                    eventType,
                    badgeClass,
                    isPresence: c.isPresence,
                    isUnexcusedAbsence: c.isUnexcusedAbsence,
                    isPermit: c.isPermit,
                    isLicense: c.isLicense,
                    isLongTreatment: c.isLongTreatment
                };
            });

            // 6. Cómputo Acumulado del Ciclo Lectivo Completo (para seguimiento de topes)
            const yearStr = start.substring(0, 4);
            const allYearAttendances = db.prepare(`
                SELECT date, status, observations
                FROM attendances
                WHERE teacher_id = ? AND substr(date, 1, 4) = ? AND is_active = 1
                ORDER BY date ASC
            `).all(tid, yearStr);

            // Deduplicar días para no contar doble si hubiera más de una cátedra el mismo día
            const seenDays = new Set();
            let yearInasistencias = 0;
            let yearPermisos = 0;
            let yearLicencias = 0;
            let yearLargoTratamiento = 0;
            let yearPresentes = 0;

            for (const a of allYearAttendances) {
                if (seenDays.has(a.date)) continue;
                seenDays.add(a.date);

                const c = AttendanceService.classifyRecord(a.status, a.observations);
                if (c.isUnexcusedAbsence) yearInasistencias++;
                else if (c.isPermit) yearPermisos++;
                else if (c.isLicense) yearLicencias++;
                else if (c.isLongTreatment) yearLargoTratamiento++;
                else if (c.isPresence) yearPresentes++;
            }

            // Determinar estado actual de disponibilidad
            let availabilityStatus = 'Disponible';
            let availabilityBadge = 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';

            const activeSubTit = titularSubstitutions.find(s => s.isActive);
            if (activeSubTit) {
                availabilityStatus = `De Licencia (${activeSubTit.reason || 'Reemplazado'})`;
                availabilityBadge = 'bg-purple-500/20 text-purple-400 border-purple-500/30';
            } else if (yearInasistencias >= 5) {
                availabilityStatus = 'Límite de Faltas Agotado';
                availabilityBadge = 'bg-rose-500/20 text-rose-400 border-rose-500/30';
            } else if (teacher.active_hours >= 30) {
                availabilityStatus = 'Tope Semanal Completo (30 hs)';
                availabilityBadge = 'bg-blue-500/20 text-blue-400 border-blue-500/30';
            }

            return {
                success: true,
                teacher: {
                    id: teacher.id,
                    dni: String(teacher.dni),
                    legajo: teacher.legajo,
                    fullName: `${teacher.last_name}, ${teacher.first_name}`,
                    firstName: teacher.first_name,
                    lastName: teacher.last_name,
                    revista: teacher.revista,
                    maxWeeklyHours: teacher.max_weekly_hours || 30,
                    activeHours: teacher.active_hours || 0,
                    availableHours: Math.max(0, (teacher.max_weekly_hours || 30) - (teacher.active_hours || 0)),
                    availabilityStatus,
                    availabilityBadge
                },
                period: {
                    startDate: start,
                    endDate: end
                },
                designations,
                substitutions: {
                    asTitular: titularSubstitutions,
                    asSuplente: suplenteSubstitutions,
                    totalActive: titularSubstitutions.filter(s => s.isActive).length + suplenteSubstitutions.filter(s => s.isActive).length
                },
                events,
                annualMetrics: {
                    cycleYear: yearStr,
                    presentes: yearPresentes,
                    inasistencias: {
                        count: yearInasistencias,
                        limit: 5,
                        percentage: Math.min(100, Math.round((yearInasistencias / 5) * 100)),
                        isWarning: yearInasistencias >= 3 && yearInasistencias < 5,
                        isDanger: yearInasistencias >= 5
                    },
                    permisos: {
                        count: yearPermisos,
                        limit: 6,
                        percentage: Math.min(100, Math.round((yearPermisos / 6) * 100)),
                        isWarning: yearPermisos >= 4 && yearPermisos < 6,
                        isDanger: yearPermisos >= 6
                    },
                    licenciasMedicas: {
                        count: yearLicencias,
                        limit: 25,
                        percentage: Math.min(100, Math.round((yearLicencias / 25) * 100)),
                        isWarning: yearLicencias >= 20 && yearLicencias < 25,
                        isDanger: yearLicencias >= 25
                    },
                    largoTratamiento: yearLargoTratamiento
                }
            };
        } catch (error) {
            console.error('[TeacherCalendarService] Error obteniendo timeline:', error);
            return {
                success: false,
                message: `Error al compilar el calendario: ${error.message}`
            };
        }
    }

    /**
     * Obtiene una panorámica institucional de ausentismo y licencias de todos los docentes
     * en un rango de fechas o mes específico.
     */
    static getInstitutionalOverview({ startDate = null, endDate = null } = {}) {
        const db = getDatabase();
        try {
            const now = new Date();
            const start = startDate || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
            const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
            const end = endDate || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

            // Suplencias activas institucionales
            const activeSubs = db.prepare(`
                SELECT 
                    sub.id, sub.license_reason, sub.start_date, sub.end_date, sub.resolution_number,
                    s.name as subject_name,
                    tit.first_name as tit_first, tit.last_name as tit_last,
                    sup.first_name as sup_first, sup.last_name as sup_last
                FROM substitutions sub
                JOIN designations d ON sub.designation_id = d.id
                JOIN subjects s ON d.subject_id = s.id
                JOIN teachers tit ON sub.titular_teacher_id = tit.id
                JOIN teachers sup ON sub.suplente_teacher_id = sup.id
                WHERE sub.is_active = 1
                ORDER BY sub.start_date DESC
            `).all().map(s => ({
                id: s.id,
                titular: `${s.tit_last}, ${s.tit_first}`,
                suplente: `${s.sup_last}, ${s.sup_first}`,
                subject: s.subject_name,
                reason: s.license_reason,
                startDate: s.start_date,
                endDate: s.end_date || 'Abierta',
                resolution: s.resolution_number
            }));

            // Docentes con licencias o inasistencias en el rango
            const leaves = db.prepare(`
                SELECT 
                    a.id, a.date, a.status, a.hours, a.observations,
                    t.id as teacher_id, t.first_name, t.last_name, t.dni, t.legajo
                FROM attendances a
                JOIN teachers t ON a.teacher_id = t.id
                WHERE a.date >= ? AND a.date <= ? AND a.status IN ('LIC', 'LT', 'P', 'I') AND a.is_active = 1
                ORDER BY a.date DESC, t.last_name ASC
            `).all(start, end).map(r => ({
                id: r.id,
                date: r.date,
                teacherId: r.teacher_id,
                teacherName: `${r.last_name}, ${r.first_name}`,
                dni: String(r.dni),
                status: r.status,
                hours: r.hours,
                observations: r.observations || ''
            }));

            return {
                success: true,
                range: { start, end },
                activeSubstitutions: activeSubs,
                leaveRecords: leaves,
                totalActiveSubstitutions: activeSubs.length,
                totalLeavesInPeriod: leaves.length
            };
        } catch (error) {
            console.error('[TeacherCalendarService] Error en resumen institucional:', error);
            return {
                success: false,
                message: error.message
            };
        }
    }
}

module.exports = { TeacherCalendarService };
