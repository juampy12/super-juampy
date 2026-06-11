import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionFromRequest, unauthorized } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthorized();
  const url = new URL(req.url);
  const plu = url.searchParams.get("plu")?.trim() ?? "";

  if (!plu) {
    return NextResponse.json({ error: "Falta plu" }, { status: 400 });
  }

  // "00009" → "9" (sin ceros a la izquierda, para el lookup)
  const pluInt = String(parseInt(plu, 10));

  // 1) Intentar por campo `plu` (puede no existir en todas las instancias)
  try {
    const { data, error } = await supabaseAdmin
      .from("products")
      .select("id, name, sku, price, active, plu")
      .or(`plu.eq.${plu},plu.eq.${pluInt}`)
      .eq("active", true)
      .limit(1);

    if (!error && Array.isArray(data) && data.length > 0) {
      return NextResponse.json({ product: data[0] });
    }
  } catch {
    // columna plu no existe → caemos al fallback por sku
  }

  // 2) Fallback: buscar por campo `sku`
  const { data: skuData, error: skuError } = await supabaseAdmin
    .from("products")
    .select("id, name, sku, price, active")
    .or(`sku.eq.${plu},sku.eq.${pluInt}`)
    .eq("active", true)
    .limit(1);

  if (skuError) {
    return NextResponse.json({ error: "Error buscando producto" }, { status: 500 });
  }

  return NextResponse.json({ product: skuData?.[0] ?? null });
}
