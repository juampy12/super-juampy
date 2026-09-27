// Guardar/retomar tiene que preservar TODOS los campos de la línea del
// carrito: si se pierde uno, la venta retomada se comporta distinto.
export type HoldItem = {
  product_id: string;
  lineId?: string; // clave única de línea (balanza: varias líneas del mismo producto)
  name: string;
  sku: string | null;
  qty: number;
  unit_price: number; // precio unitario mostrado (con promo ya aplicada)
  base_unit_price?: number; // precio sin promo — base para recalcular la promo al cambiar qty
  has_offer?: boolean;
  is_weighted?: boolean;
  is_balanza?: boolean; // ítem de balanza (precio embebido en la etiqueta) — debe sobrevivir a guardar/retomar
  qty_buy?: number; // nxm / second_unit_pct
  qty_pay?: number; // nxm
  promo_pct?: number; // second_unit_pct
};

export function toHoldItem(it: HoldItem): HoldItem {
  return {
    product_id: it.product_id,
    lineId: it.lineId,
    name: it.name,
    sku: it.sku,
    qty: it.qty,
    unit_price: it.unit_price,
    base_unit_price: it.base_unit_price,
    has_offer: it.has_offer,
    is_weighted: it.is_weighted,
    is_balanza: it.is_balanza,
    qty_buy: it.qty_buy,
    qty_pay: it.qty_pay,
    promo_pct: it.promo_pct,
  };
}

// Holds guardados antes de preservar todos los campos no traen lineId ni
// datos de promo: a la balanza se le genera un lineId único (si no, dos
// etiquetas del mismo producto comparten clave y ✕ borra las dos); la promo
// no se puede reconstruir y queda como antes (base = precio guardado).
export function fromHoldItem(it: HoldItem, holdId: string, index: number): HoldItem {
  const isBalanza = it.is_balanza ?? false;
  return {
    product_id: it.product_id,
    lineId: it.lineId ?? (isBalanza ? `${it.product_id}:${holdId}:${index}` : undefined),
    name: it.name,
    sku: it.sku,
    qty: it.qty,
    unit_price: it.unit_price,
    base_unit_price: it.base_unit_price ?? it.unit_price,
    has_offer: it.has_offer ?? false,
    is_weighted: it.is_weighted ?? false,
    is_balanza: isBalanza,
    qty_buy: it.qty_buy,
    qty_pay: it.qty_pay,
    promo_pct: it.promo_pct,
  };
}

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
