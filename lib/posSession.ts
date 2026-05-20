export type PosEmployee = {
  id: string;
  name: string;
  role: string;
  store_id: string | null;
};
const KEY = "sj_pos_employee";
const KEY_ROLE = "pos_role";

export function setPosEmployee(emp: PosEmployee) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(emp));
  localStorage.setItem(KEY_ROLE, emp.role ?? "");
  document.cookie = "sj_pos_auth=1; path=/; max-age=43200; SameSite=Strict";
}

export function getPosEmployee(): PosEmployee | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PosEmployee;
  } catch {
    return null;
  }
}

export function clearPosEmployee() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY);
  localStorage.removeItem(KEY_ROLE);
  document.cookie = "sj_pos_auth=; path=/; max-age=0";
}

export function logoutPos() {
  if (typeof window === "undefined") return;
  localStorage.removeItem("sj_pos_employee");
  localStorage.removeItem("pos_role");
  document.cookie = "sj_pos_auth=; path=/; max-age=0";
  window.location.href = "/pos-login";
}
