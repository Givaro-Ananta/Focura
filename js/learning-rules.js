export const JAKARTA = "Asia/Jakarta";
export const PRIORITIES = ["Tinggi", "Sedang", "Rendah"];
export const SURVEY_ITEMS = {
  konsentrasi: "Dapat menjaga konsentrasi selama belajar",
  target: "Menetapkan target sebelum belajar",
  strategi: "Mengetahui cara mengembalikan perhatian saat teralihkan",
  evaluasi: "Mengevaluasi cara belajar yang sudah dicoba",
};

export function rplActivityCount({ selectedBarriers, tasks, focusSessions, reflections }) {
  return [selectedBarriers, tasks, focusSessions, reflections].filter((activity) => activity.length > 0).length;
}

export function driveLinks(value) {
  if (typeof value !== "string" || value.length > 2048) return null;
  let url;
  try { url = new URL(value.trim()); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
  const path = url.hostname === "drive.google.com"
    ? url.pathname.match(/^\/file\/d\/([\w-]+)(?:\/|$)/)?.[0].replace(/\/$/, "")
      || (url.pathname === "/open" && /^[\w-]+$/.test(url.searchParams.get("id") || "") ? "/file/d/" + url.searchParams.get("id") : null)
    : url.hostname === "docs.google.com"
      ? url.pathname.match(/^\/(document|spreadsheets|presentation)\/d\/[\w-]+(?:\/|$)/)?.[0].replace(/\/$/, "")
      : null;
  if (!path) return null;
  const key = url.searchParams.get("resourcekey");
  const query = key ? "?" + new URLSearchParams({ resourcekey: key }) : "";
  const link = url.origin + path;
  return { editUrl: link + (url.hostname === "drive.google.com" ? "/view" : "/edit") + query, previewUrl: link + "/preview" + query };
}
