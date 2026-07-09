export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionFromRequest, isSupervisor, unauthorized, forbidden } from "@/lib/session";
import { STORES } from "@/lib/stores";

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Misma lógica que /api/reports/summary: la vista puede exponer la fecha
// con distintos nombres de columna según el entorno.
function getRowDay(row: any): string {
  const raw = row.day ?? row.date ?? null;
  if (!raw) return "";
  const str = typeof raw === "string" ? raw : new Date(raw).toISOString();
  return str.slice(0, 10);
}

function getRevenue(row: any): number {
  const v = row.revenue ?? row.total_amount ?? row.total ?? 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthorized();
  if (!isSupervisor(session)) return forbidden("Solo supervisores pueden ver el inicio");

  try {
    const now = new Date();
    const today = ymd(now);
    const yesterday = ymd(new Date(now.getTime() - 86400000));
    const threeDaysAgo = ymd(new Date(now.getTime() - 2 * 86400000));

    const [salesRes, diffRes, minRes] = await Promise.all([
      supabaseAdmin.from("v_sales_daily").select("*").gte("date", yesterday).lte("date", today),
      supabaseAdmin.rpc("register_cash_diff", {
        p_date_from: threeDaysAgo,
        p_date_to: today,
        p_store_id: null,
      }),
      supabaseAdmin.from("product_min_stock").select("product_id, store_id, min_stock"),
    ]);

    if (salesRes.error) {
      console.error("home-summary v_sales_daily error:", salesRes.error);
      throw salesRes.error;
    }

    const rows = (salesRes.data ?? []).map((r: any) => ({ ...r, day: getRowDay(r) }));
    const todayRows = rows.filter((r: any) => r.day === today);
    const yesterdayRows = rows.filter((r: any) => r.day === yesterday);

    const todayTotal = todayRows.reduce((acc: number, r: any) => acc + getRevenue(r), 0);
    const todayTickets = todayRows.reduce((acc: number, r: any) => acc + Number(r.tickets ?? 0), 0);
    const yesterdayTotal = yesterdayRows.reduce((acc: number, r: any) => acc + getRevenue(r), 0);

    const byStore = STORES.map((s) => {
      const row = todayRows.find((r: any) => r.store_id === s.id);
      return { store_id: s.id, name: s.short, total: row ? getRevenue(row) : 0 };
    });

    const vsYesterdayPct =
      yesterdayTotal > 0 ? Math.round(((todayTotal - yesterdayTotal) / yesterdayTotal) * 1000) / 10 : null;

    // Alerta de diferencia de caja: algún cierre de los últimos 3 días con riesgo "alto".
    let cashDiffAlert = false;
    if (!diffRes.error && Array.isArray(diffRes.data)) {
      cashDiffAlert = diffRes.data.some((r: any) => r.risk_level === "alto");
    } else if (diffRes.error) {
      console.error("home-summary register_cash_diff error:", diffRes.error);
    }

    // Alerta de stock crítico: producto con mínimo configurado y stock en 0.
    let lowStockAlert = false;
    if (!minRes.error && minRes.data && minRes.data.length > 0) {
      const productIds = [...new Set(minRes.data.map((m: any) => m.product_id))];
      const storeIds = [...new Set(minRes.data.map((m: any) => m.store_id))];
      const { data: stockRows, error: stockErr } = await supabaseAdmin
        .from("product_stocks")
        .select("product_id, store_id, stock")
        .in("product_id", productIds)
        .in("store_id", storeIds);

      if (stockErr) {
        console.error("home-summary product_stocks error:", stockErr);
      } else {
        const stockMap = new Map<string, number>(
          (stockRows ?? []).map((s: any) => [`${s.store_id}:${s.product_id}`, Number(s.stock ?? 0)])
        );
        lowStockAlert = minRes.data.some((m: any) => {
          const stock = stockMap.get(`${m.store_id}:${m.product_id}`) ?? 0;
          return stock <= 0 && Number(m.min_stock ?? 0) > 0;
        });
      }
    } else if (minRes.error) {
      console.error("home-summary product_min_stock error:", minRes.error);
    }

    return NextResponse.json({
      today: { total: todayTotal, tickets: todayTickets, byStore },
      yesterday: { total: yesterdayTotal },
      vsYesterdayPct,
      alerts: { cashDiff: cashDiffAlert, lowStock: lowStockAlert },
    });
  } catch (err) {
    console.error("Error en /api/home-summary:", err);
    return NextResponse.json({ error: "Error generando el resumen" }, { status: 500 });
  }
}
