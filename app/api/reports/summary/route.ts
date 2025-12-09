import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Detecta el campo de fecha que exista y lo devuelve como "YYYY-MM-DD"
function getRowDay(row: any): string {
  const raw =
    row.day ??
    row.date ??
    row.sale_date ??
    row.fecha ??
    row.created_at ??
    row.createdAt ??
    null;

  if (!raw) return "";

  // Si viene como Date o timestamp, lo convertimos a string
  const str = typeof raw === "string" ? raw : new Date(raw).toISOString();
  return str.slice(0, 10); // "YYYY-MM-DD"
}

// Devuelve el valor correcto de ingresos sin importar el nombre de la columna
function getRevenue(row: any): number {
  const v =
    row.revenue ??
    row.total_amount ??
    row.total ??
    row.amount ??
    row.total_sales ??
    0;

  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");
    const storeId = searchParams.get("store_id");

    // 🔧 Si viene solo `from` o solo `to`, usamos el mismo valor para ambos
    const from = fromParam || toParam;
    const to = toParam || fromParam;

    // 1) Traemos TODOS los campos de la vista y filtramos fechas en JS
    let query = supabaseAdmin.from("v_sales_daily").select("*");

    // El filtro por sucursal sí lo podemos hacer en la DB
    if (storeId) {
      query = query.eq("store_id", storeId);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Supabase error /api/reports/summary:", error);
      throw error;
    }

    let rows = (data ?? []).map((row: any) => ({
      ...row,
      day: getRowDay(row),
    }));

    // 2) Filtro de fechas en JavaScript usando el campo "day" calculado
    if (from) {
      rows = rows.filter((r) => r.day && r.day >= from);
    }
    if (to) {
      rows = rows.filter((r) => r.day && r.day <= to);
    }

    // 3) Ordenar por día ascendente (y por store_id para que quede prolijo)
    rows.sort((a, b) => {
      if (a.day === b.day) {
        return String(a.store_id ?? "").localeCompare(String(b.store_id ?? ""));
      }
      return String(a.day).localeCompare(String(b.day));
    });

    // 4) KPIs
    const totalAmount = rows.reduce(
      (acc, row) => acc + getRevenue(row),
      0
    );

    const tickets = rows.reduce(
      (acc, row) => acc + Number(row.tickets ?? 0),
      0
    );

    const avgTicket = tickets ? totalAmount / tickets : 0;

    return NextResponse.json({
      kpis: { totalAmount, tickets, avgTicket },
      rows,
    });
  } catch (err) {
    console.error("Error en /api/reports/summary:", err);
    return NextResponse.json(
      { error: "Error generando el reporte" },
      { status: 500 }
    );
  }
}
