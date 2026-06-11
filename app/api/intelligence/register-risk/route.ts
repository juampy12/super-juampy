import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionFromRequest, isSupervisor, unauthorized, forbidden } from "@/lib/session";

export async function POST(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthorized();
  if (!isSupervisor(session)) return forbidden("Solo supervisores pueden acceder a inteligencia");

  try {
    const body: any = await req.json();

    const dateFrom = String(body?.date_from ?? "");
    const dateTo = String(body?.date_to ?? "");
    const storeId = body?.store_id ? String(body.store_id) : null;

    if (!dateFrom || !dateTo) {
      return NextResponse.json(
        { error: "Missing date_from/date_to" },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin.rpc("register_risk", {
      p_date_from: dateFrom,
      p_date_to: dateTo,
      p_store_id: storeId,
    });

    if (error) {
      console.error("Error en register_risk RPC:", error);
      return NextResponse.json({ error: "Error al procesar la operación" }, { status: 500 });
    }

    return NextResponse.json({ rows: data ?? [] });
  } catch (e: any) {
    console.error("Error inesperado en /api/intelligence/register-risk:", e);
    return NextResponse.json({ error: "Error inesperado" }, { status: 500 });
  }
}
