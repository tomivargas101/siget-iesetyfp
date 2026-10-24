/**
 * Generador Oficial de Planillas y Reportes Mensuales Institucionales (Excel)
 * Utiliza exceljs para generar el libro oficial con 3 hojas:
 * 1. Estadística MM-YYYY
 * 2. Cuadro IL-01 (Licencias Médicas / Salud - Hojas 1-2)
 * 3. Cuadro IL-02 (Inasistencias, Permisos y Licencias Especiales - Hojas 3-6)
 * Cumple con RN-01 a RN-08 y Documento de Requerimientos Institucionales Versión 2.0.
 */

const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');
const { getDatabase } = require('../database/db');
const { AttendanceProcessor } = require('./attendanceProcessor');
const { AuditService } = require('./auditService');
const { AuthService } = require('./authService');

class ReportService {
    static async generateMonthlyWorkbook(year, month, outputDir = null) {
        const yNum = Number(year);
        const mNum = Number(month);
        const mStr = String(mNum).padStart(2, '0');
        const db = getDatabase();

        // 1. Obtener datos procesados de IL-01 e IL-02 con desglose por materia y disposición correlativa
        const processed = AttendanceProcessor.processMonthlyRecords(yNum, mNum);
        const listIL01 = processed.il01 || processed.dl01 || [];
        const listIL02 = processed.il02 || processed.dl02 || [];

        // 2. Obtener métricas estadísticas globales de la planta
        const totalDocentes = db.prepare('SELECT COUNT(*) as count FROM teachers WHERE is_active = 1').get().count;
        const titulares = db.prepare("SELECT COUNT(*) as count FROM teachers WHERE is_active = 1 AND revista = 'Titular'").get().count;
        const provisionales = db.prepare("SELECT COUNT(*) as count FROM teachers WHERE is_active = 1 AND revista = 'Provisional'").get().count;
        const interinos = db.prepare("SELECT COUNT(*) as count FROM teachers WHERE is_active = 1 AND revista = 'Interino'").get().count;
        const suplentes = db.prepare("SELECT COUNT(*) as count FROM teachers WHERE is_active = 1 AND revista = 'Suplente'").get().count;
        const totalHoras = db.prepare('SELECT COALESCE(SUM(hours_count), 0) as total FROM designations WHERE is_active = 1').get().total;

        // Crear libro Excel
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'SIGET - Sistema Integral de Gestión Educativa Terciaria';
        workbook.created = new Date();

        // Paleta Institucional
        const COLOR_NAVY = '1E3A5F';
        const COLOR_HEADER_BG = 'E5E7EB';
        const COLOR_HEADER_TXT = '1F2937';
        const COLOR_BORDER = 'D1D5DB';

        // -------------------------------------------------------------
        // HOJA 1: ESTADÍSTICA MENSUAL
        // -------------------------------------------------------------
        const sheet1 = workbook.addWorksheet(`Estadística ${mStr}-${yNum}`);
        sheet1.views = [{ showGridLines: true }];

        // Título institucional
        sheet1.mergeCells('B2:G2');
        const titleCell = sheet1.getCell('B2');
        titleCell.value = 'SIGET - INSTITUTO DE EDUCACIÓN SUPERIOR TÉCNICA Y FORMACIÓN PROFESIONAL';
        titleCell.font = { name: 'Segoe UI', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
        titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_NAVY } };
        titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
        sheet1.getRow(2).height = 30;

        sheet1.mergeCells('B3:G3');
        const subCell = sheet1.getCell('B3');
        subCell.value = `CUADRO DE ESTADÍSTICA GENERAL DE PLANTA Y ASISTENCIA - PERÍODO: ${mStr}/${yNum}`;
        subCell.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FF8A6F0E' } };
        subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDF9E7' } };
        subCell.alignment = { horizontal: 'center', vertical: 'middle' };
        sheet1.getRow(3).height = 24;

        // Tabla de Resumen de Planta
        sheet1.getCell('B5').value = 'CONCEPTO DE PLANTA DOCENTE';
        sheet1.getCell('B5').font = { bold: true, color: { argb: COLOR_HEADER_TXT } };
        sheet1.getCell('B5').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_HEADER_BG } };

        sheet1.getCell('C5').value = 'CANTIDAD / VALOR';
        sheet1.getCell('C5').font = { bold: true, color: { argb: COLOR_HEADER_TXT } };
        sheet1.getCell('C5').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_HEADER_BG } };
        sheet1.getCell('C5').alignment = { horizontal: 'center' };

        const statsRows = [
            ['Total de Docentes Activos en Planta', totalDocentes],
            ['Docentes Titulares', titulares],
            ['Docentes Provisionales', provisionales],
            ['Docentes Interinos', interinos],
            ['Docentes Suplentes', suplentes],
            ['Carga Horaria Semanal Asignada (Horas Cátedra)', totalHoras],
            ['Total Novedades de Asistencia en el Mes', processed.stats.totalNovedades],
            ['Renglones Desglosados Cuadro IL-01 (Salud - Hojas 1-2)', listIL01.length],
            ['Renglones Desglosados Cuadro IL-02 (Permisos/Faltas - Hojas 3-6)', listIL02.length]
        ];

        statsRows.forEach((item, idx) => {
            const rIdx = 6 + idx;
            sheet1.getCell(`B${rIdx}`).value = item[0];
            sheet1.getCell(`C${rIdx}`).value = item[1];
            sheet1.getCell(`C${rIdx}`).alignment = { horizontal: 'center' };
            sheet1.getRow(rIdx).height = 20;
        });

        sheet1.getColumn('B').width = 48;
        sheet1.getColumn('C').width = 24;

        // -------------------------------------------------------------
        // HOJA 2: CUADRO IL-01 (LICENCIAS MÉDICAS Y POR SALUD - HOJAS 1 Y 2)
        // -------------------------------------------------------------
        const sheet2 = workbook.addWorksheet('Cuadro IL-01');
        sheet2.views = [{ showGridLines: true }];

        sheet2.mergeCells('A1:N1');
        const il01Title = sheet2.getCell('A1');
        il01Title.value = `CUADRO IL-01: LICENCIAS POR TRATAMIENTO MÉDICO Y SALUD - MES: ${mStr}/${yNum}`;
        il01Title.font = { name: 'Segoe UI', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
        il01Title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_NAVY } };
        il01Title.alignment = { horizontal: 'center', vertical: 'middle' };
        sheet2.getRow(1).height = 28;

        const headersIL01 = [
            'OFICINA', 'AÑO', 'N° DISPOSICIÓN', 'DNI', 'APELLIDO Y NOMBRES', 'CÁTEDRA / ESPACIO',
            'REVISTA', 'CÓDIGO', 'MOTIVO DE LICENCIA', 'DESDE', 'HASTA', 'DÍAS', 'HORAS', 'OBSERVACIONES'
        ];

        const rowH1 = sheet2.addRow(headersIL01);
        rowH1.height = 26;
        rowH1.eachCell((cell) => {
            cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: COLOR_HEADER_TXT } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_HEADER_BG } };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            cell.border = {
                bottom: { style: 'thin', color: { argb: COLOR_BORDER } }
            };
        });

        // Filas IL-01
        listIL01.forEach((r) => {
            const rowData = [
                r.oficina,
                r.año,
                r.disposicion,
                r.dni, // DNI como texto (RN-01)
                r.apellidoNombre,
                r.cargo,
                r.revista,
                r.codigo,
                r.motivo,
                r.desde,
                r.hasta,
                r.dias,
                r.horas,
                r.observaciones
            ];
            const addedRow = sheet2.addRow(rowData);
            addedRow.height = 20;

            // Formato de DNI explícito como texto '@' (RN-01)
            const dniCell = addedRow.getCell(4);
            dniCell.numFmt = '@';
            dniCell.alignment = { horizontal: 'center' };

            // Centrar columnas clave
            addedRow.getCell(1).alignment = { horizontal: 'center' };
            addedRow.getCell(2).alignment = { horizontal: 'center' };
            addedRow.getCell(3).alignment = { horizontal: 'center' };
            addedRow.getCell(7).alignment = { horizontal: 'center' };
            addedRow.getCell(8).alignment = { horizontal: 'center' };
            addedRow.getCell(10).alignment = { horizontal: 'center' };
            addedRow.getCell(11).alignment = { horizontal: 'center' };
            addedRow.getCell(12).alignment = { horizontal: 'center' };
            addedRow.getCell(13).alignment = { horizontal: 'center' };
        });

        sheet2.columns = [
            { width: 12 }, { width: 10 }, { width: 22 }, { width: 16 }, { width: 32 },
            { width: 36 }, { width: 14 }, { width: 12 }, { width: 36 }, { width: 14 },
            { width: 14 }, { width: 10 }, { width: 12 }, { width: 28 }
        ];

        // -------------------------------------------------------------
        // HOJA 3: CUADRO IL-02 (INASISTENCIAS, PERMISOS Y LICENCIAS ESPECIALES - HOJAS 3 A 6)
        // -------------------------------------------------------------
        const sheet3 = workbook.addWorksheet('Cuadro IL-02');
        sheet3.views = [{ showGridLines: true }];

        sheet3.mergeCells('A1:N1');
        const il02Title = sheet3.getCell('A1');
        il02Title.value = `CUADRO IL-02: INASISTENCIAS, PERMISOS Y LICENCIAS ESPECIALES - MES: ${mStr}/${yNum}`;
        il02Title.font = { name: 'Segoe UI', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
        il02Title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_NAVY } };
        il02Title.alignment = { horizontal: 'center', vertical: 'middle' };
        sheet3.getRow(1).height = 28;

        const headersIL02 = [
            'OFICINA', 'AÑO', 'N° DISPOSICIÓN', 'DNI', 'APELLIDO Y NOMBRES', 'CÁTEDRA / ESPACIO',
            'REVISTA', 'CÓDIGO', 'TIPO / MOTIVO', 'DESDE', 'HASTA', 'DÍAS', 'TOTAL HORAS', 'OBSERVACIONES'
        ];

        const rowH2 = sheet3.addRow(headersIL02);
        rowH2.height = 26;
        rowH2.eachCell((cell) => {
            cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: COLOR_HEADER_TXT } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_HEADER_BG } };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            cell.border = {
                bottom: { style: 'thin', color: { argb: COLOR_BORDER } }
            };
        });

        const startDataRow = 3;
        listIL02.forEach((r) => {
            const rowData = [
                r.oficina,
                r.año,
                r.disposicion,
                r.dni,
                r.apellidoNombre,
                r.cargo,
                r.revista,
                r.codigo,
                r.motivo,
                r.desde,
                r.hasta,
                r.dias,
                r.horas,
                r.observaciones
            ];
            const addedRow = sheet3.addRow(rowData);
            addedRow.height = 20;

            const dniCell = addedRow.getCell(4);
            dniCell.numFmt = '@';
            dniCell.alignment = { horizontal: 'center' };

            addedRow.getCell(1).alignment = { horizontal: 'center' };
            addedRow.getCell(2).alignment = { horizontal: 'center' };
            addedRow.getCell(3).alignment = { horizontal: 'center' };
            addedRow.getCell(7).alignment = { horizontal: 'center' };
            addedRow.getCell(8).alignment = { horizontal: 'center' };
            addedRow.getCell(10).alignment = { horizontal: 'center' };
            addedRow.getCell(11).alignment = { horizontal: 'center' };
            addedRow.getCell(12).alignment = { horizontal: 'center' };
            addedRow.getCell(13).alignment = { horizontal: 'center' };
        });

        // Fila de Totalización con FÓRMULA EXCEL de sumatoria (RN-08)
        const lastDataRow = 2 + listIL02.length;
        if (listIL02.length > 0) {
            const totalRow = sheet3.addRow([
                '', '', '', '', 'TOTAL GENERAL DE HORAS NO TRABAJADAS', '', '', '', '', '', '', '',
                { formula: `SUM(M${startDataRow}:M${lastDataRow})` },
                ''
            ]);
            totalRow.height = 24;
            totalRow.getCell(5).font = { bold: true, color: { argb: COLOR_HEADER_TXT } };
            totalRow.getCell(13).font = { bold: true, color: { argb: 'FFDC2626' } };
            totalRow.getCell(13).alignment = { horizontal: 'center' };
            totalRow.getCell(13).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
        }

        sheet3.columns = [
            { width: 12 }, { width: 10 }, { width: 22 }, { width: 16 }, { width: 32 },
            { width: 36 }, { width: 14 }, { width: 12 }, { width: 36 }, { width: 14 },
            { width: 14 }, { width: 10 }, { width: 14 }, { width: 28 }
        ];

        // Guardar archivo
        const targetDir = outputDir || path.resolve(__dirname, '../../reportes');
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }

        const fileName = `Planilla_Estadistica_Mensual_${yNum}_${mStr}.xlsx`;
        const filePath = path.join(targetDir, fileName);

        await workbook.xlsx.writeFile(filePath);

        const currentUser = AuthService.getCurrentUser();
        AuditService.log(
            currentUser ? currentUser.id : null,
            currentUser ? currentUser.username : 'RECTORIA',
            'GENERAR_REPORTE_EXCEL',
            `Generada planilla oficial ${fileName} (${listIL01.length} IL-01, ${listIL02.length} IL-02)`
        );

        return {
            success: true,
            filePath,
            fileName,
            sheets: [`Estadística ${mStr}-${yNum}`, 'Cuadro IL-01', 'Cuadro IL-02'],
            stats: processed.stats
        };
    }
}

module.exports = { ReportService };
