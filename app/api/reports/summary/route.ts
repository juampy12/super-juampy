import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const from = searchParams.get("from");      // ej: 2025-12-01
    const to = searchParams.get("to");          // ej: 2025-12-01
    const storeId = searchParams.get("store_id"); // opcional

    // Validaciones básicas
    if (!from || !to) {
      return NextResponse.json(
        { error: "Parámetros 'from' y 'to' son obligatorios (YYYY-MM-DD)." },
        { status: 400 }
      );
    }

    // Armamos query sobre la vista v_pos_sales_kpis
    let query = supabaseAdmin
      .from("v_pos_sales_kpis")
      .select("*")
      .gte("day", from)
      .lte("day", to)
      .order("day", { ascending: true });

    if (storeId) {
      query = query.eq("store_id", storeId);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error consultando v_pos_sales_kpis:", error);
      return NextResponse.json(
        { error: "Error consultando reportes", details: error.message },
        { status: 500 }
      );
    }

    const rows = data ?? [];

    // Calculamos KPIs
    let totalAmount = 0;
    let totalTickets = 0;

    for (const row of rows as any[]) {
      const rowTotal = parseFloat(row.total_amount ?? "0");
      const rowTickets = Number(row.tickets ?? 0);
      totalAmount += rowTotal;
      totalTickets += rowTickets;
    }

    const avgTicket = totalTickets > 0 ? totalAmount / totalTickets : 0;

    return NextResponse.json({
      kpis: {
        totalAmount,
        tickets: totalTickets,
        avgTicket,
      },
      rows,
    });
  } catch (e: any) {
    console.error("Error en /api/reports/summary:", e);
    return NextResponse.json(
      { error: "Error inesperado", details: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
