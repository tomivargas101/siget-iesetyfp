/**
 * SIGET - Frontend Application Controller (Renderer Process)
 * Arquitectura SPA moderna sin recargas ni bloqueos visuales.
 * Sistema de Autenticación, Registro Inicial (First-Run), Recuperación Offline y Gestión de Usuarios.
 */

// ============================================================================
// 1. ESTADO GLOBAL DE LA APLICACIÓN
// ============================================================================
const AppState = {
    currentUser: null,
    currentView: 'dashboard',
    currentTeacherSubtab: 'legajos',
    currentDesigSubtab: 'desig',
    attendanceDate: getTodayDateString(),
    attendanceFilter: 'all',
    careers: [],
    teachersCache: [],
    attendanceRecordsCache: [],
    usersCache: []
};

// ============================================================================
// 2. INICIALIZACIÓN AL CARGAR EL DOM
// ============================================================================
document.addEventListener('DOMContentLoaded', async () => {
    initTheme();
    initLucideIcons();
    updateDateDisplay();
    setupEventListeners();

    // 1. Comprobar si es Primera Ejecución (First-Run Setup)
    try {
        const firstRunRes = await window.sigetApi.auth.checkFirstRun();
        if (firstRunRes && firstRunRes.isFirstRun) {
            showFirstRunOverlay();
            return;
        }

        // 2. Comprobar si existe sesión activa
        const user = await window.sigetApi.auth.getCurrentUser();
        if (user) {
            handleLoginSuccess(user);
        } else {
            showLoginModal();
        }
    } catch (err) {
        console.error('Error al inicializar sesión:', err);
        showLoginModal();
    }
});

// ============================================================================
// GESTIÓN DE TEMA INSTITUCIONAL (CLARO / OSCURO)
// ============================================================================
function applyTheme(theme) {
    const isDark = (theme === 'dark');
    const docEl = document.documentElement;
    const body = document.body;
    const appContainer = document.getElementById('app-container');
    const mainEl = document.querySelector('main');
    const viewsContainer = document.getElementById('views-container');

    if (isDark) {
        docEl.classList.add('dark');
        docEl.setAttribute('data-theme', 'dark');
        body.classList.add('dark', 'dark-mode');
        body.setAttribute('data-theme', 'dark');
        if (appContainer) {
            appContainer.classList.add('dark');
            appContainer.setAttribute('data-theme', 'dark');
        }
        if (mainEl) {
            mainEl.classList.add('dark');
            mainEl.setAttribute('data-theme', 'dark');
        }
        if (viewsContainer) {
            viewsContainer.classList.add('dark');
            viewsContainer.setAttribute('data-theme', 'dark');
        }
        localStorage.setItem('siget-theme', 'dark');
    } else {
        docEl.classList.remove('dark');
        docEl.removeAttribute('data-theme');
        body.classList.remove('dark', 'dark-mode');
        body.removeAttribute('data-theme');
        if (appContainer) {
            appContainer.classList.remove('dark');
            appContainer.removeAttribute('data-theme');
        }
        if (mainEl) {
            mainEl.classList.remove('dark');
            mainEl.removeAttribute('data-theme');
        }
        if (viewsContainer) {
            viewsContainer.classList.remove('dark');
            viewsContainer.removeAttribute('data-theme');
        }
        localStorage.setItem('siget-theme', 'light');
    }

    const themeSwitch = document.getElementById('theme-switch');
    if (themeSwitch) {
        themeSwitch.checked = isDark;
    }
}

function initTheme() {
    const savedTheme = localStorage.getItem('siget-theme') || 'light';
    applyTheme(savedTheme);
}

function initLucideIcons() {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
    }
}

function getTodayDateString() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function updateDateDisplay() {
    const dateElem = document.getElementById('current-date-display');
    if (dateElem) {
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        const now = new Date();
        const formatted = now.toLocaleDateString('es-AR', options);
        dateElem.textContent = formatted.charAt(0).toUpperCase() + formatted.slice(1);
    }
}

// ============================================================================
// 3. LISTENERS DE EVENTOS Y RUTAS
// ============================================================================
function setupEventListeners() {
    // -------------------------------------------------------------
    // Formulario de Login
    // -------------------------------------------------------------
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const usernameInput = document.getElementById('login-username');
            const passwordInput = document.getElementById('login-password');
            const errorDiv = document.getElementById('login-error');
            const submitBtn = document.getElementById('btn-login-submit');

            errorDiv.classList.add('hidden');
            submitBtn.disabled = true;
            submitBtn.innerHTML = `<span>Validando credenciales...</span>`;

            try {
                const res = await window.sigetApi.auth.login(usernameInput.value.trim(), passwordInput.value);
                if (res.success) {
                    handleLoginSuccess(res.user);
                } else {
                    errorDiv.textContent = res.message || 'Credenciales incorrectas.';
                    errorDiv.classList.remove('hidden');
                }
            } catch (err) {
                errorDiv.textContent = 'Error de conexión con el proceso principal.';
                errorDiv.classList.remove('hidden');
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = `<i data-lucide="log-in" class="w-4 h-4"></i><span>Iniciar Sesión</span>`;
                initLucideIcons();
            }
        });
    }

    // -------------------------------------------------------------
    // Botón Ver / Ocultar Contraseña en el Login
    // -------------------------------------------------------------
    const btnToggleLoginPass = document.getElementById('btn-toggle-login-password');
    const inputLoginPass = document.getElementById('login-password');
    if (btnToggleLoginPass && inputLoginPass) {
        btnToggleLoginPass.addEventListener('click', () => {
            const isPassword = inputLoginPass.getAttribute('type') === 'password';
            inputLoginPass.setAttribute('type', isPassword ? 'text' : 'password');
            const icon = document.getElementById('icon-toggle-login-password');
            if (icon) {
                icon.setAttribute('data-lucide', isPassword ? 'eye-off' : 'eye');
                initLucideIcons();
            }
        });
    }

    // -------------------------------------------------------------
    // Botones de Acceso Rápido Oficial (Secretaría y Bedelía)
    // -------------------------------------------------------------
    const btnDemoSec = document.getElementById('btn-demo-secretaria');
    const btnDemoBedel = document.getElementById('btn-demo-bedel');
    const uInput = document.getElementById('login-username');
    const pInput = document.getElementById('login-password');
    if (btnDemoSec && uInput && pInput) {
        btnDemoSec.addEventListener('click', () => {
            uInput.value = 'secretaria';
            pInput.value = 'secretaria123';
            const errorDiv = document.getElementById('login-error');
            if (errorDiv) errorDiv.classList.add('hidden');
        });
    }
    if (btnDemoBedel && uInput && pInput) {
        btnDemoBedel.addEventListener('click', () => {
            uInput.value = 'bedel';
            pInput.value = 'bedel123';
            const errorDiv = document.getElementById('login-error');
            if (errorDiv) errorDiv.classList.add('hidden');
        });
    }

    // -------------------------------------------------------------
    // Enlace "¿Olvidaste tu contraseña?"
    // -------------------------------------------------------------
    const btnForgot = document.getElementById('btn-forgot-password');
    if (btnForgot) {
        btnForgot.addEventListener('click', openRecoveryOverlay);
    }

    // -------------------------------------------------------------
    // Enlace "¿No tienes cuenta? Registrarse"
    // -------------------------------------------------------------
    const btnOpenRegister = document.getElementById('btn-open-register');
    if (btnOpenRegister) {
        btnOpenRegister.addEventListener('click', openRegisterOverlay);
    }

    // -------------------------------------------------------------
    // First-Run Setup Listeners
    // -------------------------------------------------------------
    setupFirstRunListeners();

    // -------------------------------------------------------------
    // Register Account Listeners
    // -------------------------------------------------------------
    setupRegisterListeners();

    // -------------------------------------------------------------
    // Offline Recovery Listeners
    // -------------------------------------------------------------
    setupRecoveryListeners();

    // -------------------------------------------------------------
    // Switch de Modo Oscuro (Ubicado arriba de Cerrar Sesión)
    // -------------------------------------------------------------
    const themeSwitch = document.getElementById('theme-switch');
    if (themeSwitch) {
        themeSwitch.checked = (localStorage.getItem('siget-theme') === 'dark');
        themeSwitch.addEventListener('change', () => {
            applyTheme(themeSwitch.checked ? 'dark' : 'light');
        });
    }

    // -------------------------------------------------------------
    // Botón de Logout
    // -------------------------------------------------------------
    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            await window.sigetApi.auth.logout();
            AppState.currentUser = null;
            showLoginModal();
            showToast('Sesión cerrada correctamente.', 'info');
        });
    }

    // -------------------------------------------------------------
    // Listeners del Módulo de Planillas Excel
    // -------------------------------------------------------------
    const btnPreviewReport = document.getElementById('btn-preview-report');
    if (btnPreviewReport) {
        btnPreviewReport.addEventListener('click', () => previewMonthlyReport(false));
    }
    const btnGenReport = document.getElementById('btn-generate-report');
    if (btnGenReport) {
        btnGenReport.addEventListener('click', generateMonthlyReport);
    }
    const reportYearInput = document.getElementById('report-year');
    const reportMonthSelect = document.getElementById('report-month');
    if (reportYearInput) {
        reportYearInput.addEventListener('change', () => previewMonthlyReport(true));
    }
    if (reportMonthSelect) {
        reportMonthSelect.addEventListener('change', () => previewMonthlyReport(true));
    }

    const btnFilterAll = document.getElementById('btn-preview-filter-all');
    const btnFilterDL01 = document.getElementById('btn-preview-filter-dl01');
    const btnFilterDL02 = document.getElementById('btn-preview-filter-dl02');
    if (btnFilterAll && btnFilterDL01 && btnFilterDL02) {
        btnFilterAll.addEventListener('click', () => setReportPreviewFilter('all'));
        btnFilterDL01.addEventListener('click', () => setReportPreviewFilter('dl01'));
        btnFilterDL02.addEventListener('click', () => setReportPreviewFilter('dl02'));
    }

    // -------------------------------------------------------------
    // Botones de Navegación del Sidebar
    // -------------------------------------------------------------
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.addEventListener('click', () => {
            const view = btn.getAttribute('data-view');
            navigateTo(view);
        });
    });

    // -------------------------------------------------------------
    // Sub-solapas del Módulo Docentes (Legajos, Asistencias, Calendario)
    // -------------------------------------------------------------
    const tabLegajos = document.getElementById('tab-btn-legajos');
    const tabAsistencias = document.getElementById('tab-btn-asistencias');
    const tabCalendario = document.getElementById('tab-btn-calendario');
    if (tabLegajos) tabLegajos.addEventListener('click', () => switchTeacherSubtab('legajos'));
    if (tabAsistencias) tabAsistencias.addEventListener('click', () => switchTeacherSubtab('asistencias'));
    if (tabCalendario) tabCalendario.addEventListener('click', () => switchTeacherSubtab('calendario'));

    // -------------------------------------------------------------
    // Sub-solapas del Módulo Cátedras
    // -------------------------------------------------------------
    const tabDesig = document.getElementById('tab-btn-desig');
    const tabSubst = document.getElementById('tab-btn-subst');
    if (tabDesig && tabSubst) {
        tabDesig.addEventListener('click', () => switchDesigSubtab('desig'));
        tabSubst.addEventListener('click', () => switchDesigSubtab('subst'));
    }

    // -------------------------------------------------------------
    // Filtros y Búsqueda en Docentes
    // -------------------------------------------------------------
    const teacherSearch = document.getElementById('teacher-search');
    const teacherFilterRevista = document.getElementById('teacher-filter-revista');
    if (teacherSearch) teacherSearch.addEventListener('input', debounce(loadTeachers, 250));
    if (teacherFilterRevista) teacherFilterRevista.addEventListener('change', loadTeachers);

    const btnNewTeacher = document.getElementById('btn-new-teacher');
    if (btnNewTeacher) btnNewTeacher.addEventListener('click', () => openTeacherModal());

    // -------------------------------------------------------------
    // Asistencias Diarias: Controles de Fecha y Acciones Rápidas
    // -------------------------------------------------------------
    const attDateInput = document.getElementById('att-date-input');
    const btnAttPrev = document.getElementById('btn-att-prev');
    const btnAttToday = document.getElementById('btn-att-today');
    const btnAttNext = document.getElementById('btn-att-next');
    const attSearch = document.getElementById('att-search');
    const btnAttSaveAll = document.getElementById('btn-att-save-all');
    const btnAttMarkAllPr = document.getElementById('btn-att-mark-all-pr');
    const btnQuickAtt = document.getElementById('btn-quick-attendance');

    if (attDateInput) {
        attDateInput.value = AppState.attendanceDate;
        attDateInput.addEventListener('change', (e) => {
            AppState.attendanceDate = e.target.value;
            loadDailyAttendance();
        });
    }

    if (btnAttPrev) {
        btnAttPrev.addEventListener('click', () => {
            const d = new Date(AppState.attendanceDate + 'T00:00:00');
            d.setDate(d.getDate() - 1);
            AppState.attendanceDate = d.toISOString().split('T')[0];
            if (attDateInput) attDateInput.value = AppState.attendanceDate;
            loadDailyAttendance();
        });
    }

    if (btnAttToday) {
        btnAttToday.addEventListener('click', () => {
            AppState.attendanceDate = getTodayDateString();
            if (attDateInput) attDateInput.value = AppState.attendanceDate;
            loadDailyAttendance();
        });
    }

    if (btnAttNext) {
        btnAttNext.addEventListener('click', () => {
            const d = new Date(AppState.attendanceDate + 'T00:00:00');
            d.setDate(d.getDate() + 1);
            AppState.attendanceDate = d.toISOString().split('T')[0];
            if (attDateInput) attDateInput.value = AppState.attendanceDate;
            loadDailyAttendance();
        });
    }

    if (attSearch) attSearch.addEventListener('input', debounce(filterAttendanceTable, 150));
    if (btnAttSaveAll) btnAttSaveAll.addEventListener('click', saveAllAttendanceRecords);

    if (btnAttMarkAllPr) {
        btnAttMarkAllPr.addEventListener('click', () => {
            markAllVisibleAsPresent();
        });
    }

    // Botones de filtro rápido por estado (Todos, Presentes, Inasistencias, Justificados, Alertas)
    document.querySelectorAll('.att-filter-chip').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.att-filter-chip').forEach(b => {
                b.classList.remove('active', 'bg-slate-900', 'text-gold', 'dark:bg-gold', 'dark:text-slate-900');
                b.classList.add('bg-slate-100', 'text-slate-700', 'dark:bg-zinc-800', 'dark:text-zinc-300');
            });
            const clicked = e.currentTarget;
            clicked.classList.add('active', 'bg-slate-900', 'text-gold', 'dark:bg-gold', 'dark:text-slate-900');
            clicked.classList.remove('bg-slate-100', 'text-slate-700', 'dark:bg-zinc-800', 'dark:text-zinc-300');
            AppState.attendanceFilter = clicked.getAttribute('data-filter') || 'all';
            filterAttendanceTable();
        });
    });

    if (btnQuickAtt) {
        btnQuickAtt.addEventListener('click', () => {
            navigateTo('teachers');
            switchTeacherSubtab('asistencias');
        });
    }

    // -------------------------------------------------------------
    // Cátedras y Suplencias
    // -------------------------------------------------------------
    const desigFilterCareer = document.getElementById('desig-filter-career');
    if (desigFilterCareer) desigFilterCareer.addEventListener('change', loadDesignations);

    const btnNewDesig = document.getElementById('btn-new-designation');
    if (btnNewDesig) btnNewDesig.addEventListener('click', () => openDesignationModal());

    const btnNewCareer = document.getElementById('btn-new-career');
    if (btnNewCareer) btnNewCareer.addEventListener('click', () => openCareerModal());

    const btnEditCareer = document.getElementById('btn-edit-career');
    if (btnEditCareer) {
        btnEditCareer.addEventListener('click', () => {
            const sel = document.getElementById('desig-filter-career');
            const cid = sel ? parseInt(sel.value) : 0;
            if (!cid) {
                showToast('Seleccione una carrera en el menú desplegable para editarla.', 'info');
                return;
            }
            const c = AppState.careers.find(x => x.id === cid);
            if (c) {
                openCareerModal(false, c);
            } else {
                showToast('No se encontró la información de la carrera seleccionada.', 'error');
            }
        });
    }

    const btnDeleteCareer = document.getElementById('btn-delete-career');
    if (btnDeleteCareer) {
        btnDeleteCareer.addEventListener('click', async () => {
            const sel = document.getElementById('desig-filter-career');
            const cid = sel ? parseInt(sel.value) : 0;
            if (!cid) {
                showToast('Seleccione una carrera en el menú desplegable para eliminarla.', 'info');
                return;
            }
            const c = AppState.careers.find(x => x.id === cid);
            if (!c) return;
            if (!confirm(`¿Está seguro de que desea eliminar la carrera "${c.name}" (${c.code})?\n\nEl sistema validará que no posea cátedras activas ni alumnos asociados para preservar la integridad referencial.`)) {
                return;
            }
            try {
                const res = await window.sigetApi.designations.deleteCareer(cid);
                if (res && res.success) {
                    showToast(res.message, 'success');
                    await reloadCareers(0);
                } else {
                    showToast((res && res.message) ? res.message : 'No se pudo eliminar la carrera.', 'error');
                }
            } catch (err) {
                showToast('Error al eliminar carrera: ' + err.message, 'error');
            }
        });
    }

    // -------------------------------------------------------------
    // Calendario Institucional del Profesorado
    // -------------------------------------------------------------
    const btnLoadCal = document.getElementById('btn-load-calendar');
    const calTeacherSelect = document.getElementById('calendar-teacher-select');
    if (btnLoadCal) btnLoadCal.addEventListener('click', loadTeacherCalendar);
    if (calTeacherSelect) calTeacherSelect.addEventListener('change', loadTeacherCalendar);

    // -------------------------------------------------------------
    // Carga Masiva CSV
    // -------------------------------------------------------------
    initCsvImportEvents();

    // -------------------------------------------------------------
    // Gestión de Usuarios (Secretaría)
    // -------------------------------------------------------------
    const btnNewUser = document.getElementById('btn-new-user');
    if (btnNewUser) btnNewUser.addEventListener('click', () => openNewUserModal());

    // Cierre de modal con tecla Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeModal();
    });
}

// ============================================================================
// 4. REGISTRO INICIAL (FIRST-RUN SETUP)
// ============================================================================
function showFirstRunOverlay() {
    const overlay = document.getElementById('first-run-overlay');
    const loginOverlay = document.getElementById('login-overlay');
    const recoveryOverlay = document.getElementById('recovery-overlay');
    const app = document.getElementById('app-container');

    if (loginOverlay) loginOverlay.classList.add('hidden');
    if (recoveryOverlay) recoveryOverlay.classList.add('hidden');
    if (overlay) overlay.classList.remove('hidden');
    if (app) app.classList.add('opacity-10', 'pointer-events-none');

    document.getElementById('first-run-step-form').classList.remove('hidden');
    document.getElementById('first-run-step-key').classList.add('hidden');
    initLucideIcons();
}

function setupFirstRunListeners() {
    const qSelect = document.getElementById('first-run-question-select');
    const qCustom = document.getElementById('first-run-question-custom');

    if (qSelect && qCustom) {
        qSelect.addEventListener('change', (e) => {
            if (e.target.value === 'custom') {
                qCustom.classList.remove('hidden');
                qCustom.required = true;
                qCustom.focus();
            } else {
                qCustom.classList.add('hidden');
                qCustom.required = false;
            }
        });
    }

    const form = document.getElementById('first-run-form');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const errDiv = document.getElementById('first-run-error');
            const submitBtn = document.getElementById('btn-first-run-submit');
            errDiv.classList.add('hidden');

            const pass = document.getElementById('first-run-password').value;
            const confirmPass = document.getElementById('first-run-confirm-password').value;

            if (pass !== confirmPass) {
                errDiv.textContent = 'Las contraseñas no coinciden.';
                errDiv.classList.remove('hidden');
                return;
            }

            const qVal = qSelect.value === 'custom' ? qCustom.value.trim() : qSelect.value;
            if (!qVal) {
                errDiv.textContent = 'Por favor indique una pregunta de seguridad.';
                errDiv.classList.remove('hidden');
                return;
            }

            const payload = {
                fullName: document.getElementById('first-run-fullname').value.trim(),
                username: document.getElementById('first-run-username').value.trim(),
                email: document.getElementById('first-run-email').value.trim(),
                password: pass,
                securityQuestion: qVal,
                securityAnswer: document.getElementById('first-run-answer').value.trim()
            };

            submitBtn.disabled = true;
            submitBtn.innerHTML = `<span>Configurando Sistema...</span>`;

            try {
                const res = await window.sigetApi.auth.firstRunSetup(payload);
                if (res.success) {
                    // Mostrar pantalla de clave de rescate
                    document.getElementById('first-run-step-form').classList.add('hidden');
                    document.getElementById('first-run-step-key').classList.remove('hidden');
                    document.getElementById('first-run-key-display').textContent = res.masterRecoveryKey;

                    // Listener para copiar al portapapeles
                    const copyBtn = document.getElementById('btn-copy-first-run-key');
                    const copyText = document.getElementById('copy-first-run-text');
                    copyBtn.onclick = () => {
                        navigator.clipboard.writeText(res.masterRecoveryKey);
                        copyText.textContent = '¡Copiada!';
                        setTimeout(() => { copyText.textContent = 'Copiar'; }, 2500);
                        showToast('Clave Maestra copiada al portapapeles.', 'success');
                    };

                    // Listener para finalizar
                    const finishBtn = document.getElementById('btn-first-run-finish');
                    finishBtn.onclick = () => {
                        document.getElementById('first-run-overlay').classList.add('hidden');
                        handleLoginSuccess(res.user);
                    };

                    initLucideIcons();
                } else {
                    errDiv.textContent = res.message || 'Error en la configuración inicial.';
                    errDiv.classList.remove('hidden');
                }
            } catch (err) {
                errDiv.textContent = 'Error crítico al procesar la configuración inicial.';
                errDiv.classList.remove('hidden');
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = `<i data-lucide="shield-check" class="w-4 h-4 text-gold"></i><span>Crear Cuenta Maestra y Generar Llave de Rescate</span>`;
                initLucideIcons();
            }
        });
    }
}

// ============================================================================
// 4.5 REGISTRO INSTITUCIONAL DE CUENTAS (REGISTER OVERLAY)
// ============================================================================
function openRegisterOverlay() {
    const loginOverlay = document.getElementById('login-overlay');
    const registerOverlay = document.getElementById('register-overlay');
    const recoveryOverlay = document.getElementById('recovery-overlay');

    if (loginOverlay) loginOverlay.classList.add('hidden');
    if (recoveryOverlay) recoveryOverlay.classList.add('hidden');
    if (registerOverlay) {
        registerOverlay.classList.remove('hidden');
        const form = document.getElementById('register-form');
        if (form) form.reset();
        document.getElementById('register-form').classList.remove('hidden');
        document.getElementById('register-rector-key-result').classList.add('hidden');
        document.getElementById('register-error').classList.add('hidden');
        document.getElementById('register-question-custom').classList.add('hidden');
        document.getElementById('register-rector-hint').classList.add('hidden');
    }
    initLucideIcons();
}

function closeRegisterOverlay() {
    const loginOverlay = document.getElementById('login-overlay');
    const registerOverlay = document.getElementById('register-overlay');

    if (registerOverlay) registerOverlay.classList.add('hidden');
    if (loginOverlay) loginOverlay.classList.remove('hidden');
    initLucideIcons();
}

function setupRegisterListeners() {
    const btnClose = document.getElementById('btn-close-register');
    const btnCancel = document.getElementById('btn-cancel-register');
    if (btnClose) btnClose.addEventListener('click', closeRegisterOverlay);
    if (btnCancel) btnCancel.addEventListener('click', closeRegisterOverlay);

    const roleSelect = document.getElementById('register-role');
    const rectorHint = document.getElementById('register-rector-hint');
    if (roleSelect && rectorHint) {
        roleSelect.addEventListener('change', (e) => {
            if (e.target.value === 'SECRETARIA') {
                rectorHint.classList.remove('hidden');
            } else {
                rectorHint.classList.add('hidden');
            }
        });
    }

    const qSelect = document.getElementById('register-question-select');
    const qCustom = document.getElementById('register-question-custom');
    if (qSelect && qCustom) {
        qSelect.addEventListener('change', (e) => {
            if (e.target.value === 'custom') {
                qCustom.classList.remove('hidden');
                qCustom.required = true;
                qCustom.focus();
            } else {
                qCustom.classList.add('hidden');
                qCustom.required = false;
            }
        });
    }

    const form = document.getElementById('register-form');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const errDiv = document.getElementById('register-error');
            const submitBtn = document.getElementById('btn-submit-register');
            errDiv.classList.add('hidden');

            const pass = document.getElementById('register-password').value;
            const confirmPass = document.getElementById('register-confirm-password').value;

            if (pass !== confirmPass) {
                errDiv.textContent = 'Las contraseñas no coinciden.';
                errDiv.classList.remove('hidden');
                return;
            }

            if (pass.length < 6) {
                errDiv.textContent = 'La contraseña debe tener al menos 6 caracteres.';
                errDiv.classList.remove('hidden');
                return;
            }

            const qVal = qSelect.value === 'custom' ? qCustom.value.trim() : qSelect.value;
            if (!qVal) {
                errDiv.textContent = 'Por favor indique una pregunta secreta.';
                errDiv.classList.remove('hidden');
                return;
            }

            const username = document.getElementById('register-username').value.trim();
            const role = roleSelect ? roleSelect.value : 'BEDEL';

            const payload = {
                fullName: document.getElementById('register-fullname').value.trim(),
                role: role,
                username: username,
                email: document.getElementById('register-email').value.trim(),
                password: pass,
                securityQuestion: qVal,
                securityAnswer: document.getElementById('register-answer').value.trim()
            };

            submitBtn.disabled = true;
            submitBtn.innerHTML = `<span>Registrando usuario...</span>`;

            try {
                const res = await window.sigetApi.auth.register(payload);
                if (res.success) {
                    if (res.masterRecoveryKey) {
                        // Es un Rector: mostrar pantalla de clave de rescate
                        document.getElementById('register-form').classList.add('hidden');
                        document.getElementById('register-rector-key-result').classList.remove('hidden');
                        document.getElementById('register-rector-key-display').textContent = res.masterRecoveryKey;

                        const copyBtn = document.getElementById('btn-copy-register-rector-key');
                        const copyText = document.getElementById('copy-register-rector-text');
                        copyBtn.onclick = () => {
                            navigator.clipboard.writeText(res.masterRecoveryKey);
                            copyText.textContent = '¡Copiada!';
                            setTimeout(() => { copyText.textContent = 'Copiar'; }, 2500);
                            showToast('Clave Maestra copiada al portapapeles.', 'success');
                        };

                        const finishBtn = document.getElementById('btn-finish-register-rector');
                        finishBtn.onclick = () => {
                            closeRegisterOverlay();
                            const loginUserInput = document.getElementById('login-username');
                            const loginPassInput = document.getElementById('login-password');
                            if (loginUserInput) loginUserInput.value = username;
                            if (loginPassInput) {
                                loginPassInput.value = '';
                                loginPassInput.focus();
                            }
                            showToast('Cuenta de Secretaría creada exitosamente. Inicie sesión.', 'success');
                        };
                        initLucideIcons();
                    } else {
                        // Usuario Bedel o Secretario: redirigir directamente al login
                        closeRegisterOverlay();
                        const loginUserInput = document.getElementById('login-username');
                        const loginPassInput = document.getElementById('login-password');
                        if (loginUserInput) loginUserInput.value = username;
                        if (loginPassInput) {
                            loginPassInput.value = '';
                            loginPassInput.focus();
                        }
                        showToast('¡Cuenta registrada con éxito! Ingrese su contraseña para iniciar sesión.', 'success');
                    }
                } else {
                    errDiv.textContent = res.message || 'Error al procesar el registro.';
                    errDiv.classList.remove('hidden');
                }
            } catch (err) {
                errDiv.textContent = 'Error de comunicación al registrar la cuenta.';
                errDiv.classList.remove('hidden');
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = `<i data-lucide="check" class="w-4 h-4"></i><span>Crear Cuenta</span>`;
                initLucideIcons();
            }
        });
    }
}

// ============================================================================
// 5. RECUPERACIÓN DE ACCESO OFFLINE
// ============================================================================
function openRecoveryOverlay() {
    const loginOverlay = document.getElementById('login-overlay');
    const recoveryOverlay = document.getElementById('recovery-overlay');

    if (loginOverlay) loginOverlay.classList.add('hidden');
    if (recoveryOverlay) {
        recoveryOverlay.classList.remove('hidden');
        switchRecoveryTab('question');
    }
    initLucideIcons();
}

function closeRecoveryOverlay() {
    const loginOverlay = document.getElementById('login-overlay');
    const recoveryOverlay = document.getElementById('recovery-overlay');

    if (recoveryOverlay) recoveryOverlay.classList.add('hidden');
    if (loginOverlay) loginOverlay.classList.remove('hidden');
    initLucideIcons();
}

function switchRecoveryTab(tab) {
    const tabBtnQ = document.getElementById('tab-btn-recov-q');
    const tabBtnK = document.getElementById('tab-btn-recov-k');
    const panelQ = document.getElementById('recov-panel-question');
    const panelK = document.getElementById('recov-panel-key');
    const errDiv = document.getElementById('recov-error');

    errDiv.classList.add('hidden');

    if (tab === 'question') {
        tabBtnQ.className = 'flex-1 py-1.5 rounded-md transition text-slate-900 bg-white shadow-xs';
        tabBtnK.className = 'flex-1 py-1.5 rounded-md transition text-slate-500 hover:text-slate-800';
        panelQ.classList.remove('hidden');
        panelK.classList.add('hidden');
        document.getElementById('recov-q-step-1').classList.remove('hidden');
        document.getElementById('recov-q-step-2').classList.add('hidden');
    } else {
        tabBtnK.className = 'flex-1 py-1.5 rounded-md transition text-slate-900 bg-white shadow-xs';
        tabBtnQ.className = 'flex-1 py-1.5 rounded-md transition text-slate-500 hover:text-slate-800';
        panelK.classList.remove('hidden');
        panelQ.classList.add('hidden');
        document.getElementById('recov-k-new-key-box').classList.add('hidden');
    }
    initLucideIcons();
}

function setupRecoveryListeners() {
    const tabBtnQ = document.getElementById('tab-btn-recov-q');
    const tabBtnK = document.getElementById('tab-btn-recov-k');
    const btnClose = document.getElementById('btn-close-recovery');
    const btnCancel = document.getElementById('btn-cancel-recovery');

    if (tabBtnQ) tabBtnQ.addEventListener('click', () => switchRecoveryTab('question'));
    if (tabBtnK) tabBtnK.addEventListener('click', () => switchRecoveryTab('key'));
    if (btnClose) btnClose.addEventListener('click', closeRecoveryOverlay);
    if (btnCancel) btnCancel.addEventListener('click', closeRecoveryOverlay);

    // 1. Método A: Buscar Pregunta de Seguridad
    const btnSearchQ = document.getElementById('btn-recov-q-search');
    if (btnSearchQ) {
        btnSearchQ.addEventListener('click', async () => {
            const username = document.getElementById('recov-q-username').value.trim();
            const errDiv = document.getElementById('recov-error');
            errDiv.classList.add('hidden');

            if (!username) {
                errDiv.textContent = 'Ingrese el nombre de usuario.';
                errDiv.classList.remove('hidden');
                return;
            }

            btnSearchQ.disabled = true;
            try {
                const res = await window.sigetApi.auth.getSecurityQuestion(username);
                if (res.success) {
                    document.getElementById('recov-q-step-1').classList.add('hidden');
                    const step2 = document.getElementById('recov-q-step-2');
                    step2.classList.remove('hidden');
                    document.getElementById('recov-q-display-text').textContent = res.question;
                } else {
                    errDiv.textContent = res.message || 'No se encontró pregunta de seguridad.';
                    errDiv.classList.remove('hidden');
                }
            } catch (err) {
                errDiv.textContent = 'Error al consultar pregunta de seguridad.';
                errDiv.classList.remove('hidden');
            } finally {
                btnSearchQ.disabled = false;
            }
        });
    }

    // 2. Método A: Enviar Respuesta y Nueva Clave
    const formQ = document.getElementById('recov-q-step-2');
    if (formQ) {
        formQ.addEventListener('submit', async (e) => {
            e.preventDefault();
            const errDiv = document.getElementById('recov-error');
            errDiv.classList.add('hidden');

            const username = document.getElementById('recov-q-username').value.trim();
            const answer = document.getElementById('recov-q-answer').value.trim();
            const newPass = document.getElementById('recov-q-newpass').value;
            const confirmPass = document.getElementById('recov-q-confirmpass').value;

            if (newPass !== confirmPass) {
                errDiv.textContent = 'Las contraseñas no coinciden.';
                errDiv.classList.remove('hidden');
                return;
            }

            try {
                const res = await window.sigetApi.auth.recoverBySecurityAnswer({ username, answer, newPassword: newPass });
                if (res.success) {
                    showToast('Contraseña restablecida exitosamente. Inicie sesión.', 'success');
                    closeRecoveryOverlay();
                    document.getElementById('login-username').value = username;
                    document.getElementById('login-password').value = '';
                    document.getElementById('login-password').focus();
                } else {
                    errDiv.textContent = res.message || 'Respuesta incorrecta.';
                    errDiv.classList.remove('hidden');
                }
            } catch (err) {
                errDiv.textContent = 'Error al restablecer contraseña.';
                errDiv.classList.remove('hidden');
            }
        });
    }

    // 3. Método B: Enviar Master Recovery Key
    const formK = document.getElementById('recov-key-form');
    if (formK) {
        formK.addEventListener('submit', async (e) => {
            e.preventDefault();
            const errDiv = document.getElementById('recov-error');
            errDiv.classList.add('hidden');

            const username = document.getElementById('recov-k-username').value.trim();
            const masterKey = document.getElementById('recov-k-key').value.trim();
            const newPass = document.getElementById('recov-k-newpass').value;
            const confirmPass = document.getElementById('recov-k-confirmpass').value;

            if (newPass !== confirmPass) {
                errDiv.textContent = 'Las contraseñas no coinciden.';
                errDiv.classList.remove('hidden');
                return;
            }

            try {
                const res = await window.sigetApi.auth.recoverByMasterKey({ username, masterKey, newPassword: newPass });
                if (res.success) {
                    // Mostrar la nueva Master Key emitida
                    const newKeyBox = document.getElementById('recov-k-new-key-box');
                    const newKeyText = document.getElementById('recov-k-new-key-text');
                    newKeyText.textContent = res.newMasterRecoveryKey;
                    newKeyBox.classList.remove('hidden');

                    document.getElementById('btn-copy-new-recov-key').onclick = () => {
                        navigator.clipboard.writeText(res.newMasterRecoveryKey);
                        showToast('Nueva Clave Maestra copiada al portapapeles.', 'success');
                    };

                    showToast('Acceso restablecido. Se emitió una nueva clave maestra.', 'success');
                    document.getElementById('login-username').value = username;
                } else {
                    errDiv.textContent = res.message || 'Clave de rescate incorrecta.';
                    errDiv.classList.remove('hidden');
                }
            } catch (err) {
                errDiv.textContent = 'Error al verificar la clave de rescate.';
                errDiv.classList.remove('hidden');
            }
        });
    }
}

// ============================================================================
// 6. AUTENTICACIÓN Y ROLES
// ============================================================================
function showLoginModal() {
    const overlay = document.getElementById('login-overlay');
    const firstRunOverlay = document.getElementById('first-run-overlay');
    const recoveryOverlay = document.getElementById('recovery-overlay');
    const app = document.getElementById('app-container');

    if (firstRunOverlay) firstRunOverlay.classList.add('hidden');
    if (recoveryOverlay) recoveryOverlay.classList.add('hidden');
    if (overlay) overlay.classList.remove('hidden');
    if (app) app.classList.add('opacity-10', 'pointer-events-none');
}

function handleLoginSuccess(user) {
    AppState.currentUser = user;
    const overlay = document.getElementById('login-overlay');
    const app = document.getElementById('app-container');

    if (overlay) overlay.classList.add('hidden');
    if (app) app.classList.remove('opacity-10', 'pointer-events-none');

    // Actualizar datos del usuario en Sidebar
    const nameElem = document.getElementById('sidebar-user-name');
    const roleElem = document.getElementById('sidebar-user-role');
    const rawRole = (user.role || '').toUpperCase();
    const userRoleStr = (rawRole === 'SECRETARIO' || rawRole === 'SECRETARIA') ? 'secretaria' : rawRole.toLowerCase();

    if (nameElem) nameElem.textContent = user.fullName || user.full_name || user.username;
    if (roleElem) {
        if (userRoleStr === 'secretaria') {
            roleElem.textContent = 'SECRETARÍA';
            roleElem.className = 'px-2 py-0.5 text-[10px] font-bold rounded bg-purple-900 text-purple-200 uppercase tracking-wider border border-purple-400/40';
        } else {
            roleElem.textContent = 'BEDELÍA';
            roleElem.className = 'px-2 py-0.5 text-[10px] font-bold rounded bg-blue-900 text-blue-200 uppercase tracking-wider border border-blue-400/40';
        }
    }

    // Regla de Perfiles Institucionales (2 Roles Oficiales):
    // 1. Secretaría: Gestión administrativa total (Docentes, Cátedras, Suplencias, Planillas Excel, Gestión de Usuarios, Carga Masiva CSV).
    // 2. Bedelía: Operativa de asistencias, calendario y novedades. Excluye Gestión de Usuarios, Carga Masiva CSV y Planillas Excel.
    const navReports = document.getElementById('nav-btn-reports');
    const navUsers = document.getElementById('nav-btn-users');
    const navCsv = document.getElementById('nav-btn-csv');

    if (userRoleStr === 'secretaria') {
        if (navReports) navReports.classList.remove('hidden');
        if (navUsers) navUsers.classList.remove('hidden');
        if (navCsv) navCsv.classList.remove('hidden');
    } else {
        if (navReports) navReports.classList.add('hidden');
        if (navUsers) navUsers.classList.add('hidden');
        if (navCsv) navCsv.classList.add('hidden');
    }

    // Reasegurar tema activo en el contenedor y vistas
    applyTheme(localStorage.getItem('siget-theme') || 'light');

    // Cargar catálogos iniciales
    loadInitialCatalogs();

    // Navegar al Dashboard de forma instantánea
    navigateTo('dashboard');
    showToast(`Bienvenido/a, ${user.fullName || user.full_name || user.username}`, 'success');
}

async function loadInitialCatalogs() {
    try {
        AppState.careers = await window.sigetApi.designations.getCareers();
        populateCareerDropdowns();
        AppState.teachersCache = await window.sigetApi.teachers.getAll({ activeOnly: true });
    } catch (err) {
        console.error('Error al precargar catálogos:', err);
    }
}

function populateCareerDropdowns(selectedDesigCareerId = null) {
    const desigSel = document.getElementById('desig-filter-career');

    const updateSelect = (sel, forcedVal) => {
        if (!sel) return;
        const currentVal = (forcedVal !== null && forcedVal !== undefined) ? String(forcedVal) : sel.value;
        sel.innerHTML = `<option value="0">Todas las Carreras</option>`;
        AppState.careers.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = `${c.name} (${c.code})`;
            sel.appendChild(opt);
        });
        sel.value = currentVal;
    };

    updateSelect(desigSel, selectedDesigCareerId);
}

async function reloadCareers(selectedCareerId = null) {
    try {
        AppState.careers = await window.sigetApi.designations.getCareers();
        populateCareerDropdowns(selectedCareerId);
        if (selectedCareerId) {
            const desigFilter = document.getElementById('desig-filter-career');
            if (desigFilter) {
                desigFilter.value = String(selectedCareerId);
            }
            if (typeof loadDesignations === 'function') {
                loadDesignations();
            }
        }
    } catch (err) {
        console.error('Error al recargar carreras:', err);
    }
}

/**
 * Navegación Instantánea SPA: Toggles CSS visibility de paneles sin recargas
 */
function navigateTo(viewName) {
    AppState.currentView = viewName;

    // Actualizar botones de navegación en sidebar
    document.querySelectorAll('.nav-item').forEach(btn => {
        const v = btn.getAttribute('data-view');
        if (v === viewName) {
            btn.className = 'nav-item w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-xs font-bold transition bg-slate-900 text-gold shadow-sm border border-gold/30';
        } else {
            btn.className = 'nav-item w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-xs font-bold transition text-slate-600 hover:bg-slate-100';
        }
    });

    // Si se invoca la ruta de calendario, redirigir fluidamente al interior de Docentes
    if (viewName === 'calendar') {
        navigateTo('teachers');
        switchTeacherSubtab('calendario');
        return;
    }

    // Ocultar todas las vistas y mostrar la seleccionada
    document.querySelectorAll('.view-panel').forEach(panel => {
        panel.classList.add('hidden');
    });

    const targetPanel = document.getElementById(`view-${viewName}`);
    if (targetPanel) {
        targetPanel.classList.remove('hidden');
    }

    // Actualizar título de la barra superior
    const titles = {
        dashboard: 'Panel de Control y Métricas',
        teachers: 'Módulo de Docentes y Asistencias',
        designations: 'Gestión de Cátedras, Designaciones y Suplencias',
        'csv-import': 'Módulo de Carga Masiva por Archivos CSV',
        reports: 'Generación Oficial de Planillas Mensuales',
        users: 'Gestión de Usuarios y Accesos Institucionales'
    };
    const titleElem = document.getElementById('topbar-title');
    if (titleElem) titleElem.textContent = titles[viewName] || 'SIGET';

    // Disparar carga de datos en segundo plano
    switch (viewName) {
        case 'dashboard':
            loadDashboard();
            break;
        case 'teachers':
            if (AppState.currentTeacherSubtab === 'legajos') {
                loadTeachers();
            } else if (AppState.currentTeacherSubtab === 'asistencias') {
                loadDailyAttendance();
            } else if (AppState.currentTeacherSubtab === 'calendario') {
                initTeacherCalendar();
            }
            break;
        case 'designations':
            if (AppState.currentDesigSubtab === 'desig') {
                loadDesignations();
            } else {
                loadSubstitutions();
            }
            break;
        case 'csv-import':
            initCsvImport();
            break;
        case 'reports':
            previewMonthlyReport(true);
            break;
        case 'users':
            loadUsers();
            break;
    }

    initLucideIcons();
}

function switchTeacherSubtab(tabName) {
    AppState.currentTeacherSubtab = tabName;
    const btnLegajos = document.getElementById('tab-btn-legajos');
    const btnAsist = document.getElementById('tab-btn-asistencias');
    const btnCal = document.getElementById('tab-btn-calendario');
    const subtabLegajos = document.getElementById('subtab-legajos');
    const subtabAsist = document.getElementById('subtab-asistencias');
    const subtabCal = document.getElementById('subtab-calendario');

    const activeClasses = 'tab-btn active px-4 py-2 text-xs font-bold rounded-lg bg-slate-900 text-gold dark:bg-gold dark:text-slate-900 transition';
    const inactiveClasses = 'tab-btn px-4 py-2 text-xs font-bold rounded-lg text-slate-600 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-zinc-800 transition';

    if (btnLegajos) btnLegajos.className = (tabName === 'legajos') ? activeClasses : inactiveClasses;
    if (btnAsist) btnAsist.className = (tabName === 'asistencias') ? activeClasses : inactiveClasses;
    if (btnCal) btnCal.className = (tabName === 'calendario') ? activeClasses : inactiveClasses;

    if (subtabLegajos) subtabLegajos.classList.toggle('hidden', tabName !== 'legajos');
    if (subtabAsist) subtabAsist.classList.toggle('hidden', tabName !== 'asistencias');
    if (subtabCal) subtabCal.classList.toggle('hidden', tabName !== 'calendario');

    if (tabName === 'legajos') {
        loadTeachers();
    } else if (tabName === 'asistencias') {
        loadDailyAttendance();
    } else if (tabName === 'calendario') {
        initTeacherCalendar();
    }
    initLucideIcons();
}

function switchDesigSubtab(tabName) {
    AppState.currentDesigSubtab = tabName;
    const btnDesig = document.getElementById('tab-btn-desig');
    const btnSubst = document.getElementById('tab-btn-subst');
    const subtabDesig = document.getElementById('subtab-desig');
    const subtabSubst = document.getElementById('subtab-subst');

    if (tabName === 'desig') {
        btnDesig.className = 'desig-tab-btn active px-4 py-2 text-xs font-bold rounded-lg bg-slate-900 text-gold transition';
        btnSubst.className = 'desig-tab-btn px-4 py-2 text-xs font-bold rounded-lg text-slate-600 hover:bg-slate-200 transition';
        subtabDesig.classList.remove('hidden');
        subtabSubst.classList.add('hidden');
        loadDesignations();
    } else {
        btnDesig.className = 'desig-tab-btn px-4 py-2 text-xs font-bold rounded-lg text-slate-600 hover:bg-slate-200 transition';
        btnSubst.className = 'desig-tab-btn active px-4 py-2 text-xs font-bold rounded-lg bg-slate-900 text-gold transition';
        subtabDesig.classList.add('hidden');
        subtabSubst.classList.remove('hidden');
        loadSubstitutions();
    }
    initLucideIcons();
}

// ============================================================================
// 7. VISTA: GESTIÓN DE USUARIOS Y ROLES (RECTOR)
// ============================================================================
async function loadUsers() {
    const tbody = document.getElementById('tbody-users');
    if (!tbody) return;

    try {
        const users = await window.sigetApi.users.getAll();
        AppState.usersCache = users;

        if (users.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" class="text-center py-8 text-slate-400 italic">No existen usuarios registrados.</td></tr>`;
            return;
        }

        tbody.innerHTML = users.map(u => {
            const roleLabels = {
                RECTOR: 'Rector',
                SECRETARIA: 'Secretaría',
                SECRETARIO: 'Secretaría',
                BEDEL: 'Bedelía'
            };
            const roleBadges = {
                RECTOR: 'bg-slate-900 text-gold border-gold/40',
                SECRETARIA: 'bg-purple-50 text-purple-700 border-purple-200',
                SECRETARIO: 'bg-purple-50 text-purple-700 border-purple-200',
                BEDEL: 'bg-blue-50 text-blue-700 border-blue-200'
            };
            const displayRole = roleLabels[u.role] || u.role;

            const statusBadge = u.isActive ? 
                `<span class="badge-status bg-emerald-50 text-emerald-700 border-emerald-200">Activo</span>` : 
                `<span class="badge-status bg-slate-100 text-slate-500 border-slate-300">Inactivo</span>`;

            const securityBadge = u.hasRecoveryKey ? 
                `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 flex items-center justify-center space-x-1" title="Master Recovery Key Activa">
                    <i data-lucide="key" class="w-3 h-3"></i><span>Master Key</span>
                 </span>` : 
                (u.hasSecurityQuestion ? 
                    `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">Pregunta OK</span>` : 
                    `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">Sin Pregunta</span>`);

            return `
                <tr class="hover:bg-slate-50 transition border-b border-slate-100 text-xs">
                    <td class="py-2.5 px-3 text-center font-mono font-bold text-slate-800">${escapeHtml(u.username)}</td>
                    <td class="py-2.5 px-3">
                        <div class="font-bold text-slate-900">${escapeHtml(u.fullName)}</div>
                    </td>
                    <td class="py-2.5 px-3 text-center">
                        <span class="px-2.5 py-0.5 rounded text-[10px] font-bold border ${roleBadges[u.role] || 'bg-slate-100 text-slate-700'}">
                            ${escapeHtml(displayRole)}
                        </span>
                    </td>
                    <td class="py-2.5 px-3 text-slate-600">${escapeHtml(u.email || '—')}</td>
                    <td class="py-2.5 px-3 text-center">${statusBadge}</td>
                    <td class="py-2.5 px-3 text-center text-slate-500 font-mono text-[11px]">${escapeHtml(u.lastLogin)}</td>
                    <td class="py-2.5 px-3 text-center">${securityBadge}</td>
                    <td class="py-2.5 px-3 text-center">
                        <div class="flex items-center justify-center space-x-1.5">
                            <button onclick="promptResetPassword(${u.id}, '${escapeHtml(u.username)}')" title="Blanquear Contraseña" class="p-1 rounded text-amber-600 hover:text-amber-800 hover:bg-amber-50">
                                <i data-lucide="key-round" class="w-4 h-4"></i>
                            </button>
                            <button onclick="editUserModal(${u.id})" title="Editar Usuario" class="p-1 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-100">
                                <i data-lucide="edit-3" class="w-4 h-4"></i>
                            </button>
                            <button onclick="toggleUserActive(${u.id})" title="${u.isActive ? 'Desactivar perfil' : 'Reactivar'}" class="p-1 rounded text-slate-500 hover:text-${u.isActive ? 'red' : 'emerald'}-600 hover:bg-slate-100">
                                <i data-lucide="${u.isActive ? 'user-x' : 'user-check'}" class="w-4 h-4"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        initLucideIcons();
    } catch (err) {
        console.error('Error al cargar usuarios:', err);
        showToast('Error al cargar la lista de usuarios.', 'error');
    }
}

function openNewUserModal() {
    const modalHtml = `
        <div class="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
            <h3 class="text-sm font-bold text-slate-900 flex items-center space-x-2">
                <i data-lucide="user-plus" class="w-4 h-4 text-gold"></i>
                <span>Nuevo Usuario Institucional</span>
            </h3>
            <button onclick="closeModal()" class="text-slate-400 hover:text-slate-700">✕</button>
        </div>

        <form id="new-user-form" class="space-y-3">
            <div class="grid grid-cols-2 gap-3">
                <div>
                    <label class="block text-[11px] font-bold text-slate-700 uppercase mb-1">Usuario *</label>
                    <input type="text" id="modal-u-username" required placeholder="ej. bedel2"
                        class="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold">
                </div>
                <div>
                    <label class="block text-[11px] font-bold text-slate-700 uppercase mb-1">Rol Institucional *</label>
                    <select id="modal-u-role" class="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg font-bold">
                        <option value="SECRETARIA">Secretaría</option>
                        <option value="BEDEL">Bedelía</option>
                    </select>
                </div>
            </div>

            <div>
                <label class="block text-[11px] font-bold text-slate-700 uppercase mb-1">Nombre Completo *</label>
                <input type="text" id="modal-u-fullname" required placeholder="Nombre y Apellido del personal"
                    class="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold">
            </div>

            <div>
                <label class="block text-[11px] font-bold text-slate-700 uppercase mb-1">Correo Electrónico</label>
                <input type="email" id="modal-u-email" placeholder="usuario@instituto.edu.ar"
                    class="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold">
            </div>

            <div class="grid grid-cols-2 gap-3">
                <div>
                    <label class="block text-[11px] font-bold text-slate-700 uppercase mb-1">Contraseña Inicial *</label>
                    <input type="password" id="modal-u-password" required minlength="6" placeholder="Mínimo 6 caract."
                        class="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold">
                </div>
                <div>
                    <label class="block text-[11px] font-bold text-slate-700 uppercase mb-1">Confirmar *</label>
                    <input type="password" id="modal-u-confirm" required minlength="6" placeholder="Repetir clave"
                        class="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold">
                </div>
            </div>

            <div class="pt-2 border-t border-slate-100 space-y-2">
                <div class="text-[11px] font-bold text-slate-500">Recuperación (Opcional)</div>
                <input type="text" id="modal-u-question" placeholder="Pregunta de Seguridad..."
                    class="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg">
                <input type="text" id="modal-u-answer" placeholder="Respuesta Secreta..."
                    class="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg">
            </div>

            <div id="modal-u-error" class="hidden p-2 rounded bg-red-50 text-red-700 text-xs"></div>

            <div class="pt-3 border-t border-slate-100 flex justify-end space-x-2">
                <button type="button" onclick="closeModal()" class="px-4 py-2 border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-50">Cancelar</button>
                <button type="submit" class="btn-gold px-4 py-2 text-xs font-bold shadow-sm">Crear Perfil</button>
            </div>
        </form>
    `;

    openModal(modalHtml, () => {
        const form = document.getElementById('new-user-form');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const errDiv = document.getElementById('modal-u-error');
            errDiv.classList.add('hidden');

            const pass = document.getElementById('modal-u-password').value;
            const confirm = document.getElementById('modal-u-confirm').value;

            if (pass !== confirm) {
                errDiv.textContent = 'Las contraseñas no coinciden.';
                errDiv.classList.remove('hidden');
                return;
            }

            const payload = {
                username: document.getElementById('modal-u-username').value.trim(),
                role: document.getElementById('modal-u-role').value,
                fullName: document.getElementById('modal-u-fullname').value.trim(),
                email: document.getElementById('modal-u-email').value.trim(),
                password: pass,
                securityQuestion: document.getElementById('modal-u-question').value.trim(),
                securityAnswer: document.getElementById('modal-u-answer').value.trim()
            };

            try {
                const res = await window.sigetApi.users.create(payload);
                if (res.success) {
                    showToast(res.message || 'Usuario creado exitosamente.', 'success');
                    closeModal();
                    loadUsers();
                } else {
                    errDiv.textContent = res.message || 'Error al crear usuario.';
                    errDiv.classList.remove('hidden');
                }
            } catch (err) {
                errDiv.textContent = 'Error de comunicación al crear usuario.';
                errDiv.classList.remove('hidden');
            }
        });
    });
}

window.editUserModal = async function(id) {
    try {
        const user = await window.sigetApi.users.getById(id);
        if (!user) {
            showToast('Usuario no encontrado.', 'error');
            return;
        }

        const modalHtml = `
            <div class="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                <h3 class="text-sm font-bold text-slate-900">Editar Usuario: ${escapeHtml(user.username)}</h3>
                <button onclick="closeModal()" class="text-slate-400 hover:text-slate-700">✕</button>
            </div>

            <form id="edit-user-form" class="space-y-3">
                <div>
                    <label class="block text-[11px] font-bold text-slate-700 uppercase mb-1">Nombre Completo *</label>
                    <input type="text" id="modal-edit-fullname" required value="${escapeHtml(user.fullName)}"
                        class="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg">
                </div>

                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="block text-[11px] font-bold text-slate-700 uppercase mb-1">Rol *</label>
                        <select id="modal-edit-role" class="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg font-bold">
                            <option value="SECRETARIA" ${(user.role === 'SECRETARIA' || user.role === 'SECRETARIO') ? 'selected' : ''}>Secretaría</option>
                            <option value="BEDEL" ${user.role === 'BEDEL' ? 'selected' : ''}>Bedelía</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-[11px] font-bold text-slate-700 uppercase mb-1">Estado</label>
                        <select id="modal-edit-status" class="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg">
                            <option value="1" ${user.isActive ? 'selected' : ''}>Activo</option>
                            <option value="0" ${!user.isActive ? 'selected' : ''}>Inactivo</option>
                        </select>
                    </div>
                </div>

                <div>
                    <label class="block text-[11px] font-bold text-slate-700 uppercase mb-1">Correo Electrónico</label>
                    <input type="email" id="modal-edit-email" value="${escapeHtml(user.email || '')}"
                        class="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg">
                </div>

                <div id="modal-edit-error" class="hidden p-2 rounded bg-red-50 text-red-700 text-xs"></div>

                <div class="pt-3 border-t border-slate-100 flex justify-end space-x-2">
                    <button type="button" onclick="closeModal()" class="px-4 py-2 border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-50">Cancelar</button>
                    <button type="submit" class="btn-gold px-4 py-2 text-xs font-bold shadow-sm">Guardar Cambios</button>
                </div>
            </form>
        `;

        openModal(modalHtml, () => {
            const form = document.getElementById('edit-user-form');
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                const errDiv = document.getElementById('modal-edit-error');
                errDiv.classList.add('hidden');

                const payload = {
                    fullName: document.getElementById('modal-edit-fullname').value.trim(),
                    role: document.getElementById('modal-edit-role').value,
                    email: document.getElementById('modal-edit-email').value.trim(),
                    isActive: document.getElementById('modal-edit-status').value === '1'
                };

                try {
                    const res = await window.sigetApi.users.update(id, payload);
                    if (res.success) {
                        showToast(res.message, 'success');
                        closeModal();
                        loadUsers();
                    } else {
                        errDiv.textContent = res.message || 'Error al actualizar.';
                        errDiv.classList.remove('hidden');
                    }
                } catch (err) {
                    errDiv.textContent = 'Error de comunicación al actualizar.';
                    errDiv.classList.remove('hidden');
                }
            });
        });
    } catch (err) {
        showToast('Error al cargar datos del usuario.', 'error');
    }
};

window.promptResetPassword = function(userId, username) {
    const modalHtml = `
        <div class="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
            <h3 class="text-sm font-bold text-slate-900 flex items-center space-x-2">
                <i data-lucide="key-round" class="w-4 h-4 text-amber-600"></i>
                <span>Blanquear Contraseña: ${escapeHtml(username)}</span>
            </h3>
            <button onclick="closeModal()" class="text-slate-400 hover:text-slate-700">✕</button>
        </div>

        <form id="reset-pass-form" class="space-y-3">
            <p class="text-xs text-slate-500">
                Como Secretaría, puede establecer de manera inmediata una nueva contraseña para el usuario <strong>${escapeHtml(username)}</strong>.
            </p>

            <div>
                <label class="block text-[11px] font-bold text-slate-700 uppercase mb-1">Nueva Contraseña *</label>
                <input type="password" id="modal-reset-pass" required minlength="6" placeholder="Mínimo 6 caracteres"
                    class="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold">
            </div>

            <div>
                <label class="block text-[11px] font-bold text-slate-700 uppercase mb-1">Confirmar Nueva Contraseña *</label>
                <input type="password" id="modal-reset-confirm" required minlength="6" placeholder="Repetir clave"
                    class="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold">
            </div>

            <div id="modal-reset-error" class="hidden p-2 rounded bg-red-50 text-red-700 text-xs"></div>

            <div class="pt-3 border-t border-slate-100 flex justify-end space-x-2">
                <button type="button" onclick="closeModal()" class="px-4 py-2 border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-50">Cancelar</button>
                <button type="submit" class="bg-amber-600 hover:bg-amber-700 text-white font-bold px-4 py-2 text-xs rounded-lg shadow-sm">
                    Blanquear Clave
                </button>
            </div>
        </form>
    `;

    openModal(modalHtml, () => {
        const form = document.getElementById('reset-pass-form');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const errDiv = document.getElementById('modal-reset-error');
            errDiv.classList.add('hidden');

            const p1 = document.getElementById('modal-reset-pass').value;
            const p2 = document.getElementById('modal-reset-confirm').value;

            if (p1 !== p2) {
                errDiv.textContent = 'Las contraseñas no coinciden.';
                errDiv.classList.remove('hidden');
                return;
            }

            try {
                const res = await window.sigetApi.users.resetPassword(userId, p1);
                if (res.success) {
                    showToast(res.message, 'success');
                    closeModal();
                } else {
                    errDiv.textContent = res.message || 'Error al blanquear.';
                    errDiv.classList.remove('hidden');
                }
            } catch (err) {
                errDiv.textContent = 'Error de comunicación.';
                errDiv.classList.remove('hidden');
            }
        });
    });
};

window.toggleUserActive = async function(id) {
    try {
        const res = await window.sigetApi.users.toggleActive(id);
        if (res.success) {
            showToast(res.message, 'success');
            loadUsers();
        } else {
            showToast(res.message || 'No se pudo cambiar el estado.', 'error');
        }
    } catch (err) {
        showToast('Error al modificar estado.', 'error');
    }
};

// ============================================================================
// 8. VISTA: DASHBOARD Y MÉTRICAS
// ============================================================================
async function loadDashboard() {
    try {
        const stats = await window.sigetApi.dashboard.getStats();
        if (!stats) return;

        // 1. Renderizar KPIs
        const kpisContainer = document.getElementById('dashboard-kpis');
        if (kpisContainer) {
            kpisContainer.innerHTML = `
                <div class="kpi-card flex items-center justify-between">
                    <div>
                        <div class="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Docentes Activos</div>
                        <div class="text-2xl font-black text-slate-900 mt-1">${stats.totalTeachers || 0}</div>
                    </div>
                    <div class="w-10 h-10 rounded-lg bg-gold/15 text-gold-text flex items-center justify-center font-bold">
                        <i data-lucide="users" class="w-5 h-5"></i>
                    </div>
                </div>

                <div class="kpi-card flex items-center justify-between">
                    <div>
                        <div class="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Horas Semanales</div>
                        <div class="text-2xl font-black text-slate-900 mt-1">${stats.totalWeeklyHours || 0} hs</div>
                    </div>
                    <div class="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                        <i data-lucide="clock" class="w-5 h-5"></i>
                    </div>
                </div>

                <div class="kpi-card flex items-center justify-between">
                    <div>
                        <div class="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Cátedras Asignadas</div>
                        <div class="text-2xl font-black text-slate-900 mt-1">${stats.totalDesignations || 0}</div>
                    </div>
                    <div class="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                        <i data-lucide="book-open" class="w-5 h-5"></i>
                    </div>
                </div>

                <div class="kpi-card flex items-center justify-between">
                    <div>
                        <div class="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Suplencias Activas</div>
                        <div class="text-2xl font-black text-amber-600 mt-1">${(stats.activeSubstitutions || []).length}</div>
                    </div>
                    <div class="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
                        <i data-lucide="user-check" class="w-5 h-5"></i>
                    </div>
                </div>
            `;
        }

        // 2. Suplencias Vigentes
        const substList = document.getElementById('dashboard-substitutions-list');
        if (substList) {
            const subs = stats.activeSubstitutions || [];
            if (subs.length === 0) {
                substList.innerHTML = `<div class="text-slate-400 italic py-2 text-center">No hay suplencias activas registradas en este período.</div>`;
            } else {
                substList.innerHTML = subs.map(s => `
                    <div class="p-2.5 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-between">
                        <div>
                            <div class="font-bold text-slate-800">${escapeHtml(s.subjectName || 'Cátedra')}</div>
                            <div class="text-[11px] text-slate-500 mt-0.5">
                                <span class="font-semibold text-slate-700">Suplente:</span> ${escapeHtml(s.suplenteName)} 
                                <span class="text-slate-400">|</span> 
                                <span class="text-slate-600">Titular:</span> ${escapeHtml(s.titularName)}
                            </div>
                        </div>
                        <div class="text-right">
                            <span class="inline-block px-2 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-800 rounded">
                                Hasta: ${escapeHtml(s.endDateStr || 'Vigente')}
                            </span>
                        </div>
                    </div>
                `).join('');
            }
        }

        // 3. Estado de Asistencia del Día
        const attStats = document.getElementById('dashboard-attendance-stats');
        if (attStats) {
            const todayStats = stats.todayStats || { presentes: 0, ausentes: 0, licencias: 0, sinRegistrar: 0 };
            attStats.innerHTML = `
                <div class="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                    <div class="text-[10px] font-bold text-emerald-800 uppercase">Presentes Hoy</div>
                    <div class="text-xl font-black text-emerald-700 mt-1">${todayStats.presentes}</div>
                </div>
                <div class="p-3 rounded-lg bg-rose-50 border border-rose-200">
                    <div class="text-[10px] font-bold text-rose-800 uppercase">Ausentes</div>
                    <div class="text-xl font-black text-rose-700 mt-1">${todayStats.ausentes}</div>
                </div>
                <div class="p-3 rounded-lg bg-amber-50 border border-amber-200">
                    <div class="text-[10px] font-bold text-amber-800 uppercase">Licencias</div>
                    <div class="text-xl font-black text-amber-700 mt-1">${todayStats.licencias}</div>
                </div>
                <div class="p-3 rounded-lg bg-slate-100 border border-slate-200">
                    <div class="text-[10px] font-bold text-slate-600 uppercase">Sin Registrar</div>
                    <div class="text-xl font-black text-slate-800 mt-1">${todayStats.sinRegistrar}</div>
                </div>
            `;
        }

        // 4. Alertas de Inasistencias y Topes Anuales (v2.0)
        const alertsContainer = document.getElementById('dashboard-attendance-alerts');
        if (alertsContainer) {
            renderDashboardAlertsHtml(alertsContainer, stats.attendanceAlerts || []);
        }

        // 5. Auditoría Reciente
        const auditList = document.getElementById('dashboard-audit-logs');
        if (auditList) {
            const audits = stats.recentAudits || [];
            if (audits.length === 0) {
                auditList.innerHTML = `<div class="text-slate-400 italic py-2">Sin actividad reciente registrada.</div>`;
            } else {
                auditList.innerHTML = audits.map(log => `
                    <div class="flex items-start space-x-2 py-1 border-b border-slate-100 last:border-0">
                        <span class="text-slate-400 text-[10px] whitespace-nowrap">${escapeHtml(log.timestampStr || '')}</span>
                        <span class="text-slate-800 font-semibold">[${escapeHtml(log.username || 'SISTEMA')}]:</span>
                        <span class="text-slate-600 flex-1 truncate">${escapeHtml(log.details || log.action)}</span>
                    </div>
                `).join('');
            }
        }

        initLucideIcons();
    } catch (err) {
        console.error('Error al cargar dashboard:', err);
    }
}

// ============================================================================
// 9. MÓDULO: DOCENTES Y LEGAJOS (RN-01, RN-02)
// ============================================================================
async function loadTeachers() {
    const tbody = document.getElementById('tbody-teachers');
    if (!tbody) return;

    const searchInput = document.getElementById('teacher-search');
    const filterRevista = document.getElementById('teacher-filter-revista');

    const searchTerm = searchInput ? searchInput.value.trim() : '';
    const revistaFilter = filterRevista ? filterRevista.value : 'Todos';

    try {
        const teachers = await window.sigetApi.teachers.getAll({ searchTerm, revistaFilter });
        AppState.teachersCache = teachers;

        if (teachers.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-slate-400 italic">No se encontraron docentes registrados con ese criterio.</td></tr>`;
            return;
        }

        tbody.innerHTML = teachers.map(t => {
            const activeHours = t.activeHours || 0;
            const maxHours = t.maxWeeklyHours || 30;
            const isAtCap = activeHours >= maxHours;
            const hoursClass = isAtCap ? 'text-rose-600 font-black' : (activeHours >= 24 ? 'text-amber-600 font-bold' : 'text-slate-700 font-medium');
            const statusBadge = t.isActive ? 
                `<span class="badge-status bg-emerald-50 text-emerald-700 border-emerald-200">Activo</span>` : 
                `<span class="badge-status bg-slate-100 text-slate-500 border-slate-300">Inactivo</span>`;

            return `
                <tr class="hover:bg-slate-50 transition border-b border-slate-100 text-xs">
                    <td class="py-2.5 px-3 text-center font-mono font-bold text-slate-600">${escapeHtml(t.legajo || 'S/L')}</td>
                    <td class="py-2.5 px-3">
                        <div class="font-bold text-slate-900">${escapeHtml(t.fullName || `${t.lastName}, ${t.firstName}`)}</div>
                        <div class="text-[11px] text-slate-400">${escapeHtml(t.email || t.phone || 'Docente')}</div>
                    </td>
                    <td class="py-2.5 px-3 text-center font-mono text-slate-700 font-medium">${escapeHtml(t.dni || '')}</td>
                    <td class="py-2.5 px-3 text-center">
                        <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                            ${escapeHtml(t.revista || 'Titular')}
                        </span>
                    </td>
                    <td class="py-2.5 px-3">
                        <span class="${hoursClass}">${activeHours} / ${maxHours} hs</span>
                        <div class="w-full bg-slate-100 rounded-full h-1.5 mt-1 overflow-hidden">
                            <div class="${isAtCap ? 'bg-rose-500' : 'bg-gold'}" style="width: ${Math.min(100, (activeHours / maxHours) * 100)}%"></div>
                        </div>
                    </td>
                    <td class="py-2.5 px-3 text-center">${statusBadge}</td>
                    <td class="py-2.5 px-3 text-center">
                        <div class="flex items-center justify-center space-x-1">
                            <button onclick="editTeacher(${t.id})" title="Editar Legajo" class="p-1 rounded text-slate-500 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-zinc-800">
                                <i data-lucide="edit-3" class="w-4 h-4"></i>
                            </button>
                            <button onclick="toggleTeacherActive(${t.id})" title="${t.isActive ? 'Dar de baja lógica' : 'Reactivar'}" class="p-1 rounded text-slate-500 hover:text-${t.isActive ? 'amber' : 'emerald'}-600 hover:bg-slate-100 dark:hover:bg-zinc-800">
                                <i data-lucide="${t.isActive ? 'user-x' : 'user-check'}" class="w-4 h-4"></i>
                            </button>
                            <button onclick="deleteTeacher(${t.id})" title="Eliminar registro duplicado o erróneo" class="p-1 rounded text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-zinc-800">
                                <i data-lucide="trash-2" class="w-4 h-4"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        initLucideIcons();
    } catch (err) {
        console.error('Error al cargar docentes:', err);
        showToast('Error al cargar la lista de docentes.', 'error');
    }
}

window.editTeacher = async function(id) {
    try {
        const teacher = await window.sigetApi.teachers.getById(id);
        if (teacher) {
            openTeacherModal(teacher);
        }
    } catch (err) {
        showToast('Error al recuperar datos del docente.', 'error');
    }
};

window.toggleTeacherActive = async function(id) {
    try {
        const res = await window.sigetApi.teachers.toggleActive(id);
        if (res.success) {
            showToast(`Estado del docente actualizado.`, 'success');
            loadTeachers();
        } else {
            showToast(res.message || 'No se pudo actualizar el estado.', 'error');
        }
    } catch (err) {
        showToast('Error al modificar estado.', 'error');
    }
};

window.deleteTeacher = async function(id) {
    const t = AppState.teachersCache.find(x => x.id === id);
    const teacherName = t ? `${t.lastName}, ${t.firstName}` : `ID ${id}`;
    if (!confirm(`¿Está seguro de que desea eliminar definitivamente al docente ${teacherName}?\n\nSi el docente registra cátedras, suplencias o asistencias históricas, el sistema requerirá la baja lógica institucional para salvaguardar la integridad de los datos.`)) {
        return;
    }
    try {
        const res = await window.sigetApi.teachers.delete(id);
        if (res && res.success) {
            showToast(res.message, 'success');
            loadTeachers();
        } else {
            showToast((res && res.message) ? res.message : 'No se pudo eliminar el docente.', 'error');
        }
    } catch (err) {
        showToast('Error al eliminar docente: ' + err.message, 'error');
    }
};

function openTeacherModal(teacher = null) {
    const isEdit = !!teacher;
    const title = isEdit ? 'Editar Legajo Docente' : 'Nuevo Docente Institucional';

    const modalHtml = `
        <div class="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
            <h3 class="text-sm font-bold text-slate-900">${title}</h3>
            <button onclick="closeModal()" class="text-slate-400 hover:text-slate-700">✕</button>
        </div>

        <form id="teacher-form" class="space-y-3">
            <input type="hidden" id="modal-teacher-id" value="${teacher ? teacher.id : ''}">

            <div class="grid grid-cols-2 gap-3">
                <div>
                    <label class="block text-[11px] font-bold text-slate-700 uppercase mb-1">DNI (como texto) *</label>
                    <input type="text" id="modal-teacher-dni" required value="${teacher ? escapeHtml(teacher.dni) : ''}"
                        placeholder="Ej. 08456123" class="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg">
                </div>
                <div>
                    <label class="block text-[11px] font-bold text-slate-700 uppercase mb-1">N° de Legajo</label>
                    <input type="text" id="modal-teacher-legajo" value="${teacher ? escapeHtml(teacher.legajo || '') : ''}"
                        placeholder="Ej. L-1045" class="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg">
                </div>
            </div>

            <div class="grid grid-cols-2 gap-3">
                <div>
                    <label class="block text-[11px] font-bold text-slate-700 uppercase mb-1">Apellido(s) *</label>
                    <input type="text" id="modal-teacher-lastname" required value="${teacher ? escapeHtml(teacher.lastName || teacher.last_name || '') : ''}"
                        placeholder="Ej. PÉREZ" class="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg">
                </div>
                <div>
                    <label class="block text-[11px] font-bold text-slate-700 uppercase mb-1">Nombre(s) *</label>
                    <input type="text" id="modal-teacher-firstname" required value="${teacher ? escapeHtml(teacher.firstName || teacher.first_name || '') : ''}"
                        placeholder="Ej. Juan Carlos" class="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg">
                </div>
            </div>

            <div class="grid grid-cols-2 gap-3">
                <div>
                    <label class="block text-[11px] font-bold text-slate-700 uppercase mb-1">Situación de Revista</label>
                    <select id="modal-teacher-revista" class="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg">
                        <option value="Titular" ${teacher && teacher.revista === 'Titular' ? 'selected' : ''}>Titular</option>
                        <option value="Provisional" ${teacher && teacher.revista === 'Provisional' ? 'selected' : ''}>Provisional</option>
                        <option value="Interino" ${teacher && teacher.revista === 'Interino' ? 'selected' : ''}>Interino</option>
                        <option value="Suplente" ${teacher && teacher.revista === 'Suplente' ? 'selected' : ''}>Suplente</option>
                    </select>
                </div>
                <div>
                    <label class="block text-[11px] font-bold text-slate-700 uppercase mb-1">CUIL</label>
                    <input type="text" id="modal-teacher-cuil" value="${teacher ? escapeHtml(teacher.cuil || '') : ''}"
                        placeholder="20-xxxxxxxx-x" class="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg">
                </div>
            </div>

            <div class="grid grid-cols-2 gap-3">
                <div>
                    <label class="block text-[11px] font-bold text-slate-700 uppercase mb-1">Correo Electrónico</label>
                    <input type="email" id="modal-teacher-email" value="${teacher ? escapeHtml(teacher.email || '') : ''}"
                        placeholder="profesor@instituto.edu.ar" class="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg">
                </div>
                <div>
                    <label class="block text-[11px] font-bold text-slate-700 uppercase mb-1">Teléfono</label>
                    <input type="text" id="modal-teacher-phone" value="${teacher ? escapeHtml(teacher.phone || '') : ''}"
                        placeholder="+54 383 4..." class="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg">
                </div>
            </div>

            <div id="modal-teacher-error" class="hidden p-2 rounded bg-red-50 text-red-700 text-xs"></div>

            <div class="pt-3 border-t border-slate-100 flex justify-end space-x-2">
                <button type="button" onclick="closeModal()" class="px-4 py-2 border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-50">Cancelar</button>
                <button type="submit" class="btn-gold px-4 py-2 text-xs font-bold shadow-sm">Guardar Legajo</button>
            </div>
        </form>
    `;

    openModal(modalHtml, () => {
        const form = document.getElementById('teacher-form');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const errDiv = document.getElementById('modal-teacher-error');
            errDiv.classList.add('hidden');

            const payload = {
                id: document.getElementById('modal-teacher-id').value || null,
                dni: document.getElementById('modal-teacher-dni').value.trim(),
                lastName: document.getElementById('modal-teacher-lastname').value.trim(),
                firstName: document.getElementById('modal-teacher-firstname').value.trim(),
                legajo: document.getElementById('modal-teacher-legajo').value.trim(),
                revista: document.getElementById('modal-teacher-revista').value,
                cuil: document.getElementById('modal-teacher-cuil').value.trim(),
                email: document.getElementById('modal-teacher-email').value.trim(),
                phone: document.getElementById('modal-teacher-phone').value.trim()
            };

            try {
                const res = await window.sigetApi.teachers.save(payload);
                if (res.success) {
                    showToast('Docente guardado con éxito.', 'success');
                    closeModal();
                    loadTeachers();
                } else {
                    errDiv.textContent = res.message || 'Error al guardar docente.';
                    errDiv.classList.remove('hidden');
                }
            } catch (err) {
                errDiv.textContent = 'Error de comunicación al guardar.';
                errDiv.classList.remove('hidden');
            }
        });
    });
}

// ============================================================================
// 10. CONTROL DIARIO DE ASISTENCIAS (REDISEÑO MODERNO v2.5)
// ============================================================================

function renderDashboardAlertsHtml(alertsContainer, alerts) {
    if (!alertsContainer) return;
    if (!alerts || alerts.length === 0) {
        alertsContainer.innerHTML = `
            <div class="p-3 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 flex items-center space-x-2">
                <i data-lucide="check-circle-2" class="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0"></i>
                <span class="font-medium text-xs">Sin alertas normativas activas. Toda la planta docente se encuentra dentro de los topes anuales reglamentarios.</span>
            </div>
        `;
    } else {
        alertsContainer.innerHTML = alerts.map(a => {
            const isDanger = a.nivel === 'danger';
            const badgeClass = isDanger 
                ? 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800' 
                : 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800';
            const iconName = isDanger ? 'alert-triangle' : 'alert-circle';
            const iconColor = isDanger ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400';
            const progressPercent = Math.min(100, Math.round((a.consumido / a.limite) * 100));
            const barColor = isDanger ? 'bg-rose-600' : 'bg-amber-500';

            return `
                <div class="p-3 rounded-lg bg-slate-50 dark:bg-zinc-800/60 border border-slate-200 dark:border-zinc-700 flex flex-col md:flex-row md:items-center justify-between gap-2.5">
                    <div class="flex items-start space-x-2.5">
                        <div class="mt-0.5 shrink-0 ${iconColor}">
                            <i data-lucide="${iconName}" class="w-4 h-4"></i>
                        </div>
                        <div>
                            <div class="flex items-center space-x-2">
                                <span class="font-bold text-slate-900 dark:text-zinc-100">${escapeHtml(a.fullName)}</span>
                                <span class="text-[11px] text-slate-500 dark:text-zinc-400 font-mono">DNI ${escapeHtml(a.dni)} • Leg. ${escapeHtml(a.legajo || 'S/L')}</span>
                            </div>
                            <div class="text-[11px] text-slate-600 dark:text-zinc-300 mt-0.5 font-medium">
                                ${escapeHtml(a.detalle)}
                            </div>
                        </div>
                    </div>
                    <div class="flex items-center space-x-3 shrink-0 self-end md:self-center">
                        <div class="w-24 text-right">
                            <div class="text-[10px] font-bold text-slate-500 dark:text-zinc-400">${a.consumido} / ${a.limite} días</div>
                            <div class="w-full bg-slate-200 dark:bg-zinc-700 h-1.5 rounded-full mt-1 overflow-hidden">
                                <div class="${barColor} h-1.5 rounded-full" style="width: ${progressPercent}%"></div>
                            </div>
                        </div>
                        <span class="px-2 py-0.5 rounded text-[10px] font-bold border ${badgeClass} whitespace-nowrap">
                            ${escapeHtml(a.badge)}
                        </span>
                    </div>
                </div>
            `;
        }).join('');
    }
    initLucideIcons();
}

function updateLiveDashboardAlerts() {
    const alertsContainer = document.getElementById('dashboard-attendance-alerts');
    if (!alertsContainer) return;

    const liveAlerts = [];
    (AppState.attendanceRecordsCache || []).forEach(r => {
        const stats = r.liveStats || r.annualStats || { inasistencias: 0, permisos: 0, licencias: 0, largoTratamiento: 0 };
        const inasistencias = stats.inasistencias || 0;
        const permisos = stats.permisos || 0;
        const licencias = stats.licencias || 0;

        if (permisos >= 6) {
            liveAlerts.push({
                teacherId: r.teacherId,
                fullName: r.fullName,
                dni: String(r.dni),
                legajo: r.legajo,
                tipo: 'Permisos Particulares (Art. 115)',
                consumido: permisos,
                limite: 6,
                nivel: 'danger',
                badge: 'Cupo Anual Agotado',
                detalle: `Agotó los 6 permisos particulares permitidos en el año (${permisos}/6).`
            });
        } else if (permisos >= 4) {
            liveAlerts.push({
                teacherId: r.teacherId,
                fullName: r.fullName,
                dni: String(r.dni),
                legajo: r.legajo,
                tipo: 'Permisos Particulares (Art. 115)',
                consumido: permisos,
                limite: 6,
                nivel: 'warning',
                badge: 'Próximo al Límite',
                detalle: `Consumió ${permisos} de 6 permisos particulares (quedan ${6 - permisos} disponibles).`
            });
        }

        if (inasistencias >= 5) {
            liveAlerts.push({
                teacherId: r.teacherId,
                fullName: r.fullName,
                dni: String(r.dni),
                legajo: r.legajo,
                tipo: 'Inasistencias Injustificadas (I)',
                consumido: inasistencias,
                limite: 5,
                nivel: 'danger',
                badge: 'Límite Crítico de Faltas',
                detalle: `Acumula ${inasistencias} inasistencias sin justificar en el ciclo lectivo.`
            });
        } else if (inasistencias >= 3) {
            liveAlerts.push({
                teacherId: r.teacherId,
                fullName: r.fullName,
                dni: String(r.dni),
                legajo: r.legajo,
                tipo: 'Inasistencias Injustificadas (I)',
                consumido: inasistencias,
                limite: 5,
                nivel: 'warning',
                badge: 'Acumulación de Inasistencias',
                detalle: `Acumula ${inasistencias} inasistencias en el ciclo lectivo.`
            });
        }

        if (licencias >= 25) {
            liveAlerts.push({
                teacherId: r.teacherId,
                fullName: r.fullName,
                dni: String(r.dni),
                legajo: r.legajo,
                tipo: 'Licencias Médicas (Art. 114 a)',
                consumido: licencias,
                limite: 25,
                nivel: 'danger',
                badge: 'Tope Médico Alcanzado',
                detalle: `Alcanzó el tope anual de 25 días de corto tratamiento (${licencias} días).`
            });
        } else if (licencias >= 20) {
            liveAlerts.push({
                teacherId: r.teacherId,
                fullName: r.fullName,
                dni: String(r.dni),
                legajo: r.legajo,
                tipo: 'Licencias Médicas (Art. 114 a)',
                consumido: licencias,
                limite: 25,
                nivel: 'warning',
                badge: 'Cercano a Tope Médico',
                detalle: `Acumula ${licencias} de 25 días médicos anuales permitidos.`
            });
        }
    });

    liveAlerts.sort((a, b) => {
        if (a.nivel === 'danger' && b.nivel !== 'danger') return -1;
        if (a.nivel !== 'danger' && b.nivel === 'danger') return 1;
        return b.consumido - a.consumido;
    });

    renderDashboardAlertsHtml(alertsContainer, liveAlerts);
}

async function loadDailyAttendance() {
    const grid = document.getElementById('attendance-cards-grid');
    const tbody = document.getElementById('tbody-attendance');
    if (!grid && !tbody) return;

    try {
        const dateInput = document.getElementById('att-date-input');
        if (dateInput && dateInput.value !== AppState.attendanceDate) {
            dateInput.value = AppState.attendanceDate;
        }

        const dateBadge = document.getElementById('att-date-badge');
        if (dateBadge) {
            dateBadge.textContent = formatFriendlyDate(AppState.attendanceDate);
        }

        // Validación y visualización del Calendario Escolar / Días Inhábiles (RF-10)
        try {
            if (window.sigetApi && window.sigetApi.normative && window.sigetApi.normative.getCalendarDayInfo) {
                const calInfo = await window.sigetApi.normative.getCalendarDayInfo(AppState.attendanceDate);
                const noticeBox = document.getElementById('att-calendar-notice');
                const noticeText = document.getElementById('att-calendar-notice-text');
                if (noticeBox && noticeText) {
                    if (calInfo && calInfo.isNonWorking) {
                        noticeText.textContent = `${calInfo.reason} — ${calInfo.type} (Jornada Inhábil Escolar)`;
                        noticeBox.classList.remove('hidden');
                    } else {
                        noticeBox.classList.add('hidden');
                    }
                }
            }
        } catch (calErr) {
            console.warn('Error verificando calendario escolar:', calErr);
        }

        const records = await window.sigetApi.attendance.getDaily(AppState.attendanceDate);
        AppState.attendanceRecordsCache = records || [];

        // Inicializar currentStatus y liveStats para cada registro cargado de la BD
        AppState.attendanceRecordsCache.forEach(r => {
            r.currentStatus = r.isSavedInDb ? r.status : 'PR';
            r.liveStats = Object.assign({}, r.annualStats);
        });

        filterAttendanceTable();
        updateLiveDashboardAlerts();
    } catch (err) {
        console.error('Error al cargar asistencias:', err);
        showToast('Error al cargar la planilla de asistencias.', 'error');
    }
}

function formatFriendlyDate(dateStr) {
    if (!dateStr) return 'Parte Diario Oficial';
    try {
        const parts = dateStr.split('-');
        if (parts.length === 3) {
            const dt = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
            const options = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' };
            const formatted = dt.toLocaleDateString('es-AR', options);
            return formatted.charAt(0).toUpperCase() + formatted.slice(1);
        }
    } catch {}
    return `Parte Diario: ${dateStr}`;
}

function classifyAttendanceRecord(status, observations = '') {
    const s = String(status || '').trim().toUpperCase();
    const o = String(observations || '').trim().toLowerCase();
    const combined = `${s} ${o}`.toLowerCase();

    // 1. Presente (PR)
    if (s === 'PR' || s === 'PRESENTE') {
        return { code: 'PR', isPresence: true, isUnexcusedAbsence: false, isJustifiedAbsence: false, isPermit: false, isLicense: false, isLongTreatment: false };
    }

    // 2. Largo Tratamiento de Salud (LT)
    if (s === 'LT' || combined.includes('largo tratamiento') || combined.includes('art. 48') || combined.includes('art 48') || combined.includes('114b') || combined.includes('114 b')) {
        return { code: 'LT', isPresence: false, isUnexcusedAbsence: false, isJustifiedAbsence: true, isPermit: false, isLicense: true, isLongTreatment: true };
    }

    // 3. Licencias Médicas u Ordinarias (LIC)
    if (s === 'LIC' || s === 'LICENCIA' ||
        combined.includes('licencia') || combined.includes('médic') || combined.includes('medic') ||
        combined.includes('salud') || combined.includes('reposo') || combined.includes('114a') ||
        combined.includes('114 a') || combined.includes('114c') || combined.includes('114 c') ||
        combined.includes('art. 70') || combined.includes('art 70') || combined.includes('examen') ||
        combined.includes('estudio') || combined.includes('maternidad') || combined.includes('accidente')) {
        return { code: 'LIC', isPresence: false, isUnexcusedAbsence: false, isJustifiedAbsence: true, isPermit: false, isLicense: true, isLongTreatment: false };
    }

    // 4. Permisos Particulares (P / Art. 115) o Inasistencias Justificadas / Con Aviso / Certificado
    const isArt115 = s === 'P' || combined.includes('permiso') || combined.includes('115') || combined.includes('razones particulares');
    const isJustifiedOrNotice = combined.includes('justificad') ||
                                combined.includes('con aviso') ||
                                combined.includes('c/aviso') ||
                                combined.includes('formulario') ||
                                combined.includes('form:') ||
                                combined.includes('certificado') ||
                                s === 'IJ' || s === 'JUST';

    if (isArt115) {
        return { code: 'P', isPresence: false, isUnexcusedAbsence: false, isJustifiedAbsence: true, isPermit: true, isLicense: false, isLongTreatment: false };
    }

    if (isJustifiedOrNotice) {
        return { code: 'P', isPresence: false, isUnexcusedAbsence: false, isJustifiedAbsence: true, isPermit: false, isLicense: false, isLongTreatment: false };
    }

    // 5. Inasistencia Injustificada ('I')
    return { code: 'I', isPresence: false, isUnexcusedAbsence: true, isJustifiedAbsence: false, isPermit: false, isLicense: false, isLongTreatment: false };
}

function normalizeStatusCode(status, observations = '') {
    if (!status) return 'I';
    return classifyAttendanceRecord(status, observations).code;
}

function getTeacherInitials(fullName) {
    if (!fullName) return 'DC';
    const clean = fullName.replace(',', '').trim();
    const parts = clean.split(/\s+/);
    if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return clean.substring(0, 2).toUpperCase();
}

function getStatusBadgeClasses(code) {
    switch (code) {
        case 'PR': return 'status-select-pr';
        case 'I': return 'status-select-i';
        case 'P': return 'status-select-p';
        case 'LIC': return 'status-select-lic';
        case 'LT': return 'status-select-lt';
        default: return 'status-select-default';
    }
}

function updateAttendanceKpis() {
    const rows = document.querySelectorAll('.att-table-row[data-teacher-id], .att-teacher-card[data-teacher-id]');
    let total = (AppState.attendanceRecordsCache || []).length;
    let pr = 0;
    let i = 0;
    let just = 0;
    let alerts = 0;

    // Conteo en vivo considerando las ediciones actuales en las filas de la tabla
    const statusMap = new Map();
    rows.forEach(row => {
        const id = parseInt(row.getAttribute('data-teacher-id'));
        const statusSelect = row.querySelector('.att-status-select');
        const statusInput = row.querySelector('.att-status-value');
        const val = statusSelect ? statusSelect.value : (statusInput ? statusInput.value : null);
        if (val) {
            statusMap.set(id, normalizeStatusCode(val));
        }
    });

    (AppState.attendanceRecordsCache || []).forEach(r => {
        const code = statusMap.has(r.teacherId) ? statusMap.get(r.teacherId) : normalizeStatusCode(r.currentStatus || r.status);
        if (code === 'PR') pr++;
        else if (code === 'I') i++;
        else if (code === 'P' || code === 'LIC' || code === 'LT') just++;

        const st = r.liveStats || r.annualStats;
        if (st && (st.alertLevel || st.inasistencias >= 3 || st.permisos >= 4)) {
            alerts++;
        }
    });

    const elTotal = document.getElementById('kpi-att-total');
    const elPr = document.getElementById('kpi-att-pr');
    const elI = document.getElementById('kpi-att-i');
    const elJust = document.getElementById('kpi-att-just');

    if (elTotal) elTotal.textContent = total;
    if (elPr) elPr.textContent = `${pr} (${total > 0 ? Math.round((pr / total) * 100) : 0}%)`;
    if (elI) elI.textContent = i;
    if (elJust) elJust.textContent = just;

    const cfAll = document.getElementById('count-filter-all');
    const cfPr = document.getElementById('count-filter-pr');
    const cfI = document.getElementById('count-filter-i');
    const cfJust = document.getElementById('count-filter-just');
    const cfAlerts = document.getElementById('count-filter-alerts');

    if (cfAll) cfAll.textContent = total;
    if (cfPr) cfPr.textContent = pr;
    if (cfI) cfI.textContent = i;
    if (cfJust) cfJust.textContent = just;
    if (cfAlerts) cfAlerts.textContent = alerts;
}

function handleAttendanceStatusChange(row, newCode) {
    if (!row) return;
    const teacherId = parseInt(row.getAttribute('data-teacher-id'));
    const rec = (AppState.attendanceRecordsCache || []).find(r => r.teacherId === teacherId);
    if (!rec) return;

    // 1. Actualizar estado y clases en Combobox y fila
    const select = row.querySelector('.att-status-select');
    if (select) {
        select.value = newCode;
        select.className = `att-status-select w-full px-2.5 py-1.5 text-xs font-bold rounded-lg border focus:outline-none focus:ring-2 focus:ring-gold transition cursor-pointer ${getStatusBadgeClasses(newCode)}`;
    }
    const hiddenStatus = row.querySelector('.att-status-value');
    if (hiddenStatus) hiddenStatus.value = newCode;
    row.setAttribute('data-status', newCode);

    // 2. Calcular cómputo dinámico anual en vivo
    const baseStats = rec.annualStats || { inasistencias: 0, justificadas: 0, permisos: 0, licencias: 0, largoTratamiento: 0 };
    
    const wasUnexcused = rec.isSavedInDb ? Boolean(rec.isSavedUnexcused) : false;
    const wasPermit = rec.isSavedInDb ? Boolean(rec.isSavedPermit) : false;
    const wasLicense = rec.isSavedInDb ? Boolean(rec.isSavedLicense) : false;
    const wasLt = rec.isSavedInDb ? Boolean(rec.isSavedLongTreatment) : false;

    const newIsUnexcused = (newCode === 'I');
    const newIsPermit = (newCode === 'P');
    const newIsLicense = (newCode === 'LIC');
    const newIsLt = (newCode === 'LT');

    const inasistenciasDelta = (newIsUnexcused ? 1 : 0) - (wasUnexcused ? 1 : 0);
    const permisosDelta = (newIsPermit ? 1 : 0) - (wasPermit ? 1 : 0);
    const licenciasDelta = (newIsLicense ? 1 : 0) - (wasLicense ? 1 : 0);
    const ltDelta = (newIsLt ? 1 : 0) - (wasLt ? 1 : 0);

    const liveFaltas = Math.max(0, (baseStats.inasistencias || 0) + inasistenciasDelta);
    const livePermisos = Math.max(0, (baseStats.permisos || 0) + permisosDelta);
    const liveLicencias = Math.max(0, (baseStats.licencias || 0) + licenciasDelta);
    const liveLt = Math.max(0, (baseStats.largoTratamiento || 0) + ltDelta);

    rec.currentStatus = newCode;
    rec.liveStats = {
        year: baseStats.year || new Date().getFullYear(),
        inasistencias: liveFaltas,
        justificadas: baseStats.justificadas || 0,
        permisos: livePermisos,
        permisosDisponibles: Math.max(0, 6 - livePermisos),
        licencias: liveLicencias,
        largoTratamiento: liveLt
    };

    // 3. Determinar badges y niveles de alerta en vivo
    let liveAlertBadge = null;
    let liveAlertLevel = null;
    let liveAlertDetail = null;

    if (liveFaltas >= 5) {
        liveAlertLevel = 'danger';
        liveAlertBadge = 'Límite Crítico Inasistencias';
        liveAlertDetail = `Acumula ${liveFaltas} inasistencias en el ciclo lectivo.`;
    } else if (liveFaltas >= 3) {
        liveAlertLevel = 'warning';
        liveAlertBadge = `${liveFaltas}/5 Inasistencias`;
        liveAlertDetail = `Acumula ${liveFaltas} inasistencias sin justificar.`;
    }

    if (livePermisos >= 6) {
        liveAlertLevel = 'danger';
        liveAlertBadge = 'Cupo Art. 115 Agotado';
        liveAlertDetail = 'Agotó los 6 permisos particulares anuales (6/6).';
    } else if (livePermisos >= 4 && !liveAlertBadge) {
        liveAlertLevel = 'warning';
        liveAlertBadge = `${livePermisos}/6 Permisos (115)`;
        liveAlertDetail = `Consumió ${livePermisos} de 6 permisos anuales permitidos.`;
    }

    rec.liveStats.alertLevel = liveAlertLevel;
    rec.liveStats.alertBadge = liveAlertBadge;
    rec.liveStats.alertDetail = liveAlertDetail;

    // 4. Actualizar celda de acción/formulario físico en la fila
    const actionCell = row.querySelector('.att-row-action');
    if (actionCell) {
        if (newCode === 'I') {
            actionCell.innerHTML = `
                <button type="button" class="btn-receive-physical-form px-2.5 py-1 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:hover:bg-amber-900/50 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700 rounded-lg text-[11px] font-bold transition flex items-center justify-center space-x-1 shadow-xs"
                    data-teacher-id="${teacherId}" data-teacher-name="${escapeHtml(rec.fullName)}">
                    <i data-lucide="file-check" class="w-3.5 h-3.5 text-amber-600 dark:text-amber-400"></i>
                    <span>Justificar</span>
                </button>
            `;
        } else if (newCode === 'P' || newCode === 'LIC' || newCode === 'LT') {
            actionCell.innerHTML = `
                <button type="button" class="btn-receive-physical-form px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/50 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 rounded-lg text-[11px] font-bold transition flex items-center justify-center space-x-1 shadow-xs"
                    data-teacher-id="${teacherId}" data-teacher-name="${escapeHtml(rec.fullName)}">
                    <i data-lucide="${rec.hasPhysicalForm ? 'check-check' : 'file-text'}" class="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400"></i>
                    <span>${rec.hasPhysicalForm ? 'Formulario' : 'Form. Físico'}</span>
                </button>
            `;
        } else {
            actionCell.innerHTML = `
                <span class="text-[11px] text-slate-400 dark:text-zinc-600 italic">Normal</span>
            `;
        }
        actionCell.querySelector('.btn-receive-physical-form')?.addEventListener('click', (ev) => {
            const t = ev.currentTarget;
            openPhysicalFormModal(parseInt(t.getAttribute('data-teacher-id')), t.getAttribute('data-teacher-name'), AppState.attendanceDate);
        });
    }

    // 5. Actualizar badge de alerta en la celda del docente
    const badgeWrap = row.querySelector('.att-row-badge-wrap');
    if (badgeWrap) {
        if (liveAlertBadge) {
            badgeWrap.innerHTML = `
                <span class="inline-flex items-center px-1.5 py-0.5 rounded text-[9.5px] font-bold uppercase tracking-tight ${liveAlertLevel === 'danger' ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/80 dark:text-rose-300 border border-rose-300 dark:border-rose-800' : 'bg-amber-100 text-amber-700 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-300 dark:border-amber-800'}" title="${escapeHtml(liveAlertDetail || '')}">
                    ⚠️ ${escapeHtml(liveAlertBadge)}
                </span>
            `;
        } else {
            badgeWrap.innerHTML = '';
        }
    }

    // Actualizar texto de acumulados
    const statsText = row.querySelector('.att-row-stats-text');
    if (statsText) {
        statsText.innerHTML = `
            <span>Faltas: <strong class="${liveFaltas >= 5 ? 'text-rose-600 dark:text-rose-400' : liveFaltas >= 3 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-600 dark:text-zinc-400'}">${liveFaltas}</strong></span>
            <span>•</span>
            <span>Art. 115: <strong class="${livePermisos >= 6 ? 'text-rose-600 dark:text-rose-400' : livePermisos >= 4 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-600 dark:text-zinc-400'}">${livePermisos}/6</strong></span>
            <span>•</span>
            <span>Lic: ${liveLicencias}d</span>
        `;
    }

    // 6. Actualizar KPIs y alertas globales
    updateAttendanceKpis();
    updateLiveDashboardAlerts();
    initLucideIcons();
}

function renderAttendanceRows(records) {
    const tbody = document.getElementById('tbody-attendance');
    if (!tbody) return;

    if (!records || records.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center py-12 text-xs text-slate-400 dark:text-zinc-500 italic">No se encontraron docentes registrados con ese criterio o fecha.</td></tr>`;
        updateAttendanceKpis();
        return;
    }

    tbody.innerHTML = records.map((r) => {
        const code = normalizeStatusCode(r.currentStatus || r.status);
        const isJustifiedOrLic = (code === 'P' || code === 'LIC' || code === 'LT');
        const badgeStatusClass = getStatusBadgeClasses(code);

        const annual = r.liveStats || r.annualStats || {
            year: new Date().getFullYear(),
            inasistencias: 0,
            justificadas: 0,
            permisos: 0,
            permisosDisponibles: 6,
            licencias: 0,
            largoTratamiento: 0,
            alertLevel: null,
            alertBadge: null
        };

        const alertBadgeHtml = annual.alertBadge ? `
            <span class="inline-flex items-center px-1.5 py-0.5 rounded text-[9.5px] font-bold uppercase tracking-tight ${annual.alertLevel === 'danger' ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/80 dark:text-rose-300 border border-rose-300 dark:border-rose-800' : 'bg-amber-100 text-amber-700 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-300 dark:border-amber-800'}" title="${escapeHtml(annual.alertDetail || '')}">
                ⚠️ ${escapeHtml(annual.alertBadge)}
            </span>
        ` : '';

        const justBtn = (code === 'I') ? `
            <button type="button" class="btn-receive-physical-form px-2.5 py-1 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:hover:bg-amber-900/50 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700 rounded-lg text-[11px] font-bold transition flex items-center justify-center space-x-1 shadow-xs"
                data-teacher-id="${r.teacherId}" data-teacher-name="${escapeHtml(r.fullName)}">
                <i data-lucide="file-check" class="w-3.5 h-3.5 text-amber-600 dark:text-amber-400"></i>
                <span>Justificar</span>
            </button>
        ` : (isJustifiedOrLic) ? `
            <button type="button" class="btn-receive-physical-form px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/50 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 rounded-lg text-[11px] font-bold transition flex items-center justify-center space-x-1 shadow-xs"
                data-teacher-id="${r.teacherId}" data-teacher-name="${escapeHtml(r.fullName)}">
                <i data-lucide="${r.hasPhysicalForm ? 'check-check' : 'file-text'}" class="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400"></i>
                <span>${r.hasPhysicalForm ? 'Formulario' : 'Form. Físico'}</span>
            </button>
        ` : `
            <span class="text-[11px] text-slate-400 dark:text-zinc-600 italic">Normal</span>
        `;

        return `
            <tr class="att-table-row hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition border-b border-slate-100 dark:border-zinc-800 text-xs"
                data-teacher-id="${r.teacherId}" data-status="${code}">
                <td class="py-2.5 px-3 text-center font-mono font-bold text-slate-600 dark:text-zinc-400">
                    ${escapeHtml(r.legajo || 'S/L')}
                </td>
                <td class="py-2.5 px-3">
                    <div class="font-bold text-slate-900 dark:text-zinc-100 flex items-center space-x-1.5">
                        <span>${escapeHtml(r.fullName)}</span>
                        <span class="att-row-badge-wrap">${alertBadgeHtml}</span>
                    </div>
                    <div class="att-row-stats-text text-[11px] text-slate-400 dark:text-zinc-500 flex items-center space-x-1 mt-0.5">
                        <span>Faltas: <strong class="${annual.inasistencias >= 5 ? 'text-rose-600 dark:text-rose-400' : annual.inasistencias >= 3 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-600 dark:text-zinc-400'}">${annual.inasistencias || 0}</strong></span>
                        <span>•</span>
                        <span>Art. 115: <strong class="${annual.permisos >= 6 ? 'text-rose-600 dark:text-rose-400' : annual.permisos >= 4 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-600 dark:text-zinc-400'}">${annual.permisos || 0}/6</strong></span>
                        <span>•</span>
                        <span>Lic: ${annual.licencias || 0}d</span>
                    </div>
                </td>
                <td class="py-2.5 px-3 text-center font-mono text-slate-700 dark:text-zinc-300 font-medium">
                    ${escapeHtml(r.dni || '')}
                </td>
                <td class="py-2.5 px-3 text-center">
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 border border-slate-200 dark:border-zinc-700">
                        ${escapeHtml(r.revista || 'Titular')}
                    </span>
                </td>
                <td class="py-2 px-3 text-center">
                    <select class="att-status-select w-full px-2.5 py-1.5 text-xs font-bold rounded-lg border focus:outline-none focus:ring-2 focus:ring-gold transition cursor-pointer ${badgeStatusClass}"
                        data-teacher-id="${r.teacherId}">
                        <option value="PR" ${code === 'PR' ? 'selected' : ''}>PR - Presente</option>
                        <option value="I" ${code === 'I' ? 'selected' : ''}>I - Inasistencia</option>
                        <option value="P" ${code === 'P' ? 'selected' : ''}>P - Permiso (Art. 115)</option>
                        <option value="LIC" ${code === 'LIC' ? 'selected' : ''}>LIC - Licencia</option>
                        <option value="LT" ${code === 'LT' ? 'selected' : ''}>LT - Largo Tratamiento</option>
                    </select>
                </td>
                <td class="py-2 px-3 text-center">
                    <input type="number" min="1" max="12" value="${r.hours || 4}"
                        class="att-hours-input w-14 text-center py-1 border border-slate-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 rounded-lg text-xs font-bold focus:ring-1 focus:ring-gold focus:outline-none">
                </td>
                <td class="py-2 px-3">
                    <input type="text" placeholder="Observaciones, motivo o justificación..." value="${escapeHtml(r.observations || '')}"
                        class="att-obs-input w-full px-2.5 py-1.5 border border-slate-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 rounded-lg text-xs focus:ring-1 focus:ring-gold focus:outline-none placeholder:text-slate-400 dark:placeholder:text-zinc-500">
                </td>
                <td class="py-2.5 px-3 text-center att-row-action">
                    ${justBtn}
                </td>
            </tr>
        `;
    }).join('');

    // Event listeners para select de estado
    tbody.querySelectorAll('.att-status-select').forEach(sel => {
        sel.addEventListener('change', (e) => {
            const selectElem = e.currentTarget;
            const newCode = selectElem.value;
            const row = selectElem.closest('tr');
            if (row) {
                handleAttendanceStatusChange(row, newCode);
            }
        });
    });

    // Event listeners para botones de formulario físico
    tbody.querySelectorAll('.btn-receive-physical-form').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const target = e.currentTarget;
            const teacherId = parseInt(target.getAttribute('data-teacher-id'));
            const teacherName = target.getAttribute('data-teacher-name');
            openPhysicalFormModal(teacherId, teacherName, AppState.attendanceDate);
        });
    });

    initLucideIcons();
    updateAttendanceKpis();
}

function renderAttendanceCards(records) {
    renderAttendanceRows(records);
}

async function openPhysicalFormModal(teacherId, teacherName, dateStr) {
    let catalog = [];
    try {
        if (window.sigetApi.normative && window.sigetApi.normative.getMasterCatalog) {
            catalog = await window.sigetApi.normative.getMasterCatalog();
        }
    } catch (e) {
        console.error('Error cargando catálogo maestro de licencias:', e);
    }

    const il01Options = catalog.filter(c => c.targetCuadro === 'IL-01').map(c => 
        `<option value="${escapeHtml(c.code)}">${escapeHtml(c.article)} - ${escapeHtml(c.name)} (${escapeHtml(c.code)})</option>`
    ).join('');

    const il02Options = catalog.filter(c => c.targetCuadro === 'IL-02').map(c => 
        `<option value="${escapeHtml(c.code)}">${escapeHtml(c.article)} - ${escapeHtml(c.name)} (${escapeHtml(c.code)})</option>`
    ).join('');

    const modalHtml = `
        <div class="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-zinc-800">
            <div class="flex items-center space-x-2">
                <div class="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 flex items-center justify-center border border-amber-200 dark:border-amber-800">
                    <i data-lucide="file-check" class="w-4 h-4"></i>
                </div>
                <div>
                    <h3 class="text-sm font-bold text-slate-800 dark:text-zinc-100">Recepción de Formulario Físico / Justificación</h3>
                    <p class="text-xs text-slate-500 dark:text-zinc-400">Convierte una inasistencia (I) en Licencia (LIC) o Permiso (P).</p>
                </div>
            </div>
            <button type="button" id="btn-close-pf-modal" class="text-slate-400 hover:text-slate-600 font-bold p-1">✕</button>
        </div>

        <form id="form-physical-form" class="mt-4 space-y-4">
            <div class="p-3 bg-slate-50 dark:bg-zinc-800/60 rounded-lg border border-slate-200 dark:border-zinc-700 text-xs">
                <div class="font-bold text-slate-900 dark:text-zinc-100">${escapeHtml(teacherName)}</div>
                <div class="text-slate-500 dark:text-zinc-400 mt-0.5">Fecha de la inasistencia: <span class="font-mono font-bold text-slate-800 dark:text-zinc-200">${escapeHtml(dateStr)}</span></div>
            </div>

            <div>
                <label class="block text-xs font-bold text-slate-700 dark:text-zinc-300 uppercase mb-1">Nuevo Estado Reglamentario</label>
                <select id="pf-new-status" required class="w-full px-3 py-2 text-xs border border-slate-200 dark:border-zinc-700 dark:bg-[#202020] dark:text-zinc-100 rounded-lg font-bold focus:outline-none focus:ring-2 focus:ring-gold">
                    <option value="LIC">LIC - Licencia (Salud / DL-01 o DL-02)</option>
                    <option value="P">P - Permiso Particular (Art. 115 - Máx 6/año)</option>
                    <option value="LT">LT - Largo Tratamiento de Salud (Art. 48 / 114b)</option>
                </select>
            </div>

            <div>
                <label class="block text-xs font-bold text-slate-700 dark:text-zinc-300 uppercase mb-1">Artículo y Clasificación Normativa</label>
                <select id="pf-article-code" required class="w-full px-3 py-2 text-xs border border-slate-200 dark:border-zinc-700 dark:bg-[#202020] dark:text-zinc-100 rounded-lg font-medium focus:outline-none focus:ring-2 focus:ring-gold">
                    <optgroup label="Cuadro IL-01: Licencias Médicas y Salud (Hojas 1-2)">
                        ${il01Options || '<option value="114-A-1">Art. 114 a.1 - Corto Tratamiento (114-A-1)</option>'}
                    </optgroup>
                    <optgroup label="Cuadro IL-02: Inasistencias, Permisos y Especiales (Hojas 3-6)">
                        ${il02Options || '<option value="115">Art. 115 - Permiso Razones Particulares (115)</option>'}
                    </optgroup>
                </select>
            </div>

            <div>
                <label class="block text-xs font-bold text-slate-700 dark:text-zinc-300 uppercase mb-1">N° Formulario Físico / Certificado Oficial <span class="text-rose-500">*</span></label>
                <input type="text" id="pf-form-number" required placeholder="Ej. Form. F-1029 / Cert. Médico N° 45812"
                    class="w-full px-3 py-2 text-xs border border-slate-200 dark:border-zinc-700 dark:bg-[#202020] dark:text-zinc-100 rounded-lg font-bold focus:outline-none focus:ring-2 focus:ring-gold">
            </div>

            <div>
                <label class="block text-xs font-bold text-slate-700 dark:text-zinc-300 uppercase mb-1">Observaciones Institucionales</label>
                <input type="text" id="pf-observations" placeholder="Detalle complementario, profesional firmante o causal..."
                    class="w-full px-3 py-2 text-xs border border-slate-200 dark:border-zinc-700 dark:bg-[#202020] dark:text-zinc-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold">
            </div>

            <div id="pf-error" class="hidden p-2.5 rounded-lg bg-rose-50 text-rose-700 text-xs font-medium border border-rose-200"></div>

            <div class="flex items-center justify-end space-x-3 pt-3 border-t border-slate-100 dark:border-zinc-800">
                <button type="button" id="btn-cancel-pf" class="px-4 py-2 text-xs font-bold text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg transition">
                    Cancelar
                </button>
                <button type="submit" id="btn-submit-pf" class="btn-gold px-4 py-2 text-xs font-bold flex items-center space-x-1.5 shadow-sm">
                    <i data-lucide="check" class="w-4 h-4"></i>
                    <span>Confirmar Recepción</span>
                </button>
            </div>
        </form>
    `;

    openModal(modalHtml, () => {
        const btnClose = document.getElementById('btn-close-pf-modal');
        const btnCancel = document.getElementById('btn-cancel-pf');
        const form = document.getElementById('form-physical-form');
        const errDiv = document.getElementById('pf-error');

        if (btnClose) btnClose.addEventListener('click', closeModal);
        if (btnCancel) btnCancel.addEventListener('click', closeModal);

        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                errDiv.classList.add('hidden');

                const newStatus = document.getElementById('pf-new-status').value;
                const articleCode = document.getElementById('pf-article-code').value;
                const formNumber = document.getElementById('pf-form-number').value.trim();
                const observations = document.getElementById('pf-observations').value.trim();

                if (!formNumber) {
                    errDiv.textContent = 'Debe ingresar el número del formulario físico o certificado recibido.';
                    errDiv.classList.remove('hidden');
                    return;
                }

                try {
                    const res = await window.sigetApi.attendance.receivePhysicalForm({
                        teacherId,
                        date: dateStr,
                        newStatus,
                        formNumber,
                        articleCode,
                        observations
                    });

                    if (res && res.success) {
                        showToast(`Recepción de formulario registrada: estado actualizado a ${newStatus}.`, 'success');
                        closeModal();
                        await loadDailyAttendance();
                        await loadDashboard();
                    } else {
                        errDiv.textContent = (res && res.message) || 'Error al registrar recepción de formulario.';
                        errDiv.classList.remove('hidden');
                    }
                } catch (err) {
                    console.error('Error registrando formulario físico:', err);
                    errDiv.textContent = 'Error de comunicación al registrar formulario.';
                    errDiv.classList.remove('hidden');
                }
            });
        }
    });
}

function filterAttendanceTable() {
    const query = (document.getElementById('att-search')?.value || '').toLowerCase().trim();
    const filter = AppState.attendanceFilter || 'all';

    const filtered = (AppState.attendanceRecordsCache || []).filter(r => {
        const code = normalizeStatusCode(r.currentStatus || r.status);
        const matchesQuery = !query || `${r.fullName} ${r.legajo} ${r.dni}`.toLowerCase().includes(query);
        if (!matchesQuery) return false;

        if (filter === 'PR') return code === 'PR';
        if (filter === 'I') return code === 'I';
        if (filter === 'JUST') return (code === 'P' || code === 'LIC' || code === 'LT');
        if (filter === 'ALERTS') {
            const st = r.liveStats || r.annualStats;
            return Boolean(st && (st.alertLevel || st.inasistencias >= 3 || st.permisos >= 4));
        }
        return true;
    });

    renderAttendanceCards(filtered);
}

function markAllVisibleAsPresent() {
    const rows = document.querySelectorAll('.att-table-row[data-teacher-id]');
    if (rows.length === 0) return;

    rows.forEach(row => {
        const select = row.querySelector('.att-status-select');
        if (select && select.value !== 'PR') {
            select.value = 'PR';
            handleAttendanceStatusChange(row, 'PR');
        }
    });

    showToast('Todos los docentes visibles fueron marcados como Presente (PR). Recuerde guardar los cambios.', 'info');
}

async function saveAllAttendanceRecords() {
    const btnSave = document.getElementById('btn-att-save-all');
    if (btnSave) {
        btnSave.disabled = true;
        btnSave.innerHTML = `<span>Guardando...</span>`;
    }

    try {
        // Obtenemos los valores de las filas renderizadas en la tabla
        const rows = document.querySelectorAll('.att-table-row[data-teacher-id]');
        const currentEdits = new Map();

        rows.forEach(row => {
            const teacherId = parseInt(row.getAttribute('data-teacher-id'));
            const statusSelect = row.querySelector('.att-status-select');
            const statusInput = row.querySelector('.att-status-value');
            const hoursInput = row.querySelector('.att-hours-input');
            const obsInput = row.querySelector('.att-obs-input');

            const currentStatus = statusSelect ? statusSelect.value : (statusInput ? statusInput.value : 'I');

            currentEdits.set(teacherId, {
                status: currentStatus,
                hours: hoursInput ? parseInt(hoursInput.value) || 0 : 4,
                observations: obsInput ? obsInput.value.trim() : ''
            });
        });

        // Combinamos con la caché completa para que ningún docente se pierda por filtros activos
        const recordsToSave = (AppState.attendanceRecordsCache || []).map(r => {
            if (currentEdits.has(r.teacherId)) {
                const edit = currentEdits.get(r.teacherId);
                return {
                    teacherId: r.teacherId,
                    status: edit.status,
                    hours: edit.hours,
                    observations: edit.observations
                };
            }
            return {
                teacherId: r.teacherId,
                status: r.currentStatus || r.status || 'I',
                hours: r.hours || 4,
                observations: r.observations || ''
            };
        });

        const res = await window.sigetApi.attendance.saveBatch(AppState.attendanceDate, recordsToSave);
        if (res && res.success) {
            showToast(`Se guardó el parte diario para la fecha ${AppState.attendanceDate}.`, 'success');
            await loadDailyAttendance();
            await loadDashboard();
        } else {
            showToast((res && res.message) || 'Error al guardar registros.', 'error');
        }
    } catch (err) {
        console.error('Error al guardar asistencias en lote:', err);
        showToast('Error de comunicación con la base de datos.', 'error');
    } finally {
        if (btnSave) {
            btnSave.disabled = false;
            btnSave.innerHTML = `<i data-lucide="save" class="w-3.5 h-3.5"></i><span>Guardar Planilla</span>`;
            initLucideIcons();
        }
    }
}

// ============================================================================
// 11. CÁTEDRAS, DESIGNACIONES Y SUPLENCIAS (RN-02, RN-03)
// ============================================================================
async function loadDesignations() {
    const tbody = document.getElementById('tbody-designations');
    if (!tbody) return;

    const careerFilter = document.getElementById('desig-filter-career');
    const careerId = careerFilter ? parseInt(careerFilter.value) || 0 : 0;

    try {
        const designations = await window.sigetApi.designations.getAll({ careerId });

        if (designations.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center py-8 text-slate-400 italic">No hay cátedras asignadas para esta carrera.</td></tr>`;
            return;
        }

        tbody.innerHTML = designations.map(d => {
            const hasSubst = !!d.activeSubstitution;
            return `
                <tr class="hover:bg-slate-50 transition border-b border-slate-100 text-xs">
                    <td class="py-2.5 px-3">
                        <div class="font-bold text-slate-900">${escapeHtml(d.subjectName)}</div>
                        <div class="text-[11px] text-slate-500">${escapeHtml(d.careerName)} (${escapeHtml(d.careerCode)})</div>
                    </td>
                    <td class="py-2.5 px-3">
                        <div class="font-bold text-slate-800">${escapeHtml(d.teacherName)}</div>
                        <div class="text-[11px] text-slate-400 font-mono">DNI ${escapeHtml(d.teacherDni)} | ${escapeHtml(d.revista || 'Titular')}</div>
                    </td>
                    <td class="py-2.5 px-3 text-center">
                        <div class="font-bold text-slate-700">${escapeHtml(d.dayOfWeek || 'Lunes')}</div>
                        <div class="text-[11px] text-slate-400 font-mono">${escapeHtml(d.startTime || '18:00')} - ${escapeHtml(d.endTime || '20:00')}</div>
                    </td>
                    <td class="py-2.5 px-3 text-center font-bold text-slate-800">${d.hoursCount} hs</td>
                    <td class="py-2.5 px-3">
                        ${hasSubst ? 
                            `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">Con Suplente Vigente</span>` : 
                            `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600">Titular en Ejercicio</span>`
                        }
                    </td>
                    <td class="py-2.5 px-3 text-center">
                        <div class="flex items-center justify-center space-x-1">
                            <button onclick="editDesignation(${d.id})" title="Editar Cátedra" class="p-1 rounded text-slate-500 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-zinc-800">
                                <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
                            </button>
                            <button onclick="deleteDesignation(${d.id})" title="Dar de baja / Eliminar cátedra" class="p-1 rounded text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-zinc-800">
                                <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                            </button>
                            <button onclick="openSubstitutionModal(${d.id})" title="Registrar Suplencia Oficial" class="px-2 py-1 rounded text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-[11px] font-bold flex items-center space-x-1">
                                <i data-lucide="user-check" class="w-3.5 h-3.5"></i>
                                <span>Suplencia</span>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        initLucideIcons();
    } catch (err) {
        console.error('Error al cargar cátedras:', err);
        showToast('Error al cargar la planta de cátedras.', 'error');
    }
}

window.editDesignation = async function(id) {
    try {
        const desig = await window.sigetApi.designations.getById(id);
        if (desig) {
            openDesignationModal(desig.careerId, desig);
        } else {
            showToast('No se encontró la designación de cátedra.', 'error');
        }
    } catch (err) {
        showToast('Error al recuperar designación: ' + err.message, 'error');
    }
};

window.deleteDesignation = async function(id) {
    if (!confirm(`¿Está seguro de que desea dar de baja o eliminar esta designación de cátedra?\n\nSi posee registros históricos de asistencias vinculados, se preservará el historial mediante baja lógica institucional (RN-03). Si fue cargada por error sin asistencias, se eliminará del sistema.`)) {
        return;
    }
    try {
        const res = await window.sigetApi.designations.delete(id);
        if (res && res.success) {
            showToast(res.message, 'success');
            loadDesignations();
        } else {
            showToast((res && res.message) ? res.message : 'No se pudo dar de baja la designación.', 'error');
        }
    } catch (err) {
        showToast('Error al dar de baja designación: ' + err.message, 'error');
    }
};

async function loadSubstitutions() {
    const tbody = document.getElementById('tbody-substitutions');
    if (!tbody) return;

    try {
        const substs = await window.sigetApi.designations.getSubstitutions();

        if (substs.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center py-8 text-slate-400 italic">No existen suplencias registradas en el sistema.</td></tr>`;
            return;
        }

        tbody.innerHTML = substs.map(s => {
            return `
                <tr class="hover:bg-slate-50 transition border-b border-slate-100 text-xs">
                    <td class="py-2.5 px-3">
                        <div class="font-bold text-slate-900">${escapeHtml(s.subjectName || 'Cátedra')}</div>
                        <div class="text-[11px] text-slate-400">${escapeHtml(s.careerName || '')}</div>
                    </td>
                    <td class="py-2.5 px-3">
                        <div class="font-semibold text-slate-700">${escapeHtml(s.titularName)}</div>
                    </td>
                    <td class="py-2.5 px-3">
                        <div class="font-bold text-emerald-800">${escapeHtml(s.substituteName || s.suplenteName)}</div>
                        <div class="text-[11px] text-slate-400">DNI ${escapeHtml(s.substituteDni || s.suplenteDni || '')}</div>
                    </td>
                    <td class="py-2.5 px-3">
                        <div class="text-slate-700 font-medium">${escapeHtml(s.licenseReason || 'Licencia')}</div>
                    </td>
                    <td class="py-2.5 px-3 text-center font-mono text-slate-700">
                        ${escapeHtml(s.startDate)} al ${escapeHtml(s.endDate || 'Abierta')}
                    </td>
                    <td class="py-2.5 px-3 text-center font-mono font-bold text-slate-600">
                        ${escapeHtml(s.resolutionNumber || 'S/R')}
                    </td>
                </tr>
            `;
        }).join('');

        initLucideIcons();
    } catch (err) {
        console.error('Error al cargar suplencias:', err);
    }
}

function openCareerModal(returnToDesignation = false, careerToEdit = null) {
    const isEdit = !!careerToEdit;
    const modalHtml = `
        <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-zinc-800 mb-4">
            <div>
                <h3 class="text-sm font-bold text-slate-900 dark:text-zinc-100 flex items-center space-x-2">
                    <i data-lucide="graduation-cap" class="w-4 h-4 text-gold-text"></i>
                    <span>${isEdit ? 'Modificar Carrera Institucional' : 'Registrar Nueva Carrera Institucional'}</span>
                </h3>
                <p class="text-[11px] text-slate-500 dark:text-zinc-400">Catálogo oficial de ofertas académicas del IES (RF-05)</p>
            </div>
            <button onclick="closeModal()" class="text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 text-base">✕</button>
        </div>

        <form id="career-form" class="space-y-3.5">
            <div>
                <label class="block text-[11px] font-bold text-slate-700 dark:text-zinc-300 uppercase mb-1">
                    Nombre Completo de la Carrera *
                </label>
                <input type="text" id="modal-career-name" required maxlength="150"
                    placeholder="Ej: Tecnicatura Superior en Desarrollo de Software"
                    value="${isEdit ? escapeHtml(careerToEdit.name) : ''}"
                    class="w-full px-3 py-2 text-xs border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-800 dark:text-zinc-100 rounded-lg focus:outline-none focus:ring-1 focus:ring-gold">
            </div>

            <div class="grid grid-cols-2 gap-3">
                <div>
                    <label class="block text-[11px] font-bold text-slate-700 dark:text-zinc-300 uppercase mb-1">
                        Código Abreviado *
                    </label>
                    <input type="text" id="modal-career-code" required maxlength="20"
                        placeholder="Ej: TEC-DS"
                        value="${isEdit ? escapeHtml(careerToEdit.code) : ''}"
                        style="text-transform: uppercase;"
                        class="w-full px-3 py-2 text-xs border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-800 dark:text-zinc-100 rounded-lg focus:outline-none focus:ring-1 focus:ring-gold uppercase">
                    <span class="text-[10px] text-slate-400 dark:text-zinc-500">Máx. 20 caracteres (único)</span>
                </div>
                <div>
                    <label class="block text-[11px] font-bold text-slate-700 dark:text-zinc-300 uppercase mb-1">
                        Duración (Años)
                    </label>
                    <input type="number" id="modal-career-duration" min="1" max="6"
                        value="${isEdit ? (careerToEdit.duration_years || careerToEdit.durationYears || 3) : 3}"
                        class="w-full px-3 py-2 text-xs border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-800 dark:text-zinc-100 rounded-lg focus:outline-none focus:ring-1 focus:ring-gold">
                    <span class="text-[10px] text-slate-400 dark:text-zinc-500">Plan de estudios</span>
                </div>
            </div>

            <div>
                <label class="block text-[11px] font-bold text-slate-700 dark:text-zinc-300 uppercase mb-1">
                    Resolución Ministerial / Decreto
                </label>
                <input type="text" id="modal-career-resolution" maxlength="100"
                    placeholder="Ej: Res. Min. N° 1245/2024"
                    value="${isEdit ? escapeHtml(careerToEdit.resolution_number || careerToEdit.resolutionNumber || '') : ''}"
                    class="w-full px-3 py-2 text-xs border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-800 dark:text-zinc-100 rounded-lg focus:outline-none focus:ring-1 focus:ring-gold">
            </div>

            <div id="modal-career-error" class="hidden p-2.5 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 text-xs flex items-center space-x-2">
                <i data-lucide="alert-circle" class="w-4 h-4 flex-shrink-0"></i>
                <span id="modal-career-error-msg"></span>
            </div>

            <div class="pt-3 border-t border-slate-100 dark:border-zinc-800 flex justify-end space-x-2">
                <button type="button" onclick="closeModal()"
                    class="px-4 py-2 border border-slate-200 dark:border-zinc-700 rounded-lg text-xs font-bold text-slate-600 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800 transition">
                    Cancelar
                </button>
                <button type="submit" id="btn-save-career-submit"
                    class="btn-gold px-4 py-2 text-xs font-bold flex items-center space-x-1.5 shadow-sm">
                    <i data-lucide="check" class="w-4 h-4"></i>
                    <span>${isEdit ? 'Actualizar Carrera' : 'Guardar Carrera'}</span>
                </button>
            </div>
        </form>
    `;

    openModal(modalHtml, () => {
        const form = document.getElementById('career-form');
        const codeInput = document.getElementById('modal-career-code');
        if (codeInput) {
            codeInput.addEventListener('input', (e) => {
                e.target.value = e.target.value.toUpperCase();
            });
        }

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const errDiv = document.getElementById('modal-career-error');
            const errMsg = document.getElementById('modal-career-error-msg');
            const submitBtn = document.getElementById('btn-save-career-submit');
            errDiv.classList.add('hidden');

            const payload = {
                name: document.getElementById('modal-career-name').value.trim(),
                code: document.getElementById('modal-career-code').value.trim().toUpperCase(),
                resolutionNumber: document.getElementById('modal-career-resolution').value.trim() || null,
                durationYears: parseInt(document.getElementById('modal-career-duration').value) || 3
            };

            if (!payload.name) {
                errMsg.textContent = 'El nombre de la carrera es obligatorio.';
                errDiv.classList.remove('hidden');
                initLucideIcons();
                return;
            }

            if (!payload.code) {
                errMsg.textContent = 'El código identificador de la carrera es obligatorio.';
                errDiv.classList.remove('hidden');
                initLucideIcons();
                return;
            }

            submitBtn.disabled = true;
            submitBtn.classList.add('opacity-70');

            try {
                let res;
                if (isEdit) {
                    res = await window.sigetApi.designations.updateCareer({ id: careerToEdit.id, ...payload });
                } else {
                    res = await window.sigetApi.designations.createCareer(payload);
                }

                if (res && res.success) {
                    showToast(isEdit ? `Carrera "${res.career.name}" actualizada con éxito.` : `Carrera "${res.career.name}" creada exitosamente.`, 'success');
                    closeModal();
                    await reloadCareers(res.career.id);
                    if (returnToDesignation) {
                        openDesignationModal(res.career.id);
                    }
                } else {
                    errMsg.textContent = (res && res.message) ? res.message : 'Error al registrar la carrera.';
                    errDiv.classList.remove('hidden');
                    initLucideIcons();
                }
            } catch (err) {
                console.error('[CareerModal] Error:', err);
                errMsg.textContent = `Error del sistema: ${err.message}`;
                errDiv.classList.remove('hidden');
                initLucideIcons();
            } finally {
                submitBtn.disabled = false;
                submitBtn.classList.remove('opacity-70');
            }
        });
    });
}
window.openCareerModal = openCareerModal;

function openDesignationModal(selectedCareerId = null, designationToEdit = null) {
    const isEdit = !!designationToEdit;
    const modalHtml = `
        <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-zinc-800 mb-4">
            <div>
                <h3 class="text-sm font-bold text-slate-900 dark:text-zinc-100">
                    ${isEdit ? 'Modificar Designación de Cátedra' : 'Nueva Designación de Cátedra'}
                </h3>
                <p class="text-[11px] text-slate-500 dark:text-zinc-400">
                    ${isEdit ? 'Edición de cátedra, horario, carga horaria o situación de revista (RN-02)' : 'Asignación de docente titular y cátedra académica'}
                </p>
            </div>
            <button onclick="closeModal()" class="text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 text-base">✕</button>
        </div>

        <form id="desig-form" class="space-y-3">
            <div>
                <div class="flex items-center justify-between mb-1">
                    <label class="block text-[11px] font-bold text-slate-700 dark:text-zinc-300 uppercase">Carrera *</label>
                    <button type="button" id="btn-modal-desig-new-career" class="text-[11px] text-amber-700 hover:text-amber-800 dark:text-amber-400 font-bold underline flex items-center space-x-1">
                        <span>+ Nueva Carrera</span>
                    </button>
                </div>
                <select id="modal-desig-career" required class="w-full px-3 py-1.5 text-xs border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-800 dark:text-zinc-100 rounded-lg">
                    <option value="">Seleccione una carrera...</option>
                    ${AppState.careers.map(c => `<option value="${c.id}">${escapeHtml(c.name)} (${c.code})</option>`).join('')}
                </select>
            </div>

            <div>
                <label class="block text-[11px] font-bold text-slate-700 dark:text-zinc-300 uppercase mb-1">Materia / Espacio Curricular *</label>
                <select id="modal-desig-subject" required class="w-full px-3 py-1.5 text-xs border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-800 dark:text-zinc-100 rounded-lg">
                    <option value="">Primero seleccione una carrera...</option>
                </select>
            </div>

            <div class="grid grid-cols-2 gap-3">
                <div>
                    <label class="block text-[11px] font-bold text-slate-700 dark:text-zinc-300 uppercase mb-1">Docente Titular *</label>
                    <select id="modal-desig-teacher" required class="w-full px-3 py-1.5 text-xs border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-800 dark:text-zinc-100 rounded-lg">
                        <option value="">Seleccione al docente...</option>
                        ${AppState.teachersCache.map(t => `<option value="${t.id}">${escapeHtml(t.fullName)} (DNI ${t.dni}) - [${t.activeHours || 0}/30hs]</option>`).join('')}
                    </select>
                </div>
                <div>
                    <label class="block text-[11px] font-bold text-slate-700 dark:text-zinc-300 uppercase mb-1">Situación Revista</label>
                    <select id="modal-desig-revista" class="w-full px-3 py-1.5 text-xs border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-800 dark:text-zinc-100 rounded-lg">
                        <option value="Titular">Titular</option>
                        <option value="Provisional">Provisional</option>
                        <option value="Interino">Interino</option>
                        <option value="Suplente">Suplente</option>
                    </select>
                </div>
            </div>

            <div class="grid grid-cols-2 gap-3">
                <div>
                    <label class="block text-[11px] font-bold text-slate-700 dark:text-zinc-300 uppercase mb-1">Horas Cátedra Semanales *</label>
                    <input type="number" id="modal-desig-hours" required min="1" max="12" value="${isEdit ? designationToEdit.hoursCount : 4}" class="w-full px-3 py-1.5 text-xs border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-800 dark:text-zinc-100 rounded-lg">
                </div>
                <div>
                    <label class="block text-[11px] font-bold text-slate-700 dark:text-zinc-300 uppercase mb-1">Día de Clases</label>
                    <select id="modal-desig-day" class="w-full px-3 py-1.5 text-xs border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-800 dark:text-zinc-100 rounded-lg">
                        <option value="Lunes">Lunes</option>
                        <option value="Martes">Martes</option>
                        <option value="Miércoles">Miércoles</option>
                        <option value="Jueves">Jueves</option>
                        <option value="Viernes">Viernes</option>
                        <option value="Sábado">Sábado</option>
                    </select>
                </div>
            </div>

            <div class="grid grid-cols-2 gap-3">
                <div>
                    <label class="block text-[11px] font-bold text-slate-700 dark:text-zinc-300 uppercase mb-1">Hora Inicio</label>
                    <input type="time" id="modal-desig-start" value="${isEdit ? (designationToEdit.startTime || '18:30') : '18:30'}" class="w-full px-3 py-1.5 text-xs border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-800 dark:text-zinc-100 rounded-lg">
                </div>
                <div>
                    <label class="block text-[11px] font-bold text-slate-700 dark:text-zinc-300 uppercase mb-1">Hora Fin</label>
                    <input type="time" id="modal-desig-end" value="${isEdit ? (designationToEdit.endTime || '21:30') : '21:30'}" class="w-full px-3 py-1.5 text-xs border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-800 dark:text-zinc-100 rounded-lg">
                </div>
            </div>

            <div>
                <label class="block text-[11px] font-bold text-slate-700 dark:text-zinc-300 uppercase mb-1">Resolución / Disposición</label>
                <input type="text" id="modal-desig-resolution" placeholder="Ej: Disp. N° 012/2026"
                    value="${isEdit ? escapeHtml(designationToEdit.resolutionNumber || '') : ''}"
                    class="w-full px-3 py-1.5 text-xs border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-800 dark:text-zinc-100 rounded-lg">
            </div>

            <div id="modal-desig-error" class="hidden p-2 rounded bg-red-50 text-red-700 text-xs"></div>

            <div class="pt-3 border-t border-slate-100 dark:border-zinc-800 flex justify-end space-x-2">
                <button type="button" onclick="closeModal()" class="px-4 py-2 border border-slate-200 dark:border-zinc-700 rounded-lg text-xs font-bold text-slate-600 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800">Cancelar</button>
                <button type="submit" class="btn-gold px-4 py-2 text-xs font-bold shadow-sm">
                    ${isEdit ? 'Actualizar Designación' : 'Designar Cátedra'}
                </button>
            </div>
        </form>
    `;

    openModal(modalHtml, async () => {
        const careerSelect = document.getElementById('modal-desig-career');
        const subjectSelect = document.getElementById('modal-desig-subject');
        const teacherSelect = document.getElementById('modal-desig-teacher');
        const daySelect = document.getElementById('modal-desig-day');
        const revistaSelect = document.getElementById('modal-desig-revista');
        const btnModalNewCareer = document.getElementById('btn-modal-desig-new-career');

        if (btnModalNewCareer) {
            btnModalNewCareer.addEventListener('click', () => {
                openCareerModal(true);
            });
        }

        const handleCareerChange = async (cid, selectSubjectId = null) => {
            if (!cid) {
                subjectSelect.innerHTML = `<option value="">Primero seleccione una carrera...</option>`;
                return;
            }
            try {
                const subjects = await window.sigetApi.designations.getSubjects(cid);
                subjectSelect.innerHTML = (subjects && subjects.length > 0)
                    ? subjects.map(s => `<option value="${s.id}">${escapeHtml(s.name)} (${s.yearLevel || 1}° Año - ${s.hoursCount || 4} hs)</option>`).join('')
                    : `<option value="">No hay materias registradas aún para esta carrera</option>`;
                if (selectSubjectId) {
                    subjectSelect.value = String(selectSubjectId);
                }
            } catch (err) {
                subjectSelect.innerHTML = `<option value="">Error al cargar materias</option>`;
            }
        };

        careerSelect.addEventListener('change', async (e) => {
            await handleCareerChange(parseInt(e.target.value));
        });

        const initialCareerId = isEdit ? designationToEdit.careerId : selectedCareerId;
        if (initialCareerId) {
            careerSelect.value = String(initialCareerId);
            await handleCareerChange(initialCareerId, isEdit ? designationToEdit.subjectId : null);
        }

        if (isEdit) {
            if (teacherSelect && designationToEdit.teacherId) {
                teacherSelect.value = String(designationToEdit.teacherId);
            }
            if (daySelect && designationToEdit.dayOfWeek) {
                daySelect.value = designationToEdit.dayOfWeek;
            }
            if (revistaSelect && designationToEdit.revista) {
                revistaSelect.value = designationToEdit.revista;
            }
        }

        const form = document.getElementById('desig-form');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const errDiv = document.getElementById('modal-desig-error');
            errDiv.classList.add('hidden');

            const payload = {
                id: isEdit ? designationToEdit.id : undefined,
                teacherId: parseInt(document.getElementById('modal-desig-teacher').value),
                subjectId: parseInt(document.getElementById('modal-desig-subject').value),
                hoursCount: parseInt(document.getElementById('modal-desig-hours').value),
                dayOfWeek: document.getElementById('modal-desig-day').value,
                startTime: document.getElementById('modal-desig-start').value,
                endTime: document.getElementById('modal-desig-end').value,
                revista: document.getElementById('modal-desig-revista') ? document.getElementById('modal-desig-revista').value : 'Titular',
                resolutionNumber: document.getElementById('modal-desig-resolution') ? document.getElementById('modal-desig-resolution').value.trim() : null
            };

            try {
                const res = await window.sigetApi.designations.save(payload);
                if (res.success) {
                    showToast(isEdit ? 'Designación de cátedra actualizada exitosamente.' : 'Cátedra designada con éxito.', 'success');
                    closeModal();
                    loadDesignations();
                } else {
                    errDiv.textContent = res.message || 'Error en la validación de negocio.';
                    errDiv.classList.remove('hidden');
                }
            } catch (err) {
                errDiv.textContent = 'Error al procesar la designación: ' + err.message;
                errDiv.classList.remove('hidden');
            }
        });
    });
}
window.openDesignationModal = openDesignationModal;
window.openDesignationModal = openDesignationModal;

window.openSubstitutionModal = function(designationId) {
    const modalHtml = `
        <div class="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
            <h3 class="text-sm font-bold text-slate-900">Registrar Suplencia Oficial (Resolución Ministerial)</h3>
            <button onclick="closeModal()" class="text-slate-400 hover:text-slate-700">✕</button>
        </div>

        <form id="subst-form" class="space-y-3">
            <input type="hidden" id="modal-subst-desig-id" value="${designationId}">

            <div>
                <label class="block text-[11px] font-bold text-slate-700 uppercase mb-1">Docente Suplente a Designar *</label>
                <select id="modal-subst-teacher" required class="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg">
                    <option value="">Seleccione el profesor suplente...</option>
                    ${AppState.teachersCache.map(t => `<option value="${t.id}">${escapeHtml(t.fullName)} (DNI ${t.dni}) - [${t.activeHours || 0}/30hs]</option>`).join('')}
                </select>
            </div>

            <div>
                <label class="block text-[11px] font-bold text-slate-700 uppercase mb-1">Motivo de la Licencia *</label>
                <input type="text" id="modal-subst-reason" required placeholder="Ej. Licencia por Enfermedad / Tratamiento Médico o Maternidad"
                    class="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg">
                <span class="text-[10px] text-slate-400">Si contiene términos médicos se clasificará automáticamente como DL-01; de lo contrario como DL-02.</span>
            </div>

            <div class="grid grid-cols-2 gap-3">
                <div>
                    <label class="block text-[11px] font-bold text-slate-700 uppercase mb-1">Fecha de Inicio *</label>
                    <input type="date" id="modal-subst-start" required class="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg">
                </div>
                <div>
                    <label class="block text-[11px] font-bold text-slate-700 uppercase mb-1">Fecha de Finalización</label>
                    <input type="date" id="modal-subst-end" class="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg">
                </div>
            </div>

            <div>
                <label class="block text-[11px] font-bold text-slate-700 uppercase mb-1">N° de Resolución / Expediente</label>
                <input type="text" id="modal-subst-resolution" placeholder="Ej. Res. Min. N° 451/2026"
                    class="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg">
            </div>

            <div id="modal-subst-error" class="hidden p-2 rounded bg-red-50 text-red-700 text-xs"></div>

            <div class="pt-3 border-t border-slate-100 flex justify-end space-x-2">
                <button type="button" onclick="closeModal()" class="px-4 py-2 border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-50">Cancelar</button>
                <button type="submit" class="btn-gold px-4 py-2 text-xs font-bold shadow-sm">Designar Suplente</button>
            </div>
        </form>
    `;

    openModal(modalHtml, () => {
        const form = document.getElementById('subst-form');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const errDiv = document.getElementById('modal-subst-error');
            errDiv.classList.add('hidden');

            const payload = {
                designationId: parseInt(document.getElementById('modal-subst-desig-id').value),
                suplenteTeacherId: parseInt(document.getElementById('modal-subst-teacher').value),
                licenseReason: document.getElementById('modal-subst-reason').value.trim(),
                startDate: document.getElementById('modal-subst-start').value,
                endDate: document.getElementById('modal-subst-end').value || null,
                resolutionNumber: document.getElementById('modal-subst-resolution').value.trim()
            };

            try {
                const res = await window.sigetApi.designations.saveSubstitution(payload);
                if (res.success) {
                    showToast('Suplencia oficial registrada con éxito.', 'success');
                    closeModal();
                    loadDesignations();
                } else {
                    errDiv.textContent = res.message || 'Error al guardar suplencia.';
                    errDiv.classList.remove('hidden');
                }
            } catch (err) {
                errDiv.textContent = 'Error de conexión con la base de datos.';
                errDiv.classList.remove('hidden');
            }
        });
    });
};

// ============================================================================
// 12. MÓDULO: CALENDARIO INSTITUCIONAL DEL PROFESORADO (LICENCIAS Y SUPLENCIAS)
// ============================================================================
AppState.calendarTimeline = null;

async function initTeacherCalendar() {
    const sel = document.getElementById('calendar-teacher-select');
    if (!sel) return;

    try {
        AppState.teachersCache = await window.sigetApi.teachers.getAll({ activeOnly: true });

        const currentVal = sel.value;
        sel.innerHTML = '<option value="">Seleccione un Docente...</option>';
        AppState.teachersCache.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.id;
            opt.textContent = `${t.lastName}, ${t.firstName} (DNI: ${t.dni}) - ${t.revista}`;
            sel.appendChild(opt);
        });

        if (currentVal) {
            sel.value = currentVal;
        } else if (AppState.teachersCache.length > 0) {
            sel.value = AppState.teachersCache[0].id;
        }

        // Configurar fechas iniciales (mes actual)
        const startInput = document.getElementById('calendar-start-date');
        const endInput = document.getElementById('calendar-end-date');
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();

        if (startInput && !startInput.value) startInput.value = `${y}-${m}-01`;
        if (endInput && !endInput.value) endInput.value = `${y}-${m}-${String(lastDay).padStart(2, '0')}`;

        if (sel.value) {
            await loadTeacherCalendar();
        }
    } catch (err) {
        console.error('Error al inicializar calendario docente:', err);
    }
}

async function loadTeacherCalendar() {
    const sel = document.getElementById('calendar-teacher-select');
    const startInput = document.getElementById('calendar-start-date');
    const endInput = document.getElementById('calendar-end-date');
    const headerPanel = document.getElementById('calendar-teacher-header');
    const detailsPanel = document.getElementById('calendar-details-panel');
    const tbody = document.getElementById('tbody-calendar-events');
    const countBadge = document.getElementById('cal-events-count');

    if (!sel || !sel.value) {
        if (headerPanel) headerPanel.classList.add('hidden');
        if (detailsPanel) detailsPanel.classList.add('hidden');
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="5" class="py-8 text-center text-xs text-slate-400 italic">Seleccione un docente institucional y presione Consultar.</td></tr>`;
        }
        return;
    }

    const teacherId = parseInt(sel.value);
    const startDate = startInput ? startInput.value : null;
    const endDate = endInput ? endInput.value : null;

    try {
        const res = await window.sigetApi.calendar.getTeacherTimeline({ teacherId, startDate, endDate });
        if (!res || !res.success) {
            showToast((res && res.message) ? res.message : 'Error al obtener datos del docente.', 'error');
            return;
        }

        AppState.calendarTimeline = res;
        const t = res.teacher;
        const m = res.annualMetrics;

        // 1. Cabecera y Carga Horaria
        if (headerPanel) headerPanel.classList.remove('hidden');
        if (detailsPanel) detailsPanel.classList.remove('hidden');

        document.getElementById('cal-docente-name').textContent = t.fullName;
        document.getElementById('cal-docente-dni').textContent = t.dni;
        document.getElementById('cal-docente-legajo').textContent = t.legajo || 'S/L';
        document.getElementById('cal-docente-revista').textContent = t.revista || 'Titular';

        const availBadge = document.getElementById('cal-avail-badge');
        if (availBadge) {
            availBadge.textContent = t.availabilityStatus;
            availBadge.className = `px-2 py-0.5 rounded text-[10px] font-black border ${t.availabilityBadge}`;
        }

        const hoursPercent = Math.min(100, Math.round((t.activeHours / 30) * 100));
        document.getElementById('cal-hours-text').textContent = `${t.activeHours} / 30 hs (${t.availableHours} hs disponibles)`;
        const hoursBar = document.getElementById('cal-hours-bar');
        if (hoursBar) {
            hoursBar.style.width = `${hoursPercent}%`;
            hoursBar.className = t.activeHours >= 30 ? 'h-full bg-rose-500 rounded-full' : (t.activeHours >= 24 ? 'h-full bg-amber-500 rounded-full' : 'h-full bg-gold rounded-full');
        }

        // 2. Límites Estatutarios Anuales
        // Inasistencias
        document.getElementById('cal-stat-i-text').textContent = `${m.inasistencias.count} / ${m.inasistencias.limit}`;
        const iBar = document.getElementById('cal-stat-i-bar');
        if (iBar) {
            iBar.style.width = `${m.inasistencias.percentage}%`;
            iBar.className = m.inasistencias.isDanger ? 'h-full bg-rose-600 rounded-full' : (m.inasistencias.isWarning ? 'h-full bg-amber-500 rounded-full' : 'h-full bg-emerald-500 rounded-full');
        }

        // Permisos Art. 115
        document.getElementById('cal-stat-p-text').textContent = `${m.permisos.count} / ${m.permisos.limit}`;
        const pBar = document.getElementById('cal-stat-p-bar');
        if (pBar) {
            pBar.style.width = `${m.permisos.percentage}%`;
            pBar.className = m.permisos.isDanger ? 'h-full bg-rose-600 rounded-full' : (m.permisos.isWarning ? 'h-full bg-amber-500 rounded-full' : 'h-full bg-amber-500 rounded-full');
        }

        // Licencias Médicas
        document.getElementById('cal-stat-lic-text').textContent = `${m.licenciasMedicas.count} / ${m.licenciasMedicas.limit} días`;
        const licBar = document.getElementById('cal-stat-lic-bar');
        if (licBar) {
            licBar.style.width = `${m.licenciasMedicas.percentage}%`;
            licBar.className = m.licenciasMedicas.isDanger ? 'h-full bg-rose-600 rounded-full' : (m.licenciasMedicas.isWarning ? 'h-full bg-amber-500 rounded-full' : 'h-full bg-purple-500 rounded-full');
        }

        // 3. Cátedras Asignadas
        const desigList = document.getElementById('cal-designations-list');
        if (desigList) {
            if (!res.designations || res.designations.length === 0) {
                desigList.innerHTML = '<div class="text-gray-300 italic py-3 px-4 text-center bg-zinc-800/80 rounded-xl border border-zinc-700/60">No posee cátedras regulares asignadas actualmente.</div>';
            } else {
                desigList.innerHTML = res.designations.map(d => `
                    <div class="cal-card-item p-3.5 rounded-xl border border-zinc-700/80 bg-zinc-800 hover:bg-zinc-750 hover:border-gold/50 transition-all flex items-center justify-between shadow-xs">
                        <div class="pr-3">
                            <div class="font-bold text-gray-100 text-xs flex items-center space-x-1.5">
                                <span>${escapeHtml(d.subject_name)}</span>
                                <span class="font-mono text-[10px] text-amber-300 font-semibold">(${escapeHtml(d.subject_code || '')})</span>
                            </div>
                            <div class="text-[11px] text-gray-400 mt-1.5 flex flex-wrap items-center gap-1.5">
                                <span class="text-gray-300 font-medium">${escapeHtml(d.career_name || '')}</span>
                                <span class="text-zinc-500">•</span>
                                <span class="font-medium text-gray-200">${escapeHtml(d.day_of_week)} ${escapeHtml(d.start_time)} a ${escapeHtml(d.end_time)}</span>
                            </div>
                        </div>
                        <div class="text-right shrink-0">
                            <span class="px-2.5 py-1 rounded-md text-[10px] font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/40">${d.hours_count} hs</span>
                            <div class="text-[10px] text-gray-400 font-medium mt-1">${escapeHtml(d.revista || 'Titular')}</div>
                        </div>
                    </div>
                `).join('');
            }
        }

        // 4. Suplencias Activas
        const subList = document.getElementById('cal-substitutions-list');
        if (subList) {
            const allSubs = [
                ...(res.substitutions.asTitular || []),
                ...(res.substitutions.asSuplente || [])
            ];

            if (allSubs.length === 0) {
                subList.innerHTML = '<div class="text-gray-300 italic py-3 px-4 text-center bg-zinc-800/80 rounded-xl border border-zinc-700/60">No registra suplencias vigentes ni históricas.</div>';
            } else {
                subList.innerHTML = allSubs.map(s => `
                    <div class="cal-card-item p-3.5 rounded-xl border border-zinc-700/80 bg-zinc-800 hover:bg-zinc-750 hover:border-purple-400/50 transition-all flex items-center justify-between shadow-xs">
                        <div class="pr-3">
                            <div class="font-bold text-gray-100 flex items-center space-x-2 text-xs">
                                <span class="px-2 py-0.5 rounded text-[10px] font-extrabold ${s.rol.includes('Titular') ? 'bg-purple-900/60 text-purple-200 border border-purple-500/50' : 'bg-blue-900/60 text-blue-200 border border-blue-500/50'}">${s.rol}</span>
                                <span class="text-gray-100 font-bold">${escapeHtml(s.subjectName || '')}</span>
                            </div>
                            <div class="text-[11px] text-gray-300 mt-1.5 leading-relaxed">
                                ${s.suplenteName ? `<span class="text-gray-400">Suplente:</span> <strong class="text-gray-100 font-semibold">${escapeHtml(s.suplenteName)}</strong>` : `<span class="text-gray-400">Titular:</span> <strong class="text-gray-100 font-semibold">${escapeHtml(s.titularName)}</strong>`}
                                <span class="mx-1 text-zinc-500">•</span>
                                <span class="italic text-gray-300">${escapeHtml(s.reason || 'Sin motivo')}</span>
                            </div>
                        </div>
                        <div class="text-right text-[10px] shrink-0">
                            <div class="font-medium text-gray-300">${escapeHtml(s.startDate)} al ${escapeHtml(s.endDate)}</div>
                            <div class="font-mono text-amber-300 font-bold mt-1">${escapeHtml(s.resolution || 'Disp. Pendiente')}</div>
                        </div>
                    </div>
                `).join('');
            }
        }

        // 5. Tabla Cronológica de Novedades y Asistencias
        if (tbody) {
            if (!res.events || res.events.length === 0) {
                tbody.innerHTML = `<tr><td colspan="5" class="py-10 text-center text-xs text-slate-400 italic">No se registraron asistencias ni novedades para este docente en el rango de fechas seleccionado.</td></tr>`;
            } else {
                tbody.innerHTML = res.events.map(ev => `
                    <tr class="hover:bg-slate-50 dark:hover:bg-zinc-800/40 transition border-b border-slate-100 dark:border-zinc-800 text-xs">
                        <td class="py-3 px-4 text-center font-mono font-bold text-slate-700 dark:text-zinc-300">${ev.date}</td>
                        <td class="py-3 px-4 text-center">
                            <span class="px-2.5 py-1 rounded text-[10px] font-bold border ${ev.badgeClass}">
                                ${ev.eventType} (${ev.status})
                            </span>
                        </td>
                        <td class="py-3 px-4 text-center font-bold text-slate-600 dark:text-zinc-300">${ev.hours || 4} hs</td>
                        <td class="py-3 px-4 font-medium text-slate-800 dark:text-zinc-200">${escapeHtml(ev.subjectName || 'Planta General')}</td>
                        <td class="py-3 px-4 text-slate-500 dark:text-zinc-400">${escapeHtml(ev.observations || '—')}</td>
                    </tr>
                `).join('');
            }
        }

        if (countBadge) {
            countBadge.textContent = `${(res.events || []).length} registros`;
        }

        initLucideIcons();
    } catch (err) {
        console.error('Error al cargar calendario de docente:', err);
        showToast('Error al consultar el calendario docente: ' + err.message, 'error');
    }
}
window.initTeacherCalendar = initTeacherCalendar;
window.loadTeacherCalendar = loadTeacherCalendar;

// ============================================================================
// 12.B MÓDULO: IMPORTACIÓN MASIVA UNIFICADA DE ARCHIVOS
// ============================================================================
AppState.csvExplicitMode = 'auto'; // 'auto' | 'personnel' | 'attendance'
AppState.csvDetectedType = 'personnel';
AppState.csvLoadedFile = null;
AppState.csvText = '';
AppState.csvPreviewData = null;

function initCsvImport() {
    initLucideIcons();
}

function initCsvImportEvents() {
    const dropzone = document.getElementById('csv-dropzone');
    const fileInput = document.getElementById('csv-file-input');
    const btnClear = document.getElementById('btn-csv-clear');
    const btnPreview = document.getElementById('btn-csv-preview');
    const btnCommit = document.getElementById('btn-csv-commit');

    const btnAuto = document.getElementById('btn-mode-auto');
    const btnPersonnel = document.getElementById('btn-mode-personnel');
    const btnAttendance = document.getElementById('btn-mode-attendance');

    if (btnAuto) btnAuto.addEventListener('click', () => setCsvExplicitMode('auto'));
    if (btnPersonnel) btnPersonnel.addEventListener('click', () => setCsvExplicitMode('personnel'));
    if (btnAttendance) btnAttendance.addEventListener('click', () => setCsvExplicitMode('attendance'));

    if (dropzone && fileInput) {
        dropzone.addEventListener('click', () => fileInput.click());

        dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.add('border-gold', 'bg-gold/5');
        });

        dropzone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.remove('border-gold', 'bg-gold/5');
        });

        dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.remove('border-gold', 'bg-gold/5');
            if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                handleFileSelected(e.dataTransfer.files[0]);
            }
        });

        fileInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files.length > 0) {
                handleFileSelected(e.target.files[0]);
            }
        });
    }

    if (btnClear) {
        btnClear.addEventListener('click', clearCsvImportState);
    }

    if (btnPreview) {
        btnPreview.addEventListener('click', handleCsvPreview);
    }

    if (btnCommit) {
        btnCommit.addEventListener('click', handleCsvCommit);
    }
}

function setCsvExplicitMode(mode) {
    AppState.csvExplicitMode = mode;
    const btnAuto = document.getElementById('btn-mode-auto');
    const btnPersonnel = document.getElementById('btn-mode-personnel');
    const btnAttendance = document.getElementById('btn-mode-attendance');
    const optPersonnel = document.getElementById('csv-options-personnel');

    const activeClasses = 'px-3 py-1.5 text-xs font-bold rounded-md bg-white dark:bg-zinc-700 text-slate-900 dark:text-zinc-100 shadow-xs transition';
    const inactiveClasses = 'px-3 py-1.5 text-xs font-bold rounded-md text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 transition';

    if (btnAuto) btnAuto.className = mode === 'auto' ? activeClasses : inactiveClasses;
    if (btnPersonnel) btnPersonnel.className = mode === 'personnel' ? activeClasses : inactiveClasses;
    if (btnAttendance) btnAttendance.className = mode === 'attendance' ? activeClasses : inactiveClasses;

    if (optPersonnel) {
        if (mode === 'attendance') {
            optPersonnel.classList.add('hidden');
        } else {
            optPersonnel.classList.remove('hidden');
        }
    }

    if (AppState.csvLoadedFile) {
        handleFileSelected(AppState.csvLoadedFile);
    }
}

async function handleFileSelected(file) {
    if (!file) return;

    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const validExts = ['csv', 'txt', 'xlsx', 'xls', 'docx', 'doc'];
    if (!validExts.includes(ext)) {
        showToast(`Formato de archivo .${ext} no admitido. Formatos válidos: .xlsx, .xls, .docx, .doc, .csv, .txt`, 'error');
        return;
    }

    showToast(`Cargando archivo "${file.name}"...`, 'info');

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const dataUrl = e.target.result;
            const base64 = dataUrl.split(',')[1];

            const res = await window.sigetApi.csv.parseUniversalFile({
                fileBufferBase64: base64,
                fileName: file.name,
                explicitType: AppState.csvExplicitMode
            });

            if (!res || !res.success) {
                showToast(res && res.message ? res.message : 'Error al procesar el archivo.', 'error');
                return;
            }

            AppState.csvLoadedFile = file;
            AppState.csvText = res.csvText || '';
            AppState.csvDetectedType = res.detectedType || 'personnel';
            AppState.csvPreviewData = null;

            updateFileLoadedCard(res);
            showToast(res.message || `Archivo "${file.name}" cargado exitosamente.`, 'success');

            // Previsualización y validación inmediata
            await handleCsvPreview();
        } catch (err) {
            console.error('Error procesando archivo:', err);
            showToast('Error procesando archivo: ' + err.message, 'error');
        }
    };
    reader.onerror = () => {
        showToast('No se pudo leer el archivo seleccionado.', 'error');
    };
    reader.readAsDataURL(file);
}

function updateFileLoadedCard(data) {
    const dropzone = document.getElementById('csv-dropzone');
    const loadedCard = document.getElementById('csv-file-loaded-card');
    const filenameElem = document.getElementById('csv-loaded-filename');
    const badgeElem = document.getElementById('csv-loaded-badge');
    const sizeElem = document.getElementById('csv-loaded-size');
    const typeTextElem = document.getElementById('csv-loaded-type-text');
    const sheetElem = document.getElementById('csv-loaded-sheet');
    const optPersonnel = document.getElementById('csv-options-personnel');
    const fileIcon = document.getElementById('csv-file-icon');

    if (dropzone) dropzone.classList.add('hidden');
    if (loadedCard) loadedCard.classList.remove('hidden');

    if (filenameElem) filenameElem.textContent = data.fileName || 'Archivo cargado';
    if (badgeElem) badgeElem.textContent = data.fileExt || 'DOC';

    const sizeKb = Math.round((data.fileSize || 0) / 1024);
    if (sizeElem) sizeElem.textContent = sizeKb > 1024 ? `${(sizeKb / 1024).toFixed(1)} MB` : `${sizeKb} KB`;

    const typeLabel = data.detectedType === 'attendance' ? 'Asistencias y Novedades' : 'Planta Funcional';
    if (typeTextElem) typeTextElem.textContent = `Tipo: ${typeLabel} (${data.totalRows} filas)`;

    if (sheetElem) {
        if (data.sheetName) {
            sheetElem.textContent = `• Hoja: "${data.sheetName}"`;
            sheetElem.classList.remove('hidden');
        } else {
            sheetElem.classList.add('hidden');
        }
    }

    if (optPersonnel) {
        if (data.detectedType === 'personnel') {
            optPersonnel.classList.remove('hidden');
        } else {
            optPersonnel.classList.add('hidden');
        }
    }

    if (fileIcon) {
        const ext = (data.fileExt || '').toLowerCase();
        if (ext.includes('xls')) {
            fileIcon.className = 'w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-300 dark:border-emerald-800';
            fileIcon.innerHTML = '<i data-lucide="file-spreadsheet" class="w-5 h-5"></i>';
        } else if (ext.includes('doc')) {
            fileIcon.className = 'w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center border border-blue-300 dark:border-blue-800';
            fileIcon.innerHTML = '<i data-lucide="file-text" class="w-5 h-5"></i>';
        } else {
            fileIcon.className = 'w-10 h-10 rounded-lg bg-cyan-100 dark:bg-cyan-950/60 text-cyan-600 dark:text-cyan-400 flex items-center justify-center border border-cyan-300 dark:border-cyan-800';
            fileIcon.innerHTML = '<i data-lucide="file-code" class="w-5 h-5"></i>';
        }
    }

    const modeBadge = document.getElementById('csv-mode-badge');
    const modeBadgeText = document.getElementById('csv-mode-badge-text');
    if (modeBadge && modeBadgeText) {
        modeBadge.classList.remove('hidden');
        modeBadge.classList.add('flex');
        modeBadgeText.textContent = `Detectado: ${typeLabel}`;
    }

    initLucideIcons();
}

function clearCsvImportState() {
    AppState.csvLoadedFile = null;
    AppState.csvText = '';
    AppState.csvPreviewData = null;
    AppState.csvDetectedType = 'personnel';

    const fileInput = document.getElementById('csv-file-input');
    if (fileInput) fileInput.value = '';

    const dropzone = document.getElementById('csv-dropzone');
    const loadedCard = document.getElementById('csv-file-loaded-card');
    const previewPanel = document.getElementById('csv-preview-panel');
    const errorsBox = document.getElementById('csv-errors-box');
    const errorsList = document.getElementById('csv-errors-list');
    const modeBadge = document.getElementById('csv-mode-badge');

    if (dropzone) dropzone.classList.remove('hidden');
    if (loadedCard) loadedCard.classList.add('hidden');
    if (previewPanel) previewPanel.classList.add('hidden');
    if (errorsBox) errorsBox.classList.add('hidden');
    if (errorsList) errorsList.innerHTML = '';
    if (modeBadge) {
        modeBadge.classList.add('hidden');
        modeBadge.classList.remove('flex');
    }

    const statTotal = document.getElementById('csv-stat-total');
    const statValid = document.getElementById('csv-stat-valid');
    const statInvalid = document.getElementById('csv-stat-invalid');
    const statExisting = document.getElementById('csv-stat-existing');
    if (statTotal) statTotal.textContent = '0';
    if (statValid) statValid.textContent = '0';
    if (statInvalid) statInvalid.textContent = '0';
    if (statExisting) statExisting.textContent = '0';

    const thead = document.getElementById('thead-csv-preview');
    const tbody = document.getElementById('tbody-csv-preview');
    if (thead) thead.innerHTML = '';
    if (tbody) tbody.innerHTML = '';

    showToast('Archivo descartado. Puede cargar uno nuevo.', 'info');
    initLucideIcons();
}

async function handleCsvPreview() {
    if (!AppState.csvText) {
        showToast('Por favor cargue un archivo antes de previsualizar y validar.', 'warning');
        return;
    }

    const mode = (AppState.csvExplicitMode && AppState.csvExplicitMode !== 'auto')
        ? AppState.csvExplicitMode
        : (AppState.csvDetectedType || 'personnel');

    const btnPreview = document.getElementById('btn-csv-preview');
    if (btnPreview) {
        btnPreview.disabled = true;
        btnPreview.innerHTML = `<span>Validando registros...</span>`;
    }

    try {
        let res;
        if (mode === 'personnel') {
            res = await window.sigetApi.csv.previewPersonnel(AppState.csvText);
        } else {
            res = await window.sigetApi.csv.previewAttendance(AppState.csvText);
        }

        if (btnPreview) {
            btnPreview.disabled = false;
            btnPreview.innerHTML = `<i data-lucide="shield-check" class="w-4 h-4"></i><span>Previsualizar y Validar Datos</span>`;
        }

        if (!res || !res.success) {
            showToast((res && res.message) ? res.message : 'Error al procesar el archivo.', 'error');
            return;
        }

        AppState.csvPreviewData = res;

        // 1. Métricas
        document.getElementById('csv-stat-total').textContent = res.totalRows || 0;
        document.getElementById('csv-stat-valid').textContent = res.validRows || 0;
        document.getElementById('csv-stat-invalid').textContent = res.invalidRows || 0;
        
        const existingCount = (res.preview || []).filter(p => p.existsInDb).length;
        document.getElementById('csv-stat-existing').textContent = existingCount;

        // 2. Caja de Inconsistencias
        const errorsBox = document.getElementById('csv-errors-box');
        const errorsList = document.getElementById('csv-errors-list');
        if (res.errors && res.errors.length > 0) {
            errorsBox.classList.remove('hidden');
            errorsList.innerHTML = res.errors.map(err => `
                <li><strong>Línea ${err.line} (DNI ${err.dni || '-'}):</strong> ${(err.errors || []).join(', ')}</li>
            `).join('');
        } else {
            errorsBox.classList.add('hidden');
            errorsList.innerHTML = '';
        }

        // 3. Tabla de Previsualización
        const thead = document.getElementById('thead-csv-preview');
        const tbody = document.getElementById('tbody-csv-preview');

        if (mode === 'personnel') {
            thead.innerHTML = `
                <tr>
                    <th class="w-14 text-center">LÍN.</th>
                    <th class="w-24 text-center">ESTADO</th>
                    <th class="w-24 text-center">DNI</th>
                    <th class="w-48">DOCENTE</th>
                    <th class="w-24 text-center">REVISTA</th>
                    <th class="w-44">CÁTEDRA</th>
                    <th class="w-20 text-center">HORAS</th>
                    <th class="w-24 text-center">PROYECTADAS</th>
                    <th>DETALLE VALIDACIÓN</th>
                </tr>
            `;

            tbody.innerHTML = (res.preview || []).map(r => `
                <tr class="border-b border-slate-100 dark:border-zinc-800 text-xs ${r.status === 'VÁLIDO' ? 'hover:bg-slate-50 dark:hover:bg-zinc-800/40' : 'bg-rose-50/40 dark:bg-rose-950/20'}">
                    <td class="py-2 px-2 text-center font-mono font-bold text-slate-500">${r.line}</td>
                    <td class="py-2 px-2 text-center">
                        <span class="px-2 py-0.5 rounded text-[10px] font-bold ${r.status === 'VÁLIDO' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}">
                            ${r.status}
                        </span>
                    </td>
                    <td class="py-2 px-2 text-center font-mono font-bold text-slate-700 dark:text-zinc-300">${escapeHtml(r.dni)}</td>
                    <td class="py-2 px-2 font-bold text-slate-900 dark:text-zinc-100">${escapeHtml(r.fullName)}</td>
                    <td class="py-2 px-2 text-center text-slate-600 dark:text-zinc-300">${escapeHtml(r.revista)}</td>
                    <td class="py-2 px-2 text-slate-700 dark:text-zinc-200">${escapeHtml(r.catedra)}</td>
                    <td class="py-2 px-2 text-center font-bold text-slate-700 dark:text-zinc-300">${r.horas} hs</td>
                    <td class="py-2 px-2 text-center font-bold ${r.projectedHours > 30 ? 'text-rose-600' : 'text-slate-800 dark:text-zinc-200'}">${r.projectedHours} / 30 hs</td>
                    <td class="py-2 px-2 text-[11px] ${r.status === 'VÁLIDO' ? 'text-slate-400' : 'text-rose-600 font-medium'}">${escapeHtml(r.errorMessages || (r.existsInDb ? 'Docente ya registrado (se actualizará)' : 'Nuevo docente para alta'))}</td>
                </tr>
            `).join('');
        } else {
            thead.innerHTML = `
                <tr>
                    <th class="w-14 text-center">LÍN.</th>
                    <th class="w-24 text-center">ESTADO</th>
                    <th class="w-24 text-center">DNI</th>
                    <th class="w-48">DOCENTE</th>
                    <th class="w-24 text-center">FECHA</th>
                    <th class="w-28 text-center">MARCA</th>
                    <th class="w-20 text-center">HORAS</th>
                    <th>OBSERVACIONES / ERRORES</th>
                </tr>
            `;

            tbody.innerHTML = (res.preview || []).map(r => `
                <tr class="border-b border-slate-100 dark:border-zinc-800 text-xs ${r.status === 'VÁLIDO' ? 'hover:bg-slate-50 dark:hover:bg-zinc-800/40' : 'bg-rose-50/40 dark:bg-rose-950/20'}">
                    <td class="py-2 px-2 text-center font-mono font-bold text-slate-500">${r.line}</td>
                    <td class="py-2 px-2 text-center">
                        <span class="px-2 py-0.5 rounded text-[10px] font-bold ${r.status === 'VÁLIDO' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}">
                            ${r.status}
                        </span>
                    </td>
                    <td class="py-2 px-2 text-center font-mono font-bold text-slate-700 dark:text-zinc-300">${escapeHtml(r.dni)}</td>
                    <td class="py-2 px-2 font-bold text-slate-900 dark:text-zinc-100">${escapeHtml(r.teacherName)}</td>
                    <td class="py-2 px-2 text-center font-mono text-slate-700 dark:text-zinc-300">${escapeHtml(r.fecha)}</td>
                    <td class="py-2 px-2 text-center font-bold text-slate-800 dark:text-zinc-200">${escapeHtml(r.estado)}</td>
                    <td class="py-2 px-2 text-center font-bold text-slate-700 dark:text-zinc-300">${r.horas} hs</td>
                    <td class="py-2 px-2 text-[11px] ${r.status === 'VÁLIDO' ? 'text-slate-500' : 'text-rose-600 font-medium'}">${escapeHtml(r.errorMessages || r.observaciones || 'OK')}</td>
                </tr>
            `).join('');
        }

        const previewPanel = document.getElementById('csv-preview-panel');
        if (previewPanel) previewPanel.classList.remove('hidden');
        initLucideIcons();
        showToast(`Previsualización completada: ${res.validRows} registros listos para importar.`, 'success');
    } catch (err) {
        console.error('Error al previsualizar CSV:', err);
        showToast('Error al previsualizar datos: ' + err.message, 'error');
    }
}

async function handleCsvCommit() {
    if (!AppState.csvPreviewData) {
        showToast('Primero debe previsualizar y validar los datos.', 'warning');
        return;
    }

    if (AppState.csvPreviewData.validRows === 0) {
        showToast('No existen registros válidos para importar.', 'error');
        return;
    }

    const mode = (AppState.csvExplicitMode && AppState.csvExplicitMode !== 'auto')
        ? AppState.csvExplicitMode
        : (AppState.csvDetectedType || 'personnel');

    if (!confirm(`¿Desea confirmar la importación definitiva de ${AppState.csvPreviewData.validRows} registros a la base de datos?`)) {
        return;
    }

    const btnCommit = document.getElementById('btn-csv-commit');
    if (btnCommit) {
        btnCommit.disabled = true;
        btnCommit.innerHTML = `<span>Importando registros en base de datos...</span>`;
    }

    try {
        let res;
        if (mode === 'personnel') {
            const updateExisting = document.getElementById('csv-opt-update') ? document.getElementById('csv-opt-update').checked : true;
            const createDesignations = document.getElementById('csv-opt-desigs') ? document.getElementById('csv-opt-desigs').checked : true;
            res = await window.sigetApi.csv.importPersonnel({
                csvText: AppState.csvText,
                updateExisting,
                createDesignations
            });
        } else {
            res = await window.sigetApi.csv.importAttendance(AppState.csvText);
        }

        if (btnCommit) {
            btnCommit.disabled = false;
            btnCommit.innerHTML = `<i data-lucide="database" class="w-4 h-4"></i><span>Confirmar e Importar a Base de Datos</span>`;
        }

        if (res && res.success) {
            showToast(res.message || 'Importación completada con éxito.', 'success');
            AppState.teachersCache = await window.sigetApi.teachers.getAll({ activeOnly: true });
            clearCsvImportState();
        } else {
            showToast((res && res.message) ? res.message : 'Error durante la persistencia de datos.', 'error');
        }
    } catch (err) {
        console.error('Error al persistir importación CSV:', err);
        showToast('Error al persistir importación: ' + err.message, 'error');
        if (btnCommit) {
            btnCommit.disabled = false;
            btnCommit.innerHTML = `<i data-lucide="database" class="w-4 h-4"></i><span>Confirmar e Importar a Base de Datos</span>`;
        }
    }
}
window.initCsvImport = initCsvImport;
window.initCsvImportEvents = initCsvImportEvents;
window.handleFileSelected = handleFileSelected;
window.clearCsvImportState = clearCsvImportState;
window.handleCsvPreview = handleCsvPreview;
window.handleCsvCommit = handleCsvCommit;

// ============================================================================
// 13. REPORTES EXCEL Y GENERACIÓN MENSUAL OFICIAL CON PREVISUALIZACIÓN
// ============================================================================
AppState.reportPreviewRecords = [];
AppState.reportPreviewFilter = 'all';

async function previewMonthlyReport(silent = false) {
    const yearInput = document.getElementById('report-year');
    const monthSelect = document.getElementById('report-month');
    const metaP = document.getElementById('report-preview-meta');

    if (!yearInput || !monthSelect) return;

    const year = parseInt(yearInput.value) || 2026;
    const month = parseInt(monthSelect.value) || 10;

    const btnPrev = document.getElementById('btn-preview-report');
    if (btnPrev && !silent) {
        btnPrev.disabled = true;
        btnPrev.innerHTML = `<span>Procesando datos...</span>`;
    }

    try {
        const data = await window.sigetApi.reports.getPreview(year, month);
        const list01 = ((data && (data.il01 || data.dl01)) || []).map(r => ({ ...r, cuadro: 'il01' }));
        const list02 = ((data && (data.il02 || data.dl02)) || []).map(r => ({ ...r, cuadro: 'il02' }));
        AppState.reportPreviewRecords = [...list01, ...list02];

        if (metaP) {
            metaP.textContent = `Total: ${AppState.reportPreviewRecords.length} registros listos | Cuadro IL-01 (Salud): ${list01.length} | Cuadro IL-02 (Novedades): ${list02.length} | Período: ${String(month).padStart(2, '0')}/${year}`;
        }

        renderReportPreviewTable();
        if (!silent) {
            showToast(`Previsualización cargada: ${AppState.reportPreviewRecords.length} registros listos para exportar.`, 'success');
        }
    } catch (err) {
        console.error('Error al previsualizar reporte:', err);
        if (!silent) {
            showToast('Error al procesar la previsualización de registros.', 'error');
        }
    } finally {
        if (btnPrev && !silent) {
            btnPrev.disabled = false;
            btnPrev.innerHTML = `<i data-lucide="eye" class="w-4 h-4"></i><span>Previsualizar Planilla</span>`;
            initLucideIcons();
        }
    }
}

function setReportPreviewFilter(filter) {
    AppState.reportPreviewFilter = filter;
    const btnAll = document.getElementById('btn-preview-filter-all');
    const btn01 = document.getElementById('btn-preview-filter-dl01');
    const btn02 = document.getElementById('btn-preview-filter-dl02');

    const activeClass = 'px-3 py-1 text-[11px] font-bold rounded-md bg-gold text-slate-900 transition';
    const inactiveClass = 'px-3 py-1 text-[11px] font-bold rounded-md text-slate-600 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-zinc-700 transition';

    if (btnAll) btnAll.className = filter === 'all' ? activeClass : inactiveClass;
    if (btn01) btn01.className = (filter === 'dl01' || filter === 'il01') ? activeClass : inactiveClass;
    if (btn02) btn02.className = (filter === 'dl02' || filter === 'il02') ? activeClass : inactiveClass;

    renderReportPreviewTable();
}

function renderReportPreviewTable() {
    const tbody = document.getElementById('table-report-preview-body');
    if (!tbody) return;

    let records = AppState.reportPreviewRecords || [];
    if (AppState.reportPreviewFilter === 'dl01' || AppState.reportPreviewFilter === 'il01') {
        records = records.filter(r => r.cuadro === 'il01' || r.cuadro === 'dl01');
    } else if (AppState.reportPreviewFilter === 'dl02' || AppState.reportPreviewFilter === 'il02') {
        records = records.filter(r => r.cuadro === 'il02' || r.cuadro === 'dl02');
    }

    if (records.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="12" class="p-8 text-center text-slate-400 dark:text-zinc-500">
                    No se encontraron registros de novedades o licencias para el período y filtro seleccionados.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = records.map((r, idx) => {
        const isIL01 = (r.cuadro === 'il01' || r.cuadro === 'dl01');
        const badgeColor = isIL01 
            ? 'text-amber-800 bg-amber-50 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800' 
            : 'text-blue-800 bg-blue-50 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800';
        const bgRow = idx % 2 === 0 ? 'bg-white dark:bg-[#242424]' : 'bg-slate-50/70 dark:bg-[#1E1E1E]';

        return `
            <tr class="${bgRow} hover:bg-amber-50/40 dark:hover:bg-zinc-800 transition border-b border-slate-100 dark:border-zinc-800/80">
                <td class="p-2.5 text-center font-bold text-gold-text font-mono">${escapeHtml(r.oficina || '1452')}</td>
                <td class="p-2.5 text-center font-mono text-slate-600 dark:text-zinc-400">${escapeHtml(r.año || '2026')}</td>
                <td class="p-2.5 text-center">
                    <span class="inline-block px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-slate-100 dark:bg-zinc-800 text-slate-800 dark:text-zinc-200 border border-slate-200 dark:border-zinc-700">
                        ${escapeHtml(r.disposicion || 'Disp. N° ---/2026')}
                    </span>
                </td>
                <td class="p-2.5 text-center font-bold text-slate-800 dark:text-zinc-200 font-mono">${escapeHtml(r.dni)}</td>
                <td class="p-2.5 font-bold text-slate-900 dark:text-zinc-100">${escapeHtml(r.apellidoNombre)}</td>
                <td class="p-2.5 text-slate-700 dark:text-zinc-300 font-medium">${escapeHtml(r.cargo || 'Cátedra')}</td>
                <td class="p-2.5 text-center">
                    <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${badgeColor}">
                        ${escapeHtml(r.codigo || '114')}
                    </span>
                </td>
                <td class="p-2.5 text-slate-600 dark:text-zinc-400 truncate max-w-xs" title="${escapeHtml(r.motivo || '')}">
                    ${escapeHtml(r.motivo || 'Novedad')}
                </td>
                <td class="p-2.5 text-center font-mono text-slate-700 dark:text-zinc-300">${escapeHtml(r.desde)}</td>
                <td class="p-2.5 text-center font-mono text-slate-700 dark:text-zinc-300">${escapeHtml(r.hasta)}</td>
                <td class="p-2.5 text-center font-bold text-slate-800 dark:text-zinc-200 font-mono">${r.dias || 1}</td>
                <td class="p-2.5 text-center font-bold text-slate-800 dark:text-zinc-200 font-mono">${r.horas || 4}</td>
            </tr>
        `;
    }).join('');
}

async function generateMonthlyReport() {
    const yearInput = document.getElementById('report-year');
    const monthSelect = document.getElementById('report-month');
    const statusDiv = document.getElementById('report-status');
    const btnGen = document.getElementById('btn-generate-report');

    const year = parseInt(yearInput.value) || 2026;
    const month = parseInt(monthSelect.value) || 10;

    btnGen.disabled = true;
    btnGen.innerHTML = `<span>Compilando Planilla Excel...</span>`;
    statusDiv.className = 'mt-4 p-3 rounded-lg text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 block';
    statusDiv.textContent = `Compilando Cuadros IL-01, IL-02 y Hoja Estadística para ${month}/${year}...`;

    try {
        const res = await window.sigetApi.reports.generateMonthly(year, month);
        if (res.success) {
            statusDiv.className = 'mt-4 p-3 rounded-lg text-xs font-medium bg-emerald-50 text-emerald-800 border border-emerald-200 block';
            statusDiv.innerHTML = `
                <div class="font-bold flex items-center space-x-1.5">
                    <i data-lucide="check-circle" class="w-4 h-4 text-emerald-600"></i>
                    <span>Planilla Oficial Generada con Éxito</span>
                </div>
                <div class="mt-1 text-slate-600 font-mono text-[11px] truncate">Ruta: ${escapeHtml(res.filePath)}</div>
                <div class="mt-2">
                    <button id="btn-open-excel" class="bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-3 py-1 rounded text-xs">
                        Abrir Planilla en Excel
                    </button>
                </div>
            `;
            initLucideIcons();

            const btnOpen = document.getElementById('btn-open-excel');
            if (btnOpen) {
                btnOpen.addEventListener('click', async () => {
                    await window.sigetApi.reports.openFile(res.filePath);
                });
            }

            showToast('Planilla mensual generada y descargada correctamente.', 'success');
        } else {
            statusDiv.className = 'mt-4 p-3 rounded-lg text-xs font-medium bg-rose-50 text-rose-800 border border-rose-200 block';
            statusDiv.textContent = res.message || 'Error al generar la planilla.';
        }
    } catch (err) {
        console.error('Error al generar planilla:', err);
        statusDiv.className = 'mt-4 p-3 rounded-lg text-xs font-medium bg-rose-50 text-rose-800 border border-rose-200 block';
        statusDiv.textContent = 'Error crítico al procesar la exportación.';
    } finally {
        btnGen.disabled = false;
        btnGen.innerHTML = `<i data-lucide="download" class="w-4 h-4"></i><span>Confirmar y Descargar Excel</span>`;
        initLucideIcons();
    }
}

// ============================================================================
// 14. UTILIDADES DE MODAL, TOAST Y HELPERS
// ============================================================================
function openModal(contentHtml, callback = null) {
    const container = document.getElementById('modal-container');
    const content = document.getElementById('modal-content');
    if (!container || !content) return;

    content.innerHTML = contentHtml;
    container.classList.remove('hidden');

    if (callback && typeof callback === 'function') {
        callback();
    }

    initLucideIcons();
}

function closeModal() {
    const container = document.getElementById('modal-container');
    if (container) {
        container.classList.add('hidden');
    }
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    const colors = {
        success: 'bg-slate-900 border-emerald-500 text-white',
        error: 'bg-slate-900 border-rose-500 text-white',
        info: 'bg-slate-900 border-gold text-white'
    };

    const icons = {
        success: 'check-circle',
        error: 'alert-triangle',
        info: 'info'
    };

    toast.className = `p-3 rounded-lg border-l-4 shadow-xl flex items-center space-x-2 text-xs font-medium transition-all transform translate-y-2 opacity-0 pointer-events-auto max-w-sm ${colors[type] || colors.info}`;
    toast.innerHTML = `
        <i data-lucide="${icons[type] || 'info'}" class="w-4 h-4 text-gold flex-shrink-0"></i>
        <span class="flex-1">${escapeHtml(message)}</span>
    `;

    container.appendChild(toast);
    initLucideIcons();

    setTimeout(() => {
        toast.classList.remove('translate-y-2', 'opacity-0');
    }, 10);

    setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-x-4');
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function escapeHtml(text) {
    if (!text && text !== 0) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
