import test from "node:test";
import assert from "node:assert/strict";
import { exportAdminRecapWorkbook, exportSurveyTemplate, importStudentWorkbook, importSurveyWorkbook } from "../js/excel-sync.js";

test("Excel and CSV readers validate headers and preserve physical row numbers", async () => {
  const table = {
    "!ref": "A1:E5",
    rows: [
      ["No", "Tugas", "Prioritas", "Status", "Tanggal"],
      [1, "Belum ada tugas", "-", "-", "-"],
      [null, null, null, null, null],
      [2, "Peta konsep", "Tinggi", "Selesai", "17/11/2026"],
      [3, "Tugas berikutnya", "Sedang", "Tidak diketahui", null],
    ],
  };
  const survey = {
    "!ref": "A1:E2",
    rows: [
      ["Kode_Respons", "konsentrasi", "target", "strategi", "evaluasi"],
      ["001", "4", "4", "3", "2"],
    ],
  };
  const read = (payload, options) => {
    if (typeof payload === "string") {
      assert.equal(options.raw, true);
      return { SheetNames: ["Sheet1"], Sheets: { Sheet1: survey } };
    }
    assert.equal(options.sheets, "Atur_Tugas");
    return { Sheets: { Atur_Tugas: table } };
  };
  globalThis.window = { XLSX: { read, utils: {
    sheet_to_json: (sheet) => sheet.rows,
    decode_range: (ref) => ({ s: { r: 0, c: 0 }, e: { r: Number(ref.at(-1)) - 1, c: 4 } }),
  } } };
  try {
    const xlsx = { name: "lama.xlsx", size: 123, async arrayBuffer() { return new ArrayBuffer(123); } };
    const csv = { name: "angket.csv", size: 123, async text() { return "CSV"; } };
    assert.deepEqual(await importStudentWorkbook(xlsx), [
      { row: 4, title: "Peta konsep", priority: "Tinggi", completed: true, sourceDate: "17/11/2026" },
      { row: 5, title: "Tugas berikutnya", priority: "Sedang", completed: null, sourceDate: "" },
    ]);
    assert.deepEqual(await importSurveyWorkbook(csv), [
      { row: 2, code: "001", konsentrasi: "4", target: "4", strategi: "3", evaluasi: "2" },
    ]);
    table.rows[0][3] = "Peran";
    await assert.rejects(importStudentWorkbook(xlsx), /Kolom wajib/);
    survey.rows[0].push("Email");
    await assert.rejects(importSurveyWorkbook(csv), /Kolom wajib/);
    await assert.rejects(importStudentWorkbook({ ...xlsx, name: "file.zip" }), /XLSX, XLS, atau CSV/);
  } finally {
    delete globalThis.window;
  }
});

test("BK workbook preserves recap columns and exports only aggregate survey and barrier data", () => {
  const saves = [];
  globalThis.window = { XLSX: {
    utils: {
      book_new: () => ({}),
      book_append_sheet: (book, rows, name) => { book[name] = rows; },
      json_to_sheet: (rows) => rows,
      aoa_to_sheet: (rows) => rows,
    },
    writeFile: (book, filename) => { saves.push({ book, filename }); },
  } };
  try {
    exportSurveyTemplate();
    exportAdminRecapWorkbook([{
      fullName: "Contoh", school: "Sekolah", kelas: "XI", email: "demo@example.test",
      doneTasks: 2, tasks: 4, focusCount: 1, reflectionCount: 1, rplCount: 4,
      reflections: [{ learned: "Isi refleksi privat" }],
    }], {
      survey: { konsentrasi: [0, 0, 0, 1, 0], target: [0, 0, 1, 0, 0], strategi: [0, 0, 1, 0, 0], evaluasi: [0, 0, 0, 1, 0] },
      barriers: { hp: 1, waktu: 0, bosan: 0, materi: 0, tunda: 0, lingkungan: 0, melayang: 0 },
      surveyRespondents: 1, barrierRespondents: 1,
    });
    assert.equal(saves[0].filename, "Focura_Template_Angket_Awal.xlsx");
    assert.deepEqual(saves[0].book.Angket_Awal, [["Kode_Respons", "konsentrasi", "target", "strategi", "evaluasi"]]);
    const { book } = saves[1];
    assert.deepEqual(Object.keys(book), ["Rekap_Layanan_BK", "Rekap_Angket_Awal", "Rekap_Hambatan"]);
    assert.equal(book.Rekap_Layanan_BK[0].Jumlah_Refleksi, 1);
    assert.equal(book.Rekap_Layanan_BK[0].Tugas_Selesai, "2/4");
    assert.equal(book.Rekap_Angket_Awal[1].at(-1), 1);
    assert.equal(book.Rekap_Hambatan[1][1], 1);
    assert.doesNotMatch(JSON.stringify(book), /Isi refleksi privat/);
  } finally {
    delete globalThis.window;
  }
});
