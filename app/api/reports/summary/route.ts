export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function isYmd(v: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

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

  const str = typeof raw === "string" ? raw : new Date(raw).toISOString();
  return str.slice(0, 10);
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

    let from = searchParams.get("from");
    let to = searchParams.get("to");
    const storeId = searchParams.get("store_id");

    // Validación formato fecha
    if (from && !isYmd(from)) {
      return NextResponse.json(
        { error: "from inválido (YYYY-MM-DD)" },
        { status: 400 }
      );
    }

    if (to && !isYmd(to)) {
      return NextResponse.json(
        { error: "to inválido (YYYY-MM-DD)" },
        { status: 400 }
      );
    }

    // Si están invertidas las fechas, las acomodamos
    if (from && to && from > to) {
      const tmp = from;
      from = to;
      to = tmp;
    }

    // Si viene solo una fecha, usamos la misma para ambas
    if (from && !to) to = from;
    if (to && !from) from = to;

    let query = supabaseAdmin.from("v_sales_daily").select("*");

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

    // Filtro por rango en JS (seguro porque no conocemos exacto el campo fecha en la vista)
    if (from) {
      rows = rows.filter((r: any) => r.day && r.day >= from);
    }

    if (to) {
      rows = rows.filter((r: any) => r.day && r.day <= to);
    }

    // Orden prolijo
    rows.sort((a: any, b: any) => {
      if (a.day === b.day) {
        return String(a.store_id ?? "").localeCompare(
          String(b.store_id ?? "")
        );
      }
      return String(a.day).localeCompare(String(b.day));
    });

    const totalAmount = rows.reduce(
      (acc: number, row: any) => acc + getRevenue(row),
      0
    );

    const tickets = rows.reduce(
      (acc: number, row: any) => acc + Number(row.tickets ?? 0),
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
