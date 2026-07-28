import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionFromRequest, unauthorized } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/products/stats
// Conteos globales del catálogo activo (total, manuales, sin costo, sin
// margen, bajo costo), calculados en el servidor vía products_price_stats()
// — independiente de paginación/búsqueda/sucursal. Ver sql/products_price_stats.sql.
export async function GET(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthorized();

  const { data, error } = await supabaseAdmin.rpc("products_price_stats");

  if (error) {
    console.error("products/stats RPC error:", error);
    return NextResponse.json({ error: "Error al calcular estadísticas" }, { status: 500 });
  }

  const row = data?.[0] ?? {};
  return NextResponse.json({
    total: Number(row.total ?? 0),
    manual: Number(row.manual ?? 0),
    noCost: Number(row.no_cost ?? 0),
    noMargin: Number(row.no_margin ?? 0),
    belowCost: Number(row.below_cost ?? 0),
  });
}
