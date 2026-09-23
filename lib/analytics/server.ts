// Helpers compartidos por las rutas /api/analytics/* (solo servidor).

import { getSessionFromRequest, isSupervisor, unauthorized, forbidden, SessionPayload } from "@/lib/session";
import { STORES } from "@/lib/stores";

export const NO_STORE = { "Cache-Control": "no-store" } as const;

const VALID_STORE_IDS = new Set<string>(STORES.map((s) => s.id));

/** `?store=<id>`: tiene que ser una sucursal activa de lib/stores.ts. */
export function parseStoreParam(req: Request): string | null {
  const raw = new URL(req.url).searchParams.get("store")?.trim();
  if (!raw || !VALID_STORE_IDS.has(raw)) return null;
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

/** Antigüedad en segundos de un ts ISO, calculada con el reloj del servidor. */
export function ageSeconds(ts: string, now = Date.now()): number {
  return Math.max(0, Math.round((now - new Date(ts).getTime()) / 1000));
}

/**
 * Auth+rol común a las 4 rutas /api/analytics/*: exige sesión y rol
 * supervisor. Devuelve la sesión, o la Response de error para que el caller
 * corte ahí (`if (session instanceof Response) return session;`).
 */
export async function requireSupervisor(req: Request): Promise<SessionPayload | Response> {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthorized();
  if (!isSupervisor(session)) return forbidden("Solo supervisores pueden ver la analítica");
  return session;
}
