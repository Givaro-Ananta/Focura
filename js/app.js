/**
 * Modul Pengendali Utama UI Focura — Ruang Fokus
 * Menghubungkan Autentikasi Landscape, Dashboard Siswa, Timer Latihan Fokus,
 * Materi Google Drive, Konsultasi Google Form, RPL Klasikal, dan Ruang Admin Guru BK.
 */

import { APP_CONFIG } from "./config.js";
import { api, getActiveSession, loginUser, logoutUser } from "./auth.js";
import { getStudentData, loadStudentData, updateStudentData } from "./storage.js";
import { exportStudentWorkbook, importReportText, importStudentWorkbook } from "./excel-sync.js";
import { setupFocusTimer } from "./focus-timer.js";
import { driveLinks, JAKARTA } from "./learning-rules.js";
import { setupMonitor } from "./monitor.js";
import { escapeHtml, openDriveModal } from "./ui.js";
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
    if (workspace === "bk") demoAccount.value = "bk";
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
    if (workspace !== userWorkspace) {
      window.location.replace(userWorkspace ? pagePath(userWorkspace) : "/");
      return;
    }
    if (user.role === "student") {
      user.kelas = await loadStudentData();
      if (!button.isConnected) return;
      renderStudentDashboard(user);
      document.getElementById("student-app-view").classList.remove("hidden");
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
    if (!button.isConnected) return;
    showLogin();
    showAuthAlert(error.message);
  }
}

function leave() {
  logoutUser().catch((error) => alert(error.message));
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
    refreshStudentPanels();
    alert(error.message);
    return false;
  }
}

/* ==========================================================================
   DASHBOARD SISWA (TERISOLASI PER AKUN)
   ========================================================================== */
function renderStudentDashboard(user) {
  document.getElementById("student-greeting").textContent = `Halo, ${user.fullName}!`;
  document.getElementById("student-meta").textContent = `NIS: ${user.nis || "—"} • ${user.kelas}`;
  document.getElementById("student-account-info").textContent = `${user.email} · ${user.kelas} · Ruang pribadi aktif`;

  // Navigasi Menu Siswa
  document.querySelectorAll("#student-nav .nav-item").forEach((btn) => {
    btn.onclick = () => switchStudentSection(btn.dataset.section);
  });
  document.querySelectorAll("[data-open-section]").forEach((btn) => {
    btn.onclick = () => {
      const section = btn.dataset.openSection;
      switchStudentSection(section);
      const heading = document.getElementById("sec-" + section).querySelector("h2");
      heading.tabIndex = -1;
      heading.focus();
    };
  });

  document.getElementById("btn-student-logout").onclick = leave;
  document.getElementById("btn-export-student-xlsx").onclick = () => exportStudentWorkbook(user);
  setupStudentImport();
  renderRPLSection("student-rpl-container");
  setupTaskManager();
  setupBarriersChecklist();
  setupReflectionForm();
  switchStudentSection("beranda");
  setupFocusTimer(refreshStudentPanels);
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
    status.textContent = "Memeriksa file…";
    try {
      tasks = await importStudentWorkbook(file);
      if (!tasks.length) throw new Error("Belum ada baris tugas untuk diimpor.");
      const { importReport } = await updateStudentData("importTasks", { tasks, preview: true });
      status.textContent = `${file.name} · ${importReportText(importReport, true)}`;
      confirm.hidden = importReport.imported === 0;
    } catch (error) {
      tasks = null;
      status.textContent = error.message;
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
      status.textContent = importReportText(data.importReport);
    }
    input.disabled = confirm.disabled = false;
  };
}

function switchStudentSection(sectionId) {
  document.querySelectorAll(".student-panel").forEach((panel) => {
    panel.classList.toggle("hidden", panel.id !== `sec-${sectionId}`);
  });
  document.querySelectorAll("#student-nav .nav-item").forEach((btn) => {
    const active = btn.dataset.section === sectionId;
    btn.classList.toggle("active", active);
    if (active) btn.setAttribute("aria-current", "page");
    else btn.removeAttribute("aria-current");
  });
  refreshStudentPanels();
  if (sectionId === "materi") renderDriveModules();
}

function refreshStudentPanels() {
  const data = getStudentData();
  const completedTasks = data.tasks.filter((t) => t.completed).length;

  // Update Statistik Jejak Progres
  document.getElementById("stat-tasks-done").textContent = completedTasks;
  document.getElementById("stat-focus-count").textContent = data.focusSessions.length;
  document.getElementById("stat-focus-minutes").textContent = `${data.focusSessions.reduce((total, session) => total + session.durationMinutes, 0)} menit fokus`;
  document.getElementById("stat-reflection-count").textContent = data.reflections.length;

  // Indikator Ketercapaian Layanan RPL (Minimal 3 dari 4 aktivitas inti)
  const criteriaDone = data.rplCount;
  document.getElementById("rpl-progress-badge").textContent = `Aktivitas RPL: ${criteriaDone} dari 4`;
  document.getElementById("rpl-progress-meter").value = criteriaDone;

  renderTasks(data.tasks);

  // Render Riwayat Refleksi
  const refListEl = document.getElementById("student-reflection-history");
  refListEl.innerHTML = data.reflections.length
    ? data.reflections
        .map(
          (r) => `
      <div class="card" style="margin-bottom:12px;padding:16px;">
        <div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:6px;">${escapeHtml(r.date)}</div>
        <p><strong>Dipelajari:</strong> ${escapeHtml(r.learned)}</p>
        <p><strong>Perasaan:</strong> ${escapeHtml(r.feeling)}</p>
        <p><strong>Rencana Perbaikan:</strong> ${escapeHtml(r.improvement)}</p>
      </div>`
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
      return `
      <li>
        <div class="chart-track" aria-hidden="true">
          <div class="chart-bar" style="height:${pct}%"></div>
        </div>
        <strong>${escapeHtml(dayLabel.format(new Date(date)))}</strong>
        <span>${escapeHtml(minutes)} menit</span>
        <span class="workspace-meta">${escapeHtml(doneTasks)} tugas</span>
      </li>`;
    })
    .join("") : "";
}

function renderTasks(tasks) {
  const filter = document.getElementById("task-filter").value;
  const visible = tasks.filter(({ completed }) => filter === "all" || completed === (filter === "done"));
  const list = document.getElementById("student-task-list");
  list.innerHTML = visible.map((task) => `
    <div class="task-row${task.completed ? " is-complete" : ""}" data-task-id="${escapeHtml(task.id)}">
      <label><input type="checkbox"${task.completed ? " checked" : ""}/><span>${escapeHtml(task.title)}</span></label>
      <div class="workspace-actions">
        <span class="badge ${task.priority === "Tinggi" ? "badge-high" : task.priority === "Sedang" ? "badge-mid" : "badge-low"}">${escapeHtml(task.priority)}</span>
        <button type="button" class="workspace-row-action" data-task-action="edit" aria-label="Ubah ${escapeHtml(task.title)}">Ubah</button>
        <button type="button" class="workspace-row-action workspace-destructive" data-task-action="delete" aria-label="Hapus ${escapeHtml(task.title)}">Hapus</button>
      </div>
    </div>`).join("") || '<p class="workspace-empty">Tidak ada tugas pada filter ini.</p>';

  const select = document.getElementById("focus-task");
  const value = select.value;
  select.replaceChildren(new Option("Belajar mandiri", ""), ...tasks.filter(({ completed }) => !completed)
    .map(({ id, title }) => new Option(title, id)));
  if ([...select.options].some((option) => option.value === value)) select.value = value;
}

function setupTaskManager() {
  const form = document.getElementById("form-add-task");
  const title = document.getElementById("task-title-input");
  const priority = document.getElementById("task-priority-input");
  const submit = document.getElementById("task-submit");
  const cancel = document.getElementById("task-cancel");
  const filter = document.getElementById("task-filter");
  const list = document.getElementById("student-task-list");
  let editId;
  const reset = () => {
    editId = null;
    form.reset();
    submit.textContent = "Tambah target";
    cancel.hidden = true;
  };
  cancel.onclick = () => { reset(); title.focus(); };
  filter.onchange = () => renderTasks(getStudentData().tasks);
  form.onsubmit = async (event) => {
    event.preventDefault();
    submit.disabled = true;
    if (await saveLearning(editId ? "editTask" : "addTask", { id: editId, title: title.value, priority: priority.value })) reset();
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
      editId = id;
      title.value = task.title;
      priority.value = task.priority;
      submit.textContent = "Simpan perubahan";
      cancel.hidden = false;
      title.focus();
    } else if (window.confirm(`Hapus tugas “${task.title}”?`)) {
      button.disabled = true;
      if ((await saveLearning("deleteTask", { id })) && editId === id) reset();
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
      <p>Coba satu strategi pada sesi berikutnya, lalu catat hasilnya di Refleksi Belajar. Hubungi Guru BK jika kamu membutuhkan pendampingan.</p></div>` : "";
  };
  report(data.selectedBarriers);
  button.onclick = async () => {
    const checked = Array.from(container.querySelectorAll('input[type="checkbox"]:checked')).map((el) => el.value);
    button.disabled = true;
    const saved = await saveLearning("saveBarriers", { barrierIds: checked });
    button.disabled = false;
    if (!saved) return;
    report(saved.selectedBarriers);
    status.textContent = checked.length ? "Pemetaan disimpan. Strategi belajarmu tersedia di bawah." : "Pilihan dikosongkan.";
  };
}

function setupReflectionForm() {
  document.getElementById("form-reflection").onsubmit = async (e) => {
    e.preventDefault();
    const learned = document.getElementById("ref-learned").value.trim();
    const feeling = document.getElementById("ref-feeling").value.trim();
    const improvement = document.getElementById("ref-improvement").value.trim();
    if (!learned || !feeling || !improvement) return;
    e.submitter.disabled = true;
    if (await saveLearning("saveReflection", { learned, feeling, improvement })) {
      e.target.reset();
      alert("Refleksi belajar tersimpan di ruang pribadimu!");
    }
    e.submitter.disabled = false;
  };
}

async function renderDriveModules() {
  const grid = document.getElementById("drive-modules-grid");
  grid.textContent = "Memuat materi…";
  grid.setAttribute("aria-busy", "true");
  try {
    const modules = await api("me/modules");
    grid.innerHTML = modules.map((mod) => {
      const links = driveLinks(mod.editUrl);
      if (!links) return "";
      return `<article class="card drive-module"><div>
        ${mod.category ? `<p class="workspace-meta">${escapeHtml(mod.category)}</p>` : ""}
        <h3>${escapeHtml(mod.title)}</h3><p>${escapeHtml(mod.description)}</p>
      </div><div class="workspace-actions">
        <button type="button" class="btn btn-primary" data-preview="${escapeHtml(mod.id)}">Pratinjau Modul</button>
        <a class="btn btn-outline" href="${escapeHtml(links.editUrl)}" target="_blank" rel="noopener noreferrer">Buka Google Drive</a>
      </div></article>`;
    }).join("") || '<p class="workspace-empty">Belum ada materi yang tersedia untuk sekolahmu.</p>';
    grid.querySelectorAll("[data-preview]").forEach((button) => {
      button.onclick = () => openDriveModal(modules.find(({ id }) => id === button.dataset.preview));
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
    <article class="card rpl-document">
      <button type="button" class="btn btn-outline rpl-print">Cetak atau simpan PDF</button>
      <h2 class="panel-title rpl-title">${escapeHtml(rpl.judul)}</h2>
      <div class="table-responsive" style="margin-bottom:16px;">
        <table>
          <tbody>
            ${rpl.identitas.map(([k, v]) => `<tr><th scope="row">${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`).join("")}
          </tbody>
        </table>
      </div>
      <p style="margin-bottom:10px;"><strong>A. Rasional Layanan:</strong> ${escapeHtml(rpl.rasional)}</p>
      <p style="margin-bottom:16px;"><strong>B. Tujuan Umum:</strong> ${escapeHtml(rpl.tujuanUmum)}</p>
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
