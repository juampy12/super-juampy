import { getAnalytics } from "./api";
import { HOUR_MS, hourStartIso } from "./time";
import type { CountRow, HeatmapRow, HealthResponse, HourlyPoint, SalesResponse, ZoneSeconds } from "./types";

// Las lecturas van por /api/analytics/* (servidor, solo supervisores): el POS no
// usa Supabase Auth, así que el navegador no puede leer analytics_* directo (RLS).

export interface CountsResponse {
  rows: CountRow[];
  /** Día (YYYY-MM-DD, hora de Argentina) al que corresponden las filas. */
  day: string;
  /**
   * Antigüedad (en segundos, calculada por el servidor) de la fila más nueva
   * de esta respuesta. `null` si esta respuesta no trajo filas nuevas (poll
   * incremental sin novedades) — el llamador conserva la antigüedad anterior.
   */
  latestAgeSeconds: number | null;
}

/**
 * Conteos del día para un local. Sin `afterId` trae todo el día (ascendente por
 * ts); con `afterId` trae solo las filas posteriores a ese id (polling incremental).
 */
export async function fetchTodayCounts(
  storeId: string,
  opts: { afterId?: number; signal?: AbortSignal } = {}
): Promise<CountsResponse> {
  return getAnalytics<CountsResponse>(
    "counts",
    storeId,
    opts.signal,
    opts.afterId === undefined ? undefined : { after_id: opts.afterId }
  );
}

export interface HeatmapResponse {
  heatmap: HeatmapRow | null;
  /** Antigüedad en segundos de `heatmap`, calculada por el servidor. `null` si no hay heatmap. */
  ageSeconds: number | null;
}

/** Última grilla de calor disponible para un local. */
export async function fetchLatestHeatmap(storeId: string, signal?: AbortSignal): Promise<HeatmapResponse> {
  return getAnalytics<HeatmapResponse>("heatmap", storeId, signal);
}

/** Último latido de salud del motor para un local, por cámara. */
export async function fetchHealthSummary(storeId: string, signal?: AbortSignal): Promise<HealthResponse> {
  return getAnalytics<HealthResponse>("health", storeId, signal);
}

/** Permanencia del día por zona, de mayor a menor. */
export async function fetchZones(storeId: string, signal?: AbortSignal): Promise<ZoneSeconds[]> {
  const { zones } = await getAnalytics<{ zones: ZoneSeconds[] }>("zones", storeId, signal);
  return zones;
}

/** Ventas confirmadas de hoy (hora de Argentina) para un local, con su desglose por hora. */
export async function fetchSales(storeId: string, signal?: AbortSignal): Promise<SalesResponse> {
  return getAnalytics<SalesResponse>("sales", storeId, signal);
}

/**
 * Ingresos por hora a partir de los conteos acumulados del día.
 *
 * Contrato del motor: `entries` es un acumulado que ahora persiste entre
 * reinicios del motor, así que ya no hay que asumir que arranca en 0 en cada
 * fila — pero un reinicio real (o un cambio de hardware) puede seguir haciendo
 * que el contador vuelva para atrás, y hay que tratarlo defensivamente.
 *
 * Se suman deltas entre filas CONSECUTIVAS (ordenadas por ts), no por máximo/
 * mínimo dentro de cada hora: `cur.entries - prev.entries`, salvo que
 * `cur.entries < prev.entries` (reinicio del motor), en cuyo caso el delta es
 * `cur.entries` (se cuenta desde cero otra vez). La primera fila del día no es
 * un caso especial: se resuelve con un `prev` virtual de 0 entries (el día
 * arranca en 0 en el motor).
 */
export function toHourly(rows: CountRow[]): HourlyPoint[] {
  if (rows.length === 0) return [];

  const sorted = [...rows].sort((a, b) => {
    const byTs = new Date(a.ts).getTime() - new Date(b.ts).getTime();
    return byTs !== 0 ? byTs : a.id - b.id;
  });

  const byHour = new Map<string, number>(); // hourStartIso -> entries del período
  let prevEntries = 0;

  for (const r of sorted) {
    const delta = r.entries >= prevEntries ? r.entries - prevEntries : r.entries;
    prevEntries = r.entries;

    const key = hourStartIso(r.ts);
    byHour.set(key, (byHour.get(key) ?? 0) + delta);
  }

  // Rellena los huecos entre la primera y la última hora con datos: una hora
  // sin filas (cámara caída, poco tránsito) es 0 ingresos, no un salto en el
  // eje del gráfico.
  const keys = [...byHour.keys()].sort();
  const firstMs = new Date(keys[0]).getTime();
  const lastMs = new Date(keys[keys.length - 1]).getTime();
  const out: HourlyPoint[] = [];
  for (let t = firstMs; t <= lastMs; t += HOUR_MS) {
    const hour = new Date(t).toISOString();
    out.push({ hour, entries: byHour.get(hour) ?? 0 });
  }
  return out;
}
