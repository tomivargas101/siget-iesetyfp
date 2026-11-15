#!/usr/bin/env node
/**
 * SIGET - Compilador y Exportador Oficial del Esquema de Base de Datos a PDF
 * Genera el documento PDF formal con diseño A4, estilos institucionales y diagramas vectoriales integrados.
 */
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('========================================================');
console.log('   SIGET: EXPORTACIÓN FORMAL DEL ESQUEMA BD A PDF       ');
console.log('========================================================');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const result = spawnSync('npx', ['electron', '.', '--export-schema-pdf'], {
    stdio: 'inherit',
    cwd: path.resolve(__dirname),
    shell: true,
    env
});

if (result.status === 0) {
    const rootPdf = path.resolve(__dirname, 'Esquema_Base_de_Datos_SIGET_14_11_2026.pdf');
    const reportesPdf = path.resolve(__dirname, 'reportes', 'Esquema_Base_de_Datos_SIGET_14_11_2026.pdf');
    if (fs.existsSync(rootPdf)) {
        console.log(`\n📄 Archivo generado en la raíz: ${rootPdf} (${fs.statSync(rootPdf).size} bytes)`);
    }
    if (fs.existsSync(reportesPdf)) {
        console.log(`📁 Copia en carpeta reportes: ${reportesPdf} (${fs.statSync(reportesPdf).size} bytes)`);
    }
    console.log('\n✅ PDF generado y compilado exitosamente.');
} else {
    console.error('\n❌ Error ejecutando la exportación del PDF:', result.error || result.status);
    process.exit(result.status || 1);
}
