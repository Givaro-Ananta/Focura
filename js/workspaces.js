export const WORKSPACES = {
  admin: {
    role: "admin",
    name: "Admin Central",
    pages: {
      "": "Ringkasan",
      "guru-bk": "Guru BK",
      siswa: "Siswa",
      sekolah: "Sekolah & Kelas",
      akun: "Akun",
      "orang-tua": "Orang Tua/Wali",
      rpl: "Panduan RPL",
      "pratinjau-siswa": "Pratinjau Ruang Siswa",
    },
  },
  bk: {
    role: "bk",
    name: "Guru BK",
    pages: {
      "": "Beranda Konselor",
      siswa: "Data Peserta Didik",
      pemantauan: "Pemantauan & Angket",
      materi: "Kelola Materi",
      rpl: "RPL & Evaluasi",
      database: "Database Excel & Form",
    },
  },
};

export function pagePath(workspace, section = "") {
  return section ? `/${workspace}/${section}` : `/${workspace}`;
}
