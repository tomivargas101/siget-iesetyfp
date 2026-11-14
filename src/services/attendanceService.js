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
     * Clasifica un registro de asistencia (estado y observaciones) distinguiendo estrictamente
     * entre Inasistencia Injustificada ('I'), Inasistencia Justificada ('P' / 'IJ'),
     * Permisos Particulares ('P' / Art. 115), Licencias Médicas/Ordinarias ('LIC')
     * y Largo Tratamiento de Salud ('LT').
     *
     * EXCLUSIÓN CRÍTICA DE TOPES: Las faltas justificadas formalmente (con aviso previo,
     * certificados médicos o formularios oficiales) NUNCA computan para el límite de 5 inasistencias.
     */
    static classifyRecord(recordOrStatus, maybeObs = '') {
        let status = '';
        let obs = '';
        if (typeof recordOrStatus === 'object' && recordOrStatus !== null) {
            status = recordOrStatus.status || '';
            obs = recordOrStatus.observations || '';
        } else {
            status = recordOrStatus || '';
            obs = maybeObs || '';
        }

        const s = String(status).trim().toUpperCase();
        const o = String(obs).trim().toLowerCase();
        const combined = `${s} ${o}`.toLowerCase();

        // 1. Presente (PR)
        if (s === 'PR' || s === 'PRESENTE') {
            return {
                code: 'PR',
                isPresence: true,
                isUnexcusedAbsence: false,
                isJustifiedAbsence: false,
                isPermit: false,
                isLicense: false,
                isLongTreatment: false
            };
        }

        // 2. Largo Tratamiento de Salud (Art. 48 / 114 b)
        if (s === 'LT' || combined.includes('largo tratamiento') || combined.includes('art. 48') || combined.includes('art 48') || combined.includes('114b') || combined.includes('114 b')) {
            return {
                code: 'LT',
                isPresence: false,
                isUnexcusedAbsence: false,
                isJustifiedAbsence: true,
                isPermit: false,
                isLicense: true,
                isLongTreatment: true
            };
        }

        // 3. Licencias Médicas u Ordinarias (Art. 114 a, 70, reposo, estudio, etc.)
        if (s === 'LIC' || s === 'LICENCIA' ||
            combined.includes('licencia') || combined.includes('médic') || combined.includes('medic') ||
            combined.includes('salud') || combined.includes('reposo') || combined.includes('114a') ||
            combined.includes('114 a') || combined.includes('114c') || combined.includes('114 c') ||
            combined.includes('art. 70') || combined.includes('art 70') || combined.includes('examen') ||
            combined.includes('estudio') || combined.includes('maternidad') || combined.includes('accidente')) {
            return {
                code: 'LIC',
                isPresence: false,
                isUnexcusedAbsence: false,
                isJustifiedAbsence: true,
                isPermit: false,
                isLicense: true,
                isLongTreatment: false
            };
        }

        // 4. Permisos Particulares (Art. 115) o Inasistencias Justificadas / Con Aviso / Certificado
        const isArt115 = s === 'P' || combined.includes('permiso') || combined.includes('115') || combined.includes('razones particulares');
        const isJustifiedOrNotice = combined.includes('justificad') ||
                                    combined.includes('con aviso') ||
                                    combined.includes('c/aviso') ||
                                    combined.includes('formulario') ||
                                    combined.includes('form:') ||
                                    combined.includes('certificado') ||
                                    s === 'IJ' || s === 'JUST';

        if (isArt115) {
            return {
                code: 'P',
                isPresence: false,
                isUnexcusedAbsence: false,
                isJustifiedAbsence: true,
                isPermit: true,
                isLicense: false,
                isLongTreatment: false
            };
        }

        if (isJustifiedOrNotice) {
            return {
                code: 'P',
                isPresence: false,
                isUnexcusedAbsence: false, // ¡EXCLUIDO del tope de inasistencias injustificadas!
                isJustifiedAbsence: true,
                isPermit: false,
                isLicense: false,
                isLongTreatment: false
            };
        }

        // 5. Inasistencia Injustificada ('I')
        // Cualquier 'I', 'AUSENTE', 'FALTA', 'INASISTENCIA' sin justificación
        return {
            code: 'I',
            isPresence: false,
            isUnexcusedAbsence: true, // Computa estrictamente para el tope de 5 inasistencias
            isJustifiedAbsence: false,
            isPermit: false,
            isLicense: false,
            isLongTreatment: false
        };
    }

    /**
     * Normaliza cualquier estado histórico o texto libre al conjunto cerrado v2.0:
     * 'PR', 'I', 'P', 'LIC', 'LT'
     */
    static normalizeStatusCode(status, observations = '') {
        return this.classifyRecord(status, observations).code;
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

            // Obtener asistencias del año lectivo para el seguimiento de topes y contadores anuales (RN-04 / RN-05)
            const yearStr = dateStr ? dateStr.substring(0, 4) : new Date().getFullYear().toString();
            const yearAttendances = db.prepare(`
                SELECT teacher_id, date, status, observations
                FROM attendances
                WHERE substr(date, 1, 4) = ? AND is_active = 1
                ORDER BY date ASC, id DESC
            `).all(yearStr);

            const seenTeacherDate = new Set();
            const yearStatsMap = new Map();
            for (const ya of yearAttendances) {
                const key = `${ya.teacher_id}_${ya.date}`;
                if (seenTeacherDate.has(key)) continue;
                seenTeacherDate.add(key);

                if (!yearStatsMap.has(ya.teacher_id)) {
                    yearStatsMap.set(ya.teacher_id, {
                        inasistencias: 0,
                        justificadas: 0,
                        permisos: 0,
                        licencias: 0,
                        largoTratamiento: 0
                    });
                }
                const stat = yearStatsMap.get(ya.teacher_id);
                const c = this.classifyRecord(ya.status, ya.observations);

                if (c.isUnexcusedAbsence) {
                    stat.inasistencias++;
                } else if (c.isPermit) {
                    stat.permisos++;
                } else if (c.isLongTreatment) {
                    stat.largoTratamiento++;
                } else if (c.isLicense) {
                    stat.licencias++;
                } else if (c.isJustifiedAbsence) {
                    stat.justificadas++;
                }
            }

            return teachers.map(t => {
                const att = attMap.get(t.id);
                const isSavedInDb = Boolean(att);
                const classification = att
                    ? this.classifyRecord(att.status, att.observations)
                    : { code: 'I', isPresence: false, isUnexcusedAbsence: false, isJustifiedAbsence: false, isPermit: false, isLicense: false, isLongTreatment: false };
                
                const savedStatus = att ? classification.code : null;
                // Si ya fue registrado en BD usamos su código; si no, estado por defecto 'I' (Inasistencia)
                const currentStatus = att ? classification.code : 'I';

                const yStat = yearStatsMap.get(t.id) || {
                    inasistencias: 0,
                    justificadas: 0,
                    permisos: 0,
                    licencias: 0,
                    largoTratamiento: 0
                };

                let alertLevel = null;
                let alertBadge = null;
                let alertDetail = null;

                if (yStat.inasistencias >= 5) {
                    alertLevel = 'danger';
                    alertBadge = 'Límite Crítico Inasistencias';
                    alertDetail = `Acumula ${yStat.inasistencias} inasistencias en el ciclo lectivo.`;
                } else if (yStat.inasistencias >= 3) {
                    alertLevel = 'warning';
                    alertBadge = `${yStat.inasistencias}/5 Inasistencias`;
                    alertDetail = `Acumula ${yStat.inasistencias} inasistencias sin justificar.`;
                }

                if (yStat.permisos >= 6) {
                    alertLevel = 'danger';
                    alertBadge = 'Cupo Art. 115 Agotado';
                    alertDetail = 'Agotó los 6 permisos particulares anuales (6/6).';
                } else if (yStat.permisos >= 4 && !alertBadge) {
                    alertLevel = 'warning';
                    alertBadge = `${yStat.permisos}/6 Permisos (115)`;
                    alertDetail = `Consumió ${yStat.permisos} de 6 permisos anuales permitidos.`;
                }

                return {
                    teacherId: t.id,
                    attendanceId: att ? att.id : null,
                    isSavedInDb,
                    savedStatus,
                    isSavedUnexcused: att ? classification.isUnexcusedAbsence : false,
                    isSavedJustified: att ? classification.isJustifiedAbsence : false,
                    isSavedPermit: att ? classification.isPermit : false,
                    isSavedLicense: att ? classification.isLicense : false,
                    isSavedLongTreatment: att ? classification.isLongTreatment : false,
                    legajo: t.legajo,
                    dni: String(t.dni),
                    fullName: `${t.last_name}, ${t.first_name}`,
                    revista: t.revista,
                    hours: att ? (att.hours || t.hours) : t.hours,
                    status: currentStatus,
                    rawStatus: att ? att.status : 'I',
                    observations: att ? (att.observations || '') : '',
                    registeredBy: att ? (att.registered_by || '') : '',
                    hasPhysicalForm: Boolean(att && att.observations && (att.observations.includes('Form:') || att.observations.includes('Formulario') || att.observations.includes('Certificado'))),
                    annualStats: {
                        year: yearStr,
                        inasistencias: yStat.inasistencias,
                        justificadas: yStat.justificadas,
                        permisos: yStat.permisos,
                        permisosDisponibles: Math.max(0, 6 - yStat.permisos),
                        licencias: yStat.licencias,
                        largoTratamiento: yStat.largoTratamiento,
                        alertLevel,
                        alertBadge,
                        alertDetail
                    }
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

            // Sanitización y anulación de licencias: si el estado pasa a Presente (PR) o Inasistencia injustificada (I),
            // se anulan y limpian automáticamente las justificaciones o notas de formulario físico previas.
            let cleanObs = observations ? observations.trim() : null;
            if (normalizedStatus === 'PR') {
                cleanObs = null;
            } else if (normalizedStatus === 'I' && cleanObs && (cleanObs.includes('[Formulario Físico') || cleanObs.toLowerCase().includes('licencia') || cleanObs.toLowerCase().includes('certificado') || cleanObs.toLowerCase().includes('reposo'))) {
                cleanObs = null;
            }

            // Verificar si ya existen registros para esa fecha y docente
            const existing = db.prepare('SELECT id FROM attendances WHERE teacher_id = ? AND date = ?').all(teacherId, dateStr);

            if (existing && existing.length > 0) {
                const primaryId = existing[0].id;
                // Si hubiera duplicados huérfanos del mismo día, eliminarlos
                if (existing.length > 1) {
                    db.prepare('DELETE FROM attendances WHERE teacher_id = ? AND date = ? AND id != ?').run(teacherId, dateStr, primaryId);
                }
                db.prepare(`
                    UPDATE attendances SET
                        status = ?, hours = ?, observations = ?,
                        registered_by = ?, is_active = 1
                    WHERE id = ?
                `).run(
                    normalizedStatus,
                    hours !== null ? Number(hours) : null,
                    cleanObs,
                    username,
                    primaryId
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
                    cleanObs,
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
            try { db.exec('ROLLBACK'); } catch {}
            console.error('[AttendanceService] Error guardando lote:', error);
            return { success: false, message: `Error guardando lote: ${error.message}` };
        }
    }

    static getSummary(dateStr) {
        const db = getDatabase();
        try {
            const totalTeachers = db.prepare('SELECT COUNT(*) as count FROM teachers WHERE is_active = 1').get().count;
            const records = db.prepare('SELECT status, observations FROM attendances WHERE date = ? AND is_active = 1').all(dateStr);

            let presentes = 0;
            let inasistencias = 0;
            let permisos = 0;
            let licencias = 0;

            for (const r of records) {
                const c = this.classifyRecord(r.status, r.observations);
                if (c.isPresence) presentes++;
                else if (c.isUnexcusedAbsence) inasistencias++;
                else if (c.isPermit) permisos++;
                else if (c.isLicense || c.isLongTreatment) licencias++;
                else if (c.isJustifiedAbsence) permisos++;
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
