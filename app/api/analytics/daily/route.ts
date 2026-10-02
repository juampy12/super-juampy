export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  NO_STORE,
  endOfDayArgentina,
  parseDaysParam,
  parseStoreParam,
  requireSupervisor,
  startOfDayArgentina,
  todayArgentina,
} from "@/lib/analytics/server";
import { DAY_MS, lastDays, shiftDay } from "@/lib/analytics/time";
import { WEEKDAY_LOOKBACK_WEEKS, buildDailySeries } from "@/lib/analytics/trend";
import type { DailyResponse } from "@/lib/analytics/types";

/**
 * Visitas de un tramo = max(entries) en [since, until): `entries` es un
 * acumulado que se reinicia cada medianoche de Argentina, así que el máximo
 * del tramo es el total de personas que entraron hasta ese momento del día.
 * Se pide solo la fila más alta (un día son ~2900 filas: no se traen todas).
 * `null` si el motor no escribió nada en ese tramo.
 */
async function maxEntries(store: string, since: string, until: string): Promise<number | null> {
  const { data, error } = await supabaseAdmin
    .from("analytics_counts")
    .select("entries")
    .eq("store_id", store)
    .gte("ts", since)
    .lt("ts", until)
    .order("entries", { ascending: false })
    .limit(1);
  if (error) throw error;
  const top = (data ?? [])[0] as { entries: number } | undefined;
  return top ? Math.max(0, Number(top.entries) || 0) : null;
}

// GET /api/analytics/daily?store=<id>[&days=<n>]
// → { today, days, weekdaySamples }: por cada uno de los últimos `days` días
// (default 14, hora de Argentina, hoy incluido): visitas (max entries de
// analytics_counts), tickets y facturación (ventas CONFIRMADAS de public.sales,
// mismo criterio que /api/analytics/sales). `weekdaySamples` son las visitas
// hasta esta misma hora en el mismo día de la semana de las 4 semanas
// anteriores, para comparar "hoy vs. tu promedio". Solo lectura.
export async function GET(req: NextRequest) {
  const session = await requireSupervisor(req);
  if (session instanceof Response) return session;

  const store = parseStoreParam(req);
  if (!store) return NextResponse.json({ error: "Falta store o no es válido" }, { status: 400 });

  const dayCount = parseDaysParam(req);
  if (dayCount === null) return NextResponse.json({ error: "days inválido" }, { status: 400 });

  try {
    const now = new Date();
    const today = todayArgentina(now);
    const days = lastDays(today, dayCount);

    const visitsPromise = Promise.all(
      days.map((day) => maxEntries(store, startOfDayArgentina(day), endOfDayArgentina(day)))
    );

    // Mismo día de la semana, k semanas atrás, cortado a esta misma hora
    // (Argentina no tiene horario de verano: k*7 días exactos en epoch ms).
    const weekdayPromise = Promise.all(
      Array.from({ length: WEEKDAY_LOOKBACK_WEEKS }, (_, i) => {
        const weeks = i + 1;
        const since = startOfDayArgentina(shiftDay(today, -7 * weeks));
        const until = new Date(now.getTime() - weeks * 7 * DAY_MS).toISOString();
        return maxEntries(store, since, until);
      })
    );

    const salesPromise = fetchAllRows<{ created_at: string; total: number }>(
      "sales",
      "created_at, total",
      (qb) =>
        qb
          .eq("store_id", store)
          .eq("status", "confirmed")
          .gte("created_at", startOfDayArgentina(days[0]))
          .lt("created_at", endOfDayArgentina(today))
          .order("created_at", { ascending: true })
    );

    const [visits, weekday, sales] = await Promise.all([visitsPromise, weekdayPromise, salesPromise]);

    const visitsByDay = new Map(days.map((day, i) => [day, visits[i]]));
    const body: DailyResponse = {
      today,
      days: buildDailySeries(days, visitsByDay, sales),
      weekdaySamples: weekday.filter((v): v is number => v !== null),
    };
    return NextResponse.json(body, { headers: NO_STORE });
  } catch (e) {
    console.error("analytics/daily error:", e);
    return NextResponse.json({ error: "Error consultando la tendencia" }, { status: 500 });
  }
}
