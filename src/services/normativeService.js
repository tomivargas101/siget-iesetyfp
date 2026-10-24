/**
 * Catálogo y Clasificador Normativo Institucional para SIGET (RN-01 a RN-08)
 * Reglas de negocio para personal docente, novedades de asistencia y cuadros mensuales IL-01 e IL-02.
 * Basado en el Documento de Requerimientos Institucionales Versión 2.0.
 */

// ==============================================================================
// CATÁLOGO MAESTRO DE LICENCIAS Y NOVEDADES (HOJAS 1 A 6)
// ==============================================================================
const MASTER_LICENSE_CATALOG = [
    // --- HOJA 1: Licencias Médicas de Corto Tratamiento / Afección Común (Cuadro IL-01) ---
    {
        sheet: 1,
        sheetName: 'Hoja 1: Enfermedad Corto Tratamiento',
        article: 'Art. 114 a',
        code: '114A',
        name: 'Afección Común / Corto Tratamiento de Salud',
        targetCuadro: 'IL-01',
        isMedical: true,
        maxDaysAnnual: 25
    },
    {
        sheet: 1,
        sheetName: 'Hoja 1: Enfermedad Corto Tratamiento',
        article: 'Art. 47',
        code: 'ART-47',
        name: 'Enfermedad Personal Común / Reposo Médico',
        targetCuadro: 'IL-01',
        isMedical: true,
        maxDaysAnnual: 30
    },
    {
        sheet: 1,
        sheetName: 'Hoja 1: Enfermedad Corto Tratamiento',
        article: 'Art. 114 c',
        code: '114C',
        name: 'Atención Familiar Enfermo',
        targetCuadro: 'IL-01',
        isMedical: true,
        maxDaysAnnual: 20
    },

    // --- HOJA 2: Licencias Médicas de Largo Tratamiento y Riesgos de Trabajo (Cuadro IL-01) ---
    {
        sheet: 2,
        sheetName: 'Hoja 2: Largo Tratamiento y ART',
        article: 'Art. 114 b',
        code: '114B',
        name: 'Largo Tratamiento de Salud (LT)',
        targetCuadro: 'IL-01',
        isMedical: true,
        maxDaysAnnual: 730
    },
    {
        sheet: 2,
        sheetName: 'Hoja 2: Largo Tratamiento y ART',
        article: 'Art. 48',
        code: 'ART-48',
        name: 'Tratamiento Médico Prolongado / Junta Médica',
        targetCuadro: 'IL-01',
        isMedical: true,
        maxDaysAnnual: 730
    },
    {
        sheet: 2,
        sheetName: 'Hoja 2: Largo Tratamiento y ART',
        article: 'Art. 70',
        code: 'ART-70',
        name: 'Accidente de Trabajo / ART',
        targetCuadro: 'IL-01',
        isMedical: true,
        maxDaysAnnual: null
    },

    // --- HOJA 3: Inasistencias y Permisos Particulares (Cuadro IL-02) ---
    {
        sheet: 3,
        sheetName: 'Hoja 3: Inasistencias y Permisos',
        article: 'Inasistencia Injustificada',
        code: 'I',
        name: 'Inasistencia sin Aviso / Injustificada',
        targetCuadro: 'IL-02',
        isMedical: false,
        maxDaysAnnual: 10
    },
    {
        sheet: 3,
        sheetName: 'Hoja 3: Inasistencias y Permisos',
        article: 'Inasistencia Justificada',
        code: 'IJ',
        name: 'Inasistencia Justificada con Aviso',
        targetCuadro: 'IL-02',
        isMedical: false,
        maxDaysAnnual: 10
    },
    {
        sheet: 3,
        sheetName: 'Hoja 3: Inasistencias y Permisos',
        article: 'Art. 115',
        code: '115',
        name: 'Razones Particulares / Asuntos Personales (P)',
        targetCuadro: 'IL-02',
        isMedical: false,
        maxDaysAnnual: 6 // Tope estatutario anual
    },
    {
        sheet: 3,
        sheetName: 'Hoja 3: Inasistencias y Permisos',
        article: 'Permiso Especial',
        code: 'P',
        name: 'Permiso Oficial con Goce de Haberes',
        targetCuadro: 'IL-02',
        isMedical: false,
        maxDaysAnnual: 6
    },

    // --- HOJA 4: Licencias por Maternidad, Paternidad y Familia (Cuadro IL-02) ---
    {
        sheet: 4,
        sheetName: 'Hoja 4: Maternidad y Familia',
        article: 'Art. 114 d',
        code: '114D',
        name: 'Maternidad y Nacimiento',
        targetCuadro: 'IL-02',
        isMedical: false,
        maxDaysAnnual: 135
    },
    {
        sheet: 4,
        sheetName: 'Hoja 4: Maternidad y Familia',
        article: 'Art. 114 e',
        code: '114E',
        name: 'Paternidad / Nacimiento de Hijo',
        targetCuadro: 'IL-02',
        isMedical: false,
        maxDaysAnnual: 15
    },
    {
        sheet: 4,
        sheetName: 'Hoja 4: Maternidad y Familia',
        article: 'Art. 114 f',
        code: '114F',
        name: 'Adopción',
        targetCuadro: 'IL-02',
        isMedical: false,
        maxDaysAnnual: 90
    },
    {
        sheet: 4,
        sheetName: 'Hoja 4: Maternidad y Familia',
        article: 'Art. 114 g',
        code: '114G',
        name: 'Lactancia y Franquicia de Cuidado',
        targetCuadro: 'IL-02',
        isMedical: false,
        maxDaysAnnual: null
    },

    // --- HOJA 5: Licencias por Duelo, Matrimonio y Eventos Familiares (Cuadro IL-02) ---
    {
        sheet: 5,
        sheetName: 'Hoja 5: Duelo y Matrimonio',
        article: 'Art. 114 h',
        code: '114H',
        name: 'Duelo Familiar de 1er Grado (Padres/Cónyuge/Hijos)',
        targetCuadro: 'IL-02',
        isMedical: false,
        maxDaysAnnual: 5
    },
    {
        sheet: 5,
        sheetName: 'Hoja 5: Duelo y Matrimonio',
        article: 'Art. 114 i',
        code: '114I',
        name: 'Duelo Familiar de 2do Grado (Hermanos/Abuelos)',
        targetCuadro: 'IL-02',
        isMedical: false,
        maxDaysAnnual: 3
    },
    {
        sheet: 5,
        sheetName: 'Hoja 5: Duelo y Matrimonio',
        article: 'Art. 114 j',
        code: '114J',
        name: 'Matrimonio del Docente',
        targetCuadro: 'IL-02',
        isMedical: false,
        maxDaysAnnual: 10
    },
    {
        sheet: 5,
        sheetName: 'Hoja 5: Duelo y Matrimonio',
        article: 'Art. 114 k',
        code: '114K',
        name: 'Matrimonio de Hijos',
        targetCuadro: 'IL-02',
        isMedical: false,
        maxDaysAnnual: 2
    },

    // --- HOJA 6: Licencias Especiales, Exámenes, Perfeccionamiento y Gremial (Cuadro IL-02) ---
    {
        sheet: 6,
        sheetName: 'Hoja 6: Exámenes y Licencias Especiales',
        article: 'Art. 114 l',
        code: '114L',
        name: 'Mesa de Examen / Estudio y Perfeccionamiento',
        targetCuadro: 'IL-02',
        isMedical: false,
        maxDaysAnnual: 28
    },
    {
        sheet: 6,
        sheetName: 'Hoja 6: Exámenes y Licencias Especiales',
        article: 'Art. 114 m',
        code: '114M',
        name: 'Donación de Sangre',
        targetCuadro: 'IL-02',
        isMedical: false,
        maxDaysAnnual: 2
    },
    {
        sheet: 6,
        sheetName: 'Hoja 6: Exámenes y Licencias Especiales',
        article: 'Art. 114 n',
        code: '114N',
        name: 'Actividad Gremial y Representación',
        targetCuadro: 'IL-02',
        isMedical: false,
        maxDaysAnnual: null
    },
    {
        sheet: 6,
        sheetName: 'Hoja 6: Exámenes y Licencias Especiales',
        article: 'Art. 114 o',
        code: '114O',
        name: 'Fuerza Mayor / Razones Climáticas',
        targetCuadro: 'IL-02',
        isMedical: false,
        maxDaysAnnual: null
    },
    {
        sheet: 6,
        sheetName: 'Hoja 6: Exámenes y Licencias Especiales',
        article: 'Art. 114 p',
        code: '114P',
        name: 'Cargo de Mayor Jerarquía / Reserva de Cargo',
        targetCuadro: 'IL-02',
        isMedical: false,
        maxDaysAnnual: null
    }
];

const MEDICAL_KEYWORDS = [
    'art. 48', 'art 48', 'art. 47', 'art 47',
    'art. 114 a', 'art 114 a', 'art. 114a', '114a',
    'art. 114 b', 'art 114 b', 'art. 114b', '114b',
    'art. 114 c', 'art 114 c', 'art. 114c', '114c',
    'art. 70', 'art 70',
    'salud', 'médic', 'medic', 'enferm', 'patolog', 'quirurg', 'quirúrg',
    'reposo', 'psicol', 'psiquiatr', 'odontol', 'accidente',
    'tratamiento médico', 'familiar enfermo', 'aislamiento', 'covid', 'lt'
];

const ABSENCE_KEYWORDS = [
    'inasistencia', 'falta', 'ausente', 'no asistió', 'no asistio', 'sin aviso', 'con aviso'
];

const INSTITUTIONAL_OFFICE = 1452; // RN-07: Código oficial

class NormativeService {
    /**
     * Retorna el catálogo maestro completo de licencias y novedades.
     */
    static getMasterCatalog() {
        return MASTER_LICENSE_CATALOG;
    }

    /**
     * RN-01: Normaliza el DNI a string puro, preservando ceros iniciales y removiendo puntos.
     */
    static normalizeDni(dni) {
        if (dni === null || dni === undefined) return '';
        let cleaned = String(dni).trim().replace(/\./g, '').replace(/,/g, '');
        cleaned = cleaned.replace(/\D/g, '');
        return cleaned;
    }

    /**
     * Busca los detalles de un artículo o código en el catálogo maestro.
     * Autocompleta el código y deriva al cuadro correspondiente (IL-01 o IL-02).
     */
    static getArticleDetails(searchKey) {
        if (!searchKey) return null;
        const normKey = String(searchKey).toLowerCase().trim();
        const cleanKey = normKey.replace(/[^a-z0-9]/g, '');

        // 1. Coincidencia exacta por código o artículo
        const exact = MASTER_LICENSE_CATALOG.find(item => {
            const cleanCode = item.code.toLowerCase().replace(/[^a-z0-9]/g, '');
            const cleanArt = item.article.toLowerCase().replace(/[^a-z0-9]/g, '');
            return item.code.toLowerCase() === normKey || 
                   item.article.toLowerCase() === normKey ||
                   cleanCode === cleanKey ||
                   cleanArt === cleanKey;
        });
        if (exact) return exact;

        // 2. Coincidencia parcial o por prefijo (ej: 114-A-1 -> 114A)
        const partial = MASTER_LICENSE_CATALOG.find(item => {
            const cleanCode = item.code.toLowerCase().replace(/[^a-z0-9]/g, '');
            const cleanArt = item.article.toLowerCase().replace(/[^a-z0-9]/g, '');
            return normKey.includes(item.code.toLowerCase()) ||
                   normKey.includes(item.article.toLowerCase()) ||
                   item.name.toLowerCase().includes(normKey) ||
                   (cleanCode.length >= 3 && cleanKey.startsWith(cleanCode)) ||
                   (cleanArt.length >= 3 && cleanKey.startsWith(cleanArt));
        });
        if (partial) return partial;

        // 3. Si no está explícito en catálogo, clasificar por heurística
        const isMed = this.isMedicalLicense(normKey);
        return {
            sheet: isMed ? 1 : 3,
            sheetName: isMed ? 'Hoja 1: Salud' : 'Hoja 3: Inasistencias y Permisos',
            article: searchKey,
            code: isMed ? 'MED-GEN' : 'GEN-NO-MED',
            name: searchKey,
            targetCuadro: isMed ? 'IL-01' : 'IL-02',
            isMedical: isMed,
            maxDaysAnnual: isMed ? 25 : 6
        };
    }

    /**
     * RN-04: Determina si una novedad o motivo corresponde al Cuadro IL-01 / DL-01 (Salud).
     * Hojas 1 y 2 del catálogo maestro.
     */
    static isMedicalLicense(text) {
        if (!text) return false;
        const normalized = String(text).toLowerCase();
        if (normalized === 'lt' || normalized === 'lic') {
            return true;
        }
        const clean = normalized.replace(/[^a-z0-9]/g, '');
        if (clean.includes('114a') || clean.includes('114b') || clean.includes('114c') || 
            clean.includes('art47') || clean.includes('art48') || clean.includes('art70')) {
            return true;
        }
        return MEDICAL_KEYWORDS.some(kw => {
            const cleanKw = kw.replace(/[^a-z0-9]/g, '');
            return normalized.includes(kw) || (cleanKw.length > 2 && clean.includes(cleanKw));
        });
    }

    /**
     * RN-06: Determina si el texto corresponde a una inasistencia (regla estricta 1 solo día).
     */
    static isAbsence(text) {
        if (!text) return false;
        const normalized = String(text).toLowerCase();
        if (normalized === 'i') return true;
        return ABSENCE_KEYWORDS.some(kw => normalized.includes(kw));
    }

    /**
     * Clasifica un registro de novedad en IL-01 o IL-02 según Hojas 1-6 del catálogo maestro.
     */
    static classifyNovelty(status, observation = '') {
        const text = `${status || ''} ${observation || ''}`.trim();
        const normStatus = (status || '').trim().toUpperCase();

        // Estado explícito LT (Largo tratamiento) -> IL-01 (Hoja 2)
        if (normStatus === 'LT') {
            return {
                targetCuadro: 'IL-01',
                aliasCuadro: 'DL-01',
                tipo: 'Licencia Médica - Largo Tratamiento (LT)',
                canGroupConsecutiveDays: true,
                code: '114B'
            };
        }

        // Estado explícito P (Permiso) -> IL-02 (Hoja 3)
        if (normStatus === 'P') {
            return {
                targetCuadro: 'IL-02',
                aliasCuadro: 'DL-02',
                tipo: 'Permiso Oficial (P)',
                canGroupConsecutiveDays: true,
                code: '115'
            };
        }

        // Estado explícito I (Inasistencia) -> IL-02 (Hoja 3)
        if (normStatus === 'I' || (!this.isMedicalLicense(text) && this.isAbsence(text))) {
            return {
                targetCuadro: 'IL-02',
                aliasCuadro: 'DL-02',
                tipo: 'Inasistencia (I)',
                canGroupConsecutiveDays: false, // RN-06: 1 solo día
                code: 'I'
            };
        }

        // Comprobación contra Catálogo Maestro (Hojas 1-2 estrictamente a IL-01)
        const details = this.getArticleDetails(text) || this.getArticleDetails(status);
        if (details && (details.sheet === 1 || details.sheet === 2 || details.isMedical || details.targetCuadro === 'IL-01')) {
            return {
                targetCuadro: 'IL-01',
                aliasCuadro: 'DL-01',
                tipo: details.name || 'Licencia Médica / Salud',
                canGroupConsecutiveDays: true,
                code: details.code || '114A'
            };
        }

        // Licencias Médicas (Hojas 1-2) por heurística -> IL-01
        if (normStatus === 'LIC' || this.isMedicalLicense(text)) {
            return {
                targetCuadro: 'IL-01',
                aliasCuadro: 'DL-01',
                tipo: 'Licencia Médica / Salud',
                canGroupConsecutiveDays: true,
                code: details ? details.code : '114A'
            };
        }

        // Otras licencias (Hojas 3-6) -> IL-02
        return {
            targetCuadro: 'IL-02',
            aliasCuadro: 'DL-02',
            tipo: details ? details.name : 'Novedad / Licencia Ordinaria',
            canGroupConsecutiveDays: true,
            code: details ? details.code : 'ORD-GEN'
        };
    }

    /**
     * Formatea fecha YYYY-MM-DD a DD/MM/YYYY (RN-07)
     */
    static formatDate(dateStr) {
        if (!dateStr) return '';
        if (typeof dateStr === 'string' && dateStr.includes('-')) {
            const parts = dateStr.split('-');
            if (parts.length === 3) {
                return `${parts[2].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[0]}`;
            }
        }
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return String(dateStr);
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${day}/${month}/${year}`;
    }

    static getInstitutionalOffice() {
        return INSTITUTIONAL_OFFICE;
    }

    static getCurrentYear() {
        return new Date().getFullYear();
    }

    static getClosedStatusCodes() {
        return ['PR', 'I', 'P', 'LIC', 'LT'];
    }
}

module.exports = {
    NormativeService,
    MASTER_LICENSE_CATALOG,
    NORMATIVE_CATALOG: MASTER_LICENSE_CATALOG,
    MEDICAL_KEYWORDS,
    ABSENCE_KEYWORDS,
    INSTITUTIONAL_OFFICE
};
