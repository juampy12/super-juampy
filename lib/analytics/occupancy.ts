import type { CountRow } from "./types";

/** Personas dentro en un instante del día (para el gráfico de ocupación). */
export interface OccupancyPoint {
  ts: string; // ISO de la última fila de ese minuto
  occupancy: number; // ya acotado a >= 0
}

const MINUTE_MS = 60_000;

// El motor puede dejar occupancy por debajo de 0 (una salida contada sin su
// entrada, un reinicio a mitad del día): "personas dentro" nunca es negativo.
function clamp(occupancy: number): number {
  return Math.max(0, occupancy);
}

function byTsThenId(a: CountRow, b: CountRow): number {
  const byTs = new Date(a.ts).getTime() - new Date(b.ts).getTime();
  return byTs !== 0 ? byTs : a.id - b.id;
}

/**
 * Ocupación actual: `occupancy` de la fila más reciente (por ts, desempate por
 * id), acotada a >= 0. `null` si todavía no hay filas hoy. No se confía en el
 * orden del arreglo: los polls incrementales agregan por id, no por ts.
 */
export function currentOccupancy(rows: CountRow[]): number | null {
  let latest: CountRow | null = null;
  for (const r of rows) if (latest === null || byTsThenId(r, latest) > 0) latest = r;
  return latest === null ? null : clamp(latest.occupancy);
}

/**
 * Serie de ocupación del día. A diferencia de `toHourly`, `occupancy` es un
 * valor directo (personas dentro en ese momento), no un acumulado: no se
 * calculan deltas, se toma tal cual. Para no mandar miles de puntos al gráfico
 * se queda con la última fila de cada minuto (el valor vigente al cerrar ese
 * minuto), ordenado por ts.
 */
export function toOccupancySeries(rows: CountRow[]): OccupancyPoint[] {
  const sorted = [...rows].sort(byTsThenId);
  const out: OccupancyPoint[] = [];
  let lastMinute: number | null = null;

  for (const r of sorted) {
    const ms = new Date(r.ts).getTime();
    const minute = ms - (ms % MINUTE_MS);
    const point = { ts: r.ts, occupancy: clamp(r.occupancy) };
    if (minute === lastMinute) out[out.length - 1] = point;
    else out.push(point);
    lastMinute = minute;
  }
  return out;
}
