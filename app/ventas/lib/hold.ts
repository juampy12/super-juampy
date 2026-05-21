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
};

const HOLD_KEY = "pos_holds_v2";

export function getHolds(): Hold[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(HOLD_KEY) ?? "[]"); }
  catch { return []; }
}

export function saveHold(items: HoldItem[], total: number): string {
  const holds = getHolds();
  const id = Date.now().toString();
  holds.push({ id, items, total, savedAt: Date.now() });
  localStorage.setItem(HOLD_KEY, JSON.stringify(holds));
  return id;
}

export function removeHold(id: string) {
  const holds = getHolds().filter(h => h.id !== id);
  localStorage.setItem(HOLD_KEY, JSON.stringify(holds));
}

export function clearAllHolds() {
  localStorage.removeItem(HOLD_KEY);
}
