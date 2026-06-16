import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionFromRequest, isSupervisor, unauthorized, forbidden } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PriceUpdate = { productId: string; price: number };

// Tope por request: el cliente ya divide en lotes (ver importar-precios/page.tsx),
// esto es una segunda barrera por si alguien llama el endpoint directo con un
// array gigante — un solo UPDATE...unnest() con miles de filas sigue siendo
// rápido, pero el payload/parseo de JSON no debería crecer sin límite.
const MAX_BATCH = 1000;

export async function POST(req: Request) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return unauthorized();
    if (!isSupervisor(session)) return forbidden("Solo supervisores pueden modificar precios");

    const body = await req.json();
    const updates: PriceUpdate[] = body?.updates ?? [];

    if (!Array.isArray(updates) || updates.length === 0) {
      return NextResponse.json({ ok: false, error: "Sin actualizaciones" }, { status: 400 });
    }
    if (updates.length > MAX_BATCH) {
      return NextResponse.json(
        { ok: false, error: `Máximo ${MAX_BATCH} productos por request — dividí en lotes más chicos` },
        { status: 400 }
      );
    }

    const ids: string[] = [];
    const prices: number[] = [];
    const errors: string[] = [];

    for (const item of updates) {
      const price = Math.round(Number(item.price) * 100) / 100;
      if (!item.productId || !Number.isFinite(price) || price < 0) {
        errors.push(`Dato inválido: ${JSON.stringify(item)}`);
        continue;
      }
      ids.push(item.productId);
      prices.push(price);
    }

    // Un solo UPDATE ... FROM unnest() para todo el lote en vez de N updates
    // secuenciales — evita el timeout de la función serverless con imports grandes.
    let updated = 0;
    if (ids.length > 0) {
      const { data, error } = await supabaseAdmin.rpc("bulk_update_product_prices", {
        p_ids: ids,
        p_prices: prices,
      });

      if (error) {
        console.error("Error en bulk_update_product_prices:", error);
        return NextResponse.json({ ok: false, error: "Error actualizando precios" }, { status: 500 });
      }
      updated = data ?? 0;
    }

    return NextResponse.json({ ok: true, updated, errors });
  } catch (e: any) {
    console.error("Error en bulk-price-import:", e);
    return NextResponse.json({ ok: false, error: "Error inesperado" }, { status: 500 });
  }
}
