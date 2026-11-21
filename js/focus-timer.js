import { getStudentData, loadStudentData, updateStudentData } from "./storage.js";

export function setupFocusTimer(refreshStudentPanels) {
  const display = document.getElementById("timer-display");
  const start = document.getElementById("btn-start-timer");
  const pause = document.getElementById("btn-pause-timer");
  const finish = document.getElementById("btn-finish-timer");
  const reset = document.getElementById("btn-reset-timer");
  const task = document.getElementById("focus-task");
  const topic = document.getElementById("focus-topic-input");
  const activeTopic = document.getElementById("focus-active-topic");
  const custom = document.getElementById("focus-custom");
  const customField = document.getElementById("focus-custom-field");
  const status = document.getElementById("focus-status");
  const presets = [...document.querySelectorAll(".duration-btn")];
  let selected = "10";
  let timer;
  let localDeadline;
  let interval;
  let busy = false;
  let completionAttempted = false;
  let requestId;

  const duration = () => selected === "custom" ? custom.valueAsNumber : Number(selected);
  const remaining = () => timer
    ? Math.max(0, localDeadline ? localDeadline - Date.now() : timer.remainingMs)
    : duration() * 60_000;

  function render() {
    const seconds = Math.ceil(remaining() / 1000);
    const ready = Boolean(timer?.deadline && seconds === 0);
    display.textContent = seconds >= 0 && seconds <= 10_800
      ? [Math.floor(seconds / 60), seconds % 60].map((part) => String(part).padStart(2, "0")).join(":")
      : "—:—";
    start.hidden = Boolean(timer?.deadline);
    start.textContent = timer ? "Lanjutkan" : "Mulai sesi fokus";
    pause.hidden = !timer?.deadline || ready;
    finish.hidden = !ready;
    finish.disabled = start.disabled = pause.disabled = reset.disabled = busy;
    task.disabled = custom.disabled = Boolean(timer) || busy;
    topic.disabled = task.disabled || Boolean(task.value);
    activeTopic.textContent = timer ? `Target latihan: ${timer.topic}` : "";
    presets.forEach((button) => {
      button.disabled = task.disabled;
      button.setAttribute("aria-pressed", String(button.dataset.mins === selected));
    });
  }

  function sync() {
    clearInterval(interval);
    timer = getStudentData().timer;
    if (timer) {
      selected = String(timer.durationMinutes);
      if (!presets.some((button) => button.dataset.mins === selected)) {
        selected = "custom";
        custom.value = timer.durationMinutes;
      }
      customField.hidden = selected !== "custom";
    }
    localDeadline = timer?.deadline ? Date.now() + timer.deadline - timer.serverNow : null;
    if (localDeadline) interval = setInterval(tick, 250);
    render();
  }

  function tick() {
    render();
    if (!busy && timer?.deadline && Date.now() >= localDeadline + 5000 && !completionAttempted) {
      completionAttempted = true;
      void change("recordFocus", current(), "Sesi selesai dan tercatat di Jejak Progres.");
    }
  }

  function current() {
    return { id: timer.id, version: timer.version };
  }

  async function change(action, values, message = "") {
    if (busy) return;
    busy = true;
    status.textContent = "Menyimpan timer…";
    render();
    try {
      await updateStudentData(action, values);
      requestId = null;
      completionAttempted = false;
      refreshStudentPanels();
      status.textContent = message;
      sync();
    } catch (error) {
      status.textContent = error.message;
      if (error.status === 409 || error.status === 404) {
        try {
          await loadStudentData();
          refreshStudentPanels();
          sync();
          if (timer?.deadline && remaining() > 0) completionAttempted = false;
        } catch {}
      }
    } finally {
      busy = false;
      render();
    }
  }

  for (const button of presets) {
    button.onclick = () => {
      selected = button.dataset.mins;
      customField.hidden = selected !== "custom";
      render();
      if (!customField.hidden) custom.focus();
    };
  }
  custom.oninput = task.onchange = render;
  start.onclick = () => {
    if (timer) return change("resumeFocus", current(), "Timer dilanjutkan.");
    if (selected === "custom" && !custom.reportValidity()) return;
    requestId ??= crypto.randomUUID();
    return change("startFocus", { requestId, durationMinutes: duration(), taskId: task.value, topic: topic.value }, "Timer berjalan.");
  };
  pause.onclick = () => change("pauseFocus", current(), "Timer dijeda.");
  finish.onclick = () => {
    if (!timer?.deadline || remaining() > 0) return;
    completionAttempted = true;
    return change("recordFocus", current(), "Sesi selesai dan tercatat di Jejak Progres.");
  };
  reset.onclick = () => {
    if (timer) return change("resetFocus", current(), "Timer direset.");
    status.textContent = "";
    render();
  };
  document.addEventListener("visibilitychange", tick);
  window.addEventListener("pageshow", tick);
  sync();
  tick();
}
