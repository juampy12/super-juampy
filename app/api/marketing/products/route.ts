import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionFromRequest, isSupervisor, unauthorized, forbidden } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return unauthorized();
    if (!isSupervisor(session)) return forbidden("Solo supervisores pueden buscar productos para marketing");

    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim() ?? "";

    if (q.length < 2) {
      return NextResponse.json({ products: [] });
    }

    const { data, error } = await supabaseAdmin
      .from("products")
      .select("id, name, price")
      .eq("active", true)
      .gt("price", 0)
      .ilike("name", `%${q}%`)
      .order("name")
      .limit(10);

    if (error) {
      console.error("Error buscando productos:", error);
      return NextResponse.json({ error: "Error al procesar la operación" }, { status: 500 });
    }

    return NextResponse.json({ products: data ?? [] });
  } catch (e) {
    console.error("Error en /api/marketing/products:", e);
    return NextResponse.json({ error: "Error inesperado" }, { status: 500 });
  }
}
