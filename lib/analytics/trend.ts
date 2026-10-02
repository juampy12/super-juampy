import { dayAR } from "./time";
import type { DailyPoint } from "./types";

// Tendencia diaria y comparación "hoy vs. tu promedio" (funciones puras,
// isomórficas: las usa la ruta /api/analytics/daily y el panel).

/** Semanas hacia atrás que se miran para el promedio del mismo día de la semana. */
export const WEEKDAY_LOOKBACK_WEEKS = 4;
/** Mínimo de semanas con datos para comparar; con menos, el promedio engaña. */
export const MIN_WEEKDAY_SAMPLES = 3;
/** "Tráfico bajo": hoy va 30% o más por debajo del promedio. */
export const LOW_TRAFFIC_DIFF = -0.3;
/**
 * Promedio mínimo (visitas a esta hora) para avisar tráfico bajo: con números
 * chicos (primera hora del día) un -30% son 2 o 3 personas, no una señal.
 */
export const LOW_TRAFFIC_MIN_AVERAGE = 20;
/** "Motor sin señal": el último latido tiene más de 10 minutos. */
export const ENGINE_SILENT_SECONDS = 10 * 60;

/**
 * Arma la serie diaria: una fila por cada día de `days` (aunque no tenga
 * datos), con las visitas de `visitsByDay` y las ventas agrupadas por día
 * calendario de Argentina. Una venta fuera de `days` se ignora.
 */
export function buildDailySeries(
  days: string[],
  visitsByDay: Map<string, number | null>,
  sales: { created_at: string; total: number }[]
): DailyPoint[] {
  const byDay = new Map<string, DailyPoint>(
    days.map((day) => [day, { day, visits: visitsByDay.get(day) ?? null, tickets: 0, revenue: 0 }])
  );
  for (const s of sales) {
    const point = byDay.get(dayAR(s.created_at));
    if (!point) continue;
    point.tickets += 1;
    point.revenue += Number(s.total) || 0;
  }
  return days.map((day) => byDay.get(day)!);
}

/**
 * Conversión de un día = tickets confirmados / visitas, 0..1. `null` si ese
 * día no tuvo visitas registradas (no hay con qué dividir): el panel muestra
 * "—", nunca 0% ni Infinity.
 */
export function dailyConversion(point: Pick<DailyPoint, "visits" | "tickets">): number | null {
  if (point.visits === null || point.visits <= 0) return null;
  return point.tickets / point.visits;
}

export type WeekdayComparison =
  /** Hoy todavía no tiene conteos (motor caído o recién arrancando). */
  | { status: "no-data-today"; samples: number }
  /** Menos de MIN_WEEKDAY_SAMPLES semanas con datos para este día de la semana. */
  | { status: "insufficient"; samples: number }
  | {
      status: "ok";
      samples: number;
      todayVisits: number;
      /** Promedio de visitas a esta misma hora en las semanas anteriores. */
      average: number;
      /** (hoy − promedio) / promedio. `null` si el promedio es 0 (no hay con qué dividir). */
      diff: number | null;
    };

/**
 * Compara las visitas de hoy hasta ahora con el promedio del mismo día de la
 * semana (a esta misma hora) en las semanas anteriores. Sin historia
 * suficiente no devuelve ningún número: mejor "juntá más datos" que un
 * porcentaje calculado contra una sola semana.
 */
export function compareToWeekdayAverage(todayVisits: number | null, weekdaySamples: number[]): WeekdayComparison {
  const samples = weekdaySamples.length;
  if (samples < MIN_WEEKDAY_SAMPLES) return { status: "insufficient", samples };
  if (todayVisits === null) return { status: "no-data-today", samples };

  const average = weekdaySamples.reduce((a, v) => a + v, 0) / samples;
  return {
    status: "ok",
    samples,
    todayVisits,
    average,
    diff: average > 0 ? (todayVisits - average) / average : null,
  };
}

/** Tráfico bajo hoy: solo con historia suficiente y un promedio que no sea ruido. */
export function isLowTraffic(c: WeekdayComparison): boolean {
  return c.status === "ok" && c.diff !== null && c.average >= LOW_TRAFFIC_MIN_AVERAGE && c.diff <= LOW_TRAFFIC_DIFF;
}

/** Motor sin señal: hubo latidos alguna vez y el último es más viejo que 10 minutos. */
export function isEngineSilent(lastHeartbeatAgeSeconds: number | null): boolean {
  return lastHeartbeatAgeSeconds !== null && lastHeartbeatAgeSeconds > ENGINE_SILENT_SECONDS;
}

/** Diferencia porcentual con signo para mostrar (ej. "+12%", "−35%", "0%"). */
export function formatDiff(diff: number): string {
  const pct = Math.round(diff * 100);
  if (pct === 0) return "0%";
  return `${pct > 0 ? "+" : "−"}${Math.abs(pct)}%`;
}
