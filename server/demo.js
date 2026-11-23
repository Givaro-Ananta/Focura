export const demoEnabled = process.env.NODE_ENV === "development" && process.env.FOCURA_LOCAL_DEMO === "1";

export const demoProfile = {
  sub: "focura-local-demo",
  email: "admin@focura.test",
  email_verified: true,
  name: "Admin Central Demo",
};

export const demoProfiles = {
  admin: demoProfile,
  bk: { sub: "focura-demo-bk", email: "bk1@focura.test", email_verified: true, name: "Guru BK Demo 1" },
  student: { sub: "focura-demo-siswa", email: "siswa1@focura.test", email_verified: true, name: "Siswa Demo 1" },
  "student-other": { sub: "focura-demo-siswa-lain", email: "siswa2@focura.test", email_verified: true, name: "Siswa Demo 2" },
};

export function createDemoStore() {
  const tables = {
    Akun: [
      { id: "bk-1", fullName: "Guru BK Demo 1", email: "bk1@focura.test", role: "bk", schoolId: "sma-bl", enabled: true },
      { id: "bk-2", fullName: "Guru BK Demo 2", email: "bk2@focura.test", role: "bk", schoolId: "sma-bl", enabled: true },
      { id: "siswa-1", fullName: "Siswa Demo 1", email: "siswa1@focura.test", role: "student", schoolId: "sma-bl", classId: "bl-xi", nis: "001", enabled: true },
      { id: "siswa-2", fullName: "Siswa Demo 2", email: "siswa2@focura.test", role: "student", schoolId: "sma-tp", classId: "tp-xi", nis: "002", enabled: true },
    ],
    Sekolah: [{ id: "sma-bl", name: "SMA 1 Bandar Lampung" }, { id: "sma-tp", name: "SMA 1 Talang Padang" }],
    Kelas: [{ id: "bl-xi", schoolId: "sma-bl", name: "XI" }, { id: "tp-xi", schoolId: "sma-tp", name: "XI" }],
    TautanWali: [], Sesi: [], Belajar: [], Modul: [], Angket: [],
  };
  const allowed = new Set([demoProfile.email, ...tables.Akun.map((account) => account.email)]);
  return {
    async emails() { return new Set(allowed); },
    async addEmail(email) { allowed.add(email); },
    async removeEmail(email) { allowed.delete(email); },
    async read(...names) {
      return Object.fromEntries(names.map((name) => [name, structuredClone(tables[name])]));
    },
    async write(changes) {
      for (const [name, record, operation] of changes) {
        const index = tables[name].findIndex((entry) => entry.id === record.id);
        if (operation === "delete") {
          if (index >= 0) tables[name].splice(index, 1);
        } else if (index < 0) tables[name].push(structuredClone(record));
        else tables[name][index] = structuredClone(record);
      }
    },
  };
}
