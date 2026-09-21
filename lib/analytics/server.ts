// Helpers compartidos por las rutas /api/analytics/* (solo servidor).

export const NO_STORE = { "Cache-Control": "no-store" } as const;

/** `?store=<id>`: el store_id de analytics_* es texto libre; solo se valida forma y largo. */
export function parseStoreParam(req: Request): string | null {
  const raw = new URL(req.url).searchParams.get("store")?.trim();
  if (!raw || raw.length > 100) return null;
  return raw;
}

/** Fecha de hoy (YYYY-MM-DD) en hora de Argentina. */
export function todayArgentina(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(now);
}

/**
 * Inicio del día en hora de Argentina (UTC-3 fijo, sin horario de verano),
 * como ISO con offset. El servidor corre en UTC: usar su "hoy" local cortaría
 * el día a las 21:00 de Charata.
 */
export function startOfDayArgentina(day: string): string {
  return `${day}T00:00:00-03:00`;
}

/** `?after_id=<n>` (opcional): entero >= 0. `undefined` si no viene, `null` si es inválido. */
export function parseAfterIdParam(req: Request): number | null | undefined {
  const raw = new URL(req.url).searchParams.get("after_id");
  if (raw === null) return undefined;
  if (!/^\d{1,15}$/.test(raw)) return null;
  return Number(raw);
}
