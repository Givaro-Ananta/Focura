import { getToken } from "next-auth/jwt";
import { focura } from "../../../server/auth.js";
import { isAppError } from "../../../server/focura.js";

const routes = [
  ["GET", /^central\/overview$/, "admin", (access) => focura.dashboard(access)],
  ["GET", /^central\/views\/(ringkasan|guru-bk|siswa|sekolah|akun|orang-tua)$/, "admin", (access, page, _, query) => focura.centralView(access, page, query.get("school"))],
  ["GET", /^central\/schools\/([^/]+)$/, "admin", (access, id) => focura.dashboard(access, id)],
  ["POST", /^central\/schools$/, "admin", (access, _, body) => focura.saveSchool(access, body)],
  ["PATCH", /^central\/schools\/([^/]+)$/, "admin", (access, id, body) => focura.saveSchool(access, body, id)],
  ["GET", /^schools\/([^/]+)\/classes$/, "admin", (access, id) => focura.classes(access, id)],
  ["POST", /^schools\/([^/]+)\/classes$/, "admin", (access, id, body) => focura.createClass(access, id, body)],
  ["POST", /^central\/accounts$/, "admin", (access, _, body) => focura.saveAccount(access, body)],
  ["PATCH", /^central\/accounts\/([^/]+)$/, "admin", (access, id, body) => focura.saveAccount(access, body, id)],
  ["PATCH", /^central\/students\/([^/]+)\/class$/, "admin", (access, id, body) => focura.setClass(access, id, body)],
  ["POST", /^central\/guardian-links$/, "admin", (access, _, body) => focura.setGuardianLink(access, body)],
  ["GET", /^bk\/students$/, "bk", (access, _, __, query) => focura.dashboard(access, query.get("school"), "siswa")],
  ["GET", /^bk\/summary$/, "bk", (access) => focura.bkSummary(access)],
  ["POST", /^bk\/survey$/, "bk", (access, _, body) => focura.importSurvey(access, body)],
  ["GET", /^bk\/modules$/, "bk", (access) => focura.modules(access)],
  ["POST", /^bk\/modules$/, "bk", (access, _, body) => focura.saveModule(access, body)],
  ["PATCH", /^bk\/modules\/([^/]+)$/, "bk", (access, id, body) => focura.saveModule(access, body, id)],
  ["DELETE", /^bk\/modules\/([^/]+)$/, "bk", (access, id) => focura.saveModule(access, null, id, true)],
  ["GET", /^guardian\/children$/, "guardian", (access) => focura.children(access)],
  ["GET", /^me\/learning$/, "student", (access) => focura.learning(access)],
  ["POST", /^me\/learning$/, "student", (access, _, body) => focura.updateLearning(access, body)],
  ["GET", /^me\/modules$/, "student", (access) => focura.modules(access)],
];

function json(data, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

async function handle(request, context) {
  try {
    const { focura: path } = await context.params;
    const route = routes.find(([method, pattern]) => method === request.method && pattern.test(path.join("/")));
    if (!route) return json({ error: "Layanan tidak ditemukan." }, 404);
    const [method, pattern, role, action] = route;
    const token = process.env.NEXTAUTH_SECRET ? await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET }) : null;
    const access = await focura.context(token?.focuraSessionId);
    if (access.actor.role !== role) return json({ error: "Akses ditolak." }, 403);
    const url = new URL(request.url);
    let body;
    if (method !== "GET") {
      const origin = new URL(process.env.NEXTAUTH_URL || request.url).origin;
      if (request.headers.get("origin") !== origin) return json({ error: "Asal permintaan tidak valid." }, 403);
      if (method !== "DELETE") {
        const raw = await request.text();
        if (raw.length > 1_000_000) return json({ error: "Data permintaan terlalu besar." }, 413);
        try { body = JSON.parse(raw); } catch { body = null; }
        if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Data permintaan tidak valid." }, 400);
      }
    }
    const [, id] = pattern.exec(path.join("/"));
    const result = await action(access, id, body, url.searchParams);
    return json(result ?? { ok: true });
  } catch (error) {
    if (isAppError(error)) return json({ error: error.message }, error.status);
    console.error("Permintaan Focura gagal.", error.code || error.name);
    return json({ error: "Layanan sementara tidak tersedia. Silakan coba lagi." }, 503);
  }
}

export { handle as GET, handle as POST, handle as PATCH, handle as DELETE };
