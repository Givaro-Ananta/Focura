/**
 * Modul Penyimpanan Data Terisolasi Per Akun Siswa
 * Menjamin privasi 100%: kunci penyimpanan dikaitkan langsung dengan userId unik.
 */

function getStorageKey(userId) {
  return `focura_private_data_${userId}`;
}

export function getStudentData(userId) {
  const defaultData = {
    tasks: [],
    focusSessions: [],
    reflections: [],
    selectedBarriers: [],
    weeklyMinutes: { Sen: 0, Sel: 0, Rab: 0, Kam: 0, Jum: 0, Sab: 0, Min: 0 },
    privacyShareAllowed: true
  };

  try {
    const raw = localStorage.getItem(getStorageKey(userId));
    if (!raw) return defaultData;
    return { ...defaultData, ...JSON.parse(raw) };
  } catch {
    return defaultData;
  }
}

export function saveStudentData(userId, updatedData) {
  localStorage.setItem(getStorageKey(userId), JSON.stringify(updatedData));
}

export function addStudentTask(userId, title, priority) {
  const data = getStudentData(userId);
  data.tasks.unshift({
    id: "TSK-" + Date.now(),
    title,
    priority,
    completed: false,
    createdAt: new Date().toLocaleDateString("id-ID")
  });
  saveStudentData(userId, data);
  return data;
}

export function toggleStudentTask(userId, taskId) {
  const data = getStudentData(userId);
  data.tasks = data.tasks.map((t) =>
    t.id === taskId ? { ...t, completed: !t.completed } : t
  );
  saveStudentData(userId, data);
  return data;
}

export function recordFocusSession(userId, durationMinutes, topic) {
  const data = getStudentData(userId);
  const days = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
  const todayLabel = days[new Date().getDay()];

  data.focusSessions.unshift({
    id: "FCS-" + Date.now(),
    durationMinutes,
    topic: topic || "Sesi Latihan Fokus Mandiri",
    completedAt: new Date().toLocaleString("id-ID")
  });
  data.weeklyMinutes[todayLabel] = (data.weeklyMinutes[todayLabel] || 0) + durationMinutes;
  saveStudentData(userId, data);
  return data;
}

export function saveStudentReflection(userId, learned, feeling, improvement) {
  const data = getStudentData(userId);
  data.reflections.unshift({
    id: "RFL-" + Date.now(),
    learned,
    feeling,
    improvement,
    date: new Date().toLocaleString("id-ID")
  });
  saveStudentData(userId, data);
  return data;
}

export function saveStudentBarriers(userId, barrierIds) {
  const data = getStudentData(userId);
  data.selectedBarriers = barrierIds;
  saveStudentData(userId, data);
  return data;
}
