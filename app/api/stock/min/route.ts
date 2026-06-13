import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionFromRequest, isSupervisor, unauthorized, forbidden } from "@/lib/session";

export async function POST(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthorized();
  if (!isSupervisor(session)) return forbidden("Solo supervisores pueden modificar mínimos de stock");

  const body = await req.json().catch(() => ({}));
  const store_id: string = body.store_id ?? "";
  const product_id: string = body.product_id ?? "";
  const min_stock = Number(body.min_stock ?? body.min);

  if (!store_id || !product_id) {
    return NextResponse.json({ error: "Faltan store_id o product_id" }, { status: 400 });
  }
  if (!Number.isFinite(min_stock) || min_stock < 0) {
    return NextResponse.json({ error: "min_stock debe ser un número >= 0" }, { status: 400 });
  }

  const { error } = await supabaseAdmin.rpc("set_min_stock", {
    p_store: store_id,
    p_product: product_id,
    p_min: min_stock,
  });

  if (error) {
    console.error("stock/min RPC error:", error);
    return NextResponse.json({ error: "Error actualizando mínimo de stock" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
