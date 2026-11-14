/**
 * Servicio de Auditoría y Trazabilidad Institucional para SIGET
 * Garantiza marcas de tiempo explícitas en Hora Local de Argentina (GMT-3, America/Argentina/Buenos_Aires).
 */

const { getDatabase } = require('../database/db');

class AuditService {
    static getArgentinaTimestamp() {
        const d = new Date();
        // Usar formato ISO local para America/Argentina/Buenos_Aires
        const formatter = new Intl.DateTimeFormat('sv-SE', {
            timeZone: 'America/Argentina/Buenos_Aires',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
        // sv-SE devuelve YYYY-MM-DD HH:mm:ss
        return formatter.format(d).replace(' ', 'T');
    }

    static log(userId, username, action, details = '') {
        try {
            const db = getDatabase();
            const timestamp = this.getArgentinaTimestamp();
            db.prepare(`
                INSERT INTO audit_logs (user_id, username, action, details, timestamp)
                VALUES (?, ?, ?, ?, ?)
            `).run(userId || null, username || 'SISTEMA', action, details, timestamp);
        } catch (error) {
            console.error('[AuditService] Error registrando auditoría:', error.message);
        }
    }

    static logAction({ userId, username, action, details = '', category = '' }) {
        const catPrefix = category ? `[${category}] ` : '';
        return this.log(userId, username, action, `${catPrefix}${details}`);
    }

    static getRecent(limit = 15) {
        try {
            const db = getDatabase();
            return db.prepare(`
                SELECT id, user_id, username, action, details, timestamp
                FROM audit_logs
                ORDER BY timestamp DESC
                LIMIT ?
            `).all(limit);
        } catch (error) {
            console.error('[AuditService] Error consultando auditoría:', error.message);
            return [];
        }
    }

    /**
     * Retorna todos los registros de auditoría con filtrado avanzado por texto y categoría.
     */
    static getAllLogs({ search = '', category = '', limit = 1000 } = {}) {
        try {
            const db = getDatabase();
            let query = `
                SELECT id, user_id, username, action, details, timestamp
                FROM audit_logs
                WHERE 1=1
            `;
            const params = [];

            if (search && search.trim()) {
                const s = `%${search.trim().toLowerCase()}%`;
                query += ` AND (LOWER(username) LIKE ? OR LOWER(action) LIKE ? OR LOWER(details) LIKE ? OR timestamp LIKE ?)`;
                params.push(s, s, s, s);
            }

            if (category && category !== 'ALL' && category !== 'all' && category !== 'Todos') {
                const cat = category.toUpperCase().trim();
                if (cat === 'ASISTENCIA' || cat === 'ASISTENCIAS') {
                    query += ` AND (action LIKE '%ASISTENCIA%' OR action LIKE '%FORMULARIO%' OR details LIKE '%[ASISTENCIA]%' OR details LIKE '%asistencia%')`;
                } else if (cat === 'DESIGNACION' || cat === 'DESIGNACIONES') {
                    query += ` AND (action LIKE '%DESIGNACION%' OR action LIKE '%CATEDRA%' OR action LIKE '%SUPLENCIA%' OR details LIKE '%[DESIGNACIONES]%')`;
                } else if (cat === 'CARGA_MASIVA' || cat === 'CSV' || cat === 'CARGA MASIVA') {
                    query += ` AND (action LIKE '%CSV%' OR action LIKE '%IMPORT%' OR details LIKE '%[CARGA_MASIVA]%')`;
                } else if (cat === 'DOCENTES') {
                    query += ` AND (action LIKE '%DOCENTE%' OR action LIKE '%TEACHER%' OR details LIKE '%[DOCENTES]%')`;
                } else if (cat === 'SEGURIDAD' || cat === 'USUARIOS') {
                    query += ` AND (action LIKE '%LOGIN%' OR action LIKE '%USER%' OR action LIKE '%RECOVERY%' OR action LIKE '%PASSWORD%' OR details LIKE '%[SEGURIDAD]%')`;
                } else if (cat === 'SISTEMA') {
                    query += ` AND (action LIKE '%SISTEMA%' OR action LIKE '%JORNADA%' OR action LIKE '%CONFIG%' OR details LIKE '%[SISTEMA]%')`;
                } else {
                    query += ` AND (action LIKE ? OR details LIKE ?)`;
                    params.push(`%${cat}%`, `%[${cat}]%`);
                }
            }

            query += ` ORDER BY timestamp DESC LIMIT ?`;
            params.push(limit);

            const logs = db.prepare(query).all(...params);

            return logs.map(l => {
                let formattedTime = l.timestamp || '';
                if (formattedTime.includes('T')) {
                    const [datePart, timePart] = formattedTime.split('T');
                    const [y, m, d] = datePart.split('-');
                    formattedTime = `${d}/${m}/${y} ${timePart.substring(0, 8)}`;
                }
                return {
                    ...l,
                    timestampFormatted: formattedTime
                };
            });
        } catch (error) {
            console.error('[AuditService] Error obteniendo historial completo de auditoría:', error.message);
            return [];
        }
    }

    /**
     * Genera un informe oficial en PDF con todo el historial de eventos del sistema para archivo institucional.
     */
    static async generateAuditPdf({ exportedBy = 'SECRETARÍA', search = '', category = '', outputDir = null } = {}) {
        const path = require('path');
        const fs = require('fs');

        const logs = this.getAllLogs({ search, category, limit: 1500 });
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const hh = String(now.getHours()).padStart(2, '0');
        const min = String(now.getMinutes()).padStart(2, '0');

        const outDirectory = outputDir || path.resolve(__dirname, '../../reportes');
        if (!fs.existsSync(outDirectory)) {
            fs.mkdirSync(outDirectory, { recursive: true });
        }

        const fileName = `Registro_Auditoria_SIGET_${yyyy}${mm}${dd}_${hh}${min}.pdf`;
        const filePath = path.join(outDirectory, fileName);

        const rowsHtml = logs.map((log, idx) => {
            const bgClass = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
            return `
                <tr style="background-color: ${bgClass}; border-bottom: 1px solid #e2e8f0; font-size: 10px;">
                    <td style="padding: 6px 8px; text-align: center; font-family: monospace; color: #475569; white-space: nowrap;">${escapeXml(log.timestampFormatted)}</td>
                    <td style="padding: 6px 8px; font-weight: bold; color: #1e293b;">${escapeXml(log.username || 'SISTEMA')}</td>
                    <td style="padding: 6px 8px; color: #0284c7; font-weight: 600;">${escapeXml(log.action)}</td>
                    <td style="padding: 6px 8px; color: #334155; line-height: 1.3;">${escapeXml(log.details || '-')}</td>
                </tr>
            `;
        }).join('');

        const html = `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>Registro Oficial de Auditoría - SIGET</title>
    <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 24px; color: #0f172a; background: #fff; }
        .header { border-bottom: 2px solid #b45309; padding-bottom: 12px; margin-bottom: 16px; }
        .inst-title { font-size: 14px; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.5px; }
        .doc-title { font-size: 18px; font-weight: 900; color: #b45309; margin: 4px 0; }
        .meta-grid { display: flex; justify-content: space-between; font-size: 11px; color: #64748b; margin-top: 8px; background: #f8fafc; padding: 8px 12px; border-radius: 6px; }
        table { width: 100%; border-collapse: collapse; margin-top: 14px; }
        th { background: #0f172a; color: #f8fafc; font-size: 10px; font-weight: 700; text-transform: uppercase; padding: 8px; text-align: left; }
        th.center { text-align: center; }
        .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #cbd5e1; font-size: 10px; color: #64748b; display: flex; justify-content: space-between; align-items: center; }
        .seal { font-size: 9px; font-weight: bold; color: #b45309; border: 1px dashed #b45309; padding: 4px 8px; border-radius: 4px; }
    </style>
</head>
<body>
    <div class="header">
        <div class="inst-title">Instituto de Educación Superior Técnica y Formación Profesional</div>
        <div class="doc-title">REGISTRO OFICIAL DE AUDITORÍA Y TRAZABILIDAD INSTITUCIONAL</div>
        <div class="meta-grid">
            <div><strong>Emisión:</strong> ${dd}/${mm}/${yyyy} ${hh}:${min} hs (Hora Oficial Argentina GMT-3)</div>
            <div><strong>Generado por:</strong> ${escapeXml(exportedBy)}</div>
            <div><strong>Total de Eventos:</strong> ${logs.length} registros auditados</div>
        </div>
    </div>

    <table>
        <thead>
            <tr>
                <th class="center" style="width: 120px;">Fecha / Hora</th>
                <th style="width: 110px;">Usuario</th>
                <th style="width: 160px;">Acción Institucional</th>
                <th>Detalles Técnicos y de Registro</th>
            </tr>
        </thead>
        <tbody>
            ${rowsHtml || '<tr><td colspan="4" style="text-align: center; padding: 20px; font-style: italic; color: #94a3b8;">No se registraron eventos para los filtros seleccionados.</td></tr>'}
        </tbody>
    </table>

    <div class="footer">
        <div>Sistema Integral de Gestión Educativa Terciaria (SIGET) • Archivo Oficial de Trazabilidad</div>
        <div class="seal">VALIDEZ OFICIAL INSTITUCIONAL</div>
    </div>
</body>
</html>
        `;

        let pdfBuffer;
        try {
            // Si estamos dentro del entorno Electron
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
                pdfBuffer = createFallbackPdf(
                    'REGISTRO OFICIAL DE AUDITORIA - SIGET',
                    logs.map(l => `${l.timestampFormatted} | ${l.username} | ${l.action} | ${l.details || ''}`)
                );
            }

            fs.writeFileSync(filePath, pdfBuffer);

            return {
                success: true,
                filePath,
                fileName,
                totalEvents: logs.length,
                totalLogs: logs.length,
                message: `Registro de auditoría exportado exitosamente a PDF (${fileName}).`
            };
        } catch (err) {
            console.error('[AuditService] Error generando PDF de auditoría:', err);
            // Intentar con fallback si falló printToPDF
            try {
                const fallbackBuffer = createFallbackPdf(
                    'REGISTRO OFICIAL DE AUDITORIA - SIGET',
                    logs.map(l => `${l.timestampFormatted} | ${l.username} | ${l.action} | ${l.details || ''}`)
                );
                fs.writeFileSync(filePath, fallbackBuffer);
                return {
                    success: true,
                    filePath,
                    fileName,
                    totalEvents: logs.length,
                    totalLogs: logs.length,
                    message: `Registro de auditoría exportado a PDF (${fileName}).`
                };
            } catch (fallbackErr) {
                return {
                    success: false,
                    message: `Error al generar PDF: ${err.message}`
                };
            }
        }
    }
}

function escapeXml(unsafe) {
    if (unsafe === null || unsafe === undefined) return '';
    return String(unsafe)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function createFallbackPdf(title, lines) {
    const safeTitle = (title || 'DOCUMENTO INSTITUCIONAL SIGET').replace(/[\(\)\\]/g, '');
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

module.exports = { AuditService };
