import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionFromRequest, isSupervisor, unauthorized, forbidden } from "@/lib/session";
import { fetchAllRows } from "@/lib/fetchAllRows";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) return unauthorized();

  // Modo normal (usado por los dropdowns de /importar-precios y /products):
  // solo proveedores activos, sin conteo — igual que siempre.
  // include_inactive=1 (pantalla de administración): trae todos + cuántos
  // productos activos tiene cada uno.
  const url = new URL(req.url);
  const includeInactive = url.searchParams.get("include_inactive") === "1";

  let query = supabaseAdmin.from("suppliers").select("id, name, active").order("name", { ascending: true });
  if (!includeInactive) query = query.eq("active", true);

  const { data, error } = await query;
  if (error) {
    console.error("Error leyendo suppliers:", error);
    return NextResponse.json({ error: "Error al procesar la operación" }, { status: 500 });
  }

  if (!includeInactive) {
    return NextResponse.json({ suppliers: (data ?? []).map((s) => ({ id: s.id, name: s.name })) });
  }

  // Conteo de productos activos por proveedor — reusa fetchAllRows (ya usado
  // en bulk-create) en vez de un COUNT por proveedor, para no hacer N+1
  // queries. Es una lectura directa de la tabla, no toca products_with_stock.
  const products = await fetchAllRows<{ supplier_id: string | null }>(
    "products",
    "supplier_id",
    (qb) => qb.eq("active", true)
  );
  const counts = new Map<string, number>();
  for (const p of products) {
    if (!p.supplier_id) continue;
    counts.set(p.supplier_id, (counts.get(p.supplier_id) ?? 0) + 1);
  }

  return NextResponse.json({
    suppliers: (data ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      active: s.active,
      product_count: counts.get(s.id) ?? 0,
    })),
  });
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
