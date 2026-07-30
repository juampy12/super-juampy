import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionFromRequest, isSupervisor, unauthorized, forbidden } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthorized();

  const { data, error } = await supabaseAdmin
    .from("suppliers")
    .select("id, name")
    .eq("active", true)
    .order("name", { ascending: true });
  if (error) {
    console.error("Error leyendo suppliers:", error);
    return NextResponse.json({ error: "Error al procesar la operación" }, { status: 500 });
  }
  return NextResponse.json({ suppliers: data ?? [] });
}

export async function POST(req: Request) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return unauthorized();
    if (!isSupervisor(session)) return forbidden("Solo supervisores pueden crear proveedores");

    const body = await req.json();
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json({ ok: false, error: "Nombre de proveedor requerido" }, { status: 400 });
    }

    // upsert por name (unique constraint): si ya existe (incluso desactivado)
    // devuelve el mismo id y lo reactiva, en vez de crear un duplicado.
    const { data, error } = await supabaseAdmin
      .from("suppliers")
      .upsert({ name, active: true }, { onConflict: "name" })
      .select("id, name")
      .single();

    if (error) {
      console.error("Error creando supplier:", error);
      return NextResponse.json({ ok: false, error: "Error creando proveedor" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, supplier: data });
  } catch (e: any) {
    console.error("Error en POST /api/suppliers:", e);
    return NextResponse.json({ ok: false, error: "Error inesperado" }, { status: 500 });
  }
}
