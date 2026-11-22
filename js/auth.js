import { signIn, signOut } from "next-auth/react";

async function readJson(response) {
  const body = await response.text();
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
}

export async function getActiveSession() {
  const response = await fetch("/api/auth/session", { cache: "no-store" });
  const data = await readJson(response);
  if (!response.ok) throw new Error(data.error || "Sesi tidak dapat diperiksa.");
  return data.user || null;
}

export function loginUser(provider, callbackUrl, options) {
  return signIn(provider, { callbackUrl, ...options });
}

export function logoutUser() {
  return signOut({ callbackUrl: "/" });
}

export async function api(path, method = "GET", body) {
  const response = await fetch("/api/" + path, {
    method, cache: "no-store", ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
  });
  const data = await readJson(response);
  if (response.status === 401) {
    window.location.replace("/?error=SessionExpired");
    throw Object.assign(new Error("Sesi telah berakhir. Mengarahkan ke halaman masuk…"), { status: 401, redirecting: true });
  }
  if (!response.ok) throw Object.assign(new Error(data.error || "Permintaan tidak dapat diproses."), { status: response.status });
  return data;
}
