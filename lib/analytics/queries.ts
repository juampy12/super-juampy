import { getAnalytics } from "./api";
import type { CountRow, HeatmapRow, HealthRow, HourlyPoint, ZoneSeconds } from "./types";

// Las lecturas van por /api/analytics/* (servidor, solo supervisores): el POS no
// usa Supabase Auth, así que el navegador no puede leer analytics_* directo (RLS).

export interface CountsResponse {
  rows: CountRow[];
  /** Día (YYYY-MM-DD, hora de Argentina) al que corresponden las filas. */
  day: string;
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

/** Última grilla de calor disponible para un local. */
export async function fetchLatestHeatmap(
  storeId: string,
  signal?: AbortSignal
): Promise<HeatmapRow | null> {
  const { heatmap } = await getAnalytics<{ heatmap: HeatmapRow | null }>("heatmap", storeId, signal);
  return heatmap;
}

/** Último latido de salud del motor para un local. */
export async function fetchLatestHealth(
  storeId: string,
  signal?: AbortSignal
): Promise<HealthRow | null> {
  const { health } = await getAnalytics<{ health: HealthRow | null }>("health", storeId, signal);
  return health;
}

/** Permanencia del día por zona, de mayor a menor. */
export async function fetchZones(storeId: string, signal?: AbortSignal): Promise<ZoneSeconds[]> {
  const { zones } = await getAnalytics<{ zones: ZoneSeconds[] }>("zones", storeId, signal);
  return zones;
}

/**
 * Ingresos por hora a partir de los conteos acumulados.
 * `entries` es acumulado, así que el ingreso de cada hora es el delta entre
 * el máximo de esa hora y el de la anterior (o el mínimo de la propia hora).
 */
export function toHourly(rows: CountRow[]): HourlyPoint[] {
  const byHour = new Map<string, { max: number; min: number; peak: number }>();

  for (const r of rows) {
    const hour = new Date(r.ts);
    hour.setMinutes(0, 0, 0);
    const key = hour.toISOString();
    const cur = byHour.get(key) ?? { max: -Infinity, min: Infinity, peak: 0 };
    cur.max = Math.max(cur.max, r.entries);
    cur.min = Math.min(cur.min, r.entries);
    cur.peak = Math.max(cur.peak, r.occupancy);
    byHour.set(key, cur);
  }

  const keys = [...byHour.keys()].sort();
  let prevMax: number | null = null;
  const out: HourlyPoint[] = [];

  for (const key of keys) {
    const b = byHour.get(key)!;
    // Si hay hora previa, el ingreso es max(hora) - max(hora previa);
    // si no, es max - min dentro de la misma hora.
    const entries =
      prevMax !== null ? Math.max(0, b.max - prevMax) : Math.max(0, b.max - b.min);
    out.push({ hour: key, entries, peakOccupancy: b.peak });
    prevMax = b.max;
  }
  return out;
}
