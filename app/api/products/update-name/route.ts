import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionFromRequest, isSupervisor, unauthorized, forbidden } from "@/lib/session";

export async function POST(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthorized();
  if (!isSupervisor(session)) return forbidden("Solo supervisores pueden modificar productos");
  try {
    const body = await req.json();

    const id = String(body?.id ?? "").trim();
    const name = String(body?.name ?? "").trim();

    if (!id) return NextResponse.json({ ok: false, error: "Falta id" }, { status: 400 });
    if (!name) return NextResponse.json({ ok: false, error: "Falta name" }, { status: 400 });

    const { data, error } = await supabaseAdmin
      .from("products")
      .update({ name })
      .eq("id", id)
      .select("id,sku,name,price,active")
      .single();

    if (error) {
      console.error("Error actualizando nombre de producto:", error);
      return NextResponse.json({ ok: false, error: "Error al procesar la operación" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, product: data });
  } catch (e: any) {
    console.error("Error inesperado en /api/products/update-name:", e);
    return NextResponse.json({ ok: false, error: "Error inesperado" }, { status: 500 });
  }
}
