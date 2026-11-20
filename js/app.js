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
  const { demo: demoFlag, workspace, section } = document.getElementById("focura").dataset;
  const demo = demoFlag === "true";
  const authView = document.getElementById("auth-view");
  const loading = document.getElementById("workspace-loading");
  function showLogin() {
    loading?.remove();
    document.getElementById("admin-app-view")?.classList.add("hidden");
    authView.classList.remove("hidden");
    authView.classList.add("is-visible");
    button.disabled = false;
  }
  if (demo) {
    button.textContent = "Masuk sebagai Admin Demo";
    document.getElementById("auth-help").textContent = "Mode demo menggunakan data contoh.";
  }
  button.onclick = async () => {
    button.disabled = true;
    try {
      const destination = workspace ? pagePath(workspace, section) + window.location.search : demo ? "/admin" : "/";
      await loginUser(demo ? "demo" : "google", destination);
    } catch {
      showAuthAlert("Login gagal dimulai. Silakan coba lagi.");
      showLogin();
    }
  };

  try {
    const user = await getActiveSession();
    if (!user) {
      showLogin();
      const error = new URLSearchParams(window.location.search).get("error");
      if (error) showAuthAlert({
        AccessDenied: "Email ini belum diizinkan. Hubungi Admin Central.",
        AccessIncomplete: "Peran atau penugasan akun belum lengkap. Hubungi Admin Central.",
        SessionExpired: "Sesi telah berakhir. Masuk kembali untuk melanjutkan.",
        ServiceUnavailable: "Daftar akses sementara tidak dapat diperiksa. Silakan coba lagi.",
      }[error] || "Login tidak dapat diselesaikan. Silakan coba lagi.");
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
        '<article class="card"><h3>' + escapeHtml(child.fullName) + '</h3><p>' +
        escapeHtml(child.school) + ' · ' + escapeHtml(child.kelas) + '</p></article>'
      ).join("") : '<p>Belum ada akun anak yang ditautkan.</p>';
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
  const box = document.getElementById("auth-alert");
  box.classList.remove("hidden");
  box.style.cssText = "background:#fee2e2;color:#991b1b;padding:10px 14px;border-radius:10px;margin-bottom:14px;font-size:0.86rem;";
  box.textContent = message;
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
  const navButtons = document.querySelectorAll("#student-nav .nav-item");
  navButtons.forEach((btn) => {
    btn.onclick = () => {
      navButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      switchStudentSection(btn.dataset.section);
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
  refreshStudentPanels();
  switchStudentSection("beranda");
}

function switchStudentSection(sectionId) {
  document.querySelectorAll(".student-panel").forEach((panel) => {
    panel.classList.toggle("hidden", panel.id !== `sec-${sectionId}`);
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
  document.getElementById("rpl-progress-badge").textContent = `Ketercapaian Aktivitas RPL: ${criteriaDone}/4`;

  // Render Daftar Tugas
  const taskListEl = document.getElementById("student-task-list");
  taskListEl.innerHTML = data.tasks.length
    ? data.tasks
        .map(
          (t) => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:12px;border:1px solid var(--border);border-radius:10px;margin-bottom:8px;background:${t.completed ? "#f8fafc" : "#fff"};">
        <label style="display:flex;align-items:center;gap:10px;cursor:pointer;text-decoration:${t.completed ? "line-through" : "none"};">
          <input type="checkbox" data-task-id="${escapeHtml(t.id)}" ${t.completed ? "checked" : ""}/>
          <span>${escapeHtml(t.title)}</span>
        </label>
        <span class="badge ${t.priority === "Tinggi" ? "badge-high" : t.priority === "Sedang" ? "badge-mid" : "badge-low"}">${escapeHtml(t.priority)}</span>
      </div>`
        )
        .join("")
    : `<p style="color:var(--text-muted);font-size:0.9rem;">Belum ada target belajar. Tambahkan tugas pertamamu di atas.</p>`;

  taskListEl.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.onchange = async () => {
      cb.disabled = true;
      await saveLearning("toggleTask", { id: cb.dataset.taskId });
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
    : `<p style="color:var(--text-muted);font-size:0.9rem;">Belum ada catatan refleksi tersimpan.</p>`;

  // Render Grafik Batang Aktivitas Mingguan
  const chartEl = document.getElementById("weekly-bar-chart");
  const days = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
  const maxVal = Math.max(30, ...days.map((d) => data.weeklyMinutes[d] || 0));
  chartEl.innerHTML = days
    .map((day) => {
      const mins = data.weeklyMinutes[day] || 0;
      const pct = Math.round((mins / maxVal) * 100);
      return `
      <div style="flex:1;text-align:center;">
        <div style="height:120px;display:flex;align-items:flex-end;justify-content:center;background:#f1f5f9;border-radius:8px;padding:4px;">
          <div style="width:70%;height:${Math.max(8, pct)}%;background:var(--primary);border-radius:6px;" title="${mins} menit"></div>
        </div>
        <div style="font-size:0.78rem;font-weight:700;margin-top:6px;">${day}</div>
        <div style="font-size:0.72rem;color:var(--text-muted);">${mins}m</div>
      </div>`;
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

  document.querySelectorAll(".duration-btn").forEach((btn) => {
    btn.onclick = () => {
      clearInterval(timerInterval);
      selectedDurationMinutes = Number(btn.dataset.mins);
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
    <label style="display:flex;align-items:flex-start;gap:12px;padding:14px;border:1px solid var(--border);border-radius:12px;margin-bottom:10px;cursor:pointer;">
      <input type="checkbox" value="${b.id}" ${data.selectedBarriers.includes(b.id) ? "checked" : ""} style="margin-top:4px;"/>
      <div>
        <div style="font-weight:600;">${b.label}</div>
        <div style="font-size:0.84rem;color:var(--text-muted);margin-top:3px;">Saran Strategi: ${b.tip}</div>
      </div>
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
        <a class="btn btn-outline" href="${mod.editUrl}" target="_blank" rel="noopener noreferrer">Buka Google Drive ↗</a>
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
  document.getElementById("modal-drive-title").textContent = title;
  document.getElementById("modal-drive-iframe").src = previewUrl;
  modal.classList.remove("hidden");
  document.getElementById("btn-close-modal").onclick = () => {
    modal.classList.add("hidden");
    document.getElementById("modal-drive-iframe").src = "";
  };
}

function renderRPLSection(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const rpl = APP_CONFIG.rplDocument;

  container.innerHTML = `
    <div class="card" style="margin-bottom:20px;">
      <h3 style="color:var(--primary-dark);margin-bottom:12px;">${rpl.judul}</h3>
      <div class="table-responsive" style="margin-bottom:16px;">
        <table>
          <tbody>
            ${rpl.identitas.map(([k, v]) => `<tr><th style="width:240px;">${k}</th><td>${v}</td></tr>`).join("")}
          </tbody>
        </table>
      </div>
      <p style="margin-bottom:10px;"><strong>A. Rasional Layanan:</strong> ${rpl.rasional}</p>
      <p style="margin-bottom:16px;"><strong>B. Tujuan Umum:</strong> ${rpl.tujuanUmum}</p>
      <h4 style="margin-bottom:10px;">C. Langkah Pelaksanaan Layanan Klasikal (2 × 45 Menit)</h4>
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
