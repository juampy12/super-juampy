// Utilidades de horario en zona Argentina (isomórficas: se usan tanto en las
// rutas /api/analytics/* como en los componentes cliente). Argentina no tiene
// horario de verano, así que el offset es -3 fijo todo el año.

const AR_TZ = "America/Argentina/Buenos_Aires";

/** Hora 0..23 de un timestamp ISO, en hora de Argentina. */
export function hourNumberAR(iso: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: AR_TZ,
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  return Number(parts.find((p) => p.type === "hour")?.value ?? "0");
}

/** Etiqueta corta de hora para gráficos (ej. "14h"), en hora de Argentina. */
export function hourLabelAR(iso: string): string {
  return `${hourNumberAR(iso)}h`;
}

export const HOUR_MS = 3_600_000;

/**
 * Trunca un ts ISO al inicio de su hora (ISO, UTC). Aritmética en epoch ms:
 * no depende de la zona horaria del proceso que corre este código (server o
 * test), y es la clave de bucketing común entre `toHourly` (visitas) y
 * `analytics_sales`/conversión, para que después puedan cruzarse por hora.
 */
export function hourStartIso(ts: string): string {
  const ms = new Date(ts).getTime();
  return new Date(ms - (ms % HOUR_MS)).toISOString();
}

/** Hora y minutos (ej. "14:05") de un timestamp, en hora de Argentina. */
export function timeLabelAR(iso: string | number): string {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: AR_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}

export const DAY_MS = 24 * HOUR_MS;

/** Día calendario (YYYY-MM-DD) de un timestamp, en hora de Argentina. */
export function dayAR(iso: string | number | Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: AR_TZ }).format(new Date(iso));
}

/**
 * Suma `delta` días calendario a un día YYYY-MM-DD. Aritmética sobre la fecha
 * en UTC (no sobre un instante): no depende de la zona horaria del proceso.
 */
export function shiftDay(day: string, delta: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

/** Los últimos `n` días calendario terminando en `today` (inclusive), del más viejo al más nuevo. */
export function lastDays(today: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => shiftDay(today, i - (n - 1)));
}

/** Etiqueta corta de un día YYYY-MM-DD para gráficos (ej. "01/10"). */
export function dayLabelAR(day: string): string {
  const [, m, d] = day.split("-");
  return `${d}/${m}`;
}

/** Nombre del día de la semana (ej. "jueves") de un día YYYY-MM-DD. */
export function weekdayNameAR(day: string): string {
  return new Intl.DateTimeFormat("es-AR", { timeZone: AR_TZ, weekday: "long" }).format(
    new Date(`${day}T12:00:00-03:00`)
  );
}
