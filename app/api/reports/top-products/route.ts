import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionFromRequest, isSupervisor, unauthorized, forbidden } from "@/lib/session";

export async function POST(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthorized();

  const body = await req.json().catch(() => ({}));
  const from: string = body.from ?? "";
  const to: string = body.to ?? "";
  const limit: number = Math.min(Number(body.limit ?? 8), 100);
  let store_id: string | null = body.store_id ?? null;

  if (!from || !to) {
    return NextResponse.json({ error: "Faltan parámetros from/to" }, { status: 400 });
  }

  // Cajero solo puede consultar su propia sucursal
  if (!isSupervisor(session)) {
    if (!session.store_id) return forbidden("Sin sucursal asignada");
    if (store_id && store_id !== session.store_id)
      return forbidden("Sin acceso a esa sucursal");
    store_id = session.store_id;
  }

  let data: unknown[] | null;
  let error: unknown;

  if (store_id) {
    ({ data, error } = await supabaseAdmin.rpc("fn_top_products_range", {
      p_store: store_id,
      p_from: from,
      p_to: to,
      p_limit: limit,
    }));
  } else {
    ({ data, error } = await supabaseAdmin.rpc("fn_top_products_range_all", {
      p_from: from,
      p_to: to,
      p_limit: limit,
    }));
  }

  if (error) {
    console.error("reports/top-products RPC error:", error);
    return NextResponse.json({ error: "Error cargando top de productos" }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
