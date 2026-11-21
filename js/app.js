/**
 * Modul Pengendali Utama UI Focura — Ruang Fokus
 * Menghubungkan Autentikasi Landscape, Dashboard Siswa, Timer Latihan Fokus,
 * Materi Google Drive, Konsultasi Google Form, RPL Klasikal, dan Ruang Admin Guru BK.
 */

import { APP_CONFIG } from "./config.js";
import { api, getActiveSession, loginUser, logoutUser } from "./auth.js";
import { getStudentData, loadStudentData, updateStudentData } from "./storage.js";
import { exportStudentWorkbook, importStudentWorkbook } from "./excel-sync.js";
import { escapeHtml, setupMonitor } from "./monitor.js";
import { pagePath, WORKSPACES } from "./workspaces.js";

let timerInterval = null;
let remainingSeconds = 600;
let selectedDurationMinutes = 10;

export async function initializeApp() {
  const button = document.getElementById("btn-google-login");
  const buttonLabel = document.getElementById("auth-button-label");
  const register = document.getElementById("btn-teacher-register");
  const registerLabel = register.textContent;
  const { demo: demoFlag, workspace, section } = document.getElementById("focura").dataset;
  const demo = demoFlag === "true";
  const authView = document.getElementById("auth-view");
  const loading = document.getElementById("workspace-loading");
  const loginLabel = demo ? "Masuk sebagai Admin Demo" : "Masuk dengan Google";
  function showLogin() {
    loading?.remove();
    document.getElementById("admin-app-view")?.classList.add("hidden");
    authView.classList.remove("hidden");
    authView.classList.add("is-visible");
    buttonLabel.textContent = loginLabel;
    register.textContent = registerLabel;
    button.disabled = false;
    register.disabled = false;
  }
  if (demo) {
    document.getElementById("auth-help").textContent = "Mode demo menggunakan data contoh.";
  } else {
    document.getElementById("teacher-registration").classList.remove("hidden");
  }
  async function connect(registering = false) {
    button.disabled = true;
    register.disabled = true;
    (registering ? register : buttonLabel).textContent = "Menghubungkan…";
    showAuthAlert("");
    document.getElementById("auth-status").textContent = "";
    try {
      const destination = registering ? "/?daftar=guru-bk"
        : workspace ? pagePath(workspace, section) + window.location.search : demo ? "/admin" : "/";
      await loginUser(demo ? "demo" : "google", destination);
    } catch {
      showAuthAlert(registering ? "Pendaftaran gagal dimulai. Silakan coba lagi." : "Login gagal dimulai. Silakan coba lagi.");
      showLogin();
    }
  }
  button.onclick = () => connect();
  register.onclick = () => connect(true);

  try {
    const user = await getActiveSession();
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
      renderStudentDashboard(user);
      document.getElementById("student-app-view").classList.remove("hidden");
    } else if (user.role === "guardian") {
      const children = await api("guardian/children");
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
    showLogin();
    showAuthAlert(error.message);
  }
}

function leave() {
  clearInterval(timerInterval);
  logoutUser().catch((error) => alert(error.message));
}

function showAuthAlert(message) {
  document.getElementById("auth-alert").textContent = message;
}

async function saveLearning(action, values) {
  try {
    await updateStudentData(action, values);
    refreshStudentPanels();
    return true;
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

  // Navigasi Menu Siswa
  document.querySelectorAll("#student-nav .nav-item").forEach((btn) => {
    btn.onclick = () => switchStudentSection(btn.dataset.section);
  });
  document.querySelectorAll("[data-open-section]").forEach((btn) => {
    btn.onclick = () => {
      const section = btn.dataset.openSection;
      switchStudentSection(section);
      const heading = document.querySelector(`#sec-${section} h2`);
      heading.tabIndex = -1;
      heading.focus();
    };
  });

  document.getElementById("btn-student-logout").onclick = leave;
  document.getElementById("btn-export-student-xlsx").onclick = () => exportStudentWorkbook(user);
  document.getElementById("input-import-student-xlsx").onchange = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      const tasks = await importStudentWorkbook(file);
      if (await saveLearning("importTasks", { tasks })) alert("Data tugas dari Excel berhasil diimpor.");
    } catch (error) {
      alert(error.message);
    } finally {
      event.target.value = "";
    }
  };

  renderDriveModules();
  renderRPLSection("student-rpl-container");
  setupFocusTimer();
  setupTaskManager();
  setupBarriersChecklist();
  setupReflectionForm();
  switchStudentSection("beranda");
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
}

function refreshStudentPanels() {
  const data = getStudentData();
  const completedTasks = data.tasks.filter((t) => t.completed).length;

  // Update Statistik Jejak Progres
  document.getElementById("stat-tasks-done").textContent = completedTasks;
  document.getElementById("stat-focus-count").textContent = data.focusSessions.length;
  document.getElementById("stat-reflection-count").textContent = data.reflections.length;

  // Indikator Ketercapaian Layanan RPL (Minimal 3 dari 4 aktivitas inti)
  const criteriaDone =
    (data.selectedBarriers.length > 0 ? 1 : 0) +
    (data.tasks.length > 0 ? 1 : 0) +
    (data.focusSessions.length > 0 ? 1 : 0) +
    (data.reflections.length > 0 ? 1 : 0);
  document.getElementById("rpl-progress-badge").textContent = `Aktivitas RPL: ${criteriaDone} dari 4`;
  document.getElementById("rpl-progress-meter").value = criteriaDone;

  // Render Daftar Tugas
  const taskListEl = document.getElementById("student-task-list");
  taskListEl.innerHTML = data.tasks.length
    ? data.tasks
        .map(
          (t) => `
      <div class="task-row${t.completed ? " is-complete" : ""}">
        <label>
          <input type="checkbox" data-task-id="${escapeHtml(t.id)}" ${t.completed ? "checked" : ""}/>
          <span>${escapeHtml(t.title)}</span>
        </label>
        <span class="badge ${t.priority === "Tinggi" ? "badge-high" : t.priority === "Sedang" ? "badge-mid" : "badge-low"}">${escapeHtml(t.priority)}</span>
      </div>`
        )
        .join("")
    : `<p class="workspace-empty">Belum ada target belajar. Tambahkan tugas pertamamu di atas.</p>`;

  taskListEl.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.onchange = async () => {
      cb.disabled = true;
      await saveLearning("toggleTask", { id: cb.dataset.taskId });
      taskListEl.querySelector(`[data-task-id="${CSS.escape(cb.dataset.taskId)}"]`)?.focus();
    };
  });

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

  // Render Grafik Batang Aktivitas Mingguan
  const chartEl = document.getElementById("weekly-bar-chart");
  const days = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
  const maxVal = Math.max(30, ...days.map((d) => data.weeklyMinutes[d] || 0));
  chartEl.innerHTML = days
    .map((day) => {
      const mins = data.weeklyMinutes[day] || 0;
      const pct = Math.round((mins / maxVal) * 100);
      return `
      <li>
        <div class="chart-track" aria-hidden="true">
          <div class="chart-bar" style="height:${pct}%"></div>
        </div>
        <strong>${day}</strong>
        <span>${mins} <span class="visually-hidden">menit</span><span aria-hidden="true">m</span></span>
      </li>`;
    })
    .join("");
}

function setupTaskManager() {
  document.getElementById("form-add-task").onsubmit = async (e) => {
    e.preventDefault();
    const title = document.getElementById("task-title-input").value.trim();
    const priority = document.getElementById("task-priority-input").value;
    if (!title) return;
    if (await saveLearning("addTask", { title, priority })) e.target.reset();
  };
}

function setupFocusTimer() {
  const display = document.getElementById("timer-display");
  const updateDisplay = () => {
    const m = String(Math.floor(remainingSeconds / 60)).padStart(2, "0");
    const s = String(remainingSeconds % 60).padStart(2, "0");
    display.textContent = `${m}:${s}`;
  };

  const durationButtons = document.querySelectorAll(".duration-btn");
  durationButtons.forEach((btn) => {
    btn.onclick = () => {
      clearInterval(timerInterval);
      selectedDurationMinutes = Number(btn.dataset.mins);
      durationButtons.forEach((option) => option.setAttribute("aria-pressed", String(option === btn)));
      remainingSeconds = selectedDurationMinutes * 60;
      updateDisplay();
    };
  });

  document.getElementById("btn-start-timer").onclick = () => {
    clearInterval(timerInterval);
    timerInterval = setInterval(async () => {
      if (remainingSeconds > 0) {
        remainingSeconds--;
        updateDisplay();
      } else {
        clearInterval(timerInterval);
        const topic = document.getElementById("focus-topic-input").value.trim();
        const durationMinutes = selectedDurationMinutes;
        remainingSeconds = durationMinutes * 60;
        updateDisplay();
        if (await saveLearning("recordFocus", { durationMinutes, topic })) {
          alert(`Selamat! Sesi latihan fokus ${durationMinutes} menit selesai dan dicatat ke Jejak Progres.`);
        }
      }
    }, 1000);
  };

  document.getElementById("btn-reset-timer").onclick = () => {
    clearInterval(timerInterval);
    remainingSeconds = selectedDurationMinutes * 60;
    updateDisplay();
  };
}

function setupBarriersChecklist() {
  const container = document.getElementById("barriers-checklist");
  const data = getStudentData();

  container.innerHTML = APP_CONFIG.barriersList
    .map(
      (b) => `
    <label class="barrier-option">
      <input type="checkbox" value="${b.id}" ${data.selectedBarriers.includes(b.id) ? "checked" : ""}/>
      <span><strong>${b.label}</strong><span>${b.tip}</span></span>
    </label>`
    )
    .join("");

  document.getElementById("btn-save-barriers").onclick = async () => {
    const checked = Array.from(container.querySelectorAll('input[type="checkbox"]:checked')).map((el) => el.value);
    if (await saveLearning("saveBarriers", { barrierIds: checked })) {
      alert("Hasil identifikasi hambatan belajar berhasil disimpan secara non-diagnostik.");
    }
  };
}

function setupReflectionForm() {
  document.getElementById("form-reflection").onsubmit = async (e) => {
    e.preventDefault();
    const learned = document.getElementById("ref-learned").value.trim();
    const feeling = document.getElementById("ref-feeling").value.trim();
    const improvement = document.getElementById("ref-improvement").value.trim();
    if (!learned || !feeling || !improvement) return;
    if (await saveLearning("saveReflection", { learned, feeling, improvement })) {
      e.target.reset();
      alert("Refleksi belajar tersimpan di ruang pribadimu!");
    }
  };
}

function renderDriveModules() {
  const grid = document.getElementById("drive-modules-grid");
  grid.innerHTML = APP_CONFIG.driveModules
    .map(
      (mod) => `
    <div class="card" style="display:flex;flex-direction:column;justify-content:space-between;">
      <div>
        <span class="badge" style="background:var(--primary-light);color:var(--primary-dark);margin-bottom:10px;">${mod.category}</span>
        <h3 style="font-size:1.05rem;margin-bottom:8px;">${mod.title}</h3>
        <p style="font-size:0.88rem;color:var(--text-muted);margin-bottom:16px;">${mod.description}</p>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn btn-primary btn-preview-drive" data-url="${mod.previewUrl}" data-title="${mod.title}">Pratinjau Modul</button>
        <a class="btn btn-outline" href="${mod.editUrl}" target="_blank" rel="noopener noreferrer">Buka Google Drive</a>
      </div>
    </div>`
    )
    .join("");

  grid.querySelectorAll(".btn-preview-drive").forEach((btn) => {
    btn.onclick = () => openDriveModal(btn.dataset.title, btn.dataset.url);
  });
}

function openDriveModal(title, previewUrl) {
  const modal = document.getElementById("drive-preview-modal");
  const iframe = document.getElementById("modal-drive-iframe");
  document.getElementById("modal-drive-title").textContent = title;
  iframe.src = previewUrl;
  modal.addEventListener("close", () => iframe.removeAttribute("src"), { once: true });
  modal.showModal();
}

function renderRPLSection(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const rpl = APP_CONFIG.rplDocument;

  container.innerHTML = `
    <div class="card" style="margin-bottom:20px;">
      <h2 class="panel-title rpl-title">${rpl.judul}</h2>
      <div class="table-responsive" style="margin-bottom:16px;">
        <table>
          <tbody>
            ${rpl.identitas.map(([k, v]) => `<tr><th scope="row">${k}</th><td>${v}</td></tr>`).join("")}
          </tbody>
        </table>
      </div>
      <p style="margin-bottom:10px;"><strong>A. Rasional Layanan:</strong> ${rpl.rasional}</p>
      <p style="margin-bottom:16px;"><strong>B. Tujuan Umum:</strong> ${rpl.tujuanUmum}</p>
      <h3 class="panel-title">C. Langkah Pelaksanaan Layanan Klasikal (2 × 45 Menit)</h3>
      <div class="table-responsive">
        <table>
          <thead><tr><th>Tahap Kegiatan</th><th>Deskripsi Pelaksanaan di Website FOCURA</th></tr></thead>
          <tbody>
            ${rpl.langkahPelaksanaan.map((step) => `<tr><td><strong>${step.tahap}</strong></td><td>${step.rincian}</td></tr>`).join("")}
          </tbody>
        </table>
      </div>
    </div>`;
}
