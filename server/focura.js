import { randomUUID } from "node:crypto";
import { APP_CONFIG } from "../js/config.js";
import { driveLinks, JAKARTA, PRIORITIES, rplActivityCount, SURVEY_ITEMS } from "../js/learning-rules.js";

export const SESSION_AGE = 8 * 60 * 60;
const ROLES = ["admin", "bk", "student", "guardian"];
const BARRIERS = APP_CONFIG.barriersList.map(({ id }) => id);
const dayKey = new Intl.DateTimeFormat("sv-SE", { timeZone: JAKARTA });
const errorKind = Symbol.for("focura.requestError");
const schoolRole = (role) => role === "bk" || role === "student";

export class AppError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
    this[errorKind] = true;
  }
}

export function isAppError(error) {
  return error?.[errorKind] === true;
}

export function emailAddress(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function requireValue(condition, message, status = 400, code) {
  if (!condition) throw new AppError(status, message, code);
}

function text(value, limit, required = true) {
  requireValue(typeof value === "string" && value.trim().length <= limit && (!required || value.trim()), "Isian tidak valid.");
  return value.trim();
}

function newClassRecord(classes, schoolId, name) {
  requireValue(!classes.some((entry) => entry.schoolId === schoolId && entry.name.toLowerCase() === name.toLowerCase()), "Nama kelas sudah digunakan.", 409);
  return { id: randomUUID(), name, schoolId };
}

function validEmail(email) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+$/.test(email);
}

function googleEmail(profile) {
  const email = emailAddress(profile?.email);
  requireValue(profile?.email_verified === true && validEmail(email) && profile.sub, "Email Google belum terverifikasi.", 403);
  return email;
}

function publicAccount({ id, fullName, email, role, schoolId, classId, nis, enabled, lastLoginAt, registrationPending, registrationRejected }) {
  return { id, fullName, email, role, schoolId, classId, nis, enabled, lastLoginAt, registrationPending, registrationRejected };
}

function checkTeacherRegistration(account) {
  requireValue(!account?.registrationRejected, "Pendaftaran Guru BK ditolak oleh Admin Central.", 403, "RegistrationRejected");
}

function liveSession(session, now) {
  return !session.revokedAt && session.expiresAt > now;
}

function learningData(records, time) {
  const newestFirst = (kind) => records.filter((record) => record.kind === kind && !record.deleted)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const focus = newestFirst("focus");
  const tasks = newestFirst("task");
  const reflections = newestFirst("reflection");
  const activity = Array.from({ length: 7 }, (_, index) => ({
    date: dayKey.format(time - (6 - index) * 86_400_000), minutes: 0, sessions: 0, doneTasks: 0, active: false,
  }));
  const days = new Map(activity.map((day) => [day.date, day]));
  for (const record of [...focus, ...tasks, ...reflections, ...newestFirst("barriers")]) {
    for (const at of [record.createdAt, record.updatedAt].filter(Boolean)) {
      const day = days.get(dayKey.format(Date.parse(at)));
      if (day) day.active = true;
    }
  }
  for (const record of tasks.filter((task) => task.completed && task.completedAt)) {
    const day = days.get(dayKey.format(Date.parse(record.completedAt)));
    if (day) {
      day.doneTasks++;
      day.active = true;
    }
  }
  const weeklyMinutes = {};
  const focusSessions = focus.map(({ id, durationMinutes, topic, createdAt }) => ({
    id, durationMinutes, topic,
    completedAt: new Date(createdAt).toLocaleString("id-ID", { timeZone: JAKARTA }),
    day: new Date(createdAt).toLocaleDateString("id-ID", { weekday: "short", timeZone: JAKARTA }),
  }));
  for (const session of focusSessions) {
    weeklyMinutes[session.day] = (weeklyMinutes[session.day] || 0) + session.durationMinutes;
  }
  for (const session of focus) {
    const day = days.get(dayKey.format(Date.parse(session.createdAt)));
    if (day) {
      day.minutes += session.durationMinutes;
      day.sessions++;
    }
  }
  const timer = records.find((record) => record.kind === "focusTimer");
  const result = {
    tasks: tasks.map(({ id, title, priority, completed, createdAt, sourceDate }) => ({
      id, title, priority, completed, createdAt: sourceDate || new Date(createdAt).toLocaleDateString("id-ID", { timeZone: JAKARTA }),
    })),
    focusSessions,
    reflections: reflections.map(({ id, learned, feeling, improvement, createdAt }) => ({
      id, learned, feeling, improvement, date: new Date(createdAt).toLocaleString("id-ID", { timeZone: JAKARTA }),
    })),
    selectedBarriers: records.find((record) => record.kind === "barriers")?.selectedBarriers || [],
    weeklyMinutes,
    activity,
    timer: timer ? {
      id: timer.id, topic: timer.topic, taskId: timer.taskId, durationMinutes: timer.durationMinutes,
      deadline: timer.deadline, remainingMs: timer.remainingMs, version: timer.version, serverNow: time,
    } : null,
  };
  return { ...result, rplCount: rplActivityCount(result) };
}

function studySummary(records) {
  const tasks = records.filter((entry) => entry.kind === "task" && !entry.deleted);
  const focusSessions = records.filter((entry) => entry.kind === "focus");
  const reflections = records.filter((entry) => entry.kind === "reflection");
  const selectedBarriers = records.find((entry) => entry.kind === "barriers")?.selectedBarriers || [];
  return {
    tasks: tasks.length,
    doneTasks: tasks.filter((entry) => entry.completed).length,
    focusCount: focusSessions.length,
    reflectionCount: reflections.length,
    rplCount: rplActivityCount({ tasks, focusSessions, reflections, selectedBarriers }),
  };
}

function schoolModules(records, schoolId) {
  const scoped = records.filter((record) => record.schoolId === schoolId);
  const defaults = new Map(APP_CONFIG.defaultModules.map((record) => [record.id, record]));
  const modules = new Map(defaults);
  for (const record of scoped) modules.set(record.moduleId, record);
  return [...modules].flatMap(([id, { title, category, description, editUrl, deleted }]) => {
    const links = driveLinks(editUrl);
    if (deleted || !links) return [];
    const builtIn = defaults.get(id);
    // Keep the bundled PDF when a school edits only the module metadata.
    const previewUrl = links.editUrl === driveLinks(builtIn?.editUrl)?.editUrl ? builtIn.previewUrl : links.previewUrl;
    return [{ id, title, category, description, editUrl: links.editUrl, previewUrl }];
  });
}

function importRows(rows, seen, parse, key) {
  requireValue(Array.isArray(rows) && rows.length > 0 && rows.length <= 500, "Impor harus berisi 1–500 baris.");
  const report = { imported: 0, duplicates: 0, failed: 0, errors: [] };
  const records = [];
  rows.forEach((row, index) => {
    const number = Number.isSafeInteger(row?.row) && row.row >= 2 ? row.row : index + 2;
    try {
      requireValue(row && typeof row === "object" && !Array.isArray(row), "Struktur baris tidak valid.");
      const record = parse(row);
      const identity = key(record);
      if (seen.has(identity)) {
        report.duplicates++;
        return;
      }
      seen.add(identity);
      records.push(record);
      report.imported++;
    } catch (error) {
      if (!isAppError(error)) throw error;
      report.failed++;
      report.errors.push({ row: number, message: error.message });
    }
  });
  return { records, report };
}

function taskKey({ title, priority }) {
  return JSON.stringify([title.trim().replace(/\s+/g, " ").toLocaleLowerCase("id-ID"), priority]);
}

function updateTimer(input, own, time, create, owner) {
  if (input.action === "startFocus") {
    requireValue(typeof input.requestId === "string" &&
      /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(input.requestId), "Identitas sesi tidak valid.");
    const id = `focus:${owner}:${input.requestId}`;
    if (own.some((record) => record.id === id)) return [];
    requireValue(!own.some((record) => record.kind === "focusTimer"), "Sudah ada latihan fokus yang aktif. Muat ulang untuk membukanya.", 409);
    const { durationMinutes, taskId } = input;
    requireValue(Number.isInteger(durationMinutes) && durationMinutes >= 1 && durationMinutes <= 180, "Durasi fokus harus 1–180 menit.");
    const target = own.find((record) => record.id === taskId && record.kind === "task" && !record.deleted && !record.completed);
    requireValue(taskId == null || taskId === "" || target, "Pilih tugas aktif dari akunmu.");
    const topic = target?.title || text(input.topic ?? "", 300, false) || "Sesi Latihan Fokus Mandiri";
    return [create("focusTimer", { id, durationMinutes, topic, taskId: target?.id ?? null,
      deadline: time + durationMinutes * 60_000, remainingMs: null, version: 0 })];
  }
  const record = own.find((entry) => entry.id === input.id);
  const doneKind = input.action === "recordFocus" ? "focus" : input.action === "resetFocus" ? "focusDiscarded" : null;
  if (doneKind && record?.kind === doneKind) return [];
  requireValue(record?.kind === "focusTimer", "Latihan fokus tidak ditemukan.", 404);
  requireValue(record.version === input.version, "Latihan fokus sudah berubah. Muat ulang untuk melanjutkan.", 409);
  const { deadline, remainingMs, version, ...fields } = record;
  switch (input.action) {
    case "pauseFocus":
      requireValue(deadline > time, "Timer sudah dijeda atau sudah habis.", 409);
      return [{ ...fields, deadline: null, remainingMs: deadline - time, version: version + 1 }];
    case "resumeFocus":
      requireValue(remainingMs > 0, "Timer belum dijeda.", 409);
      return [{ ...fields, deadline: time + remainingMs, remainingMs: null, version: version + 1 }];
    case "resetFocus":
      return [{ ...fields, kind: doneKind }];
    case "recordFocus":
      requireValue(deadline && time >= deadline, "Selesaikan durasi latihan sebelum mencatat sesi.", 409);
      return [{ ...fields, kind: doneKind, createdAt: new Date(deadline).toISOString() }];
  }
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
    checkTeacherRegistration(account);
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
    requireValue(actor?.enabled && !actor.registrationPending && !actor.registrationRejected && (!schoolRole(actor.role) || actor.schoolId) &&
      emails.has(actor.email) && liveSession(session, now()), "Sesi sudah berakhir atau akses akun dinonaktifkan.", 401);
    return { actor: publicAccount(actor), emails, accounts: Akun, sessions: Sesi };
  }

  function allow(access, ...roles) {
    requireValue(roles.includes(access.actor.role), "Akses ditolak.", 403);
  }

  function bkSchoolId(access, requestedSchoolId) {
    allow(access, "bk", "admin");
    if (access.actor.role === "bk") {
      requireValue(!requestedSchoolId || requestedSchoolId === access.actor.schoolId,
        "Sekolah berada di luar penugasan Guru BK.", 403);
      return access.actor.schoolId;
    }
    requireValue(requestedSchoolId, "Pilih sekolah untuk membuka ruang Guru BK.", 403);
    return requestedSchoolId;
  }

  async function verifyAdminSchool(access, schoolId) {
    if (access.actor.role !== "admin") return;
    const { Sekolah } = await store.read("Sekolah");
    requireValue(Sekolah.some(({ id }) => id === schoolId), "Sekolah tidak ditemukan.", 404);
  }

  function learningOwner(access, preview) {
    allow(access, preview ? "admin" : "student");
    return preview ? `admin-preview:${access.actor.id}` : access.actor.id;
  }

  function revoke(sessions, accountId) {
    const time = now();
    return sessions.filter((session) => session.accountId === accountId && liveSession(session, time))
      .map((session) => ["Sesi", { ...session, revokedAt: time }]);
  }

  function protectedAccountEmails(access) {
    return [master, access.actor.email].filter(Boolean);
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
    const members = accounts.filter((entry) => !entry.registrationPending && !entry.registrationRejected &&
      (!scope || entry.schoolId === scope) && (entry.role === "student" || (central && entry.role === "bk")));
    const names = new Map(Sekolah.map(({ id, name }) => [id, name]));
    const classesList = Kelas.filter((entry) => !scope || entry.schoolId === scope).map(({ id, name, schoolId }) => ({ id, name, schoolId }));
    const classes = new Map(classesList.map(({ id, name }) => [id, name]));
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
      const { id, fullName, email, schoolId, classId, nis, lastLoginAt } = entry;
      const profile = { ...(central ? publicAccount(entry) : { id, fullName, email, schoolId, classId, nis, lastLoginAt, role: entry.role }),
        school: names.get(schoolId), kelas: classes.get(classId) || "Belum Memiliki Kelas", active: isActive(entry) };
      if (entry.role !== "student") return profile;
      return { ...profile, ...studySummary(learningByOwner.get(entry.id) || []) };
    });
    const teachers = rows.filter((row) => row.role === "bk");
    const students = rows.filter((row) => row.role === "student");
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

    async bkStudents(access, requestedSchoolId) {
      return dashboard(access, bkSchoolId(access, requestedSchoolId), "siswa");
    },

    async bkSummary(access, requestedSchoolId) {
      const schoolId = bkSchoolId(access, requestedSchoolId);
      const { Sekolah, Belajar, Angket } = await store.read("Sekolah", "Belajar", "Angket");
      const school = Sekolah.find(({ id }) => id === schoolId);
      requireValue(school, "Sekolah tidak ditemukan.", 404);
      const ids = new Set(access.accounts.filter((account) => account.role === "student" && account.schoolId === schoolId).map(({ id }) => id));
      const learning = Map.groupBy(Belajar.filter(({ owner }) => ids.has(owner)), ({ owner }) => owner);
      const totals = { students: ids.size, activeLearners: 0, rplAchieved: 0, doneTasks: 0, focusCount: 0, reflectionCount: 0 };
      const barriers = Object.fromEntries(BARRIERS.map((id) => [id, 0]));
      let barrierRespondents = 0;
      for (const records of learning.values()) {
        const summary = studySummary(records);
        if (summary.rplCount > 0) totals.activeLearners++;
        if (summary.rplCount >= 3) totals.rplAchieved++;
        for (const key of ["doneTasks", "focusCount", "reflectionCount"]) totals[key] += summary[key];
        const choices = new Set(records.find(({ kind }) => kind === "barriers")?.selectedBarriers || []);
        if (choices.size) barrierRespondents++;
        for (const id of choices) if (Object.hasOwn(barriers, id)) barriers[id]++;
      }
      const responses = Angket.filter((row) => row.schoolId === schoolId);
      const survey = Object.fromEntries(Object.keys(SURVEY_ITEMS).map((key) => [key, [0, 0, 0, 0, 0]]));
      for (const { answers } of responses) {
        for (const key of Object.keys(survey)) survey[key][answers[key] - 1]++;
      }
      return { school: school.name, totals, barriers, barrierRespondents, survey, surveyRespondents: responses.length };
    },

    importSurvey(access, { rows, preview = false }, requestedSchoolId) {
      const schoolId = bkSchoolId(access, requestedSchoolId);
      return serialize(async () => {
        await verifyAdminSchool(access, schoolId);
        requireValue(typeof preview === "boolean", "Pilihan pratinjau tidak valid.");
        const { Angket } = await store.read("Angket");
        const seen = new Set(Angket.filter((entry) => entry.schoolId === schoolId).map(({ code }) => code));
        const { records, report } = importRows(rows, seen, (row) => {
          const code = text(row.code, 64).toLowerCase();
          requireValue(/^[a-z0-9_-]+$/.test(code), "Kode respons hanya boleh berisi huruf, angka, garis bawah, atau tanda hubung.");
          const answers = {};
          for (const key of Object.keys(SURVEY_ITEMS)) {
            const answer = row[key];
            requireValue((typeof answer === "number" || typeof answer === "string") && /^[1-5]$/.test(String(answer).trim()),
              `Jawaban ${key} harus berupa angka bulat 1–5.`);
            answers[key] = Number(answer);
          }
          return { id: randomUUID(), schoolId, code, answers };
        }, ({ code }) => code);
        if (!preview) await store.write(records.map((record) => ["Angket", record]));
        return report;
      });
    },

    async modules(access, requestedSchoolId) {
      const schoolId = access.actor.role === "student" ? access.actor.schoolId : bkSchoolId(access, requestedSchoolId);
      await verifyAdminSchool(access, schoolId);
      const { Modul } = await store.read("Modul");
      return schoolModules(Modul, schoolId);
    },

    previewModules(access) {
      allow(access, "admin");
      return schoolModules([], null);
    },

    saveModule(access, input, moduleId, deleted = false, requestedSchoolId) {
      const schoolId = bkSchoolId(access, requestedSchoolId);
      return serialize(async () => {
        await verifyAdminSchool(access, schoolId);
        const { Modul } = await store.read("Modul");
        const existing = moduleId && schoolModules(Modul, schoolId).find((record) => record.id === moduleId);
        requireValue(!moduleId || existing, "Modul tidak ditemukan.", 404);
        const previous = Modul.find((record) => record.schoolId === schoolId && record.moduleId === moduleId);
        const id = previous?.id || randomUUID();
        const links = deleted ? null : driveLinks(input.editUrl);
        requireValue(deleted || links, "Masukkan tautan berkas Google Drive, Docs, Sheets, atau Slides yang valid.");
        const fields = deleted ? { deleted: true } : { title: text(input.title, 160), category: text(input.category ?? "", 80, false),
          description: text(input.description, 1500), editUrl: links.editUrl };
        await store.write([["Modul", { ...previous, id, moduleId: moduleId || id, schoolId, ...fields }]]);
      });
    },

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
      const protectedEmails = protectedAccountEmails(access).filter((email) => existing.has(email) || access.emails.has(email));
      return { schools, accounts, pendingEmails, protectedEmails };
    },

    registerTeacher(profile) {
      return serialize(async () => {
        const email = googleEmail(profile);
        requireValue(email !== master, "Email Master Admin tidak dapat digunakan untuk pendaftaran Guru BK.", 403);
        const { Akun } = await store.read("Akun");
        const account = Akun.find((entry) => entry.email === email);
        const rejected = account?.role === "bk" && account.enabled === false && account.registrationRejected === true;
        requireValue(!Akun.some((entry) => entry.googleSub === profile.sub && entry.email !== email) &&
          (rejected || !account?.googleSub || account.googleSub === profile.sub), "Akses akun tidak tersedia.", 403);
        if (account && !rejected) {
          checkTeacherRegistration(account);
          return account.registrationPending === true;
        }
        const name = typeof profile.name === "string" ? profile.name.trim() : "";
        const fullName = (name || email).slice(0, 120);
        const changes = [["Akun", { id: randomUUID(), email, fullName, role: "bk", googleSub: profile.sub,
          schoolId: null, enabled: false, registrationPending: true }]];
        if (rejected) changes.unshift(["Akun", account, "delete"]);
        await store.write(changes);
        return true;
      });
    },

    rejectTeacherRegistration(access, id) {
      allow(access, "admin");
      return serialize(async () => {
        const { Akun } = await store.read("Akun");
        const account = Akun.find((entry) => entry.id === id);
        if (!account) return;
        requireValue(account.role === "bk", "Pendaftaran Guru BK tidak ditemukan.", 404);
        requireValue(account.enabled === false && (account.registrationPending || account.registrationRejected),
          "Pendaftaran ini sudah diputuskan.", 409);
        await store.write([["Akun", account, "delete"]]);
      });
    },

    deleteAccount(access, id, address) {
      allow(access, "admin");
      return serialize(async () => {
        const emailWithoutProfile = emailAddress(address);
        const { Akun, Sesi, TautanWali } = await store.read("Akun", ...(id ? ["Sesi", "TautanWali"] : []));
        const account = Akun.find((entry) => id ? entry.id === id : entry.email === emailWithoutProfile);
        if (id && !account) return;
        requireValue(id || !account, "Email sudah memiliki profil akun. Muat ulang daftar akun.", 409);
        const email = account?.email ?? emailWithoutProfile;
        requireValue(validEmail(email), "Email tidak valid.");
        requireValue(!protectedAccountEmails(access).includes(email), "Akun sendiri dan akun Master Admin dilindungi.", 403);
        await store.removeEmail(email);
        if (!account) return;
        const links = TautanWali.filter((link) => link.enabled && (link.guardianId === id || link.studentId === id))
          .map((link) => ["TautanWali", { ...link, enabled: false }]);
        await store.write([["Akun", account, "delete"], ...revoke(Sesi, id), ...links]);
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

    saveSchool(access, { name, newClassName = "" }, id) {
      allow(access, "admin");
      return serialize(async () => {
        const className = id ? text(newClassName, 80, false) : "";
        const { Sekolah, Kelas } = await store.read("Sekolah", ...(className ? ["Kelas"] : []));
        const existing = Sekolah.find((entry) => entry.id === id);
        requireValue(!id || existing, "Sekolah tidak ditemukan.", 404);
        const school = { ...existing, id: id || randomUUID(), name: text(name, 120) };
        const changes = [["Sekolah", school]];
        if (className) changes.push(["Kelas", newClassRecord(Kelas, school.id, className)]);
        await store.write(changes);
      });
    },

    createClass(access, schoolId, { name }) {
      allow(access, "admin");
      return serialize(async () => {
        const { Sekolah, Kelas } = await store.read("Sekolah", "Kelas");
        requireValue(Sekolah.some((entry) => entry.id === schoolId), "Sekolah tidak ditemukan.", 404);
        await store.write([["Kelas", newClassRecord(Kelas, schoolId, text(name, 80))]]);
      });
    },

    saveAccount(access, input, id) {
      allow(access, "admin");
      return serialize(async () => {
        const [{ Akun, Sesi, Sekolah }, emails] = await Promise.all([store.read("Akun", "Sesi", "Sekolah"), store.emails()]);
        const previous = Akun.find((entry) => entry.id === id);
        requireValue(!id || previous, "Akun tidak ditemukan.", 404);
        requireValue(!previous?.registrationRejected || (input.approveRejected === true && input.enabled === true),
          "Pendaftaran sudah ditolak. Buka kembali profil untuk meninjaunya.", 409);
        const registration = previous?.registrationPending || previous?.registrationRejected;
        const email = previous?.email || emailAddress(input.email);
        requireValue(validEmail(email), "Masukkan alamat email Google yang valid.");
        requireValue(previous || email !== master, "Akun Master Admin dibuat melalui login Google.", 403);
        requireValue(!Akun.some((entry) => entry.id !== id && entry.email === email), "Profil email sudah ada.", 409);
        const fullName = text(input.fullName ?? previous?.fullName, 120);
        const role = input.role ?? previous?.role;
        requireValue(ROLES.includes(role), "Peran tidak valid.");
        requireValue(previous || schoolRole(role) || emails.has(email), "Tambahkan email di spreadsheet untuk peran ini.");
        requireValue(!registration || role === "bk", "Pendaftaran mandiri hanya untuk Guru BK.");
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
        if (previous?.registrationRejected && enabled) account.registrationRejected = false;
        // Izin email saja belum memberi akses jika penyimpanan profil gagal.
        if (!emails.has(email) && (!previous || (registration && enabled))) await store.addEmail(email);
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

    async learning(access, preview = false) {
      const owner = learningOwner(access, preview);
      const { Kelas = [], Belajar } = await store.read("Belajar", ...(preview ? [] : ["Kelas"]));
      const grade = Kelas.find((entry) => entry.id === access.actor.classId && entry.schoolId === access.actor.schoolId);
      return { kelas: preview ? "Pratinjau Admin Central" : grade?.name || "Belum Memiliki Kelas",
        data: learningData(Belajar.filter((entry) => entry.owner === owner), now()) };
    },

    updateLearning(access, input, preview = false) {
      const owner = learningOwner(access, preview);
      return serialize(async () => {
        const { Belajar } = await store.read("Belajar");
        const own = Belajar.filter((entry) => entry.owner === owner);
        const time = now();
        const timestamp = new Date(time).toISOString();
        const create = (kind, fields) => ({ id: fields.id || randomUUID(), owner, kind, createdAt: timestamp, ...fields });
        const taskFields = ({ title, priority }) => {
          requireValue(PRIORITIES.includes(priority), "Prioritas tidak valid.");
          return { title: text(title, 300), priority };
        };
        let importReport;
        let changes;
        switch (input.action) {
          case "addTask": changes = [create("task", { ...taskFields(input), completed: false })]; break;
          case "importTasks": {
            requireValue(input.preview === undefined || typeof input.preview === "boolean", "Pilihan pratinjau tidak valid.");
            const seen = new Set(own.filter(({ kind }) => kind === "task").flatMap((entry) => [taskKey(entry), entry.importKey]));
            const result = importRows(input.tasks, seen, (entry) => {
              requireValue(typeof entry.completed === "boolean", "Status harus Selesai atau Belum Selesai.");
              const fields = taskFields(entry);
              return create("task", { ...fields, importKey: taskKey(fields), completed: entry.completed, sourceDate: text(entry.sourceDate ?? "", 60, false) });
            }, taskKey);
            changes = input.preview === true ? [] : result.records;
            importReport = result.report;
            break;
          }
          case "toggleTask":
          case "editTask":
          case "deleteTask": {
            const previous = own.find((entry) => entry.kind === "task" && entry.id === input.id);
            requireValue(previous, "Tugas tidak ditemukan.", 404);
            if (input.action === "deleteTask") {
              changes = previous.deleted ? [] : [{ ...previous, deleted: true }];
              break;
            }
            requireValue(!previous.deleted, "Tugas tidak ditemukan.", 404);
            if (input.action === "editTask") changes = [{ ...previous, ...taskFields(input), updatedAt: timestamp }];
            else {
              requireValue(typeof input.completed === "boolean", "Status tugas tidak valid.");
              changes = input.completed === previous.completed ? [] : [{
                ...previous, completed: input.completed, completedAt: input.completed ? timestamp : null, updatedAt: timestamp,
              }];
            }
            break;
          }
          case "startFocus":
          case "pauseFocus":
          case "resumeFocus":
          case "resetFocus":
          case "recordFocus":
            changes = updateTimer(input, own, time, create, owner);
            break;
          case "saveReflection":
            changes = [create("reflection", { learned: text(input.learned, 3000), feeling: text(input.feeling, 3000), improvement: text(input.improvement, 3000) })];
            break;
          case "saveBarriers": {
            requireValue(Array.isArray(input.barrierIds) && input.barrierIds.length <= BARRIERS.length &&
              input.barrierIds.every((id) => BARRIERS.includes(id)), "Pilihan hambatan tidak valid.");
            const selectedBarriers = [...new Set(input.barrierIds)];
            const previous = own.find((entry) => entry.kind === "barriers");
            changes = [previous ? { ...previous, selectedBarriers, updatedAt: timestamp } : create("barriers", { selectedBarriers })];
            break;
          }
          default: throw new AppError(400, "Tindakan belajar tidak valid.");
        }
        await store.write(changes.map((entry) => ["Belajar", entry]));
        const updated = new Map(own.map((entry) => [entry.id, entry]));
        for (const entry of changes) updated.set(entry.id, entry);
        return { ...learningData([...updated.values()], now()), ...(importReport ? { importReport } : {}) };
      });
    },
  };
}
