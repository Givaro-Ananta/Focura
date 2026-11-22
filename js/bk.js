import { APP_CONFIG } from "./config.js";
import { exportAdminRecapWorkbook, exportSurveyTemplate, importReportText, importSurveyWorkbook } from "./excel-sync.js";
import { SURVEY_ITEMS } from "./learning-rules.js";
import { confirmDialog, escapeHtml as esc, openDriveModal, setFeedback, showDialog } from "./ui.js";

const totalsList = (items) => `<dl class="workspace-stats">${items.map(([label, total]) =>
  `<div><dt>${esc(label)}</dt><dd>${esc(total)}</dd></div>`).join("")}</dl>`;

function monitoring({ totals, surveyRespondents, survey, barrierRespondents, barriers }, databasePath) {
  const surveyChart = surveyRespondents ? `<p class="panel-description">Skala 1 (sangat tidak setuju) sampai 5 (sangat setuju).</p>
    <ul class="analytics-chart">${Object.entries(SURVEY_ITEMS).map(([key, label]) => {
      const counts = survey[key];
      return `<li><strong>${esc(label)}</strong>
        <div class="survey-track" aria-hidden="true">${counts.map((count, index) => `<span class="survey-score-${index + 1}" style="width:${100 * count / surveyRespondents}%"></span>`).join("")}</div>
        <span class="workspace-meta">${counts.map((count, index) => `Skor ${index + 1}: ${esc(count)}`).join(" · ")}</span></li>`;
    }).join("")}</ul>` : `<p class="workspace-empty">Belum ada respons angket. Impor hasilnya melalui <a href="${esc(databasePath)}">Database Excel &amp; Form</a>.</p>`;

  const barrierChart = barrierRespondents ? `<p class="panel-description">Persentase dihitung dari siswa yang memilih setidaknya satu hambatan. Siswa dapat memilih lebih dari satu.</p>
    <ul class="analytics-chart">${APP_CONFIG.barriersList.map(({ id, label }) =>
      `<li><label><strong>${esc(label)}</strong><progress max="${esc(barrierRespondents)}" value="${esc(barriers[id])}"></progress></label>
        <span class="workspace-meta">${esc(barriers[id])} siswa · ${Math.round(100 * barriers[id] / barrierRespondents)}%</span></li>`).join("")}</ul>`
    : '<p class="workspace-empty">Belum ada siswa yang memilih hambatan belajar.</p>';

  return `${totalsList([["Peserta didik", totals.students], ["Respons angket awal", surveyRespondents], ["Siswa mengisi pemetaan", barrierRespondents]])}
    <div class="analytics-grid dashboard-fill">
      <section class="card"><h2 class="panel-title">Hasil angket kebutuhan awal</h2>${surveyChart}</section>
      <section class="card"><h2 class="panel-title">Kategori hambatan konsentrasi</h2>${barrierChart}</section>
    </div>
    <section class="bk-activity"><h2 class="panel-title">Rekap kegiatan siswa</h2>
      ${totalsList([["Tugas selesai", totals.doneTasks], ["Sesi fokus selesai", totals.focusCount], ["Refleksi tercatat", totals.reflectionCount]])}
    </section>`;
}

export async function setupBkPage(section, { content, feedback, actions, bkApi, workspacePath }) {
  if (section === "materi") {
    await setupMaterials(content, feedback, actions, bkApi);
    return;
  }
  if (section === "database") {
    setupDatabase(content, feedback, actions, bkApi);
    return;
  }

  actions.innerHTML = '<button type="button" class="btn btn-outline">Muat ulang</button>';
  const reload = actions.querySelector("button");
  async function refresh() {
    reload.disabled = true;
    content.setAttribute("aria-busy", "true");
    try {
      const summary = await bkApi("bk/summary");
      const { school, totals } = summary;
      const home = `${totalsList([["Peserta didik", totals.students], ["Siswa dengan aktivitas RPL", totals.activeLearners], ["Mencapai minimal 3 dari 4 aktivitas RPL", totals.rplAchieved]])}
        <section class="card dashboard-fill"><h2 class="panel-title">Aktivitas pendampingan</h2>
          <p class="panel-description">${totals.activeLearners ? `${esc(totals.focusCount)} sesi fokus, ${esc(totals.doneTasks)} tugas selesai, dan ${esc(totals.reflectionCount)} refleksi tercatat.` : "Belum ada aktivitas belajar yang tercatat di sekolah penugasan."}</p>
          <div class="workspace-actions"><a class="btn btn-primary" href="${esc(workspacePath("siswa"))}">Lihat peserta didik</a><a class="btn btn-outline" href="${esc(workspacePath("pemantauan"))}">Buka pemantauan</a></div>
        </section>`;
      content.innerHTML = `<p class="workspace-note">${esc(school)}</p>${section === "pemantauan" ? monitoring(summary, workspacePath("database")) : home}`;
      setFeedback(feedback, "");
    } catch (error) {
      setFeedback(feedback, error.message, "error");
    } finally {
      reload.disabled = false;
      content.removeAttribute("aria-busy");
    }
  }
  reload.onclick = refresh;
  await refresh();
}

async function setupMaterials(content, feedback, actions, bkApi) {
  actions.innerHTML = '<button type="button" class="btn btn-primary">Tambah modul</button>';
  const add = actions.querySelector("button");
  let modules = [];
  let busy = false;
  async function refresh() {
    modules = await bkApi("bk/modules");
    content.innerHTML = `<p class="workspace-note">Pastikan izin berbagi di Google sesuai dengan peserta didik yang menggunakan materi.</p>
      <div class="card-grid dashboard-fill">${modules.map((module) => `<article class="card drive-module" data-module="${esc(module.id)}">
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
        await bkApi(module ? `bk/modules/${encodeURIComponent(module.id)}` : "bk/modules", module ? "PATCH" : "POST", fields);
        dialog.close();
        setFeedback(feedback, "Modul disimpan.", "success");
        await refresh();
        add.focus();
      } catch (error) {
        setFeedback(dialog.open ? status : feedback, error.message, "error");
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
    else if (await confirmDialog(content, {
      title: "Hapus modul",
      message: `Hapus modul “${module.title}” dari daftar sekolah ini?`,
      confirmLabel: "Hapus modul",
      destructive: true,
    })) {
      busy = button.disabled = true;
      try {
        await bkApi(`bk/modules/${encodeURIComponent(module.id)}`, "DELETE");
        setFeedback(feedback, "Modul dihapus dari daftar sekolah.", "success");
        await refresh();
        add.focus();
      } catch (error) {
        setFeedback(feedback, error.message, "error");
      } finally {
        busy = button.disabled = false;
      }
    }
  };
  try { await refresh(); } catch (error) { setFeedback(feedback, error.message, "error"); }
}

function setupDatabase(content, feedback, actions, bkApi) {
  actions.innerHTML = '<button type="button" class="btn btn-primary">Ekspor workbook Excel</button>';
  actions.querySelector("button").onclick = async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const [directory, summary] = await Promise.all([bkApi("bk/students"), bkApi("bk/summary")]);
      exportAdminRecapWorkbook(directory.students, summary);
      setFeedback(feedback, "Workbook rekap siap diunduh.", "success");
    } catch (error) {
      setFeedback(feedback, error.message, "error");
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
    <section class="card bk-activity dashboard-fill"><h2 class="panel-title">Formulir konsultasi</h2>
      <p class="panel-description">Formulir dibuka melalui Google Forms. Rekap Excel memuat ringkasan kegiatan dan angket awal.</p>
      <a href="${esc(APP_CONFIG.consultationFormUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-outline">Buka Google Forms</a>
    </section>`;

  content.querySelector("#survey-template").onclick = () => {
    try { exportSurveyTemplate(); } catch (error) { setFeedback(feedback, error.message, "error"); }
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
    setFeedback(status, "Memeriksa file…", "info");
    try {
      rows = await importSurveyWorkbook(file);
      if (!rows.length) throw new Error("Belum ada respons di file ini.");
      const report = await bkApi("bk/survey", "POST", { rows, preview: true });
      setFeedback(status, `${file.name} · ${importReportText(report, true)}`, report.imported ? "info" : "error");
      save.hidden = report.imported === 0;
    } catch (error) {
      rows = null;
      setFeedback(status, error.message, "error");
    } finally {
      input.value = "";
      input.disabled = false;
    }
  };
  save.onclick = async () => {
    save.disabled = input.disabled = true;
    try {
      const report = await bkApi("bk/survey", "POST", { rows });
      setFeedback(status, importReportText(report), "success");
      rows = null;
      save.hidden = true;
    } catch (error) {
      setFeedback(status, error.message, "error");
    } finally {
      save.disabled = input.disabled = false;
    }
  };
}
