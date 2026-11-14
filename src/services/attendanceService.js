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

    /**
     * Extrae y precarga automáticamente la información relevante de archivos de justificación
     * (.pdf, .docx, .doc, .txt, .csv) para agilizar la carga administrativa en el modal institucional.
     */
    static parseJustificationFile({ fileBuffer, fileName = '' }) {
        if (!fileBuffer || fileBuffer.length === 0) {
            return { success: false, message: 'El archivo está vacío o no contiene datos válidos.' };
        }

        const ext = (fileName.split('.').pop() || '').toLowerCase();
        let extractedText = '';

        try {
            if (ext === 'docx') {
                const zlib = require('zlib');
                let offset = 0;
                while (offset < fileBuffer.length - 30) {
                    if (fileBuffer.readUInt32LE(offset) === 0x04034b50) {
                        const compMethod = fileBuffer.readUInt16LE(offset + 8);
                        const compSize = fileBuffer.readUInt32LE(offset + 18);
                        const nameLen = fileBuffer.readUInt16LE(offset + 26);
                        const extraLen = fileBuffer.readUInt16LE(offset + 28);
                        const entryName = fileBuffer.toString('utf8', offset + 30, offset + 30 + nameLen);
                        const dataStart = offset + 30 + nameLen + extraLen;

                        if (entryName === 'word/document.xml') {
                            const compData = fileBuffer.subarray(dataStart, dataStart + compSize);
                            const xml = compMethod === 8 ? zlib.inflateRawSync(compData).toString('utf8') : compData.toString('utf8');
                            extractedText = xml.replace(/<[^>]+>/g, ' ');
                            break;
                        }
                        offset = dataStart + compSize;
                    } else {
                        offset++;
                    }
                }
            } else if (ext === 'doc') {
                const raw = fileBuffer.toString('binary');
                extractedText = raw.replace(/[^\x20-\x7E\t\r\n\xC0-\xFF]/g, ' ');
            } else if (ext === 'pdf') {
                const zlib = require('zlib');
                const str = fileBuffer.toString('binary');
                let pdfTexts = [];
                const directMatches = str.match(/\(([^()]{2,100})\)\s*(?:Tj|'|")/g) || [];
                for (const m of directMatches) {
                    const clean = m.replace(/^\(/, '').replace(/\)\s*(?:Tj|'|")$/, '').trim();
                    if (clean.length > 2) pdfTexts.push(clean);
                }

                const streamRegex = /stream[\r\n]+([\s\S]*?)[\r\n]+endstream/g;
                let sMatch;
                while ((sMatch = streamRegex.exec(str)) !== null) {
                    try {
                        const streamData = Buffer.from(sMatch[1], 'binary');
                        const decompressed = zlib.inflateSync(streamData).toString('utf8');
                        const textMatches = decompressed.match(/\(([^()]+)\)\s*(?:Tj|'|")/g) || [];
                        for (const tm of textMatches) {
                            const clean = tm.replace(/^\(/, '').replace(/\)\s*(?:Tj|'|")$/, '').trim();
                            if (clean.length > 2) pdfTexts.push(clean);
                        }
                        const btRegex = /BT[\s\S]*?ET/g;
                        const btBlocks = decompressed.match(btRegex) || [];
                        for (const b of btBlocks) {
                            const words = b.replace(/\[|\]|<|>|\/|T[a-z]|T[A-Z]/g, ' ').replace(/\s+/g, ' ').trim();
                            if (words.length > 3) pdfTexts.push(words);
                        }
                    } catch (_) {}
                }
                extractedText = pdfTexts.join(' ') || str.replace(/[^\x20-\x7E\t\r\n\xC0-\xFF]/g, ' ');
            } else {
                // txt o csv
                extractedText = fileBuffer.toString('utf8');
            }

            extractedText = extractedText.replace(/\s+/g, ' ').trim();

            // Heurística de Extracción:
            let formNumber = '';
            let articleCode = '114-A-1';
            let status = 'LIC';
            let doctorName = '';
            let matricula = '';
            let diasReposo = '';
            let diagnostico = '';

            // Si es CSV estructurado, extraer directamente por encabezados
            if (ext === 'csv') {
                const lines = fileBuffer.toString('utf8').split(/\r?\n/).filter(l => l.trim().length > 0);
                if (lines.length > 1) {
                    const sep = lines[0].includes(';') ? ';' : ',';
                    const headers = lines[0].split(sep).map(h => h.trim().toUpperCase());
                    const values = lines[1].split(sep).map(v => v.trim());
                    headers.forEach((h, idx) => {
                        const val = values[idx] || '';
                        if (!val) return;
                        if (h.includes('FORM') || h.includes('CERT') || h.includes('NUM')) {
                            formNumber = val.toUpperCase();
                        } else if (h.includes('ART')) {
                            articleCode = val.toUpperCase();
                        } else if (h.includes('ESTADO') || h.includes('STATUS')) {
                            status = val.toUpperCase();
                        } else if (h.includes('OBS') || h.includes('DIAG') || h.includes('MOTIVO')) {
                            diagnostico = val;
                        }
                    });
                }
            }

            // 1. Número de certificado / formulario (si no provino de CSV)
            if (!formNumber) {
                const formMatch = extractedText.match(/(?:formulario(?:\s*f[ií]sico)?|form\.?|certificado(?:\s*m[eé]dico)?|cert\.?|constancia|acta|num_formulario)\s*(?:n[°ºo\.]|nro\.?|num\.?|#)[:;\s]*([A-Za-z0-9\-\/]{2,25})/i) ||
                                  extractedText.match(/(?:n[°ºo\.]|nro\.?|#)[:;\s]*([A-Za-z0-9\-\/]{2,25})/i) ||
                                  extractedText.match(/(?:formulario(?:\s*f[ií]sico)?|form\.?|certificado(?:\s*m[eé]dico)?|cert\.?)\s*[:;\s]+([A-Za-z0-9\-_]*\d+[A-Za-z0-9\-_]*)/i);
                if (formMatch && formMatch[1] && !/^(?:oficial|nacional|provincial|medico|fisico)$/i.test(formMatch[1])) {
                    let rawVal = formMatch[1].trim().toUpperCase();
                    if (rawVal.startsWith('-')) rawVal = 'FORM' + rawVal;
                    if (rawVal.startsWith('FORM') || rawVal.startsWith('CERT') || rawVal.startsWith('MED') || rawVal.startsWith('CONST')) {
                        formNumber = rawVal;
                    } else {
                        const prefix = fileName.toLowerCase().includes('form') ? 'Form. F-' : 'Cert. Médico N° ';
                        formNumber = `${prefix}${rawVal}`;
                    }
                } else {
                    const numInFile = fileName.match(/(\d{3,8})/);
                    if (numInFile) {
                        formNumber = `Cert. Adjunto N° ${numInFile[1]}`;
                    } else {
                        const cleanName = fileName.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9\-_]/g, ' ').trim();
                        formNumber = `Constancia Doc. "${cleanName}"`;
                    }
                }
            }

            // 2. Artículo y Estado
            const lowerText = extractedText.toLowerCase();
            if (lowerText.includes('115') || lowerText.includes('razones particulares') || lowerText.includes('asuntos particulares')) {
                articleCode = '115';
                status = 'P';
            } else if (lowerText.includes('114 b') || lowerText.includes('114-b') || lowerText.includes('114b') || lowerText.includes('art. 48') || lowerText.includes('art 48') || lowerText.includes('largo tratamiento')) {
                articleCode = '114-B';
                status = 'LT';
            } else if (lowerText.includes('114 c') || lowerText.includes('114-c') || lowerText.includes('114c') || lowerText.includes('familiar')) {
                articleCode = '114-C';
                status = 'LIC';
            } else if (lowerText.includes('art. 70') || lowerText.includes('art 70') || lowerText.includes('examen') || lowerText.includes('estudio')) {
                articleCode = '114L';
                status = 'LIC';
            } else {
                articleCode = '114-A-1';
                status = 'LIC';
            }

            // 3. Médico / Profesional
            const docMatch = extractedText.match(/(?:dr[a\.]?|m[eé]dico\s+firmante|profesional|firmante)\s*:?\s*([A-Za-zÁÉÍÓÚáéíóúñ\s\.]{3,35})(?=,|\.|\n|mat|mp|mn|$)/i) ||
                             extractedText.match(/m[eé]dico\s*:\s*([A-Za-zÁÉÍÓÚáéíóúñ\s\.]{3,35})(?=,|\.|\n|mat|mp|mn|$)/i);
            if (docMatch && docMatch[1]) {
                const dName = docMatch[1].trim().replace(/\s+/g, ' ');
                if (!/^(?:oficial|general|de turno|nacional)$/i.test(dName)) {
                    doctorName = dName;
                }
            }

            // 4. Matrícula
            const matMatch = extractedText.match(/(?:mat(?:r[ií]cula)?|m\.?p\.?|m\.?n\.?)\s*(?:n[°ºo\.]|nro\.?)?\s*([0-9]{3,8})/i);
            if (matMatch && matMatch[1]) {
                matricula = matMatch[1];
            }

            // 5. Reposo / Días
            const reposoMatch = extractedText.match(/reposo\s*(?:m[eé]dico)?\s*(?:por)?\s*(\d+\s*(?:horas|d[ií]as|hs))/i) ||
                                extractedText.match(/(\d+)\s*(?:d[ií]as|hs|horas)\s*de\s*reposo/i);
            if (reposoMatch && reposoMatch[1]) {
                diasReposo = reposoMatch[1].trim();
            }

            // 6. Diagnóstico
            const diagMatch = extractedText.match(/(?:diagn[oó]stico|causal(?:\s*\/\s*diagn[oó]stico)?|motivo)\s*:?\s*([A-Za-zÁÉÍÓÚáéíóúñ0-9\s,\-\.]{4,80})(?=\.|\n|reposo|m[eé]dico|dr|$)/i);
            if (diagMatch && diagMatch[1]) {
                diagnostico = diagMatch[1].trim();
            }

            // Construir observaciones sugeridas
            let obsParts = [];
            if (doctorName) {
                obsParts.push(`Emitido por Dr/a. ${doctorName}${matricula ? ` (Mat. ${matricula})` : ''}`);
            }
            if (diagnostico) {
                obsParts.push(`Diagnóstico: ${diagnostico}`);
            }
            if (diasReposo) {
                obsParts.push(`Reposo: ${diasReposo}`);
            }
            if (obsParts.length === 0) {
                obsParts.push(`Constancia adjunta: ${fileName}`);
            }

            return {
                success: true,
                fileName,
                fileSize: fileBuffer.length,
                formNumber,
                articleCode,
                status,
                observations: obsParts.join('. ') + '.',
                extractedSummary: extractedText.substring(0, 160)
            };
        } catch (err) {
            console.error('[AttendanceService] Error procesando archivo de justificación:', err);
            return {
                success: false,
                message: `Error al extraer datos del archivo: ${err.message}`
            };
        }
    }

    /**
     * Genera y exporta la planilla oficial en formato Excel (.xlsx) correspondiente a la fecha seleccionada.
     * Incluye encabezado institucional del IESETYFP, fecha de emisión, lista nominal, situación de revista,
     * carga horaria, estado diario (Presente, Inasistencia, Licencia, Permiso, Suplencia) y observaciones.
     */
    static async exportDailyExcel({ dateStr, outputDir = null }) {
        const db = getDatabase();
        const path = require('path');
        const fs = require('fs');
        const ExcelJS = require('exceljs');

        const targetDate = dateStr || new Date().toISOString().split('T')[0];

        // 1. Obtener registros nominales del día
        const dailyRecords = this.getDailyRecords(targetDate);

        // 2. Obtener suplencias activas en esta fecha específica
        let substitutions = [];
        try {
            substitutions = db.prepare(`
                SELECT sub.id, sub.license_reason, sub.start_date, sub.end_date, sub.resolution_number,
                       s.name as subject_name,
                       tit.id as titular_id, tit.first_name as tit_first, tit.last_name as tit_last, tit.legajo as tit_legajo,
                       sup.id as suplente_id, sup.first_name as sup_first, sup.last_name as sup_last, sup.legajo as sup_legajo
                FROM substitutions sub
                JOIN designations d ON sub.designation_id = d.id
                JOIN subjects s ON d.subject_id = s.id
                JOIN teachers tit ON sub.titular_teacher_id = tit.id
                JOIN teachers sup ON sub.suplente_teacher_id = sup.id
                WHERE (sub.start_date <= ? AND (sub.end_date >= ? OR sub.end_date IS NULL)) AND sub.is_active = 1
            `).all(targetDate, targetDate);
        } catch (e) {
            console.warn('[AttendanceService] No se pudieron consultar suplencias para el Excel diario:', e.message);
        }

        const subByTitular = new Map();
        const subBySuplente = new Map();
        for (const sub of substitutions) {
            subByTitular.set(sub.titular_id, sub);
            subBySuplente.set(sub.suplente_id, sub);
        }

        // Formatear fecha para presentación (DD/MM/YYYY)
        const dateParts = targetDate.split('-');
        const formattedDate = dateParts.length === 3 ? `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}` : targetDate;
        const nowStr = new Date().toLocaleString('es-AR', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'SIGET - IESETYFP';
        workbook.created = new Date();

        const sheetName = `Parte Diario ${targetDate}`.substring(0, 31);
        const sheet = workbook.addWorksheet(sheetName);
        sheet.views = [{ showGridLines: true }];

        // Fila 1: Encabezado Institucional Principal
        sheet.mergeCells('A1:G1');
        const titleCell = sheet.getCell('A1');
        titleCell.value = 'IESETYFP • INSTITUTO DE EDUCACIÓN SUPERIOR DE EDUCACIÓN TÉCNICA Y FORMACIÓN PROFESIONAL';
        titleCell.font = { name: 'Segoe UI', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
        titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } }; // slate-800
        titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
        sheet.getRow(1).height = 28;

        // Fila 2: Subtítulo con fecha y emisión
        sheet.mergeCells('A2:G2');
        const subCell = sheet.getCell('A2');
        subCell.value = `PARTE DIARIO OFICIAL DE ASISTENCIA Y NOVEDADES • FECHA: ${formattedDate} • EMISIÓN: ${nowStr} • CONTROL DE BEDELÍA`;
        subCell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FF8A6F0E' } }; // gold
        subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDF9E7' } };
        subCell.alignment = { horizontal: 'center', vertical: 'middle' };
        sheet.getRow(2).height = 22;

        // Fila 3: Espaciador
        sheet.getRow(3).height = 8;

        // Fila 4: Encabezados de Columna
        const headers = [
            'Legajo',
            'Docente (Apellido y Nombres)',
            'DNI',
            'Situación de Revista',
            'Carga Horaria',
            'Estado Diario',
            'Observaciones / Motivo'
        ];
        sheet.getRow(4).values = headers;
        sheet.getRow(4).font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FFFFFFFF' } };
        sheet.getRow(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } }; // slate-700
        sheet.getRow(4).alignment = { horizontal: 'center', vertical: 'middle' };
        sheet.getRow(4).height = 24;

        // Anchos de Columna
        sheet.getColumn(1).width = 14; // Legajo
        sheet.getColumn(2).width = 34; // Docente
        sheet.getColumn(3).width = 14; // DNI
        sheet.getColumn(4).width = 22; // Situación de Revista
        sheet.getColumn(5).width = 15; // Carga Horaria
        sheet.getColumn(6).width = 30; // Estado Diario
        sheet.getColumn(7).width = 42; // Observaciones / Motivo

        let prCount = 0;
        let iCount = 0;
        let licCount = 0;
        let pCount = 0;
        let ltCount = 0;
        let supCount = 0;
        let totalHours = 0;

        let currentRowIndex = 5;
        for (const r of dailyRecords) {
            const rawStatus = r.status || 'I';
            const hoursVal = r.hours || 4;
            totalHours += hoursVal;

            let statusLabel = 'Inasistencia';
            let statusCode = rawStatus;
            let finalObservations = r.observations || '';

            const subTitular = subByTitular.get(r.teacherId);
            const subSuplente = subBySuplente.get(r.teacherId);

            if (subSuplente) {
                supCount++;
                statusLabel = 'Suplencia (En Funciones)';
                statusCode = 'SUP';
                if (!finalObservations) {
                    finalObservations = `Suplente en ${subSuplente.subject_name} (Reemplaza a: ${subSuplente.tit_last}, ${subSuplente.tit_first})`;
                }
            } else if (subTitular) {
                statusLabel = 'Licencia Médica / Especial (Suplente Activo)';
                licCount++;
                if (!finalObservations) {
                    finalObservations = `Reemplazado por: ${subTitular.sup_last}, ${subTitular.sup_first} (Res. ${subTitular.resolution_number || 'S/N'})`;
                }
            } else if (rawStatus === 'PR') {
                prCount++;
                statusLabel = 'Presente';
            } else if (rawStatus === 'I') {
                iCount++;
                statusLabel = 'Inasistencia';
            } else if (rawStatus === 'LIC') {
                licCount++;
                statusLabel = 'Licencia Médica / Especial';
            } else if (rawStatus === 'P') {
                pCount++;
                statusLabel = 'Permiso Particular (Art. 115)';
            } else if (rawStatus === 'LT') {
                ltCount++;
                statusLabel = 'Largo Tratamiento';
            }

            const row = sheet.getRow(currentRowIndex);
            row.values = [
                r.legajo || 'S/L',
                r.fullName,
                r.dni,
                r.revista || 'Titular',
                `${hoursVal} hs`,
                statusLabel,
                finalObservations
            ];
            row.height = 20;

            row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
            row.getCell(2).alignment = { horizontal: 'left', vertical: 'middle' };
            row.getCell(2).font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FF0F172A' } };
            row.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };
            row.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
            row.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
            row.getCell(6).alignment = { horizontal: 'center', vertical: 'middle' };
            row.getCell(7).alignment = { horizontal: 'left', vertical: 'middle' };

            // Formato condicional del Estado Diario
            const stCell = row.getCell(6);
            stCell.font = { name: 'Segoe UI', size: 9, bold: true };
            if (statusCode === 'PR') {
                stCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F5E9' } };
                stCell.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FF2E7D32' } };
            } else if (statusCode === 'I') {
                stCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEBEE' } };
                stCell.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FFC62828' } };
            } else if (statusCode === 'LIC') {
                stCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3E0' } };
                stCell.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FFEF6C00' } };
            } else if (statusCode === 'P') {
                stCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE3F2FD' } };
                stCell.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FF1565C0' } };
            } else if (statusCode === 'LT') {
                stCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3E5F5' } };
                stCell.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FF6A1B9A' } };
            } else if (statusCode === 'SUP') {
                stCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0F2FE' } };
                stCell.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FF0369A1' } };
            }

            for (let c = 1; c <= 7; c++) {
                row.getCell(c).border = {
                    top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                    bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                    left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                    right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
                };
            }

            currentRowIndex++;
        }

        // Fila de Totales y Resumen
        const totRow = sheet.getRow(currentRowIndex);
        totRow.values = [
            'TOTALES',
            `${dailyRecords.length} docentes`,
            '',
            '',
            `${totalHours} hs`,
            `${prCount} PR | ${iCount} I | ${licCount + pCount + ltCount} LIC/P | ${supCount} SUPL`,
            ''
        ];
        totRow.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FF1E293B' } };
        totRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
        totRow.height = 24;
        totRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
        totRow.getCell(2).alignment = { horizontal: 'left', vertical: 'middle' };
        totRow.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
        totRow.getCell(6).alignment = { horizontal: 'center', vertical: 'middle' };

        for (let c = 1; c <= 7; c++) {
            totRow.getCell(c).border = {
                top: { style: 'medium', color: { argb: 'FF64748B' } },
                bottom: { style: 'medium', color: { argb: 'FF64748B' } }
            };
        }

        // Guardar archivo en disco con manejo de EBUSY
        const targetDir = outputDir || path.resolve(__dirname, '../../reportes');
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }

        const fileName = `Parte_Diario_Docentes_${targetDate}.xlsx`;
        const filePath = path.join(targetDir, fileName);

        let finalFilePath = filePath;
        let finalFileName = fileName;
        try {
            await workbook.xlsx.writeFile(filePath);
        } catch (writeErr) {
            if (writeErr.code === 'EBUSY') {
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                finalFileName = fileName.replace('.xlsx', `_${timestamp}.xlsx`);
                finalFilePath = path.join(targetDir, finalFileName);
                await workbook.xlsx.writeFile(finalFilePath);
            } else {
                throw writeErr;
            }
        }

        const buffer = await workbook.xlsx.writeBuffer();
        const base64 = buffer.toString('base64');

        try {
            const currentUser = AuthService.getCurrentUser();
            AuditService.log(
                currentUser ? currentUser.id : null,
                currentUser ? currentUser.username : 'BEDELIA',
                'EXPORTAR_PARTE_DIARIO_EXCEL',
                `Exportado parte diario oficial ${finalFileName} (${dailyRecords.length} docentes)`
            );
        } catch (auditErr) {
            console.warn('[AttendanceService] No se pudo registrar auditoría de exportación diaria:', auditErr.message);
        }

        return {
            success: true,
            fileName: finalFileName,
            filePath: finalFilePath,
            base64,
            dateStr: targetDate,
            totalRecords: dailyRecords.length,
            message: `Parte diario oficial guardado en Excel: ${finalFileName}`
        };
    }

    /**
     * Obtiene y estructura los datos nominales para la Planilla Imprimible de Control Diario.
     * Retorna docentes con sus datos institucionales, cátedras agrupadas con desglose de días y total de horas.
     */
    static getPrintableDailyData({ dateStr }) {
        const db = getDatabase();
        const targetDate = dateStr || new Date().toISOString().split('T')[0];

        // Calcular día de la semana y nombres en español
        const daysNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
        const monthsNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        const [y, m, d] = targetDate.split('-').map(Number);
        const dateObj = new Date(y, m - 1, d);
        const dayOfWeekName = daysNames[dateObj.getDay()];
        const formattedDate = `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
        const longDateStr = `${dayOfWeekName}, ${d} de ${monthsNames[m - 1]} de ${y}`;

        // Obtener todos los docentes activos ordenados alfabéticamente
        const teachers = db.prepare(`
            SELECT id, legajo, dni, last_name, first_name, revista, max_weekly_hours
            FROM teachers
            WHERE is_active = 1
            ORDER BY last_name, first_name
        `).all();

        // Obtener todas las designaciones activas
        const designations = db.prepare(`
            SELECT d.id, d.teacher_id, d.subject_id, d.day_of_week, d.start_time, d.end_time, d.hours_count,
                   s.name as subject_name, s.code as subject_code, c.name as career_name
            FROM designations d
            JOIN subjects s ON d.subject_id = s.id
            JOIN careers c ON s.career_id = c.id
            WHERE d.is_active = 1
            ORDER BY s.name, d.day_of_week
        `).all();

        // Mapear designaciones por docente
        const desigsByTeacher = new Map();
        for (const des of designations) {
            if (!desigsByTeacher.has(des.teacher_id)) {
                desigsByTeacher.set(des.teacher_id, []);
            }
            desigsByTeacher.get(des.teacher_id).push(des);
        }

        // Obtener suplencias activas en esta fecha específica
        let substitutions = [];
        try {
            substitutions = db.prepare(`
                SELECT sub.id, sub.license_reason, sub.start_date, sub.end_date, sub.resolution_number,
                       s.name as subject_name,
                       tit.id as titular_id, tit.first_name as tit_first, tit.last_name as tit_last, tit.legajo as tit_legajo,
                       sup.id as suplente_id, sup.first_name as sup_first, sup.last_name as sup_last, sup.legajo as sup_legajo
                FROM substitutions sub
                JOIN designations d ON sub.designation_id = d.id
                JOIN subjects s ON d.subject_id = s.id
                JOIN teachers tit ON sub.titular_teacher_id = tit.id
                JOIN teachers sup ON sub.suplente_teacher_id = sup.id
                WHERE (sub.start_date <= ? AND (sub.end_date >= ? OR sub.end_date IS NULL)) AND sub.is_active = 1
            `).all(targetDate, targetDate);
        } catch (e) {
            console.warn('[AttendanceService] Error consultando suplencias:', e.message);
        }

        const subByTitular = new Map();
        for (const sub of substitutions) {
            subByTitular.set(sub.titular_id, sub);
        }

        const rows = teachers.map((t, idx) => {
            const desigs = desigsByTeacher.get(t.id) || [];
            const chairsInfo = formatTeacherChairs(desigs, dayOfWeekName);
            const activeSub = subByTitular.get(t.id);

            return {
                index: idx + 1,
                id: t.id,
                legajo: t.legajo || 'S/L',
                dni: t.dni || '—',
                fullName: `${t.last_name.toUpperCase()}, ${t.first_name}`,
                revista: t.revista || 'Titular',
                chairsText: chairsInfo.text,
                totalHours: chairsInfo.totalHours,
                subjects: chairsInfo.subjects,
                todaySubjects: chairsInfo.todaySubjects,
                activeSubstitution: activeSub ? {
                    suplenteName: `${activeSub.sup_last}, ${activeSub.sup_first}`,
                    reason: activeSub.license_reason,
                    resolution: activeSub.resolution_number
                } : null
            };
        });

        return {
            targetDate,
            formattedDate,
            dayOfWeekName,
            longDateStr,
            totalTeachers: teachers.length,
            rows
        };
    }

    /**
     * Exporta la Planilla Imprimible de Control Diario en formato Excel (.xlsx) estructurado
     * con casillas de verificación manual y diseño horizontal listo para impresión en papel.
     */
    static async exportPrintableDailyExcel({ dateStr, outputDir = null }) {
        const path = require('path');
        const fs = require('fs');
        const ExcelJS = require('exceljs');

        const data = this.getPrintableDailyData({ dateStr });
        const targetDate = data.targetDate;

        const outDir = outputDir || path.resolve(__dirname, '../../reportes');
        if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

        const fileName = `Planilla_Imprimible_Control_Diario_${targetDate}.xlsx`;
        const filePath = path.join(outDir, fileName);

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'SIGET - IESETYFP';
        workbook.created = new Date();

        const sheetName = `Control Diario ${targetDate}`.substring(0, 31);
        const sheet = workbook.addWorksheet(sheetName);
        sheet.views = [{ showGridLines: true }];

        // Configuración de página para impresión directa en hoja A4 Horizontal
        sheet.pageSetup = {
            orientation: 'landscape',
            paperSize: 9, // A4
            fitToPage: true,
            fitToWidth: 1,
            fitToHeight: 0,
            margins: {
                left: 0.3,
                right: 0.3,
                top: 0.4,
                bottom: 0.4,
                header: 0.2,
                footer: 0.2
            }
        };

        // Fila 1: Título Institucional Principal
        sheet.mergeCells('A1:L1');
        const titleCell = sheet.getCell('A1');
        titleCell.value = 'IESETYFP • INSTITUTO DE EDUCACIÓN SUPERIOR DE EDUCACIÓN TÉCNICA Y FORMACIÓN PROFESIONAL';
        titleCell.font = { name: 'Segoe UI', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
        titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } }; // Slate 800
        titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
        sheet.getRow(1).height = 28;

        // Fila 2: Subtítulo con fecha y controles operativos
        sheet.mergeCells('A2:L2');
        const subCell = sheet.getCell('A2');
        subCell.value = `PLANILLA IMPRIMIBLE DE CONTROL DIARIO DE ASISTENCIA Y PARTE DE NOVEDADES • FECHA: ${data.formattedDate} (${data.dayOfWeekName.toUpperCase()}) • CONTROL DE BEDELÍA`;
        subCell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FF854D0E' } }; // Amber 800
        subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF9C3' } }; // Amber 100
        subCell.alignment = { horizontal: 'center', vertical: 'middle' };
        sheet.getRow(2).height = 22;

        // Fila 3: Separador
        sheet.getRow(3).height = 6;

        // Fila 4: Encabezados de Columna
        const headers = [
            { header: 'N°', key: 'idx', width: 5 },
            { header: 'Legajo', key: 'legajo', width: 13 },
            { header: 'DNI', key: 'dni', width: 12 },
            { header: 'Docente (Apellido y Nombres)', key: 'docente', width: 32 },
            { header: 'Situación Revista', key: 'revista', width: 16 },
            { header: 'Materia / Cátedra Asignada (Días y Horarios)', key: 'catedras', width: 44 },
            { header: 'Total Hs', key: 'horas', width: 9 },
            { header: '[  ] PR', key: 'pr', width: 8 },
            { header: '[  ] I', key: 'i', width: 8 },
            { header: '[  ] P', key: 'p', width: 8 },
            { header: '[  ] LIC', key: 'lic', width: 8 },
            { header: '[  ] SUP — Suple a: ____________________', key: 'sup', width: 34 }
        ];

        sheet.columns = headers;
        const headerRow = sheet.getRow(4);
        headerRow.values = headers.map(h => h.header);
        headerRow.height = 26;
        headerRow.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } }; // Slate 700
        headerRow.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

        const thinBorder = {
            top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
        };

        headerRow.eachCell(c => { c.border = thinBorder; });

        // Filas de Datos de Docentes
        let rowIdx = 5;
        data.rows.forEach(r => {
            const row = sheet.getRow(rowIdx);
            row.height = 30; // Altura cómoda para escritura manual con lapicera

            row.getCell(1).value = r.index;
            row.getCell(2).value = r.legajo;
            row.getCell(3).value = r.dni;
            row.getCell(4).value = r.fullName;
            row.getCell(5).value = r.revista;
            row.getCell(6).value = r.chairsText;
            row.getCell(7).value = r.totalHours > 0 ? `${r.totalHours} hs` : '—';
            row.getCell(8).value = '[   ]';
            row.getCell(9).value = '[   ]';
            row.getCell(10).value = '[   ]';
            row.getCell(11).value = '[   ]';
            row.getCell(12).value = '[   ] Suple a: .......................................';

            // Alineaciones y Estilos
            row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
            row.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };
            row.getCell(2).font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FF0F172A' } };
            row.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };
            row.getCell(4).alignment = { horizontal: 'left', vertical: 'middle' };
            row.getCell(4).font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FF0F172A' } };
            row.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
            row.getCell(6).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
            row.getCell(6).font = { name: 'Segoe UI', size: 8.5, color: { argb: 'FF334155' } };
            row.getCell(7).alignment = { horizontal: 'center', vertical: 'middle' };
            row.getCell(7).font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FF0F172A' } };

            // Celdas de Casillas Manuales
            [8, 9, 10, 11].forEach(col => {
                const cell = row.getCell(col);
                cell.alignment = { horizontal: 'center', vertical: 'middle' };
                cell.font = { name: 'Consolas', size: 10, bold: true, color: { argb: 'FF64748B' } };
            });

            // Columna de Suplencia
            const supCell = row.getCell(12);
            supCell.alignment = { horizontal: 'left', vertical: 'middle' };
            supCell.font = { name: 'Segoe UI', size: 8, color: { argb: 'FF64748B' } };

            // Fondo alternado para lectura nítida
            if (rowIdx % 2 === 0) {
                for (let c = 1; c <= 12; c++) {
                    row.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
                }
            }

            for (let c = 1; c <= 12; c++) {
                row.getCell(c).border = thinBorder;
            }

            rowIdx++;
        });

        // Fila de Observaciones
        rowIdx++;
        sheet.mergeCells(`A${rowIdx}:L${rowIdx}`);
        const obsTitle = sheet.getCell(`A${rowIdx}`);
        obsTitle.value = 'OBSERVACIONES Y NOVEDADES EXTRAORDINARIAS DE LA JORNADA:';
        obsTitle.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FF334155' } };
        sheet.getRow(rowIdx).height = 18;

        rowIdx++;
        sheet.mergeCells(`A${rowIdx}:L${rowIdx + 1}`);
        const obsBox = sheet.getCell(`A${rowIdx}`);
        obsBox.value = '........................................................................................................................................................................................................................................................................................................';
        obsBox.font = { name: 'Segoe UI', size: 8.5, color: { argb: 'FF94A3B8' } };
        obsBox.alignment = { vertical: 'top', wrapText: true };
        sheet.getRow(rowIdx).height = 32;
        rowIdx += 2;

        // Fila de Firmas Institucionales
        sheet.mergeCells(`A${rowIdx}:E${rowIdx}`);
        const sigBedel = sheet.getCell(`A${rowIdx}`);
        sigBedel.value = '_________________________________________\nFirma y Aclaración Bedel de Turno';
        sigBedel.font = { name: 'Segoe UI', size: 8.5, color: { argb: 'FF475569' } };
        sigBedel.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

        sheet.mergeCells(`F${rowIdx}:I${rowIdx}`);
        const sigSec = sheet.getCell(`F${rowIdx}`);
        sigSec.value = '_________________________________________\nFirma y Sello Secretaría Académica';
        sigSec.font = { name: 'Segoe UI', size: 8.5, color: { argb: 'FF475569' } };
        sigSec.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

        sheet.mergeCells(`J${rowIdx}:L${rowIdx}`);
        const sigDir = sheet.getCell(`J${rowIdx}`);
        sigDir.value = '_________________________________________\nSello Oficial IESETYFP';
        sigDir.font = { name: 'Segoe UI', size: 8.5, color: { argb: 'FF475569' } };
        sigDir.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        sheet.getRow(rowIdx).height = 42;

        // Manejo defensivo contra bloqueos EBUSY en Windows
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

        try {
            const currentUser = AuthService.getCurrentUser();
            AuditService.log(
                currentUser ? currentUser.id : null,
                currentUser ? currentUser.username : 'BEDELIA',
                'EXPORTAR_PLANILLA_IMPRIMIBLE_EXCEL',
                `Planilla imprimible de control diario en Excel generada: ${finalFileName} (${data.rows.length} docentes)`
            );
        } catch (auditErr) {
            console.warn('[AttendanceService] Error en auditoría:', auditErr.message);
        }

        return {
            success: true,
            fileName: finalFileName,
            filePath: finalFilePath,
            base64,
            dateStr: targetDate,
            totalTeachers: data.totalTeachers,
            message: `Planilla imprimible de control diario en Excel generada: ${finalFileName}`
        };
    }

    /**
     * Exporta la Planilla Imprimible de Control Diario en formato PDF formal,
     * optimizada en A4 apaisado (landscape) con casillas de verificación para imprimir y firmar a mano.
     */
    static async exportPrintableDailyPdf({ dateStr, outputDir = null, exportedBy = 'Bedelía' }) {
        const path = require('path');
        const fs = require('fs');

        const data = this.getPrintableDailyData({ dateStr });
        const targetDate = data.targetDate;

        const outDir = outputDir || path.resolve(__dirname, '../../reportes');
        if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

        const fileName = `Planilla_Imprimible_Control_Diario_${targetDate}.pdf`;
        const filePath = path.join(outDir, fileName);

        const nowStr = new Date().toLocaleString('es-AR', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });

        // Generar filas HTML
        const rowsHtml = data.rows.map(r => `
            <tr>
                <td style="text-align: center; font-weight: bold; padding: 6px 3px; border: 1px solid #cbd5e1;">${r.index}</td>
                <td style="text-align: center; padding: 6px 4px; border: 1px solid #cbd5e1;">
                    <div style="font-weight: bold; font-size: 8.5pt; color: #0f172a;">${escapePrintableXml(r.legajo)}</div>
                    <div style="font-size: 7.5pt; color: #64748b;">${escapePrintableXml(r.dni)}</div>
                </td>
                <td style="padding: 6px 5px; font-weight: bold; font-size: 8.5pt; color: #0f172a; border: 1px solid #cbd5e1;">
                    ${escapePrintableXml(r.fullName)}
                </td>
                <td style="text-align: center; font-size: 8pt; color: #334155; border: 1px solid #cbd5e1;">
                    ${escapePrintableXml(r.revista)}
                </td>
                <td style="padding: 6px 6px; font-size: 8pt; color: #1e293b; border: 1px solid #cbd5e1; line-height: 1.35;">
                    ${r.subjects.length > 0 
                        ? r.subjects.map(s => `<div>• <strong>${escapePrintableXml(s.name)}</strong> <span style="color: #475569;">(${escapePrintableXml(s.daysText)} - ${s.hours} hs)</span></div>`).join('')
                        : '<span style="color: #94a3b8; font-style: italic;">Sin cátedra asignada / Planta General</span>'
                    }
                </td>
                <td style="text-align: center; font-weight: bold; font-size: 8.5pt; color: #0f172a; border: 1px solid #cbd5e1;">
                    ${r.totalHours > 0 ? `${r.totalHours} hs` : '—'}
                </td>
                <td style="text-align: center; border: 1px solid #cbd5e1; vertical-align: middle;">
                    <div style="width: 14px; height: 14px; border: 1.5px solid #334155; border-radius: 2px; margin: 0 auto; background: #fff;"></div>
                </td>
                <td style="text-align: center; border: 1px solid #cbd5e1; vertical-align: middle;">
                    <div style="width: 14px; height: 14px; border: 1.5px solid #334155; border-radius: 2px; margin: 0 auto; background: #fff;"></div>
                </td>
                <td style="text-align: center; border: 1px solid #cbd5e1; vertical-align: middle;">
                    <div style="width: 14px; height: 14px; border: 1.5px solid #334155; border-radius: 2px; margin: 0 auto; background: #fff;"></div>
                </td>
                <td style="text-align: center; border: 1px solid #cbd5e1; vertical-align: middle;">
                    <div style="width: 14px; height: 14px; border: 1.5px solid #334155; border-radius: 2px; margin: 0 auto; background: #fff;"></div>
                </td>
                <td style="padding: 6px 6px; border: 1px solid #cbd5e1; vertical-align: middle;">
                    <div style="display: flex; align-items: center;">
                        <div style="width: 13px; height: 13px; border: 1.5px solid #334155; border-radius: 2px; display: inline-block; vertical-align: middle; margin-right: 6px; background: #fff;"></div>
                        <span style="font-size: 7.5pt; color: #475569; display: inline-block; vertical-align: middle;">Suple a: <span style="letter-spacing: 1px; color: #94a3b8;">............................................................</span></span>
                    </div>
                </td>
            </tr>
        `).join('');

        const html = `
            <!DOCTYPE html>
            <html lang="es">
            <head>
                <meta charset="UTF-8">
                <title>Planilla Imprimible de Control Diario - IESETYFP</title>
                <style>
                    @page {
                        size: A4 landscape;
                        margin: 8mm 9mm 8mm 9mm;
                    }
                    body {
                        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
                        color: #0f172a;
                        margin: 0;
                        padding: 0;
                        -webkit-print-color-adjust: exact;
                        print-color-adjust: exact;
                        background: #ffffff;
                    }
                    .header-table {
                        width: 100%;
                        border-collapse: collapse;
                        margin-bottom: 8px;
                        border-bottom: 2px solid #1e293b;
                        padding-bottom: 6px;
                    }
                    .header-left {
                        text-align: left;
                        vertical-align: middle;
                        width: 65%;
                    }
                    .header-right {
                        text-align: right;
                        vertical-align: middle;
                        width: 35%;
                    }
                    .inst-sub {
                        font-size: 7pt;
                        font-weight: 700;
                        letter-spacing: 0.8px;
                        color: #64748b;
                        text-transform: uppercase;
                    }
                    .inst-name {
                        font-size: 11pt;
                        font-weight: 900;
                        color: #0f172a;
                        margin-top: 1px;
                        margin-bottom: 2px;
                    }
                    .doc-title {
                        font-size: 9pt;
                        font-weight: 800;
                        color: #b45309;
                        letter-spacing: 0.5px;
                        text-transform: uppercase;
                    }
                    .badge-date {
                        display: inline-block;
                        background: #f1f5f9;
                        border: 1px solid #cbd5e1;
                        padding: 4px 8px;
                        border-radius: 4px;
                        font-size: 8pt;
                        color: #1e293b;
                        margin-bottom: 3px;
                    }
                    .turnos-box {
                        font-size: 7.5pt;
                        color: #334155;
                        font-weight: 600;
                    }
                    .main-table {
                        width: 100%;
                        border-collapse: collapse;
                        font-size: 8pt;
                    }
                    .main-table th {
                        background-color: #1e293b;
                        color: #ffffff;
                        font-weight: 800;
                        font-size: 7.5pt;
                        text-transform: uppercase;
                        padding: 6px 4px;
                        border: 1px solid #0f172a;
                        text-align: center;
                    }
                    .main-table tr:nth-child(even) td {
                        background-color: #f8fafc;
                    }
                    .footer-container {
                        margin-top: 10px;
                        page-break-inside: avoid;
                    }
                    .obs-box {
                        border: 1px solid #cbd5e1;
                        border-radius: 4px;
                        padding: 6px 8px;
                        background: #fafafa;
                        font-size: 7.5pt;
                        color: #475569;
                        margin-bottom: 12px;
                    }
                    .signatures-table {
                        width: 100%;
                        border-collapse: collapse;
                        margin-top: 8px;
                    }
                    .signatures-table td {
                        width: 33.33%;
                        text-align: center;
                        vertical-align: top;
                        font-size: 7.5pt;
                        color: #475569;
                    }
                    .sig-line {
                        margin: 0 auto 4px auto;
                        width: 75%;
                        border-top: 1px solid #334155;
                    }
                    .legal-foot {
                        margin-top: 8px;
                        font-size: 6.5pt;
                        color: #94a3b8;
                        text-align: center;
                        font-style: italic;
                    }
                </style>
            </head>
            <body>
                <table class="header-table">
                    <tr>
                        <td class="header-left">
                            <div class="inst-sub">PROVINCIA DE BUENOS AIRES • DGCyE • DIRECCIÓN DE EDUCACIÓN SUPERIOR</div>
                            <div class="inst-name">INSTITUTO DE EDUCACIÓN SUPERIOR DE EDUCACIÓN TÉCNICA Y FORMACIÓN PROFESIONAL</div>
                            <div class="doc-title">PLANILLA IMPRIMIBLE DE CONTROL DIARIO DE ASISTENCIA Y PARTE DE NOVEDADES</div>
                        </td>
                        <td class="header-right">
                            <div class="badge-date"><strong>FECHA:</strong> ${data.longDateStr.toUpperCase()}</div>
                            <div class="turnos-box">
                                <strong>TURNO:</strong> [  ] MAÑANA &nbsp; [  ] TARDE &nbsp; [  ] VESPERTINO
                            </div>
                            <div style="font-size: 7pt; color: #64748b; margin-top: 2px;">
                                Control Bedelía: ___________________ • Emisión: ${nowStr}
                            </div>
                        </td>
                    </tr>
                </table>

                <table class="main-table">
                    <thead>
                        <tr>
                            <th style="width: 3%;">N°</th>
                            <th style="width: 10%;">Legajo / DNI</th>
                            <th style="width: 19%; text-align: left; padding-left: 6px;">Docente (Apellido y Nombres)</th>
                            <th style="width: 9%;">Revista</th>
                            <th style="width: 28%; text-align: left; padding-left: 6px;">Materia / Cátedra Asignada (Días y Horas)</th>
                            <th style="width: 6%;">Total</th>
                            <th style="width: 4.5%;" title="Presente">[ ] PR</th>
                            <th style="width: 4.5%;" title="Inasistencia">[ ] I</th>
                            <th style="width: 4.5%;" title="Permiso Art. 115">[ ] P</th>
                            <th style="width: 4.5%;" title="Licencia Médica/Ordinaria">[ ] LIC</th>
                            <th style="width: 20%; text-align: left; padding-left: 6px;">[ ] SUP — Suple a: ____________________</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHtml}
                    </tbody>
                </table>

                <div class="footer-container">
                    <div class="obs-box">
                        <strong>OBSERVACIONES Y NOVEDADES EXTRAORDINARIAS DE LA JORNADA:</strong><br>
                        <span style="color: #94a3b8; font-family: monospace;">..............................................................................................................................................................................................................................................................................................................................................................................................................................................</span>
                    </div>

                    <table class="signatures-table">
                        <tr>
                            <td>
                                <div class="sig-line"></div>
                                <strong>Firma y Aclaración Bedel de Turno</strong><br>
                                <span>Responsable de Carga y Control</span>
                            </td>
                            <td>
                                <div class="sig-line"></div>
                                <strong>Firma y Sello Secretaría Académica</strong><br>
                                <span>Revisión y Conformidad Operativa</span>
                            </td>
                            <td>
                                <div class="sig-line"></div>
                                <strong>Sello Institucional IESETYFP</strong><br>
                                <span>Constancia de Archivo de Novedades</span>
                            </td>
                        </tr>
                    </table>

                    <div class="legal-foot">
                        SIGET • Sistema Integral de Gestión Educativa Terciaria • Documento oficial de control de asistencia presencial (Decreto 187/00) • Generado por: ${escapePrintableXml(exportedBy)}
                    </div>
                </div>
            </body>
            </html>
        `;

        let pdfBuffer;
        try {
            const { BrowserWindow } = require('electron');
            if (BrowserWindow) {
                const win = new BrowserWindow({
                    show: false,
                    webPreferences: { offscreen: true }
                });
                await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
                pdfBuffer = await win.webContents.printToPDF({
                    printBackground: true,
                    landscape: true,
                    pageSize: 'A4',
                    margins: { top: 0.3, bottom: 0.3, left: 0.3, right: 0.3 }
                });
                win.close();
            } else {
                pdfBuffer = createPrintableDailyFallbackPdf(
                    `PLANILLA DE CONTROL DIARIO - ${data.formattedDate}`,
                    data.rows.map(r => `${r.legajo} | ${r.fullName} | ${r.revista} | ${r.chairsText}`)
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

            try {
                const currentUser = AuthService.getCurrentUser();
                AuditService.log(
                    currentUser ? currentUser.id : null,
                    currentUser ? currentUser.username : 'BEDELIA',
                    'EXPORTAR_PLANILLA_IMPRIMIBLE_PDF',
                    `Planilla imprimible de control diario en PDF generada: ${finalFileName} (${data.rows.length} docentes)`
                );
            } catch (auditErr) {
                console.warn('[AttendanceService] Error en auditoría:', auditErr.message);
            }

            return {
                success: true,
                filePath: finalFilePath,
                fileName: finalFileName,
                base64: pdfBuffer.toString('base64'),
                dateStr: targetDate,
                totalTeachers: data.totalTeachers,
                message: `Planilla imprimible de control diario en PDF generada: ${finalFileName}`
            };
        } catch (err) {
            console.error('[AttendanceService] Error generando PDF imprimible:', err);
            const fallbackBuf = createPrintableDailyFallbackPdf(
                `PLANILLA DE CONTROL DIARIO - ${data.formattedDate}`,
                data.rows.map(r => `${r.legajo} | ${r.fullName} | ${r.revista} | ${r.chairsText}`)
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
                dateStr: targetDate,
                totalTeachers: data.totalTeachers,
                message: `Planilla imprimible de control diario generada (fallback): ${finalFileName}`
            };
        }
    }
}

/**
 * Agrupa y formatea las materias de un docente con desglose de días múltiples de dictado.
 * Ej: 'Algoritmos I (Lunes, Martes y Viernes - 6 hs)'
 */
function formatTeacherChairs(designations, todayName = '') {
    if (!designations || designations.length === 0) {
        return {
            text: 'Sin cátedra asignada / Planta General',
            totalHours: 0,
            subjects: [],
            todaySubjects: []
        };
    }

    const subjectMap = new Map();
    let totalHours = 0;

    for (const d of designations) {
        const key = d.subject_name;
        if (!subjectMap.has(key)) {
            subjectMap.set(key, {
                name: d.subject_name,
                code: d.subject_code || '',
                career: d.career_name || '',
                days: [],
                hours: 0
            });
        }
        const s = subjectMap.get(key);
        if (d.day_of_week && !s.days.includes(d.day_of_week)) {
            s.days.push(d.day_of_week);
        }
        const h = Number(d.hours_count) || 0;
        s.hours += h;
        totalHours += h;
    }

    const order = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const subjects = [];
    const todaySubjects = [];

    for (const s of subjectMap.values()) {
        s.days.sort((a, b) => order.indexOf(a) - order.indexOf(b));
        let daysText = '';
        if (s.days.length === 0) {
            daysText = 'A confirmar';
        } else if (s.days.length === 1) {
            daysText = s.days[0];
        } else if (s.days.length === 2) {
            daysText = `${s.days[0]} y ${s.days[1]}`;
        } else {
            daysText = `${s.days.slice(0, -1).join(', ')} y ${s.days[s.days.length - 1]}`;
        }

        const isToday = todayName && s.days.includes(todayName);
        if (isToday) todaySubjects.push(s.name);

        subjects.push({
            name: s.name,
            code: s.code,
            career: s.career,
            days: s.days,
            daysText,
            hours: s.hours,
            isToday,
            summary: `${s.name} (${daysText} - ${s.hours} hs)`
        });
    }

    const text = subjects.map(s => s.summary).join(' • ');
    return {
        text,
        totalHours,
        subjects,
        todaySubjects
    };
}

function escapePrintableXml(unsafe) {
    if (unsafe === null || unsafe === undefined) return '';
    return String(unsafe)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function createPrintableDailyFallbackPdf(title, lines) {
    const safeTitle = (title || 'PLANILLA DE CONTROL DIARIO').replace(/[\(\)\\]/g, '');
    const cleanLines = (lines || []).slice(0, 35).map(l => String(l).substring(0, 95).replace(/[\(\)\\]/g, ''));
    
    let content = `BT /F1 13 Tf 30 560 Td (${safeTitle}) Tj ET\n`;
    cleanLines.forEach((line, idx) => {
        const y = 530 - (idx * 14);
        content += `BT /F1 8 Tf 30 ${y} Td (${line}) Tj ET\n`;
    });

    const stream = Buffer.from(content, 'utf8');
    const pdfData = `%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> /Contents 4 0 R >>\nendobj\n4 0 obj\n<< /Length ${stream.length} >>\nstream\n${content}endstream\nendobj\nxref\n0 5\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000300 00000 n \ntrailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${380 + stream.length}\n%%EOF`;
    return Buffer.from(pdfData, 'binary');
}


module.exports = { AttendanceService };
