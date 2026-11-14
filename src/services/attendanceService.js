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
}

module.exports = { AttendanceService };
