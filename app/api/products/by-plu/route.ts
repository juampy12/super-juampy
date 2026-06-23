import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionFromRequest, unauthorized } from "@/lib/session";
import { normalizeSku } from "@/lib/sku";

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

  const normPlu = normalizeSku(plu);

  // 1) Intentar por campo `plu` (puede no existir en todas las instancias)
  try {
    const { data, error } = await supabaseAdmin
      .from("products")
      .select("id, name, sku, price, active, plu")
      .or(`plu.eq.${plu},plu.eq.${normPlu}`)
      .eq("active", true)
      .limit(1);

    if (!error && Array.isArray(data) && data.length > 0) {
      return NextResponse.json({ product: data[0] });
    }
  } catch {
    // columna plu no existe → caemos al fallback por sku
  }

  // 2) Fallback por `sku` — exacto primero
  const { data: exactSku, error: exactErr } = await supabaseAdmin
    .from("products")
    .select("id, name, sku, price, active")
    .eq("sku", plu)
    .eq("active", true)
    .limit(1);

  if (exactErr) {
    return NextResponse.json({ error: "Error buscando producto" }, { status: 500 });
  }
  if (exactSku && exactSku.length > 0) {
    return NextResponse.json({ product: exactSku[0] });
  }

  // Sin match exacto — match por SKU normalizado (mismo patrón que
  // products/catalog): el padding solo agrega ceros al principio, así
  // que el normalizado siempre queda como sufijo del SKU real.
  const { data: candidates, error: candErr } = await supabaseAdmin
    .from("products")
    .select("id, name, sku, price, active")
    .ilike("sku", `%${normPlu}`)
    .eq("active", true)
    .limit(20);

  if (candErr) {
    return NextResponse.json({ error: "Error buscando producto" }, { status: 500 });
  }

  const match = (candidates ?? []).find((p) => normalizeSku(p.sku) === normPlu);
  return NextResponse.json({ product: match ?? null });
}
