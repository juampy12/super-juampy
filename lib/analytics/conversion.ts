import { HOUR_MS } from "./time";
import type { HourlyPoint, SalesHourPoint } from "./types";

export interface ConversionKpi {
  /** Tasa de conversión de hoy (visitas → ventas), 0..1. `null` sin visitas todavía. */
  rate: number | null;
  /** Ingreso promedio por visita ($ARS). `null` sin visitas todavía. */
  revenuePerVisit: number | null;
}

/**
 * Conversión hoy = ventas confirmadas / visitas. Sin visitas registradas
 * (cámara recién arrancando, motor caído) no hay conversión que calcular —
 * `null`, nunca 0 ni Infinity/NaN, para que el panel muestre "—" en vez de un
 * 0% engañoso.
 */
export function computeConversion(totalSales: number, totalRevenue: number, totalVisits: number): ConversionKpi {
  if (totalVisits <= 0) return { rate: null, revenuePerVisit: null };
  return { rate: totalSales / totalVisits, revenuePerVisit: totalRevenue / totalVisits };
}

export interface HourlyConversionPoint {
  hour: string;
  /** Conversión de esa hora, 0..1. `null` si esa hora no tuvo visitas. */
  rate: number | null;
}

/**
 * Conversión por hora: cruza las horas con ventas y las horas con visitas
 * (una puede tener datos que la otra no) y calcula ventas/visitas en cada
 * una. Una hora sin visitas queda en `null` — no es que la conversión haya
 * sido 0%, es que no hay con qué dividir.
 */
export function toHourlyConversion(
  salesPerHour: SalesHourPoint[],
  visitsPerHour: HourlyPoint[]
): HourlyConversionPoint[] {
  const salesByHour = new Map(salesPerHour.map((s) => [s.hour, s.sales]));
  const visitsByHour = new Map(visitsPerHour.map((v) => [v.hour, v.entries]));

  const keys = [...new Set([...salesByHour.keys(), ...visitsByHour.keys()])].sort();
  if (keys.length === 0) return [];

  const firstMs = new Date(keys[0]).getTime();
  const lastMs = new Date(keys[keys.length - 1]).getTime();

  const out: HourlyConversionPoint[] = [];
  for (let t = firstMs; t <= lastMs; t += HOUR_MS) {
    const hour = new Date(t).toISOString();
    const visits = visitsByHour.get(hour) ?? 0;
    const sales = salesByHour.get(hour) ?? 0;
    out.push({ hour, rate: visits > 0 ? sales / visits : null });
  }
  return out;
}
