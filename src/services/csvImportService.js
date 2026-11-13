/**
 * Servicio de Importación Masiva por Archivos CSV para SIGET
 * Permite la carga masiva y validación de:
 * 1. Planta funcional / Legajos de personal ("Datos del personal")
 * 2. Registros históricos y operativos de Asistencias ("Asistencia")
 * 
 * Cumple con RN-01 (DNI formato texto), RN-02 (designaciones independientes),
 * RN-03 (tope de 30 horas semanales), prevención de duplicados e informe de inconsistencias.
 */

const { getDatabase } = require('../database/db');
const { AuditService } = require('./auditService');
const { AuthService } = require('./authService');
const { NormativeService } = require('./normativeService');
const { AttendanceService } = require('./attendanceService');

class CsvImportService {
    /**
     * Parsea texto CSV admitiendo separador por coma, punto y coma o tabulación,
     * y respetando cadenas entre comillas.
     */
    static parseCsv(csvText) {
        if (!csvText || typeof csvText !== 'string') {
            return { headers: [], rows: [] };
        }

        const lines = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
            .map(l => l.trim())
            .filter(l => l.length > 0);

        if (lines.length === 0) {
            return { headers: [], rows: [] };
        }

        // Detectar delimitador inspeccionando la primera línea
        const firstLine = lines[0];
        let delimiter = ',';
        const commas = (firstLine.match(/,/g) || []).length;
        const semicolons = (firstLine.match(/;/g) || []).length;
        const tabs = (firstLine.match(/\t/g) || []).length;

        if (semicolons > commas && semicolons >= tabs) {
            delimiter = ';';
        } else if (tabs > commas && tabs > semicolons) {
            delimiter = '\t';
        }

        const parseLine = (line) => {
            const values = [];
            let inQuotes = false;
            let current = '';

            for (let i = 0; i < line.length; i++) {
                const char = line[i];
                if (char === '"') {
                    if (inQuotes && line[i + 1] === '"') {
                        current += '"';
                        i++; // Saltar comilla escapada
                    } else {
                        inQuotes = !inQuotes;
                    }
                } else if (char === delimiter && !inQuotes) {
                    values.push(current.trim());
                    current = '';
                } else {
                    current += char;
                }
            }
            values.push(current.trim());
            return values;
        };

        const rawHeaders = parseLine(lines[0]);
        const headers = rawHeaders.map(h => this._normalizeHeader(h));

        const rows = [];
        for (let i = 1; i < lines.length; i++) {
            const values = parseLine(lines[i]);
            // Omitir líneas vacías
            if (values.every(v => v === '')) continue;

            const row = {};
            for (let h = 0; h < headers.length; h++) {
                row[headers[h]] = values[h] !== undefined ? values[h] : '';
            }
            row._rawLineNumber = i + 1;
            rows.push(row);
        }

        return { headers, rows };
    }

    static _normalizeHeader(header) {
        if (!header) return '';
        return header
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '') // Remover tildes
            .replace(/[^a-z0-9]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '');
    }

    // -------------------------------------------------------------
    // IMPORTACIÓN DE PERSONAL / LEGAJOS
    // -------------------------------------------------------------

    /**
     * Valida y genera previsualización del archivo de personal antes de persistir.
     */
    static previewPersonnel(csvText) {
        const db = getDatabase();
        const { rows } = this.parseCsv(csvText);

        if (rows.length === 0) {
            return {
                success: false,
                message: 'El archivo CSV está vacío o no contiene registros válidos.',
                totalRows: 0,
                validRows: 0,
                invalidRows: 0,
                errors: [],
                preview: []
            };
        }

        const errors = [];
        const preview = [];
        const seenDnisInFile = new Map();

        // Cargar mapa de docentes existentes en la BD
        const existingTeachers = db.prepare('SELECT id, dni, legajo, first_name, last_name, revista FROM teachers').all();
        const existingByDni = new Map();
        for (const t of existingTeachers) {
            existingByDni.set(String(t.dni).trim(), t);
        }

        // Cargar horas activas existentes
        const activeHoursByTeacher = new Map();
        const hoursRows = db.prepare(`
            SELECT teacher_id, COALESCE(SUM(hours_count), 0) as total_hours
            FROM designations
            WHERE is_active = 1
            GROUP BY teacher_id
        `).all();
        for (const hr of hoursRows) {
            activeHoursByTeacher.set(hr.teacher_id, hr.total_hours);
        }

        let validCount = 0;
        let invalidCount = 0;

        for (const row of rows) {
            const lineNum = row._rawLineNumber;
            const rowErrors = [];

            // Extraer campos admitiendo variantes de encabezado
            const rawDni = row.dni || row.documento || row.nro_doc || row.num_doc || '';
            const cleanDni = String(rawDni).replace(/\./g, '').replace(/\s+/g, '').trim();

            const apellido = (row.apellido || row.apellidos || row.apellido_y_nombre || '').trim();
            const nombre = (row.nombre || row.nombres || '').trim();
            const legajo = (row.legajo || row.nro_legajo || row.n_legajo || '').trim();
            
            // Situación de revista
            let revista = (row.revista || row.situacion_revista || row.situacion_de_revista || 'Titular').trim();
            const revistaNorm = revista.toLowerCase();
            if (revistaNorm.includes('titular')) revista = 'Titular';
            else if (revistaNorm.includes('provisional')) revista = 'Provisional';
            else if (revistaNorm.includes('interino')) revista = 'Interino';
            else if (revistaNorm.includes('suplente')) revista = 'Suplente';
            else revista = 'Titular';

            const catedra = (row.catedra || row.materia || row.asignatura || '').trim();
            const carrera = (row.carrera || row.carrera_nombre || 'Profesorado').trim();
            const dia = (row.dia || row.dia_semana || 'Lunes').trim();
            const horario = (row.horario || row.hora || '').trim();
            const resolucion = (row.resolucion || row.disposicion || row.disp || '').trim();
            
            const rawHoras = row.horas || row.cant_horas || row.cantidad_horas || '0';
            const horas = parseInt(rawHoras, 10) || (catedra ? 4 : 0);

            // Validaciones obligatorias
            if (!cleanDni) {
                rowErrors.push('DNI obligatorio no especificado.');
            } else if (!/^\d{6,10}$/.test(cleanDni)) {
                rowErrors.push(`Formato de DNI inválido: "${cleanDni}". Debe contener entre 6 y 10 dígitos.`);
            }

            if (!apellido) {
                rowErrors.push('El campo Apellido es obligatorio.');
            }
            if (!nombre && !row.apellido_y_nombre) {
                rowErrors.push('El campo Nombre es obligatorio.');
            }

            // Duplicados dentro del archivo
            if (cleanDni) {
                if (seenDnisInFile.has(cleanDni)) {
                    const prevLine = seenDnisInFile.get(cleanDni);
                    // Si trae cátedra distinta, es admisible como designación adicional (RN-02)
                    if (catedra) {
                        // Válido como designación múltiple
                    } else {
                        rowErrors.push(`DNI ${cleanDni} duplicado en la línea ${prevLine} de este archivo.`);
                    }
                } else {
                    seenDnisInFile.set(cleanDni, lineNum);
                }
            }

            // Validar tope de 30 horas semanales (RN-03)
            let existingTeacher = existingByDni.get(cleanDni);
            let currentHours = existingTeacher ? (activeHoursByTeacher.get(existingTeacher.id) || 0) : 0;
            let projectedHours = currentHours + horas;

            if (projectedHours > 30) {
                rowErrors.push(`Tope horario superado: el docente alcanzaría ${projectedHours} horas semanales (máximo estatutario: 30 hs).`);
            }

            const isValid = rowErrors.length === 0;
            if (isValid) validCount++;
            else invalidCount++;

            if (rowErrors.length > 0) {
                errors.push({
                    line: lineNum,
                    dni: cleanDni,
                    docente: `${apellido}, ${nombre}`,
                    errors: rowErrors
                });
            }

            preview.push({
                line: lineNum,
                dni: cleanDni,
                legajo: legajo || (existingTeacher ? existingTeacher.legajo : '-'),
                apellido,
                nombre,
                fullName: `${apellido}, ${nombre}`,
                revista,
                catedra: catedra || '-',
                carrera: carrera || '-',
                horas,
                dia,
                horario,
                resolucion,
                projectedHours,
                existsInDb: Boolean(existingTeacher),
                status: isValid ? 'VÁLIDO' : 'OBSERVADO',
                errorMessages: rowErrors.join(' | ')
            });
        }

        return {
            success: true,
            totalRows: rows.length,
            validRows: validCount,
            invalidRows: invalidCount,
            errors,
            preview: preview.slice(0, 100) // Primeros 100 para la vista rápida
        };
    }

    /**
     * Ejecuta la importación efectiva de personal y sus designaciones en una transacción atómica.
     */
    static importPersonnel(csvText, { updateExisting = true, createDesignations = true } = {}) {
        const db = getDatabase();
        const validation = this.previewPersonnel(csvText);

        if (!validation.success) {
            return validation;
        }

        const currentUser = AuthService.getCurrentUser();
        const username = currentUser ? currentUser.username : 'SECRETARIA';

        let insertedTeachers = 0;
        let updatedTeachers = 0;
        let createdDesignations = 0;
        const processedErrors = [];

        // Asegurar carrera por defecto en caso de crear cátedras
        let defaultCareer = db.prepare('SELECT id FROM careers LIMIT 1').get();
        if (!defaultCareer) {
            const insCar = db.prepare('INSERT INTO careers (name, code) VALUES (?, ?)').run('Profesorado de Educación Secundaria', 'PES');
            defaultCareer = { id: insCar.lastInsertRowid };
        }

        try {
            db.exec('BEGIN TRANSACTION;');
            const now = new Date().toISOString();

            for (const item of validation.preview) {
                if (item.status !== 'VÁLIDO') {
                    processedErrors.push(`Línea ${item.line} (DNI ${item.dni}): ${item.errorMessages}`);
                    continue;
                }

                // 1. Manejo del Docente
                let teacher = db.prepare('SELECT id, dni, legajo, first_name, last_name FROM teachers WHERE dni = ?').get(item.dni);
                let teacherId;

                if (!teacher) {
                    const legajoVal = item.legajo && item.legajo !== '-' ? item.legajo : `LEG-${item.dni.slice(-4)}`;
                    const resT = db.prepare(`
                        INSERT INTO teachers (
                            legajo, dni, first_name, last_name, revista, 
                            max_weekly_hours, is_active, created_at
                        ) VALUES (?, ?, ?, ?, ?, 30, 1, ?)
                    `).run(legajoVal, String(item.dni), item.nombre, item.apellido, item.revista, now);
                    teacherId = resT.lastInsertRowid;
                    insertedTeachers++;
                } else {
                    teacherId = teacher.id;
                    if (updateExisting) {
                        db.prepare(`
                            UPDATE teachers 
                            SET first_name = ?, last_name = ?, revista = ?
                            WHERE id = ?
                        `).run(item.nombre, item.apellido, item.revista, teacherId);
                        updatedTeachers++;
                    }
                }

                // 2. Manejo de Cátedra / Designación (si fue informada)
                if (createDesignations && item.catedra && item.catedra !== '-') {
                    // Buscar o crear materia
                    let subject = db.prepare('SELECT id FROM subjects WHERE LOWER(name) = LOWER(?) LIMIT 1').get(item.catedra);
                    let subjectId;
                    if (!subject) {
                        const code = item.catedra.substring(0, 4).toUpperCase();
                        const insSub = db.prepare(`
                            INSERT INTO subjects (career_id, name, code, year_level, weekly_hours)
                            VALUES (?, ?, ?, 1, ?)
                        `).run(defaultCareer.id, item.catedra, code, item.horas);
                        subjectId = insSub.lastInsertRowid;
                    } else {
                        subjectId = subject.id;
                    }

                    // Verificar si ya existe esta designación para este docente
                    const existingDesig = db.prepare(`
                        SELECT id FROM designations 
                        WHERE teacher_id = ? AND subject_id = ? AND is_active = 1
                    `).get(teacherId, subjectId);

                    if (!existingDesig) {
                        const dayVal = item.dia && item.dia !== '-' ? item.dia : 'Lunes';
                        const timeVal = item.horario && item.horario !== '-' ? item.horario : '18:00 a 20:00';
                        const times = timeVal.split(/a|-/);
                        const startTime = times[0] ? times[0].trim() : '18:00';
                        const endTime = times[1] ? times[1].trim() : '20:00';
                        const currentYear = new Date().getFullYear();

                        db.prepare(`
                            INSERT INTO designations (
                                subject_id, teacher_id, day_of_week, start_time, end_time,
                                hours_count, resolution_number, academic_year, is_active, cargo, revista
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'Profesor', ?)
                        `).run(
                            subjectId, teacherId, dayVal, startTime, endTime,
                            item.horas, item.resolucion || 'Disp. Pendiente', currentYear, item.revista
                        );
                        createdDesignations++;
                    }
                }
            }

            db.exec('COMMIT;');

            AuditService.log(
                currentUser ? currentUser.id : null,
                username,
                'IMPORTACION_CSV_PERSONAL',
                `Importación CSV completada: ${insertedTeachers} docentes creados, ${updatedTeachers} actualizados, ${createdDesignations} cátedras asignadas.`
            );

            return {
                success: true,
                message: `Importación completada con éxito. Se registraron ${insertedTeachers} nuevos docentes, se actualizaron ${updatedTeachers} y se asignaron ${createdDesignations} cátedras.`,
                insertedTeachers,
                updatedTeachers,
                createdDesignations,
                errors: processedErrors
            };
        } catch (error) {
            try {
                db.exec('ROLLBACK;');
            } catch (_) {}
            console.error('[CsvImportService] Error en transacción de importación:', error);
            return {
                success: false,
                message: `Error al procesar la importación en base de datos: ${error.message}`,
                insertedTeachers: 0,
                updatedTeachers: 0,
                createdDesignations: 0,
                errors: [error.message]
            };
        }
    }

    // -------------------------------------------------------------
    // IMPORTACIÓN DE ASISTENCIAS HISTÓRICAS / OPERATIVAS
    // -------------------------------------------------------------

    /**
     * Valida y previsualiza la importación de asistencias a partir de un archivo CSV.
     */
    static previewAttendance(csvText) {
        const db = getDatabase();
        const { rows } = this.parseCsv(csvText);

        if (rows.length === 0) {
            return {
                success: false,
                message: 'El archivo CSV de asistencias está vacío o no contiene registros válidos.',
                totalRows: 0,
                validRows: 0,
                invalidRows: 0,
                errors: [],
                preview: []
            };
        }

        const teachers = db.prepare('SELECT id, dni, legajo, first_name, last_name FROM teachers').all();
        const teacherByDni = new Map();
        for (const t of teachers) {
            teacherByDni.set(String(t.dni).trim(), t);
        }

        const errors = [];
        const preview = [];
        let validCount = 0;
        let invalidCount = 0;

        for (const row of rows) {
            const lineNum = row._rawLineNumber;
            const rowErrors = [];

            const rawDni = row.dni || row.documento || row.doc || '';
            const cleanDni = String(rawDni).replace(/\./g, '').replace(/\s+/g, '').trim();

            const rawFecha = row.fecha || row.date || row.dia || '';
            const parsedDate = this._parseDate(rawFecha);

            const rawEstado = (row.estado || row.marca || row.asistencia || '').trim().toUpperCase();
            const normalizedStatus = this._normalizeAttendanceStatus(rawEstado);

            const rawHoras = row.horas || row.cant_horas || '4';
            const horas = parseInt(rawHoras, 10) || 4;

            const observaciones = (row.observaciones || row.motivo || row.detalle || '').trim();

            // Validaciones
            const teacher = teacherByDni.get(cleanDni);
            if (!cleanDni) {
                rowErrors.push('DNI obligatorio no indicado.');
            } else if (!teacher) {
                rowErrors.push(`No existe ningún docente registrado con el DNI "${cleanDni}". Debe cargarlo previamente en Planta Funcional.`);
            }

            if (!parsedDate) {
                rowErrors.push(`Formato de fecha inválido: "${rawFecha}". Use AAAA-MM-DD o DD/MM/AAAA.`);
            }

            if (!normalizedStatus) {
                rowErrors.push(`Marca de asistencia no válida: "${rawEstado}". Catálogo cerrado admitido: PR, I, P, LIC, LT.`);
            }

            const isValid = rowErrors.length === 0;
            if (isValid) validCount++;
            else invalidCount++;

            if (rowErrors.length > 0) {
                errors.push({
                    line: lineNum,
                    dni: cleanDni,
                    errors: rowErrors
                });
            }

            preview.push({
                line: lineNum,
                dni: cleanDni,
                teacherName: teacher ? `${teacher.last_name}, ${teacher.first_name}` : 'Docente Inexistente',
                fecha: parsedDate || rawFecha,
                estado: normalizedStatus || rawEstado,
                horas,
                observaciones,
                status: isValid ? 'VÁLIDO' : 'OBSERVADO',
                errorMessages: rowErrors.join(' | ')
            });
        }

        return {
            success: true,
            totalRows: rows.length,
            validRows: validCount,
            invalidRows: invalidCount,
            errors,
            preview: preview.slice(0, 100)
        };
    }

    /**
     * Persiste los registros de asistencia en lote.
     */
    static importAttendance(csvText) {
        const db = getDatabase();
        const validation = this.previewAttendance(csvText);

        if (!validation.success) {
            return validation;
        }

        const currentUser = AuthService.getCurrentUser();
        const username = currentUser ? currentUser.username : 'SECRETARIA';

        const teachers = db.prepare('SELECT id, dni FROM teachers').all();
        const teacherByDni = new Map();
        for (const t of teachers) {
            teacherByDni.set(String(t.dni).trim(), t.id);
        }

        let importedCount = 0;
        const processedErrors = [];

        try {
            db.exec('BEGIN TRANSACTION;');
            const now = new Date().toISOString();

            for (const item of validation.preview) {
                if (item.status !== 'VÁLIDO') {
                    processedErrors.push(`Línea ${item.line} (DNI ${item.dni}): ${item.errorMessages}`);
                    continue;
                }

                const teacherId = teacherByDni.get(item.dni);
                if (!teacherId) continue;

                // Verificar si ya existe un registro de asistencia para este docente en esa fecha
                const existing = db.prepare(`
                    SELECT id FROM attendances 
                    WHERE teacher_id = ? AND date = ? AND is_active = 1
                `).get(teacherId, item.fecha);

                if (existing) {
                    db.prepare(`
                        UPDATE attendances
                        SET status = ?, hours = ?, observations = ?, registered_by = ?
                        WHERE id = ?
                    `).run(item.estado, item.horas, item.observaciones, username, existing.id);
                } else {
                    db.prepare(`
                        INSERT INTO attendances (
                            teacher_id, designation_id, date, status, hours, observations, is_active, created_at, registered_by
                        ) VALUES (?, NULL, ?, ?, ?, ?, 1, ?, ?)
                    `).run(teacherId, item.fecha, item.estado, item.horas, item.observaciones, now, username);
                }
                importedCount++;
            }

            db.exec('COMMIT;');

            AuditService.log(
                currentUser ? currentUser.id : null,
                username,
                'IMPORTACION_CSV_ASISTENCIA',
                `Importación CSV de asistencias completada: ${importedCount} registros procesados.`
            );

            return {
                success: true,
                message: `Importación de asistencias completada con éxito. Se procesaron ${importedCount} registros.`,
                importedCount,
                errors: processedErrors
            };
        } catch (error) {
            try {
                db.exec('ROLLBACK;');
            } catch (_) {}
            console.error('[CsvImportService] Error en transacción de asistencias:', error);
            return {
                success: false,
                message: `Error al procesar la importación: ${error.message}`,
                importedCount: 0,
                errors: [error.message]
            };
        }
    }

    static _parseDate(dateStr) {
        if (!dateStr) return null;
        const s = dateStr.trim();
        // Formato ISO YYYY-MM-DD
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
            return s;
        }
        // Formato DD/MM/YYYY o DD-MM-YYYY
        const match = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
        if (match) {
            const day = match[1].padStart(2, '0');
            const month = match[2].padStart(2, '0');
            const year = match[3];
            return `${year}-${month}-${day}`;
        }
        return null;
    }

    static _normalizeAttendanceStatus(status) {
        if (!status) return null;
        const s = status.trim().toUpperCase();
        if (['PR', 'PRESENTE', 'P_PRESENTE'].includes(s)) return 'PR';
        if (['I', 'INASISTENCIA', 'FALTA', 'AUSENTE'].includes(s)) return 'I';
        if (['P', 'PERMISO', 'ART_115', '115'].includes(s)) return 'P';
        if (['LIC', 'LICENCIA', 'MEDICA', 'ART_114A', '114A'].includes(s)) return 'LIC';
        if (['LT', 'LARGO_TRATAMIENTO', '114B'].includes(s)) return 'LT';
        return null;
    }
}

module.exports = { CsvImportService };
