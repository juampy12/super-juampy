import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionFromRequest, isSupervisor, unauthorized, forbidden } from "@/lib/session";

export async function GET(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthorized();

  const { searchParams } = new URL(req.url);
  const storeFilter = searchParams.get("store_id");
  const effectiveStoreId = isSupervisor(session) ? storeFilter : session.store_id;

  if (!isSupervisor(session) && !session.store_id) {
    return forbidden("La sesión no tiene sucursal asignada. Volvé a iniciar sesión.");
  }

  if (!isSupervisor(session) && storeFilter && storeFilter !== session.store_id) {
    return forbidden("No podés consultar cajas de otra sucursal");
  }

  let q = supabaseAdmin
    .from("registers")
    .select("id, name, store_id")
    .eq("active", true)
    .order("name", { ascending: true });

  if (effectiveStoreId) q = q.eq("store_id", effectiveStoreId);

  const { data, error } = await q;
  if (error) {
    console.error("Error leyendo registers:", error);
    return NextResponse.json({ error: "Error al procesar la operación" }, { status: 500 });
  }
  return NextResponse.json({ registers: data ?? [] });
}
