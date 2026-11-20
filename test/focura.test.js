import test from "node:test";
import assert from "node:assert/strict";
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
    TautanWali: [], Sesi: [], Belajar: [],
  };
  const emails = new Set(tables.Akun.map((entry) => entry.email));
  let now = 1_790_000_000_000;
  const store = {
    async emails() { return new Set(emails); },
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
  return { admin, teacher, secondTeacher, guardian, student, stranger, service, tables, emails, actor,
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
