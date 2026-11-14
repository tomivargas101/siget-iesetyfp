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

    /**
     * Retorna la matriz completa mensual de asistencias, licencias, feriados y jornadas institucionales
     * para el calendario interactivo en tiempo real y la vista planilla 1..31.
     */
    static getMonthMatrix({ year, month }) {
        const db = getDatabase();
        try {
            const y = Number(year) || new Date().getFullYear();
            const m = Number(month) || (new Date().getMonth() + 1);
            const mStr = String(m).padStart(2, '0');
            const prefix = `${y}-${mStr}`;

            const daysInMonth = new Date(y, m, 0).getDate();
            const monthNames = [
                'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
            ];
            const monthName = monthNames[m - 1] || `Mes ${m}`;

            // Docentes activos
            const teachers = db.prepare(`
                SELECT id, legajo, dni, first_name, last_name, revista,
                       (SELECT COALESCE(SUM(hours_count), 0) FROM designations WHERE teacher_id = teachers.id AND is_active = 1) as hours
                FROM teachers
                WHERE is_active = 1
                ORDER BY last_name, first_name
            `).all();

            // Asistencias del mes
            const monthAttendances = db.prepare(`
                SELECT a.id, a.teacher_id, a.date, a.status, a.hours, a.observations,
                       t.first_name, t.last_name, t.dni, t.legajo
                FROM attendances a
                JOIN teachers t ON a.teacher_id = t.id
                WHERE a.date LIKE ? AND a.is_active = 1
                ORDER BY a.date ASC, t.last_name ASC
            `).all(`${prefix}%`);

            // Suplencias activas en el mes
            const monthSubs = db.prepare(`
                SELECT sub.id, sub.license_reason, sub.start_date, sub.end_date, sub.resolution_number,
                       s.name as subject_name,
                       tit.first_name as tit_first, tit.last_name as tit_last,
                       sup.first_name as sup_first, sup.last_name as sup_last
                FROM substitutions sub
                JOIN designations d ON sub.designation_id = d.id
                JOIN subjects s ON d.subject_id = s.id
                JOIN teachers tit ON sub.titular_teacher_id = tit.id
                JOIN teachers sup ON sub.suplente_teacher_id = sup.id
                WHERE (sub.start_date <= ? AND (sub.end_date >= ? OR sub.end_date IS NULL)) AND sub.is_active = 1
            `).all(`${prefix}-${String(daysInMonth).padStart(2, '0')}`, `${prefix}-01`);

            // Mapeo por día
            const dayEventsMap = new Map();
            for (let d = 1; d <= daysInMonth; d++) {
                dayEventsMap.set(d, []);
            }
            for (const att of monthAttendances) {
                const dayNum = parseInt(att.date.split('-')[2]);
                if (dayEventsMap.has(dayNum)) {
                    dayEventsMap.get(dayNum).push(att);
                }
            }

            // Días del mes con información de feriados y jornadas institucionales
            const days = [];
            const dayShortNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

            for (let d = 1; d <= daysInMonth; d++) {
                const dStr = `${prefix}-${String(d).padStart(2, '0')}`;
                const dt = new Date(y, m - 1, d);
                const dayOfWeek = dt.getDay();
                const dayInfo = NormativeService.getCalendarDayInfo(dStr);

                const attsOnDay = dayEventsMap.get(d) || [];
                let prCount = 0;
                let iCount = 0;
                let pCount = 0;
                let licCount = 0;
                let ltCount = 0;
                const leaves = [];

                for (const a of attsOnDay) {
                    const c = AttendanceService.classifyRecord(a.status, a.observations);
                    if (c.isPresence) prCount++;
                    else if (c.isUnexcusedAbsence) {
                        iCount++;
                        leaves.push({
                            teacherId: a.teacher_id,
                            teacherName: `${a.last_name}, ${a.first_name}`,
                            dni: String(a.dni),
                            legajo: a.legajo,
                            status: 'I',
                            statusLabel: 'Inasistencia',
                            badgeClass: 'bg-rose-500/20 text-rose-400 border-rose-500/40',
                            hours: a.hours || 4,
                            observations: a.observations || 'Sin justificación'
                        });
                    } else if (c.isPermit) {
                        pCount++;
                        leaves.push({
                            teacherId: a.teacher_id,
                            teacherName: `${a.last_name}, ${a.first_name}`,
                            dni: String(a.dni),
                            legajo: a.legajo,
                            status: 'P',
                            statusLabel: 'Permiso (Art. 115)',
                            badgeClass: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
                            hours: a.hours || 4,
                            observations: a.observations || 'Razones Particulares'
                        });
                    } else if (c.isLicense) {
                        licCount++;
                        leaves.push({
                            teacherId: a.teacher_id,
                            teacherName: `${a.last_name}, ${a.first_name}`,
                            dni: String(a.dni),
                            legajo: a.legajo,
                            status: 'LIC',
                            statusLabel: 'Licencia Médica / Especial',
                            badgeClass: 'bg-purple-500/20 text-purple-400 border-purple-500/40',
                            hours: a.hours || 4,
                            observations: a.observations || 'Licencia reglamentaria'
                        });
                    } else if (c.isLongTreatment) {
                        ltCount++;
                        leaves.push({
                            teacherId: a.teacher_id,
                            teacherName: `${a.last_name}, ${a.first_name}`,
                            dni: String(a.dni),
                            legajo: a.legajo,
                            status: 'LT',
                            statusLabel: 'Largo Tratamiento',
                            badgeClass: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/40',
                            hours: a.hours || 4,
                            observations: a.observations || 'Art. 48 Tratamiento Prolongado'
                        });
                    }
                }

                const fullDayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
                days.push({
                    day: d,
                    date: dStr,
                    dateStr: dStr,
                    dayOfWeek,
                    dayName: dayShortNames[dayOfWeek],
                    dayOfWeekName: fullDayNames[dayOfWeek],
                    isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
                    isNonWorking: dayInfo.isNonWorking,
                    isHoliday: Boolean(dayInfo.isHoliday || (dayInfo.isNonWorking && !dayInfo.isWeekend && !dayInfo.isInstitutionalDay)),
                    holidayName: dayInfo.reason,
                    isInstitutionalDay: Boolean(dayInfo.isInstitutionalDay),
                    institutionalName: dayInfo.isInstitutionalDay ? dayInfo.reason : null,
                    institutionalDayName: dayInfo.isInstitutionalDay ? dayInfo.reason : null,
                    badge: dayInfo.badge,
                    leavesCount: leaves.length,
                    prCount,
                    iCount,
                    pCount,
                    licCount,
                    ltCount,
                    stats: {
                        PR: prCount,
                        I: iCount,
                        P: pCount,
                        LIC: licCount,
                        LT: ltCount
                    },
                    records: attsOnDay.map(a => ({
                        teacherId: a.teacher_id,
                        fullName: `${a.last_name}, ${a.first_name}`,
                        legajo: a.legajo,
                        status: AttendanceService.classifyRecord(a.status, a.observations).code,
                        hours: a.hours || 4,
                        observations: a.observations || ''
                    })),
                    leaves
                });
            }

            // Construcción de la matriz docente (Planilla Oficial 1..31)
            const teachersMatrix = teachers.map(t => {
                const dayMap = {};
                let totPr = 0;
                let totI = 0;
                let totP = 0;
                let totLic = 0;
                let totLt = 0;

                const tAtts = monthAttendances.filter(a => a.teacher_id === t.id);
                for (const a of tAtts) {
                    const dayNum = parseInt(a.date.split('-')[2]);
                    const code = AttendanceService.classifyRecord(a.status, a.observations).code;
                    dayMap[dayNum] = {
                        status: code,
                        hours: a.hours || 4,
                        observations: a.observations || '',
                        toString() { return this.status; }
                    };
                    if (code === 'PR') totPr++;
                    else if (code === 'I') totI++;
                    else if (code === 'P') totP++;
                    else if (code === 'LIC') totLic++;
                    else if (code === 'LT') totLt++;
                }

                return {
                    teacherId: t.id,
                    fullName: `${t.last_name}, ${t.first_name}`,
                    firstName: t.first_name,
                    lastName: t.last_name,
                    dni: String(t.dni),
                    legajo: t.legajo || 'S/L',
                    revista: t.revista || 'Titular',
                    hoursWeekly: t.hours || 0,
                    days: dayMap,
                    totals: {
                        pr: totPr,
                        i: totI,
                        p: totP,
                        lic: totLic,
                        lt: totLt,
                        PR: totPr,
                        I: totI,
                        P: totP,
                        LIC: totLic,
                        LT: totLt,
                        totalLeaves: totI + totP + totLic + totLt,
                        totalWorkedDays: totPr
                    }
                };
            });

            return {
                success: true,
                year: y,
                month: m,
                monthStr: mStr,
                monthName,
                daysInMonth,
                days,
                teachersMatrix,
                substitutions: monthSubs,
                stats: {
                    totalTeachers: teachers.length,
                    workdays: days.filter(d => !d.isNonWorking && !d.isWeekend).length,
                    holidays: days.filter(d => d.isHoliday).length,
                    institutionalDays: days.filter(d => d.isInstitutionalDay).length,
                    totalNovelties: days.reduce((acc, d) => acc + (d.iCount + d.pCount + d.licCount + d.ltCount), 0),
                    totalAbsences: days.reduce((acc, d) => acc + d.iCount, 0),
                    totalPermits: days.reduce((acc, d) => acc + d.pCount, 0),
                    totalLicenses: days.reduce((acc, d) => acc + d.licCount, 0),
                    totalLongTreatments: days.reduce((acc, d) => acc + d.ltCount, 0),
                    totalNonWorkingDays: days.filter(d => d.isNonWorking).length,
                    totalHolidays: days.filter(d => d.isHoliday).length,
                    totalInstitutionalDays: days.filter(d => d.isInstitutionalDay).length
                }
            };
        } catch (error) {
            console.error('[TeacherCalendarService] Error generando month matrix:', error);
            return { success: false, message: error.message };
        }
    }

    /**
     * Exporta la grilla completa del mes en un archivo Excel oficial con todas las novedades.
     */
    static async exportMonthExcel({ year, month, outputDir = null }) {
        const path = require('path');
        const fs = require('fs');
        const ExcelJS = require('exceljs');

        const matrix = this.getMonthMatrix({ year, month });
        if (!matrix.success) throw new Error(matrix.message);

        const outDir = outputDir || path.resolve(__dirname, '../../reportes');
        if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

        const fileName = `Planilla_Mensual_Docentes_${matrix.year}_${matrix.monthStr}.xlsx`;
        const filePath = path.join(outDir, fileName);

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'SIGET - Sistema Integral de Gestión Educativa Terciaria';
        workbook.created = new Date();

        const sheet = workbook.addWorksheet(`Asistencia ${matrix.monthName} ${matrix.year}`);
        sheet.views = [{ showGridLines: true }];

        // Título institucional
        sheet.mergeCells(1, 1, 1, matrix.daysInMonth + 9);
        const title = sheet.getCell(1, 1);
        title.value = `SIGET - INSTITUTO DE EDUCACIÓN SUPERIOR • PLANILLA MENSUAL DE ASISTENCIA Y NOVEDADES`;
        title.font = { name: 'Segoe UI', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
        title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
        title.alignment = { horizontal: 'center', vertical: 'middle' };
        sheet.getRow(1).height = 28;

        sheet.mergeCells(2, 1, 2, matrix.daysInMonth + 9);
        const subtitle = sheet.getCell(2, 1);
        subtitle.value = `PERÍODO: ${matrix.monthName.toUpperCase()} ${matrix.year} • GENERADO: ${new Date().toLocaleDateString('es-AR')}`;
        subtitle.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF8A6F0E' } };
        subtitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDF9E7' } };
        subtitle.alignment = { horizontal: 'center', vertical: 'middle' };
        sheet.getRow(2).height = 22;

        // Encabezados
        const headers = ['Legajo', 'Docente (Apellido y Nombres)', 'DNI', 'Revista'];
        for (let d = 1; d <= matrix.daysInMonth; d++) {
            headers.push(String(d));
        }
        headers.push('PR', 'I', 'P', 'LIC', 'LT');

        sheet.getRow(4).values = headers;
        sheet.getRow(4).font = { name: 'Segoe UI', size: 9, bold: true };
        sheet.getRow(4).alignment = { horizontal: 'center', vertical: 'middle' };
        sheet.getRow(4).height = 24;

        // Anchos
        sheet.getColumn(1).width = 11;
        sheet.getColumn(2).width = 28;
        sheet.getColumn(3).width = 12;
        sheet.getColumn(4).width = 12;
        for (let d = 1; d <= matrix.daysInMonth; d++) {
            sheet.getColumn(4 + d).width = 4.2;
        }
        sheet.getColumn(matrix.daysInMonth + 5).width = 6;
        sheet.getColumn(matrix.daysInMonth + 6).width = 6;
        sheet.getColumn(matrix.daysInMonth + 7).width = 6;
        sheet.getColumn(matrix.daysInMonth + 8).width = 6;
        sheet.getColumn(matrix.daysInMonth + 9).width = 6;

        // Filas de docentes
        matrix.teachersMatrix.forEach((t, idx) => {
            const rowNum = 5 + idx;
            const rowVals = [t.legajo, t.fullName, t.dni, t.revista];
            for (let d = 1; d <= matrix.daysInMonth; d++) {
                const dayAtt = t.days[d];
                rowVals.push(dayAtt ? dayAtt.status : '');
            }
            rowVals.push(t.totals.pr, t.totals.i, t.totals.p, t.totals.lic, t.totals.lt);

            const row = sheet.getRow(rowNum);
            row.values = rowVals;
            row.height = 18;
            row.font = { name: 'Segoe UI', size: 9 };

            // Colorear celdas de asistencia
            for (let d = 1; d <= matrix.daysInMonth; d++) {
                const colIdx = 4 + d;
                const cell = row.getCell(colIdx);
                const dayObj = matrix.days[d - 1];
                const val = cell.value;

                if (dayObj && dayObj.isNonWorking) {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
                }

                if (val === 'PR') {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
                    cell.font = { color: { argb: 'FF065F46' }, bold: true, size: 8 };
                } else if (val === 'I') {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
                    cell.font = { color: { argb: 'FF991B1B' }, bold: true, size: 8 };
                } else if (val === 'P') {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
                    cell.font = { color: { argb: 'FF92400E' }, bold: true, size: 8 };
                } else if (val === 'LIC') {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3E8FF' } };
                    cell.font = { color: { argb: 'FF6B21A8' }, bold: true, size: 8 };
                } else if (val === 'LT') {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E7FF' } };
                    cell.font = { color: { argb: 'FF3730A3' }, bold: true, size: 8 };
                }
                cell.alignment = { horizontal: 'center', vertical: 'middle' };
            }
        });

        await workbook.xlsx.writeFile(filePath);

        return {
            success: true,
            filePath,
            fileName,
            message: `Planilla mensual de asistencia guardada en Excel: ${fileName}`
        };
    }

    /**
     * Exporta el calendario y novedades del mes en un documento oficial PDF.
     */
    static async exportMonthPdf({ year, month, outputDir = null, exportedBy = 'SECRETARÍA' }) {
        const path = require('path');
        const fs = require('fs');

        const matrix = this.getMonthMatrix({ year, month });
        if (!matrix.success) throw new Error(matrix.message);

        const outDir = outputDir || path.resolve(__dirname, '../../reportes');
        if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

        const fileName = `Calendario_Academico_${matrix.year}_${matrix.monthStr}.pdf`;
        const filePath = path.join(outDir, fileName);

        const allLeaves = [];
        matrix.days.forEach(d => {
            (d.leaves || []).forEach(l => {
                allLeaves.push({
                    date: d.dateStr,
                    day: d.day,
                    dayName: d.dayName,
                    ...l
                });
            });
        });

        const holidaysList = matrix.days.filter(d => d.isNonWorking && (d.isHoliday || d.isInstitutionalDay)).map(d => `
            <li style="margin-bottom: 4px;">
                <strong>${d.dateStr} (${d.dayName}):</strong> ${escapeCalXml(d.holidayName || d.institutionalDayName || d.badge)}
            </li>
        `).join('');

        const leavesRows = allLeaves.map((l, i) => `
            <tr style="background-color: ${i % 2 === 0 ? '#fff' : '#f8fafc'}; font-size: 10px; border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 5px; text-align: center; font-family: monospace;">${escapeCalXml(l.date)}</td>
                <td style="padding: 5px; font-weight: bold;">${escapeCalXml(l.teacherName)}</td>
                <td style="padding: 5px; text-align: center;">${escapeCalXml(l.dni)}</td>
                <td style="padding: 5px; text-align: center; font-weight: bold; color: ${l.status === 'PR' ? '#059669' : l.status === 'I' ? '#dc2626' : '#b45309'};">${escapeCalXml(l.status)} - ${escapeCalXml(l.statusLabel)}</td>
                <td style="padding: 5px; text-align: center;">${l.hours} hs</td>
                <td style="padding: 5px; color: #475569;">${escapeCalXml(l.observations)}</td>
            </tr>
        `).join('');

        const html = `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>Calendario Académico y Reporte de Novedades - ${matrix.monthName} ${matrix.year}</title>
    <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 24px; color: #0f172a; background: #fff; }
        .header { border-bottom: 2px solid #b45309; padding-bottom: 12px; margin-bottom: 14px; }
        .inst-title { font-size: 13px; font-weight: 800; color: #0f172a; text-transform: uppercase; }
        .doc-title { font-size: 17px; font-weight: 900; color: #b45309; margin: 4px 0; }
        .meta-grid { display: flex; justify-content: space-between; font-size: 10.5px; color: #64748b; background: #f8fafc; padding: 6px 10px; border-radius: 6px; }
        .kpi-boxes { display: flex; gap: 10px; margin: 12px 0; }
        .kpi-box { flex: 1; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px; text-align: center; }
        .kpi-val { font-size: 16px; font-weight: bold; }
        .kpi-lbl { font-size: 9px; text-transform: uppercase; color: #64748b; font-weight: bold; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th { background: #0f172a; color: #f8fafc; font-size: 9.5px; font-weight: 700; text-transform: uppercase; padding: 6px; text-align: left; }
        th.center { text-align: center; }
        .footer { margin-top: 20px; padding-top: 10px; border-top: 1px solid #cbd5e1; font-size: 9px; color: #64748b; display: flex; justify-content: space-between; }
    </style>
</head>
<body>
    <div class="header">
        <div class="inst-title">Instituto de Educación Superior Técnica y Formación Profesional</div>
        <div class="doc-title">CALENDARIO ACADÉMICO MENSUAL Y REPORTE DE NOVEDADES</div>
        <div class="meta-grid">
            <div><strong>Período:</strong> ${matrix.monthName.toUpperCase()} ${matrix.year}</div>
            <div><strong>Generado por:</strong> ${escapeCalXml(exportedBy)} • ${new Date().toLocaleDateString('es-AR')}</div>
            <div><strong>Total Docentes Planta:</strong> ${matrix.stats.totalTeachers}</div>
        </div>
    </div>

    <div class="kpi-boxes">
        <div class="kpi-box">
            <div class="kpi-val" style="color: #dc2626;">${matrix.stats.totalAbsences}</div>
            <div class="kpi-lbl">Inasistencias (I)</div>
        </div>
        <div class="kpi-box">
            <div class="kpi-val" style="color: #d97706;">${matrix.stats.totalPermits}</div>
            <div class="kpi-lbl">Permisos (115)</div>
        </div>
        <div class="kpi-box">
            <div class="kpi-val" style="color: #7c3aed;">${matrix.stats.totalLicenses}</div>
            <div class="kpi-lbl">Licencias Médicas</div>
        </div>
        <div class="kpi-box">
            <div class="kpi-val" style="color: #4f46e5;">${matrix.stats.totalLongTreatments}</div>
            <div class="kpi-lbl">Largo Tratamiento</div>
        </div>
        <div class="kpi-box">
            <div class="kpi-val" style="color: #0f172a;">${matrix.stats.totalNonWorkingDays}</div>
            <div class="kpi-lbl">Días Inhábiles / Feriados</div>
        </div>
    </div>

    ${holidaysList ? `
    <div style="background: #fef3c7; border: 1px solid #f59e0b; padding: 8px 12px; border-radius: 6px; font-size: 10px; margin-bottom: 12px;">
        <strong style="color: #92400e;">Feriados y Jornadas Institucionales del Mes:</strong>
        <ul style="margin: 4px 0 0 16px; padding: 0; color: #78350f;">
            ${holidaysList}
        </ul>
    </div>
    ` : ''}

    <div style="font-size: 11px; font-weight: bold; margin-top: 10px; color: #1e293b;">Detalle Individual de Novedades y Licencias en el Mes:</div>
    <table>
        <thead>
            <tr>
                <th class="center" style="width: 80px;">Fecha</th>
                <th>Docente</th>
                <th class="center" style="width: 75px;">DNI</th>
                <th class="center" style="width: 130px;">Estado / Justificación</th>
                <th class="center" style="width: 50px;">Hs</th>
                <th>Observaciones / Diagnóstico</th>
            </tr>
        </thead>
        <tbody>
            ${leavesRows || '<tr><td colspan="6" style="text-align: center; padding: 15px; font-style: italic; color: #94a3b8;">No se registraron licencias ni inasistencias en este mes.</td></tr>'}
        </tbody>
    </table>

    <div class="footer">
        <div>SIGET • Sistema Integral de Gestión Educativa Terciaria</div>
        <div>Página Oficial de Archivo y Registro Académico</div>
    </div>
</body>
</html>
        `;

        let pdfBuffer;
        try {
            if (process.versions && process.versions.electron) {
                const { BrowserWindow } = require('electron');
                const win = new BrowserWindow({
                    show: false,
                    width: 1200,
                    height: 800,
                    webPreferences: { offscreen: true }
                });
                await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
                pdfBuffer = await win.webContents.printToPDF({
                    printBackground: true,
                    pageSize: 'A4',
                    margins: { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 }
                });
                win.close();
            } else {
                pdfBuffer = createCalendarFallbackPdf(
                    `CALENDARIO ACADEMICO - ${matrix.monthName} ${matrix.year}`,
                    allLeaves.map(l => `${l.date} | ${l.teacherName} | ${l.statusLabel} | ${l.observations}`)
                );
            }
            fs.writeFileSync(filePath, pdfBuffer);

            return {
                success: true,
                filePath,
                fileName,
                totalLeaves: allLeaves.length,
                message: `Calendario mensual exportado exitosamente a PDF: ${fileName}`
            };
        } catch (err) {
            console.error('[TeacherCalendarService] Error generando PDF:', err);
            const fallbackBuf = createCalendarFallbackPdf(
                `CALENDARIO ACADEMICO - ${matrix.monthName} ${matrix.year}`,
                allLeaves.map(l => `${l.date} | ${l.teacherName} | ${l.statusLabel} | ${l.observations}`)
            );
            fs.writeFileSync(filePath, fallbackBuf);
            return {
                success: true,
                filePath,
                fileName,
                totalLeaves: allLeaves.length,
                message: `Calendario mensual exportado a PDF: ${fileName}`
            };
        }
    }
}

function escapeCalXml(unsafe) {
    if (unsafe === null || unsafe === undefined) return '';
    return String(unsafe)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function createCalendarFallbackPdf(title, lines) {
    const safeTitle = (title || 'CALENDARIO ACADEMICO').replace(/[\(\)\\]/g, '');
    const cleanLines = (lines || []).slice(0, 35).map(l => String(l).substring(0, 95).replace(/[\(\)\\]/g, ''));
    
    let content = `BT /F1 14 Tf 40 790 Td (${safeTitle}) Tj ET\n`;
    cleanLines.forEach((line, idx) => {
        const y = 750 - (idx * 20);
        content += `BT /F1 8 Tf 40 ${y} Td (${line}) Tj ET\n`;
    });

    const stream = Buffer.from(content, 'utf8');
    const pdfData = `%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> /Contents 4 0 R >>\nendobj\n4 0 obj\n<< /Length ${stream.length} >>\nstream\n${content}endstream\nendobj\nxref\n0 5\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000300 00000 n \ntrailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${380 + stream.length}\n%%EOF`;
    return Buffer.from(pdfData, 'binary');
}

module.exports = { TeacherCalendarService };
