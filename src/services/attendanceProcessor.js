/**
 * Procesador de Novedades de Asistencia para Cuadros Mensuales (IL-01 e IL-02)
 * Basado en el Documento de Requerimientos Institucionales Versión 2.0 (RN-01 a RN-08):
 * - RN-01: DNI como texto unívoco y datos comunes almacenados una sola vez.
 * - RN-02: Múltiples designaciones con desglose independiente por materia/cargo.
 * - RN-03: Conservación del historial completo ante bajas lógicas.
 * - RN-04: Cuadro IL-01 (Licencias Médicas / Salud - Hojas 1-2).
 * - RN-05: Cuadro IL-02 (Inasistencias, Permisos y Licencias Especiales - Hojas 3-6).
 * - RN-06: Inasistencias de 1 día exacto sin agrupación.
 * - RN-07: Código oficial de oficina 1452.
 * - RN-08: Año calendario actual.
 * - Gestión de Disposiciones Internas: número correlativo mensual compartido por todas
 *   las materias afectadas a un docente en una misma jornada o período de licencia.
 */

const { getDatabase } = require('../database/db');
const { NormativeService } = require('./normativeService');

const SPANISH_DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

function normalizeDayName(dName) {
    if (!dName) return '';
    return dName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

class AttendanceProcessor {
    /**
     * Procesa todas las asistencias de un mes/año y genera los registros desglosados para IL-01 e IL-02.
     */
    static processMonthlyRecords(year, month) {
        const db = getDatabase();
        const yStr = String(year);
        const mStr = String(month).padStart(2, '0');
        const prefix = `${yStr}-${mStr}`;

        // Obtener todas las novedades del mes
        // Excluimos estados de presencia efectiva o sin registrar ('PR', 'Presente', 'Sin Registrar')
        const sql = `
            SELECT 
                a.id, a.teacher_id, a.date, a.status, a.hours, a.observations,
                t.dni, t.last_name, t.first_name, t.revista,
                d.cargo, d.revista as desig_revista,
                s.name as subject_name
            FROM attendances a
            JOIN teachers t ON a.teacher_id = t.id
            LEFT JOIN designations d ON a.designation_id = d.id
            LEFT JOIN subjects s ON d.subject_id = s.id
            WHERE a.date LIKE ? 
              AND a.status NOT IN ('PR', 'Presente', 'Sin Registrar', 'sin registrar')
              AND a.is_active = 1
            ORDER BY t.last_name, t.first_name, a.teacher_id, a.date ASC
        `;

        const rows = db.prepare(sql).all(`${prefix}%`);
        
        // Agrupar por docente
        const teacherGroups = new Map();
        for (const r of rows) {
            if (!teacherGroups.has(r.teacher_id)) {
                teacherGroups.set(r.teacher_id, []);
            }
            teacherGroups.get(r.teacher_id).push(r);
        }

        const listIL01 = [];
        const listIL02 = [];

        // Contador de Disposiciones Internas correlativas por mes
        const context = {
            disposicionCounter: 1,
            year: Number(year) || NormativeService.getCurrentYear(),
            month: Number(month),
            db
        };

        for (const [teacherId, records] of teacherGroups.entries()) {
            this._processTeacherRecords(records, listIL01, listIL02, context);
        }

        return {
            il01: listIL01,
            il02: listIL02,
            // Compatibilidad hacia atrás con nomenclaturas anteriores (DL-01 / DL-02)
            dl01: listIL01,
            dl02: listIL02,
            stats: {
                totalNovedades: rows.length,
                totalIL01: listIL01.length,
                totalIL02: listIL02.length,
                totalDL01: listIL01.length,
                totalDL02: listIL02.length
            }
        };
    }

    static _processTeacherRecords(records, listIL01, listIL02, context) {
        let currentGroup = null;

        for (let i = 0; i < records.length; i++) {
            const rec = records[i];
            const classification = NormativeService.classifyNovelty(rec.status, rec.observations);
            const recDate = new Date(rec.date + 'T00:00:00');

            if (!currentGroup) {
                currentGroup = {
                    teacherId: rec.teacher_id,
                    records: [rec],
                    classification,
                    startDate: recDate,
                    endDate: recDate,
                    reason: rec.observations || rec.status
                };
            } else {
                const prevDate = currentGroup.endDate;
                const diffDays = Math.round((recDate - prevDate) / (1000 * 60 * 60 * 24));
                const sameReason = (rec.observations || rec.status) === currentGroup.reason;
                const sameTarget = classification.targetCuadro === currentGroup.classification.targetCuadro;

                // Agrupación de días continuos según RN-04 / RN-05 (puente de fin de semana diffDays <= 3)
                // y RN-06: Inasistencia 'I' nunca agrupa días continuos (1 solo día por renglón)
                if (classification.canGroupConsecutiveDays && sameReason && sameTarget && diffDays <= 3) {
                    currentGroup.records.push(rec);
                    currentGroup.endDate = recDate;
                } else {
                    this._pushGroupWithBreakdown(currentGroup, listIL01, listIL02, context);
                    currentGroup = {
                        teacherId: rec.teacher_id,
                        records: [rec],
                        classification,
                        startDate: recDate,
                        endDate: recDate,
                        reason: rec.observations || rec.status
                    };
                }
            }
        }

        if (currentGroup) {
            this._pushGroupWithBreakdown(currentGroup, listIL01, listIL02, context);
        }
    }

    /**
     * Desglosa cada novedad en renglones independientes por cada materia o cargo afectado que tuviera
     * el docente ese día o período, calculando las horas cátedra y compartiendo un único número de
     * Disposición interna correlativa por mes.
     */
    static _pushGroupWithBreakdown(group, listIL01, listIL02, context) {
        const first = group.records[0];
        const daysCount = Math.round((group.endDate - group.startDate) / (1000 * 60 * 60 * 24)) + 1;

        // Disposición interna correlativa por mes compartida para todas las materias de esta jornada/período
        const dispNum = String(context.disposicionCounter++).padStart(3, '0');
        const disposicionStr = `Disp. N° ${dispNum}/${context.year}`;

        const formatDateISO = (d) => {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
        };

        const fechaDesde = NormativeService.formatDate(formatDateISO(group.startDate));
        const fechaHasta = NormativeService.formatDate(formatDateISO(group.endDate));

        // Obtener las designaciones del docente desde la base de datos
        const teacherDesigs = context.db.prepare(`
            SELECT d.id, d.cargo, d.revista, d.day_of_week, d.hours_count,
                   s.name as subject_name, c.name as career_name
            FROM designations d
            LEFT JOIN subjects s ON d.subject_id = s.id
            LEFT JOIN careers c ON s.career_id = c.id
            WHERE d.teacher_id = ? AND d.is_active = 1
        `).all(group.teacherId);

        // Recolectar días de la semana abarcados por las fechas del grupo
        const daysInGroup = new Set();
        for (const r of group.records) {
            const dObj = new Date(r.date + 'T00:00:00');
            const dayName = SPANISH_DAYS[dObj.getDay()];
            daysInGroup.add(normalizeDayName(dayName));
        }

        // Filtrar designaciones que coincidan con los días afectados
        const affectedDesigs = teacherDesigs.filter(d => {
            if (!d.day_of_week) return false;
            return daysInGroup.has(normalizeDayName(d.day_of_week));
        });

        // Motivo y Código formal
        const articleDetails = NormativeService.getArticleDetails(group.reason || first.status);
        const codigoLicencia = articleDetails ? articleDetails.code : (group.classification.code || 'ART-114');
        const motivoFormal = articleDetails ? `${articleDetails.article} - ${articleDetails.name}` : (group.reason || first.status);

        // Si se encontraron designaciones específicas para los días afectados:
        if (affectedDesigs.length > 0) {
            // Agrupar por materia o id de designación para evitar duplicados si abarca varias semanas
            const desigMap = new Map();
            for (const d of affectedDesigs) {
                const key = `${d.subject_name || d.cargo}_${d.revista || 'TIT'}`;
                if (!desigMap.has(key)) {
                    desigMap.set(key, {
                        materia: d.subject_name || d.cargo || 'Cátedra Terciaria',
                        cargo: d.cargo || 'Profesor de Cátedra',
                        revista: d.revista || first.desig_revista || first.revista || 'Titular',
                        hours: d.hours_count || 4,
                        multiplier: 1
                    });
                } else {
                    const existing = desigMap.get(key);
                    existing.multiplier += 1;
                    existing.hours += (d.hours_count || 0);
                }
            }

            for (const item of desigMap.values()) {
                const row = {
                    oficina: NormativeService.getInstitutionalOffice(), // 1452
                    año: context.year,
                    disposicion: disposicionStr,
                    dni: NormativeService.normalizeDni(first.dni),
                    apellidoNombre: `${first.last_name}, ${first.first_name}`,
                    cargo: `${item.materia} (${item.cargo})`,
                    revista: item.revista,
                    codigo: codigoLicencia,
                    motivo: motivoFormal,
                    desde: fechaDesde,
                    hasta: fechaHasta,
                    dias: daysCount,
                    horas: item.hours,
                    observaciones: first.observations || first.status
                };

                if (group.classification.targetCuadro === 'IL-01' || group.classification.targetCuadro === 'DL-01') {
                    listIL01.push(row);
                } else {
                    listIL02.push(row);
                }
            }
        } else {
            // Fallback: Si no tiene designaciones con día de semana o no coinciden,
            // verificar si tiene designaciones activas en general
            if (teacherDesigs.length > 0) {
                for (const d of teacherDesigs) {
                    const row = {
                        oficina: NormativeService.getInstitutionalOffice(),
                        año: context.year,
                        disposicion: disposicionStr,
                        dni: NormativeService.normalizeDni(first.dni),
                        apellidoNombre: `${first.last_name}, ${first.first_name}`,
                        cargo: `${d.subject_name || d.cargo || 'Cátedra'} (${d.cargo || 'Profesor'})`,
                        revista: d.revista || first.desig_revista || first.revista || 'Titular',
                        codigo: codigoLicencia,
                        motivo: motivoFormal,
                        desde: fechaDesde,
                        hasta: fechaHasta,
                        dias: daysCount,
                        horas: d.hours_count || 4,
                        observaciones: first.observations || first.status
                    };

                    if (group.classification.targetCuadro === 'IL-01' || group.classification.targetCuadro === 'DL-01') {
                        listIL01.push(row);
                    } else {
                        listIL02.push(row);
                    }
                }
            } else {
                // Si el docente no tiene designaciones cargadas aún, generar renglón único de planta
                const totalHs = group.records.reduce((sum, r) => sum + (r.hours || 0), 0) || 4;
                const row = {
                    oficina: NormativeService.getInstitutionalOffice(),
                    año: context.year,
                    disposicion: disposicionStr,
                    dni: NormativeService.normalizeDni(first.dni),
                    apellidoNombre: `${first.last_name}, ${first.first_name}`,
                    cargo: first.cargo || 'Horas Cátedra Terciarias',
                    revista: first.desig_revista || first.revista || 'Titular',
                    codigo: codigoLicencia,
                    motivo: motivoFormal,
                    desde: fechaDesde,
                    hasta: fechaHasta,
                    dias: daysCount,
                    horas: totalHs,
                    observaciones: first.observations || first.status
                };

                if (group.classification.targetCuadro === 'IL-01' || group.classification.targetCuadro === 'DL-01') {
                    listIL01.push(row);
                } else {
                    listIL02.push(row);
                }
            }
        }
    }
}

module.exports = { AttendanceProcessor };
