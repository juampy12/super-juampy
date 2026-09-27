// "Deshacer" al quitar ítems del carrito de /ventas: lógica pura, sin estado.
// Guarda las líneas quitadas tal cual (objeto completo + posición) y las
// vuelve a meter en su lugar, sin recalcular precios ni promos: cada línea ya
// trae su qty, unit_price, base y datos de oferta.

export type RemovedLine<T> = { item: T; index: number };

// Todas las líneas con esa clave (normalmente una; más de una solo si
// quedaron líneas con clave repetida). Se llama ANTES de quitarlas.
export function collectRemovedLines<T>(
  items: T[],
  key: string,
  keyOf: (it: T) => string
): RemovedLine<T>[] {
  const removed: RemovedLine<T>[] = [];
  items.forEach((item, index) => {
    if (keyOf(item) === key) removed.push({ item, index });
  });
  return removed;
}

// Devuelve el carrito con las líneas restauradas en su posición original, o
// null si no se puede: si alguna clave ya está en el carrito (el cajero volvió
// a escanear el producto), mezclarlas cambiaría cantidad y promo.
export function restoreRemovedLines<T>(
  items: T[],
  removed: RemovedLine<T>[],
  keyOf: (it: T) => string
): T[] | null {
  if (removed.length === 0) return null;
  const present = new Set(items.map(keyOf));
  if (removed.some((r) => present.has(keyOf(r.item)))) return null;

  const next = [...items];
  for (const r of [...removed].sort((a, b) => a.index - b.index)) {
    next.splice(Math.min(r.index, next.length), 0, r.item);
  }
  return next;
}
