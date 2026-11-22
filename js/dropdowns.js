const dropdowns = new WeakMap();

export function syncDropdown(select) {
  dropdowns.get(select)?.refresh();
}

function dropdownIcon(name) {
  return `<svg class="ui-icon" aria-hidden="true"><use href="/assets/svg/interface.svg#${name}" /></svg>`;
}

export function setupDropdowns(root) {
  let nextId = 0;
  let current;
  const listeners = new AbortController();
  const fieldEvents = { signal: listeners.signal };

  function close() {
    if (!current) return;
    const { trigger, list } = current;
    current = null;
    if (list.hidePopover) list.hidePopover();
    list.hidden = true;
    trigger.ariaExpanded = "false";
    trigger.removeAttribute("aria-activedescendant");
  }

  function position() {
    if (!current?.list.showPopover) return;
    const { trigger, list } = current;
    const bounds = trigger.getBoundingClientRect();
    if (!bounds.width || bounds.bottom < 0 || bounds.top > window.innerHeight) {
      close();
      return;
    }
    const below = window.innerHeight - bounds.bottom - 12;
    const above = bounds.top - 12;
    const opensUp = below < Math.min(list.scrollHeight, 260) && above > below;
    list.style.left = `${bounds.left}px`;
    list.style.width = `${bounds.width}px`;
    list.style.top = opensUp ? "auto" : `${bounds.bottom + 6}px`;
    list.style.bottom = opensUp ? `${window.innerHeight - bounds.top + 6}px` : "auto";
    list.style.maxHeight = `${Math.max(0, Math.min(260, opensUp ? above : below))}px`;
  }

  function enhance(select) {
    if (dropdowns.has(select) || select.multiple || select.size > 1) return;
    const label = [...select.labels].map((element) => {
      const copy = element.cloneNode(true);
      copy.querySelector("select")?.remove();
      return copy.textContent.trim();
    }).join(" ");
    const wrapper = document.createElement("span");
    wrapper.className = "dropdown";
    wrapper.innerHTML = `<span class="form-control dropdown-trigger" role="combobox" aria-haspopup="listbox" aria-expanded="false">
      <span class="dropdown-value"></span><span class="dropdown-chevron">${dropdownIcon("chevron-down")}</span>
    </span><span class="dropdown-list" role="listbox" hidden></span>`;
    const trigger = wrapper.querySelector(".dropdown-trigger");
    const value = wrapper.querySelector(".dropdown-value");
    const list = wrapper.querySelector(".dropdown-list");
    const name = select.getAttribute("aria-label") || label;
    list.id = `focura-options-${++nextId}`;
    list.setAttribute("aria-label", name);
    trigger.setAttribute("aria-controls", list.id);
    list.setAttribute("popover", "manual");
    const dropdown = { wrapper, trigger, list, refresh };
    let highlighted = -1;
    let search = "";
    let lastKey = 0;
    dropdowns.set(select, dropdown);
    select.before(wrapper);
    wrapper.prepend(select);
    select.classList.add("dropdown-native");
    select.tabIndex = -1;
    select.setAttribute("aria-hidden", "true");

    function highlight(index, scroll = true) {
      list.children[highlighted]?.classList.remove("highlighted");
      highlighted = index;
      const item = list.children[index];
      if (!item) {
        trigger.removeAttribute("aria-activedescendant");
        return;
      }
      item.classList.add("highlighted");
      trigger.setAttribute("aria-activedescendant", item.id);
      if (scroll) {
        const offset = item.offsetTop;
        if (offset < list.scrollTop) list.scrollTop = offset;
        else if (offset + item.offsetHeight > list.scrollTop + list.clientHeight) {
          list.scrollTop = offset + item.offsetHeight - list.clientHeight;
        }
      }
    }

    function availableOptions() {
      return [...select.options].flatMap((option, index) => option.matches(":disabled") ? [] : [index]);
    }

    function refresh() {
      const selected = select.selectedOptions[0]?.label || "";
      value.textContent = selected;
      trigger.setAttribute("aria-label", [name, selected].filter(Boolean).join(": "));
      trigger.tabIndex = select.disabled ? -1 : 0;
      trigger.ariaDisabled = String(select.disabled);
      trigger.ariaRequired = String(select.required);
      trigger.ariaInvalid = String(wrapper.hasAttribute("data-invalid"));
      if (current !== dropdown) return;
      if (select.disabled) {
        close();
        return;
      }
      list.replaceChildren(...[...select.options].map((option, index) => {
        const item = document.createElement("span");
        item.id = `${list.id}-${index}`;
        item.dataset.index = index;
        item.setAttribute("role", "option");
        item.ariaSelected = String(option.selected);
        item.ariaDisabled = String(option.matches(":disabled"));
        const text = document.createElement("span");
        text.textContent = option.label;
        item.append(text);
        if (option.selected) item.insertAdjacentHTML("beforeend", dropdownIcon("check"));
        return item;
      }));
      position();
      if (current === dropdown) highlight(select.selectedIndex);
    }

    function open() {
      if (select.disabled) return;
      close();
      current = dropdown;
      list.hidden = false;
      if (list.showPopover) list.showPopover();
      trigger.ariaExpanded = "true";
      search = "";
      refresh();
    }

    function choose(index) {
      if (!availableOptions().includes(index)) return;
      close();
      if (select.selectedIndex === index) return;
      select.selectedIndex = index;
      select.dispatchEvent(new Event("input", { bubbles: true }));
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }

    trigger.addEventListener("click", (event) => {
      event.preventDefault();
      trigger.focus();
      if (current === dropdown) close();
      else open();
    }, fieldEvents);
    list.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse") event.preventDefault();
    }, fieldEvents);
    list.addEventListener("click", (event) => {
      event.preventDefault();
      const item = event.target.closest("[data-index]");
      if (item) choose(Number(item.dataset.index));
    }, fieldEvents);
    trigger.addEventListener("keydown", (event) => {
      if (select.disabled) return;
      const { key } = event;
      const isOpen = current === dropdown;
      if (key === "Escape" && isOpen) {
        event.preventDefault();
        event.stopPropagation();
        close();
      } else if (key === "Enter" || key === " ") {
        event.preventDefault();
        if (isOpen) choose(highlighted);
        else open();
      } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(key)) {
        event.preventDefault();
        if (!isOpen) open();
        const indices = availableOptions();
        if (key === "Home" || key === "End") highlight(indices.at(key === "Home" ? 0 : -1));
        else if (isOpen) {
          const index = indices.indexOf(highlighted);
          const next = key === "ArrowDown" ? index + 1 : index < 0 ? indices.length - 1 : index - 1;
          highlight(indices[Math.max(0, Math.min(indices.length - 1, next))]);
        }
      } else if (key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
        event.preventDefault();
        if (!isOpen) open();
        const now = Date.now();
        search = (now - lastKey < 650 ? search : "") + key.toLocaleLowerCase();
        lastKey = now;
        const index = availableOptions().find((i) => select.options[i].label.toLocaleLowerCase().startsWith(search));
        if (index !== undefined) highlight(index);
      }
    }, fieldEvents);
    select.addEventListener("focus", () => trigger.focus(), fieldEvents);
    select.addEventListener("click", (event) => event.preventDefault(), fieldEvents);
    select.addEventListener("change", () => {
      wrapper.removeAttribute("data-invalid");
      refresh();
    }, fieldEvents);
    select.addEventListener("invalid", () => {
      wrapper.setAttribute("data-invalid", "");
      refresh();
    }, fieldEvents);
    const wasFocused = document.activeElement === select;
    refresh();
    if (wasFocused) trigger.focus();
  }

  const observer = new MutationObserver((records) => {
    const changed = new Set();
    for (const { target, addedNodes } of records) {
      const select = target.nodeType === 1 ? target.closest("select") : target.parentElement?.closest("select");
      if (select) changed.add(select);
      for (const node of addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.matches("select")) enhance(node);
        else node.querySelectorAll("select").forEach(enhance);
      }
    }
    changed.forEach(syncDropdown);
    if (current && !root.contains(current.wrapper)) close();
  });
  root.querySelectorAll("select").forEach(enhance);
  observer.observe(root, { childList: true, subtree: true, attributes: true, characterData: true,
    attributeFilter: ["disabled", "required", "selected", "label", "value"] });

  const options = { signal: listeners.signal, capture: true };
  function closeOutside({ target }) {
    if (current && !current.wrapper.contains(target)) close();
  }
  document.addEventListener("pointerdown", closeOutside, options);
  document.addEventListener("focusin", closeOutside, options);
  document.addEventListener("scroll", (event) => {
    if (current && event.target !== current.list) position();
  }, options);
  window.addEventListener("resize", position, options);
  root.addEventListener("reset", (event) => {
    const form = event.target;
    queueMicrotask(() => form.querySelectorAll("select").forEach(syncDropdown));
  }, options);
  return () => {
    close();
    observer.disconnect();
    listeners.abort();
    root.querySelectorAll("select.dropdown-native").forEach((select) => {
      const { wrapper } = dropdowns.get(select);
      wrapper.before(select);
      wrapper.remove();
      select.classList.remove("dropdown-native");
      select.removeAttribute("aria-hidden");
      select.removeAttribute("tabindex");
      dropdowns.delete(select);
    });
  };
}
