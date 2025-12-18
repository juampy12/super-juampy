export type PosEmployee = {
  id: string;
  name: string;
  role: "cashier" | "supervisor";
  store_id: string | null;
};

const KEY = "pos_employee";

export function setPosEmployee(emp: PosEmployee) {
  localStorage.setItem(KEY, JSON.stringify(emp));
}

export function getPosEmployee(): PosEmployee | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearPosEmployee() {
  localStorage.removeItem(KEY);
}
