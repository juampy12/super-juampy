import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionFromRequest, isSupervisor, unauthorized, forbidden } from "@/lib/session";
import { normalizeSku } from "@/lib/sku";
import { fetchAllRows } from "@/lib/fetchAllRows";

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

    // Buscar cuáles SKUs ya existen (activos o no) — primero exacto.
    const { data: existing, error: lookupErr } = await supabaseAdmin
      .from("products")
      .select("id, sku")
      .in("sku", skus);

    if (lookupErr) throw lookupErr;

    const existingBySku = new Map((existing ?? []).map((p) => [p.sku, p.id]));

    // Para los que no matchearon exacto, buscar por SKU normalizado
    // (sin ceros a la izquierda) contra todo el catálogo — evita crear
    // un duplicado tipo "4166" cuando ya existe "000000004166".
    const unmatchedSkus = skus.filter((s) => !existingBySku.has(s));
    const existingByNormSkuActive = new Map<string, string>();
    const existingByNormSkuAny = new Map<string, string>();
    if (unmatchedSkus.length > 0) {
      const allProducts = await fetchAllRows<{ id: string; sku: string | null; active: boolean }>(
        "products",
        "id, sku, active"
      );
      for (const p of allProducts) {
        if (!p.sku) continue;
        const norm = normalizeSku(p.sku);
        existingByNormSkuAny.set(norm, p.id);
        // Si hay un duplicado activo + inactivo con el mismo SKU
        // normalizado (caso típico tras un merge), preferir siempre
        // el activo para no reactivar por error un producto viejo.
        if (p.active) existingByNormSkuActive.set(norm, p.id);
      }
    }

    const resolveExistingId = (sku: string): string | undefined =>
      existingBySku.get(sku) ??
      existingByNormSkuActive.get(normalizeSku(sku)) ??
      existingByNormSkuAny.get(normalizeSku(sku));

    const toCreate = products.filter((p) => !resolveExistingId(p.sku));
    const toUpdate = products.filter((p) => resolveExistingId(p.sku));

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

    // Actualizar precio de los que ya existen (y reactivar si estaban inactivos),
    // en batch en vez de un UPDATE por producto — reusa bulk_update_product_prices_v3
    // (ya existe, usado por bulk-price-import) para el precio, y un solo
    // UPDATE...IN para reactivar (active=true es igual para todos, no necesita unnest).
    if (toUpdate.length > 0) {
      const ids = toUpdate.map((p) => resolveExistingId(p.sku)!);
      const prices = toUpdate.map((p) => Math.round(p.price * 100) / 100);
      const nulls = ids.map(() => null);

      const { data, error } = await supabaseAdmin.rpc("bulk_update_product_prices_v3", {
        p_ids: ids,
        p_prices: prices,
        p_cost_nets: nulls,
        p_markup_rates: nulls,
        p_vat_rates: nulls,
      });

      if (error) {
        errors.push(`Error actualizando precios: ${error.message}`);
      } else {
        updated = data ?? 0;
        const { error: reactivateErr } = await supabaseAdmin
          .from("products")
          .update({ active: true })
          .in("id", ids);
        if (reactivateErr) {
          errors.push(`Error reactivando productos: ${reactivateErr.message}`);
        }
      }
    }

    return NextResponse.json({ ok: true, created, updated, errors });
  } catch (e: any) {
    console.error("Error en bulk-create:", e);
    return NextResponse.json({ ok: false, error: "Error inesperado" }, { status: 500 });
  }
}
