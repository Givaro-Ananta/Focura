/**
 * Modul Pengendali Utama UI Focura — Ruang Fokus
 * Menghubungkan Autentikasi Landscape, Dashboard Siswa, Timer Latihan Fokus,
 * Materi Google Drive, Konsultasi Google Form, RPL Klasikal, dan Ruang Admin Guru BK.
 */

import { APP_CONFIG } from "./config.js";
import { registerStudent, loginUser, getActiveSession, logoutUser, getRegisteredStudents } from "./auth.js";
import {
  getStudentData,
  addStudentTask,
  toggleStudentTask,
  recordFocusSession,
  saveStudentReflection,
  saveStudentBarriers
} from "./storage.js";
import { exportStudentWorkbook, importStudentWorkbook, exportAdminRecapWorkbook } from "./excel-sync.js";

let timerInterval = null;
let remainingSeconds = 600;
let selectedDurationMinutes = 10;

document.addEventListener("DOMContentLoaded", () => {
  initAuthListeners();
  renderCurrentRoute();
});

function renderCurrentRoute() {
  const user = getActiveSession();
  const authView = document.getElementById("auth-view");
  const studentView = document.getElementById("student-app-view");
  const adminView = document.getElementById("admin-app-view");

  authView.classList.add("hidden");
  studentView.classList.add("hidden");
  adminView.classList.add("hidden");

  if (!user) {
    authView.classList.remove("hidden");
    return;
  }

  if (user.role === "admin_bk") {
    adminView.classList.remove("hidden");
    renderAdminDashboard(user);
  } else {
    studentView.classList.remove("hidden");
    renderStudentDashboard(user);
  }
}

/* ==========================================================================
   AUTENTIKASI LANDSCAPE (LOGIN SISWA, DAFTAR AKUN SISWA, & LOGIN ADMIN BK)
   ========================================================================== */
function initAuthListeners() {
  const tabBtns = document.querySelectorAll(".auth-tab-btn");
  tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      tabBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      const target = btn.dataset.tab;
      document.getElementById("form-student-login").classList.toggle("hidden", target !== "student-login");
      document.getElementById("form-student-register").classList.toggle("hidden", target !== "student-register");
      document.getElementById("form-admin-login").classList.toggle("hidden", target !== "admin-login");
      showAuthAlert("", false);
    });
  });

  // Form Pendaftaran Akun Siswa (Wajib sebelum masuk)
  document.getElementById("form-student-register").addEventListener("submit", (e) => {
    e.preventDefault();
    const res = registerStudent({
      fullName: document.getElementById("reg-name").value,
      nis: document.getElementById("reg-nis").value,
      kelas: document.getElementById("reg-kelas").value,
      email: document.getElementById("reg-email").value,
      password: document.getElementById("reg-pass").value,
      consent: document.getElementById("reg-consent").checked
    });

    showAuthAlert(res.message, res.ok);
    if (res.ok) {
      e.target.reset();
      document.querySelector('[data-tab="student-login"]').click();
      showAuthAlert(res.message, true);
    }
  });

  // Form Login Siswa
  document.getElementById("form-student-login").addEventListener("submit", (e) => {
    e.preventDefault();
    const idVal = document.getElementById("login-student-id").value;
    const passVal = document.getElementById("login-student-pass").value;
    const res = loginUser(idVal, passVal, "student");
    if (!res.ok) {
      showAuthAlert(res.message, false);
    } else {
      e.target.reset();
      renderCurrentRoute();
    }
  });

  // Form Login Khusus Admin Guru BK (mltihrnnda@gmail.com / ninda226)
  document.getElementById("form-admin-login").addEventListener("submit", (e) => {
    e.preventDefault();
    const emailVal = document.getElementById("login-admin-email").value;
    const passVal = document.getElementById("login-admin-pass").value;
    const res = loginUser(emailVal, passVal, "admin");
    if (!res.ok) {
      showAuthAlert(res.message, false);
    } else {
      e.target.reset();
      renderCurrentRoute();
    }
  });
}

function showAuthAlert(message, isSuccess) {
  const alertBox = document.getElementById("auth-alert");
  if (!message) {
    alertBox.classList.add("hidden");
    return;
  }
  alertBox.classList.remove("hidden");
  alertBox.style.background = isSuccess ? "#dcfce7" : "#fee2e2";
  alertBox.style.color = isSuccess ? "#166534" : "#991b1b";
  alertBox.style.padding = "10px 14px";
  alertBox.style.borderRadius = "10px";
  alertBox.style.marginBottom = "14px";
  alertBox.style.fontSize = "0.86rem";
  alertBox.textContent = message;
}

/* ==========================================================================
   DASHBOARD SISWA (TERISOLASI PER AKUN)
   ========================================================================== */
function renderStudentDashboard(user) {
  document.getElementById("student-greeting").textContent = `Halo, ${user.fullName}!`;
  document.getElementById("student-meta").textContent = `NIS: ${user.nis} • Kelas ${user.kelas} • Ruang Pribadi Terenkripsi`;

  // Navigasi Menu Siswa
  const navButtons = document.querySelectorAll("#student-nav .nav-item");
  navButtons.forEach((btn) => {
    btn.onclick = () => {
      navButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      switchStudentSection(btn.dataset.section, user);
    };
  });

  document.getElementById("btn-student-logout").onclick = () => {
    clearInterval(timerInterval);
    logoutUser();
    renderCurrentRoute();
  };

  // Excel Sync Buttons
  document.getElementById("btn-export-student-xlsx").onclick = () => exportStudentWorkbook(user);
  document.getElementById("input-import-student-xlsx").onchange = (e) => {
    const file = e.target.files[0];
    importStudentWorkbook(user, file, (ok, msg) => {
      alert(msg);
      if (ok) refreshStudentPanels(user);
    });
  };

  renderDriveModules();
  renderRPLSection("student-rpl-container");
  setupFocusTimer(user);
  setupTaskManager(user);
  setupBarriersChecklist(user);
  setupReflectionForm(user);
  refreshStudentPanels(user);
  switchStudentSection("beranda", user);
}

function switchStudentSection(sectionId, user) {
  document.querySelectorAll(".student-panel").forEach((panel) => {
    panel.classList.toggle("hidden", panel.id !== `sec-${sectionId}`);
  });
  refreshStudentPanels(user);
}

function refreshStudentPanels(user) {
  const data = getStudentData(user.id);
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
          <input type="checkbox" data-task-id="${t.id}" ${t.completed ? "checked" : ""}/>
          <span>${t.title}</span>
        </label>
        <span class="badge ${t.priority === "Tinggi" ? "badge-high" : t.priority === "Sedang" ? "badge-mid" : "badge-low"}">${t.priority}</span>
      </div>`
        )
        .join("")
    : `<p style="color:var(--text-muted);font-size:0.9rem;">Belum ada target belajar. Tambahkan tugas pertamamu di atas.</p>`;

  taskListEl.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.onchange = () => {
      toggleStudentTask(user.id, cb.dataset.taskId);
      refreshStudentPanels(user);
    };
  });

  // Render Riwayat Refleksi
  const refListEl = document.getElementById("student-reflection-history");
  refListEl.innerHTML = data.reflections.length
    ? data.reflections
        .map(
          (r) => `
      <div class="card" style="margin-bottom:12px;padding:16px;">
        <div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:6px;">${r.date}</div>
        <p><strong>Dipelajari:</strong> ${r.learned}</p>
        <p><strong>Perasaan:</strong> ${r.feeling}</p>
        <p><strong>Rencana Perbaikan:</strong> ${r.improvement}</p>
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

function setupTaskManager(user) {
  document.getElementById("form-add-task").onsubmit = (e) => {
    e.preventDefault();
    const title = document.getElementById("task-title-input").value.trim();
    const priority = document.getElementById("task-priority-input").value;
    if (!title) return;
    addStudentTask(user.id, title, priority);
    e.target.reset();
    refreshStudentPanels(user);
  };
}

function setupFocusTimer(user) {
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
    timerInterval = setInterval(() => {
      if (remainingSeconds > 0) {
        remainingSeconds--;
        updateDisplay();
      } else {
        clearInterval(timerInterval);
        const topic = document.getElementById("focus-topic-input").value.trim();
        recordFocusSession(user.id, selectedDurationMinutes, topic);
        alert(`Selamat! Sesi latihan fokus ${selectedDurationMinutes} menit selesai dan dicatat ke Jejak Progres.`);
        remainingSeconds = selectedDurationMinutes * 60;
        updateDisplay();
        refreshStudentPanels(user);
      }
    }, 1000);
  };

  document.getElementById("btn-reset-timer").onclick = () => {
    clearInterval(timerInterval);
    remainingSeconds = selectedDurationMinutes * 60;
    updateDisplay();
  };
}

function setupBarriersChecklist(user) {
  const container = document.getElementById("barriers-checklist");
  const data = getStudentData(user.id);

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

  document.getElementById("btn-save-barriers").onclick = () => {
    const checked = Array.from(container.querySelectorAll('input[type="checkbox"]:checked')).map((el) => el.value);
    saveStudentBarriers(user.id, checked);
    alert("Hasil identifikasi hambatan belajar berhasil disimpan secara non-diagnostik.");
    refreshStudentPanels(user);
  };
}

function setupReflectionForm(user) {
  document.getElementById("form-reflection").onsubmit = (e) => {
    e.preventDefault();
    const learned = document.getElementById("ref-learned").value.trim();
    const feeling = document.getElementById("ref-feeling").value.trim();
    const improvement = document.getElementById("ref-improvement").value.trim();
    if (!learned || !feeling || !improvement) return;
    saveStudentReflection(user.id, learned, feeling, improvement);
    e.target.reset();
    alert("Refleksi belajar tersimpan di ruang pribadimu!");
    refreshStudentPanels(user);
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

/* ==========================================================================
   DASHBOARD KHUSUS ADMIN GURU BK (mltihrnnda@gmail.com)
   ========================================================================== */
function renderAdminDashboard(adminUser) {
  document.getElementById("admin-name-label").textContent = adminUser.fullName;
  renderRPLSection("admin-rpl-container");

  document.getElementById("btn-admin-logout").onclick = () => {
    logoutUser();
    renderCurrentRoute();
  };

  document.getElementById("btn-export-admin-xlsx").onclick = () => exportAdminRecapWorkbook();

  const students = getRegisteredStudents();
  document.getElementById("admin-total-students").textContent = students.length;

  let totalReflections = 0;
  let totalFocus = 0;
  const tbody = document.getElementById("admin-students-tbody");

  tbody.innerHTML = students.length
    ? students
        .map((st, i) => {
          const pData = getStudentData(st.id);
          totalReflections += pData.reflections.length;
          totalFocus += pData.focusSessions.length;
          const activeSteps =
            (pData.selectedBarriers.length > 0 ? 1 : 0) +
            (pData.tasks.length > 0 ? 1 : 0) +
            (pData.focusSessions.length > 0 ? 1 : 0) +
            (pData.reflections.length > 0 ? 1 : 0);

          return `
        <tr>
          <td>${i + 1}</td>
          <td>${st.nis}</td>
          <td><strong>${st.fullName}</strong></td>
          <td>${st.kelas}</td>
          <td>${pData.focusSessions.length} sesi</td>
          <td>${pData.reflections.length} catatan</td>
          <td><span class="badge ${activeSteps >= 3 ? "badge-low" : "badge-mid"}">${activeSteps}/4 Indikator RPL</span></td>
        </tr>`;
        })
        .join("")
    : `<tr><td colspan="7" style="text-align:center;color:var(--text-muted);">Belum ada peserta didik yang membuat akun pada perangkat ini.</td></tr>`;

  document.getElementById("admin-total-reflections").textContent = totalReflections;
  document.getElementById("admin-total-focus").textContent = totalFocus;
}
