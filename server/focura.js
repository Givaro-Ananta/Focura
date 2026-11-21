import { randomUUID } from "node:crypto";

export const SESSION_AGE = 8 * 60 * 60;
const ROLES = ["admin", "bk", "student", "guardian"];
const PRIORITIES = ["Tinggi", "Sedang", "Rendah"];
const BARRIERS = ["hp", "waktu", "bosan", "materi", "tunda"];
const timezone = "Asia/Jakarta";
const errorKind = Symbol.for("focura.requestError");
const schoolRole = (role) => role === "bk" || role === "student";

export class AppError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
    this[errorKind] = true;
  }
}

export function isAppError(error) {
  return error?.[errorKind] === true;
}

export function emailAddress(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function requireValue(condition, message, status = 400) {
  if (!condition) throw new AppError(status, message);
}

function text(value, limit, required = true) {
  requireValue(typeof value === "string" && value.trim().length <= limit && (!required || value.trim()), "Isian tidak valid.");
  return value.trim();
}

function validEmail(email) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+$/.test(email);
}

function googleEmail(profile) {
  const email = emailAddress(profile?.email);
  requireValue(profile?.email_verified === true && validEmail(email) && profile.sub, "Email Google belum terverifikasi.", 403);
  return email;
}

function publicAccount({ id, fullName, email, role, schoolId, classId, nis, enabled, lastLoginAt, registrationPending }) {
  return { id, fullName, email, role, schoolId, classId, nis, enabled, lastLoginAt, registrationPending };
}

function liveSession(session, now) {
  return !session.revokedAt && session.expiresAt > now;
}

function learningData(records) {
  const newestFirst = (kind) => records.filter((record) => record.kind === kind)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const focusSessions = newestFirst("focus").map(({ id, durationMinutes, topic, createdAt }) => ({
    id, durationMinutes, topic,
    completedAt: new Date(createdAt).toLocaleString("id-ID", { timeZone: timezone }),
    day: new Date(createdAt).toLocaleDateString("id-ID", { weekday: "short", timeZone: timezone }),
  }));
  const weeklyMinutes = {};
  for (const session of focusSessions) {
    weeklyMinutes[session.day] = (weeklyMinutes[session.day] || 0) + session.durationMinutes;
  }
  return {
    tasks: newestFirst("task").map(({ id, title, priority, completed, createdAt, sourceDate }) => ({
      id, title, priority, completed, createdAt: sourceDate || new Date(createdAt).toLocaleDateString("id-ID", { timeZone: timezone }),
    })),
    focusSessions,
    reflections: newestFirst("reflection").map(({ id, learned, feeling, improvement, createdAt }) => ({
      id, learned, feeling, improvement, date: new Date(createdAt).toLocaleString("id-ID", { timeZone: timezone }),
    })),
    selectedBarriers: records.find((record) => record.kind === "barriers")?.selectedBarriers || [],
    weeklyMinutes,
  };
}

function studySummary(records) {
  const tasks = records.filter((entry) => entry.kind === "task");
  const focusCount = records.filter((entry) => entry.kind === "focus").length;
  const reflectionCount = records.filter((entry) => entry.kind === "reflection").length;
  const barriers = records.find((entry) => entry.kind === "barriers")?.selectedBarriers.length;
  return {
    tasks: tasks.length,
    doneTasks: tasks.filter((entry) => entry.completed).length,
    focusCount,
    reflectionCount,
    rplCount: [barriers, tasks.length, focusCount, reflectionCount].filter(Boolean).length,
  };
}

export function createFocura(store, { masterEmail = "", now = Date.now } = {}) {
  let pendingWrite = Promise.resolve();
  const master = emailAddress(masterEmail);

  function serialize(operation) {
    const result = pendingWrite.then(operation);
    pendingWrite = result.catch(() => {});
    return result;
  }

  async function loginAccount(profile) {
    const email = googleEmail(profile);
    const [allowed, { Akun }] = await Promise.all([store.emails(), store.read("Akun")]);
    const account = Akun.find((entry) => entry.email === email);
    const linked = Akun.find((entry) => entry.googleSub === profile.sub);
    requireValue(!linked || linked.id === account?.id, "Hubungi Master Admin untuk memperbarui email akun.", 403);
    requireValue(!account?.googleSub || account.googleSub === profile.sub, "Akses akun tidak tersedia.", 403);
    requireValue(!account?.registrationPending, "Pendaftaran Guru BK menunggu persetujuan Admin Central.", 409);
    requireValue(allowed.has(email), "Email belum diizinkan Master Admin.", 403);
    if (!account && email === master) {
      return { id: randomUUID(), email, role: "admin", enabled: true, fullName: profile.name || email };
    }
    requireValue(account && ROLES.includes(account.role) && (!schoolRole(account.role) || account.schoolId), "Peran atau penugasan akun belum lengkap.", 403);
    requireValue(account.enabled, "Akses akun tidak tersedia.", 403);
    return account;
  }

  async function context(sessionId) {
    requireValue(sessionId, "Silakan masuk dengan Google.", 401);
    const [emails, { Akun, Sesi }] = await Promise.all([store.emails(), store.read("Akun", "Sesi")]);
    const session = Sesi.find((entry) => entry.id === sessionId);
    const actor = session && Akun.find((account) => account.id === session.accountId);
    requireValue(actor?.enabled && !actor.registrationPending && (!schoolRole(actor.role) || actor.schoolId) &&
      emails.has(actor.email) && liveSession(session, now()), "Sesi sudah berakhir atau akses akun dinonaktifkan.", 401);
    return { actor: publicAccount(actor), emails, accounts: Akun, sessions: Sesi };
  }

  function allow(access, ...roles) {
    requireValue(roles.includes(access.actor.role), "Akses ditolak.", 403);
  }

  function revoke(sessions, accountId) {
    const time = now();
    return sessions.filter((session) => session.accountId === accountId && liveSession(session, time))
      .map((session) => ["Sesi", { ...session, revokedAt: time }]);
  }

  async function dashboard(access, schoolId, page) {
    allow(access, "admin", "bk");
    const { actor, accounts, sessions, emails } = access;
    const central = actor.role === "admin";
    if (!central) requireValue(!schoolId || schoolId === actor.schoolId, "Sekolah berada di luar penugasan Guru BK.", 403);
    const scope = central ? schoolId : actor.schoolId;
    const includeStudents = !page || page === "siswa";
    const includeTeachers = central && (!page || page === "guru-bk");
    const { Sekolah, Kelas = [], Belajar = [], TautanWali } = await store.read("Sekolah",
      ...(includeStudents ? ["Kelas", "Belajar"] : []), ...(central && !scope && !page ? ["TautanWali"] : []));
    const active = new Set(sessions.filter((session) => liveSession(session, now())).map((session) => session.accountId));
    const schools = Sekolah.filter((school) => !scope || school.id === scope);
    if (scope) requireValue(schools.length, "Sekolah tidak ditemukan.", 404);
    const members = accounts.filter((entry) => !entry.registrationPending && (!scope || entry.schoolId === scope) && (entry.role === "student" || (central && entry.role === "bk")));
    const names = new Map(Sekolah.map(({ id, name }) => [id, name]));
    const classes = new Map(Kelas.map(({ id, name }) => [id, name]));
    const isActive = (entry) => entry.enabled && emails.has(entry.email) && active.has(entry.id);
    const schoolsList = schools.map(({ id, name }) => ({ id, name }));
    function statistics() {
      return schoolsList.map(({ id, name }) => {
        const teachers = members.filter((row) => row.schoolId === id && row.role === "bk");
        const students = members.filter((row) => row.schoolId === id && row.role === "student");
        return { id, name, teachers: teachers.length, activeTeachers: teachers.filter(isActive).length,
          students: students.length, activeStudents: students.filter(isActive).length };
      });
    }
    if (page === "ringkasan") return { stats: statistics() };

    const learningByOwner = Map.groupBy(Belajar, (entry) => entry.owner);
    const rows = members.filter((entry) => entry.role === "student" ? includeStudents : includeTeachers).map((entry) => {
      const profile = { ...publicAccount(entry), school: names.get(entry.schoolId), kelas: classes.get(entry.classId) || "Belum Memiliki Kelas", active: isActive(entry) };
      if (entry.role !== "student") return profile;
      return { ...profile, ...studySummary(learningByOwner.get(entry.id) || []) };
    });
    const teachers = rows.filter((row) => row.role === "bk");
    const students = rows.filter((row) => row.role === "student");
    const classesList = Kelas.map(({ id, name, schoolId }) => ({ id, name, schoolId }));
    if (page === "guru-bk") return { teachers, schools: schoolsList };
    if (page === "siswa") return { students, schools: schoolsList, classes: classesList };
    const result = { students, schools: schoolsList };
    if (central) Object.assign(result, {
      teachers,
      stats: statistics(),
      ...(scope ? {} : { accounts: accounts.map(publicAccount), pendingEmails: [...emails].filter((email) => !accounts.some((entry) => entry.email === email)),
        classes: classesList,
        links: TautanWali.filter((link) => link.enabled).map(({ guardianId, studentId }) => ({ guardianId, studentId })) }),
    });
    return result;
  }

  return {
    context,
    dashboard,

    async centralView(access, page, schoolId) {
      allow(access, "admin");
      if (["ringkasan", "guru-bk", "siswa"].includes(page)) return dashboard(access, schoolId, page);

      if (page === "orang-tua") {
        const { TautanWali } = await store.read("TautanWali");
        const accounts = access.accounts.filter(({ role }) => role === "guardian" || role === "student")
          .map(({ id, fullName, email, role }) => ({ id, fullName, email, role }));
        const roles = new Map(accounts.map(({ id, role }) => [id, role]));
        const links = TautanWali.filter(({ enabled, guardianId, studentId }) => enabled && roles.get(guardianId) === "guardian" && roles.get(studentId) === "student")
          .map(({ guardianId, studentId }) => ({ guardianId, studentId }));
        return { accounts, links };
      }

      const { Sekolah, Kelas = [] } = await store.read("Sekolah", ...(page === "sekolah" ? ["Kelas"] : []));
      const schools = Sekolah.map(({ id, name }) => ({ id, name }));
      if (page === "sekolah") return { schools, classes: Kelas.map(({ id, name, schoolId }) => ({ id, name, schoolId })) };
      const accounts = access.accounts.map((account) => ({ ...publicAccount(account), emailAllowed: access.emails.has(account.email) }));
      const existing = new Set(accounts.map(({ email }) => email));
      const pendingEmails = [...access.emails].filter((email) => !existing.has(email));
      return { schools, accounts, pendingEmails };
    },

    registerTeacher(profile) {
      return serialize(async () => {
        const email = googleEmail(profile);
        requireValue(email !== master, "Email Master Admin tidak dapat digunakan untuk pendaftaran Guru BK.", 403);
        const { Akun } = await store.read("Akun");
        const account = Akun.find((entry) => entry.email === email);
        requireValue(!Akun.some((entry) => entry.googleSub === profile.sub && entry.email !== email) &&
          (!account?.googleSub || account.googleSub === profile.sub), "Akses akun tidak tersedia.", 403);
        if (account) return account.registrationPending === true;
        const name = typeof profile.name === "string" ? profile.name.trim() : "";
        const fullName = (name || email).slice(0, 120);
        await store.write([["Akun", { id: randomUUID(), email, fullName, role: "bk", googleSub: profile.sub,
          schoolId: null, enabled: false, registrationPending: true }]]);
        return true;
      });
    },

    startSession(profile) {
      return serialize(async () => {
        const account = await loginAccount(profile);
        const time = now();
        const session = { id: randomUUID(), accountId: account.id, startedAt: time, expiresAt: time + SESSION_AGE * 1000 };
        await store.write([["Akun", { ...account, googleSub: profile.sub, lastLoginAt: time }], ["Sesi", session]]);
        return session.id;
      });
    },

    endSession(id) {
      if (!id) return;
      return serialize(async () => {
        const { Sesi } = await store.read("Sesi");
        const session = Sesi.find((entry) => entry.id === id);
        if (session && liveSession(session, now())) await store.write([["Sesi", { ...session, revokedAt: now() }]]);
      });
    },

    async classes(access, schoolId) {
      allow(access, "admin");
      const { Kelas } = await store.read("Kelas");
      return Kelas.filter((entry) => entry.schoolId === schoolId).map(({ id, name }) => ({ id, name }));
    },

    saveSchool(access, { name }, id) {
      allow(access, "admin");
      return serialize(async () => {
        const { Sekolah } = await store.read("Sekolah");
        const existing = Sekolah.find((entry) => entry.id === id);
        requireValue(!id || existing, "Sekolah tidak ditemukan.", 404);
        await store.write([["Sekolah", { ...existing, id: id || randomUUID(), name: text(name, 120) }]]);
      });
    },

    createClass(access, schoolId, { name }) {
      allow(access, "admin");
      return serialize(async () => {
        const { Sekolah, Kelas } = await store.read("Sekolah", "Kelas");
        requireValue(Sekolah.some((entry) => entry.id === schoolId), "Sekolah tidak ditemukan.", 404);
        const cleanName = text(name, 80);
        requireValue(!Kelas.some((entry) => entry.schoolId === schoolId && entry.name.toLowerCase() === cleanName.toLowerCase()), "Nama kelas sudah digunakan.", 409);
        await store.write([["Kelas", { id: randomUUID(), name: cleanName, schoolId }]]);
      });
    },

    saveAccount(access, input, id) {
      allow(access, "admin");
      return serialize(async () => {
        const [{ Akun, Sesi, Sekolah }, emails] = await Promise.all([store.read("Akun", "Sesi", "Sekolah"), store.emails()]);
        const previous = Akun.find((entry) => entry.id === id);
        requireValue(!id || previous, "Akun tidak ditemukan.", 404);
        const email = previous?.email || emailAddress(input.email);
        requireValue(validEmail(email), "Masukkan alamat email Google yang valid.");
        requireValue(previous || email !== master, "Akun Master Admin dibuat melalui login Google.", 403);
        requireValue(!Akun.some((entry) => entry.id !== id && entry.email === email), "Profil email sudah ada.", 409);
        const fullName = text(input.fullName ?? previous?.fullName, 120);
        const role = input.role ?? previous?.role;
        requireValue(ROLES.includes(role), "Peran tidak valid.");
        requireValue(previous || schoolRole(role) || emails.has(email), "Tambahkan email di spreadsheet untuk peran ini.");
        requireValue(!previous?.registrationPending || role === "bk", "Pendaftaran mandiri hanya untuk Guru BK.");
        const schoolId = schoolRole(role) ? input.schoolId ?? previous?.schoolId : null;
        requireValue(schoolId === null || Sekolah.some((entry) => entry.id === schoolId), "Pilih sekolah yang valid.");
        requireValue(!schoolRole(role) || schoolId, "Guru BK dan siswa memerlukan sekolah.");
        const nis = role === "student" ? text(input.nis ?? previous?.nis ?? "", 60, false) : "";
        requireValue(!nis || !Akun.some((entry) => entry.id !== id && entry.role === "student" && entry.schoolId === schoolId && entry.nis === nis), "NIS sudah digunakan di sekolah ini.", 409);
        const enabled = input.enabled ?? previous?.enabled ?? true;
        requireValue(typeof enabled === "boolean", "Status izin login tidak valid.");
        const classId = role === "student" && previous?.schoolId === schoolId ? previous?.classId || null : null;
        const account = { ...previous, id: id || randomUUID(), email, fullName, role, schoolId, classId, nis, enabled };
        if (previous?.registrationPending && enabled) account.registrationPending = false;
        // Izin email saja belum memberi akses jika penyimpanan profil gagal.
        if (!emails.has(email) && (!previous || (previous.registrationPending && enabled))) await store.addEmail(email);
        await store.write([["Akun", account], ...(!enabled && id ? revoke(Sesi, id) : [])]);
      });
    },

    setClass(access, studentId, { classId }) {
      allow(access, "admin");
      return serialize(async () => {
        const { Akun, Kelas } = await store.read("Akun", "Kelas");
        const student = Akun.find((entry) => entry.id === studentId && entry.role === "student");
        requireValue(student, "Siswa tidak ditemukan.", 404);
        requireValue(classId === null || Kelas.some((entry) => entry.id === classId && entry.schoolId === student.schoolId), "Kelas harus berada di sekolah siswa.");
        await store.write([["Akun", { ...student, classId }]]);
      });
    },

    setGuardianLink(access, { guardianId, studentId, enabled = true }) {
      allow(access, "admin");
      return serialize(async () => {
        const { Akun, TautanWali } = await store.read("Akun", "TautanWali");
        requireValue(Akun.some((entry) => entry.id === guardianId && entry.role === "guardian") &&
          Akun.some((entry) => entry.id === studentId && entry.role === "student") && typeof enabled === "boolean", "Pilih akun wali dan siswa yang valid.");
        const previous = TautanWali.find((entry) => entry.guardianId === guardianId && entry.studentId === studentId);
        await store.write([["TautanWali", { ...previous, id: previous?.id || randomUUID(), guardianId, studentId, enabled }]]);
      });
    },

    async children(access) {
      allow(access, "guardian");
      const { TautanWali, Sekolah, Kelas } = await store.read("TautanWali", "Sekolah", "Kelas");
      const linked = new Set(TautanWali.filter((entry) => entry.enabled && entry.guardianId === access.actor.id).map((entry) => entry.studentId));
      return access.accounts.filter((entry) => entry.role === "student" && linked.has(entry.id)).map((entry) => ({
        fullName: entry.fullName,
        school: Sekolah.find((school) => school.id === entry.schoolId)?.name,
        kelas: Kelas.find((grade) => grade.id === entry.classId)?.name || "Belum Memiliki Kelas",
      }));
    },

    async learning(access) {
      allow(access, "student");
      const { Kelas, Belajar } = await store.read("Kelas", "Belajar");
      return { kelas: Kelas.find((entry) => entry.id === access.actor.classId)?.name || "Belum Memiliki Kelas",
        data: learningData(Belajar.filter((entry) => entry.owner === access.actor.id)) };
    },

    updateLearning(access, input) {
      allow(access, "student");
      return serialize(async () => {
        const { Belajar } = await store.read("Belajar");
        const own = Belajar.filter((entry) => entry.owner === access.actor.id);
        const create = (kind, fields) => ({ id: randomUUID(), owner: access.actor.id, kind, createdAt: new Date(now()).toISOString(), ...fields });
        const task = ({ title, priority, completed, sourceDate }, importing = false) => {
          requireValue(PRIORITIES.includes(priority), "Prioritas tidak valid.");
          return create("task", { title: text(title, 300), priority, completed: importing && completed === true,
            sourceDate: importing && sourceDate ? text(sourceDate, 60, false) : "" });
        };
        let changes;
        switch (input.action) {
          case "addTask": changes = [task(input)]; break;
          case "importTasks":
            requireValue(Array.isArray(input.tasks) && input.tasks.length <= 500, "Unggah maksimal 500 tugas per impor.");
            changes = input.tasks.map((entry) => task(entry, true));
            break;
          case "toggleTask": {
            const previous = own.find((entry) => entry.kind === "task" && entry.id === input.id);
            requireValue(previous, "Tugas tidak ditemukan.", 404);
            changes = [{ ...previous, completed: !previous.completed }];
            break;
          }
          case "recordFocus":
            requireValue([10, 25, 50].includes(input.durationMinutes), "Durasi fokus tidak valid.");
            changes = [create("focus", { durationMinutes: input.durationMinutes, topic: text(input.topic || "Sesi Latihan Fokus Mandiri", 300) })];
            break;
          case "saveReflection":
            changes = [create("reflection", { learned: text(input.learned, 3000), feeling: text(input.feeling, 3000), improvement: text(input.improvement, 3000) })];
            break;
          case "saveBarriers": {
            requireValue(Array.isArray(input.barrierIds) && input.barrierIds.every((id) => BARRIERS.includes(id)), "Pilihan hambatan tidak valid.");
            const selectedBarriers = [...new Set(input.barrierIds)];
            const previous = own.find((entry) => entry.kind === "barriers");
            changes = [previous ? { ...previous, selectedBarriers } : create("barriers", { selectedBarriers })];
            break;
          }
          default: throw new AppError(400, "Tindakan belajar tidak valid.");
        }
        await store.write(changes.map((entry) => ["Belajar", entry]));
        const updated = new Map(own.map((entry) => [entry.id, entry]));
        for (const entry of changes) updated.set(entry.id, entry);
        return learningData([...updated.values()]);
      });
    },
  };
}
