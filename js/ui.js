import { driveLinks } from "./learning-rules.js";

export function setupMobileMenu(toggle) {
  const menu = document.getElementById(toggle.getAttribute("aria-controls"));
  toggle.onclick = () => {
    toggle.ariaExpanded = String(toggle.ariaExpanded !== "true");
  };
  toggle.parentElement.onkeydown = (event) => {
    if (event.key === "Escape" && toggle.ariaExpanded === "true" && toggle.offsetWidth) {
      toggle.ariaExpanded = "false";
      toggle.focus();
    }
  };
  menu.onclick = (event) => {
    if (event.target.closest("nav a") && toggle.offsetWidth) toggle.ariaExpanded = "false";
  };
}

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

export function openDriveModal(module) {
  const links = driveLinks(module?.editUrl);
  if (!links) return;
  const modal = document.getElementById("drive-preview-modal");
  const iframe = document.getElementById("modal-drive-iframe");
  document.getElementById("modal-drive-title").textContent = module.title;
  iframe.src = links.previewUrl;
  modal.addEventListener("close", () => iframe.removeAttribute("src"), { once: true });
  modal.showModal();
}

export function showDialog(container, title, fields) {
  const dialog = document.createElement("dialog");
  dialog.className = "workspace-dialog";
  dialog.setAttribute("aria-labelledby", "workspace-dialog-title");
  dialog.innerHTML = `<div class="workspace-dialog-heading"><h2 id="workspace-dialog-title">${escapeHtml(title)}</h2>
    <button type="button" class="workspace-row-action" data-action="close-dialog">Tutup</button></div>
    <p class="workspace-feedback" role="status"></p>${fields}`;
  container.append(dialog);
  dialog.querySelector('[data-action="close-dialog"]').onclick = () => dialog.close();
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  dialog.showModal();
  return dialog;
}
