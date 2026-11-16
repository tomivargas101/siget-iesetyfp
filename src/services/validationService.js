const { getDatabase } = require('../database/db');

class ValidationService {
    static validateDni(dni) {
        if (dni === null || dni === undefined || String(dni).trim() === '') {
            return { isValid: false, message: 'El DNI es un campo obligatorio.' };
        }
        const raw = String(dni).trim();
        const cleanDni = raw.replace(/[\.\s\-]/g, '');

        if (!/^\d+$/.test(cleanDni)) {
            return { isValid: false, message: `El DNI solo puede contener dígitos numéricos. Se ingresó: "${raw}".` };
        }

        if (cleanDni.length < 6 || cleanDni.length > 8) {
            return {
                isValid: false,
                message: `El DNI debe contener 7 u 8 dígitos numéricos válidos (ej. 28456123). Se ingresó un valor incompleto o fuera de rango: "${raw}".`
            };
        }

        return { isValid: true, cleanDni, message: 'DNI válido.' };
    }

    static validateCuil(cuil, dni = null) {
        if (cuil === null || cuil === undefined || String(cuil).trim() === '') {
            return { isValid: true, cleanCuil: null, message: '' };
        }
        const raw = String(cuil).trim();
        const cleanDigits = raw.replace(/\D/g, '');

        if (cleanDigits.length !== 11) {
            return {
                isValid: false,
                message: `El CUIL/CUIT debe contener exactamente 11 dígitos numéricos (ej. 20-28456123-7). Se recibió: "${raw}".`
            };
        }

        const prefix = cleanDigits.slice(0, 2);
        const validPrefixes = ['20', '23', '24', '27', '30', '33', '34'];
        if (!validPrefixes.includes(prefix)) {
            return {
                isValid: false,
                message: `El prefijo del CUIL "${prefix}" no es válido en el sistema argentino (valores admitidos: 20, 23, 24, 27, 30, 33, 34).`
            };
        }

        if (dni) {
            const cleanDni = String(dni).replace(/\D/g, '');
            const cuilDniPart = cleanDigits.slice(2, 10);
            const matches = (cuilDniPart === cleanDni) ||
                (cleanDni.length === 7 && (cuilDniPart === '0' + cleanDni || cleanDigits.slice(3, 10) === cleanDni)) ||
                (cleanDni.length === 6 && cuilDniPart.endsWith(cleanDni));
            if (!matches) {
                return {
                    isValid: false,
                    message: `El DNI contenido en el CUIL (${cuilDniPart}) no coincide con el DNI del docente (${cleanDni}).`
                };
            }
        }

        const formattedCuil = `${cleanDigits.slice(0, 2)}-${cleanDigits.slice(2, 10)}-${cleanDigits.slice(10)}`;
        return { isValid: true, cleanCuil: formattedCuil, message: 'CUIL válido.' };
    }

    static validatePersonName(name, fieldName = 'Nombre', minLen = 2, maxLen = 100) {
        if (name === null || name === undefined || String(name).trim() === '') {
            return { isValid: false, message: `El campo ${fieldName} es obligatorio y no puede estar vacío.` };
        }
        const trimmed = String(name).trim();

        if (trimmed.length < minLen) {
            return { isValid: false, message: `El campo ${fieldName} debe contener al menos ${minLen} caracteres.` };
        }
        if (trimmed.length > maxLen) {
            return { isValid: false, message: `El campo ${fieldName} no puede exceder los ${maxLen} caracteres.` };
        }

        if (!/^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s'\-\._]+$/.test(trimmed)) {
            return {
                isValid: false,
                message: `El campo ${fieldName} solo puede contener letras y signos de puntuación válidos (sin números ni símbolos no permitidos).`
            };
        }

        const lettersOnly = trimmed.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ]/g, '');
        if (/^(.)\1+$/i.test(lettersOnly) && lettersOnly.length <= 4) {
            return {
                isValid: false,
                message: `El valor ingresado para ${fieldName} ("${trimmed}") no parece un nombre o apellido válido.`
            };
        }

        if (lettersOnly.length <= 4 && !/[aeiouáéíóúyü]/i.test(lettersOnly)) {
            return {
                isValid: false,
                message: `El valor ingresado para ${fieldName} ("${trimmed}") no contiene vocales válidas.`
            };
        }

        return { isValid: true, cleanName: trimmed, message: 'Válido.' };
    }

    static validateLegajo(legajo) {
        if (legajo === null || legajo === undefined || String(legajo).trim() === '') {
            return { isValid: false, message: 'El número de Legajo es obligatorio.' };
        }
        const trimmed = String(legajo).trim();

        if (trimmed.length < 2) {
            return { isValid: false, message: 'El Legajo debe tener al menos 2 caracteres.' };
        }
        if (trimmed.length > 50) {
            return { isValid: false, message: 'El Legajo no puede superar los 50 caracteres.' };
        }

        if (!/[a-zA-Z0-9]/.test(trimmed)) {
            return { isValid: false, message: 'El Legajo debe contener al menos un carácter alfanumérico.' };
        }

        return { isValid: true, cleanLegajo: trimmed, message: 'Legajo válido.' };
    }

    static validateEmail(email, isRequired = false) {
        if (email === null || email === undefined || String(email).trim() === '') {
            if (isRequired) {
                return { isValid: false, message: 'El correo electrónico es obligatorio.' };
            }
            return { isValid: true, cleanEmail: null, message: '' };
        }
        const trimmed = String(email).trim().toLowerCase();
        const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

        if (!emailRegex.test(trimmed)) {
            return {
                isValid: false,
                message: `El correo electrónico "${trimmed}" tiene un formato inválido. Debe ser del tipo usuario@dominio.com.`
            };
        }

        return { isValid: true, cleanEmail: trimmed, message: 'Email válido.' };
    }

    static validatePhone(phone, isRequired = false) {
        if (phone === null || phone === undefined || String(phone).trim() === '') {
            if (isRequired) {
                return { isValid: false, message: 'El teléfono es obligatorio.' };
            }
            return { isValid: true, cleanPhone: null, message: '' };
        }
        const trimmed = String(phone).trim();
        if (!/^[0-9+()\s\-]{6,25}$/.test(trimmed)) {
            return {
                isValid: false,
                message: `El formato de teléfono "${trimmed}" contiene caracteres no válidos.`
            };
        }
        const digitsCount = trimmed.replace(/\D/g, '').length;
        if (digitsCount < 6) {
            return {
                isValid: false,
                message: `El teléfono debe contener al menos 6 dígitos numéricos. Se ingresó: "${trimmed}".`
            };
        }

        return { isValid: true, cleanPhone: trimmed, message: 'Teléfono válido.' };
    }

    static validateRevista(revista) {
        const valid = ['Titular', 'Provisional', 'Interino', 'Suplente'];
        if (!revista || !valid.includes(revista)) {
            return {
                isValid: false,
                message: `Situación de revista no válida ("${revista}"). Debe ser: ${valid.join(', ')}.`
            };
        }
        return { isValid: true, cleanRevista: revista, message: 'Revista válida.' };
    }

    static validateTime(timeStr, fieldLabel = 'Horario') {
        if (!timeStr || typeof timeStr !== 'string') {
            return { isValid: false, message: `El campo ${fieldLabel} es obligatorio.` };
        }
        const trimmed = timeStr.trim();
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(trimmed)) {
            return {
                isValid: false,
                message: `El campo ${fieldLabel} debe tener formato HH:MM (00:00 a 23:59). Se recibió: "${trimmed}".`
            };
        }
        return { isValid: true, cleanTime: trimmed, message: 'Horario válido.' };
    }

    static validateTimeRange(startTime, endTime) {
        const startVal = this.validateTime(startTime, 'Hora de inicio');
        if (!startVal.isValid) return startVal;

        const endVal = this.validateTime(endTime, 'Hora de finalización');
        if (!endVal.isValid) return endVal;

        const toMinutes = (t) => {
            const [h, m] = t.split(':').map(Number);
            return h * 60 + m;
        };

        const startMin = toMinutes(startVal.cleanTime);
        const endMin = toMinutes(endVal.cleanTime);

        if (endMin <= startMin) {
            return {
                isValid: false,
                message: `La hora de finalización (${endTime}) debe ser estrictamente posterior a la hora de inicio (${startTime}).`
            };
        }

        const duration = endMin - startMin;
        if (duration < 15) {
            return {
                isValid: false,
                message: `La franja horaria debe tener una duración mínima de al menos 15 minutos (se ingresaron ${duration} minutos).`
            };
        }

        return { isValid: true, durationMinutes: duration, message: 'Rango horario válido.' };
    }

    static validateDate(dateStr, fieldLabel = 'Fecha', isRequired = true) {
        if (!dateStr || String(dateStr).trim() === '') {
            if (isRequired) {
                return { isValid: false, message: `El campo ${fieldLabel} es obligatorio.` };
            }
            return { isValid: true, cleanDate: null, message: '' };
        }
        const trimmed = String(dateStr).trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
            return {
                isValid: false,
                message: `El campo ${fieldLabel} debe tener formato AAAA-MM-DD. Se recibió: "${trimmed}".`
            };
        }
        const [y, m, d] = trimmed.split('-').map(Number);
        if (y < 1950 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) {
            return { isValid: false, message: `La ${fieldLabel} "${trimmed}" está fuera del rango calendario institucional permitido.` };
        }
        const dateObj = new Date(y, m - 1, d);
        if (dateObj.getFullYear() !== y || dateObj.getMonth() !== (m - 1) || dateObj.getDate() !== d) {
            return { isValid: false, message: `La ${fieldLabel} "${trimmed}" no existe en el calendario.` };
        }
        return { isValid: true, cleanDate: trimmed, message: 'Fecha válida.' };
    }

    static validateAttendanceStatus(status) {
        const valid = ['PR', 'I', 'P', 'LIC', 'LT'];
        if (!status || !valid.includes(String(status).trim().toUpperCase())) {
            return {
                isValid: false,
                message: `Estado de asistencia inválido: "${status}". Los estados permitidos por normativa son: ${valid.join(', ')}.`
            };
        }
        return { isValid: true, cleanStatus: String(status).trim().toUpperCase(), message: 'Estado válido.' };
    }

    static validateUsername(username) {
        if (!username || String(username).trim() === '') {
            return { isValid: false, message: 'El nombre de usuario es obligatorio.' };
        }
        const trimmed = String(username).trim();
        if (trimmed.length < 3 || trimmed.length > 30) {
            return { isValid: false, message: 'El nombre de usuario debe tener entre 3 y 30 caracteres.' };
        }
        if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
            return { isValid: false, message: 'El nombre de usuario solo puede contener letras, números y guión bajo (_).' };
        }
        return { isValid: true, cleanUsername: trimmed.toLowerCase(), message: 'Usuario válido.' };
    }

    static validatePassword(password, minLen = 6) {
        if (!password || typeof password !== 'string') {
            return { isValid: false, message: 'La contraseña es obligatoria.' };
        }
        if (password.length < minLen) {
            return { isValid: false, message: `La contraseña debe contener al menos ${minLen} caracteres.` };
        }
        if (password.trim().length === 0) {
            return { isValid: false, message: 'La contraseña no puede consistir únicamente en espacios en blanco.' };
        }
        return { isValid: true, message: 'Contraseña válida.' };
    }

    static validateRole(role) {
        if (!role) {
            return { isValid: false, message: 'El rol institucional es obligatorio.' };
        }
        const r = String(role).trim().toUpperCase();
        if (r !== 'SECRETARIA' && r !== 'BEDEL') {
            return {
                isValid: false,
                message: `Rol institucional inválido: "${role}". La normativa autoriza únicamente "Secretaría" o "Bedelía".`
            };
        }
        return { isValid: true, cleanRole: r, message: 'Rol válido.' };
    }

    static validateTeacherPayload(payload) {
        if (!payload || typeof payload !== 'object') {
            return { isValid: false, message: 'Datos del docente no válidos o vacíos.' };
        }

        const fieldErrors = {};

        const dniVal = this.validateDni(payload.dni);
        if (!dniVal.isValid) {
            fieldErrors.dni = dniVal.message;
        }

        const legajoVal = this.validateLegajo(payload.legajo);
        if (!legajoVal.isValid) {
            fieldErrors.legajo = legajoVal.message;
        }

        const lastNameVal = this.validatePersonName(payload.lastName || payload.last_name, 'Apellido', 2, 100);
        if (!lastNameVal.isValid) {
            fieldErrors.lastName = lastNameVal.message;
        }

        const firstNameVal = this.validatePersonName(payload.firstName || payload.first_name, 'Nombre', 2, 100);
        if (!firstNameVal.isValid) {
            fieldErrors.firstName = firstNameVal.message;
        }

        const cuilVal = this.validateCuil(payload.cuil, dniVal.isValid ? dniVal.cleanDni : null);
        if (!cuilVal.isValid) {
            fieldErrors.cuil = cuilVal.message;
        }

        const emailVal = this.validateEmail(payload.email, false);
        if (!emailVal.isValid) {
            fieldErrors.email = emailVal.message;
        }

        const phoneVal = this.validatePhone(payload.phone, false);
        if (!phoneVal.isValid) {
            fieldErrors.phone = phoneVal.message;
        }

        const revistaVal = this.validateRevista(payload.revista || 'Titular');
        if (!revistaVal.isValid) {
            fieldErrors.revista = revistaVal.message;
        }

        let maxWeeklyHours = 30;
        if (payload.maxWeeklyHours !== undefined && payload.maxWeeklyHours !== null && payload.maxWeeklyHours !== '') {
            const mh = Number(payload.maxWeeklyHours);
            if (!Number.isInteger(mh) || mh < 1 || mh > 60) {
                fieldErrors.maxWeeklyHours = 'El tope semanal debe ser un número entero entre 1 y 60 horas.';
            } else {
                maxWeeklyHours = mh;
            }
        }

        const errorKeys = Object.keys(fieldErrors);
        if (errorKeys.length > 0) {
            return {
                isValid: false,
                message: fieldErrors[errorKeys[0]],
                fieldErrors
            };
        }

        return {
            isValid: true,
            message: 'Datos del docente válidos.',
            cleanData: {
                id: (payload.id !== undefined && payload.id !== null && payload.id !== '') ? Number(payload.id) : null,
                dni: dniVal.cleanDni,
                legajo: legajoVal.cleanLegajo,
                lastName: lastNameVal.cleanName,
                firstName: firstNameVal.cleanName,
                cuil: cuilVal.cleanCuil,
                email: emailVal.cleanEmail,
                phone: phoneVal.cleanPhone,
                revista: revistaVal.cleanRevista,
                maxWeeklyHours,
                isActive: payload.isActive !== undefined ? Boolean(payload.isActive) : true
            }
        };
    }

    static calculateTeacherActiveHours(teacherId, excludeDesignationId = null) {
        const db = getDatabase();
        let sql = `
            SELECT COALESCE(SUM(hours_count), 0) as total
            FROM designations
            WHERE teacher_id = ? AND is_active = 1
        `;
        const params = [teacherId];
        if (excludeDesignationId) {
            if (Array.isArray(excludeDesignationId)) {
                if (excludeDesignationId.length > 0) {
                    const placeholders = excludeDesignationId.map(() => '?').join(',');
                    sql += ` AND id NOT IN (${placeholders})`;
                    params.push(...excludeDesignationId);
                }
            } else {
                sql += ' AND id != ?';
                params.push(excludeDesignationId);
            }
        }
        const row = db.prepare(sql).get(...params);
        return row ? Number(row.total) : 0;
    }

    static validateHoursLimit(teacherId, newHours, excludeDesignationId = null) {
        const db = getDatabase();
        const teacher = db.prepare('SELECT last_name, first_name, max_weekly_hours FROM teachers WHERE id = ?').get(teacherId);
        if (!teacher) {
            return { isValid: false, message: 'Docente no encontrado para validar carga horaria.' };
        }

        const maxHours = teacher.max_weekly_hours || 30;
        const currentHours = this.calculateTeacherActiveHours(teacherId, excludeDesignationId);
        const projectedHours = currentHours + Number(newHours);

        if (projectedHours > maxHours) {
            return {
                isValid: false,
                message: `LÍMITE EXCEDIDO: El docente ${teacher.last_name}, ${teacher.first_name} posee actualmente ${currentHours} hs cátedra activas. Asignar ${newHours} hs superaría el tope institucional de ${maxHours} hs semanales (Proyección: ${projectedHours} hs).`,
                currentHours,
                maxHours,
                projectedHours
            };
        }

        return {
            isValid: true,
            message: `Horas válidas (${projectedHours}/${maxHours} hs semanales).`,
            currentHours,
            maxHours,
            projectedHours
        };
    }

    static validateScheduleConflict(teacherId, dayOfWeek, startTime, endTime, excludeDesignationId = null) {
        const db = getDatabase();
        let sql = `
            SELECT d.id, d.start_time, d.end_time, s.name as subject_name
            FROM designations d
            JOIN subjects s ON d.subject_id = s.id
            WHERE d.teacher_id = ?
              AND d.day_of_week = ?
              AND d.is_active = 1
        `;
        const params = [teacherId, dayOfWeek];
        if (excludeDesignationId) {
            if (Array.isArray(excludeDesignationId)) {
                if (excludeDesignationId.length > 0) {
                    const placeholders = excludeDesignationId.map(() => '?').join(',');
                    sql += ` AND d.id NOT IN (${placeholders})`;
                    params.push(...excludeDesignationId);
                }
            } else {
                sql += ' AND d.id != ?';
                params.push(excludeDesignationId);
            }
        }

        const designations = db.prepare(sql).all(...params);

        const toMinutes = (timeStr) => {
            if (!timeStr) return 0;
            const parts = timeStr.split(':').map(Number);
            return (parts[0] * 60) + (parts[1] || 0);
        };

        const newStart = toMinutes(startTime);
        const newEnd = toMinutes(endTime);

        for (const des of designations) {
            const existStart = toMinutes(des.start_time);
            const existEnd = toMinutes(des.end_time);

            if (Math.max(newStart, existStart) < Math.min(newEnd, existEnd)) {
                return {
                    isValid: false,
                    message: `INCOMPATIBILIDAD HORARIA: Existe superposición el día ${dayOfWeek}. El docente ya dicta "${des.subject_name}" de ${des.start_time} a ${des.end_time}.`,
                    conflictingSubject: des.subject_name
                };
            }
        }

        return { isValid: true, message: 'Horario compatible sin superposición.' };
    }
}

module.exports = { ValidationService };
