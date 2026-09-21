import type { CountRow } from "./types";

/** Conteos del día acumulados en memoria por el hook. */
export interface CountsMemo {
  day: string;
  rows: CountRow[];
  /** Mayor id recibido: el próximo poll pide solo filas con id > lastId. */
  lastId: number;
}

/**
 * Aplica la respuesta de /api/analytics/counts a lo acumulado.
 * - Sin memoria previa (o de otro día): la respuesta es el día completo y la reemplaza.
 * - Con memoria del mismo día: agrega solo las filas con id > lastId. Si no hay
 *   nuevas devuelve la MISMA `memo` (misma referencia => no se recalcula nada aguas abajo).
 * El caso "cambió el día" lo resuelve el llamador (vuelve a pedir sin afterId).
 */
export function applyCounts(
  memo: CountsMemo | null,
  res: { rows: CountRow[]; day: string }
): CountsMemo {
  if (!memo || memo.day !== res.day) {
    return { day: res.day, rows: res.rows, lastId: maxId(res.rows, 0) };
  }
  const fresh = res.rows.filter((r) => r.id > memo.lastId);
  if (fresh.length === 0) return memo;
  return { day: memo.day, rows: [...memo.rows, ...fresh], lastId: maxId(fresh, memo.lastId) };
}

function maxId(rows: CountRow[], from: number): number {
  let max = from;
  for (const r of rows) if (r.id > max) max = r.id;
  return max;
}
