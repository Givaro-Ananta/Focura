import { api } from "./auth.js";

let data;
let write = Promise.resolve();
let studentEndpoint = "me";

export function useStudentPreview(enabled = true) {
  studentEndpoint = enabled ? "central/student-preview" : "me";
}

export function loadStudentModules() {
  return api(`${studentEndpoint}/modules`);
}

export async function loadStudentData() {
  const result = await api(`${studentEndpoint}/learning`);
  data = result.data;
  return result.kelas;
}

export function getStudentData() {
  return data;
}

export function updateStudentData(action, values) {
  const result = write.then(async () => {
    data = await api(`${studentEndpoint}/learning`, "POST", { action, ...values });
    return data;
  });
  write = result.catch(() => {});
  return result;
}
