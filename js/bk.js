import { api } from "./auth.js";
import { APP_CONFIG } from "./config.js";
import { exportAdminRecapWorkbook, exportSurveyTemplate, importReportText, importSurveyWorkbook } from "./excel-sync.js";
import { SURVEY_ITEMS } from "./learning-rules.js";
import { escapeHtml as esc, openDriveModal, showDialog } from "./ui.js";

const totalsList = (items) => `<dl class="workspace-stats">${items.map(([label, total]) =>
  `<div><dt>${esc(label)}</dt><dd>${esc(total)}</dd></div>`).join("")}</dl>`;

function monitoring({ totals, surveyRespondents, survey, barrierRespondents, barriers }) {
  const surveyChart = surveyRespondents ? `<p class="panel-description">Skala 1 (sangat tidak setuju) sampai 5 (sangat setuju).</p>
    <ul class="analytics-chart">${Object.entries(SURVEY_ITEMS).map(([key, label]) => {
      const counts = survey[key];
      return `<li><strong>${esc(label)}</strong>
        <div class="survey-track" aria-hidden="true">${counts.map((count, index) => `<span class="survey-score-${index + 1}" style="width:${100 * count / surveyRespondents}%"></span>`).join("")}</div>
        <span class="workspace-meta">${counts.map((count, index) => `Skor ${index + 1}: ${esc(count)}`).join(" · ")}</span></li>`;
    }).join("")}</ul>` : '<p class="workspace-empty">Belum ada respons angket. Impor hasilnya melalui <a href="/bk/database">Database Excel &amp; Form</a>.</p>';

  const barrierChart = barrierRespondents ? `<p class="panel-description">Persentase dihitung dari siswa yang memilih setidaknya satu hambatan. Siswa dapat memilih lebih dari satu.</p>
    <ul class="analytics-chart">${APP_CONFIG.barriersList.map(({ id, label }) =>
      `<li><label><strong>${esc(label)}</strong><progress max="${esc(barrierRespondents)}" value="${esc(barriers[id])}"></progress></label>
        <span class="workspace-meta">${esc(barriers[id])} siswa · ${Math.round(100 * barriers[id] / barrierRespondents)}%</span></li>`).join("")}</ul>`
    : '<p class="workspace-empty">Belum ada siswa yang memilih hambatan belajar.</p>';

  return `${totalsList([["Peserta didik", totals.students], ["Respons angket awal", surveyRespondents], ["Siswa mengisi pemetaan", barrierRespondents]])}
    <div class="analytics-grid">
      <section class="card"><h2 class="panel-title">Hasil angket kebutuhan awal</h2>${surveyChart}</section>
      <section class="card"><h2 class="panel-title">Kategori hambatan konsentrasi</h2>${barrierChart}</section>
    </div>
    <section class="bk-activity"><h2 class="panel-title">Rekap kegiatan siswa</h2>
      ${totalsList([["Tugas selesai", totals.doneTasks], ["Sesi fokus selesai", totals.focusCount], ["Refleksi tercatat", totals.reflectionCount]])}
    </section>`;
}

export async function setupBkPage(section, { content, feedback, actions }) {
  if (section === "materi") {
    await setupMaterials(content, feedback, actions);
    return;
  }
  if (section === "database") {
    setupDatabase(content, feedback, actions);
    return;
  }

  actions.innerHTML = '<button type="button" class="btn btn-outline">Muat ulang</button>';
  const reload = actions.querySelector("button");
  async function refresh() {
    reload.disabled = true;
    content.setAttribute("aria-busy", "true");
    try {
      const summary = await api("bk/summary");
      const { school, totals } = summary;
      const home = `${totalsList([["Peserta didik", totals.students], ["Siswa dengan aktivitas RPL", totals.activeLearners], ["Mencapai minimal 3 dari 4 aktivitas RPL", totals.rplAchieved]])}
        <section class="card"><h2 class="panel-title">Aktivitas pendampingan</h2>
          <p class="panel-description">${totals.activeLearners ? `${esc(totals.focusCount)} sesi fokus, ${esc(totals.doneTasks)} tugas selesai, dan ${esc(totals.reflectionCount)} refleksi tercatat.` : "Belum ada aktivitas belajar yang tercatat di sekolah penugasan."}</p>
          <div class="workspace-actions"><a class="btn btn-primary" href="/bk/siswa">Lihat peserta didik</a><a class="btn btn-outline" href="/bk/pemantauan">Buka pemantauan</a></div>
        </section>`;
      content.innerHTML = `<p class="workspace-note">${esc(school)}</p>${section === "pemantauan" ? monitoring(summary) : home}`;
      feedback.textContent = "";
    } catch (error) {
      feedback.textContent = error.message;
    } finally {
      reload.disabled = false;
      content.removeAttribute("aria-busy");
    }
  }
  reload.onclick = refresh;
  await refresh();
}

async function setupMaterials(content, feedback, actions) {
  actions.innerHTML = '<button type="button" class="btn btn-primary">Tambah modul</button>';
  const add = actions.querySelector("button");
  let modules = [];
  let busy = false;
  async function refresh() {
    modules = await api("bk/modules");
    content.innerHTML = `<p class="workspace-note">Pastikan izin berbagi di Google sesuai dengan peserta didik yang menggunakan materi.</p>
      <div class="card-grid">${modules.map((module) => `<article class="card drive-module" data-module="${esc(module.id)}">
        <div>${module.category ? `<p class="workspace-meta">${esc(module.category)}</p>` : ""}
        <h2>${esc(module.title)}</h2><p>${esc(module.description)}</p></div>
        <div class="workspace-actions">
          <button type="button" class="btn btn-outline" data-module-action="preview">Pratinjau</button>
          <button type="button" class="workspace-row-action" data-module-action="edit">Ubah</button>
          <button type="button" class="workspace-row-action workspace-destructive" data-module-action="remove">Hapus</button>
        </div></article>`).join("") || '<p class="workspace-empty">Belum ada modul yang tersedia.</p>'}</div>`;
  }
  function edit(module) {
    const dialog = showDialog(content, module ? "Ubah modul" : "Tambah modul", `<form class="workspace-form">
      <label>Judul<input class="form-control" name="title" maxlength="160" required value="${esc(module?.title)}"></label>
      <label>Kategori<input class="form-control" name="category" maxlength="80" value="${esc(module?.category)}"></label>
      <label>Deskripsi<textarea class="form-control" name="description" rows="3" maxlength="1500" required>${esc(module?.description)}</textarea></label>
      <label>Tautan Google Drive<input class="form-control" name="editUrl" type="url" required maxlength="2048" value="${esc(module?.editUrl)}"></label>
      <button type="submit" class="btn btn-primary">Simpan modul</button></form>`);
    dialog.querySelector("form").onsubmit = async (event) => {
      event.preventDefault();
      if (busy) return;
      busy = event.submitter.disabled = true;
      const status = dialog.querySelector("[role=status]");
      const fields = Object.fromEntries(new FormData(event.target));
      try {
        await api(module ? `bk/modules/${encodeURIComponent(module.id)}` : "bk/modules", module ? "PATCH" : "POST", fields);
        dialog.close();
        feedback.textContent = "Modul disimpan.";
        await refresh();
        add.focus();
      } catch (error) {
        (dialog.open ? status : feedback).textContent = error.message;
      } finally {
        busy = event.submitter.disabled = false;
      }
    };
  }
  add.onclick = () => edit();
  content.onclick = async ({ target }) => {
    const button = target.closest("[data-module-action]");
    if (!button || busy) return;
    const module = modules.find(({ id }) => id === button.closest("[data-module]").dataset.module);
    if (!module) return;
    if (button.dataset.moduleAction === "preview") openDriveModal(module);
    else if (button.dataset.moduleAction === "edit") edit(module);
    else if (window.confirm(`Hapus modul “${module.title}” dari daftar sekolah ini?`)) {
      busy = button.disabled = true;
      try {
        await api(`bk/modules/${encodeURIComponent(module.id)}`, "DELETE");
        feedback.textContent = "Modul dihapus dari daftar sekolah.";
        await refresh();
        add.focus();
      } catch (error) {
        feedback.textContent = error.message;
      } finally {
        busy = button.disabled = false;
      }
    }
  };
  try { await refresh(); } catch (error) { feedback.textContent = error.message; }
}

function setupDatabase(content, feedback, actions) {
  actions.innerHTML = '<button type="button" class="btn btn-primary">Ekspor workbook Excel</button>';
  actions.querySelector("button").onclick = async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const [directory, summary] = await Promise.all([api("bk/students"), api("bk/summary")]);
      exportAdminRecapWorkbook(directory.students, summary);
      feedback.textContent = "Workbook rekap siap diunduh.";
    } catch (error) {
      feedback.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  };
  content.innerHTML = `<section class="card">
    <h2 class="panel-title">Impor angket kebutuhan awal</h2>
    <p class="panel-description">Masukkan satu respons anonim per baris. Isi Kode_Respons dengan kode unik berbentuk teks, lalu isi empat kolom jawaban dengan skor 1 (sangat tidak setuju) sampai 5 (sangat setuju). Gunakan tab Angket_Awal atau CSV dengan kolom yang sama.</p>
    <dl class="survey-columns">${Object.entries(SURVEY_ITEMS).map(([key, label]) => `<div><dt>${esc(key)}</dt><dd>${esc(label)}</dd></div>`).join("")}</dl>
    <div class="workspace-actions">
      <button type="button" id="survey-template" class="btn btn-outline">Unduh template angket</button>
      <label class="btn btn-outline file-button">Periksa Excel atau CSV<input id="survey-file" class="visually-hidden" type="file" accept=".xlsx,.xls,.csv"></label>
      <button type="button" id="survey-save" class="btn btn-primary" hidden>Simpan respons valid</button>
    </div>
    <p id="survey-status" class="workspace-feedback" role="status"></p></section>
    <section class="card bk-activity"><h2 class="panel-title">Formulir konsultasi</h2>
      <p class="panel-description">Formulir dibuka melalui Google Forms. Rekap Excel memuat ringkasan kegiatan dan angket awal.</p>
      <a href="${esc(APP_CONFIG.consultationFormUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-outline">Buka Google Forms</a>
    </section>`;

  content.querySelector("#survey-template").onclick = () => {
    try { exportSurveyTemplate(); } catch (error) { feedback.textContent = error.message; }
  };
  const input = content.querySelector("#survey-file");
  const save = content.querySelector("#survey-save");
  const status = content.querySelector("#survey-status");
  let rows;
  input.onchange = async () => {
    const [file] = input.files;
    if (!file) return;
    save.hidden = true;
    input.disabled = true;
    status.textContent = "Memeriksa file…";
    try {
      rows = await importSurveyWorkbook(file);
      if (!rows.length) throw new Error("Belum ada respons di file ini.");
      const report = await api("bk/survey", "POST", { rows, preview: true });
      status.textContent = `${file.name} · ${importReportText(report, true)}`;
      save.hidden = report.imported === 0;
    } catch (error) {
      rows = null;
      status.textContent = error.message;
    } finally {
      input.value = "";
      input.disabled = false;
    }
  };
  save.onclick = async () => {
    save.disabled = input.disabled = true;
    try {
      const report = await api("bk/survey", "POST", { rows });
      status.textContent = importReportText(report);
      rows = null;
      save.hidden = true;
    } catch (error) {
      status.textContent = error.message;
    } finally {
      save.disabled = input.disabled = false;
    }
  };
}
