import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionFromRequest, isSupervisor, unauthorized, forbidden } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type NewProduct = { sku: string; name: string; price: number };

export async function POST(req: Request) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return unauthorized();
    if (!isSupervisor(session)) return forbidden("Solo supervisores");

    const body = await req.json();
    const products: NewProduct[] = body?.products ?? [];

    if (!Array.isArray(products) || products.length === 0) {
      return NextResponse.json({ ok: false, error: "Sin productos" }, { status: 400 });
    }

    const skus = products.map((p) => p.sku);

    // Buscar cuáles SKUs ya existen (activos o no)
    const { data: existing, error: lookupErr } = await supabaseAdmin
      .from("products")
      .select("id, sku")
      .in("sku", skus);

    if (lookupErr) throw lookupErr;

    const existingBySku = new Map((existing ?? []).map((p) => [p.sku, p.id]));

    const toCreate = products.filter((p) => !existingBySku.has(p.sku));
    const toUpdate = products.filter((p) => existingBySku.has(p.sku));

    const errors: string[] = [];
    let created = 0;
    let updated = 0;

    // Crear nuevos en batch
    if (toCreate.length > 0) {
      const { error } = await supabaseAdmin.from("products").insert(
        toCreate.map((p) => ({
          sku: p.sku,
          name: p.name.trim(),
          price: Math.round(p.price * 100) / 100,
          cost_net: 0,
          vat_rate: 21,
          markup_rate: 0,
          units_per_case: 1,
          is_weighted: false,
          active: true,
        }))
      );

      if (error) {
        errors.push(`Error al crear productos: ${error.message}`);
      } else {
        created = toCreate.length;
      }
    }

    // Actualizar precio de los que ya existen (y reactivar si estaban inactivos)
    for (const p of toUpdate) {
      const id = existingBySku.get(p.sku)!;
      const { error } = await supabaseAdmin
        .from("products")
        .update({ price: Math.round(p.price * 100) / 100, active: true })
        .eq("id", id);

      if (error) {
        errors.push(`Error actualizando ${p.sku}: ${error.message}`);
      } else {
        updated++;
      }
    }

    return NextResponse.json({ ok: true, created, updated, errors });
  } catch (e: any) {
    console.error("Error en bulk-create:", e);
    return NextResponse.json({ ok: false, error: "Error inesperado" }, { status: 500 });
  }
}
