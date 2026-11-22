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

export function setFeedback(element, message, tone = "") {
  if (!element) return;
  element.textContent = message || "";
  if (message && tone) element.dataset.tone = tone;
  else delete element.dataset.tone;
}

export function showToast(message, tone = "info") {
  if (!message) return;
  let stack = document.getElementById("focura-toast-stack");
  if (!stack) {
    stack = document.createElement("div");
    stack.id = "focura-toast-stack";
    stack.className = "focura-toast-stack";
    document.body.append(stack);
  }
  while (stack.children.length >= 3) stack.firstElementChild?.remove();

  const toast = document.createElement("div");
  toast.className = "focura-toast";
  toast.dataset.tone = tone;
  toast.setAttribute("role", tone === "error" ? "alert" : "status");

  const text = document.createElement("span");
  text.textContent = message;

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "focura-toast-close";
  closeButton.setAttribute("aria-label", "Tutup notifikasi");
  closeButton.textContent = "×";

  toast.append(text, closeButton);
  stack.append(toast);

  let timer;
  let remaining = 4500;
  let startedAt = Date.now();
  const dismiss = () => {
    clearTimeout(timer);
    toast.remove();
  };
  const schedule = () => {
    clearTimeout(timer);
    startedAt = Date.now();
    timer = setTimeout(dismiss, remaining);
  };
  const pause = () => {
    clearTimeout(timer);
    remaining = Math.max(800, remaining - (Date.now() - startedAt));
  };

  closeButton.onclick = dismiss;
  toast.addEventListener("mouseenter", pause);
  toast.addEventListener("focusin", pause);
  toast.addEventListener("mouseleave", schedule);
  toast.addEventListener("focusout", schedule);
  schedule();
}

export function openDriveModal(module) {
  const links = driveLinks(module?.editUrl);
  if (!links) return;
  const modal = document.getElementById("drive-preview-modal");
  const iframe = document.getElementById("modal-drive-iframe");
  const loading = document.getElementById("modal-drive-loading");
  const external = document.getElementById("modal-drive-external");
  const listeners = new AbortController();
  document.getElementById("modal-drive-title").textContent = module.title;
  if (external) external.href = links.editUrl;
  if (loading) loading.hidden = false;
  iframe.addEventListener("load", () => {
    if (loading) loading.hidden = true;
  }, { once: true, signal: listeners.signal });
  iframe.src = links.previewUrl;
  modal.addEventListener("click", (event) => {
    if (event.target === modal) modal.close();
  }, { signal: listeners.signal });
  modal.addEventListener("close", () => {
    listeners.abort();
    iframe.removeAttribute("src");
    if (loading) loading.hidden = true;
  }, { once: true });
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
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  dialog.showModal();
  return dialog;
}

export function confirmDialog(container, { title, message, confirmLabel = "Lanjutkan", cancelLabel = "Batal", destructive = false } = {}) {
  const host = container || document.body;
  const dialog = document.createElement("dialog");
  dialog.className = "workspace-dialog";
  const headingId = `confirm-dialog-title-${Date.now()}`;
  dialog.setAttribute("aria-labelledby", headingId);
  dialog.innerHTML = `<div class="workspace-dialog-heading"><h2 id="${headingId}">${escapeHtml(title)}</h2>
    <button type="button" class="workspace-row-action" data-confirm="cancel">Tutup</button></div>
    <p class="confirm-message">${escapeHtml(message)}</p>
    <div class="workspace-actions">
      <button type="button" class="btn ${destructive ? "btn-danger-solid" : "btn-primary"}" data-confirm="ok">${escapeHtml(confirmLabel)}</button>
      <button type="button" class="btn btn-outline" data-confirm="cancel" autofocus>${escapeHtml(cancelLabel)}</button>
    </div>`;
  host.append(dialog);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (accepted) => {
      if (settled) return;
      settled = true;
      if (dialog.open) dialog.close();
      resolve(accepted);
    };
    dialog.querySelector('[data-confirm="ok"]').onclick = () => finish(true);
    dialog.querySelectorAll('[data-confirm="cancel"]').forEach((btn) => {
      btn.onclick = () => finish(false);
    });
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) finish(false);
    });
    dialog.addEventListener("close", () => {
      dialog.remove();
      finish(false);
    }, { once: true });
    dialog.showModal();
  });
}
