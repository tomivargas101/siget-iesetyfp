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
    // Botones de Acceso Rápido Oficial (Rector, Secretaría, Bedelía)
    // -------------------------------------------------------------
    const btnDemoRector = document.getElementById('btn-demo-rector');
    const btnDemoSec = document.getElementById('btn-demo-secretaria');
    const btnDemoBedel = document.getElementById('btn-demo-bedel');
    const uInput = document.getElementById('login-username');
    const pInput = document.getElementById('login-password');

    if (btnDemoRector && uInput && pInput) {
        btnDemoRector.addEventListener('click', () => {
            uInput.value = 'rector';
            pInput.value = 'rector123';
            const errorDiv = document.getElementById('login-error');
            if (errorDiv) errorDiv.classList.add('hidden');
        });
    }
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
    // Sub-solapas del Módulo Docentes
    // -------------------------------------------------------------
    const tabLegajos = document.getElementById('tab-btn-legajos');
    const tabAsistencias = document.getElementById('tab-btn-asistencias');
    if (tabLegajos && tabAsistencias) {
        tabLegajos.addEventListener('click', () => switchTeacherSubtab('legajos'));
        tabAsistencias.addEventListener('click', () => switchTeacherSubtab('asistencias'));
    }

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
    // Asistencias Diarias: Controles de Fecha
    // -------------------------------------------------------------
    const attDateInput = document.getElementById('att-date-input');
    const btnAttPrev = document.getElementById('btn-att-prev');
    const btnAttToday = document.getElementById('btn-att-today');
    const btnAttNext = document.getElementById('btn-att-next');
    const attSearch = document.getElementById('att-search');
    const btnAttSaveAll = document.getElementById('btn-att-save-all');
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

    if (attSearch) attSearch.addEventListener('input', debounce(filterAttendanceTable, 200));
    if (btnAttSaveAll) btnAttSaveAll.addEventListener('click', saveAllAttendanceRecords);

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
    // Alumnos e Inscripciones
    // -------------------------------------------------------------
    const studentSearch = document.getElementById('student-search');
    const studentFilterCareer = document.getElementById('student-filter-career');
    if (studentSearch) studentSearch.addEventListener('input', debounce(loadStudents, 250));
    if (studentFilterCareer) studentFilterCareer.addEventListener('change', loadStudents);

    const btnNewStudent = document.getElementById('btn-new-student');
    if (btnNewStudent) btnNewStudent.addEventListener('click', () => openStudentModal());

    // -------------------------------------------------------------
    // Gestión de Usuarios (Rector)
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
            if (e.target.value === 'RECTOR') {
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
                            showToast('Cuenta de Rector creada exitosamente. Inicie sesión.', 'success');
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
        if (userRoleStr === 'rector') {
            roleElem.textContent = 'RECTOR';
            roleElem.className = 'px-2 py-0.5 text-[10px] font-bold rounded bg-slate-900 text-gold uppercase tracking-wider border border-gold/50';
        } else if (userRoleStr === 'secretaria') {
            roleElem.textContent = 'SECRETARÍA';
            roleElem.className = 'px-2 py-0.5 text-[10px] font-bold rounded bg-purple-900 text-purple-200 uppercase tracking-wider border border-purple-400/40';
        } else {
            roleElem.textContent = 'BEDELÍA';
            roleElem.className = 'px-2 py-0.5 text-[10px] font-bold rounded bg-blue-900 text-blue-200 uppercase tracking-wider border border-blue-400/40';
        }
    }

    // Regla de Perfiles Institucionales (3 Roles Oficiales):
    // 1. Rector: Control total institucional (incluye Gestión de Usuarios y Planillas Excel)
    // 2. Secretaría: Gestión Académica integral (Alumnos, Docentes, Cátedras, Planillas Excel). Excluye Gestión de Usuarios.
    // 3. Bedelía: Operativa de asistencias y alumnos. Excluye Gestión de Usuarios y Planillas Excel.
    const navReports = document.getElementById('nav-btn-reports');
    const navUsers = document.getElementById('nav-btn-users');

    if (userRoleStr === 'rector') {
        if (navReports) navReports.classList.remove('hidden');
        if (navUsers) navUsers.classList.remove('hidden');
    } else if (userRoleStr === 'secretaria') {
        if (navReports) navReports.classList.remove('hidden');
        if (navUsers) navUsers.classList.add('hidden');
    } else {
        if (navReports) navReports.classList.add('hidden');
        if (navUsers) navUsers.classList.add('hidden');
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
    const studentSel = document.getElementById('student-filter-career');

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
    updateSelect(studentSel, null);
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
        students: 'Gestión de Alumnos e Inscripciones',
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
            } else {
                loadDailyAttendance();
            }
            break;
        case 'designations':
            if (AppState.currentDesigSubtab === 'desig') {
                loadDesignations();
            } else {
                loadSubstitutions();
            }
            break;
        case 'students':
            loadStudents();
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
    const subtabLegajos = document.getElementById('subtab-legajos');
    const subtabAsist = document.getElementById('subtab-asistencias');

    if (tabName === 'legajos') {
        btnLegajos.className = 'tab-btn active px-4 py-2 text-xs font-bold rounded-lg bg-slate-900 text-gold transition';
        btnAsist.className = 'tab-btn px-4 py-2 text-xs font-bold rounded-lg text-slate-600 hover:bg-slate-200 transition';
        subtabLegajos.classList.remove('hidden');
        subtabAsist.classList.add('hidden');
        loadTeachers();
    } else {
        btnLegajos.className = 'tab-btn px-4 py-2 text-xs font-bold rounded-lg text-slate-600 hover:bg-slate-200 transition';
        btnAsist.className = 'tab-btn active px-4 py-2 text-xs font-bold rounded-lg bg-slate-900 text-gold transition';
        subtabLegajos.classList.add('hidden');
        subtabAsist.classList.remove('hidden');
        loadDailyAttendance();
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
                        <option value="RECTOR">Rector</option>
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
                            <option value="RECTOR" ${user.role === 'RECTOR' ? 'selected' : ''}>Rector</option>
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
                Como Rector, puede establecer de manera inmediata una nueva contraseña para el usuario <strong>${escapeHtml(username)}</strong>.
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
                        <div class="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Alumnos Matriculados</div>
                        <div class="text-2xl font-black text-slate-900 mt-1">${stats.totalStudents || 0}</div>
                    </div>
                    <div class="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                        <i data-lucide="graduation-cap" class="w-5 h-5"></i>
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
            const alerts = stats.attendanceAlerts || [];
            if (alerts.length === 0) {
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
// 10. CONTROL DIARIO DE ASISTENCIAS
// ============================================================================
async function loadDailyAttendance() {
    const tbody = document.getElementById('tbody-attendance');
    if (!tbody) return;

    try {
        const records = await window.sigetApi.attendance.getDaily(AppState.attendanceDate);
        AppState.attendanceRecordsCache = records;

        renderAttendanceRows(records);
    } catch (err) {
        console.error('Error al cargar asistencias:', err);
        showToast('Error al cargar la planilla de asistencias.', 'error');
    }
}

function normalizeStatusCode(status) {
    if (!status) return 'I';
    const s = String(status).trim().toUpperCase();
    if (s === 'PR' || s === 'PRESENTE') return 'PR';
    if (s === 'P' || s.includes('PERMISO') || s === 'AUSENTE CON JUSTIFICACIÓN') return 'P';
    if (s === 'LIC' || s.includes('LICENCIA MÉDICA') || s.includes('LICENCIA ORDINARIA') || s === 'LICENCIA') return 'LIC';
    if (s === 'LT' || s.includes('LARGO TRATAMIENTO')) return 'LT';
    if (s === 'I' || s.includes('AUSENTE') || s.includes('INASISTENCIA') || s.includes('FALTA')) return 'I';
    return s;
}

function getStatusSelectColor(status) {
    const code = normalizeStatusCode(status);
    switch (code) {
        case 'PR': return 'status-select-pr';
        case 'I': return 'status-select-i';
        case 'P': return 'status-select-p';
        case 'LIC': return 'status-select-lic';
        case 'LT': return 'status-select-lt';
        default: return 'status-select-default';
    }
}

function renderAttendanceRows(records) {
    const tbody = document.getElementById('tbody-attendance');
    if (!tbody) return;

    if (records.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-slate-400 italic">No hay docentes activos para registrar asistencia en esta fecha.</td></tr>`;
        return;
    }

    tbody.innerHTML = records.map((r, index) => {
        const code = normalizeStatusCode(r.status);
        const isAbsence = (code === 'I');
        const isJustified = (code === 'P' || code === 'LIC' || code === 'LT');

        return `
            <tr class="hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition border-b border-slate-100 dark:border-zinc-800 text-xs" data-teacher-id="${r.teacherId}">
                <td class="py-2.5 px-3">
                    <div class="font-bold text-slate-900 dark:text-zinc-100">${escapeHtml(r.fullName)}</div>
                    <div class="text-[11px] text-slate-400 dark:text-zinc-500 font-mono">DNI ${escapeHtml(r.dni)}</div>
                </td>
                <td class="py-2.5 px-3 text-center font-mono text-slate-600 dark:text-zinc-400 font-bold">${escapeHtml(r.legajo || 'S/L')}</td>
                <td class="py-2.5 px-3 text-center">
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300">
                        ${escapeHtml(r.revista || 'Titular')}
                    </span>
                </td>
                <td class="py-2.5 px-3 text-center">
                    <select class="att-status-select ${getStatusSelectColor(code)}"
                        data-index="${index}">
                        <option value="I" ${code === 'I' ? 'selected' : ''}>I - Inasistencia</option>
                        <option value="PR" ${code === 'PR' ? 'selected' : ''}>PR - Presente</option>
                        <option value="P" ${code === 'P' ? 'selected' : ''}>P - Permiso (115)</option>
                        <option value="LIC" ${code === 'LIC' ? 'selected' : ''}>LIC - Licencia</option>
                        <option value="LT" ${code === 'LT' ? 'selected' : ''}>LT - Largo Tratamiento</option>
                    </select>
                </td>
                <td class="py-2.5 px-3 text-center">
                    <input type="number" min="1" max="10" value="${r.hours || 4}" class="att-hours-input w-16 text-center px-1 py-1 border border-slate-200 dark:border-zinc-700 dark:bg-[#202020] dark:text-zinc-100 rounded text-xs font-bold">
                </td>
                <td class="py-2.5 px-3">
                    <input type="text" placeholder="N° Formulario, Certificado o Causa..." value="${escapeHtml(r.observations || '')}"
                        class="att-obs-input w-full px-2 py-1 border border-slate-200 dark:border-zinc-700 dark:bg-[#202020] dark:text-zinc-100 rounded text-xs">
                </td>
                <td class="py-2.5 px-3 text-center">
                    ${isAbsence ? `
                        <button type="button" class="btn-receive-physical-form px-2 py-1 bg-amber-500 hover:bg-amber-600 text-slate-900 rounded text-[11px] font-bold inline-flex items-center space-x-1 shadow-xs transition mx-auto"
                            data-teacher-id="${r.teacherId}" data-teacher-name="${escapeHtml(r.fullName)}">
                            <i data-lucide="file-check" class="w-3.5 h-3.5"></i>
                            <span>Formulario</span>
                        </button>
                    ` : isJustified ? `
                        <span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                            Justificado
                        </span>
                    ` : `
                        <span class="text-slate-400 font-bold">-</span>
                    `}
                </td>
            </tr>
        `;
    }).join('');

    document.querySelectorAll('.att-status-select').forEach(sel => {
        sel.addEventListener('change', (e) => {
            e.target.className = `att-status-select ${getStatusSelectColor(e.target.value)}`;
        });
    });

    document.querySelectorAll('.btn-receive-physical-form').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const target = e.currentTarget;
            const teacherId = parseInt(target.getAttribute('data-teacher-id'));
            const teacherName = target.getAttribute('data-teacher-name');
            openPhysicalFormModal(teacherId, teacherName, AppState.attendanceDate);
        });
    });

    initLucideIcons();
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
                        loadDailyAttendance();
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
    const query = document.getElementById('att-search').value.toLowerCase().trim();
    if (!query) {
        renderAttendanceRows(AppState.attendanceRecordsCache);
        return;
    }
    const filtered = AppState.attendanceRecordsCache.filter(r => {
        const full = `${r.fullName} ${r.legajo} ${r.dni}`.toLowerCase();
        return full.includes(query);
    });
    renderAttendanceRows(filtered);
}

async function saveAllAttendanceRecords() {
    const btnSave = document.getElementById('btn-att-save-all');
    if (btnSave) {
        btnSave.disabled = true;
        btnSave.innerHTML = `<span>Guardando...</span>`;
    }

    try {
        const rows = document.querySelectorAll('#tbody-attendance tr[data-teacher-id]');
        const records = [];

        rows.forEach(row => {
            const teacherId = parseInt(row.getAttribute('data-teacher-id'));
            const statusSelect = row.querySelector('.att-status-select');
            const hoursInput = row.querySelector('.att-hours-input');
            const obsInput = row.querySelector('.att-obs-input');

            records.push({
                teacherId: teacherId,
                status: statusSelect ? statusSelect.value : 'I',
                hours: hoursInput ? parseInt(hoursInput.value) || 0 : 4,
                observations: obsInput ? obsInput.value.trim() : ''
            });
        });

        const res = await window.sigetApi.attendance.saveBatch(AppState.attendanceDate, records);
        if (res.success) {
            showToast(`Se guardó el parte diario para la fecha ${AppState.attendanceDate}.`, 'success');
            loadDailyAttendance();
        } else {
            showToast(res.message || 'Error al guardar registros.', 'error');
        }
    } catch (err) {
        console.error('Error al guardar asistencias en lote:', err);
        showToast('Error de comunicación con la base de datos.', 'error');
    } finally {
        if (btnSave) {
            btnSave.disabled = false;
            btnSave.innerHTML = `<i data-lucide="save" class="w-3.5 h-3.5"></i><span>Guardar Todo</span>`;
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
// 12. MÓDULO: ALUMNOS E INSCRIPCIONES
// ============================================================================
async function loadStudents() {
    const tbody = document.getElementById('tbody-students');
    if (!tbody) return;

    const searchInput = document.getElementById('student-search');
    const careerFilter = document.getElementById('student-filter-career');

    const searchTerm = searchInput ? searchInput.value.trim() : '';
    const careerId = careerFilter ? parseInt(careerFilter.value) || 0 : 0;

    try {
        const students = await window.sigetApi.students.getAll({ searchTerm, careerId });

        if (students.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-slate-400 italic">No se encontraron alumnos con ese criterio.</td></tr>`;
            return;
        }

        tbody.innerHTML = students.map(s => {
            const statusBadge = s.isActive ? 
                `<span class="badge-status bg-emerald-50 text-emerald-700 border-emerald-200">Regular</span>` : 
                `<span class="badge-status bg-slate-100 text-slate-500 border-slate-300">Pasivo</span>`;

            return `
                <tr class="hover:bg-slate-50 transition border-b border-slate-100 text-xs">
                    <td class="py-2.5 px-3 text-center font-mono font-bold text-slate-600">${escapeHtml(s.legajo || 'S/L')}</td>
                    <td class="py-2.5 px-3">
                        <div class="font-bold text-slate-900">${escapeHtml(s.fullName || `${s.lastName}, ${s.firstName}`)}</div>
                        <div class="text-[11px] text-slate-400">${escapeHtml(s.email || '')}</div>
                    </td>
                    <td class="py-2.5 px-3 text-center font-mono font-medium text-slate-700">${escapeHtml(s.dni || '')}</td>
                    <td class="py-2.5 px-3">
                        <div class="font-semibold text-slate-800">${escapeHtml(s.careerName || 'Sin Carrera')}</div>
                        <div class="text-[11px] text-slate-400">${escapeHtml(s.careerCode || '')}</div>
                    </td>
                    <td class="py-2.5 px-3 text-center font-bold text-slate-600">${s.yearEnrolled || 2026}</td>
                    <td class="py-2.5 px-3 text-center">${statusBadge}</td>
                    <td class="py-2.5 px-3 text-center">
                        <div class="flex items-center justify-center space-x-1">
                            <button onclick="editStudent(${s.id})" title="Editar Alumno" class="p-1 rounded text-slate-500 hover:text-amber-600 hover:bg-slate-100 dark:hover:bg-zinc-800">
                                <i data-lucide="edit-3" class="w-4 h-4"></i>
                            </button>
                            <button onclick="toggleStudentActive(${s.id})" title="${s.isActive ? 'Dar de baja (Pasivo)' : 'Reactivar (Regular)'}" class="p-1 rounded text-slate-500 hover:text-${s.isActive ? 'amber' : 'emerald'}-600 hover:bg-slate-100 dark:hover:bg-zinc-800">
                                <i data-lucide="${s.isActive ? 'user-x' : 'user-check'}" class="w-4 h-4"></i>
                            </button>
                            <button onclick="deleteStudent(${s.id})" title="Eliminar registro de alumno" class="p-1 rounded text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-zinc-800">
                                <i data-lucide="trash-2" class="w-4 h-4"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        initLucideIcons();
    } catch (err) {
        console.error('Error al cargar alumnos:', err);
    }
}

window.toggleStudentActive = async function(id) {
    try {
        const res = await window.sigetApi.students.toggleActive(id);
        if (res.success) {
            showToast(`Estado del alumno actualizado.`, 'success');
            loadStudents();
        } else {
            showToast(res.message || 'No se pudo actualizar.', 'error');
        }
    } catch (err) {
        showToast('Error al modificar estado del alumno.', 'error');
    }
};

window.editStudent = async function(id) {
    try {
        const student = await window.sigetApi.students.getById(id);
        if (student) {
            openStudentModal(student);
        } else {
            showToast('No se encontró el alumno seleccionado.', 'error');
        }
    } catch (err) {
        showToast('Error al recuperar datos del alumno: ' + err.message, 'error');
    }
};

window.deleteStudent = async function(id) {
    if (!confirm('¿Está seguro de que desea eliminar permanentemente este registro de alumno? Esta acción no se puede deshacer.')) {
        return;
    }
    try {
        const res = await window.sigetApi.students.delete(id);
        if (res && res.success) {
            showToast(res.message, 'success');
            loadStudents();
        } else {
            showToast((res && res.message) ? res.message : 'No se pudo eliminar el alumno.', 'error');
        }
    } catch (err) {
        showToast('Error al eliminar alumno: ' + err.message, 'error');
    }
};

function openStudentModal(studentToEdit = null) {
    const isEdit = !!studentToEdit;
    const title = isEdit ? 'Modificar Alumno Institucional' : 'Nuevo Alumno Institucional';
    const submitBtnText = isEdit ? 'Actualizar Alumno' : 'Matricular Alumno';

    const modalHtml = `
        <div class="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
            <h3 class="text-sm font-bold text-slate-900">${title}</h3>
            <button onclick="closeModal()" class="text-slate-400 hover:text-slate-700">✕</button>
        </div>

        <form id="student-form" class="space-y-3">
            <input type="hidden" id="modal-student-id" value="${isEdit ? studentToEdit.id : ''}">

            <div class="grid grid-cols-2 gap-3">
                <div>
                    <label class="block text-[11px] font-bold text-slate-700 uppercase mb-1">DNI (como texto) *</label>
                    <input type="text" id="modal-student-dni" required value="${isEdit ? escapeHtml(studentToEdit.dni) : ''}"
                        placeholder="Ej. 42123456" class="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg">
                </div>
                <div>
                    <label class="block text-[11px] font-bold text-slate-700 uppercase mb-1">N° de Legajo</label>
                    <input type="text" id="modal-student-legajo" value="${isEdit ? escapeHtml(studentToEdit.legajo || '') : ''}"
                        placeholder="Ej. A-2026-042" class="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg">
                </div>
            </div>

            <div class="grid grid-cols-2 gap-3">
                <div>
                    <label class="block text-[11px] font-bold text-slate-700 uppercase mb-1">Apellido(s) *</label>
                    <input type="text" id="modal-student-lastname" required value="${isEdit ? escapeHtml(studentToEdit.lastName || '') : ''}"
                        placeholder="Ej. GÓMEZ" class="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg">
                </div>
                <div>
                    <label class="block text-[11px] font-bold text-slate-700 uppercase mb-1">Nombre(s) *</label>
                    <input type="text" id="modal-student-firstname" required value="${isEdit ? escapeHtml(studentToEdit.firstName || '') : ''}"
                        placeholder="Ej. María Elena" class="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg">
                </div>
            </div>

            <div>
                <label class="block text-[11px] font-bold text-slate-700 uppercase mb-1">Carrera de Matriculación *</label>
                <select id="modal-student-career" required class="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg">
                    <option value="">Seleccione una carrera...</option>
                    ${AppState.careers.map(c => `<option value="${c.id}" ${isEdit && Number(studentToEdit.careerId) === Number(c.id) ? 'selected' : ''}>${escapeHtml(c.name)} (${c.code})</option>`).join('')}
                </select>
            </div>

            <div class="grid grid-cols-2 gap-3">
                <div>
                    <label class="block text-[11px] font-bold text-slate-700 uppercase mb-1">Año de Ingreso / Cohorte</label>
                    <input type="number" id="modal-student-year-enrolled" value="${isEdit ? (studentToEdit.yearEnrolled || 2026) : 2026}" class="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg">
                </div>
                <div>
                    <label class="block text-[11px] font-bold text-slate-700 uppercase mb-1">CUIL</label>
                    <input type="text" id="modal-student-cuil" value="${isEdit ? escapeHtml(studentToEdit.cuil || '') : ''}"
                        placeholder="27-xxxxxxxx-x" class="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg">
                </div>
            </div>

            <div class="grid grid-cols-2 gap-3">
                <div>
                    <label class="block text-[11px] font-bold text-slate-700 uppercase mb-1">Correo Electrónico</label>
                    <input type="email" id="modal-student-email" value="${isEdit ? escapeHtml(studentToEdit.email || '') : ''}"
                        placeholder="alumno@gmail.com" class="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg">
                </div>
                <div>
                    <label class="block text-[11px] font-bold text-slate-700 uppercase mb-1">Teléfono</label>
                    <input type="text" id="modal-student-phone" value="${isEdit ? escapeHtml(studentToEdit.phone || '') : ''}"
                        placeholder="+54 383 4..." class="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg">
                </div>
            </div>

            <div id="modal-student-error" class="hidden p-2 rounded bg-red-50 text-red-700 text-xs"></div>

            <div class="pt-3 border-t border-slate-100 flex justify-end space-x-2">
                <button type="button" onclick="closeModal()" class="px-4 py-2 border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-50">Cancelar</button>
                <button type="submit" class="btn-gold px-4 py-2 text-xs font-bold shadow-sm">${submitBtnText}</button>
            </div>
        </form>
    `;

    openModal(modalHtml, () => {
        const form = document.getElementById('student-form');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const errDiv = document.getElementById('modal-student-error');
            errDiv.classList.add('hidden');

            const payload = {
                dni: document.getElementById('modal-student-dni').value.trim(),
                lastName: document.getElementById('modal-student-lastname').value.trim(),
                firstName: document.getElementById('modal-student-firstname').value.trim(),
                legajo: document.getElementById('modal-student-legajo').value.trim(),
                careerId: parseInt(document.getElementById('modal-student-career').value),
                yearEnrolled: parseInt(document.getElementById('modal-student-year-enrolled').value),
                cuil: document.getElementById('modal-student-cuil').value.trim(),
                email: document.getElementById('modal-student-email').value.trim(),
                phone: document.getElementById('modal-student-phone').value.trim()
            };

            const hiddenId = document.getElementById('modal-student-id').value;
            if (hiddenId) {
                payload.id = parseInt(hiddenId);
            }

            try {
                const res = await window.sigetApi.students.save(payload);
                if (res.success) {
                    showToast(isEdit ? 'Alumno actualizado con éxito.' : 'Alumno registrado con éxito.', 'success');
                    closeModal();
                    loadStudents();
                } else {
                    errDiv.textContent = res.message || 'Error al guardar alumno.';
                    errDiv.classList.remove('hidden');
                }
            } catch (err) {
                errDiv.textContent = 'Error de comunicación al guardar.';
                errDiv.classList.remove('hidden');
            }
        });
    });
}
window.openStudentModal = openStudentModal;

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
