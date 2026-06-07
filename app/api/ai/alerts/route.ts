import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const tz = "America/Argentina/Cordoba";

function dateAR(d: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d);
}

export async function GET() {
  try {
    const now = new Date();
    const todayAR = dateAR(now);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const weekAgoAR = dateAR(weekAgo);
    const eightWeeksAgo = new Date(now.getTime() - 56 * 24 * 60 * 60 * 1000);
    const todayDayName = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: tz }).format(now);

    // ── Round 1: todas las queries en paralelo ────────────────────────────
    const [lowStockRes, recentSoldRes, todaySalesRes, pastSalesRes] = await Promise.all([
      supabaseAdmin
        .from("product_stocks")
        .select("product_id, store_id, stock")
        .lt("stock", 5)
        .gte("stock", 0),

      // fn_top_products_range_all retorna product_id, name, sku, qty_sold, total_amount, stock
      supabaseAdmin.rpc("fn_top_products_range_all", {
        p_from: weekAgoAR,
        p_to: todayAR,
        p_limit: 1000,
      }),

      supabaseAdmin
        .from("sales")
        .select("total")
        .eq("status", "confirmed")
        .gte("created_at", `${todayAR}T00:00:00-03:00`)
        .lte("created_at", `${todayAR}T23:59:59-03:00`),

      supabaseAdmin
        .from("sales")
        .select("total, created_at")
        .eq("status", "confirmed")
        .gte("created_at", eightWeeksAgo.toISOString())
        .lt("created_at", `${todayAR}T00:00:00-03:00`),
    ]);

    // ── Productos con stock bajo y ventas recientes ───────────────────────
    const rpcItems: any[] = recentSoldRes.data ?? [];
    const rpcHasIds = rpcItems.length > 0 && rpcItems[0]?.product_id != null;
    const recentlySoldIds = new Set<string>(
      rpcHasIds ? rpcItems.map((p) => p.product_id as string) : []
    );

    // Si el RPC no retorna product_id, se muestran todos los ítems con stock bajo
    const lowStockItems: any[] = rpcHasIds
      ? (lowStockRes.data ?? []).filter((r: any) => recentlySoldIds.has(r.product_id))
      : (lowStockRes.data ?? []);

    // ── Round 2: nombres de productos y sucursales ────────────────────────
    const productIds = [...new Set(lowStockItems.map((r: any) => r.product_id as string))];
    const storeIds = [...new Set(lowStockItems.map((r: any) => r.store_id as string))];

    const [productsRes, storesRes] = await Promise.all([
      productIds.length > 0
        ? supabaseAdmin.from("products").select("id, name").in("id", productIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      storeIds.length > 0
        ? supabaseAdmin.from("stores").select("id, name").in("id", storeIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    ]);

    const productNames: Record<string, string> = {};
    (productsRes.data ?? []).forEach((p: any) => { productNames[p.id] = p.name; });
    const storeNameMap: Record<string, string> = {};
    (storesRes.data ?? []).forEach((s: any) => { storeNameMap[s.id] = s.name; });

    // Agrupar por sucursal, ordenado por stock ascendente
    const byStore: Record<string, { storeName: string; items: { name: string; stock: number }[] }> = {};
    for (const row of lowStockItems) {
      const storeName = storeNameMap[row.store_id] ?? row.store_id;
      const productName = productNames[row.product_id] ?? row.product_id;
      if (!byStore[row.store_id]) byStore[row.store_id] = { storeName, items: [] };
      byStore[row.store_id].items.push({ name: productName, stock: Number(row.stock) });
    }

    // ── Comparativa de ventas vs mismo día de la semana ───────────────────
    const todayTotal = (todaySalesRes.data ?? [])
      .reduce((acc: number, s: any) => acc + Number(s.total), 0);

    const sameDayTotals: Record<string, number> = {};
    for (const sale of (pastSalesRes.data ?? [])) {
      const dayName = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: tz })
        .format(new Date(sale.created_at));
      if (dayName !== todayDayName) continue;
      const d = dateAR(new Date(sale.created_at));
      sameDayTotals[d] = (sameDayTotals[d] ?? 0) + Number(sale.total);
    }

    const sameDayValues = Object.values(sameDayTotals);
    const avgSameDay = sameDayValues.length >= 2
      ? sameDayValues.reduce((a, b) => a + b, 0) / sameDayValues.length
      : null;

    const salesDropPct =
      avgSameDay !== null && avgSameDay > 0 && todayTotal < avgSameDay * 0.8
        ? Math.round((1 - todayTotal / avgSameDay) * 100)
        : null;

    // ── Construir mensaje en markdown ─────────────────────────────────────
    const lines: string[] = [`**📊 Resumen proactivo — ${todayAR}**\n`];

    const storeEntries = Object.values(byStore);
    if (storeEntries.length > 0) {
      lines.push("**⚠️ Stock crítico con ventas recientes (< 5 unidades)**");
      for (const { storeName, items } of storeEntries) {
        lines.push(`\n*${storeName}:*`);
        for (const item of items.sort((a, b) => a.stock - b.stock)) {
          lines.push(`- ${item.name} — ${item.stock} unidad${item.stock !== 1 ? "es" : ""}`);
        }
      }
      lines.push("");
    } else {
      lines.push("✅ Sin productos con stock crítico activo.\n");
    }

    if (salesDropPct !== null) {
      const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-AR");
      lines.push("**📉 Alerta de ventas**");
      lines.push(
        `Las ventas de hoy (${fmt(todayTotal)}) están **${salesDropPct}% por debajo** del promedio del mismo día de la semana (${fmt(avgSameDay!)}).`
      );
    } else if (avgSameDay !== null) {
      lines.push("✅ Ventas de hoy dentro de lo esperado para este día.");
    }

    return NextResponse.json({ message: lines.join("\n") });
  } catch (e: any) {
    console.error("Alerts error:", e);
    return NextResponse.json({ message: null });
  }
}
