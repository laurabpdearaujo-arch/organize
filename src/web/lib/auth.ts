import { apiFetch } from "./api";

/** Sai da conta e volta para o login. */
export async function logout() {
  await apiFetch("/api/auth/logout", { method: "POST" }).catch(() => {});
  window.location.assign("/login");
}
