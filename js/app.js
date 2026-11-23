/**
 * Modul Pengendali Utama UI Focura — Ruang Fokus
 * Menghubungkan Autentikasi Landscape, Dashboard Siswa, Timer Latihan Fokus,
 * Materi belajar, Konsultasi Google Form, RPL Klasikal, dan Ruang Admin Guru BK.
 */

import { APP_CONFIG } from "./config.js";
import { api, getActiveSession, loginUser, logoutUser } from "./auth.js";
import { getStudentData, loadStudentData, loadStudentModules, updateStudentData, useStudentPreview } from "./storage.js";
import { exportStudentWorkbook, importReportText, importStudentWorkbook } from "./excel-sync.js";
import { setupFocusTimer } from "./focus-timer.js";
import { syncDropdown } from "./dropdowns.js";
import { JAKARTA } from "./learning-rules.js";
import { setupMonitor } from "./monitor.js";
import { confirmDialog, escapeHtml, openModuleModal, setFeedback, setupMobileMenu, showToast } from "./ui.js";
import { pagePath, WORKSPACES } from "./workspaces.js";

export async function initializeApp() {
  const button = document.getElementById("btn-google-login");
  const buttonLabel = document.getElementById("auth-button-label");
  const register = document.getElementById("btn-teacher-register");
  const registerLabel = register.textContent;
  const { demo: demoFlag, workspace, section } = document.getElementById("focura").dataset;
  const demo = demoFlag === "true";
  const demoAccount = document.getElementById("demo-account");
  const authView = document.getElementById("auth-view");
  const loading = document.getElementById("workspace-loading");
  const loginLabel = () => !demo ? "Masuk dengan Google" : demoAccount.value === "admin" ? "Masuk sebagai Admin Demo" : "Masuk ke Demo";
  function showLogin() {
    loading?.remove();
    document.getElementById("admin-app-view")?.classList.add("hidden");
    authView.classList.remove("hidden");
    authView.classList.add("is-visible");
    buttonLabel.textContent = loginLabel();
    register.textContent = registerLabel;
    button.disabled = false;
    register.disabled = false;
    demoAccount.disabled = false;
  }
  if (demo) {
    document.getElementById("auth-help").textContent = "Mode demo menggunakan data contoh.";
    document.getElementById("demo-account-choice").classList.remove("hidden");
    if (workspace === "bk") {
      demoAccount.value = "bk";
      syncDropdown(demoAccount);
    }
    demoAccount.onchange = () => { buttonLabel.textContent = loginLabel(); };
  } else {
    document.getElementById("teacher-registration").classList.remove("hidden");
  }
  async function connect(registering = false) {
    button.disabled = true;
    register.disabled = true;
    demoAccount.disabled = true;
    (registering ? register : buttonLabel).textContent = "Menghubungkan…";
    showAuthAlert("");
    document.getElementById("auth-status").textContent = "";
    try {
      const demoHome = { admin: "/admin", bk: "/bk", student: "/", "student-other": "/" };
      const destination = registering ? "/?daftar=guru-bk" : workspace ? pagePath(workspace, section) + window.location.search
        : demo ? demoHome[demoAccount.value] : "/";
      await loginUser(demo ? "demo" : "google", destination,
        demo ? { demoAccount: demoAccount.value } : undefined);
    } catch {
      showAuthAlert(registering ? "Pendaftaran gagal dimulai. Silakan coba lagi." : "Login gagal dimulai. Silakan coba lagi.");
      showLogin();
    }
  }
  button.onclick = () => connect();
  register.onclick = () => connect(true);

  try {
    const user = await getActiveSession();
    if (!button.isConnected) return;
    if (!user) {
      showLogin();
      const query = new URLSearchParams(window.location.search);
      const error = query.get("error");
      if (error) showAuthAlert({
        AccessDenied: "Email ini belum diizinkan. Hubungi Admin Central.",
        AccessIncomplete: "Peran atau penugasan akun belum lengkap. Hubungi Admin Central.",
        SessionExpired: "Sesi telah berakhir. Masuk kembali untuk melanjutkan.",
        RegistrationDenied: "Pendaftaran Guru BK tidak dapat diproses. Periksa akun Google atau hubungi Admin Central.",
        ServiceUnavailable: "Layanan akun sementara tidak tersedia. Silakan coba lagi.",
      }[error] || "Login tidak dapat diselesaikan. Silakan coba lagi.");
      if (query.get("pendaftaran") === "tertunda") {
        document.getElementById("auth-status").textContent = "Pendaftaran Guru BK menunggu persetujuan Admin Central. Masuk kembali setelah akun diaktifkan.";
      } else if (query.get("pendaftaran") === "akun-ada") {
        document.getElementById("auth-status").textContent = "Akun ini sudah terdaftar. Gunakan Masuk dengan Google atau hubungi Admin Central jika perlu bantuan.";
      }
      return;
    }
    const userWorkspace = Object.keys(WORKSPACES).find((name) => WORKSPACES[name].role === user.role);
    const studentPreview = user.role === "admin" && workspace === "admin" && section === "pratinjau-siswa";
    if (workspace !== userWorkspace && !(user.role === "admin" && workspace === "bk")) {
      window.location.replace(userWorkspace ? pagePath(userWorkspace) : "/");
      return;
    }
    if (user.role === "student" || studentPreview) {
      useStudentPreview(studentPreview);
      user.kelas = await loadStudentData();
      if (!button.isConnected) return;
      renderStudentDashboard(user, studentPreview);
      document.getElementById("student-app-view").classList.remove("hidden");
      loading?.remove();
    } else if (user.role === "guardian") {
      const children = await api("guardian/children");
      if (!button.isConnected) return;
      const container = document.getElementById("guardian-children");
      container.innerHTML = children.length ? children.map((child) =>
        `<article class="card guardian-card">
          <span class="icon-tile" aria-hidden="true"><svg><use href="/assets/svg/interface.svg#user" /></svg></span>
          <h2>${escapeHtml(child.fullName)}</h2><p>${escapeHtml(child.school)} · ${escapeHtml(child.kelas)}</p>
        </article>`
      ).join("") : '<p class="workspace-empty">Belum ada akun anak yang ditautkan. Hubungi Admin Central untuk menautkan akun.</p>';
      document.getElementById("btn-guardian-logout").onclick = leave;
      loading?.remove();
      document.getElementById("guardian-app-view").classList.remove("hidden");
    } else {
      document.getElementById("btn-admin-logout").onclick = leave;
      authView.classList.add("hidden");
      loading?.remove();
      document.getElementById("admin-app-view").classList.remove("hidden");
      await setupMonitor(user, workspace, section, renderRPLSection);
    }
    authView.classList.add("hidden");
  } catch (error) {
    if (!button.isConnected || error?.redirecting) return;
    showLogin();
    showAuthAlert(error.message);
  }
}

function leave() {
  logoutUser().catch((error) => {
    if (!error?.redirecting) showToast(error.message, "error");
  });
}

function showAuthAlert(message) {
  document.getElementById("auth-alert").textContent = message;
}

async function saveLearning(action, values) {
  try {
    const data = await updateStudentData(action, values);
    refreshStudentPanels();
    return data;
  } catch (error) {
    if (error?.redirecting) return false;
    refreshStudentPanels();
    showToast(error.message, "error");
    return false;
  }
}

/* ==========================================================================
   DASHBOARD SISWA (TERISOLASI PER AKUN)
   ========================================================================== */
const STUDENT_SECTIONS = new Set(["beranda", "materi", "hambatan", "tugas", "fokus", "refleksi", "progres", "konsultasi", "rpl"]);
let focusTimerControl;
let studentViewListeners;
let activeEditTaskId = null;

function sectionFromHash() {
  const id = window.location.hash.replace(/^#/, "").trim();
  return STUDENT_SECTIONS.has(id) ? id : "beranda";
}

function renderStudentDashboard(user, preview) {
  const studentView = document.getElementById("student-app-view");
  studentViewListeners?.abort();
  studentViewListeners = new AbortController();
  const { signal } = studentViewListeners;

  document.getElementById("student-greeting").textContent = preview ? "Pratinjau Ruang Siswa" : `Halo, ${user.fullName}!`;
  document.getElementById("student-meta").textContent = preview
    ? "Aktivitas di halaman ini disimpan sebagai data uji milik Admin Central."
    : `NIS: ${user.nis || "—"} • ${user.kelas}`;
  document.getElementById("student-preview-exit").hidden = !preview;
  document.getElementById("student-account-info").textContent = `${user.email} · ${user.kelas} · Ruang pribadi aktif`;

  // Navigasi Menu Siswa
  const menuToggle = document.getElementById("student-menu-toggle");
  setupMobileMenu(menuToggle);
  document.querySelectorAll("#student-nav .nav-item").forEach((btn) => {
    btn.onclick = () => {
      switchStudentSection(btn.dataset.section);
      if (menuToggle.offsetWidth) menuToggle.focus();
    };
  });
  studentView.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-open-section]");
    if (!btn) return;
    const section = btn.dataset.openSection;
    switchStudentSection(section);
    const heading = document.getElementById("sec-" + section)?.querySelector("h2");
    if (heading) {
      heading.tabIndex = -1;
      heading.focus();
    }
  }, { signal });
  const syncFromHistory = () => {
    if (!studentView.isConnected) return;
    const section = sectionFromHash();
    if (document.getElementById(`sec-${section}`).classList.contains("hidden")) {
      switchStudentSection(section, { syncHash: false });
    }
  };
  window.addEventListener("hashchange", syncFromHistory, { signal });
  window.addEventListener("popstate", syncFromHistory, { signal });

  document.getElementById("student-consultation-link").href = APP_CONFIG.consultationFormUrl;
  document.getElementById("btn-student-logout").onclick = leave;
  document.getElementById("btn-export-student-xlsx").onclick = () => {
    try {
      exportStudentWorkbook(user, getStudentData());
      showToast("File Excel progres belajar berhasil diunduh.", "success");
    } catch (error) {
      showToast(error.message, "error");
    }
  };
  setupStudentImport();
  renderRPLSection("student-rpl-container");
  setupTaskManager();
  setupBarriersChecklist();
  setupReflectionForm();
  refreshStudentPanels();
  switchStudentSection(sectionFromHash(), { syncHash: false });
  focusTimerControl?.destroy();
  focusTimerControl = setupFocusTimer(refreshStudentPanels);
}

function setupStudentImport() {
  const input = document.getElementById("input-import-student-xlsx");
  const status = document.getElementById("student-import-report");
  const confirm = document.getElementById("btn-confirm-student-import");
  let tasks;
  input.onchange = async () => {
    const [file] = input.files;
    if (!file) return;
    input.disabled = true;
    confirm.hidden = true;
    setFeedback(status, "Memeriksa file…", "info");
    try {
      tasks = await importStudentWorkbook(file);
      if (!tasks.length) throw new Error("Belum ada baris tugas untuk diimpor.");
      const { importReport } = await updateStudentData("importTasks", { tasks, preview: true });
      setFeedback(status, `${file.name} · ${importReportText(importReport, true)}`, importReport.imported ? "info" : "error");
      confirm.hidden = importReport.imported === 0;
    } catch (error) {
      tasks = null;
      setFeedback(status, error.message, "error");
    } finally {
      input.value = "";
      input.disabled = false;
    }
  };
  confirm.onclick = async () => {
    input.disabled = confirm.disabled = true;
    const data = await saveLearning("importTasks", { tasks });
    if (data) {
      tasks = null;
      confirm.hidden = true;
      setFeedback(status, importReportText(data.importReport), "success");
    }
    input.disabled = confirm.disabled = false;
  };
}

function switchStudentSection(sectionId, { syncHash = true, push = true } = {}) {
  const target = STUDENT_SECTIONS.has(sectionId) ? sectionId : "beranda";
  document.getElementById("student-menu-toggle").ariaExpanded = "false";
  document.querySelectorAll(".student-panel").forEach((panel) => {
    panel.classList.toggle("hidden", panel.id !== `sec-${target}`);
  });
  document.querySelectorAll("#student-nav .nav-item").forEach((btn) => {
    const active = btn.dataset.section === target;
    btn.classList.toggle("active", active);
    if (active) btn.setAttribute("aria-current", "page");
    else btn.removeAttribute("aria-current");
  });
  if (syncHash) {
    const nextHash = target === "beranda" ? "" : `#${target}`;
    if (window.location.hash !== nextHash) {
      const nextUrl = window.location.pathname + window.location.search + nextHash;
      if (push) window.history.pushState(null, "", nextUrl);
      else window.history.replaceState(null, "", nextUrl);
    }
  }
  if (target === "materi") renderModules();
}

function refreshStudentPanels() {
  const data = getStudentData();
  const completedTasks = data.tasks.filter((t) => t.completed).length;
  const openTasks = data.tasks.length - completedTasks;
  const totalFocusMinutes = data.focusSessions.reduce((total, session) => total + session.durationMinutes, 0);

  // Update Statistik Jejak Progres
  document.getElementById("stat-tasks-done").textContent = completedTasks;
  document.getElementById("stat-focus-count").textContent = data.focusSessions.length;
  document.getElementById("stat-focus-minutes").textContent = `${totalFocusMinutes} menit fokus`;
  document.getElementById("stat-reflection-count").textContent = data.reflections.length;

  // Indikator Ketercapaian Layanan RPL (Minimal 3 dari 4 aktivitas inti)
  const criteriaDone = data.rplCount;
  document.getElementById("rpl-progress-badge").textContent = `Aktivitas RPL: ${criteriaDone} dari 4`;
  document.getElementById("rpl-progress-meter").value = criteriaDone;

  const featureMeta = {
    materi: "Panduan belajar sekolah",
    hambatan: data.selectedBarriers.length ? `${data.selectedBarriers.length} hambatan dipilih` : "Belum diisi",
    tugas: data.tasks.length ? (openTasks ? `${openTasks} belum selesai` : "Semua tugas selesai") : "Belum ada target",
    fokus: data.focusSessions.length ? `${data.focusSessions.length} sesi · ${totalFocusMinutes} menit` : "Belum ada sesi",
    refleksi: data.reflections.length ? `${data.reflections.length} catatan tersimpan` : "Belum ada catatan",
    konsultasi: "Sukarela & rahasia",
  };
  for (const [key, value] of Object.entries(featureMeta)) {
    const metaEl = document.querySelector(`[data-feature-meta="${key}"]`);
    if (metaEl) metaEl.textContent = value;
  }

  renderTasks(data.tasks);

  // Render Riwayat Refleksi
  const refListEl = document.getElementById("student-reflection-history");
  refListEl.innerHTML = data.reflections.length
    ? data.reflections
        .map(
          (r) => `
      <article class="card reflection-entry">
        <div class="reflection-date">${escapeHtml(r.date)}</div>
        <dl class="reflection-body">
          <div><dt>Dipelajari</dt><dd>${escapeHtml(r.learned)}</dd></div>
          <div><dt>Perasaan</dt><dd>${escapeHtml(r.feeling)}</dd></div>
          <div><dt>Rencana Perbaikan</dt><dd>${escapeHtml(r.improvement)}</dd></div>
        </dl>
      </article>`
        )
        .join("")
    : `<p class="workspace-empty">Belum ada catatan refleksi. Isi formulir di atas untuk menulis refleksi pertamamu.</p>`;

  const chartEl = document.getElementById("weekly-bar-chart");
  const activeDays = data.activity.filter(({ active }) => active).length;
  chartEl.hidden = activeDays === 0;
  document.getElementById("activity-days").textContent = activeDays
    ? `Belajar pada ${activeDays} dari 7 hari terakhir. Grafik menunjukkan menit fokus dan tugas selesai per hari (WIB).`
    : "Belum ada aktivitas dalam tujuh hari terakhir. Tambahkan tugas atau selesaikan sesi fokus untuk memulai.";
  const maxVal = Math.max(1, ...data.activity.map(({ minutes }) => minutes));
  const dayLabel = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: JAKARTA });
  chartEl.innerHTML = activeDays ? data.activity
    .map(({ date, minutes, doneTasks }) => {
      const pct = Math.round((minutes / maxVal) * 100);
      const hasMinutes = minutes > 0;
      const taskOnly = !hasMinutes && doneTasks > 0;
      const height = hasMinutes ? Math.max(8, pct) : taskOnly ? 14 : 0;
      return `
      <li>
        <div class="chart-track" aria-hidden="true">
          <div class="chart-bar${taskOnly ? " is-task-only" : ""}" style="height:${height}%"></div>
        </div>
        <strong>${escapeHtml(dayLabel.format(new Date(`${date}T12:00:00+07:00`)))}</strong>
        <span class="chart-minutes">${escapeHtml(minutes)}<span class="chart-unit-full"> menit</span><span class="chart-unit-short" aria-hidden="true">m</span></span>
        <span class="workspace-meta chart-tasks">${escapeHtml(doneTasks)}<span class="chart-unit-full"> tugas</span><span class="chart-unit-short" aria-hidden="true"> tgs</span></span>
      </li>`;
    })
    .join("") : "";
}

function renderTasks(tasks) {
  const filter = document.getElementById("task-filter").value;
  const visible = tasks.filter(({ completed }) => filter === "all" || completed === (filter === "done"));
  const doneCount = tasks.filter((task) => task.completed).length;
  const openCount = tasks.length - doneCount;
  const summaryEl = document.getElementById("task-summary");
  if (summaryEl) {
    summaryEl.textContent = tasks.length ? `${openCount} belum selesai · ${doneCount} selesai` : "";
  }
  const list = document.getElementById("student-task-list");
  list.innerHTML = visible.map((task) => `
    <div class="task-row${task.completed ? " is-complete" : ""}${task.id === activeEditTaskId ? " is-editing" : ""}" data-task-id="${escapeHtml(task.id)}">
      <label><input type="checkbox"${task.completed ? " checked" : ""}/><span>${escapeHtml(task.title)}</span></label>
      <div class="workspace-actions">
        <span class="badge ${task.priority === "Tinggi" ? "badge-high" : task.priority === "Sedang" ? "badge-mid" : "badge-low"}">${escapeHtml(task.priority)}</span>
        <button type="button" class="icon-action-btn" data-task-action="edit" aria-label="Edit ${escapeHtml(task.title)}" title="Edit"><svg class="ui-icon" aria-hidden="true"><use href="/assets/svg/interface.svg#pencil" /></svg></button>
        <button type="button" class="icon-action-btn is-destructive" data-task-action="delete" aria-label="Hapus ${escapeHtml(task.title)}" title="Hapus"><svg class="ui-icon" aria-hidden="true"><use href="/assets/svg/interface.svg#trash" /></svg></button>
      </div>
    </div>`).join("") || '<p class="workspace-empty">Tidak ada tugas pada filter ini.</p>';

  const select = document.getElementById("focus-task");
  const value = select.value;
  select.replaceChildren(new Option("Belajar mandiri", ""), ...tasks.filter(({ completed }) => !completed)
    .map(({ id, title }) => new Option(title, id)));
  if ([...select.options].some((option) => option.value === value)) select.value = value;
  focusTimerControl?.syncTasks();
}

function setupTaskManager() {
  const form = document.getElementById("form-add-task");
  const title = document.getElementById("task-title-input");
  const priority = document.getElementById("task-priority-input");
  const submit = document.getElementById("task-submit");
  const cancel = document.getElementById("task-cancel");
  const filter = document.getElementById("task-filter");
  const list = document.getElementById("student-task-list");
  const reset = () => {
    activeEditTaskId = null;
    form.reset();
    submit.textContent = "Tambah target";
    cancel.hidden = true;
  };
  cancel.onclick = () => {
    reset();
    renderTasks(getStudentData().tasks);
    title.focus();
  };
  filter.onchange = () => renderTasks(getStudentData().tasks);
  form.onsubmit = async (event) => {
    event.preventDefault();
    submit.disabled = true;
    const saved = await saveLearning(activeEditTaskId ? "editTask" : "addTask", { id: activeEditTaskId, title: title.value, priority: priority.value });
    if (saved) {
      reset();
      renderTasks(saved.tasks);
    }
    submit.disabled = false;
  };
  list.addEventListener("change", async ({ target }) => {
    if (target.type !== "checkbox") return;
    const { taskId: id } = target.closest("[data-task-id]").dataset;
    target.disabled = true;
    await saveLearning("toggleTask", { id, completed: target.checked });
    (list.querySelector(`[data-task-id="${CSS.escape(id)}"] input`) || filter).focus();
  });
  list.addEventListener("click", async ({ target }) => {
    const button = target.closest("[data-task-action]");
    if (!button) return;
    const { taskId: id } = button.closest("[data-task-id]").dataset;
    const task = getStudentData().tasks.find((entry) => entry.id === id);
    if (!task) return;
    if (button.dataset.taskAction === "edit") {
      activeEditTaskId = id;
      title.value = task.title;
      priority.value = task.priority;
      syncDropdown(priority);
      submit.textContent = "Simpan perubahan";
      cancel.hidden = false;
      renderTasks(getStudentData().tasks);
      title.focus();
    } else if (await confirmDialog(document.getElementById("student-app-view"), {
      title: "Hapus tugas",
      message: `Hapus tugas “${task.title}” dari daftarmu?`,
      confirmLabel: "Hapus",
      destructive: true,
    })) {
      button.disabled = true;
      const wasEditing = activeEditTaskId === id;
      const saved = await saveLearning("deleteTask", { id });
      if (saved && wasEditing) {
        reset();
        renderTasks(saved.tasks);
      }
      filter.focus();
    }
  });
}

function setupBarriersChecklist() {
  const container = document.getElementById("barriers-checklist");
  const data = getStudentData();
  const button = document.getElementById("btn-save-barriers");
  const result = document.getElementById("barriers-results");
  const status = document.getElementById("barriers-status");

  container.innerHTML = APP_CONFIG.barriersList
    .map(
      (b) => `
    <label class="barrier-option">
      <input type="checkbox" value="${escapeHtml(b.id)}" ${data.selectedBarriers.includes(b.id) ? "checked" : ""}/>
      <strong>${escapeHtml(b.label)}</strong>
    </label>`
    )
    .join("");

  const report = (ids) => {
    const choices = APP_CONFIG.barriersList.filter(({ id }) => ids.includes(id));
    result.innerHTML = choices.length ? `<div class="card student-results"><h3>Pemetaan hambatan dan strategi</h3>
      <ul>${choices.map(({ label, explanation, tip }) => `<li><strong>${escapeHtml(label)}</strong>
        ${explanation ? `<p>${escapeHtml(explanation)}</p>` : ""}<p>${escapeHtml(tip)}</p></li>`).join("")}</ul>
      <p>Coba satu strategi pada sesi berikutnya, lalu catat hasilnya di Refleksi Belajar. Hubungi Guru BK jika kamu membutuhkan pendampingan.</p>
      <div class="workspace-actions student-results-actions">
        <button type="button" class="btn btn-outline" data-open-section="tugas">Atur Tugas</button>
        <button type="button" class="btn btn-primary" data-open-section="fokus">Mulai Fokus</button>
      </div></div>` : "";
  };
  report(data.selectedBarriers);
  container.onchange = () => {
    setFeedback(status, "Pilihan berubah. Klik tombol di atas untuk menyimpan.");
  };
  button.onclick = async () => {
    const checked = Array.from(container.querySelectorAll('input[type="checkbox"]:checked')).map((el) => el.value);
    button.disabled = true;
    const saved = await saveLearning("saveBarriers", { barrierIds: checked });
    button.disabled = false;
    if (!saved) return;
    report(saved.selectedBarriers);
    setFeedback(status, "");
    showToast(checked.length ? "Pemetaan disimpan. Strategi belajarmu tersedia di bawah." : "Pilihan dikosongkan.", "success");
  };
}

function setupReflectionForm() {
  document.getElementById("form-reflection").onsubmit = async (e) => {
    e.preventDefault();
    const learned = document.getElementById("ref-learned").value.trim();
    const feeling = document.getElementById("ref-feeling").value.trim();
    const improvement = document.getElementById("ref-improvement").value.trim();
    if (!learned || !feeling || !improvement) {
      showToast("Lengkapi ketiga kolom refleksi sebelum menyimpan.", "error");
      return;
    }
    e.submitter.disabled = true;
    if (await saveLearning("saveReflection", { learned, feeling, improvement })) {
      e.target.reset();
      showToast("Refleksi belajar tersimpan di ruang pribadimu!", "success");
    }
    e.submitter.disabled = false;
  };
}

async function renderModules() {
  const grid = document.getElementById("modules-grid");
  grid.textContent = "Memuat materi…";
  grid.setAttribute("aria-busy", "true");
  try {
    const modules = await loadStudentModules();
    grid.innerHTML = modules.map((mod) => `<article class="card drive-module">
        ${mod.category ? `<p class="workspace-meta">${escapeHtml(mod.category)}</p>` : ""}
        <div class="module-copy"><h3>${escapeHtml(mod.title)}</h3><p>${escapeHtml(mod.description)}</p></div>
        <div class="workspace-actions">
          <button type="button" class="btn btn-primary" data-preview="${escapeHtml(mod.id)}">Pratinjau Modul</button>
          ${mod.previewUrl.startsWith("/")
            ? `<a class="btn btn-outline" href="${escapeHtml(mod.previewUrl)}" download>Unduh PDF</a>`
            : `<a class="btn btn-outline" href="${escapeHtml(mod.editUrl)}" target="_blank" rel="noopener noreferrer">Buka Google Drive</a>`}
        </div>
      </article>`).join("") || '<p class="workspace-empty">Belum ada materi yang tersedia untuk sekolahmu.</p>';
    grid.querySelectorAll("[data-preview]").forEach((button) => {
      button.onclick = () => openModuleModal(modules.find(({ id }) => id === button.dataset.preview));
    });
  } catch (error) {
    grid.textContent = error.message;
  } finally {
    grid.removeAttribute("aria-busy");
  }
}

function renderRPLSection(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const rpl = APP_CONFIG.rplDocument;

  container.innerHTML = `
    <article class="card rpl-document dashboard-fill">
      <button type="button" class="btn btn-outline rpl-print">Cetak atau simpan PDF</button>
      <h2 class="panel-title rpl-title">${escapeHtml(rpl.judul)}</h2>
      <div class="table-responsive rpl-table-wrap">
        <table>
          <tbody>
            ${rpl.identitas.map(([k, v]) => `<tr><th scope="row">${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`).join("")}
          </tbody>
        </table>
      </div>
      <p class="rpl-lead"><strong>A. Rasional Layanan:</strong> ${escapeHtml(rpl.rasional)}</p>
      <p class="rpl-lead"><strong>B. Tujuan Umum:</strong> ${escapeHtml(rpl.tujuanUmum)}</p>
      <h3>Materi pokok</h3><p>${escapeHtml(rpl.materiPokok)}</p>
      <h3 class="panel-title">C. Langkah Pelaksanaan Layanan Klasikal (2 × 45 Menit)</h3>
      <div class="table-responsive">
        <table>
          <thead><tr><th>Tahap Kegiatan</th><th>Deskripsi Pelaksanaan di Website FOCURA</th></tr></thead>
          <tbody>
            ${rpl.langkahPelaksanaan.map((step) => `<tr><td><strong>${escapeHtml(step.tahap)}</strong></td><td>${escapeHtml(step.rincian)}</td></tr>`).join("")}
          </tbody>
        </table>
      </div>
      <h3>Evaluasi</h3><p>${escapeHtml(rpl.evaluasi)}</p>
      <h3>Tindak lanjut</h3><p>${escapeHtml(rpl.tindakLanjut)}</p>
    </article>`;
  container.querySelector(".rpl-print").onclick = () => window.print();
}
