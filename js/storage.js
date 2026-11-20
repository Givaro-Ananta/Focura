import { api } from "./auth.js";

let data;
let write = Promise.resolve();

export async function loadStudentData() {
  const result = await api("me/learning");
  data = result.data;
  return result.kelas;
}

export function getStudentData() {
  return data;
}

export function updateStudentData(action, values) {
  const result = write.then(async () => { data = await api("me/learning", "POST", { action, ...values }); });
  write = result.catch(() => {});
  return result;
}
