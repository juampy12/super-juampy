export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { NO_STORE, parseStoreParam, requireSupervisor, startOfDayArgentina, todayArgentina } from "@/lib/analytics/server";
import type { ZoneSeconds } from "@/lib/analytics/types";

// GET /api/analytics/zones?store=<id>
// → { zones: [{ zone, seconds }] }: permanencia del día (hora de Argentina) sumada
// por zona a partir de analytics_zone_dwell, ordenada de mayor a menor.
export async function GET(req: NextRequest) {
  const session = await requireSupervisor(req);
  if (session instanceof Response) return session;

  const store = parseStoreParam(req);
  if (!store) return NextResponse.json({ error: "Falta store o no es válido" }, { status: 400 });

  try {
    const since = startOfDayArgentina(todayArgentina());
    // Paginado: PostgREST corta en 1000 filas y un día de permanencias puede superarlas.
    const rows = await fetchAllRows<{ zone: string; dwell_seconds: number }>(
      "analytics_zone_dwell",
      "zone, dwell_seconds",
      (qb) => qb.eq("store_id", store).gte("ts", since).order("id", { ascending: true })
    );

    const byZone = new Map<string, number>();
    for (const r of rows) {
      byZone.set(r.zone, (byZone.get(r.zone) ?? 0) + Number(r.dwell_seconds || 0));
    }
    const zones: ZoneSeconds[] = [...byZone.entries()]
      .map(([zone, seconds]) => ({ zone, seconds }))
      .sort((a, b) => b.seconds - a.seconds);

    return NextResponse.json({ zones }, { headers: NO_STORE });
  } catch (e) {
    console.error("analytics/zones error:", e);
    return NextResponse.json({ error: "Error consultando zonas" }, { status: 500 });
  }
}
