export type HoldItem = {
  product_id: string;
  name: string;
  sku: string | null;
  qty: number;
  unit_price: number;
  is_weighted?: boolean;
};

export type Hold = {
  id: string;
  items: HoldItem[];
  total: number;
  savedAt: number;
  register_id?: string | null;
};

const HOLD_KEY = "pos_holds_v2";

function readAllHolds(): Hold[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(HOLD_KEY) ?? "[]"); }
  catch { return []; }
}

export function getHolds(register_id?: string | null): Hold[] {
  const all = readAllHolds();
  if (!register_id) return all;
  return all.filter((h) => h.register_id === register_id);
}

export function saveHold(items: HoldItem[], total: number, register_id?: string | null): string {
  const all = readAllHolds();
  const id = Date.now().toString();
  all.push({ id, items, total, savedAt: Date.now(), register_id: register_id ?? null });
  localStorage.setItem(HOLD_KEY, JSON.stringify(all));
  return id;
}

export function removeHold(id: string) {
  const holds = readAllHolds().filter(h => h.id !== id);
  localStorage.setItem(HOLD_KEY, JSON.stringify(holds));
}

export function clearAllHolds() {
  localStorage.removeItem(HOLD_KEY);
}
