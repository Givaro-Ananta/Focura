import { setupSheets } from "../server/sheets.js";

try {
  await setupSheets();
  console.log("Spreadsheet Focura siap.");
} catch (error) {
  console.error(`Penyiapan spreadsheet gagal: ${error.response?.data?.error?.message || error.message}`);
  process.exitCode = 1;
}
