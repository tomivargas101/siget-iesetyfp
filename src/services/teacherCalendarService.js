const { getDatabase } = require('../database/db');
const { AttendanceService } = require('./attendanceService');
const { NormativeService } = require('./normativeService');

class TeacherCalendarService {
    static getTeacherTimeline({ teacherId, startDate = null, endDate = null }) {
        const db = getDatabase();
        const tid = Number(teacherId);

        if (!tid || isNaN(tid)) {
            return { success: false, message: 'ID de docente inválido.' };
        }

        try {
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

            const now = new Date();
            const currentYear = now.getFullYear();
            const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
            const defaultStart = `${currentYear}-${currentMonth}-01`;
            const lastDay = new Date(currentYear, now.getMonth() + 1, 0).getDate();
            const defaultEnd = `${currentYear}-${currentMonth}-${String(lastDay).padStart(2, '0')}`;

            const start = startDate || defaultStart;
            const end = endDate || defaultEnd;

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

            const yearStr = start.substring(0, 4);
            const allYearAttendances = db.prepare(`
                SELECT date, status, observations
                FROM attendances
                WHERE teacher_id = ? AND substr(date, 1, 4) = ? AND is_active = 1
                ORDER BY date ASC
            `).all(tid, yearStr);

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

    static getInstitutionalOverview({ startDate = null, endDate = null } = {}) {
        const db = getDatabase();
        try {
            const now = new Date();
            const start = startDate || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
            const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
            const end = endDate || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

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

    static getMonthMatrix({ year, month } = {}) {
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

            const teachers = db.prepare(`
                SELECT id, legajo, dni, first_name, last_name, revista,
                       (SELECT COALESCE(SUM(hours_count), 0) FROM designations WHERE teacher_id = teachers.id AND is_active = 1) as hours
                FROM teachers
                WHERE is_active = 1
                ORDER BY last_name, first_name
            `).all();

            const monthAttendances = db.prepare(`
                SELECT a.id, a.teacher_id, a.date, a.status, a.hours, a.observations,
                       t.first_name, t.last_name, t.dni, t.legajo
                FROM attendances a
                JOIN teachers t ON a.teacher_id = t.id
                WHERE a.date LIKE ? AND a.is_active = 1
                ORDER BY a.date ASC, t.last_name ASC
            `).all(`${prefix}%`);

            const monthSubs = db.prepare(`
                SELECT sub.id, sub.license_reason, sub.start_date, sub.end_date, sub.resolution_number,
                       s.name as subject_name,
                       tit.first_name as tit_first, tit.last_name as tit_last, tit.dni as tit_dni, tit.legajo as tit_legajo,
                       sup.first_name as sup_first, sup.last_name as sup_last, sup.dni as sup_dni, sup.legajo as sup_legajo
                FROM substitutions sub
                JOIN designations d ON sub.designation_id = d.id
                JOIN subjects s ON d.subject_id = s.id
                JOIN teachers tit ON sub.titular_teacher_id = tit.id
                JOIN teachers sup ON sub.suplente_teacher_id = sup.id
                WHERE (sub.start_date <= ? AND (sub.end_date >= ? OR sub.end_date IS NULL)) AND sub.is_active = 1
            `).all(`${prefix}-${String(daysInMonth).padStart(2, '0')}`, `${prefix}-01`);

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

            const days = [];
            const dayShortNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

            for (let d = 1; d <= daysInMonth; d++) {
                const dStr = `${prefix}-${String(d).padStart(2, '0')}`;
                const dt = new Date(y, m - 1, d, 12, 0, 0);
                const dayOfWeek = dt.getDay();
                const dayInfo = NormativeService.getCalendarDayInfo(dStr);

                const attsOnDay = dayEventsMap.get(d) || [];
                let prCount = 0;
                let iCount = 0;
                let pCount = 0;
                let licCount = 0;
                let ltCount = 0;
                const leaves = [];

                if (attsOnDay.length === 0 && !dayInfo.isNonWorking && dayOfWeek !== 0 && dayOfWeek !== 6) {
                    prCount = teachers.length || 8;
                }

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

                const activeSubsOnDay = monthSubs.filter(sub => {
                    return sub.start_date <= dStr && (!sub.end_date || sub.end_date >= dStr);
                }).map(sub => ({
                    id: sub.id,
                    subjectName: sub.subject_name,
                    reason: sub.license_reason,
                    resolution: sub.resolution_number,
                    startDate: sub.start_date,
                    endDate: sub.end_date || 'Abierta',
                    titularLastName: sub.tit_last,
                    titularFirstName: sub.tit_first,
                    titularName: `${sub.tit_last}, ${sub.tit_first}`,
                    titularDni: String(sub.tit_dni || ''),
                    titularLegajo: sub.tit_legajo || 'S/L',
                    suplenteLastName: sub.sup_last,
                    suplenteFirstName: sub.sup_first,
                    suplenteName: `${sub.sup_last}, ${sub.sup_first}`,
                    suplenteDni: String(sub.sup_dni || ''),
                    suplenteLegajo: sub.sup_legajo || 'S/L'
                }));

                const presentTeachers = [];
                const leaveTeacherIds = new Set(leaves.map(l => l.teacherId));

                const explicitPr = attsOnDay.filter(a => {
                    const c = AttendanceService.classifyRecord(a.status, a.observations);
                    return c.isPresence;
                });

                if (explicitPr.length > 0) {
                    explicitPr.forEach(a => {
                        presentTeachers.push({
                            teacherId: a.teacher_id,
                            fullName: `${a.last_name}, ${a.first_name}`,
                            lastName: a.last_name,
                            firstName: a.first_name,
                            dni: String(a.dni || ''),
                            legajo: a.legajo || 'S/L',
                            revista: a.revista || 'Titular',
                            hours: a.hours || 4,
                            status: 'PR'
                        });
                    });
                } else if (!dayInfo.isNonWorking && dayOfWeek !== 0 && dayOfWeek !== 6) {
                    teachers.forEach(t => {
                        if (!leaveTeacherIds.has(t.id)) {
                            presentTeachers.push({
                                teacherId: t.id,
                                fullName: `${t.last_name}, ${t.first_name}`,
                                lastName: t.last_name,
                                firstName: t.first_name,
                                dni: String(t.dni || ''),
                                legajo: t.legajo || 'S/L',
                                revista: t.revista || 'Titular',
                                hours: t.hours || 4,
                                status: 'PR'
                            });
                        }
                    });
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
                    leaves,
                    substitutions: activeSubsOnDay,
                    substitutionsCount: activeSubsOnDay.length,
                    presentTeachers,
                    presentTeachersCount: presentTeachers.length
                });
            }

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
                        observations: a.observations || ''
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

            const result = {
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

            return JSON.parse(JSON.stringify(result));
        } catch (error) {
            console.error('[TeacherCalendarService] Error generando month matrix:', error);
            return { success: false, message: error.message };
        }
    }

    static async exportMonthExcel({ year, month, outputDir = null, outputPath = null }) {
        const path = require('path');
        const fs = require('fs');
        const ExcelJS = require('exceljs');

        const matrix = this.getMonthMatrix({ year, month });
        if (!matrix.success) throw new Error(matrix.message);

        const outDir = outputDir || path.resolve(__dirname, '../../reportes');
        const defaultFileName = `Planilla_Mensual_Docentes_${matrix.year}_${matrix.monthStr}.xlsx`;
        const filePath = outputPath ? path.resolve(outputPath) : path.join(outDir, defaultFileName);
        const fileName = path.basename(filePath);
        const targetDir = path.dirname(filePath);
        if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'SIGET - Sistema Integral de Gestión Educativa Terciaria';
        workbook.created = new Date();

        const sheet = workbook.addWorksheet(`Asistencia ${matrix.monthName} ${matrix.year}`);
        sheet.views = [{ showGridLines: true }];

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

        const headers = ['Legajo', 'Docente (Apellido y Nombres)', 'DNI', 'Revista'];
        for (let d = 1; d <= matrix.daysInMonth; d++) {
            headers.push(String(d));
        }
        headers.push('PR', 'I', 'P', 'LIC', 'LT');

        sheet.getRow(4).values = headers;
        sheet.getRow(4).font = { name: 'Segoe UI', size: 9, bold: true };
        sheet.getRow(4).alignment = { horizontal: 'center', vertical: 'middle' };
        sheet.getRow(4).height = 24;

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

        let finalFilePath = filePath;
        let finalFileName = fileName;
        try {
            await workbook.xlsx.writeFile(filePath);
        } catch (writeErr) {
            if (writeErr.code === 'EBUSY') {
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                finalFileName = fileName.replace('.xlsx', `_${timestamp}.xlsx`);
                finalFilePath = path.join(outDir, finalFileName);
                await workbook.xlsx.writeFile(finalFilePath);
            } else {
                throw writeErr;
            }
        }

        return {
            success: true,
            filePath: finalFilePath,
            fileName: finalFileName,
            message: `Planilla mensual de asistencia guardada en Excel: ${finalFileName}`
        };
    }

    static async exportMonthPdf({ year, month, outputDir = null, outputPath = null, exportedBy = 'SECRETARÍA' }) {
        const path = require('path');
        const fs = require('fs');

        const matrix = this.getMonthMatrix({ year, month });
        if (!matrix.success) throw new Error(matrix.message);

        const outDir = outputDir || path.resolve(__dirname, '../../reportes');
        const defaultFileName = `Calendario_Academico_${matrix.year}_${matrix.monthStr}.pdf`;
        const filePath = outputPath ? path.resolve(outputPath) : path.join(outDir, defaultFileName);
        const fileName = path.basename(filePath);
        const targetDir = path.dirname(filePath);
        if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

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

    static async exportTeacherRecordExcel({ teacherId, startDate = null, endDate = null, outputDir = null, outputPath = null }) {
        const path = require('path');
        const fs = require('fs');
        const ExcelJS = require('exceljs');

        const timeline = this.getTeacherTimeline({ teacherId, startDate, endDate });
        if (!timeline || !timeline.success) {
            throw new Error(timeline?.message || 'Error al obtener datos del docente para exportación.');
        }

        const t = timeline.teacher;
        const period = timeline.period;
        const desigs = timeline.designations || [];
        const allSubs = [
            ...(timeline.substitutions?.asTitular || []),
            ...(timeline.substitutions?.asSuplente || [])
        ];
        const events = timeline.events || [];
        const m = timeline.annualMetrics || {};

        const outDir = outputDir || path.resolve(__dirname, '../../reportes');
        const safeLegajo = (t.legajo || t.dni || 'DOC').replace(/[^a-zA-Z0-9_-]/g, '_');
        const defaultFileName = `Ficha_Docente_${safeLegajo}_${period.startDate}_${period.endDate}.xlsx`;
        const filePath = outputPath ? path.resolve(outputPath) : path.join(outDir, defaultFileName);
        const fileName = path.basename(filePath);
        const targetDir = path.dirname(filePath);
        if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'SIGET - IESETYFP';
        workbook.created = new Date();

        const sheetName = `Ficha ${t.lastName}`.substring(0, 31);
        const sheet = workbook.addWorksheet(sheetName);
        sheet.views = [{ showGridLines: true }];

        sheet.mergeCells('A1:G1');
        const header1 = sheet.getCell('A1');
        header1.value = 'IESETYFP • INSTITUTO DE EDUCACIÓN SUPERIOR DE EDUCACIÓN TÉCNICA Y FORMACIÓN PROFESIONAL';
        header1.font = { name: 'Segoe UI', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
        header1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
        header1.alignment = { horizontal: 'center', vertical: 'middle' };
        sheet.getRow(1).height = 28;

        sheet.mergeCells('A2:G2');
        const header2 = sheet.getCell('A2');
        const nowStr = new Date().toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
        header2.value = `FICHA INSTITUCIONAL DE DOCENTE • CONTROL ESTATUTARIO Y CRONOGRAMA ACADÉMICO • EMISIÓN: ${nowStr}`;
        header2.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FF8A6F0E' } };
        header2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDF9E7' } };
        header2.alignment = { horizontal: 'center', vertical: 'middle' };
        sheet.getRow(2).height = 22;

        sheet.getRow(3).height = 8;

        sheet.getColumn(1).width = 16;
        sheet.getColumn(2).width = 30;
        sheet.getColumn(3).width = 16;
        sheet.getColumn(4).width = 24;
        sheet.getColumn(5).width = 16;
        sheet.getColumn(6).width = 24;
        sheet.getColumn(7).width = 34;

        let rowIdx = 4;

        const addSectionHeader = (title) => {
            sheet.mergeCells(`A${rowIdx}:G${rowIdx}`);
            const cell = sheet.getCell(`A${rowIdx}`);
            cell.value = title;
            cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
            cell.alignment = { horizontal: 'left', vertical: 'middle' };
            sheet.getRow(rowIdx).height = 24;
            rowIdx++;
        };

        addSectionHeader('I. DATOS DEL DOCENTE Y CARGA HORARIA');
        const rTeacher1 = sheet.getRow(rowIdx++);
        rTeacher1.values = ['Docente:', t.fullName, 'DNI:', t.dni, 'Legajo:', t.legajo || 'S/L', ''];
        rTeacher1.font = { name: 'Segoe UI', size: 9 };
        rTeacher1.getCell(1).font = { name: 'Segoe UI', size: 9, bold: true };
        rTeacher1.getCell(3).font = { name: 'Segoe UI', size: 9, bold: true };
        rTeacher1.getCell(5).font = { name: 'Segoe UI', size: 9, bold: true };

        const rTeacher2 = sheet.getRow(rowIdx++);
        rTeacher2.values = ['Revista:', t.revista || 'Titular', 'Carga Asignada:', `${t.activeHours} hs / ${t.maxWeeklyHours || 30} hs`, 'Disponibilidad:', t.availabilityStatus, ''];
        rTeacher2.font = { name: 'Segoe UI', size: 9 };
        rTeacher2.getCell(1).font = { name: 'Segoe UI', size: 9, bold: true };
        rTeacher2.getCell(3).font = { name: 'Segoe UI', size: 9, bold: true };
        rTeacher2.getCell(5).font = { name: 'Segoe UI', size: 9, bold: true };

        const rTeacher3 = sheet.getRow(rowIdx++);
        rTeacher3.values = ['Período Consultado:', `${period.startDate} al ${period.endDate}`, '', '', '', '', ''];
        rTeacher3.font = { name: 'Segoe UI', size: 9 };
        rTeacher3.getCell(1).font = { name: 'Segoe UI', size: 9, bold: true };

        rowIdx++;

        addSectionHeader(`II. SEGUIMIENTO ANUAL DE LÍMITES Y TOPES ESTATUTARIOS (CICLO ${m.cycleYear || new Date().getFullYear()})`);
        const rKpiH = sheet.getRow(rowIdx++);
        rKpiH.values = ['Inasistencias (I)', 'Permisos (Art. 115)', 'Licencias Médicas (Art. 114 a)', 'Largo Tratamiento', '', '', ''];
        rKpiH.font = { name: 'Segoe UI', size: 9, bold: true };
        rKpiH.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };

        const rKpiV = sheet.getRow(rowIdx++);
        rKpiV.values = [
            `${m.inasistencias?.count || 0} / 5 (Tope máx)`,
            `${m.permisos?.count || 0} / 6 (Tope máx)`,
            `${m.licenciasMedicas?.count || 0} / 25 días (Tope máx)`,
            `${m.largoTratamiento || 0} días`,
            '', '', ''
        ];
        rKpiV.font = { name: 'Segoe UI', size: 9, bold: true };

        rowIdx++;

        addSectionHeader('III. CÁTEDRAS, CARRERAS Y HORARIOS ASIGNADOS');
        const rDesigH = sheet.getRow(rowIdx++);
        rDesigH.values = ['Materia / Espacio Curricular', 'Código', 'Carrera', 'Día y Horario', 'Carga Horaria', 'Revista', 'Resolución'];
        rDesigH.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
        rDesigH.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF475569' } };

        if (desigs.length === 0) {
            const rEmpty = sheet.getRow(rowIdx++);
            rEmpty.values = ['No posee cátedras regulares asignadas actualmente.', '', '', '', '', '', ''];
            rEmpty.font = { name: 'Segoe UI', size: 9, italic: true };
        } else {
            desigs.forEach(d => {
                const rD = sheet.getRow(rowIdx++);
                rD.values = [
                    d.subject_name,
                    d.subject_code || '—',
                    d.career_name || '—',
                    `${d.day_of_week} ${d.start_time} - ${d.end_time}`,
                    `${d.hours_count} hs`,
                    d.revista || 'Titular',
                    d.resolution_number || 'S/R'
                ];
                rD.font = { name: 'Segoe UI', size: 9 };
            });
        }

        rowIdx++;

        addSectionHeader('IV. SUPLENCIAS EN CURSO (TITULAR / SUPLENTE)');
        const rSubH = sheet.getRow(rowIdx++);
        rSubH.values = ['Rol', 'Materia / Cátedra', 'Docente Asociado', 'DNI Asociado', 'Período', 'Motivo / Causa', 'Resolución'];
        rSubH.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
        rSubH.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF475569' } };

        if (allSubs.length === 0) {
            const rEmpty = sheet.getRow(rowIdx++);
            rEmpty.values = ['No registra suplencias vigentes ni antecedentes.', '', '', '', '', '', ''];
            rEmpty.font = { name: 'Segoe UI', size: 9, italic: true };
        } else {
            allSubs.forEach(s => {
                const rS = sheet.getRow(rowIdx++);
                rS.values = [
                    s.rol,
                    s.subjectName,
                    s.suplenteName ? `Suplente: ${s.suplenteName}` : `Titular: ${s.titularName}`,
                    s.suplenteDni || s.titularDni || '—',
                    `${s.startDate} al ${s.endDate}`,
                    s.reason || '—',
                    s.resolution || 'S/R'
                ];
                rS.font = { name: 'Segoe UI', size: 9 };
            });
        }

        rowIdx++;

        addSectionHeader(`V. CRONOGRAMA DE ASISTENCIAS Y NOVEDADES EN EL PERÍODO (${period.startDate} al ${period.endDate})`);
        const rEvH = sheet.getRow(rowIdx++);
        rEvH.values = ['Fecha', 'Estado / Marca', 'Horas', 'Cátedra / Espacio Curricular', 'Observaciones / Motivo', '', ''];
        rEvH.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
        rEvH.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF475569' } };

        if (events.length === 0) {
            const rEmpty = sheet.getRow(rowIdx++);
            rEmpty.values = ['No se registraron asistencias ni novedades en este período.', '', '', '', '', '', ''];
            rEmpty.font = { name: 'Segoe UI', size: 9, italic: true };
        } else {
            events.forEach(ev => {
                const rE = sheet.getRow(rowIdx++);
                rE.values = [
                    ev.date,
                    `${ev.eventType} (${ev.status})`,
                    `${ev.hours || 4} hs`,
                    ev.subjectName,
                    ev.observations || '—',
                    '', ''
                ];
                rE.font = { name: 'Segoe UI', size: 9 };
                rE.getCell(1).alignment = { horizontal: 'center' };
                rE.getCell(3).alignment = { horizontal: 'center' };
            });
        }

        rowIdx++;
        sheet.mergeCells(`A${rowIdx}:G${rowIdx}`);
        const footCell = sheet.getCell(`A${rowIdx}`);
        footCell.value = `SIGET • IESETYFP • REPORTE OFICIAL DE FICHA DOCENTE • EMISIÓN: ${nowStr} • CONTROL DE BEDELÍA Y SECRETARÍA`;
        footCell.font = { name: 'Segoe UI', size: 8, italic: true, color: { argb: 'FF64748B' } };
        footCell.alignment = { horizontal: 'center', vertical: 'middle' };
        sheet.getRow(rowIdx).height = 20;

        let finalFilePath = filePath;
        let finalFileName = fileName;
        try {
            await workbook.xlsx.writeFile(filePath);
        } catch (writeErr) {
            if (writeErr.code === 'EBUSY') {
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                finalFileName = fileName.replace('.xlsx', `_${timestamp}.xlsx`);
                finalFilePath = path.join(outDir, finalFileName);
                await workbook.xlsx.writeFile(finalFilePath);
            } else {
                throw writeErr;
            }
        }
        const buffer = await workbook.xlsx.writeBuffer();
        const base64 = buffer.toString('base64');

        return {
            success: true,
            fileName: finalFileName,
            filePath: finalFilePath,
            base64,
            message: `Ficha Docente Excel exportada exitosamente: ${finalFileName}`
        };
    }

    static async exportTeacherRecordPdf({ teacherId, startDate = null, endDate = null, outputDir = null, outputPath = null, exportedBy = 'SECRETARÍA' }) {
        const path = require('path');
        const fs = require('fs');

        const timeline = this.getTeacherTimeline({ teacherId, startDate, endDate });
        if (!timeline || !timeline.success) {
            throw new Error(timeline?.message || 'Error al obtener datos del docente.');
        }

        const t = timeline.teacher;
        const period = timeline.period;
        const desigs = timeline.designations || [];
        const allSubs = [
            ...(timeline.substitutions?.asTitular || []),
            ...(timeline.substitutions?.asSuplente || [])
        ];
        const events = timeline.events || [];
        const m = timeline.annualMetrics || {};

        const outDir = outputDir || path.resolve(__dirname, '../../reportes');
        const safeLegajo = (t.legajo || t.dni || 'DOC').replace(/[^a-zA-Z0-9_-]/g, '_');
        const defaultFileName = `Ficha_Docente_${safeLegajo}_${period.startDate}_${period.endDate}.pdf`;
        const filePath = outputPath ? path.resolve(outputPath) : path.join(outDir, defaultFileName);
        const fileName = path.basename(filePath);
        const targetDir = path.dirname(filePath);
        if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

        const desigsRows = desigs.map(d => `
            <tr>
                <td style="padding: 5px; font-weight: bold;">${escapeCalXml(d.subject_name)}</td>
                <td style="padding: 5px; text-align: center; font-family: monospace;">${escapeCalXml(d.subject_code || '—')}</td>
                <td style="padding: 5px;">${escapeCalXml(d.career_name || '—')}</td>
                <td style="padding: 5px; text-align: center;">${escapeCalXml(d.day_of_week)} ${escapeCalXml(d.start_time)}-${escapeCalXml(d.end_time)}</td>
                <td style="padding: 5px; text-align: center; font-weight: bold;">${d.hours_count} hs</td>
                <td style="padding: 5px; text-align: center;">${escapeCalXml(d.revista || 'Titular')}</td>
            </tr>
        `).join('') || '<tr><td colspan="6" style="padding: 8px; text-align: center; color: #64748b; font-style: italic;">No registra cátedras regulares asignadas actualmente.</td></tr>';

        const subsRows = allSubs.map(s => `
            <tr>
                <td style="padding: 5px; font-weight: bold; color: ${s.rol.includes('Titular') ? '#7c3aed' : '#2563eb'};">${escapeCalXml(s.rol)}</td>
                <td style="padding: 5px;">${escapeCalXml(s.subjectName)}</td>
                <td style="padding: 5px;">${escapeCalXml(s.suplenteName ? `Suplente: ${s.suplenteName}` : `Titular: ${s.titularName}`)}</td>
                <td style="padding: 5px; text-align: center;">${escapeCalXml(s.startDate)} al ${escapeCalXml(s.endDate)}</td>
                <td style="padding: 5px;">${escapeCalXml(s.reason || '—')}</td>
                <td style="padding: 5px; text-align: center; font-family: monospace;">${escapeCalXml(s.resolution || 'S/R')}</td>
            </tr>
        `).join('') || '<tr><td colspan="6" style="padding: 8px; text-align: center; color: #64748b; font-style: italic;">No registra suplencias vigentes ni antecedentes.</td></tr>';

        const eventsRows = events.map((ev, i) => `
            <tr style="background-color: ${i % 2 === 0 ? '#fff' : '#f8fafc'};">
                <td style="padding: 5px; text-align: center; font-family: monospace; font-weight: bold;">${escapeCalXml(ev.date)}</td>
                <td style="padding: 5px; text-align: center; font-weight: bold; color: ${ev.status === 'PR' ? '#059669' : ev.status === 'I' ? '#dc2626' : '#b45309'};">${escapeCalXml(ev.eventType)} (${escapeCalXml(ev.status)})</td>
                <td style="padding: 5px; text-align: center;">${ev.hours || 4} hs</td>
                <td style="padding: 5px;">${escapeCalXml(ev.subjectName)}</td>
                <td style="padding: 5px; color: #475569;">${escapeCalXml(ev.observations || '—')}</td>
            </tr>
        `).join('') || '<tr><td colspan="5" style="padding: 8px; text-align: center; color: #64748b; font-style: italic;">No se registraron novedades ni asistencias en este período.</td></tr>';

        const nowStr = new Date().toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });

        const html = `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>Ficha Docente Institucional - ${escapeCalXml(t.fullName)}</title>
    <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 24px; color: #0f172a; background: #fff; font-size: 10px; }
        .header { border-bottom: 2px solid #b45309; padding-bottom: 10px; margin-bottom: 12px; }
        .inst-title { font-size: 11px; font-weight: 800; color: #0f172a; text-transform: uppercase; }
        .doc-title { font-size: 16px; font-weight: 900; color: #b45309; margin: 3px 0; }
        .meta-grid { display: flex; justify-content: space-between; font-size: 10px; color: #334155; background: #f8fafc; padding: 6px 10px; border-radius: 6px; border: 1px solid #e2e8f0; }
        .kpi-boxes { display: flex; gap: 8px; margin: 10px 0; }
        .kpi-box { flex: 1; padding: 6px; border: 1px solid #cbd5e1; border-radius: 6px; text-align: center; }
        .kpi-val { font-size: 14px; font-weight: bold; }
        .kpi-lbl { font-size: 8.5px; text-transform: uppercase; color: #64748b; font-weight: bold; }
        .section-title { font-size: 10.5px; font-weight: bold; text-transform: uppercase; margin-top: 12px; margin-bottom: 4px; color: #1e293b; border-bottom: 1px solid #cbd5e1; padding-bottom: 2px; }
        table { width: 100%; border-collapse: collapse; margin-top: 4px; font-size: 9.5px; }
        th { background: #1e293b; color: #fff; font-size: 9px; font-weight: 700; text-transform: uppercase; padding: 5px; text-align: left; }
        th.center { text-align: center; }
        td { border-bottom: 1px solid #e2e8f0; }
        .footer { margin-top: 16px; padding-top: 8px; border-top: 1px solid #cbd5e1; font-size: 8.5px; color: #64748b; display: flex; justify-content: space-between; }
    </style>
</head>
<body>
    <div class="header">
        <div class="inst-title">Instituto de Educación Superior de Educación Técnica y Formación Profesional (IESETYFP)</div>
        <div class="doc-title">FICHA OFICIAL DE DOCENTE • CRONOGRAMA Y CONTROL ESTATUTARIO</div>
        <div class="meta-grid">
            <div><strong>Docente:</strong> ${escapeCalXml(t.fullName)} (Leg. ${escapeCalXml(t.legajo || 'S/L')} • DNI ${escapeCalXml(t.dni)})</div>
            <div><strong>Revista:</strong> ${escapeCalXml(t.revista || 'Titular')} • <strong>Carga:</strong> ${t.activeHours} / ${t.maxWeeklyHours || 30} hs</div>
            <div><strong>Período:</strong> ${period.startDate} al ${period.endDate} • <strong>Emisión:</strong> ${nowStr}</div>
        </div>
    </div>

    <div class="kpi-boxes">
        <div class="kpi-box">
            <div class="kpi-val" style="color: ${m.inasistencias?.count >= 5 ? '#dc2626' : '#d97706'};">${m.inasistencias?.count || 0} / 5</div>
            <div class="kpi-lbl">Inasistencias (I)</div>
        </div>
        <div class="kpi-box">
            <div class="kpi-val" style="color: ${m.permisos?.count >= 6 ? '#dc2626' : '#2563eb'};">${m.permisos?.count || 0} / 6</div>
            <div class="kpi-lbl">Permisos (115)</div>
        </div>
        <div class="kpi-box">
            <div class="kpi-val" style="color: ${m.licenciasMedicas?.count >= 25 ? '#dc2626' : '#7c3aed'};">${m.licenciasMedicas?.count || 0} / 25</div>
            <div class="kpi-lbl">Lic. Médicas (114 a)</div>
        </div>
        <div class="kpi-box">
            <div class="kpi-val" style="color: #4f46e5;">${m.largoTratamiento || 0} ds</div>
            <div class="kpi-lbl">Largo Tratamiento</div>
        </div>
        <div class="kpi-box">
            <div class="kpi-val" style="color: #059669;">${t.availabilityStatus}</div>
            <div class="kpi-lbl">Estado Disponibilidad</div>
        </div>
    </div>

    <div class="section-title">1. Cátedras y Horarios Asignados</div>
    <table>
        <thead>
            <tr>
                <th>Materia / Espacio Curricular</th>
                <th class="center" style="width: 70px;">Código</th>
                <th>Carrera</th>
                <th class="center" style="width: 140px;">Día y Horario</th>
                <th class="center" style="width: 60px;">Carga</th>
                <th class="center" style="width: 70px;">Revista</th>
            </tr>
        </thead>
        <tbody>
            ${desigsRows}
        </tbody>
    </table>

    <div class="section-title">2. Suplencias en Curso (Titular / Suplente)</div>
    <table>
        <thead>
            <tr>
                <th style="width: 90px;">Rol</th>
                <th>Materia / Cátedra</th>
                <th>Docente Relacionado</th>
                <th class="center" style="width: 130px;">Período</th>
                <th>Motivo</th>
                <th class="center" style="width: 80px;">Resolución</th>
            </tr>
        </thead>
        <tbody>
            ${subsRows}
        </tbody>
    </table>

    <div class="section-title">3. Línea de Tiempo de Novedades y Asistencias en el Período (${period.startDate} al ${period.endDate})</div>
    <table>
        <thead>
            <tr>
                <th class="center" style="width: 75px;">Fecha</th>
                <th class="center" style="width: 120px;">Estado / Marca</th>
                <th class="center" style="width: 50px;">Horas</th>
                <th>Cátedra / Espacio</th>
                <th>Observaciones / Diagnóstico</th>
            </tr>
        </thead>
        <tbody>
            ${eventsRows}
        </tbody>
    </table>

    <div class="footer">
        <div>SIGET • Sistema Integral de Gestión Educativa Terciaria • IESETYFP</div>
        <div>Generado por: ${escapeCalXml(exportedBy)} • Página Oficial de Archivo y Registro Académico</div>
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
                    `FICHA DOCENTE - ${t.fullName}`,
                    events.map(ev => `${ev.date} | ${ev.eventType} (${ev.status}) | ${ev.hours}hs | ${ev.subjectName} | ${ev.observations}`)
                );
            }
            let finalFilePath = filePath;
            let finalFileName = fileName;
            try {
                fs.writeFileSync(filePath, pdfBuffer);
            } catch (wErr) {
                if (wErr.code === 'EBUSY') {
                    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                    finalFileName = fileName.replace('.pdf', `_${timestamp}.pdf`);
                    finalFilePath = path.join(outDir, finalFileName);
                    fs.writeFileSync(finalFilePath, pdfBuffer);
                } else {
                    throw wErr;
                }
            }

            return {
                success: true,
                filePath: finalFilePath,
                fileName: finalFileName,
                base64: pdfBuffer.toString('base64'),
                message: `Ficha Docente exportada exitosamente a PDF: ${finalFileName}`
            };
        } catch (err) {
            console.error('[TeacherCalendarService] Error generando PDF Ficha Docente:', err);
            const fallbackBuf = createCalendarFallbackPdf(
                `FICHA DOCENTE - ${t.fullName}`,
                events.map(ev => `${ev.date} | ${ev.eventType} (${ev.status}) | ${ev.hours}hs | ${ev.subjectName} | ${ev.observations}`)
            );
            let finalFilePath = filePath;
            let finalFileName = fileName;
            try {
                fs.writeFileSync(filePath, fallbackBuf);
            } catch (wErr) {
                if (wErr.code === 'EBUSY') {
                    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                    finalFileName = fileName.replace('.pdf', `_${timestamp}.pdf`);
                    finalFilePath = path.join(outDir, finalFileName);
                    fs.writeFileSync(finalFilePath, fallbackBuf);
                } else {
                    throw wErr;
                }
            }
            return {
                success: true,
                filePath: finalFilePath,
                fileName: finalFileName,
                base64: fallbackBuf.toString('base64'),
                message: `Ficha Docente exportada a PDF: ${finalFileName}`
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
