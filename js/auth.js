import { signIn, signOut } from "next-auth/react";

export async function getActiveSession() {
  const response = await fetch("/api/auth/session", { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Sesi tidak dapat diperiksa.");
  return data.user || null;
}

export function loginUser(provider, callbackUrl) {
  return signIn(provider, { callbackUrl });
}

export function logoutUser() {
  return signOut({ callbackUrl: "/" });
}

export async function api(path, method = "GET", body) {
  const response = await fetch("/api/" + path, {
    method, cache: "no-store", ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (response.status === 401) window.location.replace("/?error=SessionExpired");
  if (!response.ok) throw new Error(data.error || "Permintaan tidak dapat diproses.");
  return data;
}
