export type PosEmployee = {
  id: string;
  name: string;
  role: string;
  store_id: string | null;
  register_id: string | null;
};

export type NamedRef = { id: string; name: string };

const KEY = "sj_pos_employee";
const KEY_ROLE = "pos_role";
const KEY_OFFLINE_SESSION = "sj_pos_offline_session";
const KEY_STORES_CACHE = "sj_pos_stores_cache";
const KEY_REGISTERS_CACHE = "sj_pos_registers_cache";

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

export async function logoutPos() {
  if (typeof window === "undefined") return;
  localStorage.removeItem("sj_pos_employee");
  localStorage.removeItem("pos_role");
  localStorage.removeItem(KEY_OFFLINE_SESSION);
  await fetch("/api/employee/logout", { method: "POST" }).catch(() => {});
  window.location.href = "/pos-login";
}

// Marca que el login actual se resolvió localmente (sin poder contactar al
// servidor) — se limpia cuando trySilentReauth() consigue la cookie real.
export function markOfflineSession() {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY_OFFLINE_SESSION, "1");
}

export function clearOfflineSessionFlag() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY_OFFLINE_SESSION);
}

export function isOfflineSession(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(KEY_OFFLINE_SESSION) === "1";
}

// Últimas listas de sucursales/cajas obtenidas con éxito del servidor —
// permiten mostrar el nombre real (no solo el id) cuando el login offline
// no puede volver a consultar /api/stores ni /api/registers.
export function cacheStores(list: NamedRef[]) {
  if (typeof window === "undefined" || list.length === 0) return;
  localStorage.setItem(KEY_STORES_CACHE, JSON.stringify(list));
}

export function getCachedStores(): NamedRef[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY_STORES_CACHE);
    return raw ? (JSON.parse(raw) as NamedRef[]) : [];
  } catch {
    return [];
  }
}

export function cacheRegisters(storeId: string, list: NamedRef[]) {
  if (typeof window === "undefined" || list.length === 0) return;
  const all = getAllCachedRegisters();
  all[storeId] = list;
  localStorage.setItem(KEY_REGISTERS_CACHE, JSON.stringify(all));
}

export function getCachedRegisters(storeId: string): NamedRef[] {
  return getAllCachedRegisters()[storeId] ?? [];
}

function getAllCachedRegisters(): Record<string, NamedRef[]> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEY_REGISTERS_CACHE);
    return raw ? (JSON.parse(raw) as Record<string, NamedRef[]>) : {};
  } catch {
    return {};
  }
}
