import { getStudentData, loadStudentData, updateStudentData } from "./storage.js";
import { setFeedback, showToast } from "./ui.js";

function playCompletionChime() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    [523.25, 659.25].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.001, now + idx * 0.16);
      gain.gain.exponentialRampToValueAtTime(0.14, now + idx * 0.16 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.16 + 0.45);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.16);
      osc.stop(now + idx * 0.16 + 0.48);
    });
    setTimeout(() => ctx.close().catch(() => {}), 1000);
  } catch {}
}

export function setupFocusTimer(refreshStudentPanels) {
  const studentView = document.getElementById("student-app-view");
  const display = document.getElementById("timer-display");
  const timerValue = document.getElementById("timer-value");
  const timerSublabel = document.getElementById("timer-sublabel");
  const island = document.getElementById("focus-island");
  const islandState = document.getElementById("focus-island-state");
  const islandTime = document.getElementById("focus-island-time");
  const start = document.getElementById("btn-start-timer");
  const pause = document.getElementById("btn-pause-timer");
  const finish = document.getElementById("btn-finish-timer");
  const reset = document.getElementById("btn-reset-timer");
  const task = document.getElementById("focus-task");
  const topic = document.getElementById("focus-topic-input");
  const activeTopic = document.getElementById("focus-active-topic");
  const custom = document.getElementById("focus-custom");
  const customField = document.getElementById("focus-custom-field");
  const soundToggle = document.getElementById("focus-sound-toggle");
  const postActions = document.getElementById("focus-post-actions");
  const status = document.getElementById("focus-status");
  const presets = [...document.querySelectorAll(".duration-btn")];
  const baseTitle = document.title;
  const listeners = new AbortController();
  let selected = "10";
  let timer;
  let localDeadline;
  let interval;
  let busy = false;
  let completionAttempted = false;
  let requestId;
  let focusRunning;
  let chimePlayedForId = null;
  let initialRender = true;

  const duration = () => {
    if (selected !== "custom") return Number(selected);
    const value = custom.valueAsNumber;
    return Number.isFinite(value) && value >= 1 ? Math.min(180, Math.round(value)) : 15;
  };
  const remaining = () => timer
    ? Math.max(0, localDeadline ? localDeadline - Date.now() : timer.remainingMs)
    : duration() * 60_000;

  function destroy() {
    clearInterval(interval);
    listeners.abort();
    document.title = baseTitle;
  }

  function updateFocusPalette(running) {
    if (focusRunning === running) return;
    const initial = focusRunning === undefined;
    focusRunning = running;
    const applyPalette = () => studentView.classList.toggle("focus-running", focusRunning);
    if (initial || document.hidden || !document.startViewTransition ||
        window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      applyPalette();
      return;
    }
    document.startViewTransition(applyPalette);
  }

  function render() {
    if (!studentView.isConnected) {
      destroy();
      return;
    }
    const totalMs = (timer ? timer.durationMinutes : duration()) * 60_000;
    const rem = remaining();
    const seconds = Math.ceil(rem / 1000);
    const ready = Boolean(timer?.deadline && seconds === 0);
    const running = Boolean(timer?.deadline && seconds > 0);
    updateFocusPalette(running);
    const progressPct = totalMs > 0 ? Math.max(0, Math.min(100, (rem / totalMs) * 100)) : 100;
    display.style.setProperty("--timer-progress", `${progressPct.toFixed(2)}%`);
    display.classList.toggle("is-running", running);
    display.classList.toggle("is-paused", Boolean(timer && !timer.deadline));
    display.classList.toggle("is-ready", ready);

    const time = seconds >= 0 && seconds <= 10_800
      ? [Math.floor(seconds / 60), seconds % 60].map((part) => String(part).padStart(2, "0")).join(":")
      : "—:—";
    if (timerValue) {
      if (timerValue.textContent !== time) timerValue.textContent = time;
    } else if (display.textContent !== time) {
      display.textContent = time;
    }
    const sublabel = ready ? "Waktu habis" : running ? "Sedang fokus" : timer ? "Dijeda" : "Siap mulai";
    if (timerSublabel && timerSublabel.textContent !== sublabel) timerSublabel.textContent = sublabel;

    const nextTitle = ready
      ? `Waktu habis · ${baseTitle}`
      : timer
        ? `${time} · ${timer.deadline ? "Fokus" : "Dijeda"} — Focura`
        : baseTitle;
    if (document.title !== nextTitle) document.title = nextTitle;

    if (ready && timer && chimePlayedForId !== timer.id) {
      chimePlayedForId = timer.id;
      if (!initialRender && soundToggle?.checked) playCompletionChime();
    }

    island.hidden = !timer;
    if (timer) {
      const label = ready ? "Waktu habis" : timer.deadline ? "Sedang fokus" : "Fokus dijeda";
      if (islandState.textContent !== label) islandState.textContent = label;
      if (islandTime.textContent !== time) islandTime.textContent = time;
    }
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
    setFeedback(status, "Menyimpan timer…");
    render();
    try {
      await updateStudentData(action, values);
      requestId = null;
      completionAttempted = false;
      if (action === "startFocus" && postActions) postActions.hidden = true;
      if (action === "recordFocus" && postActions) postActions.hidden = false;
      refreshStudentPanels();
      setFeedback(status, "");
      if (message) showToast(message, "success");
      sync();
    } catch (error) {
      setFeedback(status, "");
      showToast(error.message, "error");
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
    if (postActions) postActions.hidden = true;
    setFeedback(status, "");
    render();
  };
  document.addEventListener("visibilitychange", tick, { signal: listeners.signal });
  window.addEventListener("pageshow", tick, { signal: listeners.signal });
  sync();
  tick();
  initialRender = false;
  return { syncTasks: render, destroy };
}
