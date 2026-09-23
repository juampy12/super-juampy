export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { fetchAllRows } from "@/lib/fetchAllRows";
import {
  NO_STORE,
  endOfDayArgentina,
  parseStoreParam,
  requireSupervisor,
  startOfDayArgentina,
  todayArgentina,
} from "@/lib/analytics/server";
import { hourStartIso } from "@/lib/analytics/time";
import type { SalesHourPoint, SalesResponse } from "@/lib/analytics/types";

// GET /api/analytics/sales?store=<id>
// → { totalSales, totalRevenue, perHour }: ventas CONFIRMADAS de hoy (hora de
// Argentina) para cruzar con las visitas y calcular conversión. Solo lectura
// de `public.sales` (tabla real del POS): nunca se escribe ni se toca lógica
// de ventas desde acá.
//
// "Confirmada" = status "confirmed" (el único status que representa una
// venta real y vigente en el POS — ver app/api/sales/void/route.ts y
// app/api/sales/route.ts). Se excluye "anulada" explícitamente.
export async function GET(req: NextRequest) {
  const session = await requireSupervisor(req);
  if (session instanceof Response) return session;

  const store = parseStoreParam(req);
  if (!store) return NextResponse.json({ error: "Falta store o no es válido" }, { status: 400 });

  try {
    const day = todayArgentina();
    const since = startOfDayArgentina(day);
    const until = endOfDayArgentina(day);

    const rows = await fetchAllRows<{ created_at: string; total: number }>(
      "sales",
      "created_at, total",
      (qb) =>
        qb
          .eq("store_id", store)
          .eq("status", "confirmed")
          .gte("created_at", since)
          .lt("created_at", until)
          .order("created_at", { ascending: true })
    );

    const byHour = new Map<string, { sales: number; revenue: number }>();
    let totalRevenue = 0;
    for (const r of rows) {
      const revenue = Number(r.total) || 0;
      totalRevenue += revenue;
      const key = hourStartIso(r.created_at);
      const b = byHour.get(key) ?? { sales: 0, revenue: 0 };
      b.sales += 1;
      b.revenue += revenue;
      byHour.set(key, b);
    }

    const perHour: SalesHourPoint[] = [...byHour.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([hour, v]) => ({ hour, sales: v.sales, revenue: v.revenue }));

    const body: SalesResponse = { totalSales: rows.length, totalRevenue, perHour };
    return NextResponse.json(body, { headers: NO_STORE });
  } catch (e) {
    console.error("analytics/sales error:", e);
    return NextResponse.json({ error: "Error consultando ventas" }, { status: 500 });
  }
}
