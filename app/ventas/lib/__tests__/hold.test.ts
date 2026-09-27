import { describe, expect, it } from "vitest";
import { fromHoldItem, toHoldItem, type HoldItem } from "../hold";

// Misma clave de línea que usa /ventas (lineKey).
const lineKey = (it: HoldItem) => it.lineId ?? it.product_id;

// Guardar → localStorage (JSON) → retomar, como hace el POS.
function roundTrip(items: HoldItem[], holdId = "1700000000000"): HoldItem[] {
  const stored = JSON.parse(JSON.stringify(items.map(toHoldItem))) as HoldItem[];
  return stored.map((it, i) => fromHoldItem(it, holdId, i));
}

describe("guardar/retomar venta en espera", () => {
  it("(a) dos etiquetas de balanza del mismo producto mantienen claves distintas", () => {
    const cart: HoldItem[] = [
      { product_id: "queso", lineId: "queso:111", name: "Queso", sku: null, qty: 1, unit_price: 1500, base_unit_price: 1500, has_offer: false, is_balanza: true },
      { product_id: "queso", lineId: "queso:222", name: "Queso", sku: null, qty: 1, unit_price: 2300, base_unit_price: 2300, has_offer: false, is_balanza: true },
    ];
    const resumed = roundTrip(cart);

    expect(resumed.map(lineKey)).toEqual(["queso:111", "queso:222"]);
    // ✕ en una línea (removeItem filtra por lineKey) deja la otra.
    const afterRemove = resumed.filter((it) => lineKey(it) !== "queso:111");
    expect(afterRemove).toHaveLength(1);
    expect(afterRemove[0].unit_price).toBe(2300);
  });

  it("(a) hold viejo sin lineId: se generan claves únicas para la balanza", () => {
    const oldHold: HoldItem[] = [
      { product_id: "queso", name: "Queso", sku: null, qty: 1, unit_price: 1500, is_balanza: true },
      { product_id: "queso", name: "Queso", sku: null, qty: 1, unit_price: 2300, is_balanza: true },
    ];
    const resumed = oldHold.map((it, i) => fromHoldItem(it, "1700000000000", i));
    const keys = resumed.map(lineKey);
    expect(new Set(keys).size).toBe(2);
  });

  it("(b) un 3x2 conserva precio base y datos de la promo", () => {
    const cart: HoldItem[] = [
      { product_id: "coca", name: "Coca 1.5L", sku: "779", qty: 3, unit_price: 66.67, base_unit_price: 100, has_offer: true, qty_buy: 3, qty_pay: 2 },
    ];
    const [resumed] = roundTrip(cart);

    // Lo que usa updateQty para recalcular la promo al cambiar la cantidad.
    expect(resumed.qty_buy).toBe(3);
    expect(resumed.qty_pay).toBe(2);
    expect(resumed.base_unit_price).toBe(100);
    expect(resumed.has_offer).toBe(true);
    expect(resumed.unit_price).toBe(66.67);
  });

  it("(b) 2da unidad al % conserva promo_pct", () => {
    const cart: HoldItem[] = [
      { product_id: "yerba", name: "Yerba", sku: null, qty: 2, unit_price: 75, base_unit_price: 100, has_offer: true, qty_buy: 2, promo_pct: 50 },
    ];
    const [resumed] = roundTrip(cart);
    expect(resumed).toMatchObject({ qty_buy: 2, promo_pct: 50, base_unit_price: 100 });
  });

  it("línea común y pesable: sin lineId (la clave sigue siendo el producto)", () => {
    const cart: HoldItem[] = [
      { product_id: "pan", name: "Pan", sku: null, qty: 2, unit_price: 500, base_unit_price: 500, has_offer: false },
      { product_id: "fiambre", name: "Fiambre", sku: null, qty: 250, unit_price: 9000, base_unit_price: 9000, has_offer: false, is_weighted: true },
    ];
    const resumed = roundTrip(cart);
    expect(resumed.map(lineKey)).toEqual(["pan", "fiambre"]);
    expect(resumed[1]).toMatchObject({ is_weighted: true, qty: 250 });
  });

  it("hold viejo sin base_unit_price: cae al precio guardado (comportamiento anterior)", () => {
    const [resumed] = [fromHoldItem({ product_id: "coca", name: "Coca", sku: null, qty: 3, unit_price: 66.67 }, "1", 0)];
    expect(resumed.base_unit_price).toBe(66.67);
    expect(resumed.qty_buy).toBeUndefined();
  });
});
