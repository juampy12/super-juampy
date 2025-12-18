// lib/posSession.ts
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
}
