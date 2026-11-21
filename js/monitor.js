import { api } from "./auth.js";
import { setupBkPage } from "./bk.js";
import { exportAdminRecapWorkbook } from "./excel-sync.js";
import { APP_CONFIG } from "./config.js";
import { JAKARTA } from "./learning-rules.js";
import { escapeHtml, setupMobileMenu, showDialog } from "./ui.js";
import { pagePath, WORKSPACES } from "./workspaces.js";

const roles = { admin: "Admin Central", bk: "Guru BK", student: "Siswa", guardian: "Orang Tua/Wali" };
const accountStatuses = {
  pending: "Menunggu persetujuan",
  enabled: "Diizinkan",
  disabled: "Dinonaktifkan",
  unlisted: "Email belum diizinkan",
  unprofiled: "Belum ada profil",
};
const schoolOptions = (schools) => schools.map(({ id, name }) => [id, name]);
const pageDetails = {
  ringkasan: ["home", "Pantau sesi Guru BK dan siswa di sekolah yang terdaftar."],
  "guru-bk": ["users", "Lihat daftar Guru BK dan aktivitas login per sekolah."],
  siswa: ["user", "Pantau status sesi dan progres belajar siswa."],
  sekolah: ["school", "Kelola sekolah dan kelas yang menggunakan Focura."],
  akun: ["lock", "Tetapkan peran dan izin login untuk akun yang terdaftar."],
  "orang-tua": ["users", "Kelola siswa yang dapat dilihat oleh setiap orang tua atau wali."],
  rpl: ["document", "Panduan pelaksanaan layanan bimbingan klasikal menggunakan Focura."],
  "beranda-bk": ["home", "Ringkasan aktivitas pendampingan di sekolah penugasan."],
  pemantauan: ["chart", "Pantau aktivitas belajar, angket kebutuhan awal, dan pemetaan hambatan siswa."],
  materi: ["book", "Kelola materi Google Drive yang tersedia di sekolah penugasan."],
  database: ["document", "Ekspor rekap dan impor hasil angket kebutuhan awal."],
  "pratinjau-siswa": ["user", "Coba fitur di ruang siswa."],
};

function icon(name) {
  return `<svg class="ui-icon" aria-hidden="true"><use href="/assets/svg/interface.svg#${name}" /></svg>`;
}

function options(items, selected) {
  return items.map(([value, label]) => `<option value="${escapeHtml(value)}"${value === selected ? " selected" : ""}>${escapeHtml(label)}</option>`).join("");
}

function table(headers, rows, empty) {
  if (!rows.length) return `<p class="workspace-empty dashboard-fill">${escapeHtml(empty)}</p>`;
  const columns = headers.map(escapeHtml);
  return `<div class="workspace-table dashboard-fill" tabindex="0" role="region" aria-label="Tabel ${columns[0].toLowerCase()}">
    <table role="table"><thead role="rowgroup"><tr role="row">
      ${columns.map((column) => `<th scope="col" role="columnheader">${column}</th>`).join("")}
    </tr></thead><tbody role="rowgroup">
      ${rows.map((cells) => `<tr role="row">${cells.map((cell, index) => `<td role="cell">
        ${index ? `<span class="workspace-cell-label" aria-hidden="true">${columns[index]}</span>` : ""}
        <div>${cell}</div>
      </td>`).join("")}</tr>`).join("")}
    </tbody></table></div>`;
}

function rowAction(action, label, id = "") {
  return `<button type="button" class="workspace-row-action" data-action="${action}" data-id="${escapeHtml(id)}">${label}</button>`;
}

function identity(name, description) {
  return `<strong>${escapeHtml(name)}</strong>${description ? `<span class="workspace-meta">${escapeHtml(description)}</span>` : ""}`;
}

function sessionStatus(account) {
  const lastLogin = account.lastLoginAt ? new Date(account.lastLoginAt).toLocaleString("id-ID", { timeZone: JAKARTA }) : "Belum pernah login";
  return `<span class="session-status${account.active ? " is-active" : ""}">${account.active ? "Sedang login" : "Tidak aktif"}</span>
    <span class="workspace-meta">${escapeHtml(lastLogin)}</span>`;
}

function overview(stats) {
  const sum = (field) => stats.reduce((total, school) => total + school[field], 0);
  return `<dl class="workspace-stats">
    <div><dt><span class="icon-tile">${icon("school")}</span>Sekolah terdaftar</dt><dd>${stats.length}</dd></div>
    <div><dt><span class="icon-tile">${icon("users")}</span>Guru BK sedang login</dt><dd>${sum("activeTeachers")}</dd></div>
    <div><dt><span class="icon-tile">${icon("user")}</span>Siswa sedang login</dt><dd>${sum("activeStudents")}</dd></div>
  </dl>
  <section class="workspace-section dashboard-fill">
    <div class="workspace-section-heading"><h2>Aktivitas per sekolah</h2><p>Jumlah akun yang sedang login dari total akun terdaftar.</p></div>
    ${table(["Sekolah", "Guru BK login / terdaftar", "Siswa login / terdaftar", "Daftar siswa"], stats.map((school) => [
      identity(school.name), `${school.activeTeachers} / ${school.teachers}`, `${school.activeStudents} / ${school.students}`,
      `<a class="workspace-row-action" href="/admin/siswa?sekolah=${encodeURIComponent(school.id)}">Lihat siswa</a>`,
    ]), "Belum ada sekolah. Tambahkan sekolah melalui menu Sekolah & Kelas.")}
  </section>`;
}

function directoryFilters(data, school, grade, showClass) {
  return `<div class="workspace-filters">
    <label for="filter-school">Sekolah<select class="form-control" id="filter-school">${options([["", "Semua sekolah"], ...schoolOptions(data.schools)], school)}</select></label>
    ${showClass ? `<label for="filter-class">Kelas<select class="form-control" id="filter-class">${options([
      ["", "Semua kelas"], ["unassigned", "Belum Memiliki Kelas"],
      ...data.classes.filter((entry) => !school || entry.schoolId === school).map(({ id, name }) => [id, name]),
    ], grade)}</select></label>` : ""}
  </div>`;
}

function schoolDirectory(data) {
  return table(["Sekolah", "Kelas", "Tindakan"], data.schools.map((school) => {
    const classes = data.classes.filter(({ schoolId }) => schoolId === school.id);
    return [identity(school.name), escapeHtml(classes.map(({ name }) => name).join(", ") || "Belum ada kelas"),
      `<div class="workspace-actions">${rowAction("edit-school", "Ubah nama", school.id)}${rowAction("add-class", "Tambah kelas", school.id)}</div>`];
  }), "Belum ada sekolah.");
}

function accountStatus(account) {
  if (account.registrationPending) return "pending";
  if (!account.enabled) return "disabled";
  return account.emailAllowed ? "enabled" : "unlisted";
}

function accountDirectory(data, role, status) {
  const rows = data.accounts.filter((account) => (!role || account.role === role) && (!status || accountStatus(account) === status))
    .sort((a, b) => Number(Boolean(b.registrationPending)) - Number(Boolean(a.registrationPending)))
    .map((account) => [
      identity(account.fullName, account.email), escapeHtml(roles[account.role]),
      accountStatuses[accountStatus(account)],
      rowAction("edit-account", account.registrationPending ? "Tinjau pendaftaran" : "Kelola", account.email),
    ]);
  if (!role && (!status || status === "unprofiled")) {
    for (const email of data.pendingEmails) {
      rows.push([identity(email), "—", accountStatuses.unprofiled, rowAction("edit-account", "Buat profil", email)]);
    }
  }
  const empty = role || status ? "Tidak ada akun yang cocok. Ubah pilihan filter untuk melihat akun lain." : "Belum ada akun.";
  return `${data.schools.length ? "" : '<p class="workspace-note">Tambahkan sekolah melalui <a href="/admin/sekolah">Sekolah &amp; Kelas</a> untuk membuat atau menyetujui akun Guru BK dan siswa.</p>'}
    <div class="workspace-filters">
      <label>Peran<select class="form-control" id="filter-account-role">${options([["", "Semua peran"], ...Object.entries(roles)], role)}</select></label>
      <label>Status akun<select class="form-control" id="filter-account-status">${options([["", "Semua status"], ...Object.entries(accountStatuses)], status)}</select></label>
    </div>
    ${table(["Akun", "Peran", "Status akun", "Tindakan"], rows, empty)}`;
}

function guardianDirectory(data) {
  const names = new Map(data.accounts.map(({ id, fullName, email }) => [id, identity(fullName, email)]));
  return table(["Orang tua/wali", "Siswa", "Tindakan"], data.links.map(({ guardianId, studentId }) => [
    names.get(guardianId), names.get(studentId),
    `<button type="button" class="workspace-row-action" data-action="unlink" data-guardian="${escapeHtml(guardianId)}" data-student="${escapeHtml(studentId)}">Lepas tautan</button>`,
  ]), "Belum ada wali yang ditautkan ke siswa.");
}

function accountForm(data, address) {
  const selected = data.accounts.find(({ email }) => email === address);
  const pending = selected?.registrationPending;
  const roleChoices = pending ? [["bk", roles.bk]] : address ? Object.entries(roles)
    : [["", "Pilih peran"], ["bk", roles.bk], ["student", roles.student]];
  return `<form data-operation="account" data-id="${escapeHtml(selected?.id)}" class="workspace-form">
    ${pending ? '<p>Pilih sekolah untuk memberi Guru BK akses ke ruang kerja sekolah tersebut.</p>' : ""}
    <label>Email Google<input class="form-control" type="email" name="email" maxlength="254" required value="${escapeHtml(address)}"${address ? " readonly" : ""}></label>
    <label>Nama<input class="form-control" name="fullName" required maxlength="120" value="${escapeHtml(selected?.fullName)}"></label>
    <label>Peran<select class="form-control" name="role" required>${options(roleChoices, selected?.role || (address ? "student" : ""))}</select></label>
    <label data-account-school>Sekolah<select class="form-control" name="schoolId">${options([["", "Pilih sekolah"], ...schoolOptions(data.schools)], selected?.schoolId)}</select></label>
    <label data-account-nis>NIS<input class="form-control" name="nis" maxlength="60" value="${escapeHtml(selected?.nis)}"></label>
    ${pending ? '<input type="hidden" name="enabled" value="on">' : `<label class="workspace-check"><input type="checkbox" name="enabled" ${selected?.enabled !== false ? "checked" : ""}> Izinkan login</label>`}
    <button type="submit" class="btn btn-primary">${pending ? "Setujui pendaftaran" : "Simpan akun"}</button>
  </form>`;
}

function accountFields(form) {
  const role = form.elements.role.value;
  const requiresSchool = role === "student" || role === "bk";
  form.querySelector("[data-account-school]").hidden = !requiresSchool;
  form.elements.schoolId.required = requiresSchool;
  form.querySelector("[data-account-nis]").hidden = role !== "student";
}

export async function setupMonitor(user, workspace, section, renderRPLSection) {
  const { pages, name } = WORKSPACES[workspace];
  const central = workspace === "admin";
  const shell = document.getElementById("admin-app-view");
  const content = document.getElementById("monitor-content");
  const feedback = document.getElementById("monitor-feedback");
  const actions = document.getElementById("monitor-actions");
  const nav = document.getElementById("monitor-nav");
  setupMobileMenu(document.getElementById("monitor-menu-toggle"));
  const centralInBk = user.role === "admin" && workspace === "bk";
  const schoolQuery = new URLSearchParams(window.location.search).get("sekolah") || "";
  const bkSchoolQuery = centralInBk && schoolQuery ? `?sekolah=${encodeURIComponent(schoolQuery)}` : "";
  const workspacePath = (slug) => pagePath(workspace, slug) + bkSchoolQuery;
  const bkApi = (path, method, body) => api(path + (centralInBk ? `?school=${encodeURIComponent(schoolQuery)}` : ""), method, body);
  const defaultPage = central ? "ringkasan" : "beranda-bk";
  document.getElementById("monitor-role").textContent = name;
  document.getElementById("monitor-title").textContent = pages[section];
  document.getElementById("monitor-description").textContent = pageDetails[section || defaultPage][1];
  document.getElementById("admin-name-label").textContent = user.fullName;
  nav.innerHTML = Object.entries(pages).map(([slug, label]) =>
    `<a href="${escapeHtml(workspacePath(slug))}"${slug === section ? ' aria-current="page"' : ""}>${icon(pageDetails[slug || defaultPage][0])}${escapeHtml(label)}</a>`).join("");
  if (central) nav.insertAdjacentHTML("beforeend", `<a href="/bk">${icon("school")}Ruang Guru BK</a>`);
  if (centralInBk) nav.insertAdjacentHTML("beforeend", `<a href="/admin">${icon("home")}Kembali ke Admin Central</a>`);

  const home = document.getElementById("monitor-home");
  home.hidden = !section;
  home.href = workspacePath("");

  if (centralInBk) {
    const { schools } = await api("central/views/sekolah");
    const context = document.getElementById("monitor-context");
    const selectedSchool = schools.find(({ id }) => id === schoolQuery);
    const schoolPath = (id) => pagePath(workspace, section) + (id ? `?sekolah=${encodeURIComponent(id)}` : "");
    context.innerHTML = `<div class="workspace-filters"><label class="workspace-school-picker">Sekolah untuk ruang Guru BK
      <select class="form-control">${options([["", selectedSchool ? "Hapus pilihan sekolah" : "Pilih sekolah"], ...schoolOptions(schools)], selectedSchool?.id || "")}</select>
      </label></div>`;
    context.querySelector("select").onchange = ({ target }) => window.location.assign(schoolPath(target.value));
    if (section !== "rpl" && !selectedSchool) {
      content.innerHTML = schools.length
        ? '<p class="workspace-empty dashboard-fill">Pilih sekolah untuk membuka data dan fitur Guru BK.</p>'
        : '<p class="workspace-empty dashboard-fill">Tambahkan sekolah melalui menu <a href="/admin/sekolah">Sekolah &amp; Kelas</a>.</p>';
      return;
    }
  }

  if (section === "rpl") {
    actions.innerHTML = `<a href="${escapeHtml(APP_CONFIG.consultationFormUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-outline">Formulir konsultasi</a>`;
    renderRPLSection("monitor-content");
    return;
  }
  if (!central && section !== "siswa") {
    await setupBkPage(section, { content, feedback, actions, bkApi, workspacePath });
    return;
  }

  const endpoint = central ? "central/views/" + (section || "ringkasan") : "bk/students";
  const requestDirectory = central ? api : bkApi;
  const studentsView = section === "siswa";
  const filters = new URLSearchParams(window.location.search);
  let school = filters.get("sekolah") || "";
  let grade = filters.get("kelas") || "";
  let search = "";
  let accountRole = "";
  let accountState = "";
  let data;
  let busy = false;
  const matchesSchool = (row) => !central || !school || row.schoolId === school;
  const matchesClass = (student) => !grade || (student.classId || "unassigned") === grade;
  const matchesSearch = (student) => !search || [student.fullName, student.email, student.nis]
    .some((value) => String(value ?? "").toLocaleLowerCase("id-ID").includes(search.trim().toLocaleLowerCase("id-ID")));

  actions.innerHTML = `<button type="button" class="btn btn-outline" data-action="refresh">Muat ulang</button>
    ${studentsView ? '<button type="button" class="btn btn-outline" data-action="export">Ekspor Excel</button>' : ""}
    ${section === "akun" ? '<button type="button" class="btn btn-primary" data-action="add-account" disabled>Tambah akun</button>' : ""}
    ${section === "sekolah" ? '<button type="button" class="btn btn-primary" data-action="add-school">Tambah sekolah</button>' : ""}
    ${section === "orang-tua" ? '<button type="button" class="btn btn-primary" data-action="link" disabled>Tautkan wali</button>' : ""}`;

  function renderStudentRows() {
    const students = data.students.filter(matchesSchool).filter(matchesClass).filter(matchesSearch);
    document.getElementById("directory-results").innerHTML = central
      ? table(["Siswa", "Sekolah dan kelas", "Status sesi", "Progres", "Tindakan"],
          students.map((student) => [
            identity(student.fullName, student.nis ? `NIS ${student.nis}` : ""),
            identity(student.kelas, student.school),
            sessionStatus(student),
            `${student.focusCount} sesi · ${student.reflectionCount} refleksi<span class="workspace-meta">${student.rplCount}/4 indikator RPL</span>`,
            rowAction("edit-class", "Ubah kelas", student.id),
          ]), "Tidak ada siswa dalam daftar ini.")
      : table(["Peserta didik", "Kelas", "Aktivitas RPL", "Sesi fokus", "Privasi refleksi", "Status sesi"], students.map((student) => [
        identity(student.fullName, student.email),
        identity(student.kelas, student.nis ? `NIS ${student.nis}` : ""),
        identity(`${student.rplCount}/4`, student.rplCount >= 3 ? "Tercapai" : "Perlu pendampingan"),
        escapeHtml(student.focusCount),
        identity("Isi privat", `${student.reflectionCount} catatan`),
        sessionStatus(student),
      ]), "Tidak ada peserta didik yang cocok.");
  }

  function render() {
    if (studentsView) {
      content.innerHTML = `${central ? directoryFilters(data, school, grade, true) : `
        <p class="workspace-note">${escapeHtml(data.schools[0]?.name)} · Ketercapaian RPL minimal 3 dari 4 aktivitas.</p>
        <div class="workspace-filters">
          <label>Cari peserta didik<input type="search" class="form-control" id="filter-student-search" value="${escapeHtml(search)}" placeholder="Nama, email, atau NIS"></label>
          <label>Kelas<select class="form-control" id="filter-class">${options([["", "Semua kelas"], ["unassigned", "Belum Memiliki Kelas"],
            ...data.classes.map(({ id, name }) => [id, name])], grade)}</select></label>
        </div>`}<div id="directory-results" class="dashboard-panel"></div>`;
      renderStudentRows();
    } else if (section === "guru-bk") {
      content.innerHTML = directoryFilters(data, school, grade, false) + table(["Guru BK", "Sekolah", "Status sesi"],
        data.teachers.filter(matchesSchool).map((teacher) => [identity(teacher.fullName), escapeHtml(teacher.school), sessionStatus(teacher)]),
        "Tidak ada guru BK dalam daftar ini.");
    } else if (section === "sekolah") {
      content.innerHTML = schoolDirectory(data);
    } else if (section === "akun") {
      actions.querySelector('[data-action="add-account"]').disabled = !data.schools.length;
      content.innerHTML = accountDirectory(data, accountRole, accountState);
    } else if (section === "orang-tua") {
      const canLink = ["guardian", "student"].every((role) => data.accounts.some((account) => account.role === role));
      actions.querySelector('[data-action="link"]').disabled = !canLink;
      content.innerHTML = (canLink ? "" : '<p class="workspace-note">Siapkan profil wali dan siswa melalui menu <a href="/admin/akun">Akun</a>.</p>') + guardianDirectory(data);
    } else {
      content.innerHTML = overview(data.stats);
    }
  }

  async function refresh(message = "") {
    content.setAttribute("aria-busy", "true");
    try {
      data = await requestDirectory(endpoint);
      render();
      feedback.textContent = message;
    } catch (error) {
      feedback.textContent = error.message;
    } finally {
      content.removeAttribute("aria-busy");
    }
  }

  async function save(action, dialog) {
    if (busy) return;
    busy = true;
    const status = dialog?.querySelector(".workspace-feedback") || feedback;
    status.textContent = "";
    try {
      await action();
      dialog?.close();
      await refresh("Perubahan disimpan.");
    } catch (error) {
      status.textContent = error.message;
    } finally {
      busy = false;
    }
  }

  shell.addEventListener("click", async (event) => {
    const actionButton = event.target.closest("[data-action]");
    if (!actionButton) return;
    const { action, id, guardian, student } = actionButton.dataset;
    if (action === "refresh") {
      await refresh("Data diperbarui.");
      return;
    }
    if (!data) return;
    if (action === "export") {
      try {
        const current = await requestDirectory(central && school ? `${endpoint}?school=${encodeURIComponent(school)}` : endpoint);
        exportAdminRecapWorkbook(current.students.filter(matchesClass).filter(matchesSearch));
      } catch (error) {
        feedback.textContent = error.message;
      }
    } else if (action === "add-school" || action === "edit-school") {
      const selected = data.schools.find((entry) => entry.id === id);
      showDialog(content, selected ? "Ubah nama sekolah" : "Tambah sekolah", `<form class="workspace-form" data-operation="school" data-id="${escapeHtml(id)}">
        <label>Nama sekolah<input class="form-control" name="name" required maxlength="120" value="${escapeHtml(selected?.name)}"></label>
        <button type="submit" class="btn btn-primary">Simpan sekolah</button></form>`);
    } else if (action === "add-class") {
      const selected = data.schools.find((entry) => entry.id === id);
      showDialog(content, "Tambah kelas", `<form class="workspace-form" data-operation="newClass" data-id="${escapeHtml(id)}">
        <p>${escapeHtml(selected.name)}</p>
        <label>Nama kelas<input class="form-control" name="name" required maxlength="80"></label>
        <button type="submit" class="btn btn-primary">Simpan kelas</button></form>`);
    } else if (action === "add-account" || action === "edit-account") {
      const pending = data.accounts.some(({ email, registrationPending }) => email === id && registrationPending);
      const title = pending ? "Tinjau pendaftaran Guru BK" : id ? "Profil akun" : "Tambah akun";
      showDialog(content, title, accountForm(data, id));
      accountFields(content.querySelector('form[data-operation="account"]'));
    } else if (action === "edit-class") {
      const selected = data.students.find((entry) => entry.id === id);
      const classes = data.classes.filter((entry) => entry.schoolId === selected.schoolId);
      showDialog(content, "Ubah kelas", `<form class="workspace-form" data-operation="class" data-id="${escapeHtml(id)}">
        <p>${identity(selected.fullName, selected.school)}</p>
        <label>Kelas<select name="classId" class="form-control" required>${options([["", "Pilih kelas"], ...schoolOptions(classes)], selected.classId)}</select></label>
        <div class="workspace-actions"><button class="btn btn-primary" type="submit">Tetapkan kelas</button>
        ${selected.classId ? '<button class="btn btn-outline workspace-destructive" type="submit" value="remove" formnovalidate>Keluarkan dari kelas</button>' : ""}</div>
      </form>`);
    } else if (action === "link") {
      const people = (role) => options([["", "Pilih akun"], ...data.accounts.filter((entry) => entry.role === role).map(({ id: accountId, fullName, email }) => [accountId, `${fullName} (${email})`])]);
      showDialog(content, "Tautkan wali ke siswa", `<form class="workspace-form" data-operation="link">
        <label>Orang tua/wali<select class="form-control" name="guardianId" required>${people("guardian")}</select></label>
        <label>Siswa<select class="form-control" name="studentId" required>${people("student")}</select></label>
        <button type="submit" class="btn btn-primary">Tautkan wali</button></form>`);
    } else if (action === "unlink") {
      await save(() => api("central/guardian-links", "POST", { guardianId: guardian, studentId: student, enabled: false }));
    }
  });

  content.addEventListener("input", (event) => {
    if (event.target.id !== "filter-student-search") return;
    search = event.target.value;
    renderStudentRows();
  });

  content.addEventListener("change", (event) => {
    const input = event.target;
    if (input.id === "filter-school" || input.id === "filter-class") {
      if (input.id === "filter-school") {
        school = input.value;
        grade = "";
      } else {
        grade = input.value;
      }
      for (const [key, value] of [["sekolah", school], ["kelas", grade]]) {
        if (value) filters.set(key, value);
        else filters.delete(key);
      }
      const query = filters.toString();
      window.history.replaceState(window.history.state, "", window.location.pathname + (query ? "?" + query : ""));
      render();
      document.getElementById(input.id).focus();
    } else if (input.id === "filter-account-role" || input.id === "filter-account-status") {
      if (input.id === "filter-account-role") accountRole = input.value;
      else accountState = input.value;
      render();
      document.getElementById(input.id).focus();
    } else if (input.name === "role") {
      accountFields(input.form);
    }
  });

  content.addEventListener("submit", async (event) => {
    event.preventDefault();
    const { operation, id } = event.target.dataset;
    const form = Object.fromEntries(new FormData(event.target));
    const remove = event.submitter?.value === "remove";
    const dialog = event.target.closest("dialog");
    const writes = {
      school: () => api(id ? `central/schools/${id}` : "central/schools", id ? "PATCH" : "POST", { name: form.name }),
      newClass: () => api(`schools/${id}/classes`, "POST", { name: form.name }),
      account: () => api(id ? `central/accounts/${id}` : "central/accounts", id ? "PATCH" : "POST", { ...form, enabled: Boolean(form.enabled) }),
      class: () => api(`central/students/${id}/class`, "PATCH", { classId: remove ? null : form.classId }),
      link: () => api("central/guardian-links", "POST", form),
    };
    await save(writes[operation], dialog);
  });

  content.innerHTML = '<p class="workspace-empty" role="status">Memuat data…</p>';
  await refresh();
}
