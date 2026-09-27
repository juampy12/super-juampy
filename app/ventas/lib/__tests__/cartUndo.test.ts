import { describe, expect, it } from "vitest";
import { collectRemovedLines, restoreRemovedLines } from "../cartUndo";

type Line = { product_id: string; lineId?: string; qty: number; unit_price: number; qty_buy?: number };
const keyOf = (it: Line) => it.lineId ?? it.product_id;

const cart: Line[] = [
  { product_id: "pan", qty: 2, unit_price: 500 },
  { product_id: "coca", qty: 3, unit_price: 66.67, qty_buy: 3 },
  { product_id: "queso", lineId: "queso:111", qty: 1, unit_price: 1500 },
];

function removeAndRestore(key: string, between?: (items: Line[]) => Line[]) {
  const removed = collectRemovedLines(cart, key, keyOf);
  let after = cart.filter((it) => keyOf(it) !== key);
  if (between) after = between(after);
  return { removed, restored: restoreRemovedLines(after, removed, keyOf) };
}

describe("deshacer al quitar ítem del carrito", () => {
  it("restaura el objeto exacto en su posición original", () => {
    const { removed, restored } = removeAndRestore("coca");
    expect(removed).toHaveLength(1);
    expect(restored).toEqual(cart);
    expect(restored![1]).toBe(cart[1]); // mismo objeto, sin recalcular
  });

  it("restaura la primera y la última línea en su lugar", () => {
    expect(removeAndRestore("pan").restored).toEqual(cart);
    expect(removeAndRestore("queso:111").restored).toEqual(cart);
  });

  it("con líneas agregadas después, vuelve a su posición y las nuevas quedan", () => {
    const extra: Line = { product_id: "yerba", qty: 1, unit_price: 3000 };
    const { restored } = removeAndRestore("pan", (items) => [...items, extra]);
    expect(restored!.map(keyOf)).toEqual(["pan", "coca", "queso:111", "yerba"]);
  });

  it("no restaura si el cajero ya volvió a escanear el producto", () => {
    const rescanned: Line = { product_id: "coca", qty: 1, unit_price: 100, qty_buy: 3 };
    const { restored } = removeAndRestore("coca", (items) => [...items, rescanned]);
    expect(restored).toBeNull();
  });

  it("si se quitaron varias líneas con la misma clave, las guarda y restaura todas", () => {
    const dup: Line[] = [
      { product_id: "queso", qty: 1, unit_price: 1500 },
      { product_id: "pan", qty: 1, unit_price: 500 },
      { product_id: "queso", qty: 1, unit_price: 2300 },
    ];
    const removed = collectRemovedLines(dup, "queso", keyOf);
    expect(removed.map((r) => r.index)).toEqual([0, 2]);
    const restored = restoreRemovedLines(dup.filter((it) => keyOf(it) !== "queso"), removed, keyOf);
    expect(restored).toEqual(dup);
  });

  it("nada para restaurar devuelve null", () => {
    expect(restoreRemovedLines(cart, [], keyOf)).toBeNull();
  });
});
