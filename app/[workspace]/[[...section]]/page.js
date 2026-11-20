import { notFound } from "next/navigation";
import { WORKSPACES } from "../../../js/workspaces.js";
import FocuraShell from "../../shell.js";

async function getPage(params) {
  const { workspace, section = [] } = await params;
  const slug = section[0] || "";
  if (!Object.hasOwn(WORKSPACES, workspace) || section.length > 1 || !Object.hasOwn(WORKSPACES[workspace].pages, slug)) notFound();
  return { workspace, slug };
}

export async function generateMetadata({ params }) {
  const { workspace, slug } = await getPage(params);
  return { title: `${WORKSPACES[workspace].pages[slug]} | Focura` };
}

export default async function Page({ params }) {
  const { workspace, slug } = await getPage(params);
  return <FocuraShell workspace={workspace} section={slug} />;
}
