/**
 * Servicio de Estadísticas y Paneles para el Dashboard de SIGET
 * Provee métricas ejecutivas para Rector y operativas para Bedelía.
 * Incluye Módulo de Alertas de Inasistencias y Topes Anuales (Requerimientos v2.0).
 */

const { getDatabase } = require('../database/db');
const { AuditService } = require('./auditService');
const { AuthService } = require('./authService');
const { NormativeService } = require('./normativeService');

class DashboardService {
    static getStats() {
        const db = getDatabase();
        try {
            const isRector = AuthService.isRector();
            const currentYear = NormativeService.getCurrentYear();

            // Métricas generales de planta
            const totalTeachers = db.prepare('SELECT COUNT(*) as count FROM teachers WHERE is_active = 1').get().count;
            const titulares = db.prepare("SELECT COUNT(*) as count FROM teachers WHERE is_active = 1 AND revista = 'Titular'").get().count;
            const provisionales = db.prepare("SELECT COUNT(*) as count FROM teachers WHERE is_active = 1 AND revista = 'Provisional'").get().count;
            const interinos = db.prepare("SELECT COUNT(*) as count FROM teachers WHERE is_active = 1 AND revista = 'Interino'").get().count;
            const suplentes = db.prepare("SELECT COUNT(*) as count FROM teachers WHERE is_active = 1 AND revista = 'Suplente'").get().count;

            const totalStudents = db.prepare('SELECT COUNT(*) as count FROM students WHERE is_active = 1').get().count;

            const desigs = db.prepare('SELECT hours_count FROM designations WHERE is_active = 1').all();
            const totalDesignations = desigs.length;
            const totalWeeklyHours = desigs.reduce((sum, d) => sum + (d.hours_count || 0), 0);

            // Suplencias activas
            const rawSubs = db.prepare(`
                SELECT 
                    sub.id, sub.license_reason, sub.start_date, sub.end_date, sub.resolution_number,
                    s.name as subject_name,
                    t.first_name as tit_first, t.last_name as tit_last,
                    sup.first_name as sup_first, sup.last_name as sup_last
                FROM substitutions sub
                JOIN designations d ON sub.designation_id = d.id
                JOIN subjects s ON d.subject_id = s.id
                JOIN teachers t ON sub.titular_teacher_id = t.id
                JOIN teachers sup ON sub.suplente_teacher_id = sup.id
                WHERE sub.is_active = 1
                ORDER BY sub.id DESC
                LIMIT 6
            `).all();

            const activeSubstitutions = rawSubs.map(s => ({
                id: s.id,
                titularName: `${s.tit_last}, ${s.tit_first}`,
                suplenteName: `${s.sup_last}, ${s.sup_first}`,
                subjectName: s.subject_name,
                resolution: s.resolution_number,
                endDateStr: s.end_date || '-'
            }));

            // Docentes cercanos al tope (>= 24 hs de 30 hs)
            const teachers = db.prepare(`
                SELECT t.id, t.legajo, t.dni, t.first_name, t.last_name, t.revista, t.max_weekly_hours,
                       (SELECT COALESCE(SUM(hours_count), 0) FROM designations WHERE teacher_id = t.id AND is_active = 1) as hours
                FROM teachers t
                WHERE t.is_active = 1
            `).all();

            const nearCapTeachers = teachers
                .filter(t => t.hours >= 24)
                .map(t => ({
                    id: t.id,
                    fullName: `${t.last_name}, ${t.first_name}`,
                    dni: String(t.dni),
                    legajo: t.legajo,
                    revista: t.revista,
                    hours: t.hours,
                    maxHours: t.max_weekly_hours || 30
                }));

            // Auditoría reciente
            const recentAudits = AuditService.getRecent(8).map(a => ({
                id: a.id,
                username: a.username,
                action: a.action,
                details: a.details || '',
                timestampStr: (a.timestamp || '').replace('T', ' ').substring(0, 16)
            }));

            // -------------------------------------------------------------
            // CÓMPUTO OPERATIVO DE ASISTENCIAS DE HOY (Conjunto Cerrado v2.0)
            // -------------------------------------------------------------
            const todayStr = AuditService.getArgentinaTimestamp().substring(0, 10);
            const todayAtts = db.prepare('SELECT status FROM attendances WHERE date = ? AND is_active = 1').all(todayStr);

            let todayPresentes = 0;
            let todayInasistencias = 0;
            let todayPermisos = 0;
            let todayLicencias = 0;

            for (const a of todayAtts) {
                const s = (a.status || '').trim().toUpperCase();
                if (s === 'PR' || s === 'PRESENTE') todayPresentes++;
                else if (s === 'P' || s.includes('PERMISO')) todayPermisos++;
                else if (s === 'LIC' || s === 'LT' || s.includes('LICENCIA')) todayLicencias++;
                else if (s === 'I' || s.includes('AUSENTE') || s.includes('FALTA')) todayInasistencias++;
                else todayInasistencias++;
            }

            const todaySinRegistrar = Math.max(0, totalTeachers - todayAtts.length);

            // -------------------------------------------------------------
            // REQUERIMIENTO 6: MÓDULO DE ALERTAS DE INASISTENCIAS Y TOPES ANUALES
            // -------------------------------------------------------------
            const attendanceAlerts = this._calculateAttendanceAlerts(db, teachers, currentYear);

            // Alumnos ingresantes recientes
            const recentStudents = db.prepare(`
                SELECT s.id, s.legajo, s.first_name, s.last_name, s.year_enrolled, c.name as career_name
                FROM students s
                LEFT JOIN careers c ON s.career_id = c.id
                WHERE s.is_active = 1
                ORDER BY s.id DESC
                LIMIT 5
            `).all().map(st => ({
                id: st.id,
                legajo: st.legajo,
                fullName: `${st.last_name}, ${st.first_name}`,
                careerName: st.career_name || 'Sin Carrera',
                yearEnrolled: st.year_enrolled
            }));

            return {
                isRector,
                currentYear,
                totalTeachers,
                titulares,
                provisionales,
                interinos,
                suplentes,
                totalStudents,
                totalDesignations,
                totalWeeklyHours,
                activeSubstitutions,
                nearCapTeachers,
                attendanceAlerts,
                recentAudits,
                todayStats: {
                    dateStr: todayStr,
                    presentes: todayPresentes,
                    inasistencias: todayInasistencias,
                    ausentes: todayInasistencias, // Compatibilidad UI
                    permisos: todayPermisos,
                    licencias: todayLicencias,
                    sinRegistrar: todaySinRegistrar
                },
                recentStudents
            };
        } catch (error) {
            console.error('[DashboardService] Error obteniendo estadísticas:', error);
            return null;
        }
    }

    /**
     * Calcula de forma acumulativa las faltas, permisos y licencias por docente en el ciclo lectivo actual,
     * generando advertencias antes de agotar los límites anuales permitidos.
     */
    static _calculateAttendanceAlerts(db, teachers, currentYear) {
        try {
            const yearStart = `${currentYear}-01-01`;
            const yearEnd = `${currentYear}-12-31`;

            // Obtener todas las asistencias del ciclo lectivo actual
            const yearAtts = db.prepare(`
                SELECT teacher_id, status, observations
                FROM attendances
                WHERE date >= ? AND date <= ? AND is_active = 1
            `).all(yearStart, yearEnd);

            // Agrupar por docente
            const countsByTeacher = new Map();
            for (const att of yearAtts) {
                if (!countsByTeacher.has(att.teacher_id)) {
                    countsByTeacher.set(att.teacher_id, {
                        inasistencias: 0,
                        permisos: 0,
                        licencias: 0,
                        largoTratamiento: 0
                    });
                }
                const cnt = countsByTeacher.get(att.teacher_id);
                const s = (att.status || '').trim().toUpperCase();
                const obs = (att.observations || '').toLowerCase();

                if (s === 'P' || obs.includes('115') || obs.includes('permiso')) {
                    cnt.permisos++;
                } else if (s === 'LT' || obs.includes('largo tratamiento') || obs.includes('48')) {
                    cnt.largoTratamiento++;
                } else if (s === 'LIC' || obs.includes('médic') || obs.includes('salud') || obs.includes('licencia')) {
                    cnt.licencias++;
                } else if (s === 'I' || s.includes('AUSENTE') || s.includes('FALTA')) {
                    cnt.inasistencias++;
                }
            }

            const alerts = [];

            for (const t of teachers) {
                const c = countsByTeacher.get(t.id) || { inasistencias: 0, permisos: 0, licencias: 0, largoTratamiento: 0 };
                const teacherFullName = `${t.last_name}, ${t.first_name}`;

                // 1. Alerta de Permisos Particulares (Art. 115 - Máximo estatutario: 6 al año)
                if (c.permisos >= 6) {
                    alerts.push({
                        teacherId: t.id,
                        fullName: teacherFullName,
                        dni: String(t.dni),
                        legajo: t.legajo,
                        tipo: 'Permisos Particulares (Art. 115)',
                        consumido: c.permisos,
                        limite: 6,
                        nivel: 'danger', // Rojo
                        badge: 'Cupo Anual Agotado',
                        detalle: `Agotó los 6 permisos particulares permitidos en el año (${c.permisos}/6).`
                    });
                } else if (c.permisos >= 4) {
                    alerts.push({
                        teacherId: t.id,
                        fullName: teacherFullName,
                        dni: String(t.dni),
                        legajo: t.legajo,
                        tipo: 'Permisos Particulares (Art. 115)',
                        consumido: c.permisos,
                        limite: 6,
                        nivel: 'warning', // Amarillo
                        badge: 'Próximo al Límite',
                        detalle: `Consumió ${c.permisos} de 6 permisos particulares (quedan ${6 - c.permisos} disponibles).`
                    });
                }

                // 2. Alerta de Inasistencias Injustificadas ('I')
                if (c.inasistencias >= 5) {
                    alerts.push({
                        teacherId: t.id,
                        fullName: teacherFullName,
                        dni: String(t.dni),
                        legajo: t.legajo,
                        tipo: 'Inasistencias Injustificadas (I)',
                        consumido: c.inasistencias,
                        limite: 5,
                        nivel: 'danger',
                        badge: 'Límite Crítico de Faltas',
                        detalle: `Acumula ${c.inasistencias} inasistencias sin justificar en el ciclo lectivo.`
                    });
                } else if (c.inasistencias >= 3) {
                    alerts.push({
                        teacherId: t.id,
                        fullName: teacherFullName,
                        dni: String(t.dni),
                        legajo: t.legajo,
                        tipo: 'Inasistencias Injustificadas (I)',
                        consumido: c.inasistencias,
                        limite: 5,
                        nivel: 'warning',
                        badge: 'Acumulación de Inasistencias',
                        detalle: `Acumula ${c.inasistencias} inasistencias en el ciclo lectivo.`
                    });
                }

                // 3. Alerta de Licencias Médicas de Corto Tratamiento (Art. 114 a - Máx 25 días)
                if (c.licencias >= 25) {
                    alerts.push({
                        teacherId: t.id,
                        fullName: teacherFullName,
                        dni: String(t.dni),
                        legajo: t.legajo,
                        tipo: 'Licencias Médicas (Art. 114 a)',
                        consumido: c.licencias,
                        limite: 25,
                        nivel: 'danger',
                        badge: 'Tope Médico Alcanzado',
                        detalle: `Alcanzó el tope anual de 25 días de corto tratamiento (${c.licencias} días).`
                    });
                } else if (c.licencias >= 20) {
                    alerts.push({
                        teacherId: t.id,
                        fullName: teacherFullName,
                        dni: String(t.dni),
                        legajo: t.legajo,
                        tipo: 'Licencias Médicas (Art. 114 a)',
                        consumido: c.licencias,
                        limite: 25,
                        nivel: 'warning',
                        badge: 'Cercano a Tope Médico',
                        detalle: `Acumula ${c.licencias} de 25 días médicos anuales permitidos.`
                    });
                }
            }

            // Ordenar: primero los de nivel 'danger', luego 'warning'
            alerts.sort((a, b) => {
                if (a.nivel === 'danger' && b.nivel !== 'danger') return -1;
                if (a.nivel !== 'danger' && b.nivel === 'danger') return 1;
                return b.consumido - a.consumido;
            });

            return alerts;
        } catch (e) {
            console.error('[DashboardService] Error calculando alertas de inasistencias:', e);
            return [];
        }
    }
}

module.exports = { DashboardService };
