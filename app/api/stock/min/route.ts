import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionFromRequest, isSupervisor, unauthorized, forbidden } from "@/lib/session";

// GET /api/stock/min?store_id=X&product_ids=id1,id2,...
export async function GET(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthorized();

  const { searchParams } = new URL(req.url);
  const store_id = searchParams.get("store_id") ?? "";
  const ids = (searchParams.get("product_ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!store_id) return NextResponse.json({ error: "Falta store_id" }, { status: 400 });
  if (!isSupervisor(session) && session.store_id !== store_id) {
    return forbidden("Sin acceso a esa sucursal");
  }
  if (ids.length === 0) return NextResponse.json({ data: [] });

  const { data, error } = await supabaseAdmin
    .from("product_min_stock")
    .select("product_id, min_stock")
    .eq("store_id", store_id)
    .in("product_id", ids);

  if (error) {
    console.error("stock/min GET error:", error);
    return NextResponse.json({ error: "Error consultando mínimos" }, { status: 500 });
  }

  return NextResponse.json({ data: data ?? [] });
}

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
