const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const { getDatabase } = require('../database/db');

class ResguardoBundleService {
    static getResguardoDir() {
        const dir = path.resolve(__dirname, '../../resguardo/certificados');
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        return dir;
    }

    static saveCertificateFile({ teacherId, dateStr, fileName, base64, buffer, filePath }) {
        if (!fileName) return null;
        const rawBase = path.basename(fileName);
        const safeName = rawBase.replace(/[^a-zA-Z0-9._-]/g, '_');
        const targetDir = this.getResguardoDir();
        const storedFileName = `${dateStr}_DOC_${teacherId}_${safeName}`;
        const finalPath = path.join(targetDir, storedFileName);

        if (base64) {
            fs.writeFileSync(finalPath, Buffer.from(base64, 'base64'));
        } else if (Buffer.isBuffer(buffer)) {
            fs.writeFileSync(finalPath, buffer);
        } else if (filePath && fs.existsSync(filePath)) {
            fs.copyFileSync(filePath, finalPath);
        } else {
            return null;
        }

        return {
            storedFileName,
            originalFileName: rawBase,
            filePath: finalPath
        };
    }

    static getAttachmentsForDate(dateStr) {
        const db = getDatabase();
        try {
            return db.prepare(`
                SELECT DISTINCT a.attachment_path, a.attachment_filename, a.teacher_id,
                       t.first_name, t.last_name, t.dni, t.legajo
                FROM attendances a
                JOIN teachers t ON a.teacher_id = t.id
                WHERE a.date = ? 
                  AND a.attachment_path IS NOT NULL 
                  AND a.attachment_path != '' 
                  AND a.is_active = 1
            `).all(dateStr).filter(row => row.attachment_path && fs.existsSync(row.attachment_path));
        } catch (e) {
            console.error('[ResguardoBundleService] Error obteniendo adjuntos por fecha:', e);
            return [];
        }
    }

    static getAttachmentsForTeacher(teacherId, startDate, endDate) {
        const db = getDatabase();
        try {
            return db.prepare(`
                SELECT DISTINCT a.attachment_path, a.attachment_filename, a.date, a.teacher_id,
                       t.first_name, t.last_name, t.dni, t.legajo
                FROM attendances a
                JOIN teachers t ON a.teacher_id = t.id
                WHERE a.teacher_id = ?
                  AND a.date >= ? 
                  AND a.date <= ?
                  AND a.attachment_path IS NOT NULL 
                  AND a.attachment_path != '' 
                  AND a.is_active = 1
            `).all(teacherId, startDate, endDate).filter(row => row.attachment_path && fs.existsSync(row.attachment_path));
        } catch (e) {
            console.error('[ResguardoBundleService] Error obteniendo adjuntos por docente:', e);
            return [];
        }
    }

    static getAttachmentsForMonth(year, month) {
        const db = getDatabase();
        try {
            const mStr = String(month).padStart(2, '0');
            const pattern = `${year}-${mStr}%`;
            return db.prepare(`
                SELECT DISTINCT a.attachment_path, a.attachment_filename, a.date, a.teacher_id,
                       t.first_name, t.last_name, t.dni, t.legajo
                FROM attendances a
                JOIN teachers t ON a.teacher_id = t.id
                WHERE a.date LIKE ?
                  AND a.attachment_path IS NOT NULL 
                  AND a.attachment_path != '' 
                  AND a.is_active = 1
            `).all(pattern).filter(row => row.attachment_path && fs.existsSync(row.attachment_path));
        } catch (e) {
            console.error('[ResguardoBundleService] Error obteniendo adjuntos por mes:', e);
            return [];
        }
    }

    static createResguardoZipBundle({ reportFilePath, certificateFiles = [], zipOutputPath }) {
        return new Promise((resolve, reject) => {
            try {
                const outDir = path.dirname(zipOutputPath);
                if (!fs.existsSync(outDir)) {
                    fs.mkdirSync(outDir, { recursive: true });
                }

                const output = fs.createWriteStream(zipOutputPath);
                const archive = archiver('zip', { zlib: { level: 9 } });

                output.on('close', () => {
                    resolve({
                        success: true,
                        zipPath: zipOutputPath,
                        size: archive.pointer(),
                        certificatesCount: certificateFiles.length,
                        message: `Paquete de resguardo ZIP generado con éxito (${certificateFiles.length} certificados adjuntos incluidos).`
                    });
                });

                archive.on('error', (err) => reject(err));
                archive.pipe(output);

                if (reportFilePath && fs.existsSync(reportFilePath)) {
                    archive.file(reportFilePath, { name: path.basename(reportFilePath) });
                }

                const usedNames = new Set();
                for (const cert of certificateFiles) {
                    const cPath = typeof cert === 'string' ? cert : (cert.attachment_path || cert.filePath || cert.path);
                    if (!cPath || !fs.existsSync(cPath)) continue;

                    let baseName = typeof cert === 'object' && (cert.attachment_filename || cert.originalFileName || cert.name)
                        ? (cert.attachment_filename || cert.originalFileName || cert.name)
                        : path.basename(cPath);

                    let uniqueName = baseName;
                    let counter = 1;
                    while (usedNames.has(uniqueName)) {
                        const ext = path.extname(baseName);
                        const stem = path.basename(baseName, ext);
                        uniqueName = `${stem}_${counter}${ext}`;
                        counter++;
                    }
                    usedNames.add(uniqueName);

                    archive.file(cPath, { name: `Certificados_Adjuntos/${uniqueName}` });
                }

                archive.finalize();
            } catch (err) {
                reject(err);
            }
        });
    }
}

module.exports = { ResguardoBundleService };
