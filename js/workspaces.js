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
    },
  },
  bk: {
    role: "bk",
    name: "Guru BK",
    pages: { "": "Siswa", rpl: "Panduan RPL" },
  },
};

export function pagePath(workspace, section = "") {
  return section ? `/${workspace}/${section}` : `/${workspace}`;
}
