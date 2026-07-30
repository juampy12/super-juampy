import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionFromRequest, isSupervisor, unauthorized, forbidden } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Igual que bulk-price-import: el cliente ya divide en lotes, esto es
// una segunda barrera para requests directos con un array gigante.
const MAX_BATCH = 1000;

// Asigna supplier_id en lote vía set_products_supplier — no toca
// price/cost_net/markup_rate/vat_rate para nada, independiente de
// bulk_update_product_prices_v3.
export async function POST(req: Request) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return unauthorized();
    if (!isSupervisor(session)) return forbidden("Solo supervisores pueden asignar proveedor");

    const body = await req.json();
    const productIds: string[] = Array.isArray(body?.productIds) ? body.productIds : [];
    const supplierId: string | null = typeof body?.supplier_id === "string" ? body.supplier_id : null;

    if (productIds.length === 0) {
      return NextResponse.json({ ok: false, error: "Sin productos" }, { status: 400 });
    }
    if (productIds.length > MAX_BATCH) {
      return NextResponse.json(
        { ok: false, error: `Máximo ${MAX_BATCH} productos por request — dividí en lotes más chicos` },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin.rpc("set_products_supplier", {
      p_ids: productIds,
      p_supplier_id: supplierId,
    });

    if (error) {
      console.error("Error en set_products_supplier:", error);
      return NextResponse.json({ ok: false, error: "Error asignando proveedor" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, updated: data ?? 0 });
  } catch (e: any) {
    console.error("Error en assign-supplier:", e);
    return NextResponse.json({ ok: false, error: "Error inesperado" }, { status: 500 });
  }
}
