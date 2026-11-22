import { readFile } from "node:fs/promises";
import { join } from "node:path";
import Script from "next/script";
import { demoEnabled } from "../server/demo.js";
import Initialize from "./initialize.js";

export default async function FocuraShell({ workspace, section }) {
  const studentPreview = workspace === "admin" && section === "pratinjau-siswa";
  const template = await readFile(join(process.cwd(), "index.html"), "utf8");
  const [login, student, monitor, guardian, shared] = template.split("<body>")[1].split("</body>")[0]
    .split(/<!-- workspace:(?:student|monitor|guardian|shared) -->/);
  return <>
    <div id="focura" data-demo={demoEnabled || undefined} data-workspace={workspace} data-section={section}
      dangerouslySetInnerHTML={{ __html: login + (studentPreview ? student : workspace ? monitor : student + guardian) + shared }} />
    <div id="workspace-loading" className="workspace-loading" role="status" aria-live="polite">
      <div className="workspace-loading-card">
        <img src="/assets/svg/logo-focura.svg" alt="" width="44" height="44" />
        <span className="loading-spinner" aria-hidden="true"></span>
        <p>{workspace ? "Memuat ruang kerja…" : "Memuat Focura…"}</p>
      </div>
    </div>
    {(!workspace || studentPreview || section === "siswa" || section === "database") &&
      <Script src="https://cdn.sheetjs.com/xlsx-0.20.2/package/dist/xlsx.full.min.js" strategy="lazyOnload"
        integrity="sha384-gx12pQMMYnabkTgbCHqqrT65RwDnXI/f/dU2H9JUmT0KUeiMF5bf+yroQBmX0Nuk" crossOrigin="anonymous" />}
    <Initialize />
  </>;
}
