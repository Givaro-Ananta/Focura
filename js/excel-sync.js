/**
 * Modul Integrasi Spreadsheet Excel (.xlsx)
 * - Mendukung ekspor & impor data pribadi siswa maupun rekapitulasi Ruang Admin Guru BK.
 * - Menggunakan library SheetJS (XLSX) yang dimuat di index.html.
 */

import { getStudentData } from "./storage.js";

export function exportStudentWorkbook(user) {
  if (typeof window.XLSX === "undefined") {
    alert("Library Spreadsheet Excel belum termuat. Periksa koneksi internet Anda.");
    return;
  }

  const data = getStudentData();
  const wb = window.XLSX.utils.book_new();

  // Sheet 1: Profil & Ringkasan Progres
  const summaryRows = [
    ["FOCURA — LAPORAN PROGRES BELAJAR SISWA"],
    ["Nama Lengkap", user.fullName],
    ["NIS", user.nis],
    ["Kelas", user.kelas],
    ["Email Akun", user.email],
    ["Total Tugas Selesai", data.tasks.filter((t) => t.completed).length],
    ["Total Sesi Fokus", data.focusSessions.length],
    ["Total Refleksi Belajar", data.reflections.length],
    ["Hambatan Teridentifikasi", data.selectedBarriers.join(", ") || "-"]
  ];
  const wsSummary = window.XLSX.utils.aoa_to_sheet(summaryRows);
  window.XLSX.utils.book_append_sheet(wb, wsSummary, "Ringkasan_Siswa");

  // Sheet 2: Daftar Tugas & Prioritas
  const taskRows = data.tasks.map((t, idx) => ({
    No: idx + 1,
    Tugas: t.title,
    Prioritas: t.priority,
    Status: t.completed ? "Selesai" : "Belum Selesai",
    Tanggal: t.createdAt
  }));
  const wsTasks = window.XLSX.utils.json_to_sheet(
    taskRows.length ? taskRows : [{ No: 1, Tugas: "Belum ada tugas", Prioritas: "-", Status: "-", Tanggal: "-" }]
  );
  window.XLSX.utils.book_append_sheet(wb, wsTasks, "Atur_Tugas");

  // Sheet 3: Riwayat Sesi Fokus
  const focusRows = data.focusSessions.map((s, idx) => ({
    No: idx + 1,
    Topik_Belajar: s.topic,
    Durasi_Menit: s.durationMinutes,
    Waktu_Selesai: s.completedAt
  }));
  const wsFocus = window.XLSX.utils.json_to_sheet(
    focusRows.length ? focusRows : [{ No: 1, Topik_Belajar: "Belum ada sesi", Durasi_Menit: 0, Waktu_Selesai: "-" }]
  );
  window.XLSX.utils.book_append_sheet(wb, wsFocus, "Sesi_Fokus");

  // Sheet 4: Refleksi Belajar
  const reflectionRows = data.reflections.map((r, idx) => ({
    No: idx + 1,
    Tanggal: r.date,
    Materi_Dipelajari: r.learned,
    Perasaan_Saat_Belajar: r.feeling,
    Rencana_Perbaikan: r.improvement
  }));
  const wsRef = window.XLSX.utils.json_to_sheet(
    reflectionRows.length ? reflectionRows : [{ No: 1, Tanggal: "-", Materi_Dipelajari: "-", Perasaan_Saat_Belajar: "-", Rencana_Perbaikan: "-" }]
  );
  window.XLSX.utils.book_append_sheet(wb, wsRef, "Refleksi_Belajar");

  window.XLSX.writeFile(wb, `Focura_Data_${user.nis}_${user.fullName.replace(/\s+/g, "_")}.xlsx`);
}

export async function importStudentWorkbook(file) {
  if (!window.XLSX) throw new Error("Library Spreadsheet Excel belum termuat.");
  const workbook = window.XLSX.read(await file.arrayBuffer(), { type: "array" });
  const table = workbook.Sheets.Atur_Tugas;
  if (!table) throw new Error("Workbook harus berisi sheet Atur_Tugas.");
  return window.XLSX.utils.sheet_to_json(table)
    .filter((row) => row.Tugas && row.Tugas !== "Belum ada tugas")
    .map((row) => ({
      title: String(row.Tugas),
      priority: ["Tinggi", "Sedang", "Rendah"].includes(row.Prioritas) ? row.Prioritas : "Sedang",
      completed: String(row.Status).toLowerCase() === "selesai",
      sourceDate: String(row.Tanggal || ""),
    }));
}

export function exportAdminRecapWorkbook(students) {
  if (!window.XLSX) throw new Error("Library Spreadsheet Excel belum termuat.");
  const wb = window.XLSX.utils.book_new();
  const recapRows = students.map((student, index) => ({
    No: index + 1,
    NIS: student.nis,
    Nama_Peserta_Didik: student.fullName,
    Sekolah: student.school,
    Kelas: student.kelas,
    Email: student.email,
    Tugas_Selesai: `${student.doneTasks}/${student.tasks}`,
    Jumlah_Sesi_Fokus: student.focusCount,
    Jumlah_Refleksi: student.reflectionCount,
    Indikator_RPL_Terpenuhi: `${student.rplCount}/4 Aktivitas`,
    Status_Ketercapaian: student.rplCount >= 3 ? "Tercapai (Minimal 3/4)" : "Perlu Pendampingan",
  }));

  const ws = window.XLSX.utils.json_to_sheet(
    recapRows.length
      ? recapRows
      : [{ No: 1, NIS: "-", Nama_Peserta_Didik: "Belum ada siswa mendaftar", Kelas: "-", Status_Ketercapaian: "-" }]
  );
  window.XLSX.utils.book_append_sheet(wb, ws, "Rekap_Layanan_BK");
  window.XLSX.writeFile(wb, `Focura_Rekap_Admin_BK_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
