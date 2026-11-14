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

        // Guardar archivo en disco
        const targetDir = outputDir || path.resolve(__dirname, '../../reportes');
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }

        const fileName = `Parte_Diario_Docentes_${targetDate}.xlsx`;
        const filePath = path.join(targetDir, fileName);

        await workbook.xlsx.writeFile(filePath);

        const buffer = await workbook.xlsx.writeBuffer();
        const base64 = buffer.toString('base64');

        try {
            const currentUser = AuthService.getCurrentUser();
            AuditService.log(
                currentUser ? currentUser.id : null,
                currentUser ? currentUser.username : 'BEDELIA',
                'EXPORTAR_PARTE_DIARIO_EXCEL',
                `Exportado parte diario oficial ${fileName} (${dailyRecords.length} docentes)`
            );
        } catch (auditErr) {
            console.warn('[AttendanceService] No se pudo registrar auditoría de exportación diaria:', auditErr.message);
        }

        return {
            success: true,
            fileName,
            filePath,
            base64,
            dateStr: targetDate,
            totalRecords: dailyRecords.length,
            message: `Parte diario oficial guardado en Excel: ${fileName}`
        };
    }
}

module.exports = { AttendanceService };
