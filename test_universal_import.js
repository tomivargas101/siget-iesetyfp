/**
 * Test de Verificación: Importación Masiva Universal Multiformato (.xlsx, .docx, .csv, .txt)
 * Verifica parseUniversalFile, auto-detección y persistencia de planta funcional y asistencias.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const zlib = require('node:zlib');

const { CsvImportService } = require('./src/services/csvImportService');
const { closeDatabase, getDatabase } = require('./src/database/db');

async function runTests() {
    console.log('========================================================');
    console.log('   TESTING: CARGA MASIVA UNIVERSAL MULTIFORMATO         ');
    console.log('========================================================\n');

    const prodDbPath = path.join(__dirname, 'siget.db');
    const testDbPath = path.join(__dirname, 'siget_test_universal.db');
    if (fs.existsSync(prodDbPath)) {
        fs.copyFileSync(prodDbPath, testDbPath);
    }
    process.env.SIGET_DB_PATH = testDbPath;
    getDatabase();

    // 1. Crear un buffer Excel simulando "Datos del personal"
    console.log('1. Generando y parseando Excel con hoja "Datos del personal":');
    const wbPers = new ExcelJS.Workbook();
    const wsPers = wbPers.addWorksheet('Datos del personal');
    wsPers.addRow(['DNI', 'Legajo', 'Apellido', 'Nombre', 'Revista', 'Horas', 'Cátedra', 'Carrera', 'Día', 'Horario', 'Resolución']);
    wsPers.addRow(['45123987', 'LEG-991', 'ACUÑA', 'Valeria', 'Titular', '4', 'Programación Avanzada', 'Software', 'Lunes', '18:00 a 20:40', 'Disp. 101/26']);
    wsPers.addRow(['38999111', 'LEG-992', 'BERMUDEZ', 'Marcos', 'Provisional', '6', 'Bases de Datos II', 'Software', 'Martes', '18:00 a 22:00', 'Disp. 102/26']);
    const excelPersBuf = await wbPers.xlsx.writeBuffer();

    const persRes = await CsvImportService.parseUniversalFile({
        fileBuffer: Buffer.from(excelPersBuf),
        fileName: 'Planta_Personal_2026.xlsx',
        explicitType: 'auto'
    });

    assert.strictEqual(persRes.success, true);
    assert.strictEqual(persRes.detectedType, 'personnel');
    assert.strictEqual(persRes.sheetName, 'Datos del personal');
    assert.strictEqual(persRes.totalRows, 2);
    console.log('   ✅ [PASS] Excel de personal parseado y detectado como "personnel" con 2 filas');

    const persPrev = CsvImportService.previewPersonnel(persRes.csvText);
    assert.strictEqual(persPrev.success, true);
    assert.strictEqual(persPrev.validRows, 2);
    console.log('   ✅ [PASS] Previsualización de personal exitosa (2 filas válidas)');

    const persImport = CsvImportService.importPersonnel(persRes.csvText, { updateExisting: true, createDesignations: true });
    assert.strictEqual(persImport.success, true);
    assert.strictEqual(persImport.insertedTeachers + persImport.updatedTeachers, 2);
    console.log('   ✅ [PASS] Importación a BD completada:', persImport.message);

    // 2. Crear un buffer Excel simulando "Asistencia Julio" con grilla 1..31
    console.log('\n2. Generando y parseando Excel tipo Grilla Mensual "Asistencia Julio":');
    const wbAtt = new ExcelJS.Workbook();
    const wsAtt = wbAtt.addWorksheet('Asistencia Julio');
    wsAtt.addRow(['N°', 'Agente', 'DNI', '1', '2', '3', '4', '5']);
    wsAtt.addRow(['1', 'ACUÑA Valeria', '45123987', 'PR', 'I', 'LIC', 'P', 'PR']);
    wsAtt.addRow(['2', 'BERMUDEZ Marcos', '38999111', 'PR', 'PR', 'LT', 'PR', 'I']);
    const excelAttBuf = await wbAtt.xlsx.writeBuffer();

    const attRes = await CsvImportService.parseUniversalFile({
        fileBuffer: Buffer.from(excelAttBuf),
        fileName: 'Planilla_Asistencia_Julio.xlsx',
        explicitType: 'auto'
    });

    assert.strictEqual(attRes.success, true);
    assert.strictEqual(attRes.detectedType, 'attendance');
    assert.strictEqual(attRes.sheetName, 'Asistencia Julio');
    assert.ok(attRes.totalRows >= 5);
    console.log(`   ✅ [PASS] Grilla unpivoted automáticamente: ${attRes.totalRows} registros generados`);

    const attPrev = CsvImportService.previewAttendance(attRes.csvText);
    assert.strictEqual(attPrev.success, true);
    assert.ok(attPrev.validRows > 0);
    console.log(`   ✅ [PASS] Previsualización de asistencias exitosa (${attPrev.validRows} marcas válidas)`);

    const attImport = CsvImportService.importAttendance(attRes.csvText);
    assert.strictEqual(attImport.success, true);
    console.log('   ✅ [PASS] Importación de asistencias a BD completada:', attImport.message);

    // 3. Crear un archivo Word (.docx) simulado con tablas ZIP + word/document.xml
    console.log('\n3. Generando y parseando archivo Word (.docx) con tabla:');
    const docxXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body>
            <w:tbl>
                <w:tr>
                    <w:tc><w:p><w:r><w:t>DNI</w:t></w:r></w:p></w:tc>
                    <w:tc><w:p><w:r><w:t>Apellido</w:t></w:r></w:p></w:tc>
                    <w:tc><w:p><w:r><w:t>Nombre</w:t></w:r></w:p></w:tc>
                </w:tr>
                <w:tr>
                    <w:tc><w:p><w:r><w:t>29555444</w:t></w:r></w:p></w:tc>
                    <w:tc><w:p><w:r><w:t>CANTEROS</w:t></w:r></w:p></w:tc>
                    <w:tc><w:p><w:r><w:t>Federico</w:t></w:r></w:p></w:tc>
                </w:tr>
            </w:tbl>
        </w:body>
    </w:document>`;

    // Comprimir en memoria como ZIP conteniendo 'word/document.xml'
    const entryName = 'word/document.xml';
    const compData = zlib.deflateRawSync(Buffer.from(docxXml, 'utf8'));
    const uncompData = Buffer.from(docxXml, 'utf8');

    // Construir encabezado local PKZIP
    const localHeader = Buffer.alloc(30 + entryName.length);
    localHeader.writeUInt32LE(0x04034b50, 0); // Signatura
    localHeader.writeUInt16LE(20, 4); // Versión necesaria
    localHeader.writeUInt16LE(0, 6); // Flags
    localHeader.writeUInt16LE(8, 8); // Método de compresión: Deflate
    localHeader.writeUInt16LE(0, 10); // Hora
    localHeader.writeUInt16LE(0, 12); // Fecha
    localHeader.writeUInt32LE(0, 14); // CRC32 (ignorado para lectura interna)
    localHeader.writeUInt32LE(compData.length, 18); // Tamaño comprimido
    localHeader.writeUInt32LE(uncompData.length, 22); // Tamaño descomprimido
    localHeader.writeUInt16LE(entryName.length, 26); // Longitud nombre
    localHeader.writeUInt16LE(0, 28); // Extra length
    localHeader.write(entryName, 30, 'utf8');

    const docxBuffer = Buffer.concat([localHeader, compData]);

    const docxRes = await CsvImportService.parseUniversalFile({
        fileBuffer: docxBuffer,
        fileName: 'Lista_Docentes.docx',
        explicitType: 'personnel'
    });

    assert.strictEqual(docxRes.success, true);
    assert.strictEqual(docxRes.detectedType, 'personnel');
    assert.strictEqual(docxRes.totalRows, 1);
    console.log('   ✅ [PASS] Documento Word (.docx) parseado exitosamente:', docxRes.message);

    // 4. Archivo de texto plano (.csv)
    console.log('\n4. Parseando archivo de texto plano (.csv):');
    const csvContent = 'DNI,Apellido,Nombre\n20111222,ZAPATA,Esteban\n';
    const csvRes = await CsvImportService.parseUniversalFile({
        fileBuffer: Buffer.from(csvContent, 'utf8'),
        fileName: 'personal.csv',
        explicitType: 'auto'
    });
    assert.strictEqual(csvRes.success, true);
    assert.strictEqual(csvRes.totalRows, 1);
    console.log('   ✅ [PASS] Archivo CSV procesado correctamente con 1 fila');

    closeDatabase();
    if (fs.existsSync(process.env.SIGET_DB_PATH)) {
        fs.unlinkSync(process.env.SIGET_DB_PATH);
    }

    console.log('\n========================================================');
    console.log('   TODAS LAS PRUEBAS DE CARGA UNIVERSAL PASARON CON ÉXITO');
    console.log('========================================================');
}

runTests().catch(err => {
    console.error('❌ ERROR EN TEST UNIVERSAL:', err);
    process.exit(1);
});
