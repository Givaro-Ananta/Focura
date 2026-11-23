import { JWT } from "google-auth-library";
import { emailAddress } from "./focura.js";

export const TABLES = ["Akun", "Sekolah", "Kelas", "TautanWali", "Sesi", "Belajar", "Modul", "Angket"];
let client;
let sheetIds;

function connection() {
  const { GOOGLE_SERVICE_ACCOUNT_EMAIL: email, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: key,
    GOOGLE_ALLOWLIST_SPREADSHEET_ID: allowlist, GOOGLE_DATA_SPREADSHEET_ID: data } = process.env;
  if (!email || !key || !allowlist || !data || allowlist === data) {
    throw new Error("Konfigurasi dua spreadsheet privat dan service account belum lengkap.");
  }
  client ??= new JWT({ email, key: key.replace(/\\n/g, "\n"), scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
  return { allowlist, data };
}

async function request(id, path, payload) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}${path}`;
  const { data } = await client.request({ url, method: payload ? "POST" : "GET", data: payload });
  return data;
}

async function tabs(id) {
  const result = await request(id, "?fields=sheets.properties(sheetId,title)");
  return Object.fromEntries(result.sheets.map(({ properties }) => [properties.title, properties.sheetId]));
}

async function allowlistValues(id) {
  const { values = [] } = await request(id, "/values/Email%21A2%3AA");
  return values;
}

export const sheets = {
  async emails() {
    const { allowlist } = connection();
    const values = await allowlistValues(allowlist);
    return new Set(values.map(([value]) => emailAddress(value)).filter((email) => /^[^\s@]+@[^\s@]+$/.test(email)));
  },

  async addEmail(email) {
    const { allowlist } = connection();
    await request(allowlist, "/values/Email%21A%3AA:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS", { values: [[email]] });
  },

  async removeEmail(email) {
    const { allowlist } = connection();
    const values = await allowlistValues(allowlist);
    const ranges = values.flatMap(([value], i) => emailAddress(value) === email ? [`Email!A${i + 2}`] : []);
    if (ranges.length) await request(allowlist, "/values:batchClear", { ranges });
  },

  async read(...tables) {
    const { data } = connection();
    const query = new URLSearchParams({ valueRenderOption: "UNFORMATTED_VALUE" });
    for (const table of tables) query.append("ranges", `${table}!A2:B`);
    const { valueRanges } = await request(data, `/values:batchGet?${query}`);
    return Object.fromEntries(tables.map((table, index) => [table, (valueRanges[index].values || [])
      .flatMap(([id, json], row) => id ? [{ ...JSON.parse(json), id, row: row + 1 }] : [])]));
  },

  async write(changes) {
    if (!changes.length) return;
    const { data } = connection();
    sheetIds ??= tabs(data).catch((error) => { sheetIds = undefined; throw error; });
    const ids = await sheetIds;
    const requests = changes.map(([table, { id, row, ...fields }, operation]) => {
      const sheetId = ids[table];
      if (operation === "delete") {
        if (!Number.isInteger(row) || row < 1) throw new Error("Baris data tidak valid.");
        return { updateCells: {
          range: { sheetId, startRowIndex: row, endRowIndex: row + 1, startColumnIndex: 0, endColumnIndex: 2 },
          rows: [],
          fields: "userEnteredValue",
        } };
      }
      const values = [id, JSON.stringify(fields)].map((stringValue) => ({ userEnteredValue: { stringValue } }));
      return row === undefined
        ? { appendCells: { sheetId, rows: [{ values }], fields: "userEnteredValue" } }
        : { updateCells: { start: { sheetId, rowIndex: row, columnIndex: 0 }, rows: [{ values }], fields: "userEnteredValue" } };
    });
    await request(data, ":batchUpdate", { requests });
  },
};

export async function setupSheets() {
  const { data } = connection();
  await sheets.emails();
  const existing = await tabs(data);
  const missing = TABLES.filter((table) => !Object.hasOwn(existing, table));
  if (missing.length) {
    await request(data, ":batchUpdate", { requests: missing.map((title) => ({ addSheet: { properties: { title } } })) });
  }
  await request(data, "/values:batchUpdate", {
    valueInputOption: "RAW",
    data: TABLES.map((table) => ({ range: `${table}!A1:B1`, values: [["id", "data"]] })),
  });
}
