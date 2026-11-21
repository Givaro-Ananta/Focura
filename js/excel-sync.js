/**
 * Modul Integrasi Spreadsheet Excel (.xlsx)
 * - Mendukung ekspor & impor data pribadi siswa maupun rekapitulasi Ruang Admin Guru BK.
 * - Menggunakan SheetJS (XLSX) yang dimuat oleh shell Next.js.
 */

import { getStudentData } from "./storage.js";
import { APP_CONFIG } from "./config.js";
import { JAKARTA, SURVEY_ITEMS } from "./learning-rules.js";

const taskColumns = ["Tugas", "Prioritas", "Status", "Tanggal"];
const surveyColumns = ["Kode_Respons", ...Object.keys(SURVEY_ITEMS)];

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
  const wsTasks = window.XLSX.utils.json_to_sheet(taskRows, { header: ["No", ...taskColumns] });
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
  const rows = await readImport(file, "Atur_Tugas", taskColumns.slice(0, 3));
  return rows.filter(({ Tugas, Prioritas, Status, Tanggal }) =>
    !(Tugas === "Belum ada tugas" && Prioritas === "-" && Status === "-" && Tanggal === "-"))
    .map(({ row, Tugas, Prioritas, Status, Tanggal }) => {
      const status = String(Status ?? "").trim().toLowerCase();
      return { row, title: Tugas, priority: typeof Prioritas === "string" ? Prioritas.trim() : Prioritas,
        completed: status === "selesai" ? true : status === "belum selesai" ? false : null,
        sourceDate: String(Tanggal ?? "") };
    });
}

export async function importSurveyWorkbook(file) {
  const rows = await readImport(file, "Angket_Awal", surveyColumns, true);
  return rows.map(({ row, Kode_Respons, ...answers }) => ({ row, code: Kode_Respons, ...answers }));
}

async function readImport(file, sheetName, required, exact = false) {
  const xlsx = window.XLSX;
  if (!xlsx) throw new Error("Library Spreadsheet Excel belum termuat. Coba lagi setelah halaman siap.");
  if (!/\.(xlsx|xls|csv)$/i.test(file.name) || file.size > 5_000_000) throw new Error("Pilih file XLSX, XLS, atau CSV hingga 5 MB.");
  const csv = /\.csv$/i.test(file.name);
  const workbook = csv
    ? xlsx.read(await file.text(), { type: "string", raw: true, sheetRows: 502 })
    : xlsx.read(await file.arrayBuffer(), { type: "array", raw: true, sheets: sheetName, sheetRows: 502 });
  const sheet = workbook.Sheets[csv ? workbook.SheetNames[0] : sheetName];
  if (!sheet?.["!ref"]) throw new Error(`Workbook harus berisi tab ${sheetName} dengan header.`);
  const range = xlsx.utils.decode_range(sheet["!fullref"] || sheet["!ref"]);
  if (range.e.r - range.s.r > 500 || range.e.c - range.s.c > 30) throw new Error("Gunakan maksimal 500 baris data dan 31 kolom.");
  const [header, ...values] = xlsx.utils.sheet_to_json(sheet, { header: 1, blankrows: true, defval: null });
  const columns = header.map((cell) => String(cell ?? "").trim());
  const named = columns.filter(Boolean);
  if (new Set(named).size !== named.length || !required.every((name) => named.includes(name)) || (exact && named.length !== required.length)) {
    throw new Error(`Kolom wajib: ${required.join(", ")}.`);
  }
  return values.flatMap((cells, index) => {
    if (cells.every((value) => value === null || value === "")) return [];
    if (exact && cells.some((value, column) => value != null && value !== "" && !columns[column])) {
      throw new Error(`Baris ${range.s.r + index + 2} memuat data di luar kolom angket.`);
    }
    return [{ ...Object.fromEntries(columns.filter((name) => required.includes(name) || (!exact && name === "Tanggal"))
      .map((name) => [name, cells[columns.indexOf(name)]])), row: range.s.r + index + 2 }];
  });
}

export function exportSurveyTemplate() {
  if (!window.XLSX) throw new Error("Library Spreadsheet Excel belum termuat.");
  const xlsx = window.XLSX;
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet([surveyColumns]), "Angket_Awal");
  xlsx.writeFile(wb, "Focura_Template_Angket_Awal.xlsx");
}

export function exportAdminRecapWorkbook(students, summary) {
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
  if (summary) {
    const { utils } = window.XLSX;
    utils.book_append_sheet(wb, utils.aoa_to_sheet([
      ["Pernyataan", "Skor 1", "Skor 2", "Skor 3", "Skor 4", "Skor 5", "Jumlah Responden"],
      ...Object.entries(SURVEY_ITEMS).map(([key, label]) => [label, ...summary.survey[key], summary.surveyRespondents]),
    ]), "Rekap_Angket_Awal");
    utils.book_append_sheet(wb, utils.aoa_to_sheet([
      ["Hambatan", "Jumlah Siswa Memilih", "Siswa Mengisi Pemetaan"],
      ...APP_CONFIG.barriersList.map(({ id, label }) => [label, summary.barriers[id], summary.barrierRespondents]),
    ]), "Rekap_Hambatan");
  }
  const date = new Intl.DateTimeFormat("sv-SE", { timeZone: JAKARTA }).format();
  window.XLSX.writeFile(wb, `Focura_Rekap_Admin_BK_${date}.xlsx`);
}

export function importReportText({ imported, duplicates, failed, errors }, preview = false) {
  const summary = `${imported} ${preview ? "siap disimpan" : "disimpan"} · ${duplicates} duplikat · ${failed} baris tidak valid.`;
  const sample = errors.slice(0, 10).map(({ row, message }) => `Baris ${row}: ${message}`).join(" ");
  const remaining = errors.length > 10 ? ` ${errors.length - 10} galat lainnya.` : "";
  return sample ? `${summary} ${sample}${remaining}` : summary;
}
