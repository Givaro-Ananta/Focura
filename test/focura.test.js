import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createFocura, SESSION_AGE } from "../server/focura.js";

const profile = (account) => ({ email: account.email, email_verified: true, sub: "google-" + account.id });

function fixture() {
  const account = (id, role, schoolId, classId) => ({
    id, role, schoolId, classId, fullName: id, email: id + "@example.test", enabled: true,
  });
  const admin = account("admin", "admin");
  const teacher = account("bk-a", "bk", "a");
  const secondTeacher = account("bk-b", "bk", "a");
  const guardian = account("wali", "guardian");
  const student = account("siswa-a", "student", "a", "x");
  const stranger = account("siswa-b", "student", "b", "y");
  const tables = {
    Akun: [admin, teacher, secondTeacher, guardian, student, stranger],
    Sekolah: [{ id: "a", name: "SMA 1 Bandar Lampung" }, { id: "b", name: "SMA 1 Talang Padang" }],
    Kelas: [{ id: "x", schoolId: "a", name: "X" }, { id: "y", schoolId: "b", name: "X" }],
    TautanWali: [], Sesi: [], Belajar: [], Modul: [], Angket: [],
  };
  const emails = new Set(tables.Akun.map((entry) => entry.email));
  let now = 1_790_000_000_000;
  const store = {
    async emails() { return new Set(emails); },
    async addEmail(email) {
      assert(!emails.has(email), "Email tidak boleh ditambahkan dua kali");
      emails.add(email);
    },
    async read(...names) {
      return Object.fromEntries(names.map((name) => [name, structuredClone(tables[name])]));
    },
    async write(changes) {
      for (const [name, record] of changes) {
        const index = tables[name].findIndex((entry) => entry.id === record.id);
        if (index < 0) tables[name].push(structuredClone(record));
        else tables[name][index] = structuredClone(record);
      }
    },
  };
  const service = createFocura(store, { now: () => now, masterEmail: "master@example.test" });
  const actor = async (entry) => service.context(await service.startSession(profile(entry)));
  return { admin, teacher, secondTeacher, guardian, student, stranger, service, store, tables, emails, actor,
    advance(seconds) { now += seconds * 1000; } };
}

test("Google login requires verified, allowlisted email and an assigned role", async () => {
  const { service, emails, admin, actor, tables } = fixture();
  const newEmail = { email: " BARU@example.test ", email_verified: true, sub: "new-google" };
  await assert.rejects(service.startSession(newEmail), { status: 403 });
  emails.add("baru@example.test");
  await assert.rejects(service.startSession(newEmail), /belum lengkap/);
  const access = await actor(admin);
  await service.saveAccount(access, { email: newEmail.email, fullName: "Baru", role: "student", schoolId: "a" });
  await assert.rejects(service.startSession({ ...newEmail, email_verified: false }), { status: 403 });
  await Promise.all([service.startSession(newEmail), service.startSession(newEmail)]);
  assert.equal(tables.Akun.filter((account) => account.email === "baru@example.test").length, 1);
  await assert.rejects(service.startSession({ ...newEmail, sub: "another-google" }), { status: 403 });
  emails.add("master@example.test");
  const master = await actor({ id: "master", email: "master@example.test" });
  assert.equal(master.actor.role, "admin");
});

test("Guru BK self-registration requires verified Google identity and Admin Central approval", async () => {
  const { service, admin, teacher, student, tables, emails, actor } = fixture();
  const applicant = { email: " BARU@example.test ", email_verified: true, sub: "google-baru", name: "Guru Baru" };
  await assert.rejects(service.registerTeacher({ ...applicant, email_verified: false }), { status: 403 });
  await assert.rejects(service.registerTeacher({ ...applicant, email: "master@example.test" }), { status: 403 });
  assert.equal(await service.registerTeacher(profile(student)), false);
  assert.deepEqual(await Promise.all([service.registerTeacher(applicant), service.registerTeacher(applicant)]), [true, true]);
  await assert.rejects(service.registerTeacher({ ...applicant, sub: "google-lain" }), { status: 403 });
  await assert.rejects(service.registerTeacher({ ...applicant, email: "lain@example.test" }), { status: 403 });
  assert.equal(tables.Sesi.length, 0);
  assert(!emails.has("baru@example.test"));
  await assert.rejects(service.startSession(applicant), { status: 409 });
  const access = await actor(admin);
  const directory = await service.centralView(access, "akun");
  const pending = directory.accounts.filter(({ email }) => email === "baru@example.test");
  assert.equal(pending.length, 1);
  const [account] = pending;
  assert.equal(account.fullName, applicant.name);
  assert.equal(account.role, "bk");
  assert.equal(account.registrationPending, true);
  assert.equal(account.enabled, false);
  assert.equal(account.emailAllowed, false);
  assert.equal(account.googleSub, undefined);
  const teacherAccess = await actor(teacher);
  assert.throws(() => service.saveAccount(teacherAccess, { schoolId: "a", enabled: true }, account.id), { status: 403 });
  await assert.rejects(service.saveAccount(access, { enabled: true }, account.id), { status: 400 });
  await assert.rejects(service.saveAccount(access, { role: "student", schoolId: "a", enabled: true }, account.id), { status: 400 });
  assert(!emails.has("baru@example.test"));
  await service.saveAccount(access, { schoolId: "a", enabled: true }, account.id);
  assert(emails.has("baru@example.test"));
  const reviewed = (await service.centralView(await actor(admin), "akun")).accounts.find(({ id }) => id === account.id);
  assert.equal(reviewed.emailAllowed, true);
  await assert.rejects(service.startSession({ ...applicant, sub: "google-lain" }), { status: 403 });
  const session = await service.startSession(applicant);
  const approved = await service.context(session);
  assert.equal(approved.actor.registrationPending, false);
  assert.deepEqual((await service.dashboard(approved)).students.map(({ id }) => id), [student.id]);
  assert.equal(await service.registerTeacher(applicant), false);
  await service.saveAccount(access, { enabled: false }, account.id);
  await assert.rejects(service.context(session), { status: 401 });
  assert.equal(await service.registerTeacher(applicant), false);
  await assert.rejects(service.startSession(applicant), { status: 403 });
});

test("Admin Central can create Guru BK and student accounts and their emails remain revocable", async () => {
  const { service, admin, student, emails, actor } = fixture();
  const access = await actor(admin);
  for (const role of ["bk", "student"]) {
    const profile = { email: `${role}-baru@example.test`, email_verified: true, sub: `google-${role}-baru` };
    const input = { ...profile, fullName: "Akun Baru", role, schoolId: "a" };
    await service.saveAccount(access, input);
    assert(emails.has(profile.email));
    await assert.rejects(service.saveAccount(access, input), { status: 409 });
    const session = await service.startSession(profile);
    const account = (await service.context(session)).actor;
    assert.equal(account.role, role);
    emails.delete(profile.email);
    await assert.rejects(service.context(session), { status: 401 });
  }
  await assert.rejects(service.saveAccount(access, { email: "salah", role: "student", schoolId: "a", fullName: "Salah" }), { status: 400 });
  await assert.rejects(service.saveAccount(access, { email: "baru@example.test", role: "guardian", fullName: "Wali" }), { status: 400 });
  await assert.rejects(service.saveAccount(access, { email: "master@example.test", role: "bk", schoolId: "a", fullName: "Master" }), { status: 403 });
  const legacySession = await service.startSession(profile(student));
  emails.delete(student.email);
  await assert.rejects(service.context(legacySession), { status: 401 });
  await assert.rejects(service.startSession(profile(student)), { status: 403 });
});

test("An interrupted spreadsheet sync can be retried without enabling an incomplete account", async () => {
  const { service, admin, store, emails, tables, actor } = fixture();
  const access = await actor(admin);
  const newAccount = { id: "retry", email: "retry@example.test", role: "student", schoolId: "a", fullName: "Siswa Baru" };
  const write = store.write;
  store.write = async () => { throw new Error("Spreadsheet operasional tidak tersedia"); };
  try {
    await assert.rejects(service.saveAccount(access, newAccount), /operasional/);
    assert(emails.has(newAccount.email));
    assert(!tables.Akun.some(({ email }) => email === newAccount.email));
    await assert.rejects(service.startSession(profile(newAccount)), { status: 403 });
  } finally {
    store.write = write;
  }
  await service.saveAccount(access, newAccount);
  assert.equal((await actor(newAccount)).actor.role, "student");
});

test("Admin sees both schools and counts users once across sessions", async () => {
  const { service, admin, teacher, secondTeacher, student, stranger, actor, advance } = fixture();
  const sessions = await Promise.all([student, student, teacher, secondTeacher, stranger].map((entry) => service.startSession(profile(entry))));
  const adminSession = await service.startSession(profile(admin));
  let data = await service.dashboard(await service.context(adminSession));
  assert.deepEqual(data.stats.map((school) => [school.activeStudents, school.activeTeachers]), [[1, 2], [1, 0]]);
  await service.endSession(sessions[0]);
  data = await service.dashboard(await service.context(adminSession), "a");
  assert.equal(data.stats[0].activeStudents, 1);
  await service.endSession(sessions[1]);
  assert.equal((await service.dashboard(await service.context(adminSession), "a")).stats[0].activeStudents, 0);
  advance(SESSION_AGE);
  await assert.rejects(service.context(sessions[2]), { status: 401 });
  assert.equal((await service.dashboard(await actor(admin))).stats[1].activeStudents, 0);
});

test("BK and guardians receive scoped data, with no private reflections", async () => {
  const { service, admin, teacher, guardian, student, stranger, actor } = fixture();
  const studentAccess = await actor(student);
  const teacherAccess = await actor(teacher);
  const guardianAccess = await actor(guardian);
  const adminAccess = await actor(admin);
  await service.updateLearning(studentAccess, { action: "saveReflection", learned: "Private note", feeling: "Baik", improvement: "Latihan" });
  await service.setGuardianLink(adminAccess, { guardianId: guardian.id, studentId: student.id });
  const dashboard = await service.dashboard(teacherAccess);
  assert.deepEqual(dashboard.students.map((entry) => entry.id), [student.id]);
  assert.equal(dashboard.teachers, undefined);
  assert.equal(dashboard.students[0].reflectionCount, 1);
  assert.doesNotMatch(JSON.stringify(dashboard), /Private note/);
  await assert.rejects(service.dashboard(teacherAccess, stranger.schoolId), { status: 403 });
  assert.throws(() => service.saveAccount(teacherAccess, {}), { status: 403 });
  assert.deepEqual(await service.children(guardianAccess), [{ fullName: student.fullName, school: "SMA 1 Bandar Lampung", kelas: "X" }]);
  await assert.rejects(service.learning(guardianAccess), { status: 403 });
  await assert.rejects(service.learning(teacherAccess), { status: 403 });
  await assert.rejects(service.learning(adminAccess), { status: 403 });
  assert.doesNotMatch(JSON.stringify(await service.dashboard(adminAccess)), /Private note/);
  assert.deepEqual((await service.learning(await actor(stranger))).data.reflections, []);
  assert.equal((await service.learning(studentAccess)).data.reflections[0].learned, "Private note");
  await service.setGuardianLink(adminAccess, { guardianId: guardian.id, studentId: student.id, enabled: false });
  assert.deepEqual(await service.children(guardianAccess), []);
});

test("Admin pages return only the data needed by each section", async () => {
  const { service, admin, teacher, student, actor } = fixture();
  await actor(student);
  const adminAccess = await actor(admin);
  const teacherAccess = await actor(teacher);
  const overview = await service.centralView(adminAccess, "ringkasan");
  assert.deepEqual(Object.keys(overview), ["stats"]);
  assert.equal(overview.stats[0].activeStudents, 1);
  const teachers = await service.centralView(adminAccess, "guru-bk");
  assert.deepEqual(Object.keys(teachers).sort(), ["schools", "teachers"]);
  const students = await service.centralView(adminAccess, "siswa", "a");
  assert.deepEqual(students.students.map(({ id }) => id), [student.id]);
  assert.equal(students.teachers, undefined);
  assert.deepEqual(Object.keys(await service.centralView(adminAccess, "sekolah")).sort(), ["classes", "schools"]);
  await assert.rejects(service.centralView(teacherAccess, "akun"), { status: 403 });
});

test("Class removal preserves learning and login, while access deactivation revokes all sessions", async () => {
  const { service, admin, student, stranger, actor } = fixture();
  const adminAccess = await actor(admin);
  const sessionA = await service.startSession(profile(student));
  const sessionB = await service.startSession(profile(student));
  const access = await service.context(sessionA);
  const { tasks } = await service.updateLearning(access, { action: "importTasks", tasks: [{ title: "Belajar", priority: "Tinggi", completed: false }] });
  await assert.rejects(service.updateLearning(await actor(stranger), { action: "toggleTask", id: tasks[0].id }), { status: 404 });
  await assert.rejects(service.setClass(adminAccess, student.id, { classId: "y" }), { status: 400 });
  await service.setClass(adminAccess, student.id, { classId: null });
  const current = await service.learning(await service.context(sessionB));
  assert.equal(current.kelas, "Belum Memiliki Kelas");
  assert.equal(current.data.tasks[0].title, "Belajar");
  await service.setClass(adminAccess, student.id, { classId: "x" });
  await service.saveAccount(adminAccess, { enabled: false }, student.id);
  for (const session of [sessionA, sessionB]) await assert.rejects(service.context(session), { status: 401 });
  await assert.rejects(service.startSession(profile(student)), { status: 403 });
  await service.saveAccount(adminAccess, { enabled: true }, student.id);
  await assert.rejects(service.context(sessionA), { status: 401 });
  assert.equal((await service.learning(await actor(student))).kelas, "X");
});

test("School modules preserve defaults and constrain create, edit and removal to the assigned school", async () => {
  const { service, actor, teacher, student, stranger, guardian, tables, emails } = fixture();
  const otherTeacher = { id: "bk-other", email: "other@example.test", role: "bk", schoolId: "b", enabled: true };
  tables.Akun.push(otherTeacher);
  emails.add(otherTeacher.email);
  const [bk, otherBk, ownStudent, otherStudent, parent] = await Promise.all(
    [teacher, otherTeacher, student, stranger, guardian].map(actor));
  const defaults = await service.modules(ownStudent);
  assert.equal(defaults.length, 3);
  const input = { title: "<Panduan>", description: "Regulasi diri", schoolId: "b",
    editUrl: "https://drive.google.com/file/d/FOCUS/view?resourcekey=required&unneeded=ignored" };
  await service.saveModule(bk, input);
  const added = (await service.modules(ownStudent)).find(({ title }) => title === input.title);
  assert.equal(added.previewUrl, "https://drive.google.com/file/d/FOCUS/preview?resourcekey=required");
  assert.equal((await service.modules(otherStudent)).length, 3);
  assert.equal(tables.Modul[0].schoolId, "a");
  await assert.rejects(service.saveModule(otherBk, input, added.id), { status: 404 });
  await assert.rejects(service.saveModule(otherBk, null, added.id, true), { status: 404 });
  await assert.rejects(service.saveModule(bk, { ...input, editUrl: "https://drive.google.com.example.test/file/d/FOCUS/view" }), { status: 400 });
  await assert.rejects(service.saveModule(bk, { ...input, editUrl: "https://drive.google.com/redirect" }), { status: 400 });
  await assert.rejects(service.modules(parent), { status: 403 });
  assert.throws(() => service.saveModule(ownStudent, input), { status: 403 });
  await service.saveModule(bk, { ...input, title: "Ubah lokal" }, defaults[0].id);
  await service.saveModule(otherBk, { ...input, title: "Ubah sekolah kedua" }, defaults[0].id);
  assert.equal((await service.modules(ownStudent))[0].title, "Ubah lokal");
  assert.equal((await service.modules(otherStudent))[0].title, "Ubah sekolah kedua");
  await service.saveModule(bk, null, added.id, true);
  await service.saveModule(bk, null, defaults[0].id, true);
  assert.equal((await service.modules(ownStudent)).length, 2);
  assert.equal((await service.modules(otherStudent)).length, 3);
});

test("Task import previews validation, preserves account data and reports duplicate and invalid rows", async () => {
  const { service, actor, teacher, student, stranger, tables } = fixture();
  const [own, other, bk] = await Promise.all([student, stranger, teacher].map(actor));
  const tasks = [
    { row: 2, title: "Latihan  Fisika", priority: "Tinggi", completed: true, sourceDate: "2/11/2026", owner: stranger.id, role: "admin" },
    { row: 3, title: " latihan fisika ", priority: "Tinggi", completed: false },
    { row: 9, title: "Rusak", priority: "salah", completed: true },
    { row: 10, title: "Rusak 2", priority: "Sedang", completed: "selesai" },
    null,
  ];
  const { importReport: preview } = await service.updateLearning(own, { action: "importTasks", tasks, preview: true });
  assert.deepEqual([preview.imported, preview.duplicates, preview.failed], [1, 1, 3]);
  assert.deepEqual(preview.errors.map(({ row }) => row), [9, 10, 6]);
  assert.deepEqual(tables.Belajar, []);
  const { tasks: saved, importReport } = await service.updateLearning(own, { action: "importTasks", tasks });
  assert.deepEqual(importReport, preview);
  assert.equal(saved[0].createdAt, "2/11/2026");
  assert.equal(tables.Belajar[0].owner, student.id);
  assert.equal(tables.Akun.find(({ id }) => id === student.id).role, "student");
  assert.equal((await service.learning(other)).data.tasks.length, 0);
  assert.throws(() => service.updateLearning(bk, { action: "importTasks", tasks }), { status: 403 });
  const id = saved[0].id;
  await assert.rejects(service.updateLearning(other, { action: "editTask", id, title: "Asing", priority: "Rendah" }), { status: 404 });
  await service.updateLearning(own, { action: "editTask", id, title: "Latihan Mekanika", priority: "Rendah" });
  const retry = await service.updateLearning(own, { action: "importTasks", tasks: tasks.slice(0, 1) });
  assert.equal(retry.importReport.duplicates, 1);
  assert.equal(retry.tasks[0].title, "Latihan Mekanika");
  await Promise.all([1, 2].map(() => service.updateLearning(own, { action: "toggleTask", id, completed: false })));
  assert.equal((await service.learning(own)).data.tasks[0].completed, false);
  const deleted = await service.updateLearning(own, { action: "deleteTask", id });
  assert.deepEqual(deleted.tasks, []);
  assert.equal(tables.Belajar[0].deleted, true);
});

test("BK summary uses separate survey and barrier sources and includes no individual response or reflection content", async () => {
  const { service, actor, student, teacher, stranger, tables, admin } = fixture();
  const [own, bk, other, central] = await Promise.all([student, teacher, stranger, admin].map(actor));
  const rows = [
    { code: "A-1", konsentrasi: "2", target: 4, strategi: 3, evaluasi: 5, schoolId: "b", email: stranger.email },
    { code: "a-1", konsentrasi: "1", target: 1, strategi: 1, evaluasi: 1 },
    { code: "a-2", konsentrasi: "9", target: 1, strategi: 1, evaluasi: 1 },
  ];
  await assert.rejects(service.bkSummary(central), { status: 403 });
  assert.throws(() => service.importSurvey(own, { rows }), { status: 403 });
  assert.deepEqual((await service.dashboard(bk, null, "siswa")).classes.map(({ id }) => id), ["x"]);
  await service.updateLearning(own, { action: "saveBarriers", barrierIds: ["hp", "lingkungan", "lingkungan", "materi"] });
  await service.updateLearning(other, { action: "saveBarriers", barrierIds: ["waktu"] });
  await assert.rejects(service.updateLearning(own, { action: "saveBarriers", barrierIds: ["private"] }), { status: 400 });
  await service.updateLearning(own, { action: "saveReflection", learned: "Isi pribadi", feeling: "Tenang", improvement: "Jeda" });
  const taskData = await service.updateLearning(own, { action: "addTask", title: "Tugas", priority: "Sedang" });
  await service.updateLearning(own, { action: "toggleTask", id: taskData.tasks[0].id, completed: true });
  const emptySurvey = await service.bkSummary(bk);
  assert.equal(emptySurvey.surveyRespondents, 0);
  assert.equal(emptySurvey.barrierRespondents, 1);
  assert.equal(emptySurvey.barriers.waktu, 0);
  assert.equal(emptySurvey.barriers.lingkungan, 1);
  assert.equal(emptySurvey.barriers.materi, 1);
  assert.equal(emptySurvey.totals.rplAchieved, 1);
  assert.equal(emptySurvey.totals.doneTasks, 1);
  const preview = await service.importSurvey(bk, { rows, preview: true });
  assert.deepEqual([preview.imported, preview.duplicates, preview.failed], [1, 1, 1]);
  assert.deepEqual(tables.Angket, []);
  const imports = await Promise.all([service.importSurvey(bk, { rows }), service.importSurvey(bk, { rows })]);
  assert.deepEqual(imports.map(({ imported }) => imported), [1, 0]);
  assert.equal(tables.Angket[0].schoolId, "a");
  assert.equal(tables.Angket[0].email, undefined);
  tables.Angket.push({ ...tables.Angket[0], id: "other-survey", schoolId: "b" });
  const summary = await service.bkSummary(bk);
  assert.equal(summary.surveyRespondents, 1);
  assert.deepEqual(summary.survey.konsentrasi, [0, 1, 0, 0, 0]);
  assert.equal(summary.totals.students, 1);
  assert.doesNotMatch(JSON.stringify(summary), /Isi pribadi|a-1|siswa-a/i);
});

test("Focus timer survives reads and retries, validates elapsed time and groups real completions in Jakarta", async () => {
  const { service, actor, student, stranger, teacher, advance, tables } = fixture();
  const [own, other, bk] = await Promise.all([student, stranger, teacher].map(actor));
  const initial = (await service.learning(own)).data;
  assert.equal(initial.activity.length, 7);
  assert(initial.activity.every(({ active }) => !active));
  const { tasks: [task] } = await service.updateLearning(own, { action: "addTask", title: "Matematika", priority: "Tinggi" });
  const start = { action: "startFocus", requestId: randomUUID(), durationMinutes: 1, taskId: task.id };
  await assert.rejects(service.updateLearning(other, start), { status: 400 });
  await assert.rejects(service.updateLearning(own, { ...start, durationMinutes: 0 }), { status: 400 });
  const [opened, retried] = await Promise.all([service.updateLearning(own, start), service.updateLearning(own, start)]);
  const { id } = opened.timer;
  assert.equal(retried.timer.id, id);
  assert.equal((await service.learning(own)).data.timer.topic, "Matematika");
  await assert.rejects(service.updateLearning(own, { ...start, requestId: randomUUID() }), { status: 409 });
  await assert.rejects(service.updateLearning(own, { action: "recordFocus", id, version: 0 }), { status: 409 });
  await assert.rejects(service.updateLearning(other, { action: "resetFocus", id, version: 0 }), { status: 404 });
  advance(10);
  const paused = await service.updateLearning(own, { action: "pauseFocus", id, version: 0 });
  assert.equal(paused.timer.remainingMs, 50_000);
  advance(90);
  await assert.rejects(service.updateLearning(own, { action: "recordFocus", id, version: 1 }), { status: 409 });
  const resumed = await service.updateLearning(own, { action: "resumeFocus", id, version: 1 });
  assert.equal(resumed.timer.deadline - resumed.timer.serverNow, 50_000);
  advance(50);
  const focus = { action: "recordFocus", id, version: 2 };
  const completions = await Promise.all([service.updateLearning(own, focus), service.updateLearning(own, focus)]);
  assert.deepEqual(completions.map(({ focusSessions }) => focusSessions.length), [1, 1]);
  assert.equal(completions[0].activity.at(-1).minutes, 1);
  await service.updateLearning(own, { action: "toggleTask", id: task.id, completed: true });
  assert.equal((await service.learning(own)).data.activity.at(-1).doneTasks, 1);
  assert.equal((await service.bkSummary(bk)).totals.focusCount, 1);
  const reset = (await service.updateLearning(own, { ...start, requestId: randomUUID(), taskId: null })).timer;
  await service.updateLearning(own, { action: "resetFocus", id: reset.id, version: 0 });
  advance(90);
  await assert.rejects(service.updateLearning(own, { action: "recordFocus", id: reset.id, version: 0 }), { status: 404 });
  assert.equal((await service.learning(own)).data.focusSessions.length, 1);

  tables.Belajar.push({ id: "legacy", kind: "focus", owner: student.id, durationMinutes: 25, topic: "Lama",
    createdAt: "2026-09-19T17:02:00.000Z" });
  const data = (await service.learning(own)).data;
  const nextDayJakarta = data.activity.find(({ date }) => date === "2026-09-20");
  assert.equal(nextDayJakarta.minutes, 25);
  assert.equal(data.activity.find(({ date }) => date === "2026-09-19").minutes, 0);
});
