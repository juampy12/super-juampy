import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  forbidCashierStoreMismatch,
  getSessionFromRequest,
  unauthorized,
} from "@/lib/session";

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

export async function GET(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthorized();

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get("store_id");
  const productId = searchParams.get("product_id");

  if (!storeId || !isUuid(storeId)) {
    return NextResponse.json({ error: "store_id inválido" }, { status: 400 });
  }
  if (!productId || !isUuid(productId)) {
    return NextResponse.json({ error: "product_id inválido" }, { status: 400 });
  }

  const storeForbidden = forbidCashierStoreMismatch(session, storeId);
  if (storeForbidden) return storeForbidden;

  const { data, error } = await supabaseAdmin
    .from("product_stocks")
    .select("stock, updated_at")
    .eq("store_id", storeId)
    .eq("product_id", productId)
    .maybeSingle();

  if (error) {
    console.error("Error leyendo stock:", error);
    return NextResponse.json({ error: "Error al procesar la operación" }, { status: 500 });
  }

  return NextResponse.json({ data: data ?? null });
}
