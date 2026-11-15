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

document.addEventListener('DOMContentLoaded', async () => {
    initTheme();
    initLucideIcons();
    updateDateDisplay();
    setupEventListeners();
    loadInteractiveCalendar();

    try {
        const firstRunRes = await window.sigetApi.auth.checkFirstRun();
        if (firstRunRes && firstRunRes.isFirstRun) {
            showFirstRunOverlay();
            return;
        }

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

function setupEventListeners() {
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

    const btnForgot = document.getElementById('btn-forgot-password');
    if (btnForgot) {
        btnForgot.addEventListener('click', openRecoveryOverlay);
    }

    const btnOpenRegister = document.getElementById('btn-open-register');
    if (btnOpenRegister) {
        btnOpenRegister.addEventListener('click', openRegisterOverlay);
    }

    setupFirstRunListeners();

    setupRegisterListeners();

    setupRecoveryListeners();

    const themeSwitch = document.getElementById('theme-switch');
    if (themeSwitch) {
        themeSwitch.checked = (localStorage.getItem('siget-theme') === 'dark');
        themeSwitch.addEventListener('change', () => {
            applyTheme(themeSwitch.checked ? 'dark' : 'light');
        });
    }

    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            await window.sigetApi.auth.logout();
            AppState.currentUser = null;
            showLoginModal();
            showToast('Sesión cerrada correctamente.', 'info');
        });
    }

    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.addEventListener('click', () => {
            const view = btn.getAttribute('data-view');
            navigateTo(view);
        });
    });

    const tabLegajos = document.getElementById('tab-btn-legajos');
    const tabAsistencias = document.getElementById('tab-btn-asistencias');
    const tabCalendario = document.getElementById('tab-btn-calendario');
    if (tabLegajos) tabLegajos.addEventListener('click', () => switchTeacherSubtab('legajos'));
    if (tabAsistencias) tabAsistencias.addEventListener('click', () => switchTeacherSubtab('asistencias'));
    if (tabCalendario) tabCalendario.addEventListener('click', () => switchTeacherSubtab('calendario'));

    const tabDesig = document.getElementById('tab-btn-desig');
    const tabSubst = document.getElementById('tab-btn-subst');
    if (tabDesig && tabSubst) {
        tabDesig.addEventListener('click', () => switchDesigSubtab('desig'));
        tabSubst.addEventListener('click', () => switchDesigSubtab('subst'));
    }

    const teacherSearch = document.getElementById('teacher-search');
    const teacherFilterRevista = document.getElementById('teacher-filter-revista');
    if (teacherSearch) teacherSearch.addEventListener('input', debounce(loadTeachers, 250));
    if (teacherFilterRevista) teacherFilterRevista.addEventListener('change', loadTeachers);

    const btnNewTeacher = document.getElementById('btn-new-teacher');
    if (btnNewTeacher) btnNewTeacher.addEventListener('click', () => openTeacherModal());

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
    const btnAttExportPrintable = document.getElementById('btn-att-export-printable');
    if (btnAttExportPrintable) btnAttExportPrintable.addEventListener('click', openPrintableDailyExportModal);

    if (btnAttMarkAllPr) {
        btnAttMarkAllPr.addEventListener('click', () => {
            markAllVisibleAsPresent();
        });
    }

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

    const auditSearchInput = document.getElementById('audit-search-input');
    const auditCategoryFilter = document.getElementById('audit-category-filter');
    const btnExportAuditPdf = document.getElementById('btn-export-audit-pdf');

    if (auditSearchInput) {
        auditSearchInput.addEventListener('input', debounce(() => loadDashboardAuditLogs(), 250));
    }
    if (auditCategoryFilter) {
        auditCategoryFilter.addEventListener('change', () => loadDashboardAuditLogs());
    }
    if (btnExportAuditPdf) {
        btnExportAuditPdf.addEventListener('click', async () => {
            try {
                showToast('Generando Registro Oficial de Acciones (PDF)...', 'info');
                const search = auditSearchInput ? auditSearchInput.value.trim() : '';
                const category = auditCategoryFilter ? auditCategoryFilter.value : 'ALL';
                const res = await window.sigetApi.audit.exportPdf({
                    exportedBy: AppState.currentUser?.username || 'Bedelía / Secretaría',
                    search,
                    category
                });
                if (res && res.success) {
                    showToast(`PDF generado exitosamente: ${res.fileName}`, 'success');
                    if (window.sigetApi.reports && window.sigetApi.reports.openFile) {
                        await window.sigetApi.reports.openFile(res.filePath);
                    }
                } else {
                    showToast((res && res.message) || 'Error al exportar PDF de auditoría.', 'error');
                }
            } catch (err) {
                console.error('Error exportando PDF de auditoría:', err);
                showToast('Error al exportar PDF: ' + err.message, 'error');
            }
        });
    }

    const btnCalPrev = document.getElementById('btn-cal-prev-month');
    const btnCalNext = document.getElementById('btn-cal-next-month');
    const calSelectMonth = document.getElementById('cal-select-month');
    const calSelectYear = document.getElementById('cal-select-year');

    if (btnCalPrev) {
        btnCalPrev.addEventListener('click', () => {
            CalendarState.month--;
            if (CalendarState.month < 1) {
                CalendarState.month = 12;
                CalendarState.year--;
            }
            loadInteractiveCalendar();
        });
    }

    if (btnCalNext) {
        btnCalNext.addEventListener('click', () => {
            CalendarState.month++;
            if (CalendarState.month > 12) {
                CalendarState.month = 1;
                CalendarState.year++;
            }
            loadInteractiveCalendar();
        });
    }

    if (calSelectMonth) {
        calSelectMonth.addEventListener('change', (e) => {
            const val = parseInt(e.target.value, 10);
            if (!isNaN(val) && val >= 1 && val <= 12) {
                CalendarState.month = val;
                loadInteractiveCalendar();
            }
        });
    }

    if (calSelectYear) {
        calSelectYear.addEventListener('change', (e) => {
            const val = parseInt(e.target.value, 10);
            if (!isNaN(val) && val >= 2020 && val <= 2035) {
                CalendarState.year = val;
                loadInteractiveCalendar();
            }
        });
    }

    const calViewGridBtn = document.getElementById('cal-view-grid-btn');
    const calViewTeacherBtn = document.getElementById('cal-view-teacher-btn');

    if (calViewGridBtn) calViewGridBtn.addEventListener('click', () => switchCalendarView('grid'));
    if (calViewTeacherBtn) calViewTeacherBtn.addEventListener('click', () => switchCalendarView('teacher'));

    const btnCalAddInst = document.getElementById('btn-cal-add-institutional');
    if (btnCalAddInst) {
        btnCalAddInst.addEventListener('click', () => openInstitutionalDayModal());
    }

    const btnCalExportExcel = document.getElementById('btn-cal-export-excel');
    if (btnCalExportExcel) {
        btnCalExportExcel.addEventListener('click', async () => {
            try {
                let outputPath = null;
                if (window.sigetApi && window.sigetApi.dialog && window.sigetApi.dialog.showSaveDialog) {
                    const defaultName = `Planilla_Mensual_Docentes_${CalendarState.year}_${String(CalendarState.month).padStart(2, '0')}.xlsx`;
                    const saveRes = await window.sigetApi.dialog.showSaveDialog({
                        title: 'Guardar Planilla Mensual Oficial (Excel)',
                        defaultPath: defaultName,
                        filters: [{ name: 'Libro de Excel (*.xlsx)', extensions: ['xlsx'] }]
                    });
                    if (saveRes.canceled || !saveRes.filePath) return;
                    outputPath = saveRes.filePath;
                }

                showToast('Generando planilla oficial Excel del mes...', 'info');
                const res = await window.sigetApi.calendar.exportMonthExcel({
                    year: CalendarState.year,
                    month: CalendarState.month,
                    outputPath
                });
                if (res && res.success) {
                    showToast(`Planilla Excel guardada: ${res.fileName}`, 'success');
                    if (window.sigetApi.reports && window.sigetApi.reports.openFile) {
                        await window.sigetApi.reports.openFile(res.filePath);
                    }
                } else {
                    showToast((res && res.message) || 'Error al exportar Excel.', 'error');
                }
            } catch (err) {
                console.error('Error exportando Excel del mes:', err);
                showToast('Error al exportar Excel: ' + err.message, 'error');
            }
        });
    }

    const btnCalExportPdf = document.getElementById('btn-cal-export-pdf');
    if (btnCalExportPdf) {
        btnCalExportPdf.addEventListener('click', async () => {
            try {
                let outputPath = null;
                if (window.sigetApi && window.sigetApi.dialog && window.sigetApi.dialog.showSaveDialog) {
                    const defaultName = `Calendario_Academico_${CalendarState.year}_${String(CalendarState.month).padStart(2, '0')}.pdf`;
                    const saveRes = await window.sigetApi.dialog.showSaveDialog({
                        title: 'Guardar Calendario Institucional (PDF)',
                        defaultPath: defaultName,
                        filters: [{ name: 'Documento PDF (*.pdf)', extensions: ['pdf'] }]
                    });
                    if (saveRes.canceled || !saveRes.filePath) return;
                    outputPath = saveRes.filePath;
                }

                showToast('Generando reporte PDF del mes...', 'info');
                const res = await window.sigetApi.calendar.exportMonthPdf({
                    year: CalendarState.year,
                    month: CalendarState.month,
                    outputPath,
                    exportedBy: AppState.currentUser?.username || 'Secretaría / Bedelía'
                });
                if (res && res.success) {
                    showToast(`Reporte PDF guardado: ${res.fileName}`, 'success');
                    if (window.sigetApi.reports && window.sigetApi.reports.openFile) {
                        await window.sigetApi.reports.openFile(res.filePath);
                    }
                } else {
                    showToast((res && res.message) || 'Error al exportar PDF.', 'error');
                }
            } catch (err) {
                console.error('Error exportando PDF del mes:', err);
                showToast('Error al exportar PDF: ' + err.message, 'error');
            }
        });
    }

    const btnCloseCalDayModal = document.getElementById('btn-close-cal-day-modal');
    const btnCalModalClose = document.getElementById('btn-cal-modal-close');
    const btnCalModalGotoAtt = document.getElementById('btn-cal-modal-goto-attendance');
    const calDayModalEl = document.getElementById('cal-day-modal');

    if (btnCloseCalDayModal) btnCloseCalDayModal.addEventListener('click', closeDayDetailModal);
    if (btnCalModalClose) btnCalModalClose.addEventListener('click', closeDayDetailModal);
    if (calDayModalEl) {
        calDayModalEl.addEventListener('click', (e) => {
            if (e.target === calDayModalEl) closeDayDetailModal();
        });
    }

    if (btnCalModalGotoAtt) {
        btnCalModalGotoAtt.addEventListener('click', () => {
            if (CalendarState.selectedDayData) {
                AppState.attendanceDate = CalendarState.selectedDayData.date;
                const attDateInput = document.getElementById('att-date-input');
                if (attDateInput) attDateInput.value = AppState.attendanceDate;
                closeDayDetailModal();
                switchTeacherSubtab('asistencias');
            }
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeDayDetailModal();
        }
    });

    const calTeacherSelect = document.getElementById('calendar-teacher-select');
    const calStartDate = document.getElementById('calendar-start-date');
    const calEndDate = document.getElementById('calendar-end-date');
    if (calTeacherSelect) calTeacherSelect.addEventListener('change', loadTeacherCalendar);
    if (calStartDate) calStartDate.addEventListener('change', loadTeacherCalendar);
    if (calEndDate) calEndDate.addEventListener('change', loadTeacherCalendar);

    const btnExportTeacherPdf = document.getElementById('btn-export-teacher-pdf');
    if (btnExportTeacherPdf) btnExportTeacherPdf.addEventListener('click', handleExportTeacherPdf);

    const btnExportTeacherExcel = document.getElementById('btn-export-teacher-excel');
    if (btnExportTeacherExcel) btnExportTeacherExcel.addEventListener('click', handleExportTeacherExcel);

    initCsvImportEvents();

    const btnNewUser = document.getElementById('btn-new-user');
    if (btnNewUser) btnNewUser.addEventListener('click', () => openNewUserModal());

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeModal();
    });
}

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
                    document.getElementById('first-run-step-form').classList.add('hidden');
                    document.getElementById('first-run-step-key').classList.remove('hidden');
                    document.getElementById('first-run-key-display').textContent = res.masterRecoveryKey;

                    const copyBtn = document.getElementById('btn-copy-first-run-key');
                    const copyText = document.getElementById('copy-first-run-text');
                    copyBtn.onclick = () => {
                        navigator.clipboard.writeText(res.masterRecoveryKey);
                        copyText.textContent = '¡Copiada!';
                        setTimeout(() => { copyText.textContent = 'Copiar'; }, 2500);
                        showToast('Clave Maestra copiada al portapapeles.', 'success');
                    };

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

    const navUsers = document.getElementById('nav-btn-users');
    const navCsv = document.getElementById('nav-btn-csv');

    if (userRoleStr === 'secretaria') {
        if (navUsers) navUsers.classList.remove('hidden');
        if (navCsv) navCsv.classList.remove('hidden');
    } else {
        if (navUsers) navUsers.classList.add('hidden');
        if (navCsv) navCsv.classList.add('hidden');
    }

    applyTheme(localStorage.getItem('siget-theme') || 'light');

    loadInitialCatalogs();

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

function navigateTo(viewName) {
    AppState.currentView = viewName;

    document.querySelectorAll('.nav-item').forEach(btn => {
        const v = btn.getAttribute('data-view');
        if (v === viewName) {
            btn.className = 'nav-item w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-xs font-bold transition bg-slate-900 text-gold shadow-sm border border-gold/30';
        } else {
            btn.className = 'nav-item w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-xs font-bold transition text-slate-600 hover:bg-slate-100';
        }
    });

    if (viewName === 'calendar' || viewName === 'reports') {
        navigateTo('teachers');
        switchTeacherSubtab('calendario');
        return;
    }

    document.querySelectorAll('.view-panel').forEach(panel => {
        panel.classList.add('hidden');
    });

    const targetPanel = document.getElementById(`view-${viewName}`);
    if (targetPanel) {
        targetPanel.classList.remove('hidden');
    }

    const titles = {
        dashboard: 'Panel de Control y Métricas',
        teachers: 'Módulo de Docentes y Asistencias',
        designations: 'Gestión de Cátedras, Designaciones y Suplencias',
        'csv-import': 'Módulo de Carga Masiva por Archivos CSV',
        users: 'Gestión de Usuarios y Accesos Institucionales'
    };
    const titleElem = document.getElementById('topbar-title');
    if (titleElem) titleElem.textContent = titles[viewName] || 'SIGET';

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

window.editUserModal = async function (id) {
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

window.promptResetPassword = function (userId, username) {
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

window.toggleUserActive = async function (id) {
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

async function loadDashboard() {
    try {
        const stats = await window.sigetApi.dashboard.getStats();
        if (!stats) return;

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

        const alertsContainer = document.getElementById('dashboard-attendance-alerts');
        if (alertsContainer) {
            renderDashboardAlertsHtml(alertsContainer, stats.attendanceAlerts || []);
        }

        await loadDashboardAuditLogs();

        initLucideIcons();
    } catch (err) {
        console.error('Error al cargar dashboard:', err);
    }
}

async function loadDashboardAuditLogs(params = {}) {
    const tbody = document.getElementById('tbody-audit-logs');
    if (!tbody) return;

    const searchInput = document.getElementById('audit-search-input');
    const categorySelect = document.getElementById('audit-category-filter');

    const search = params.search !== undefined ? params.search : (searchInput ? searchInput.value.trim() : '');
    const category = params.category !== undefined ? params.category : (categorySelect ? categorySelect.value : 'ALL');

    try {
        if (!window.sigetApi.audit || !window.sigetApi.audit.getAll) return;
        const logs = await window.sigetApi.audit.getAll({ search, category, limit: 100 });

        if (!logs || logs.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" class="py-8 text-center text-slate-400 dark:text-zinc-500 italic">No se registraron acciones que coincidan con los filtros aplicados.</td></tr>`;
            return;
        }

        tbody.innerHTML = logs.map(l => {
            let catBadge = 'bg-slate-100 text-slate-700 dark:bg-zinc-800 dark:text-zinc-300 border border-slate-200 dark:border-zinc-700';
            const cat = l.category || '';
            if (cat === 'ASISTENCIA') catBadge = 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-300 dark:border-amber-800';
            else if (cat === 'DOCENTES') catBadge = 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 border border-blue-300 dark:border-blue-800';
            else if (cat === 'DESIGNACIONES') catBadge = 'bg-purple-50 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300 border border-purple-300 dark:border-purple-800';
            else if (cat === 'CARGA_MASIVA') catBadge = 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800';
            else if (cat === 'SEGURIDAD') catBadge = 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 border border-rose-300 dark:border-rose-800';
            else if (cat === 'SISTEMA') catBadge = 'bg-cyan-50 text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-300 border border-cyan-300 dark:border-cyan-800';

            return `
                <tr class="hover:bg-slate-50 dark:hover:bg-zinc-800/40 transition">
                    <td class="py-2.5 px-3 text-center font-mono text-[11px] text-slate-500 dark:text-zinc-400 whitespace-nowrap">${escapeHtml(l.timestampStr || l.timestamp)}</td>
                    <td class="py-2.5 px-3 text-center">
                        <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-zinc-800 text-slate-800 dark:text-gold border border-slate-200 dark:border-zinc-700">
                            ${escapeHtml(l.username || 'SISTEMA')}
                        </span>
                    </td>
                    <td class="py-2.5 px-3 text-center">
                        <span class="px-2 py-0.5 rounded text-[10px] font-extrabold ${catBadge}">
                            ${escapeHtml(l.category || l.action)}
                        </span>
                    </td>
                    <td class="py-2.5 px-3 text-slate-700 dark:text-zinc-300 font-medium">
                        ${escapeHtml(l.details || l.action)}
                    </td>
                </tr>
            `;
        }).join('');
    } catch (err) {
        console.error('Error cargando registros de auditoría:', err);
    }
}

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

window.editTeacher = async function (id) {
    try {
        const teacher = await window.sigetApi.teachers.getById(id);
        if (teacher) {
            openTeacherModal(teacher);
        }
    } catch (err) {
        showToast('Error al recuperar datos del docente.', 'error');
    }
};

window.toggleTeacherActive = async function (id) {
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

window.deleteTeacher = async function (id) {
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

            const teacherIdVal = document.getElementById('modal-teacher-id').value;
            const payload = {
                id: teacherIdVal ? parseInt(teacherIdVal, 10) : null,
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
    } catch { }
    return `Parte Diario: ${dateStr}`;
}

function classifyAttendanceRecord(status, observations = '') {
    const s = String(status || '').trim().toUpperCase();
    const o = String(observations || '').trim().toLowerCase();
    const combined = `${s} ${o}`.toLowerCase();

    if (s === 'PR' || s === 'PRESENTE') {
        return { code: 'PR', isPresence: true, isUnexcusedAbsence: false, isJustifiedAbsence: false, isPermit: false, isLicense: false, isLongTreatment: false };
    }

    if (s === 'LT' || combined.includes('largo tratamiento') || combined.includes('art. 48') || combined.includes('art 48') || combined.includes('114b') || combined.includes('114 b')) {
        return { code: 'LT', isPresence: false, isUnexcusedAbsence: false, isJustifiedAbsence: true, isPermit: false, isLicense: true, isLongTreatment: true };
    }

    if (s === 'LIC' || s === 'LICENCIA' ||
        combined.includes('licencia') || combined.includes('médic') || combined.includes('medic') ||
        combined.includes('salud') || combined.includes('reposo') || combined.includes('114a') ||
        combined.includes('114 a') || combined.includes('114c') || combined.includes('114 c') ||
        combined.includes('art. 70') || combined.includes('art 70') || combined.includes('examen') ||
        combined.includes('estudio') || combined.includes('maternidad') || combined.includes('accidente')) {
        return { code: 'LIC', isPresence: false, isUnexcusedAbsence: false, isJustifiedAbsence: true, isPermit: false, isLicense: true, isLongTreatment: false };
    }

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

function handleAttendanceStatusChange(row, newCode, shouldPersist = true) {
    if (!row) return;
    const teacherId = parseInt(row.getAttribute('data-teacher-id'));
    const rec = (AppState.attendanceRecordsCache || []).find(r => r.teacherId === teacherId);
    if (!rec) return;

    if (newCode === 'PR' || newCode === 'I') {
        rec.observations = '';
        rec.hasPhysicalForm = false;
    }

    const select = row.querySelector('.att-status-select');
    if (select) {
        select.value = newCode;
        select.className = `att-status-select w-full px-2.5 py-1.5 text-xs font-bold rounded-lg border focus:outline-none focus:ring-2 focus:ring-gold transition cursor-pointer ${getStatusBadgeClasses(newCode)}`;
    }
    const hiddenStatus = row.querySelector('.att-status-value');
    if (hiddenStatus) hiddenStatus.value = newCode;
    row.setAttribute('data-status', newCode);

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
    rec.status = newCode;
    rec.liveStats = {
        year: baseStats.year || new Date().getFullYear(),
        inasistencias: liveFaltas,
        justificadas: baseStats.justificadas || 0,
        permisos: livePermisos,
        permisosDisponibles: Math.max(0, 6 - livePermisos),
        licencias: liveLicencias,
        largoTratamiento: liveLt
    };

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

    updateAttendanceKpis();
    updateLiveDashboardAlerts();
    initLucideIcons();

    if (shouldPersist && window.sigetApi && window.sigetApi.attendance) {
        const hoursInput = row.querySelector('.att-hours-input');
        const hs = hoursInput ? (parseInt(hoursInput.value) || 4) : (rec.hours || 4);
        const obsToSave = (newCode === 'PR' || newCode === 'I') ? '' : (rec.observations || '');
        const saveFn = window.sigetApi.attendance.saveDailyRecord || window.sigetApi.attendance.save;

        if (saveFn) {
            saveFn({
                teacherId,
                dateStr: AppState.attendanceDate,
                status: newCode,
                hours: hs,
                observations: obsToSave
            }).then(res => {
                if (res && res.success) {
                    rec.isSavedInDb = true;
                    rec.savedStatus = newCode;
                    rec.currentStatus = newCode;
                    rec.status = newCode;
                    rec.hours = hs;
                    rec.observations = obsToSave;
                    if (newCode === 'PR' || newCode === 'I') {
                        rec.hasPhysicalForm = false;
                    }
                    rec.isSavedUnexcused = (newCode === 'I');
                    rec.isSavedJustified = (newCode === 'P' || newCode === 'LIC' || newCode === 'LT');
                    rec.isSavedPermit = (newCode === 'P');
                    rec.isSavedLicense = (newCode === 'LIC');
                    rec.isSavedLongTreatment = (newCode === 'LT');
                } else {
                    console.error('[Attendance] Error al guardar asistencia:', res);
                    showToast((res && res.message) || 'Error al persistir estado de asistencia.', 'error');
                }
            }).catch(err => {
                console.error('[Attendance] Error en comunicación al guardar asistencia:', err);
                showToast('Error de comunicación con la base de datos.', 'error');
            });
        }
    }
}

function renderAttendanceRows(records) {
    const tbody = document.getElementById('tbody-attendance');
    if (!tbody) return;

    if (!records || records.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-12 text-xs text-slate-400 dark:text-zinc-500 italic">No se encontraron docentes registrados con ese criterio o fecha.</td></tr>`;
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
                <td class="py-2.5 px-3 text-center att-row-action">
                    ${justBtn}
                </td>
            </tr>
        `;
    }).join('');

    tbody.querySelectorAll('.att-status-select').forEach(sel => {
        sel.addEventListener('change', async (e) => {
            const selectElem = e.currentTarget;
            const newCode = selectElem.value;
            const row = selectElem.closest('tr');
            if (row) {
                await handleAttendanceStatusChange(row, newCode, true);
            }
        });
    });

    tbody.querySelectorAll('.att-hours-input').forEach(input => {
        input.addEventListener('change', async (e) => {
            const row = e.currentTarget.closest('tr');
            if (!row) return;
            const teacherId = parseInt(row.getAttribute('data-teacher-id'));
            const rec = (AppState.attendanceRecordsCache || []).find(r => r.teacherId === teacherId);
            if (!rec) return;
            const hs = parseInt(e.currentTarget.value) || 4;
            rec.hours = hs;
            const currentStatus = rec.currentStatus || rec.status || 'I';
            const obsToSave = (currentStatus === 'PR' || currentStatus === 'I') ? '' : (rec.observations || '');
            const saveFn = window.sigetApi?.attendance?.saveDailyRecord || window.sigetApi?.attendance?.save;
            if (saveFn) {
                await saveFn({
                    teacherId,
                    dateStr: AppState.attendanceDate,
                    status: currentStatus,
                    hours: hs,
                    observations: obsToSave
                });
            }
        });
    });

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

            <!-- Zona de Carga Multiformato para Justificaciones / Certificados -->
            <div class="p-3 bg-slate-50 dark:bg-zinc-800/80 rounded-xl border border-dashed border-slate-300 dark:border-zinc-700 hover:border-gold transition cursor-pointer text-center" id="pf-dropzone">
                <input type="file" id="pf-file-input" accept=".pdf,.doc,.docx,.txt,.csv" class="hidden" />
                <div class="flex items-center justify-center space-x-2 text-slate-700 dark:text-zinc-200">
                    <i data-lucide="file-up" class="w-4 h-4 text-gold"></i>
                    <span class="text-xs font-bold">Adjuntar Certificado / Formulario Digital</span>
                    <span class="text-[10px] text-slate-400 font-mono">(.pdf, .docx, .doc, .txt, .csv)</span>
                </div>
                <div id="pf-file-feedback" class="text-[11px] text-slate-500 dark:text-zinc-400 mt-1">
                    Arrastra o haz clic para autocompletar certificado, diagnóstico y observaciones
                </div>
            </div>

            <div>
                <label class="block text-xs font-bold text-slate-700 dark:text-zinc-300 uppercase mb-1">Nuevo Estado Reglamentario</label>
                <select id="pf-new-status" required class="w-full px-3 py-2 text-xs border border-slate-200 dark:border-zinc-700 dark:bg-[#202020] dark:text-zinc-100 rounded-lg font-bold focus:outline-none focus:ring-2 focus:ring-gold">
                    <option value="LIC">LIC - Licencia (Salud o Novedad)</option>
                    <option value="P">P - Permiso Particular (Art. 115 - Máx 6/año)</option>
                    <option value="LT">LT - Largo Tratamiento de Salud (Art. 48 / 114b)</option>
                </select>
            </div>

            <div>
                <label class="block text-xs font-bold text-slate-700 dark:text-zinc-300 uppercase mb-1">Artículo y Clasificación Normativa</label>
                <select id="pf-article-code" required class="w-full px-3 py-2 text-xs border border-slate-200 dark:border-zinc-700 dark:bg-[#202020] dark:text-zinc-100 rounded-lg font-medium focus:outline-none focus:ring-2 focus:ring-gold">
                    <optgroup label="Licencias Médicas y Salud">
                        ${il01Options || '<option value="114-A-1">Art. 114 a.1 - Corto Tratamiento (114-A-1)</option>'}
                    </optgroup>
                    <optgroup label="Inasistencias, Permisos y Especiales">
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

        const dropzone = document.getElementById('pf-dropzone');
        const fileInput = document.getElementById('pf-file-input');
        const fileFeedback = document.getElementById('pf-file-feedback');

        const processJustificationFile = (file) => {
            if (!file) return;
            fileFeedback.innerHTML = `<span class="text-gold animate-pulse">Analizando documento ${escapeHtml(file.name)}...</span>`;
            const reader = new FileReader();
            reader.onload = async (ev) => {
                const base64Data = ev.target.result.split(',')[1];
                try {
                    const parsed = await window.sigetApi.attendance.parseJustificationFile({
                        fileBufferBase64: base64Data,
                        fileName: file.name
                    });
                    if (parsed && parsed.success) {
                        if (parsed.formNumber) {
                            document.getElementById('pf-form-number').value = parsed.formNumber;
                        }
                        if (parsed.observations) {
                            document.getElementById('pf-observations').value = parsed.observations;
                        }
                        if (parsed.articleCode) {
                            const artSelect = document.getElementById('pf-article-code');
                            if (artSelect) {
                                for (let i = 0; i < artSelect.options.length; i++) {
                                    if (artSelect.options[i].value === parsed.articleCode || artSelect.options[i].value.includes(parsed.articleCode)) {
                                        artSelect.selectedIndex = i;
                                        break;
                                    }
                                }
                            }
                        }
                        if (parsed.status) {
                            const stSelect = document.getElementById('pf-new-status');
                            if (stSelect) {
                                for (let i = 0; i < stSelect.options.length; i++) {
                                    if (stSelect.options[i].value === parsed.status) {
                                        stSelect.selectedIndex = i;
                                        break;
                                    }
                                }
                            }
                        }
                        fileFeedback.innerHTML = `<span class="text-emerald-500 font-bold">✓ Archivo ${escapeHtml(file.name)} procesado con éxito. Campos completados.</span>`;
                        showToast(`Archivo ${file.name} procesado: datos precargados en el formulario.`, 'success');
                    } else {
                        fileFeedback.innerHTML = `<span class="text-amber-500 font-bold">Archivo leído. Complete manualmente los campos no reconocidos.</span>`;
                    }
                } catch (parseErr) {
                    console.error('Error parseando archivo de justificación:', parseErr);
                    fileFeedback.innerHTML = `<span class="text-rose-500 font-bold">Error analizando el archivo: ${escapeHtml(parseErr.message)}</span>`;
                }
            };
            reader.readAsDataURL(file);
        };

        if (dropzone && fileInput) {
            dropzone.addEventListener('click', (e) => {
                if (e.target !== fileInput) fileInput.click();
            });
            fileInput.addEventListener('change', (e) => {
                if (e.target.files && e.target.files[0]) {
                    processJustificationFile(e.target.files[0]);
                }
            });
            dropzone.addEventListener('dragover', (e) => {
                e.preventDefault();
                dropzone.classList.add('border-gold');
            });
            dropzone.addEventListener('dragleave', (e) => {
                e.preventDefault();
                dropzone.classList.remove('border-gold');
            });
            dropzone.addEventListener('drop', (e) => {
                e.preventDefault();
                dropzone.classList.remove('border-gold');
                if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
                    processJustificationFile(e.dataTransfer.files[0]);
                }
            });
        }

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

async function markAllVisibleAsPresent() {
    const rows = document.querySelectorAll('.att-table-row[data-teacher-id]');
    if (rows.length === 0) return;

    const btnMarkAll = document.getElementById('btn-att-mark-all-pr');
    if (btnMarkAll) btnMarkAll.disabled = true;

    try {
        const recordsToSave = [];
        for (const row of rows) {
            const teacherId = parseInt(row.getAttribute('data-teacher-id'));
            const select = row.querySelector('.att-status-select');
            const hoursInput = row.querySelector('.att-hours-input');
            const hs = hoursInput ? (parseInt(hoursInput.value) || 4) : 4;

            if (select) {
                select.value = 'PR';
            }
            const rec = (AppState.attendanceRecordsCache || []).find(r => r.teacherId === teacherId);
            if (rec) {
                rec.currentStatus = 'PR';
                rec.status = 'PR';
                rec.observations = '';
                rec.hasPhysicalForm = false;
            }
            handleAttendanceStatusChange(row, 'PR', false);

            recordsToSave.push({
                teacherId,
                status: 'PR',
                hours: hs,
                observations: ''
            });
        }

        const res = await window.sigetApi.attendance.saveBatch(AppState.attendanceDate, recordsToSave);
        if (res && res.success) {
            showToast('Todos los docentes visibles fueron marcados como Presente (PR) y guardados.', 'success');
            await loadDailyAttendance();
            await loadDashboard();
        } else {
            showToast((res && res.message) || 'Error al guardar asistencias en lote.', 'error');
        }
    } catch (err) {
        console.error('Error al marcar todos como presente:', err);
        showToast('Error de comunicación con la base de datos.', 'error');
    } finally {
        if (btnMarkAll) btnMarkAll.disabled = false;
    }
}

function triggerBrowserDownloadFromBase64(base64Data, fileName, mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
    try {
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
        console.warn('No se pudo ejecutar descarga web directa:', err);
    }
}

function generateAndDownloadDailyCsvFallback(dateStr, records) {
    try {
        const dateParts = (dateStr || '').split('-');
        const formattedDate = dateParts.length === 3 ? `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}` : dateStr;
        const nowStr = new Date().toLocaleString('es-AR');

        let csvContent = '\uFEFF';
        csvContent += '"IESETYFP - INSTITUTO DE EDUCACIÓN SUPERIOR DE EDUCACIÓN TÉCNICA Y FORMACIÓN PROFESIONAL"\n';
        csvContent += `"PARTE DIARIO INSTITUCIONAL • FECHA: ${formattedDate} • EMISIÓN: ${nowStr} • CONTROL DE BEDELÍA"\n\n`;
        csvContent += '"Legajo";"Docente (Apellido y Nombres)";"DNI";"Situación de Revista";"Carga Horaria";"Estado Diario";"Observaciones / Motivo"\n';

        const statusLabels = {
            PR: 'Presente',
            I: 'Inasistencia',
            LIC: 'Licencia Médica / Especial',
            P: 'Permiso Particular (Art. 115)',
            LT: 'Largo Tratamiento'
        };

        const cacheMap = new Map();
        (AppState.attendanceRecordsCache || []).forEach(c => cacheMap.set(c.teacherId, c));

        records.forEach(r => {
            const cached = cacheMap.get(r.teacherId) || {};
            const legajo = cached.legajo || 'S/L';
            const fullName = cached.fullName || `Docente ${r.teacherId}`;
            const dni = cached.dni || '';
            const revista = cached.revista || 'Titular';
            const hours = `${r.hours || cached.hours || 4} hs`;
            const stLabel = statusLabels[r.status] || r.status;
            const obs = (r.observations || cached.observations || '').replace(/"/g, '""');

            csvContent += `"${legajo}";"${fullName}";"${dni}";"${revista}";"${hours}";"${stLabel}";"${obs}"\n`;
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const fileName = `Parte_Diario_Docentes_${dateStr}.csv`;
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        showToast(`Archivo diario descargado: ${fileName}`, 'success');
    } catch (err) {
        console.error('Error generando fallback CSV:', err);
    }
}

async function saveAllAttendanceRecords() {
    const btnSave = document.getElementById('btn-att-save-all');
    if (btnSave) {
        btnSave.disabled = true;
        btnSave.innerHTML = `<i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin"></i><span>Guardando y Exportando...</span>`;
        initLucideIcons();
    }

    try {
        const rows = document.querySelectorAll('.att-table-row[data-teacher-id]');
        const currentEdits = new Map();

        rows.forEach(row => {
            const teacherId = parseInt(row.getAttribute('data-teacher-id'));
            const statusSelect = row.querySelector('.att-status-select');
            const statusInput = row.querySelector('.att-status-value');
            const hoursInput = row.querySelector('.att-hours-input');

            const currentStatus = statusSelect ? statusSelect.value : (statusInput ? statusInput.value : 'I');
            const hours = hoursInput ? (parseInt(hoursInput.value) || 4) : 4;

            currentEdits.set(teacherId, {
                status: currentStatus,
                hours: hours
            });
        });

        const recordsToSave = (AppState.attendanceRecordsCache || []).map(r => {
            if (currentEdits.has(r.teacherId)) {
                const edit = currentEdits.get(r.teacherId);
                const isPrOrI = (edit.status === 'PR' || edit.status === 'I');
                return {
                    teacherId: r.teacherId,
                    status: edit.status,
                    hours: edit.hours,
                    observations: isPrOrI ? '' : (r.observations || '')
                };
            }
            const isPrOrI = (r.currentStatus === 'PR' || r.currentStatus === 'I' || r.status === 'PR' || r.status === 'I');
            return {
                teacherId: r.teacherId,
                status: r.currentStatus || r.status || 'I',
                hours: r.hours || 4,
                observations: isPrOrI ? '' : (r.observations || '')
            };
        });

        let saveSuccess = false;
        if (window.sigetApi && window.sigetApi.attendance && typeof window.sigetApi.attendance.saveBatch === 'function') {
            const res = await window.sigetApi.attendance.saveBatch(AppState.attendanceDate, recordsToSave);
            if (res && res.success) {
                saveSuccess = true;
                showToast(`Se guardó el parte diario para la fecha ${AppState.attendanceDate}.`, 'success');
            } else {
                showToast((res && res.message) || 'Error al guardar registros en base de datos.', 'error');
            }
        } else {
            saveSuccess = true;
            showToast(`Parte diario consolidado localmente para ${AppState.attendanceDate}.`, 'success');
        }

        if (saveSuccess) {
            showToast('Generando y descargando archivo Excel del día...', 'info');

            let exported = false;
            if (window.sigetApi && window.sigetApi.attendance && typeof window.sigetApi.attendance.exportDailyExcel === 'function') {
                try {
                    const excelRes = await window.sigetApi.attendance.exportDailyExcel(AppState.attendanceDate);
                    if (excelRes && excelRes.success) {
                        exported = true;
                        showToast(`Planilla Excel del día guardada: ${excelRes.fileName}`, 'success');

                        if (excelRes.base64) {
                            triggerBrowserDownloadFromBase64(excelRes.base64, excelRes.fileName, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                        }

                        if (window.sigetApi.reports && typeof window.sigetApi.reports.openFile === 'function') {
                            await window.sigetApi.reports.openFile(excelRes.filePath);
                        }
                    } else {
                        console.warn('[Attendance] No se pudo exportar Excel nativo:', excelRes?.message);
                    }
                } catch (exportErr) {
                    console.error('[Attendance] Error exportando Excel nativo:', exportErr);
                }
            }

            if (!exported) {
                generateAndDownloadDailyCsvFallback(AppState.attendanceDate, recordsToSave);
            }

            await loadDailyAttendance();
            await loadDashboard();
        }
    } catch (err) {
        console.error('Error al guardar y exportar asistencias:', err);
        showToast('Error de comunicación con el sistema.', 'error');
    } finally {
        if (btnSave) {
            btnSave.disabled = false;
            btnSave.innerHTML = `<i data-lucide="file-spreadsheet" class="w-3.5 h-3.5"></i><span>Guardar y Descargar Excel</span>`;
            initLucideIcons();
        }
    }
}

function openPrintableDailyExportModal() {
    const targetDate = AppState.attendanceDate || new Date().toISOString().split('T')[0];
    const [y, m, d] = targetDate.split('-');
    const dateFormatted = `${d}/${m}/${y}`;

    const modalHtml = `
        <div class="p-6">
            <div class="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-zinc-800">
                <div class="flex items-center space-x-3">
                    <div class="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                        <i data-lucide="printer" class="w-5 h-5"></i>
                    </div>
                    <div>
                        <h3 class="text-sm font-black text-slate-800 dark:text-zinc-100 uppercase tracking-wide">Planilla Imprimible de Control Diario</h3>
                        <p class="text-xs text-slate-500 dark:text-zinc-400">Control manual de asistencia en papel para oficina de bedelía</p>
                    </div>
                </div>
                <button type="button" id="btn-close-printable-modal" class="text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 transition">
                    <i data-lucide="x" class="w-5 h-5"></i>
                </button>
            </div>

            <div class="my-5 p-4 rounded-xl bg-slate-50 dark:bg-zinc-800/60 border border-slate-200 dark:border-zinc-700/80">
                <div class="flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div>
                        <span class="text-slate-500 dark:text-zinc-400">Fecha del Control Diario:</span>
                        <strong class="ml-1.5 font-bold text-slate-800 dark:text-zinc-100">${dateFormatted}</strong>
                    </div>
                    <div>
                        <span class="text-slate-500 dark:text-zinc-400">Plantel Docente:</span>
                        <strong class="ml-1.5 font-bold text-indigo-600 dark:text-indigo-400">${AppState.teachersCache?.length || 'Todos los'} docentes</strong>
                    </div>
                </div>
                <div class="mt-3 text-[11px] text-slate-500 dark:text-zinc-400 flex items-center space-x-2">
                    <i data-lucide="info" class="w-3.5 h-3.5 text-indigo-500 shrink-0"></i>
                    <span>Incluye detalle de cátedras con desglose de días múltiples de dictado y casillas vacías de verificación [PR, I, P, LIC, SUP].</span>
                </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mb-5">
                <!-- Opción PDF -->
                <button type="button" id="btn-confirm-print-pdf"
                    class="p-4 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/50 hover:bg-rose-50 dark:bg-rose-950/20 dark:hover:bg-rose-950/40 transition text-left flex flex-col justify-between group cursor-pointer">
                    <div class="flex items-center justify-between mb-2">
                        <div class="w-8 h-8 rounded-lg bg-rose-100 dark:bg-rose-900/60 text-rose-600 dark:text-rose-300 flex items-center justify-center">
                            <i data-lucide="file-text" class="w-4 h-4"></i>
                        </div>
                        <span class="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-rose-100 dark:bg-rose-900/60 text-rose-700 dark:text-rose-300">Recomendado</span>
                    </div>
                    <div>
                        <div class="font-black text-xs text-rose-900 dark:text-rose-200 group-hover:text-rose-700 transition">Descargar en PDF</div>
                        <div class="text-[11px] text-slate-600 dark:text-zinc-400 mt-1">Formato A4 horizontal optimizado para imprimir en papel y firmar a mano.</div>
                    </div>
                </button>

                <!-- Opción Excel -->
                <button type="button" id="btn-confirm-print-excel"
                    class="p-4 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/50 hover:bg-emerald-50 dark:bg-emerald-950/20 dark:hover:bg-emerald-950/40 transition text-left flex flex-col justify-between group cursor-pointer">
                    <div class="flex items-center justify-between mb-2">
                        <div class="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/60 text-emerald-600 dark:text-emerald-300 flex items-center justify-center">
                            <i data-lucide="file-spreadsheet" class="w-4 h-4"></i>
                        </div>
                        <span class="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300">Hoja de Cálculo</span>
                    </div>
                    <div>
                        <div class="font-black text-xs text-emerald-900 dark:text-emerald-200 group-hover:text-emerald-700 transition">Descargar en Excel</div>
                        <div class="text-[11px] text-slate-600 dark:text-zinc-400 mt-1">Planilla .xlsx estructurada con casillas de verificación y cuadrícula para control de mesa.</div>
                    </div>
                </button>
            </div>

            <div class="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-zinc-800 text-xs">
                <button type="button" id="btn-confirm-print-both" class="text-indigo-600 dark:text-indigo-400 font-bold hover:underline flex items-center space-x-1 cursor-pointer">
                    <i data-lucide="download" class="w-3.5 h-3.5"></i>
                    <span>Descargar ambos formatos (.pdf y .xlsx)</span>
                </button>
                <button type="button" id="btn-cancel-printable-modal" class="px-4 py-1.5 text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg transition font-bold cursor-pointer">
                    Cerrar
                </button>
            </div>
        </div>
    `;

    openModal(modalHtml, () => {
        const btnClose = document.getElementById('btn-close-printable-modal');
        const btnCancel = document.getElementById('btn-cancel-printable-modal');
        const btnPdf = document.getElementById('btn-confirm-print-pdf');
        const btnExcel = document.getElementById('btn-confirm-print-excel');
        const btnBoth = document.getElementById('btn-confirm-print-both');

        if (btnClose) btnClose.addEventListener('click', closeModal);
        if (btnCancel) btnCancel.addEventListener('click', closeModal);

        if (btnPdf) btnPdf.addEventListener('click', async () => {
            closeModal();
            await downloadPrintableDaily('pdf');
        });

        if (btnExcel) btnExcel.addEventListener('click', async () => {
            closeModal();
            await downloadPrintableDaily('excel');
        });

        if (btnBoth) btnBoth.addEventListener('click', async () => {
            closeModal();
            await downloadPrintableDaily('pdf');
            await downloadPrintableDaily('excel');
        });

        initLucideIcons();
    });
}

async function downloadPrintableDaily(format = 'pdf') {
    const targetDate = AppState.attendanceDate || new Date().toISOString().split('T')[0];
    const isPdf = format === 'pdf';
    const formatLabel = isPdf ? 'PDF' : 'Excel';

    try {
        let outputPath = null;
        if (window.sigetApi && window.sigetApi.dialog && window.sigetApi.dialog.showSaveDialog) {
            const defaultName = `Planilla_Imprimible_Control_Diario_${targetDate}.${isPdf ? 'pdf' : 'xlsx'}`;
            const filterName = isPdf ? 'Documento PDF (*.pdf)' : 'Libro de Excel (*.xlsx)';
            const ext = isPdf ? 'pdf' : 'xlsx';
            const saveRes = await window.sigetApi.dialog.showSaveDialog({
                title: `Guardar Planilla Imprimible de Control Diario (${formatLabel})`,
                defaultPath: defaultName,
                filters: [{ name: filterName, extensions: [ext] }]
            });
            if (saveRes.canceled || !saveRes.filePath) return;
            outputPath = saveRes.filePath;
        }

        showToast(`Generando Planilla Imprimible de Control Diario (${formatLabel})...`, 'info');

        let res;
        if (isPdf) {
            if (window.sigetApi?.attendance?.exportPrintablePdf) {
                res = await window.sigetApi.attendance.exportPrintablePdf({ dateStr: targetDate, outputPath });
            }
        } else {
            if (window.sigetApi?.attendance?.exportPrintableExcel) {
                res = await window.sigetApi.attendance.exportPrintableExcel({ dateStr: targetDate, outputPath });
            }
        }

        if (res && res.success) {
            showToast(`Planilla Imprimible (${formatLabel}) guardada: ${res.fileName}`, 'success');

            if (res.base64 && !outputPath) {
                const mimeType = isPdf ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
                triggerBrowserDownloadFromBase64(res.base64, res.fileName, mimeType);
            }

            if (window.sigetApi?.reports?.openFile && res.filePath) {
                await window.sigetApi.reports.openFile(res.filePath);
            }
        } else {
            showToast((res && res.message) || `Error al generar Planilla Imprimible en ${formatLabel}.`, 'error');
        }
    } catch (err) {
        console.error(`Error generando Planilla Imprimible (${formatLabel}):`, err);
        showToast(`Error al exportar Planilla Imprimible: ${err.message}`, 'error');
    }
}

window.openPrintableDailyExportModal = openPrintableDailyExportModal;
window.downloadPrintableDaily = downloadPrintableDaily;

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
                    <td class="py-2.5 px-3">
                        <div class="space-y-1 text-left inline-block w-full">
                            ${(d.schedules && d.schedules.length > 0 ? d.schedules : [{ dayOfWeek: d.dayOfWeek || 'Lunes', startTime: d.startTime || '18:00', endTime: d.endTime || '20:00' }]).map(s => `
                                <div class="flex items-center text-[11px] py-0.5 border-b border-slate-100/60 dark:border-zinc-800/60 last:border-0">
                                    <span class="font-bold text-slate-800 dark:text-zinc-200 w-20 shrink-0">${escapeHtml(s.dayOfWeek)}:</span>
                                    <span class="font-mono text-slate-600 dark:text-zinc-400">${escapeHtml(s.startTime)} - ${escapeHtml(s.endTime)}</span>
                                </div>
                            `).join('')}
                        </div>
                    </td>
                    <td class="py-2.5 px-3 text-center">
                        <span class="px-2 py-1 rounded bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-xs font-black text-slate-800 dark:text-zinc-100">${d.hoursCount} hs</span>
                        ${d.schedules && d.schedules.length > 1 ? `<div class="text-[10px] text-slate-400 mt-0.5 font-medium">${d.schedules.length} días/sem</div>` : ''}
                    </td>
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
                            <button onclick='deleteDesignation(${JSON.stringify(d.ids && d.ids.length > 1 ? d.ids : d.id)})' title="Dar de baja / Eliminar cátedra" class="p-1 rounded text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-zinc-800">
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

window.editDesignation = async function (id) {
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

window.deleteDesignation = async function (id) {
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
    const ALL_DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

    const modalHtml = `
        <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-zinc-800 mb-4">
            <div>
                <h3 class="text-sm font-bold text-slate-900 dark:text-zinc-100">
                    ${isEdit ? 'Modificar Designación de Cátedra' : 'Nueva Designación de Cátedra'}
                </h3>
                <p class="text-[11px] text-slate-500 dark:text-zinc-400">
                    ${isEdit ? 'Edición de cátedra, horarios variables por día y situación de revista (RN-02)' : 'Asignación de docente titular y distribución horaria por día'}
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

            <!-- DISTRIBUCIÓN HORARIA DINÁMICA POR DÍA -->
            <div class="border border-slate-200 dark:border-zinc-700 rounded-xl p-3 bg-slate-50/60 dark:bg-zinc-800/50 space-y-2.5">
                <div class="flex items-center justify-between">
                    <div>
                        <label class="block text-[11px] font-bold text-slate-800 dark:text-zinc-200 uppercase">
                            Días y Horarios de Dictado *
                        </label>
                        <p class="text-[10px] text-slate-500 dark:text-zinc-400">
                            Configure uno o más días con horarios y horas cátedra variables
                        </p>
                    </div>
                    <div class="flex items-center gap-2">
                        <span id="modal-desig-total-hours-badge" class="px-2 py-0.5 rounded text-[11px] font-black bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
                            Total: 0 hs cátedra
                        </span>
                        <button type="button" id="btn-add-schedule-day" class="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-amber-600 hover:bg-amber-700 text-white flex items-center space-x-1 shadow-xs transition cursor-pointer">
                            <span>+ Agregar Día</span>
                        </button>
                    </div>
                </div>

                <div id="modal-schedules-container" class="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                    <!-- Filas dinámicas de días y horarios -->
                </div>
            </div>

            <div>
                <label class="block text-[11px] font-bold text-slate-700 dark:text-zinc-300 uppercase mb-1">Resolución / Disposición</label>
                <input type="text" id="modal-desig-resolution" placeholder="Ej: Disp. N° 012/2026"
                    value="${isEdit ? escapeHtml(designationToEdit.resolutionNumber || '') : ''}"
                    class="w-full px-3 py-1.5 text-xs border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-800 dark:text-zinc-100 rounded-lg">
            </div>

            <div id="modal-desig-error" class="hidden p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-medium"></div>

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
        const revistaSelect = document.getElementById('modal-desig-revista');
        const btnModalNewCareer = document.getElementById('btn-modal-desig-new-career');
        const schedulesContainer = document.getElementById('modal-schedules-container');
        const btnAddScheduleDay = document.getElementById('btn-add-schedule-day');
        const totalHoursBadge = document.getElementById('modal-desig-total-hours-badge');
        const form = document.getElementById('desig-form');
        const errDiv = document.getElementById('modal-desig-error');

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
            if (revistaSelect && designationToEdit.revista) {
                revistaSelect.value = designationToEdit.revista;
            }
        }

        function updateTotalHours() {
            const hourInputs = schedulesContainer.querySelectorAll('.schedule-hours');
            let total = 0;
            hourInputs.forEach(input => {
                total += parseInt(input.value) || 0;
            });
            if (totalHoursBadge) {
                totalHoursBadge.textContent = `Total: ${total} hs cátedra`;
                if (total > 30) {
                    totalHoursBadge.className = 'px-2 py-0.5 rounded text-[11px] font-black bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-700';
                } else {
                    totalHoursBadge.className = 'px-2 py-0.5 rounded text-[11px] font-black bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700';
                }
            }
            return total;
        }

        function createScheduleRow(data = {}) {
            const day = data.dayOfWeek || 'Lunes';
            const start = data.startTime || '18:30';
            const end = data.endTime || '20:30';
            const hours = data.hoursCount !== undefined ? data.hoursCount : 2;

            const row = document.createElement('div');
            row.className = 'schedule-row flex items-center gap-2 p-2 rounded-lg bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 shadow-2xs';
            row.innerHTML = `
                <div class="flex-1 min-w-[110px]">
                    <label class="block text-[10px] font-bold text-slate-500 dark:text-zinc-400 uppercase mb-0.5">Día</label>
                    <select class="schedule-day w-full px-2 py-1 text-xs border border-slate-200 dark:border-zinc-600 bg-white dark:bg-zinc-700 text-slate-800 dark:text-zinc-100 rounded">
                        ${ALL_DAYS.map(d => `<option value="${d}" ${d === day ? 'selected' : ''}>${d}</option>`).join('')}
                    </select>
                </div>
                <div class="w-24">
                    <label class="block text-[10px] font-bold text-slate-500 dark:text-zinc-400 uppercase mb-0.5">Inicio</label>
                    <input type="time" class="schedule-start w-full px-2 py-1 text-xs border border-slate-200 dark:border-zinc-600 bg-white dark:bg-zinc-700 text-slate-800 dark:text-zinc-100 rounded" value="${start}">
                </div>
                <div class="w-24">
                    <label class="block text-[10px] font-bold text-slate-500 dark:text-zinc-400 uppercase mb-0.5">Fin</label>
                    <input type="time" class="schedule-end w-full px-2 py-1 text-xs border border-slate-200 dark:border-zinc-600 bg-white dark:bg-zinc-700 text-slate-800 dark:text-zinc-100 rounded" value="${end}">
                </div>
                <div class="w-20">
                    <label class="block text-[10px] font-bold text-slate-500 dark:text-zinc-400 uppercase mb-0.5">Hs Cát.</label>
                    <input type="number" min="1" max="12" class="schedule-hours w-full px-2 py-1 text-xs border border-slate-200 dark:border-zinc-600 bg-white dark:bg-zinc-700 text-slate-800 dark:text-zinc-100 rounded font-bold text-center" value="${hours}">
                </div>
                <div class="pt-3">
                    <button type="button" class="btn-remove-schedule p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-zinc-700 rounded transition cursor-pointer" title="Quitar este día">
                        ✕
                    </button>
                </div>
            `;

            const hoursInput = row.querySelector('.schedule-hours');
            hoursInput.addEventListener('input', updateTotalHours);

            const removeBtn = row.querySelector('.btn-remove-schedule');
            removeBtn.addEventListener('click', () => {
                const totalRows = schedulesContainer.querySelectorAll('.schedule-row').length;
                if (totalRows <= 1) {
                    showToast('Debe mantener al menos un día asignado para la cátedra.', 'error');
                    return;
                }
                row.remove();
                updateTotalHours();
            });

            schedulesContainer.appendChild(row);
            updateTotalHours();
        }

        let initialSchedules = [];
        if (isEdit) {
            if (Array.isArray(designationToEdit.schedules) && designationToEdit.schedules.length > 0) {
                initialSchedules = designationToEdit.schedules;
            } else {
                initialSchedules = [{
                    dayOfWeek: designationToEdit.dayOfWeek || 'Lunes',
                    startTime: designationToEdit.startTime || '18:30',
                    endTime: designationToEdit.endTime || '21:30',
                    hoursCount: designationToEdit.hoursCount || 4
                }];
            }
        } else {
            initialSchedules = [{
                dayOfWeek: 'Lunes',
                startTime: '18:30',
                endTime: '20:30',
                hoursCount: 2
            }];
        }

        initialSchedules.forEach(s => createScheduleRow(s));

        if (btnAddScheduleDay) {
            btnAddScheduleDay.addEventListener('click', () => {
                const existingDays = Array.from(schedulesContainer.querySelectorAll('.schedule-day')).map(el => el.value);
                const nextAvailableDay = ALL_DAYS.find(d => !existingDays.includes(d)) || 'Lunes';
                createScheduleRow({
                    dayOfWeek: nextAvailableDay,
                    startTime: '18:30',
                    endTime: '20:30',
                    hoursCount: 2
                });
            });
        }

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            errDiv.classList.add('hidden');

            const rows = schedulesContainer.querySelectorAll('.schedule-row');
            if (rows.length === 0) {
                errDiv.textContent = 'Debe configurar al menos un día de dictado para la cátedra.';
                errDiv.classList.remove('hidden');
                return;
            }

            const schedules = [];
            const seenDays = new Set();
            let hasDuplicateDay = false;
            let invalidHours = false;

            rows.forEach(r => {
                const day = r.querySelector('.schedule-day').value;
                const start = r.querySelector('.schedule-start').value || '18:00';
                const end = r.querySelector('.schedule-end').value || '20:00';
                const hours = parseInt(r.querySelector('.schedule-hours').value) || 0;

                if (seenDays.has(day)) {
                    hasDuplicateDay = true;
                }
                seenDays.add(day);

                if (hours <= 0) {
                    invalidHours = true;
                }

                schedules.push({
                    dayOfWeek: day,
                    startTime: start,
                    endTime: end,
                    hoursCount: hours
                });
            });

            if (hasDuplicateDay) {
                errDiv.textContent = 'No puede asignar el mismo día de la semana dos veces en la misma cátedra. Ajuste los horarios o unifique las horas.';
                errDiv.classList.remove('hidden');
                return;
            }

            if (invalidHours) {
                errDiv.textContent = 'Las horas cátedra de cada día deben ser mayores a cero.';
                errDiv.classList.remove('hidden');
                return;
            }

            const totalHours = schedules.reduce((sum, s) => sum + s.hoursCount, 0);

            const payload = {
                id: isEdit ? designationToEdit.id : undefined,
                teacherId: parseInt(teacherSelect.value),
                subjectId: parseInt(subjectSelect.value),
                hoursCount: totalHours,
                dayOfWeek: schedules.map(s => s.dayOfWeek).join(' y '),
                startTime: schedules[0]?.startTime || '18:00',
                endTime: schedules[schedules.length - 1]?.endTime || '20:00',
                schedules: schedules,
                cargo: 'Profesor',
                revista: revistaSelect ? revistaSelect.value : 'Titular',
                resolutionNumber: document.getElementById('modal-desig-resolution') ? document.getElementById('modal-desig-resolution').value.trim() : null
            };

            try {
                const res = await window.sigetApi.designations.save(payload);
                if (res.success) {
                    showToast(isEdit ? 'Designación de cátedra actualizada exitosamente.' : 'Cátedra designada con éxito.', 'success');
                    closeModal();
                    loadDesignations();
                    if (window.sigetApi.teachers && window.sigetApi.teachers.getAll) {
                        window.sigetApi.teachers.getAll().then(tList => {
                            AppState.teachersCache = tList || [];
                        }).catch(() => { });
                    }
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

window.openSubstitutionModal = function (designationId) {
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

const CalendarState = {
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
    currentView: 'grid',
    matrixData: null,
    selectedDayData: null
};

const MONTH_NAMES_ES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

AppState.calendarTimeline = null;

function buildDefaultMonthMatrix(year, month) {
    const y = Number(year) || new Date().getFullYear();
    const m = Number(month) || (new Date().getMonth() + 1);
    const mStr = String(m).padStart(2, '0');
    const prefix = `${y}-${mStr}`;
    const daysInMonth = new Date(y, m, 0).getDate();
    const monthName = MONTH_NAMES_ES[m - 1] || `Mes ${m}`;

    const OFFICIAL_HOLIDAYS_MAP = {
        '01-01': 'Año Nuevo',
        '03-24': 'Día Nacional de la Memoria por la Verdad y la Justicia',
        '04-02': 'Día del Veterano y de los Caídos en Malvinas',
        '05-01': 'Día del Trabajador',
        '05-25': 'Día de la Revolución de Mayo',
        '06-17': 'Gral. Martín Miguel de Güemes',
        '06-20': 'Día de la Bandera (Gral. Manuel Belgrano)',
        '07-09': 'Día de la Independencia',
        '08-17': 'Gral. José de San Martín',
        '08-25': 'Autonomía de Catamarca',
        '09-11': 'Día del Maestro',
        '09-21': 'Día del Estudiante',
        '10-12': 'Día del Respeto a la Diversidad Cultural',
        '11-20': 'Día de la Soberanía Nacional',
        '12-08': 'Inmaculada Concepción de María',
        '12-25': 'Navidad'
    };

    const DEFAULT_INSTITUTIONAL_DAYS = {
        '2026-11-27': 'Jornada Institucional de Evaluación y Cierre de Ciclo',
        '2026-07-03': 'Jornada Pedagógica Institucional Interdisciplinaria',
        '2026-12-18': 'Jornada de Balance Institucional y Planificación'
    };

    const DEFAULT_SAMPLE_LEAVES = {
        '2026-11-04': [
            {
                teacherId: 1,
                teacherName: 'FERNÁNDEZ, Laura',
                fullName: 'FERNÁNDEZ, Laura',
                lastName: 'FERNÁNDEZ',
                firstName: 'Laura',
                legajo: '1001',
                status: 'LIC',
                statusLabel: 'Licencia Médica / Salud (Art. 114 a)',
                hours: 4,
                observations: 'Art. 114 a - Afección Común / Reposo'
            }
        ],
        '2026-11-12': [
            {
                teacherId: 2,
                teacherName: 'MORALES, Roberto',
                fullName: 'MORALES, Roberto',
                lastName: 'MORALES',
                firstName: 'Roberto',
                legajo: '1002',
                status: 'P',
                statusLabel: 'Permiso Particular (Art. 115)',
                hours: 4,
                observations: 'Art. 115 - Razones Particulares'
            }
        ],
        '2026-11-18': [
            {
                teacherId: 3,
                teacherName: 'VARGAS, Tomás',
                fullName: 'VARGAS, Tomás',
                lastName: 'VARGAS',
                firstName: 'Tomás',
                legajo: '1003',
                status: 'I',
                statusLabel: 'Inasistencia Justificada',
                hours: 4,
                observations: 'Inasistencia notificada sin certificado'
            }
        ]
    };

    const SAMPLE_FACULTY = [
        { id: 1, lastName: 'FERNÁNDEZ', firstName: 'Laura', legajo: '1001', dni: '28456123', revista: 'Titular', hours: 12 },
        { id: 2, lastName: 'MORALES', firstName: 'Roberto', legajo: '1002', dni: '29876543', revista: 'Interino', hours: 8 },
        { id: 3, lastName: 'VARGAS', firstName: 'Tomás', legajo: '1003', dni: '34567890', revista: 'Suplente', hours: 10 },
        { id: 4, lastName: 'GÓMEZ', firstName: 'Patricia', legajo: '1004', dni: '26123456', revista: 'Titular', hours: 6 },
        { id: 5, lastName: 'DÍAZ', firstName: 'Martín', legajo: '1005', dni: '31987654', revista: 'Titular', hours: 8 },
        { id: 6, lastName: 'CASTRO', firstName: 'Silvina', legajo: '1006', dni: '33456789', revista: 'Interino', hours: 4 },
        { id: 7, lastName: 'ROJAS', firstName: 'Carlos', legajo: '1007', dni: '30234567', revista: 'Titular', hours: 12 },
        { id: 8, lastName: 'HERRERA', firstName: 'Valeria', legajo: '1008', dni: '35678901', revista: 'Interino', hours: 6 }
    ];

    const SAMPLE_SUBS = [
        {
            id: 1,
            subjectName: 'Prácticas Profesionalizantes I',
            reason: 'Art. 114 a - Licencia Médica Laura Fernández',
            resolution: 'Res. Int. 042/2026',
            startDate: `${y}-${mStr}-01`,
            endDate: `${y}-${mStr}-30`,
            titularLastName: 'FERNÁNDEZ',
            titularFirstName: 'Laura',
            titularName: 'FERNÁNDEZ, Laura',
            titularDni: '28456123',
            titularLegajo: '1001',
            suplenteLastName: 'VARGAS',
            suplenteFirstName: 'Tomás',
            suplenteName: 'VARGAS, Tomás',
            suplenteDni: '34567890',
            suplenteLegajo: '1003'
        }
    ];

    const days = [];
    const dayShortNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const fullDayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

    let workdaysCount = 0;
    let holidaysCount = 0;
    let institutionalDaysCount = 0;
    let totalNoveltiesCount = 0;

    for (let d = 1; d <= daysInMonth; d++) {
        const dStr = `${prefix}-${String(d).padStart(2, '0')}`;
        const mmdd = `${mStr}-${String(d).padStart(2, '0')}`;
        const dt = new Date(y, m - 1, d, 12, 0, 0);
        const dayOfWeek = dt.getDay();
        const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);

        const holidayName = OFFICIAL_HOLIDAYS_MAP[mmdd] || null;
        const isHoliday = Boolean(holidayName);
        const instName = DEFAULT_INSTITUTIONAL_DAYS[dStr] || null;
        const isInstitutionalDay = Boolean(instName);

        const isNonWorking = isWeekend || isHoliday || isInstitutionalDay;
        if (!isNonWorking) workdaysCount++;
        if (isHoliday) holidaysCount++;
        if (isInstitutionalDay) institutionalDaysCount++;

        const sampleLeaves = DEFAULT_SAMPLE_LEAVES[dStr] || [];
        let prCount = isNonWorking ? 0 : 8;
        let iCount = 0;
        let pCount = 0;
        let licCount = 0;
        let ltCount = 0;

        sampleLeaves.forEach(l => {
            if (l.status === 'LIC') licCount++;
            else if (l.status === 'P') pCount++;
            else if (l.status === 'I') iCount++;
            else if (l.status === 'LT') ltCount++;
        });

        const dayNovelties = iCount + pCount + licCount + ltCount;
        totalNoveltiesCount += dayNovelties;

        if (!isNonWorking && dayNovelties > 0 && prCount >= dayNovelties) {
            prCount -= dayNovelties;
        }

        const activeSubsOnDay = SAMPLE_SUBS.filter(s => s.startDate <= dStr && (!s.endDate || s.endDate >= dStr));

        const presentTeachers = [];
        if (!isNonWorking) {
            const leaveTeacherIds = new Set(sampleLeaves.map(l => l.teacherId));
            SAMPLE_FACULTY.forEach(fac => {
                if (!leaveTeacherIds.has(fac.id)) {
                    presentTeachers.push({
                        teacherId: fac.id,
                        fullName: `${fac.lastName}, ${fac.firstName}`,
                        lastName: fac.lastName,
                        firstName: fac.firstName,
                        dni: fac.dni,
                        legajo: fac.legajo,
                        revista: fac.revista,
                        hours: fac.hours,
                        status: 'PR'
                    });
                }
            });
        }

        days.push({
            day: d,
            date: dStr,
            dateStr: dStr,
            dayOfWeek,
            dayName: dayShortNames[dayOfWeek],
            dayOfWeekName: fullDayNames[dayOfWeek],
            isWeekend,
            isNonWorking,
            isHoliday,
            holidayName,
            isInstitutionalDay,
            institutionalName: instName,
            institutionalDayName: instName,
            badge: holidayName ? `${holidayName} (Feriado)` : (instName ? `${instName} (Jornada)` : null),
            leavesCount: sampleLeaves.length,
            prCount,
            iCount,
            pCount,
            licCount,
            ltCount,
            stats: {
                PR: prCount,
                I: iCount,
                P: pCount,
                LIC: licCount,
                LT: ltCount
            },
            records: sampleLeaves,
            leaves: sampleLeaves,
            substitutions: activeSubsOnDay,
            substitutionsCount: activeSubsOnDay.length,
            presentTeachers,
            presentTeachersCount: presentTeachers.length
        });
    }

    return {
        success: true,
        year: y,
        month: m,
        monthStr: mStr,
        monthName,
        daysInMonth,
        days,
        teachersMatrix: [],
        substitutions: SAMPLE_SUBS,
        stats: {
            totalTeachers: 8,
            workdays: workdaysCount,
            holidays: holidaysCount,
            institutionalDays: institutionalDaysCount,
            totalNovelties: totalNoveltiesCount,
            totalAbsences: days.reduce((acc, d) => acc + d.iCount, 0),
            totalPermits: days.reduce((acc, d) => acc + d.pCount, 0),
            totalLicenses: days.reduce((acc, d) => acc + d.licCount, 0),
            totalLongTreatments: days.reduce((acc, d) => acc + d.ltCount, 0),
            totalNonWorkingDays: days.filter(d => d.isNonWorking).length,
            totalHolidays: holidaysCount,
            totalInstitutionalDays: institutionalDaysCount
        }
    };
}

function updateCalendarKpis(stats) {
    if (!stats) return;
    const kpiWorkdays = document.getElementById('cal-kpi-workdays');
    const kpiHolidays = document.getElementById('cal-kpi-holidays');
    const kpiInstDays = document.getElementById('cal-kpi-inst-days');
    const kpiNovelties = document.getElementById('cal-kpi-novelties');

    if (kpiWorkdays) kpiWorkdays.textContent = stats.workdays ?? 0;
    if (kpiHolidays) kpiHolidays.textContent = stats.holidays ?? 0;
    if (kpiInstDays) kpiInstDays.textContent = stats.institutionalDays ?? 0;
    if (kpiNovelties) kpiNovelties.textContent = stats.totalNovelties ?? 0;
}

async function initTeacherCalendar() {
    switchCalendarView(CalendarState.currentView || 'grid');

    loadInteractiveCalendar();

    const calSelectMonth = document.getElementById('cal-select-month');
    const calSelectYear = document.getElementById('cal-select-year');
    if (calSelectMonth) calSelectMonth.value = String(CalendarState.month);
    if (calSelectYear) calSelectYear.value = String(CalendarState.year);

    const sel = document.getElementById('calendar-teacher-select');
    if (sel && window.sigetApi && window.sigetApi.teachers && typeof window.sigetApi.teachers.getAll === 'function') {
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
        } catch (err) {
            console.error('Error al precargar docentes para calendario:', err);
        }
    }

    const startInput = document.getElementById('calendar-start-date');
    const endInput = document.getElementById('calendar-end-date');
    const y = CalendarState.year;
    const m = String(CalendarState.month).padStart(2, '0');
    const lastDay = new Date(y, CalendarState.month, 0).getDate();
    if (startInput && !startInput.value) startInput.value = `${y}-${m}-01`;
    if (endInput && !endInput.value) endInput.value = `${y}-${m}-${String(lastDay).padStart(2, '0')}`;
}

async function loadInteractiveCalendar() {
    try {
        CalendarState.year = Number(CalendarState.year) || new Date().getFullYear();
        CalendarState.month = Number(CalendarState.month) || (new Date().getMonth() + 1);

        const labelEl = document.getElementById('cal-current-month-label');
        if (labelEl) {
            labelEl.textContent = `${MONTH_NAMES_ES[CalendarState.month - 1]} ${CalendarState.year}`;
        }
        const calSelectMonth = document.getElementById('cal-select-month');
        const calSelectYear = document.getElementById('cal-select-year');
        if (calSelectMonth) calSelectMonth.value = String(CalendarState.month);
        if (calSelectYear) calSelectYear.value = String(CalendarState.year);

        const defaultMatrix = buildDefaultMonthMatrix(CalendarState.year, CalendarState.month);
        CalendarState.matrixData = defaultMatrix;
        updateCalendarKpis(defaultMatrix.stats);

        if (CalendarState.currentView === 'teacher') {
            await loadTeacherCalendar();
        } else {
            renderCalendarGridView(defaultMatrix);
        }

        if (window.sigetApi && window.sigetApi.calendar && typeof window.sigetApi.calendar.getMonthMatrix === 'function') {
            try {
                const res = await window.sigetApi.calendar.getMonthMatrix({
                    year: CalendarState.year,
                    month: CalendarState.month
                });

                if (res && res.success && Array.isArray(res.days) && res.days.length > 0) {
                    CalendarState.matrixData = res;
                    updateCalendarKpis(res.stats);

                    if (CalendarState.currentView === 'teacher') {
                        await loadTeacherCalendar();
                    } else {
                        renderCalendarGridView(res);
                    }
                }
            } catch (dbErr) {
                console.warn('[Calendar] Error al consultar datos de SQLite (se mantienen valores calculados):', dbErr);
            }
        }

        initLucideIcons();
    } catch (err) {
        console.error('Error al cargar calendario interactivo:', err);
    }
}

function switchCalendarView(viewName) {
    if (viewName === 'sheet') viewName = 'grid';
    CalendarState.currentView = viewName;

    const btnGrid = document.getElementById('cal-view-grid-btn');
    const btnTeacher = document.getElementById('cal-view-teacher-btn');

    const viewGrid = document.getElementById('cal-view-grid-container');
    const viewTeacher = document.getElementById('cal-view-teacher-container');

    const activeClasses = 'cal-view-toggle px-3 py-1.5 rounded-md text-xs font-bold transition bg-slate-900 text-gold dark:bg-gold dark:text-slate-900 shadow-xs flex items-center space-x-1.5';
    const inactiveClasses = 'cal-view-toggle px-3 py-1.5 rounded-md text-xs font-bold transition text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 flex items-center space-x-1.5';

    if (btnGrid) btnGrid.className = (viewName === 'grid') ? activeClasses : inactiveClasses;
    if (btnTeacher) btnTeacher.className = (viewName === 'teacher') ? activeClasses : inactiveClasses;

    if (viewGrid) viewGrid.classList.toggle('hidden', viewName !== 'grid');
    if (viewTeacher) viewTeacher.classList.toggle('hidden', viewName !== 'teacher');

    const isGrid = (viewName === 'grid');
    const btnCalExportExcel = document.getElementById('btn-cal-export-excel');
    const btnCalExportPdf = document.getElementById('btn-cal-export-pdf');
    const btnCalAddInst = document.getElementById('btn-cal-add-institutional');

    if (btnCalExportExcel) btnCalExportExcel.classList.toggle('hidden', !isGrid);
    if (btnCalExportPdf) btnCalExportPdf.classList.toggle('hidden', !isGrid);
    if (btnCalAddInst) btnCalAddInst.classList.toggle('hidden', !isGrid);

    if (viewName === 'grid') {
        renderCalendarGridView(CalendarState.matrixData);
    } else if (viewName === 'teacher') {
        loadTeacherCalendar();
    }

    initLucideIcons();
}

function renderCalendarGridView(matrixData) {
    const gridContainer = document.getElementById('cal-month-grid-cells');
    if (!gridContainer) return;

    const y = Number(CalendarState.year) || new Date().getFullYear();
    const m = Number(CalendarState.month) || (new Date().getMonth() + 1);
    matrixData = matrixData || CalendarState.matrixData || buildDefaultMonthMatrix(y, m);

    const firstDayDate = new Date(y, m - 1, 1, 12, 0, 0);
    const rawDayOfWeek = firstDayDate.getDay();
    const firstDayIndex = (rawDayOfWeek === 0) ? 6 : rawDayOfWeek - 1;
    const todayStr = getTodayDateString();

    let html = '';

    for (let i = 0; i < firstDayIndex; i++) {
        html += `<div class="cal-day-spacer bg-slate-50/40 dark:bg-zinc-900/40 rounded-xl border border-dashed border-slate-200 dark:border-zinc-800/50 min-h-[126px] opacity-40"></div>`;
    }

    (matrixData.days || []).forEach(day => {
        const isToday = day.date === todayStr;
        const isWeekend = day.dayOfWeekName === 'Sábado' || day.dayOfWeekName === 'Domingo' || day.dayOfWeek === 0 || day.dayOfWeek === 6;
        const stats = day.stats || { PR: day.prCount || 0, I: day.iCount || 0, P: day.pCount || 0, LIC: day.licCount || 0, LT: day.ltCount || 0 };
        const subsList = day.substitutions || [];
        const hasNovelties = (stats.I > 0 || stats.LIC > 0 || stats.P > 0 || stats.LT > 0 || subsList.length > 0);

        let cellBorder = 'border-slate-200 dark:border-zinc-700/80';
        let cellBg = 'bg-white dark:bg-zinc-800 hover:border-gold/60';

        if (isToday) {
            cellBorder = 'border-gold shadow-xs ring-1 ring-gold/40';
        }

        if (day.isHoliday) {
            cellBg = 'bg-amber-50/50 dark:bg-amber-950/20 hover:border-amber-400';
            cellBorder = 'border-amber-300 dark:border-amber-800/60';
        } else if (day.isInstitutionalDay) {
            cellBg = 'bg-purple-50/50 dark:bg-purple-950/20 hover:border-purple-400';
            cellBorder = 'border-purple-300 dark:border-purple-800/60';
        } else if (isWeekend) {
            cellBg = 'bg-slate-50/70 dark:bg-zinc-900/90';
        }

        const dayPills = [];

        if (day.isHoliday) {
            dayPills.push({
                type: 'holiday',
                icon: '🟣',
                class: 'cal-pill-holiday',
                text: `Feriado: ${day.holidayName || 'Feriado'}`,
                title: `Feriado Oficial: ${day.holidayName || ''}`
            });
        } else if (day.isInstitutionalDay) {
            dayPills.push({
                type: 'inst',
                icon: '🏛️',
                class: 'cal-pill-inst',
                text: `Jornada: ${day.institutionalName || 'Jornada'}`,
                title: `Jornada Institucional: ${day.institutionalName || ''}`,
                canDelete: true,
                date: day.date
            });
        }

        const licRecords = (day.leaves || []).filter(l => l.status === 'LIC' || l.status === 'P' || l.status === 'LT');
        licRecords.forEach(lic => {
            const rawName = lic.lastName || lic.teacherLastName || (lic.teacherName ? lic.teacherName.split(',')[0] : (lic.fullName ? lic.fullName.split(',')[0] : 'Docente'));
            const shortType = (lic.status === 'P') ? 'Perm' : (lic.status === 'LT') ? 'LT' : 'Lic';
            dayPills.push({
                type: 'lic',
                icon: '🟠',
                class: 'cal-pill-lic',
                text: `${shortType}: ${rawName.trim()}`,
                title: `${lic.fullName || rawName} (${lic.statusLabel || lic.status || 'Licencia'}) - ${lic.observations || ''}`
            });
        });

        let absRecords = (day.leaves || []).filter(l => l.status === 'I');
        if (absRecords.length === 0 && Array.isArray(day.records)) {
            absRecords = day.records.filter(r => r.status === 'I');
        }
        absRecords.forEach(abs => {
            const rawName = abs.lastName || abs.teacherLastName || (abs.teacherName ? abs.teacherName.split(',')[0] : (abs.fullName ? abs.fullName.split(',')[0] : 'Docente'));
            dayPills.push({
                type: 'abs',
                icon: '🔴',
                class: 'cal-pill-abs',
                text: `Inasist: ${rawName.trim()}`,
                title: `Inasistencia: ${abs.fullName || rawName} (${abs.hours || 4} hs)`
            });
        });

        subsList.forEach(sub => {
            const suplenteLast = sub.suplenteLastName || (sub.suplenteName ? sub.suplenteName.split(',')[0] : 'Suplente');
            const titularLast = sub.titularLastName || (sub.titularName ? sub.titularName.split(',')[0] : '');
            const label = titularLast ? `Supl: ${suplenteLast} (x ${titularLast})` : `Supl: ${suplenteLast}`;
            dayPills.push({
                type: 'sub',
                icon: '🔵',
                class: 'cal-pill-sub',
                text: label,
                title: `Suplente: ${sub.suplenteName || suplenteLast} | Titular: ${sub.titularName || titularLast} | Cátedra: ${sub.subjectName} (${sub.resolution || 'S/Res'})`
            });
        });

        const maxVisiblePills = 3;
        const visiblePills = dayPills.slice(0, maxVisiblePills);
        const remainingCount = dayPills.length - maxVisiblePills;

        let pillsHtml = '';
        if (dayPills.length > 0) {
            pillsHtml = `
                <div class="mt-1.5 space-y-1 w-full overflow-hidden">
                    ${visiblePills.map(p => `
                        <div class="cal-pill ${p.class}" title="${escapeHtml(p.title || p.text)}">
                            <span>${p.icon}</span>
                            <span class="truncate flex-1">${escapeHtml(p.text)}</span>
                            ${p.canDelete ? `<button type="button" class="btn-del-inst-day text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 font-bold ml-0.5 text-[11px]" data-date="${p.date}" title="Eliminar Jornada">✕</button>` : ''}
                        </div>
                    `).join('')}
                    ${remainingCount > 0 ? `
                        <div class="cal-pill-more">
                            +${remainingCount} más...
                        </div>
                    ` : ''}
                </div>
            `;
        }

        let statsRow = '';
        if (!isWeekend) {
            const prCount = (day.presentTeachers && day.presentTeachers.length > 0) ? day.presentTeachers.length : (stats.PR || 0);
            statsRow = `
                <div class="mt-2 pt-1 border-t border-slate-100 dark:border-zinc-800/80 flex items-center justify-between text-[10px] font-bold">
                    <span class="text-emerald-600 dark:text-emerald-400" title="Docentes Presentes">${prCount} PR</span>
                    ${stats.I > 0 ? `<span class="text-rose-600 dark:text-rose-400 font-extrabold" title="Inasistencias">${stats.I} I</span>` : ''}
                    ${(stats.LIC + stats.P + stats.LT) > 0 ? `<span class="text-amber-600 dark:text-amber-400 font-extrabold" title="Licencias y Permisos">${stats.LIC + stats.P + stats.LT} LIC</span>` : ''}
                    ${subsList.length > 0 ? `<span class="text-blue-600 dark:text-blue-400 font-extrabold" title="Suplencias Activas">${subsList.length} SUP</span>` : ''}
                </div>
            `;
        }

        html += `
            <div class="cal-day-cell p-2.5 rounded-xl border ${cellBorder} ${cellBg} transition cursor-pointer flex flex-col justify-between min-h-[126px] ${isToday ? 'is-today' : ''} ${day.isHoliday ? 'is-holiday' : ''} ${day.isInstitutionalDay ? 'is-institutional' : ''} ${isWeekend ? 'is-weekend' : ''}"
                data-date="${day.date}">
                <div>
                    <div class="flex items-center justify-between">
                        <span class="text-xs font-black ${isToday ? 'text-gold' : isWeekend ? 'text-rose-400' : 'text-slate-800 dark:text-zinc-100'}">${day.day}</span>
                        ${isToday ? '<span class="text-[9px] font-extrabold px-1.5 py-0.2 rounded bg-gold text-slate-900 uppercase">Hoy</span>' : ''}
                        ${hasNovelties ? '<span class="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" title="Eventos o novedades registradas"></span>' : ''}
                    </div>
                    ${pillsHtml}
                </div>
                ${statsRow}
            </div>
        `;
    });

    const totalRendered = firstDayIndex + (matrixData.days || []).length;
    const trailingSpacers = (7 - (totalRendered % 7)) % 7;
    for (let i = 0; i < trailingSpacers; i++) {
        html += `<div class="cal-day-spacer bg-slate-50/40 dark:bg-zinc-900/40 rounded-xl border border-dashed border-slate-200 dark:border-zinc-800/50 min-h-[126px] opacity-40"></div>`;
    }

    gridContainer.innerHTML = html;

    gridContainer.querySelectorAll('.cal-day-cell').forEach(cell => {
        cell.addEventListener('click', (e) => {
            if (e.target.closest('.btn-del-inst-day')) return;
            const dStr = cell.getAttribute('data-date');
            const dayObj = (matrixData.days || []).find(d => d.date === dStr);
            if (dayObj) openDayDetailModal(dayObj);
        });
    });

    gridContainer.querySelectorAll('.btn-del-inst-day').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const date = btn.getAttribute('data-date');
            if (!confirm(`¿Desea eliminar la jornada institucional del ${date}?`)) return;

            try {
                if (window.sigetApi && window.sigetApi.calendar && typeof window.sigetApi.calendar.deleteInstitutionalDay === 'function') {
                    const res = await window.sigetApi.calendar.deleteInstitutionalDay(date);
                    if (res && res.success) {
                        showToast('Jornada institucional eliminada.', 'success');
                        await loadInteractiveCalendar();
                        if (typeof checkCalendarNotice === 'function') {
                            await checkCalendarNotice(AppState.attendanceDate);
                        }
                    } else {
                        showToast((res && res.message) || 'Error al eliminar jornada.', 'error');
                    }
                } else {
                    showToast('Jornada institucional eliminada en vista local.', 'info');
                    await loadInteractiveCalendar();
                }
            } catch (err) {
                showToast('Error: ' + err.message, 'error');
            }
        });
    });
}

function openDayDetailModal(day) {
    CalendarState.selectedDayData = day;
    const modal = document.getElementById('cal-day-modal');
    if (!modal) return;

    const titleEl = document.getElementById('cal-modal-title');
    const subTitleEl = document.getElementById('cal-modal-subtitle');
    const badgeEl = document.getElementById('cal-modal-status-badge');
    const bannerEl = document.getElementById('cal-modal-special-banner');

    const mName = MONTH_NAMES_ES[(CalendarState.month || 1) - 1] || 'Mes';
    if (titleEl) {
        titleEl.textContent = `${day.dayOfWeekName || ''} ${day.day} de ${mName} de ${CalendarState.year || ''}`;
    }
    if (subTitleEl) {
        subTitleEl.textContent = `Fecha institucional: ${day.date} — Desglose completo de asistencia, novedades y suplencias.`;
    }

    const isWeekend = (day.dayOfWeek === 0 || day.dayOfWeek === 6 || day.isWeekend);

    if (badgeEl) {
        badgeEl.classList.remove('hidden');
        if (day.isHoliday) {
            badgeEl.className = 'px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300';
            badgeEl.textContent = 'Feriado Oficial';
        } else if (day.isInstitutionalDay) {
            badgeEl.className = 'px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-100 text-purple-800 dark:bg-purple-950/70 dark:text-purple-300';
            badgeEl.textContent = 'Jornada Institucional';
        } else if (isWeekend) {
            badgeEl.className = 'px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-200 text-slate-700 dark:bg-zinc-800 dark:text-zinc-300';
            badgeEl.textContent = 'Fin de Semana';
        } else {
            badgeEl.className = 'px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300';
            badgeEl.textContent = 'Día Hábil Escolar';
        }
    }

    if (bannerEl) {
        if (day.isHoliday) {
            bannerEl.innerHTML = `
                <div class="p-3.5 bg-amber-50 dark:bg-amber-950/40 rounded-xl border border-amber-300 dark:border-amber-800/80 text-amber-900 dark:text-amber-200 flex items-center space-x-3">
                    <span class="text-2xl">🎉</span>
                    <div>
                        <h4 class="font-bold text-xs uppercase tracking-wider">Feriado Oficial Nacional / Provincial</h4>
                        <p class="text-xs font-semibold">${escapeHtml(day.holidayName || 'Feriado Oficial')}</p>
                    </div>
                </div>
            `;
            bannerEl.classList.remove('hidden');
        } else if (day.isInstitutionalDay) {
            bannerEl.innerHTML = `
                <div class="p-3.5 bg-purple-50 dark:bg-purple-950/40 rounded-xl border border-purple-300 dark:border-purple-800/80 text-purple-900 dark:text-purple-200 flex items-center space-x-3">
                    <span class="text-2xl">🏛️</span>
                    <div>
                        <h4 class="font-bold text-xs uppercase tracking-wider">Jornada Institucional Sin Actividad Áulica</h4>
                        <p class="text-xs font-semibold">${escapeHtml(day.institutionalName || 'Jornada Institucional')}</p>
                    </div>
                </div>
            `;
            bannerEl.classList.remove('hidden');
        } else {
            bannerEl.classList.add('hidden');
            bannerEl.innerHTML = '';
        }
    }

    const presentList = day.presentTeachers || [];
    const licList = (day.leaves || []).filter(l => l.status === 'LIC' || l.status === 'P' || l.status === 'LT');
    let absList = (day.leaves || []).filter(l => l.status === 'I');
    if (absList.length === 0 && Array.isArray(day.records)) {
        absList = day.records.filter(r => r.status === 'I');
    }
    const subsList = day.substitutions || [];

    const prCount = presentList.length > 0 ? presentList.length : (day.stats?.PR ?? (isWeekend || day.isNonWorking ? 0 : 8));
    const licCount = licList.length;
    const absCount = absList.length;
    const subCount = subsList.length;

    const kpiPr = document.getElementById('cal-modal-kpi-pr');
    const kpiLic = document.getElementById('cal-modal-kpi-lic');
    const kpiAbs = document.getElementById('cal-modal-kpi-abs');
    const kpiSub = document.getElementById('cal-modal-kpi-sub');
    if (kpiPr) kpiPr.textContent = prCount;
    if (kpiLic) kpiLic.textContent = licCount;
    if (kpiAbs) kpiAbs.textContent = absCount;
    if (kpiSub) kpiSub.textContent = subCount;

    const badgeSubs = document.getElementById('cal-modal-badge-subs-count');
    const badgeLic = document.getElementById('cal-modal-badge-lic-count');
    const badgeAbs = document.getElementById('cal-modal-badge-abs-count');
    const badgePr = document.getElementById('cal-modal-badge-pr-count');
    if (badgeSubs) badgeSubs.textContent = subCount;
    if (badgeLic) badgeLic.textContent = licCount;
    if (badgeAbs) badgeAbs.textContent = absCount;
    if (badgePr) badgePr.textContent = prCount;

    const subsContainer = document.getElementById('cal-modal-subs-content');
    if (subsContainer) {
        if (subsList.length === 0) {
            subsContainer.innerHTML = `
                <div class="p-3.5 bg-slate-50 dark:bg-zinc-800/40 text-center text-slate-400 dark:text-zinc-500 italic text-xs">
                    No se registran suplencias activas para esta jornada.
                </div>
            `;
        } else {
            subsContainer.innerHTML = `
                <table class="w-full border-collapse text-left text-xs">
                    <thead class="bg-slate-100 dark:bg-zinc-800/80 text-slate-700 dark:text-zinc-300 font-bold border-b border-slate-200 dark:border-zinc-700">
                        <tr>
                            <th class="py-2 px-3">ESPACIO / CÁTEDRA</th>
                            <th class="py-2 px-3">TITULAR REEMPLAZADO</th>
                            <th class="py-2 px-3">SUPLENTE DESIGNADO</th>
                            <th class="py-2 px-3">MOTIVO / ARTÍCULO</th>
                            <th class="py-2 px-3 text-center">RESOLUCIÓN</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100 dark:divide-zinc-800 bg-white dark:bg-zinc-800/30">
                        ${subsList.map(s => `
                            <tr class="hover:bg-slate-50 dark:hover:bg-zinc-800/60">
                                <td class="py-2 px-3 font-bold text-slate-900 dark:text-zinc-100">${escapeHtml(s.subjectName || 'Cátedra')}</td>
                                <td class="py-2 px-3 text-slate-700 dark:text-zinc-300">
                                    <span class="font-bold">${escapeHtml(s.titularName || s.titularLastName || 'Docente')}</span>
                                    <span class="text-[10px] text-slate-400 ml-1">(Leg. ${escapeHtml(s.titularLegajo || 'S/L')})</span>
                                </td>
                                <td class="py-2 px-3 text-blue-700 dark:text-blue-300 font-bold">
                                    <span>${escapeHtml(s.suplenteName || s.suplenteLastName || 'Suplente')}</span>
                                    <span class="text-[10px] text-slate-400 ml-1">(Leg. ${escapeHtml(s.suplenteLegajo || 'S/L')})</span>
                                </td>
                                <td class="py-2 px-3 text-slate-600 dark:text-zinc-400">${escapeHtml(s.reason || 'Licencia')}</td>
                                <td class="py-2 px-3 text-center font-mono font-bold text-slate-700 dark:text-zinc-300">${escapeHtml(s.resolution || '—')}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
        }
    }

    const licContainer = document.getElementById('cal-modal-lic-content');
    if (licContainer) {
        if (licList.length === 0) {
            licContainer.innerHTML = `
                <div class="p-3.5 bg-slate-50 dark:bg-zinc-800/40 text-center text-slate-400 dark:text-zinc-500 italic text-xs">
                    Sin licencias ni permisos registrados en la jornada.
                </div>
            `;
        } else {
            licContainer.innerHTML = `
                <table class="w-full border-collapse text-left text-xs">
                    <thead class="bg-slate-100 dark:bg-zinc-800/80 text-slate-700 dark:text-zinc-300 font-bold border-b border-slate-200 dark:border-zinc-700">
                        <tr>
                            <th class="w-20 text-center py-2 px-3">LEGAJO</th>
                            <th class="py-2 px-3">DOCENTE</th>
                            <th class="py-2 px-3">TIPO / ARTÍCULO</th>
                            <th class="w-20 text-center py-2 px-3">HORAS</th>
                            <th class="py-2 px-3">OBSERVACIONES / CERTIFICADO</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100 dark:divide-zinc-800 bg-white dark:bg-zinc-800/30">
                        ${licList.map(l => `
                            <tr class="hover:bg-slate-50 dark:hover:bg-zinc-800/60">
                                <td class="py-2 px-3 text-center font-mono font-bold text-slate-600 dark:text-zinc-400">${escapeHtml(l.legajo || 'S/L')}</td>
                                <td class="py-2 px-3 font-bold text-slate-900 dark:text-zinc-100">${escapeHtml(l.fullName || l.teacherName || 'Docente')}</td>
                                <td class="py-2 px-3 text-amber-700 dark:text-amber-400 font-bold">${escapeHtml(l.statusLabel || l.status || 'Licencia')}</td>
                                <td class="py-2 px-3 text-center font-bold text-slate-700 dark:text-zinc-300">${l.hours || 4} hs</td>
                                <td class="py-2 px-3 text-slate-600 dark:text-zinc-400">${escapeHtml(l.observations || '—')}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
        }
    }

    const absContainer = document.getElementById('cal-modal-abs-content');
    if (absContainer) {
        if (absList.length === 0) {
            absContainer.innerHTML = `
                <div class="p-3.5 bg-slate-50 dark:bg-zinc-800/40 text-center text-slate-400 dark:text-zinc-500 italic text-xs">
                    Sin inasistencias registradas para esta jornada.
                </div>
            `;
        } else {
            absContainer.innerHTML = `
                <table class="w-full border-collapse text-left text-xs">
                    <thead class="bg-slate-100 dark:bg-zinc-800/80 text-slate-700 dark:text-zinc-300 font-bold border-b border-slate-200 dark:border-zinc-700">
                        <tr>
                            <th class="w-20 text-center py-2 px-3">LEGAJO</th>
                            <th class="py-2 px-3">DOCENTE</th>
                            <th class="w-20 text-center py-2 px-3">HORAS</th>
                            <th class="w-28 text-center py-2 px-3">ESTADO</th>
                            <th class="py-2 px-3">DETALLE</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100 dark:divide-zinc-800 bg-white dark:bg-zinc-800/30">
                        ${absList.map(a => `
                            <tr class="hover:bg-slate-50 dark:hover:bg-zinc-800/60">
                                <td class="py-2 px-3 text-center font-mono font-bold text-slate-600 dark:text-zinc-400">${escapeHtml(a.legajo || 'S/L')}</td>
                                <td class="py-2 px-3 font-bold text-slate-900 dark:text-zinc-100">${escapeHtml(a.fullName || a.teacherName || 'Docente')}</td>
                                <td class="py-2 px-3 text-center font-bold text-slate-700 dark:text-zinc-300">${a.hours || 4} hs</td>
                                <td class="py-2 px-3 text-center">
                                    <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700 dark:bg-rose-950/70 dark:text-rose-300">
                                        I - Inasistencia
                                    </span>
                                </td>
                                <td class="py-2 px-3 text-slate-600 dark:text-zinc-400">${escapeHtml(a.observations || 'Sin justificar')}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
        }
    }

    const prContainer = document.getElementById('cal-modal-pr-content');
    if (prContainer) {
        if (presentList.length === 0) {
            prContainer.innerHTML = `
                <div class="p-3.5 bg-slate-50 dark:bg-zinc-800/40 text-center text-slate-400 dark:text-zinc-500 italic text-xs">
                    ${isWeekend || day.isNonWorking ? 'Día no laborable / Sin actividad presencial institucional.' : 'No se registraron docentes presentes para este día.'}
                </div>
            `;
        } else {
            prContainer.innerHTML = `
                <table class="w-full border-collapse text-left text-xs">
                    <thead class="sticky top-0 bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 font-bold border-b border-slate-200 dark:border-zinc-700">
                        <tr>
                            <th class="w-20 text-center py-2 px-3">LEGAJO</th>
                            <th class="py-2 px-3">DOCENTE (APELLIDO Y NOMBRES)</th>
                            <th class="w-28 text-center py-2 px-3">DNI</th>
                            <th class="w-28 text-center py-2 px-3">REVISTA</th>
                            <th class="w-20 text-center py-2 px-3">HORAS</th>
                            <th class="w-20 text-center py-2 px-3">ESTADO</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100 dark:divide-zinc-800 bg-white dark:bg-zinc-800/30">
                        ${presentList.map(p => `
                            <tr class="hover:bg-slate-50 dark:hover:bg-zinc-800/60">
                                <td class="py-2 px-3 text-center font-mono font-bold text-slate-600 dark:text-zinc-400">${escapeHtml(p.legajo || 'S/L')}</td>
                                <td class="py-2 px-3 font-bold text-slate-900 dark:text-zinc-100">${escapeHtml(p.fullName || `${p.lastName}, ${p.firstName}`)}</td>
                                <td class="py-2 px-3 text-center font-mono text-slate-600 dark:text-zinc-400">${escapeHtml(p.dni || '—')}</td>
                                <td class="py-2 px-3 text-center text-slate-700 dark:text-zinc-300">${escapeHtml(p.revista || 'Titular')}</td>
                                <td class="py-2 px-3 text-center font-bold text-slate-700 dark:text-zinc-300">${p.hours || 4} hs</td>
                                <td class="py-2 px-3 text-center">
                                    <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300">
                                        PR
                                    </span>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
        }
    }

    modal.classList.remove('hidden');
    initLucideIcons();
}

function closeDayDetailModal() {
    const modal = document.getElementById('cal-day-modal');
    if (modal) modal.classList.add('hidden');
}

function renderCalendarSheetView(matrixData) {
    const thead = document.getElementById('thead-cal-month-matrix');
    const tbody = document.getElementById('tbody-cal-month-matrix');
    if (!thead || !tbody) return;

    const daysCount = matrixData.daysInMonth;

    let headerDays = '';
    for (let i = 1; i <= daysCount; i++) {
        headerDays += `<th class="w-8 text-center text-[10px] px-1">${i}</th>`;
    }

    thead.innerHTML = `
        <tr>
            <th class="w-20 text-center sticky left-0 z-20 bg-slate-100 dark:bg-zinc-800">LEGAJO</th>
            <th class="w-56 sticky left-20 z-20 bg-slate-100 dark:bg-zinc-800">DOCENTE</th>
            <th class="w-24 text-center">REVISTA</th>
            ${headerDays}
            <th class="w-12 text-center bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 font-bold">PR</th>
            <th class="w-12 text-center bg-rose-50 dark:bg-rose-950/40 text-rose-600 font-bold">I</th>
            <th class="w-12 text-center bg-amber-50 dark:bg-amber-950/40 text-amber-600 font-bold">LIC</th>
        </tr>
    `;

    const teachers = matrixData.teachersMatrix || [];
    if (teachers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${daysCount + 6}" class="py-10 text-center text-slate-400 dark:text-zinc-500 italic">No hay docentes registrados en la planta institucional.</td></tr>`;
        return;
    }

    tbody.innerHTML = teachers.map(t => {
        let daysCells = '';
        for (let d = 1; d <= daysCount; d++) {
            const rawSt = t.days[d] || null;
            const st = (typeof rawSt === 'object' && rawSt !== null) ? rawSt.status : rawSt;
            const dayMeta = matrixData.days[d - 1] || {};

            let cellContent = '·';
            let cellClass = 'text-slate-300 dark:text-zinc-600';

            if (dayMeta.isHoliday) {
                cellContent = 'F';
                cellClass = 'bg-amber-100/50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 font-bold';
            } else if (dayMeta.isInstitutionalDay) {
                cellContent = 'J';
                cellClass = 'bg-purple-100/50 dark:bg-purple-950/30 text-purple-600 dark:text-purple-400 font-bold';
            } else if (dayMeta.dayOfWeekName === 'Sábado' || dayMeta.dayOfWeekName === 'Domingo') {
                cellContent = '-';
                cellClass = 'bg-slate-100/50 dark:bg-zinc-900/50 text-slate-400';
            } else if (st === 'PR') {
                cellContent = 'P';
                cellClass = 'text-emerald-600 dark:text-emerald-400 font-bold';
            } else if (st === 'I') {
                cellContent = 'I';
                cellClass = 'bg-rose-100 dark:bg-rose-950/70 text-rose-600 dark:text-rose-400 font-black';
            } else if (st === 'LIC') {
                cellContent = 'L';
                cellClass = 'bg-amber-100 dark:bg-amber-950/70 text-amber-600 dark:text-amber-400 font-bold';
            } else if (st === 'P') {
                cellContent = 'P115';
                cellClass = 'bg-blue-100 dark:bg-blue-950/70 text-blue-600 dark:text-blue-400 font-bold text-[9px]';
            } else if (st === 'LT') {
                cellContent = 'LT';
                cellClass = 'bg-purple-100 dark:bg-purple-950/70 text-purple-600 dark:text-purple-400 font-bold text-[9px]';
            }

            daysCells += `<td class="text-center text-[10px] py-1.5 px-0.5 ${cellClass}">${cellContent}</td>`;
        }

        return `
            <tr class="hover:bg-slate-50 dark:hover:bg-zinc-800/40 transition">
                <td class="py-2 px-2 text-center font-bold text-slate-700 dark:text-zinc-300 sticky left-0 bg-white dark:bg-[#282828] z-10">${escapeHtml(t.legajo || 'S/L')}</td>
                <td class="py-2 px-2 font-bold text-slate-900 dark:text-zinc-100 sticky left-20 bg-white dark:bg-[#282828] z-10 truncate max-w-[200px]">${escapeHtml(t.fullName)}</td>
                <td class="py-2 px-2 text-center text-[11px] text-slate-500 dark:text-zinc-400">${escapeHtml(t.revista || 'Titular')}</td>
                ${daysCells}
                <td class="py-2 px-1 text-center font-bold text-emerald-600 dark:text-emerald-400">${t.totals.PR}</td>
                <td class="py-2 px-1 text-center font-bold text-rose-600 dark:text-rose-400">${t.totals.I}</td>
                <td class="py-2 px-1 text-center font-bold text-amber-600 dark:text-amber-400">${t.totals.LIC + t.totals.P + t.totals.LT}</td>
            </tr>
        `;
    }).join('');
}

function openInstitutionalDayModal(defaultDate = null) {
    const dStr = defaultDate || `${CalendarState.year}-${String(CalendarState.month).padStart(2, '0')}-01`;
    const modalHtml = `
        <div class="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-zinc-800">
            <div class="flex items-center space-x-2">
                <div class="w-8 h-8 rounded-lg bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-400 flex items-center justify-center border border-purple-200 dark:border-purple-800">
                    <i data-lucide="award" class="w-4 h-4"></i>
                </div>
                <div>
                    <h3 class="text-sm font-bold text-slate-800 dark:text-zinc-100">Configurar Jornada Institucional Sin Clases</h3>
                    <p class="text-xs text-slate-500 dark:text-zinc-400">Declara una fecha institucional exenta de inasistencias.</p>
                </div>
            </div>
            <button type="button" id="btn-close-inst-modal" class="text-slate-400 hover:text-slate-600 font-bold p-1">✕</button>
        </div>

        <form id="form-inst-day" class="mt-4 space-y-4">
            <div>
                <label class="block text-xs font-bold text-slate-700 dark:text-zinc-300 uppercase mb-1">Fecha de la Jornada <span class="text-rose-500">*</span></label>
                <input type="date" id="inst-day-date" required value="${dStr}"
                    class="w-full px-3 py-2 text-xs border border-slate-200 dark:border-zinc-700 dark:bg-[#202020] dark:text-zinc-100 rounded-lg font-bold focus:outline-none focus:ring-2 focus:ring-gold">
            </div>

            <div>
                <label class="block text-xs font-bold text-slate-700 dark:text-zinc-300 uppercase mb-1">Nombre / Denominación Oficial <span class="text-rose-500">*</span></label>
                <input type="text" id="inst-day-name" required placeholder="Ej. Jornada Pedagógica Institucional / Jornada EMI"
                    class="w-full px-3 py-2 text-xs border border-slate-200 dark:border-zinc-700 dark:bg-[#202020] dark:text-zinc-100 rounded-lg font-bold focus:outline-none focus:ring-2 focus:ring-gold">
            </div>

            <div>
                <label class="block text-xs font-bold text-slate-700 dark:text-zinc-300 uppercase mb-1">Tipo de Actividad</label>
                <select id="inst-day-type" class="w-full px-3 py-2 text-xs border border-slate-200 dark:border-zinc-700 dark:bg-[#202020] dark:text-zinc-100 rounded-lg font-bold focus:outline-none focus:ring-2 focus:ring-gold">
                    <option value="jornada">Jornada Institucional Docente (Sin Alumnos)</option>
                    <option value="receso">Receso Institucional Extraordinario</option>
                    <option value="conmemoracion">Acto / Conmemoración Especial</option>
                </select>
            </div>

            <div id="inst-day-error" class="hidden p-2.5 rounded-lg bg-rose-50 text-rose-700 text-xs font-medium border border-rose-200"></div>

            <div class="flex items-center justify-end space-x-3 pt-3 border-t border-slate-100 dark:border-zinc-800">
                <button type="button" id="btn-cancel-inst" class="px-4 py-2 text-xs font-bold text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg transition">
                    Cancelar
                </button>
                <button type="submit" class="btn-gold px-4 py-2 text-xs font-bold flex items-center space-x-1.5 shadow-sm">
                    <i data-lucide="check" class="w-4 h-4"></i>
                    <span>Guardar Jornada</span>
                </button>
            </div>
        </form>
    `;

    openModal(modalHtml, () => {
        const btnClose = document.getElementById('btn-close-inst-modal');
        const btnCancel = document.getElementById('btn-cancel-inst');
        const form = document.getElementById('form-inst-day');
        const errDiv = document.getElementById('inst-day-error');

        if (btnClose) btnClose.addEventListener('click', closeModal);
        if (btnCancel) btnCancel.addEventListener('click', closeModal);

        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                errDiv.classList.add('hidden');
                const date = document.getElementById('inst-day-date').value;
                const name = document.getElementById('inst-day-name').value.trim();
                const type = document.getElementById('inst-day-type').value;

                if (!date || !name) {
                    errDiv.textContent = 'Debe ingresar la fecha y el nombre de la jornada.';
                    errDiv.classList.remove('hidden');
                    return;
                }

                try {
                    const res = await window.sigetApi.calendar.saveInstitutionalDay({
                        date,
                        name,
                        type,
                        username: AppState.currentUser?.username || 'Bedelía'
                    });
                    if (res && res.success) {
                        showToast(`Jornada institucional "${name}" guardada con éxito.`, 'success');
                        closeModal();
                        await loadInteractiveCalendar();
                        if (typeof checkCalendarNotice === 'function') {
                            await checkCalendarNotice(AppState.attendanceDate);
                        }
                    } else {
                        errDiv.textContent = (res && res.message) || 'Error al guardar jornada institucional.';
                        errDiv.classList.remove('hidden');
                    }
                } catch (err) {
                    console.error('Error guardando jornada institucional:', err);
                    errDiv.textContent = 'Error: ' + err.message;
                    errDiv.classList.remove('hidden');
                }
            });
        }
    });
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
            tbody.innerHTML = `<tr><td colspan="5" class="py-8 text-center text-xs text-slate-400 italic">Seleccione un docente institucional para visualizar su cronograma y ficha oficial.</td></tr>`;
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

        document.getElementById('cal-stat-i-text').textContent = `${m.inasistencias.count} / ${m.inasistencias.limit}`;
        const iBar = document.getElementById('cal-stat-i-bar');
        if (iBar) {
            iBar.style.width = `${m.inasistencias.percentage}%`;
            iBar.className = m.inasistencias.isDanger ? 'h-full bg-rose-600 rounded-full' : (m.inasistencias.isWarning ? 'h-full bg-amber-500 rounded-full' : 'h-full bg-emerald-500 rounded-full');
        }

        document.getElementById('cal-stat-p-text').textContent = `${m.permisos.count} / ${m.permisos.limit}`;
        const pBar = document.getElementById('cal-stat-p-bar');
        if (pBar) {
            pBar.style.width = `${m.permisos.percentage}%`;
            pBar.className = m.permisos.isDanger ? 'h-full bg-rose-600 rounded-full' : (m.permisos.isWarning ? 'h-full bg-amber-500 rounded-full' : 'h-full bg-amber-500 rounded-full');
        }

        document.getElementById('cal-stat-lic-text').textContent = `${m.licenciasMedicas.count} / ${m.licenciasMedicas.limit} días`;
        const licBar = document.getElementById('cal-stat-lic-bar');
        if (licBar) {
            licBar.style.width = `${m.licenciasMedicas.percentage}%`;
            licBar.className = m.licenciasMedicas.isDanger ? 'h-full bg-rose-600 rounded-full' : (m.licenciasMedicas.isWarning ? 'h-full bg-amber-500 rounded-full' : 'h-full bg-purple-500 rounded-full');
        }

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

async function handleExportTeacherPdf() {
    const sel = document.getElementById('calendar-teacher-select');
    if (!sel || !sel.value) {
        showToast('Seleccione un docente institucional para exportar su Ficha en PDF.', 'warning');
        return;
    }
    const teacherId = parseInt(sel.value, 10);
    const startDate = document.getElementById('calendar-start-date')?.value || null;
    const endDate = document.getElementById('calendar-end-date')?.value || null;

    try {
        let outputPath = null;
        if (window.sigetApi && window.sigetApi.dialog && window.sigetApi.dialog.showSaveDialog) {
            const optText = sel.options[sel.selectedIndex]?.text || 'Docente';
            const safeName = optText.split('(')[0].trim().replace(/[^a-zA-Z0-9_-]/g, '_');
            const defaultName = `Ficha_Docente_${safeName}_${startDate || 'INI'}_${endDate || 'FIN'}.pdf`;
            const saveRes = await window.sigetApi.dialog.showSaveDialog({
                title: 'Guardar Ficha Docente Oficial (PDF)',
                defaultPath: defaultName,
                filters: [{ name: 'Documento PDF (*.pdf)', extensions: ['pdf'] }]
            });
            if (saveRes.canceled || !saveRes.filePath) return;
            outputPath = saveRes.filePath;
        }

        showToast('Generando Ficha Docente oficial en PDF...', 'info');
        const res = await window.sigetApi.calendar.exportTeacherPdf({
            teacherId,
            startDate,
            endDate,
            outputPath
        });

        if (res && res.success) {
            showToast(`Ficha Docente PDF generada: ${res.fileName}`, 'success');

            if (res.base64 && !outputPath) {
                triggerBrowserDownloadFromBase64(res.base64, res.fileName, 'application/pdf');
            }

            if (window.sigetApi && window.sigetApi.reports && typeof window.sigetApi.reports.openFile === 'function') {
                await window.sigetApi.reports.openFile(res.filePath);
            }
        } else {
            showToast((res && res.message) || 'Error al generar la Ficha Docente en PDF.', 'error');
        }
    } catch (err) {
        console.error('Error al exportar Ficha Docente a PDF:', err);
        showToast('Error al exportar Ficha Docente a PDF: ' + err.message, 'error');
    }
}

async function handleExportTeacherExcel() {
    const sel = document.getElementById('calendar-teacher-select');
    if (!sel || !sel.value) {
        showToast('Seleccione un docente institucional para exportar su Ficha en Excel.', 'warning');
        return;
    }
    const teacherId = parseInt(sel.value, 10);
    const startDate = document.getElementById('calendar-start-date')?.value || null;
    const endDate = document.getElementById('calendar-end-date')?.value || null;

    try {
        let outputPath = null;
        if (window.sigetApi && window.sigetApi.dialog && window.sigetApi.dialog.showSaveDialog) {
            const optText = sel.options[sel.selectedIndex]?.text || 'Docente';
            const safeName = optText.split('(')[0].trim().replace(/[^a-zA-Z0-9_-]/g, '_');
            const defaultName = `Ficha_Docente_${safeName}_${startDate || 'INI'}_${endDate || 'FIN'}.xlsx`;
            const saveRes = await window.sigetApi.dialog.showSaveDialog({
                title: 'Guardar Ficha Docente Oficial (Excel)',
                defaultPath: defaultName,
                filters: [{ name: 'Libro de Excel (*.xlsx)', extensions: ['xlsx'] }]
            });
            if (saveRes.canceled || !saveRes.filePath) return;
            outputPath = saveRes.filePath;
        }

        showToast('Generando Ficha Docente oficial en Excel...', 'info');
        const res = await window.sigetApi.calendar.exportTeacherExcel({
            teacherId,
            startDate,
            endDate,
            outputPath
        });

        if (res && res.success) {
            showToast(`Ficha Docente Excel generada: ${res.fileName}`, 'success');

            if (res.base64 && !outputPath) {
                triggerBrowserDownloadFromBase64(
                    res.base64,
                    res.fileName,
                    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                );
            }

            if (window.sigetApi && window.sigetApi.reports && typeof window.sigetApi.reports.openFile === 'function') {
                await window.sigetApi.reports.openFile(res.filePath);
            }
        } else {
            showToast((res && res.message) || 'Error al generar la Ficha Docente en Excel.', 'error');
        }
    } catch (err) {
        console.error('Error al exportar Ficha Docente a Excel:', err);
        showToast('Error al exportar Ficha Docente a Excel: ' + err.message, 'error');
    }
}

window.initTeacherCalendar = initTeacherCalendar;
window.loadTeacherCalendar = loadTeacherCalendar;
window.handleExportTeacherPdf = handleExportTeacherPdf;
window.handleExportTeacherExcel = handleExportTeacherExcel;
window.loadInteractiveCalendar = loadInteractiveCalendar;
window.switchCalendarView = switchCalendarView;

AppState.csvExplicitMode = 'auto';
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

        document.getElementById('csv-stat-total').textContent = res.totalRows || 0;
        document.getElementById('csv-stat-valid').textContent = res.validRows || 0;
        document.getElementById('csv-stat-invalid').textContent = res.invalidRows || 0;

        const existingCount = (res.preview || []).filter(p => p.existsInDb).length;
        document.getElementById('csv-stat-existing').textContent = existingCount;

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
