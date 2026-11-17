const path = require('path');
const fs = require('fs');

class SchemaPdfService {
    static getReportHtml() {
        return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>SIGET - Esquema Nominal y Relacional de Base de Datos</title>
    <style>
        @page {
            size: A4 portrait;
            margin: 14mm 12mm 14mm 12mm;
            @bottom-right {
                content: "Página " counter(page);
                font-size: 9px;
                color: #64748b;
            }
        }
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            color: #1e293b;
            background-color: #ffffff;
            font-size: 10.5px;
            line-height: 1.45;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
        }

        .page-break {
            page-break-before: always;
        }
        .avoid-break {
            page-break-inside: avoid;
        }

        .doc-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2.5px solid #d97706;
            padding-bottom: 12px;
            margin-bottom: 16px;
        }
        .brand-title {
            font-size: 18px;
            font-weight: 900;
            color: #0f172a;
            letter-spacing: -0.5px;
            text-transform: uppercase;
        }
        .brand-subtitle {
            font-size: 11px;
            font-weight: 700;
            color: #d97706;
            margin-top: 1px;
        }
        .brand-meta {
            font-size: 9px;
            color: #64748b;
            margin-top: 3px;
        }
        .header-badge {
            background-color: #0f172a;
            color: #f59e0b;
            padding: 5px 12px;
            border-radius: 6px;
            font-size: 10px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            border: 1px solid #d97706;
            text-align: right;
        }

        h2 {
            font-size: 13px;
            font-weight: 800;
            color: #0f172a;
            border-left: 4px solid #d97706;
            padding-left: 8px;
            margin-top: 16px;
            margin-bottom: 10px;
            text-transform: uppercase;
            letter-spacing: 0.3px;
        }
        h3 {
            font-size: 11px;
            font-weight: 800;
            color: #1e293b;
            margin-top: 12px;
            margin-bottom: 6px;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        p {
            margin-bottom: 8px;
            color: #334155;
            text-align: justify;
        }

        .callout-box {
            background-color: #fffbeb;
            border: 1px solid #fde68a;
            border-left: 3.5px solid #d97706;
            border-radius: 6px;
            padding: 8px 12px;
            margin: 10px 0;
            font-size: 10px;
            color: #92400e;
        }
        .callout-box strong {
            color: #78350f;
        }

        table {
            width: 100%;
            border-collapse: collapse;
            margin: 8px 0 14px 0;
            font-size: 9.5px;
            border: 1px solid #cbd5e1;
            border-radius: 4px;
            overflow: hidden;
        }
        th {
            background-color: #0f172a;
            color: #f8fafc;
            font-weight: 700;
            padding: 5px 8px;
            text-align: left;
            border: 1px solid #334155;
            font-size: 9px;
            text-transform: uppercase;
            letter-spacing: 0.3px;
        }
        td {
            padding: 4.5px 8px;
            border: 1px solid #e2e8f0;
            color: #334155;
        }
        tr:nth-child(even) {
            background-color: #f8fafc;
        }
        tr:hover {
            background-color: #f1f5f9;
        }

        code {
            font-family: 'Consolas', 'Courier New', monospace;
            background-color: #f1f5f9;
            color: #0f172a;
            padding: 1.5px 4px;
            border-radius: 3px;
            border: 1px solid #cbd5e1;
            font-size: 8.5px;
            font-weight: 700;
        }
        .pk-badge {
            background-color: #fef3c7;
            color: #b45309;
            border: 1px solid #fde68a;
            padding: 1px 4px;
            border-radius: 3px;
            font-weight: 800;
            font-size: 8px;
        }
        .fk-badge {
            background-color: #e0f2fe;
            color: #0369a1;
            border: 1px solid #bae6fd;
            padding: 1px 4px;
            border-radius: 3px;
            font-weight: 800;
            font-size: 8px;
        }
        .uk-badge {
            background-color: #f3e8ff;
            color: #7e22ce;
            border: 1px solid #e9d5ff;
            padding: 1px 4px;
            border-radius: 3px;
            font-weight: 800;
            font-size: 8px;
        }
        .badge-update {
            background-color: #dcfce7;
            color: #15803d;
            border: 1px solid #bbf7d0;
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 9px;
            font-weight: 800;
            text-transform: uppercase;
        }

        .diagram-container {
            background-color: #ffffff;
            border: 1px solid #cbd5e1;
            border-radius: 8px;
            padding: 12px;
            margin: 12px 0 16px 0;
            text-align: center;
            box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        }
        .diagram-caption {
            font-size: 9.5px;
            font-weight: 700;
            color: #64748b;
            margin-top: 6px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .doc-footer {
            border-top: 1px solid #cbd5e1;
            padding-top: 8px;
            margin-top: 24px;
            display: flex;
            justify-content: space-between;
            font-size: 8.5px;
            color: #64748b;
        }
    </style>
</head>
<body>

    <!-- ==================== PÁGINA 1: PORTADA & ARQUITECTURA DUAL ==================== -->
    <div class="doc-header">
        <div>
            <div class="brand-title">SIGET • IESETyFP</div>
            <div class="brand-subtitle">Esquema Nominal y Relacional de Base de Datos</div>
            <div class="brand-meta">Instituto de Educación Superior de Educación Técnica y Formación Profesional • San Fernando del Valle de Catamarca</div>
        </div>
        <div class="header-badge">
            Versión 2.5 Oficial<br>
            <span style="font-size: 8.5px; font-weight: normal; color: #cbd5e1;">Actualizado: 14/11/2026</span>
        </div>
    </div>

    <h2>1. ⚙️ Arquitectura de Persistencia Dual</h2>
    <p>
        El sistema <strong>SIGET</strong> implementa una arquitectura desacoplada de persistencia dual que permite garantizar la continuidad operativa tanto en escenarios de conectividad en red de área local (LAN) como en terminales autónomas sin conexión permanente:
    </p>

    <div class="diagram-container avoid-break">
        <!-- SVG Vectorial: Diagrama de Arquitectura de Persistencia Dual -->
        <svg width="680" height="155" viewBox="0 0 680 155" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="gradDark" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#0f172a"/>
                    <stop offset="100%" stop-color="#1e293b"/>
                </linearGradient>
                <linearGradient id="gradGold" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#f59e0b"/>
                    <stop offset="100%" stop-color="#d97706"/>
                </linearGradient>
                <marker id="arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#d97706" />
                </marker>
                <marker id="arrowDark" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#0f172a" />
                </marker>
            </defs>

            <!-- Grupo 1: Clientes UI -->
            <rect x="15" y="15" width="180" height="125" rx="8" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.5"/>
            <text x="105" y="32" text-anchor="middle" font-size="10" font-weight="bold" fill="#0f172a">CAPA DE CLIENTES (UI)</text>

            <rect x="25" y="45" width="160" height="38" rx="6" fill="url(#gradDark)" stroke="#0f172a"/>
            <text x="105" y="62" text-anchor="middle" font-size="9" font-weight="bold" fill="#f8fafc">Electron Desktop App</text>
            <text x="105" y="74" text-anchor="middle" font-size="7.5" fill="#f59e0b">Chromium / HTML5 / Tailwind</text>

            <rect x="25" y="92" width="160" height="38" rx="6" fill="url(#gradDark)" stroke="#0f172a"/>
            <text x="105" y="109" text-anchor="middle" font-size="9" font-weight="bold" fill="#f8fafc">Python Desktop App</text>
            <text x="105" y="121" text-anchor="middle" font-size="7.5" fill="#f59e0b">CustomTkinter Corporativo</text>

            <!-- Flechas 1 -->
            <path d="M 195 64 L 245 64" stroke="#d97706" stroke-width="2" marker-end="url(#arrow)"/>
            <path d="M 195 111 L 245 111" stroke="#d97706" stroke-width="2" marker-end="url(#arrow)"/>

            <!-- Grupo 2: Capa de Abstracción -->
            <rect x="250" y="15" width="185" height="125" rx="8" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.5"/>
            <text x="342" y="32" text-anchor="middle" font-size="10" font-weight="bold" fill="#0f172a">CONTROLADORES &amp; ORM</text>

            <rect x="260" y="45" width="165" height="38" rx="6" fill="#ffffff" stroke="#d97706" stroke-width="1.5"/>
            <text x="342" y="62" text-anchor="middle" font-size="9" font-weight="bold" fill="#0f172a">Driver node:sqlite</text>
            <text x="342" y="74" text-anchor="middle" font-size="7.5" fill="#64748b">PRAGMA journal_mode = WAL</text>

            <rect x="260" y="92" width="165" height="38" rx="6" fill="#ffffff" stroke="#d97706" stroke-width="1.5"/>
            <text x="342" y="109" text-anchor="middle" font-size="9" font-weight="bold" fill="#0f172a">SQLAlchemy ORM Session</text>
            <text x="342" y="121" text-anchor="middle" font-size="7.5" fill="#64748b">Pool Conexiones &amp; Scoped Session</text>

            <!-- Flechas 2 -->
            <path d="M 425 64 L 485 64" stroke="#0f172a" stroke-width="2" marker-end="url(#arrowDark)"/>
            <path d="M 425 105 L 485 75" stroke="#0f172a" stroke-width="1.5" stroke-dasharray="3,3" marker-end="url(#arrowDark)"/>
            <path d="M 425 115 L 485 115" stroke="#d97706" stroke-width="2" marker-end="url(#arrow)"/>

            <!-- Grupo 3: Almacenamiento -->
            <rect x="490" y="15" width="175" height="125" rx="8" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.5"/>
            <text x="577" y="32" text-anchor="middle" font-size="10" font-weight="bold" fill="#0f172a">PERSISTENCIA FÍSICA</text>

            <rect x="500" y="45" width="155" height="40" rx="6" fill="#e2e8f0" stroke="#94a3b8" stroke-width="1.2"/>
            <text x="577" y="61" text-anchor="middle" font-size="9" font-weight="bold" fill="#0f172a">SQLite 3 (siget.db)</text>
            <text x="577" y="73" text-anchor="middle" font-size="7.5" font-weight="bold" fill="#0284c7">Local / Monopuesto / Offline</text>

            <rect x="500" y="92" width="155" height="40" rx="6" fill="#fef3c7" stroke="#f59e0b" stroke-width="1.2"/>
            <text x="577" y="108" text-anchor="middle" font-size="9" font-weight="bold" fill="#78350f">MySQL 8.x / MariaDB</text>
            <text x="577" y="120" text-anchor="middle" font-size="7.5" font-weight="bold" fill="#b45309">Producción / Red LAN Concurrente</text>
        </svg>
        <div class="diagram-caption">Figura 1: Arquitectura de Persistencia Desacoplada e Híbrida de SIGET</div>
    </div>

    <div class="callout-box">
        <strong>Modo WAL (Write-Ahead Logging) en SQLite:</strong> Permite que las operaciones de lectura (consultas de asistencias, visualización de grilla mensual y reportes) se ejecuten en paralelo sin bloquear los procesos de escritura o persistencia de novedades diarias, eliminando los bloqueos <code>database is locked</code> en Electron.
    </div>

    <!-- ==================== PÁGINA 2: DIAGRAMA ENTIDAD-RELACIÓN ==================== -->
    <div class="page-break"></div>

    <div class="doc-header">
        <div>
            <div class="brand-title">SIGET • IESETyFP</div>
            <div class="brand-subtitle">Diagrama Entidad-Relación Completo</div>
        </div>
        <div class="header-badge">Estructura Relacional 2026</div>
    </div>

    <h2>2. 📊 Diagrama Entidad-Relación Institucional</h2>
    <p>
        El modelo consta de 10 tablas interconectadas que cubren seguridad de usuarios, estructura académica, planta docente, designaciones multi-día, suplencias, control de presentismo y jornadas institucionales:
    </p>

    <div class="diagram-container avoid-break" style="padding: 10px;">
        <!-- SVG Vectorial: Diagrama Entidad-Relación Detallado -->
        <svg width="680" height="490" viewBox="0 0 680 490" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <filter id="shadow" x="-5%" y="-5%" width="110%" height="110%">
                    <feDropShadow dx="0" dy="1" stdDeviation="1" flood-color="#000000" flood-opacity="0.08"/>
                </filter>
            </defs>

            <!-- LÍNEAS DE RELACIÓN / CONECTORES -->
            <!-- users -> audit_logs -->
            <path d="M 100 115 L 100 145" stroke="#94a3b8" stroke-width="1.5"/>
            <!-- careers -> subjects -->
            <path d="M 280 65 L 340 65" stroke="#94a3b8" stroke-width="1.5"/>
            <!-- careers -> students -->
            <path d="M 230 115 L 230 150" stroke="#94a3b8" stroke-width="1.5"/>
            <!-- subjects -> designations -->
            <path d="M 410 115 L 410 160" stroke="#d97706" stroke-width="1.8"/>
            <!-- teachers -> designations -->
            <path d="M 520 220 L 480 220" stroke="#d97706" stroke-width="1.8"/>
            <!-- designations -> substitutions -->
            <path d="M 410 320 L 410 360" stroke="#94a3b8" stroke-width="1.5"/>
            <!-- teachers -> substitutions (curva) -->
            <path d="M 580 320 L 580 410 L 485 410" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="3,3"/>
            <!-- teachers -> attendances -->
            <path d="M 590 320 L 590 360" stroke="#94a3b8" stroke-width="1.5"/>
            <!-- designations -> attendances -->
            <path d="M 480 270 L 525 270 L 525 380 L 540 380" stroke="#94a3b8" stroke-width="1.2" stroke-dasharray="2,2"/>

            <!-- 1. TABLA: users -->
            <g transform="translate(20, 20)" filter="url(#shadow)">
                <rect width="160" height="95" rx="5" fill="#ffffff" stroke="#0f172a" stroke-width="1.5"/>
                <rect width="160" height="20" rx="4" fill="#0f172a"/>
                <text x="80" y="14" text-anchor="middle" fill="#f8fafc" font-size="9" font-weight="bold">users (Operadores)</text>
                <text x="8" y="32" font-size="7.5" fill="#334155"><tspan fill="#b45309" font-weight="bold">PK</tspan> id : int</text>
                <text x="8" y="44" font-size="7.5" fill="#334155"><tspan fill="#7e22ce" font-weight="bold">UK</tspan> username : varchar</text>
                <text x="8" y="56" font-size="7.5" fill="#334155">password_hash : varchar</text>
                <text x="8" y="68" font-size="7.5" fill="#334155">role : RECTOR/SEC/BED</text>
                <text x="8" y="80" font-size="7.5" fill="#334155">recovery_key_hash : varchar</text>
                <text x="8" y="92" font-size="7.5" fill="#334155">is_active : boolean</text>
            </g>

            <!-- 2. TABLA: audit_logs -->
            <g transform="translate(20, 145)" filter="url(#shadow)">
                <rect width="160" height="85" rx="5" fill="#ffffff" stroke="#64748b" stroke-width="1.2"/>
                <rect width="160" height="18" rx="4" fill="#475569"/>
                <text x="80" y="13" text-anchor="middle" fill="#f8fafc" font-size="8.5" font-weight="bold">audit_logs (Auditoría)</text>
                <text x="8" y="30" font-size="7.5" fill="#334155"><tspan fill="#b45309" font-weight="bold">PK</tspan> id : int</text>
                <text x="8" y="42" font-size="7.5" fill="#334155"><tspan fill="#0369a1" font-weight="bold">FK</tspan> user_id : int (users)</text>
                <text x="8" y="54" font-size="7.5" fill="#334155">username : varchar</text>
                <text x="8" y="66" font-size="7.5" fill="#334155">action : varchar</text>
                <text x="8" y="78" font-size="7.5" fill="#334155">timestamp : datetime (GMT-3)</text>
            </g>

            <!-- 3. TABLA: careers -->
            <g transform="translate(195, 20)" filter="url(#shadow)">
                <rect width="135" height="95" rx="5" fill="#ffffff" stroke="#0f172a" stroke-width="1.5"/>
                <rect width="135" height="20" rx="4" fill="#0f172a"/>
                <text x="67" y="14" text-anchor="middle" fill="#f8fafc" font-size="9" font-weight="bold">careers (Carreras)</text>
                <text x="8" y="34" font-size="7.5" fill="#334155"><tspan fill="#b45309" font-weight="bold">PK</tspan> id : int</text>
                <text x="8" y="48" font-size="7.5" fill="#334155"><tspan fill="#7e22ce" font-weight="bold">UK</tspan> code : varchar</text>
                <text x="8" y="62" font-size="7.5" fill="#334155">name : varchar</text>
                <text x="8" y="76" font-size="7.5" fill="#334155">resolution_number : text</text>
                <text x="8" y="90" font-size="7.5" fill="#334155">duration_years : int</text>
            </g>

            <!-- 4. TABLA: students -->
            <g transform="translate(195, 150)" filter="url(#shadow)">
                <rect width="135" height="100" rx="5" fill="#ffffff" stroke="#64748b" stroke-width="1.2"/>
                <rect width="135" height="18" rx="4" fill="#334155"/>
                <text x="67" y="13" text-anchor="middle" fill="#f8fafc" font-size="8.5" font-weight="bold">students (Alumnos)</text>
                <text x="8" y="30" font-size="7.5" fill="#334155"><tspan fill="#b45309" font-weight="bold">PK</tspan> id : int</text>
                <text x="8" y="42" font-size="7.5" fill="#334155"><tspan fill="#0369a1" font-weight="bold">FK</tspan> career_id : int</text>
                <text x="8" y="54" font-size="7.5" fill="#334155"><tspan fill="#7e22ce" font-weight="bold">UK</tspan> matricula / dni</text>
                <text x="8" y="66" font-size="7.5" fill="#334155">first_name, last_name</text>
                <text x="8" y="78" font-size="7.5" fill="#334155">cohort_year : int</text>
                <text x="8" y="90" font-size="7.5" fill="#334155">academic_status : text</text>
            </g>

            <!-- 5. TABLA: subjects -->
            <g transform="translate(340, 20)" filter="url(#shadow)">
                <rect width="140" height="95" rx="5" fill="#ffffff" stroke="#0f172a" stroke-width="1.5"/>
                <rect width="140" height="20" rx="4" fill="#0f172a"/>
                <text x="70" y="14" text-anchor="middle" fill="#f8fafc" font-size="9" font-weight="bold">subjects (Materias)</text>
                <text x="8" y="34" font-size="7.5" fill="#334155"><tspan fill="#b45309" font-weight="bold">PK</tspan> id : int</text>
                <text x="8" y="48" font-size="7.5" fill="#334155"><tspan fill="#0369a1" font-weight="bold">FK</tspan> career_id : int</text>
                <text x="8" y="62" font-size="7.5" fill="#334155">code : varchar</text>
                <text x="8" y="76" font-size="7.5" fill="#334155">name : varchar</text>
                <text x="8" y="90" font-size="7.5" fill="#334155">year_level / weekly_hours</text>
            </g>

            <!-- 6. TABLA: teachers -->
            <g transform="translate(520, 160)" filter="url(#shadow)">
                <rect width="145" height="160" rx="5" fill="#ffffff" stroke="#d97706" stroke-width="1.8"/>
                <rect width="145" height="20" rx="4" fill="#d97706"/>
                <text x="72" y="14" text-anchor="middle" fill="#ffffff" font-size="9" font-weight="bold">teachers (Docentes)</text>
                <text x="8" y="34" font-size="7.5" fill="#334155"><tspan fill="#b45309" font-weight="bold">PK</tspan> id : int</text>
                <text x="8" y="48" font-size="7.5" fill="#334155"><tspan fill="#7e22ce" font-weight="bold">UK</tspan> legajo : varchar</text>
                <text x="8" y="62" font-size="7.5" fill="#334155"><tspan fill="#7e22ce" font-weight="bold">UK</tspan> dni : text (RN-01)</text>
                <text x="8" y="76" font-size="7.5" fill="#334155">cuil : varchar</text>
                <text x="8" y="90" font-size="7.5" fill="#334155">first_name, last_name</text>
                <text x="8" y="104" font-size="7.5" fill="#334155">email, phone : varchar</text>
                <text x="8" y="118" font-size="7.5" fill="#334155">revista : Titular/Prov/Int</text>
                <text x="8" y="132" font-size="7.5" fill="#334155">max_weekly_hours : 30 hs</text>
                <text x="8" y="146" font-size="7.5" fill="#334155">is_active : bool (RN-03)</text>
            </g>

            <!-- 7. TABLA: designations (CENTRAL - MULTI-DÍA) -->
            <g transform="translate(340, 160)" filter="url(#shadow)">
                <rect width="140" height="160" rx="5" fill="#fffbeb" stroke="#d97706" stroke-width="2"/>
                <rect width="140" height="22" rx="4" fill="#0f172a"/>
                <text x="70" y="15" text-anchor="middle" fill="#f59e0b" font-size="9" font-weight="bold">designations (Cátedras)</text>
                <text x="8" y="36" font-size="7.5" fill="#334155"><tspan fill="#b45309" font-weight="bold">PK</tspan> id : int</text>
                <text x="8" y="49" font-size="7.5" fill="#334155"><tspan fill="#0369a1" font-weight="bold">FK</tspan> subject_id : int</text>
                <text x="8" y="62" font-size="7.5" fill="#334155"><tspan fill="#0369a1" font-weight="bold">FK</tspan> teacher_id : int</text>
                <text x="8" y="76" font-size="7.5" fill="#b45309" font-weight="bold">day_of_week : L/M/M/J/V</text>
                <text x="8" y="89" font-size="7.5" fill="#334155">start_time, end_time</text>
                <text x="8" y="102" font-size="7.5" fill="#b45309" font-weight="bold">hours_count : int (por día)</text>
                <text x="8" y="115" font-size="7.5" fill="#334155">cargo : varchar</text>
                <text x="8" y="128" font-size="7.5" fill="#334155">revista : TIT/INT/SUP</text>
                <text x="8" y="141" font-size="7.5" fill="#334155">resolution_number</text>
                <text x="8" y="154" font-size="7.5" fill="#334155">is_active : boolean</text>
            </g>

            <!-- 8. TABLA: substitutions -->
            <g transform="translate(340, 360)" filter="url(#shadow)">
                <rect width="145" height="115" rx="5" fill="#ffffff" stroke="#0f172a" stroke-width="1.5"/>
                <rect width="145" height="18" rx="4" fill="#0f172a"/>
                <text x="72" y="13" text-anchor="middle" fill="#f8fafc" font-size="8.5" font-weight="bold">substitutions (Suplencias)</text>
                <text x="8" y="32" font-size="7.5" fill="#334155"><tspan fill="#b45309" font-weight="bold">PK</tspan> id : int</text>
                <text x="8" y="45" font-size="7.5" fill="#334155"><tspan fill="#0369a1" font-weight="bold">FK</tspan> designation_id : int</text>
                <text x="8" y="58" font-size="7.5" fill="#334155"><tspan fill="#0369a1" font-weight="bold">FK</tspan> titular_teacher_id : int</text>
                <text x="8" y="71" font-size="7.5" fill="#334155"><tspan fill="#0369a1" font-weight="bold">FK</tspan> suplente_teacher_id : int</text>
                <text x="8" y="84" font-size="7.5" fill="#334155">license_reason : text (Art 114)</text>
                <text x="8" y="97" font-size="7.5" fill="#334155">start_date, end_date : date</text>
                <text x="8" y="110" font-size="7.5" fill="#334155">resolution_number : varchar</text>
            </g>

            <!-- 9. TABLA: attendances -->
            <g transform="translate(520, 360)" filter="url(#shadow)">
                <rect width="145" height="115" rx="5" fill="#ffffff" stroke="#0f172a" stroke-width="1.5"/>
                <rect width="145" height="18" rx="4" fill="#0f172a"/>
                <text x="72" y="13" text-anchor="middle" fill="#f8fafc" font-size="8.5" font-weight="bold">attendances (Presentismo)</text>
                <text x="8" y="32" font-size="7.5" fill="#334155"><tspan fill="#b45309" font-weight="bold">PK</tspan> id : int</text>
                <text x="8" y="45" font-size="7.5" fill="#334155"><tspan fill="#0369a1" font-weight="bold">FK</tspan> teacher_id : int</text>
                <text x="8" y="58" font-size="7.5" fill="#334155"><tspan fill="#0369a1" font-weight="bold">FK</tspan> designation_id : int (opt)</text>
                <text x="8" y="71" font-size="7.5" fill="#334155">date : date (INDEX)</text>
                <text x="8" y="84" font-size="7.5" fill="#334155">status : PR/I/P/LIC/LT</text>
                <text x="8" y="97" font-size="7.5" fill="#334155">hours : int / registered_by</text>
                <text x="8" y="110" font-size="7.5" fill="#334155">is_active : boolean</text>
            </g>

            <!-- 10. TABLA: institutional_days -->
            <g transform="translate(20, 260)" filter="url(#shadow)">
                <rect width="160" height="75" rx="5" fill="#ffffff" stroke="#7e22ce" stroke-width="1.2"/>
                <rect width="160" height="18" rx="4" fill="#7e22ce"/>
                <text x="80" y="13" text-anchor="middle" fill="#f8fafc" font-size="8.5" font-weight="bold">institutional_days (Jornadas)</text>
                <text x="8" y="32" font-size="7.5" fill="#334155"><tspan fill="#b45309" font-weight="bold">PK</tspan> id : int</text>
                <text x="8" y="44" font-size="7.5" fill="#334155"><tspan fill="#7e22ce" font-weight="bold">UK</tspan> date : text (YYYY-MM-DD)</text>
                <text x="8" y="56" font-size="7.5" fill="#334155">name : text</text>
                <text x="8" y="68" font-size="7.5" fill="#334155">type : jornada/feriado/puente</text>
            </g>
        </svg>
        <div class="diagram-caption">Figura 2: Diagrama de Entidades y Relaciones Normalizado de SIGET (Base de Datos v2.5)</div>
    </div>

    <!-- ==================== PÁGINA 3: DICCIONARIO DE DATOS DETALLADO ==================== -->
    <div class="page-break"></div>

    <div class="doc-header">
        <div>
            <div class="brand-title">SIGET • IESETyFP</div>
            <div class="brand-subtitle">Diccionario de Datos y Especificación de Tablas</div>
        </div>
        <div class="header-badge">Cátedras Multi-Día v2.5</div>
    </div>

    <h2>3. 📋 Tablas Principales y Atributos Clave</h2>

    <div class="avoid-break">
        <h3>1. <code>designations</code> (Cátedras, Horarios y Cargas Dinámicas) <span class="badge-update">Actualizada 14/11/2026</span></h3>
        <p>
            Permite desglosar las materias que se dictan en más de un día a la semana. Cada jornada posee horario de inicio/fin y cómputo de horas cátedra independiente.
        </p>
        <table>
            <thead>
                <tr>
                    <th style="width: 22%;">Campo</th>
                    <th style="width: 18%;">Tipo de Dato</th>
                    <th style="width: 15%;">Restricciones</th>
                    <th>Descripción y Lógica de Negocio</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td><code>id</code></td>
                    <td>INTEGER</td>
                    <td><span class="pk-badge">PK</span> AutoInc</td>
                    <td>Identificador unívoco de la franja horaria/día asignado a la cátedra.</td>
                </tr>
                <tr>
                    <td><code>subject_id</code></td>
                    <td>INTEGER</td>
                    <td><span class="fk-badge">FK</span> NOT NULL</td>
                    <td>Referencia a la materia del plan de estudio (<code>subjects.id</code>).</td>
                </tr>
                <tr>
                    <td><code>teacher_id</code></td>
                    <td>INTEGER</td>
                    <td><span class="fk-badge">FK</span> NOT NULL</td>
                    <td>Referencia al docente asignado al espacio curricular (<code>teachers.id</code>).</td>
                </tr>
                <tr>
                    <td><code>day_of_week</code></td>
                    <td>VARCHAR(20)</td>
                    <td>NOT NULL</td>
                    <td>Día específico de la semana: <em>Lunes, Martes, Miércoles, Jueves, Viernes, Sábado</em>.</td>
                </tr>
                <tr>
                    <td><code>start_time</code></td>
                    <td>VARCHAR(10)</td>
                    <td>NOT NULL</td>
                    <td>Horario de inicio del bloque diario en formato militar (ej. <code>18:00</code>).</td>
                </tr>
                <tr>
                    <td><code>end_time</code></td>
                    <td>VARCHAR(10)</td>
                    <td>NOT NULL</td>
                    <td>Horario de finalización del bloque diario (ej. <code>20:15</code>).</td>
                </tr>
                <tr>
                    <td><code>hours_count</code></td>
                    <td>INTEGER</td>
                    <td>NOT NULL</td>
                    <td>Cantidad de horas cátedra asignadas exclusivamente a ese día (ej. 3 hs el lunes, 1 h el jueves).</td>
                </tr>
                <tr>
                    <td><code>cargo</code></td>
                    <td>VARCHAR(150)</td>
                    <td>NULL</td>
                    <td>Denominación formal del cargo o cátedra para visualización de planillas oficiales.</td>
                </tr>
                <tr>
                    <td><code>revista</code></td>
                    <td>VARCHAR(20)</td>
                    <td>NULL</td>
                    <td>Situación de revista específica para la designación (<code>TIT</code>, <code>INT</code>, <code>SUP</code>). Cumple con RN-02.</td>
                </tr>
                <tr>
                    <td><code>resolution_number</code></td>
                    <td>VARCHAR(100)</td>
                    <td>NULL</td>
                    <td>Número de instrumento legal o resolución de designación ministerial.</td>
                </tr>
                <tr>
                    <td><code>is_active</code></td>
                    <td>BOOLEAN</td>
                    <td>DEFAULT 1</td>
                    <td>Preservación de baja lógica histórica ante ceses o reasignaciones (Regla RN-03).</td>
                </tr>
            </tbody>
        </table>
    </div>

    <div class="avoid-break">
        <h3>2. <code>teachers</code> (Planta Docente / Legajos Institucionales)</h3>
        <table>
            <thead>
                <tr>
                    <th style="width: 22%;">Campo</th>
                    <th style="width: 18%;">Tipo de Dato</th>
                    <th style="width: 15%;">Restricciones</th>
                    <th>Descripción y Lógica de Negocio</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td><code>id</code></td>
                    <td>INTEGER</td>
                    <td><span class="pk-badge">PK</span> AutoInc</td>
                    <td>Identificador primario del docente en SQLite/MySQL.</td>
                </tr>
                <tr>
                    <td><code>legajo</code></td>
                    <td>VARCHAR(30)</td>
                    <td><span class="uk-badge">UK</span> NOT NULL</td>
                    <td>Número de legajo institucional único (ej. <code>DOC-00101</code>, <code>LEG-8001</code>).</td>
                </tr>
                <tr>
                    <td><code>dni</code></td>
                    <td>VARCHAR(20)</td>
                    <td><span class="uk-badge">UK</span> NOT NULL</td>
                    <td>DNI como texto plano sin puntos para preservar ceros a la izquierda (Regla RN-01).</td>
                </tr>
                <tr>
                    <td><code>first_name</code>, <code>last_name</code></td>
                    <td>VARCHAR(100)</td>
                    <td>NOT NULL</td>
                    <td>Nombres y apellidos completos sin números ni caracteres residuales.</td>
                </tr>
                <tr>
                    <td><code>revista</code></td>
                    <td>VARCHAR(30)</td>
                    <td>DEFAULT 'Titular'</td>
                    <td>Condición de revista predeterminada del legajo (Titular, Provisional, Interino, Suplente).</td>
                </tr>
                <tr>
                    <td><code>max_weekly_hours</code></td>
                    <td>INTEGER</td>
                    <td>DEFAULT 30</td>
                    <td>Límite normativo de carga horaria acumulada en nivel superior (tope: 30 hs semanales).</td>
                </tr>
                <tr>
                    <td><code>is_active</code></td>
                    <td>BOOLEAN</td>
                    <td>DEFAULT 1</td>
                    <td>Estado activo del docente. Si registra historial, el borrado físico se bloquea y se aplica baja lógica.</td>
                </tr>
            </tbody>
        </table>
    </div>

    <div class="avoid-break">
        <h3>3. <code>attendances</code> (Control de Presentismo y Novedades Diarias)</h3>
        <table>
            <thead>
                <tr>
                    <th style="width: 22%;">Campo</th>
                    <th style="width: 18%;">Tipo de Dato</th>
                    <th style="width: 15%;">Restricciones</th>
                    <th>Descripción y Lógica de Negocio</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td><code>id</code></td>
                    <td>INTEGER</td>
                    <td><span class="pk-badge">PK</span> AutoInc</td>
                    <td>Identificador único del registro de asistencia.</td>
                </tr>
                <tr>
                    <td><code>teacher_id</code></td>
                    <td>INTEGER</td>
                    <td><span class="fk-badge">FK</span> NOT NULL</td>
                    <td>Docente afectado al cómputo de la jornada (<code>teachers.id</code>).</td>
                </tr>
                <tr>
                    <td><code>designation_id</code></td>
                    <td>INTEGER</td>
                    <td><span class="fk-badge">FK</span> NULL</td>
                    <td>Cátedra específica vinculada a la marca de presentismo o inasistencia.</td>
                </tr>
                <tr>
                    <td><code>date</code></td>
                    <td>DATE</td>
                    <td>NOT NULL (INDEX)</td>
                    <td>Fecha del registro en formato ISO (<code>YYYY-MM-DD</code>).</td>
                </tr>
                <tr>
                    <td><code>status</code></td>
                    <td>VARCHAR(30)</td>
                    <td>NOT NULL</td>
                    <td>Conjunto cerrado: <code>PR</code> (Presente), <code>I</code> (Inasistencia), <code>P</code> (Permiso), <code>LIC</code> (Licencia), <code>LT</code> (En Trámite).</td>
                </tr>
                <tr>
                    <td><code>hours</code></td>
                    <td>INTEGER</td>
                    <td>DEFAULT 4</td>
                    <td>Cantidad de horas cátedra computadas en la fecha.</td>
                </tr>
                <tr>
                    <td><code>observations</code></td>
                    <td>VARCHAR(255)</td>
                    <td>NULL</td>
                    <td>Causal justificada, número de certificado médico oficial o expediente.</td>
                </tr>
                <tr>
                    <td><code>registered_by</code></td>
                    <td>VARCHAR(50)</td>
                    <td>NULL</td>
                    <td>Usuario de Secretaría o Bedelía que consolidó la marca.</td>
                </tr>
            </tbody>
        </table>
    </div>

    <!-- ==================== PÁGINA 4: MATRIZ DE CARDINALIDADES ==================== -->
    <div class="page-break"></div>

    <div class="doc-header">
        <div>
            <div class="brand-title">SIGET • IESETyFP</div>
            <div class="brand-subtitle">Matriz de Cardinalidades y Reglas de Integridad</div>
        </div>
        <div class="header-badge">Especificación Técnica LAN</div>
    </div>

    <h2>4. 🔗 Matriz de Cardinalidades Relacionales</h2>
    <p>
        Relaciones estructurales entre entidades y reglas de negocio aplicadas por el motor de base de datos:
    </p>

    <table>
        <thead>
            <tr>
                <th style="width: 25%;">Relación entre Tablas</th>
                <th style="width: 14%;">Cardinalidad</th>
                <th style="width: 15%;">Tipo de Vínculo</th>
                <th>Regla de Negocio e Integridad Referencial</th>
            </tr>
        </thead>
        <tbody>
            <tr>
                <td><code>careers</code> → <code>subjects</code></td>
                <td><strong>1 : N</strong></td>
                <td>Uno a Muchos</td>
                <td>Una carrera contiene múltiples materias de su plan; una materia pertenece a una única carrera. Cascada restringida si registra cátedras activas.</td>
            </tr>
            <tr>
                <td><code>careers</code> → <code>students</code></td>
                <td><strong>1 : N</strong></td>
                <td>Uno a Muchos</td>
                <td>Una carrera matricula a una cohorte de alumnos; cada legajo estudiantil está vinculado a una carrera activa.</td>
            </tr>
            <tr>
                <td><code>subjects</code> → <code>designations</code></td>
                <td><strong>1 : N</strong></td>
                <td>Uno a Muchos</td>
                <td>Una materia se desglosa en uno o múltiples días semanales mediante registros correlativos de designación.</td>
            </tr>
            <tr>
                <td><code>teachers</code> → <code>designations</code></td>
                <td><strong>1 : N</strong></td>
                <td>Uno a Muchos</td>
                <td>Un docente puede tener múltiples cátedras y días de dictado hasta alcanzar su tope normativo de 30 horas semanales.</td>
            </tr>
            <tr>
                <td><code>teachers</code> ↔ <code>subjects</code></td>
                <td><strong>N : M</strong></td>
                <td>Muchos a Muchos</td>
                <td>Relación indirecta resuelta mediante la tabla intermedia <code>designations</code>, que desglosa día a día la carga horaria y situación de revista.</td>
            </tr>
            <tr>
                <td><code>designations</code> → <code>substitutions</code></td>
                <td><strong>1 : N</strong></td>
                <td>Uno a Muchos</td>
                <td>Una cátedra puede registrar reemplazos de suplencia en distintos períodos lectivos durante licencias del titular.</td>
            </tr>
            <tr>
                <td><code>teachers</code> (Titular) → <code>substitutions</code></td>
                <td><strong>1 : N</strong></td>
                <td>Uno a Muchos</td>
                <td>El docente titular reemplazado en licencia puede registrar múltiples suplencias a lo largo de su carrera.</td>
            </tr>
            <tr>
                <td><code>teachers</code> (Suplente) → <code>substitutions</code></td>
                <td><strong>1 : N</strong></td>
                <td>Uno a Muchos</td>
                <td>Un docente suplente puede cubrir múltiples designaciones independientes en la institución.</td>
            </tr>
            <tr>
                <td><code>teachers</code> → <code>attendances</code></td>
                <td><strong>1 : N</strong></td>
                <td>Uno a Muchos</td>
                <td>Cada docente genera una marca diaria de presentismo por cada jornada hábil del calendario académico.</td>
            </tr>
            <tr>
                <td><code>designations</code> → <code>attendances</code></td>
                <td><strong>1 : N</strong></td>
                <td>Uno a Muchos (Opt)</td>
                <td>Una marca de presentismo o inasistencia puede vincularse opcionalmente a la cátedra específica dictada en el día.</td>
            </tr>
            <tr>
                <td><code>users</code> → <code>audit_logs</code></td>
                <td><strong>1 : N</strong></td>
                <td>Uno a Muchos</td>
                <td>Cada acción crítica (alta, modificación, eliminación o exportación) genera un asiento inmutable de auditoría institucional.</td>
            </tr>
        </tbody>
    </table>

    <div class="callout-box">
        <strong>Integridad Referencial Estricta:</strong> El sistema bloquea automáticamente la eliminación física (<code>DELETE</code>) de cualquier docente o carrera que posea cátedras, suplencias o asistencias históricas asociadas. En su lugar, aplica la <em>Baja Lógica</em> mediante la bandera <code>is_active = 0</code> para garantizar la inmutabilidad de los libros oficiales de inspección.
    </div>

    <div class="doc-footer">
        <div>SIGET v2.5 • Sistema Integrado de Gestión Educativa y Técnica • Documentación Oficial de Base de Datos</div>
        <div>IESETyFP — Catamarca • Generado el 15/11/2026</div>
    </div>

</body>
</html>`;
    }

    static async generateSchemaPdf(outputPath = null) {
        const rootDir = path.resolve(__dirname, '../../');
        const reportesDir = path.join(rootDir, 'reportes');
        if (!fs.existsSync(reportesDir)) fs.mkdirSync(reportesDir, { recursive: true });

        const defaultFileName = 'Esquema_Base_de_Datos_SIGET_14_11_2026.pdf';
        const targetPath = outputPath || path.join(rootDir, defaultFileName);
        const reportesPath = path.join(reportesDir, defaultFileName);

        const html = this.getReportHtml();
        let pdfBuffer;

        try {
            const { BrowserWindow } = require('electron');
            const win = new BrowserWindow({
                show: false,
                webPreferences: {
                    offscreen: true,
                    sandbox: false
                }
            });

            await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

            pdfBuffer = await win.webContents.printToPDF({
                printBackground: true,
                landscape: false,
                pageSize: 'A4',
                margins: {
                    top: 0.35,
                    bottom: 0.35,
                    left: 0.35,
                    right: 0.35
                }
            });

            win.close();

            fs.writeFileSync(targetPath, pdfBuffer);

            if (targetPath !== reportesPath) {
                try {
                    fs.writeFileSync(reportesPath, pdfBuffer);
                } catch (_) {}
            }

            return {
                success: true,
                filePath: targetPath,
                fileName: path.basename(targetPath),
                reportesPath: reportesPath,
                sizeBytes: pdfBuffer.length,
                message: `Documento PDF del Esquema de Base de Datos generado exitosamente en: ${targetPath}`
            };
        } catch (err) {
            console.error('[SchemaPdfService] Error generando PDF con Chromium:', err);
            throw err;
        }
    }
}

module.exports = { SchemaPdfService };
