/**
 * Modul Integrasi Spreadsheet Excel (.xlsx)
 * - Mendukung ekspor & impor data pribadi siswa maupun rekapitulasi Ruang Admin Guru BK.
 * - Menggunakan library SheetJS (XLSX) yang dimuat di index.html.
 */

import { getRegisteredStudents } from "./auth.js";
import { getStudentData, saveStudentData } from "./storage.js";

export function exportStudentWorkbook(user) {
  if (typeof window.XLSX === "undefined") {
    alert("Library Spreadsheet Excel belum termuat. Periksa koneksi internet Anda.");
    return;
  }

  const data = getStudentData(user.id);
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

export function importStudentWorkbook(user, file, onComplete) {
  if (!file || typeof window.XLSX === "undefined") return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const workbook = window.XLSX.read(e.target.result, { type: "array" });
      const currentData = getStudentData(user.id);

      if (workbook.Sheets["Atur_Tugas"]) {
        const importedTasks = window.XLSX.utils.sheet_to_json(workbook.Sheets["Atur_Tugas"]);
        importedTasks.forEach((row) => {
          if (row.Tugas && row.Tugas !== "Belum ada tugas") {
            currentData.tasks.push({
              id: "TSK-IMP-" + Math.random().toString(36).slice(2, 8),
              title: String(row.Tugas),
              priority: row.Prioritas || "Sedang",
              completed: String(row.Status).toLowerCase() === "selesai",
              createdAt: row.Tanggal || new Date().toLocaleDateString("id-ID")
            });
          }
        });
      }

      saveStudentData(user.id, currentData);
      if (onComplete) onComplete(true, "Data dari file Excel (.xlsx) berhasil disinkronkan ke akun Anda!");
    } catch (err) {
      if (onComplete) onComplete(false, "Gagal membaca struktur file Excel: " + err.message);
    }
  };
  reader.readAsArrayBuffer(file);
}

export function exportAdminRecapWorkbook() {
  if (typeof window.XLSX === "undefined") return;

  const students = getRegisteredStudents();
  const wb = window.XLSX.utils.book_new();

  const recapRows = students.map((st, index) => {
    const pData = getStudentData(st.id);
    const doneTasks = pData.tasks.filter((t) => t.completed).length;
    const totalTasks = pData.tasks.length;
    const activeCount =
      (pData.selectedBarriers.length > 0 ? 1 : 0) +
      (totalTasks > 0 ? 1 : 0) +
      (pData.focusSessions.length > 0 ? 1 : 0) +
      (pData.reflections.length > 0 ? 1 : 0);

    return {
      No: index + 1,
      NIS: st.nis,
      Nama_Peserta_Didik: st.fullName,
      Kelas: st.kelas,
      Email: st.email,
      Tugas_Selesai: `${doneTasks}/${totalTasks}`,
      Jumlah_Sesi_Fokus: pData.focusSessions.length,
      Jumlah_Refleksi: pData.reflections.length,
      Indikator_RPL_Terpenuhi: `${activeCount}/4 Aktivitas`,
      Status_Ketercapaian: activeCount >= 3 ? "Tercapai (Minimal 3/4)" : "Perlu Pendampingan"
    };
  });

  const ws = window.XLSX.utils.json_to_sheet(
    recapRows.length
      ? recapRows
      : [{ No: 1, NIS: "-", Nama_Peserta_Didik: "Belum ada siswa mendaftar", Kelas: "-", Status_Ketercapaian: "-" }]
  );
  window.XLSX.utils.book_append_sheet(wb, ws, "Rekap_Layanan_BK");
  window.XLSX.writeFile(wb, `Focura_Rekap_Admin_BK_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
