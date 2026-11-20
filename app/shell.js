import { readFile } from "node:fs/promises";
import { join } from "node:path";
import Script from "next/script";
import { demoEnabled } from "../server/demo.js";
import Initialize from "./initialize.js";

export default async function FocuraShell({ workspace, section }) {
  const template = await readFile(join(process.cwd(), "index.html"), "utf8");
  const [login, student, monitor, guardian] = template.split("<body>")[1].split("</body>")[0]
    .split(/<!-- workspace:(?:student|monitor|guardian) -->/);
  return <>
    <div id="focura" data-demo={demoEnabled || undefined} data-workspace={workspace} data-section={section}
      dangerouslySetInnerHTML={{ __html: workspace ? login + monitor : login + student + guardian }} />
    {workspace && <p id="workspace-loading" className="workspace-loading" role="status">Memuat ruang kerja…</p>}
    {(!workspace || (workspace === "bk" && !section) || section === "siswa") &&
      <Script src="https://cdn.sheetjs.com/xlsx-0.20.2/package/dist/xlsx.full.min.js" strategy="lazyOnload" />}
    <Initialize />
  </>;
}
