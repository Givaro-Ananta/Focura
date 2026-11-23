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

export function emptyState(content, { icon = "inbox", html = false, className = "", role = "" } = {}) {
  const body = html ? String(content ?? "") : escapeHtml(content);
  const cls = className ? `workspace-empty ${escapeHtml(className)}` : "workspace-empty";
  const roleAttr = role ? ` role="${escapeHtml(role)}"` : "";
  return `<div class="${cls}"${roleAttr}><svg class="ui-icon" aria-hidden="true"><use href="/assets/svg/interface.svg#${escapeHtml(icon)}" /></svg><p>${body}</p></div>`;
}

export function setFeedback(element, message, tone = "") {
  if (!element) return;
  element.textContent = message || "";
  if (message && tone) element.dataset.tone = tone;
  else delete element.dataset.tone;
}

function toastIcon(tone) {
  if (tone === "success") {
    return '<svg viewBox="0 0 20 20" aria-hidden="true"><circle class="focura-toast-ring" cx="10" cy="10" r="8"/><path class="focura-toast-check" d="M6.2 10.3 8.8 12.9 14 7.5"/></svg>';
  }
  if (tone === "error") {
    return '<svg viewBox="0 0 20 20" aria-hidden="true"><circle class="focura-toast-ring" cx="10" cy="10" r="8"/><path class="focura-toast-mark" d="M10 6.5v4.5M10 13.5h.01"/></svg>';
  }
  return '<svg viewBox="0 0 20 20" aria-hidden="true"><circle class="focura-toast-ring" cx="10" cy="10" r="8"/><path class="focura-toast-mark" d="M10 9.5v4.5M10 6.5h.01"/></svg>';
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
  for (const existing of [...stack.children]) {
    if (existing.dataset.message === message && existing.dataset.tone === tone) existing.remove();
  }
  while (stack.children.length >= 3) stack.firstElementChild?.remove();

  const toast = document.createElement("div");
  toast.className = "focura-toast";
  toast.dataset.tone = tone;
  toast.dataset.message = message;
  toast.setAttribute("role", tone === "error" ? "alert" : "status");

  const icon = document.createElement("span");
  icon.className = "focura-toast-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.innerHTML = toastIcon(tone);

  const text = document.createElement("span");
  text.textContent = message;

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "focura-toast-close";
  closeButton.setAttribute("aria-label", "Tutup notifikasi");
  closeButton.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 4.5 11.5 11.5M11.5 4.5 4.5 11.5"/></svg>';

  toast.append(icon, text, closeButton);
  stack.append(toast);

  let timer;
  let dismissed = false;
  let remaining = 4500;
  let startedAt = Date.now();
  const dismiss = () => {
    if (dismissed) return;
    dismissed = true;
    clearTimeout(timer);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      toast.remove();
      return;
    }
    toast.classList.add("is-leaving");
    setTimeout(() => toast.remove(), 180);
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

export function openModuleModal(module, { readOnly = false } = {}) {
  if (!module?.previewUrl) return;
  const modal = document.getElementById("module-preview-modal");
  const iframe = document.getElementById("module-preview-frame");
  const loading = document.getElementById("module-preview-loading");
  const external = document.getElementById("module-preview-external");
  const listeners = new AbortController();
  document.getElementById("module-preview-title").textContent = module.title;
  if (external) {
    const isLocal = module.previewUrl.startsWith("/");
    external.hidden = isLocal;
    if (!isLocal) {
      external.href = readOnly ? module.previewUrl : module.editUrl;
      external.textContent = readOnly ? "Layar penuh" : "Buka di Drive";
    }
  }
  if (loading) loading.hidden = false;
  iframe.addEventListener("load", () => {
    loading.hidden = true;
  }, { once: true, signal: listeners.signal });
  iframe.src = module.previewUrl;
  modal.addEventListener("click", (event) => {
    if (event.target === modal) modal.close();
  }, { signal: listeners.signal });
  modal.addEventListener("close", () => {
    listeners.abort();
    iframe.removeAttribute("src");
    loading.hidden = true;
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
